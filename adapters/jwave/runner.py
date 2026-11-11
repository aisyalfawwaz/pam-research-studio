"""Original PAM adapter glue. j-Wave/JAX are installed, unmodified dependencies.

This script runs in the optional adapter environment, not the primary engine.
"""

import argparse
import importlib.metadata
import json
import os
import platform
import time
from pathlib import Path

os.environ["JAX_PLATFORMS"] = "cpu"
os.environ["JAX_ENABLE_X64"] = "true"
os.environ["MPLBACKEND"] = "Agg"


def runtime():
    import jax

    versions = {
        p: importlib.metadata.version(p)
        for p in ("jwave", "jax", "jaxlib", "jaxdf", "equinox", "numpy", "scipy")
    }
    required = {
        "jwave": "0.2.1",
        "jax": "0.4.38",
        "jaxlib": "0.4.38",
        "jaxdf": "0.2.8",
        "equinox": "0.11.12",
    }
    if any(versions[p] != v for p, v in required.items()):
        raise RuntimeError(
            "Adapter version mismatch; rerun scripts/setup-jwave.ps1 with the lockfile"
        )
    import jwave  # noqa: F401 -- probe imports actual solver package

    return {
        "packages": versions,
        "python": platform.python_version(),
        # platform.platform() unpacks the lazy processor field and can block in
        # Windows WMI when launched by the threaded Electron sidecar.
        "os": f"{platform.system()}-{platform.release()}-{platform.version()}",
        "devices": [str(d) for d in jax.devices()],
        "precision": "float64",
        "compute": "jax-cpu",
    }


def run(request, output):
    import jax
    import jax.numpy as jnp
    import numpy as np
    from jaxdf import FourierSeries
    from jaxdf.geometry import Domain
    from jwave.acoustics.time_varying import TimeWavePropagationSettings, simulate_wave_propagation
    from jwave.geometry import Medium, Sources, TimeAxis
    from scipy.signal import butter, resample_poly, sosfiltfilt

    started = time.perf_counter()
    info = runtime()
    data = json.loads(request.read_text(encoding="utf-8"))
    cfg, grid = data["config"], data["plan"]
    output.mkdir(parents=True, exist_ok=True)

    def stage(value):
        (output / "stage.txt").write_text(value, encoding="utf-8")

    stage("Preparing j-Wave sources and sensors")
    dt, steps = grid["dt_s"], grid["steps"]
    domain = Domain(tuple(grid["shape"]), (grid["spacing_m"],) * 2)
    speed = cfg["sound_speed_m_s"]
    density = cfg["simulation"]["density_kg_m3"]
    if cfg.get("ct"):
        with np.load(output / "medium.npz", allow_pickle=False) as stored:
            speed_values, density_values = stored["sound_speed"], stored["density"]
        speed = FourierSeries(jnp.asarray(speed_values)[..., None], domain)
        density = FourierSeries(jnp.asarray(density_values)[..., None], domain)
        info["ct_model"] = {
            "id": "pam.ct.fluid_hu",
            "version": "0.1.0",
            "status": "experimental",
            "speed_range_m_s": [float(speed_values.min()), float(speed_values.max())],
            "density_range_kg_m3": [float(density_values.min()), float(density_values.max())],
            "actual_medium_cfl": float(speed_values.max() * dt / grid["spacing_m"]),
            "extent_m": data["ct_extent_m"],
            "contrast": cfg["ct"]["contrast"],
            "model": "thresholded linear HU bone fraction, fluid c/rho; air/soft tissue replaced by host fluid; zero absorption; no shear modes",
        }
    medium = Medium[FourierSeries](
        domain,
        sound_speed=speed,
        density=density,
        attenuation=0.0,
        pml_size=grid["pml_cells"],
    )
    time_axis = TimeAxis(dt=dt, t_end=(steps - 0.25) * dt)
    # Original finite source waveform sampled at internal solver resolution.
    sample_count = int(round(cfg["duration_s"] * cfg["sampling_hz"])) + 1
    local = np.linspace(-cfg["duration_s"] / 2, cfg["duration_s"] / 2, sample_count)
    carrier = np.cos(2 * np.pi * cfg["frequency_hz"] * local)
    window = (
        np.hanning(sample_count)
        if cfg["emission_kind"] == "harmonic"
        else np.exp(-0.5 * (local / (cfg["duration_s"] / 6)) ** 2)
    )
    waveform = carrier * window
    if cfg["bandpass_hz"]:
        waveform = sosfiltfilt(
            butter(4, cfg["bandpass_hz"], btype="bandpass", fs=cfg["sampling_hz"], output="sos"),
            waveform,
        )
    waveform[[0, -1]] = 0
    time_mid = grid["start_s"] + (np.arange(steps) + 0.5) * dt
    coupled_data = None
    if data.get("coupled"):
        with np.load(output / "coupling.npz", allow_pickle=False) as stored:
            coupled_data = {key: stored[key] for key in stored.files}
        local = coupled_data["time_s"]
        waveform = (
            cfg["simulation"]["density_kg_m3"]
            * cfg["sound_speed_m_s"]
            * coupled_data["q_m3_s"]
            / (2 * cfg["coupling"]["effective_length_m"] * grid["spacing_m"])
        )

    def stencil(points):
        points = np.asarray(points)
        base = np.floor(points).astype(int)
        frac = points - base
        positions, weights = [], []
        for a, b in ((0, 0), (0, 1), (1, 0), (1, 1)):
            positions.append(base + (a, b))
            weights.append(
                (frac[:, 0] if a else 1 - frac[:, 0]) * (frac[:, 1] if b else 1 - frac[:, 1])
            )
        return np.stack(positions, axis=1), np.stack(weights, axis=1)

    source_nodes, source_weights = stencil(grid["source_grid_xz"])
    drives = np.array(
        [
            s["amplitude"]
            * np.interp(
                time_mid - s["emission_s"],
                local,
                waveform if waveform.ndim == 1 else waveform[:, i],
                left=0,
                right=0,
            )
            for i, s in enumerate(cfg["sources"])
        ]
    )
    drives = (drives[:, None, :] * source_weights[:, :, None]).reshape(-1, steps)
    nodes = source_nodes.reshape(-1, 2)
    sources = Sources(
        positions=(tuple(nodes[:, 0]), tuple(nodes[:, 1])),
        signals=jnp.asarray(drives),
        dt=dt,
        domain=domain,
    )
    sensor_nodes, weights = stencil(grid["sensor_grid_xz"])
    ix, iz, weights = (
        jnp.asarray(sensor_nodes[:, :, 0]),
        jnp.asarray(sensor_nodes[:, :, 1]),
        jnp.asarray(weights),
    )

    observer_step = 0
    field_frames, frame_times, receiver_history = [], [], []
    frame_stride = max(1, int(np.ceil(steps / 256)))
    sx, sz = max(1, int(np.ceil(domain.N[0] / 64))), max(1, int(np.ceil(domain.N[1] / 64)))
    spatial_mask = (abs(np.fft.fftfreq(domain.N[0]))[:, None] <= 0.45 / sx) & (
        abs(np.fft.fftfreq(domain.N[1]))[None, :] <= 0.45 / sz
    )
    ct_mask = np.zeros(
        (len(range(0, domain.N[1], sz)), len(range(0, domain.N[0], sx))), dtype=np.float32
    )
    if cfg.get("ct"):
        span = cfg["ct"]["bone_density_kg_m3"] - cfg["simulation"]["density_kg_m3"]
        speed_span = cfg["ct"]["bone_speed_m_s"] - cfg["sound_speed_m_s"]
        fraction = (
            (density_values - cfg["simulation"]["density_kg_m3"]) / span
            if abs(span) > 1e-9
            else (speed_values - cfg["sound_speed_m_s"]) / speed_span
            if abs(speed_span) > 1e-9
            else np.zeros_like(speed_values)
        )
        ct_mask = np.clip(fraction[::sx, ::sz].T, 0, 1).astype(np.float32)
    norm = (cfg["bubble"]["drive_pa"] or 1.0) if data.get("coupled") else 1.0
    extent = [
        grid["origin_xz_m"][0],
        grid["origin_xz_m"][0] + (len(range(0, domain.N[0], sx)) - 1) * sx * grid["spacing_m"],
        grid["origin_xz_m"][1],
        grid["origin_xz_m"][1] + (len(range(0, domain.N[1], sz)) - 1) * sz * grid["spacing_m"],
    ]

    def observe(field, received):
        nonlocal observer_step
        observer_step += 1
        receiver_history.append(np.asarray(received).copy() / norm)
        if (observer_step - 1) % frame_stride and observer_step != steps:
            return
        time_s = grid["start_s"] + observer_step * dt
        # Anti-alias the display reduction. RF and scientific solver state are untouched.
        field = (
            np.fft.ifft2(np.fft.fft2(np.asarray(field)) * spatial_mask).real[::sx, ::sz].T.copy()
            / norm
        )
        field_frames.append(field)
        frame_times.append(time_s)
        history = np.asarray(receiver_history)
        # Retain every channel, bound live JSON to <=65536 RF values.
        live_rows = max(1, min(256, 65536 // cfg["channels"]))
        stride = max(1, int(np.ceil(len(history) / live_rows)))
        preview = []
        for i in range(0, len(history), stride):
            part = history[i : i + stride]
            preview.append(part[abs(part).argmax(axis=0), np.arange(cfg["channels"])])
        radius = 0.0
        if coupled_data is not None:
            trajectory = coupled_data["trajectory"]
            radius = float(
                np.interp(
                    time_s - cfg["sources"][0]["emission_s"], trajectory[:, 0], trajectory[:, 1]
                )
            )
        if data.get("live_path"):
            target = Path(data["live_path"])
            with target.with_suffix(".tmp").open("wb") as handle:
                np.savez(
                    handle,
                    pressure=field.astype(np.float32),
                    ct_mask=ct_mask,
                    sensor_now=np.asarray(received, dtype=np.float32) / norm,
                    rf=np.asarray(preview, dtype=np.float32),
                    time_s=np.array(time_s),
                    radius_m=np.array(radius),
                    radius_max_m=np.array(
                        float(np.max(coupled_data["trajectory"][:, 1]))
                        if coupled_data is not None
                        else 0.0
                    ),
                    extent=np.asarray(extent),
                    rf_start_s=np.array(grid["start_s"] + dt),
                    step=np.array(observer_step),
                    steps=np.array(steps),
                )
            try:
                os.replace(target.with_suffix(".tmp"), target)
            except PermissionError:
                pass  # A reader may hold the prior preview on Windows.

    def sensors(p, u, rho):
        received = jnp.sum(p.on_grid[ix, iz, 0] * weights, axis=1)
        if data.get("live_path"):
            jax.debug.callback(observe, p.on_grid[:, :, 0], received, ordered=True)
        return received

    settings = TimeWavePropagationSettings(checkpoint=False, smooth_initial=False)
    solver = jax.jit(
        lambda: simulate_wave_propagation(
            medium, time_axis, sources=sources, sensors=sensors, settings=settings
        )
    )
    stage("Compiling j-Wave / XLA CPU")
    compiled = solver.lower().compile()
    stage("Running j-Wave wave propagation")
    recorded = np.asarray(compiled())
    jax.effects_barrier()
    if data.get("live_path"):
        if observer_step != steps:
            raise ValueError("Live observer clock disagrees with solver TimeAxis")
        np.savez(
            output / "frames.npz", pressure=np.asarray(field_frames), time_s=np.asarray(frame_times)
        )
    stage("Resampling j-Wave channel data")
    # Solver returns updated pressure at t_start+(n+1)*dt. Include initial zero
    # pressure, anti-alias before integer decimation, then select capture indices.
    initial = np.vstack([np.zeros((1, cfg["channels"])), recorded])
    sampled = (
        resample_poly(initial, 1, grid["substeps"], axis=0) if grid["substeps"] > 1 else initial
    )
    first = int(round((cfg["capture_t0_s"] - grid["start_s"]) * cfg["sampling_hz"]))
    rf = np.ascontiguousarray(sampled[first : first + cfg["samples"]], dtype=np.float64)
    rf /= norm
    if cfg["snr_db"] is not None:
        rms = np.sqrt(np.mean(rf**2))
        rf += (
            np.random.default_rng(np.random.SeedSequence([cfg["seed"], 2])).normal(size=rf.shape)
            * rms
            * 10 ** (-cfg["snr_db"] / 20)
        )
    np.save(output / "rf.npy", rf, allow_pickle=False)
    info.update(
        runtime_ms=(time.perf_counter() - started) * 1000,
        boundary="absorbing PML; no rigid or reflecting boundary",
        attenuation="none",
        signal_unit="arbitrary_unit",
        live_geometry={
            "spatial_filter": "Fourier low-pass at 0.45/stride cycles per original sample, before preview decimation",
            "extent_m": extent,
            "pressure_shape": [len(range(0, domain.N[1], sz)), len(range(0, domain.N[0], sx))],
            "observer": "ordered actual solver samples; no effect on numerical state",
        },
        runner_sha256=__import__("hashlib").sha256(Path(__file__).read_bytes()).hexdigest(),
        runtime_lock_sha256=__import__("hashlib")
        .sha256(Path(__file__).with_name("uv.lock").read_bytes())
        .hexdigest(),
    )
    (output / "metadata.json").write_text(json.dumps(info), encoding="utf-8")
    stage("j-Wave RF complete")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--request", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.probe:
        print(json.dumps(runtime()))
    elif args.request and args.output:
        run(args.request, args.output)
    else:
        parser.error("Provide --probe or --request and --output")
