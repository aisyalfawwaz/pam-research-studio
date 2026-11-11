"""Original isolated jbubble adapter glue. Upstream library is installed unmodified."""

import argparse
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import time
from pathlib import Path

os.environ["JAX_PLATFORMS"] = "cpu"
os.environ["JAX_ENABLE_X64"] = "true"


def runtime():
    import jax
    import jbubble  # noqa: F401

    versions = {
        p: importlib.metadata.version(p)
        for p in ("jbubble", "jax", "jaxlib", "equinox", "diffrax", "numpy", "scipy")
    }
    required = {
        "jbubble": "0.2.0",
        "jax": "0.8.2",
        "jaxlib": "0.8.2",
        "equinox": "0.13.4",
        "diffrax": "0.7.2",
    }
    if any(versions[p] != v for p, v in required.items()):
        raise RuntimeError("jbubble runtime mismatch; rerun scripts/setup-jbubble.ps1")
    return {
        "packages": versions,
        "python": platform.python_version(),
        "os": f"{platform.system()}-{platform.release()}-{platform.version()}",
        "devices": [str(d) for d in jax.devices()],
        "precision": "float64",
        "compute": "jax-cpu",
    }


def run(request, output):
    import diffrax
    import jax
    import numpy as np
    from jbubble import SaveSpec, SolverConfig, run_simulation
    from jbubble.acoustics import QuasiAcoustic
    from jbubble.pulse.envelope import HannEnvelope
    from jbubble.utils.presets import free_bubble, lipid_bubble

    started = time.perf_counter()
    info = runtime()
    cfg = json.loads(request.read_text(encoding="utf-8"))
    options = cfg["bubble"]
    output.mkdir(parents=True, exist_ok=True)
    (output / "stage.txt").write_text("Compiling jbubble Keller-Miksis solver", encoding="utf-8")
    factory = free_bubble if options["model"] == "free" else lipid_bubble
    parameters = {
        "R0": options["radius_m"],
        "freq": cfg["frequency_hz"],
        "pressure": options["drive_pa"],
        "cycle_num": cfg["frequency_hz"] * cfg["duration_s"],
        "mu": options["viscosity_pa_s"],
        "P_amb": 101325.0,
        "rho_L": cfg["simulation"]["density_kg_m3"] if cfg.get("coupling") else 1000.0,
        "c_L": cfg["sound_speed_m_s"],
        "gamma": 1.4 if options["model"] == "free" else 1.095,
    }
    shell = (
        {"sigma": 0.072}
        if options["model"] == "free"
        else {
            "kappa_s": 7.5e-9,
            "chi": 0.5,
            "sigma_rupture": 0.072,
            "R_buckle_ratio": 0.98058,
            "smoothing": 0.01,
        }
    )
    eom, pulse = factory(**parameters, **shell)
    pulse = pulse.windowed(HannEnvelope())
    oversampling = max(4, math.ceil(128 * cfg["frequency_hz"] / cfg["sampling_hz"]))
    fs = cfg["sampling_hz"] * oversampling
    count = (
        math.ceil((cfg["duration_s"] + options["ringdown_cycles"] / cfg["frequency_hz"]) * fs) + 1
    )
    if count > 50_000:
        raise ValueError("jbubble output exceeds 50,000 samples; shorten the drive/ringdown")
    t_max = (count - 1) / fs
    solver_config = SolverConfig(
        stepsize_controller=diffrax.PIDController(
            rtol=options["rtol"], atol=options["rtol"] * 0.01
        ),
        dt0=min(1e-9, 1 / fs),
        max_steps=100_000,
    )
    solve = jax.jit(
        lambda: run_simulation(
            eom, pulse, save_spec=SaveSpec(num_samples=count), t_max=t_max, config=solver_config
        )
    )
    compiled = solve.lower().compile()
    (output / "stage.txt").write_text("Running jbubble radial dynamics", encoding="utf-8")
    result = compiled()
    if not bool(result.converged):
        raise ValueError("jbubble ODE did not converge; no RF or maps were published")
    # QuasiAcoustic pressure is evaluated at r_ref. Its observer delay is NOT
    # included here: the bridge below applies each receiver's own r/c exactly once.
    emission = QuasiAcoustic(medium=eom.medium)
    reference_m = 0.001
    pressure = np.asarray(emission(result, r=reference_m))
    trajectory = np.column_stack(
        [
            np.asarray(result.ts) - cfg["duration_s"] / 2,
            np.asarray(result.radius),
            np.asarray(result.radial_velocity),
            np.asarray(result.driving_pressure),
            pressure,
            np.asarray(result.radial_acceleration),
        ]
    )
    if not np.isfinite(trajectory).all() or np.any(trajectory[:, 1] <= 0):
        raise ValueError("jbubble returned an invalid trajectory")
    mach = float(np.max(abs(trajectory[:, 2])) / cfg["sound_speed_m_s"])
    if mach >= 0.1:
        raise ValueError(
            f"Bubble wall Mach number {mach:.3f} exceeds this adapter's 0.1 monopole limit"
        )
    np.save(output / "bubble.npy", trajectory, allow_pickle=False)
    spectrum = abs(np.fft.rfft(pressure * np.hanning(count))) ** 2
    frequency = np.fft.rfftfreq(count, 1 / fs)
    alias_fraction = float(
        spectrum[frequency > cfg["sampling_hz"] / 2].sum() / max(spectrum.sum(), 1e-300)
    )
    upper_hz = (
        float(
            frequency[
                min(
                    np.searchsorted(np.cumsum(spectrum), 0.999 * spectrum.sum()), len(frequency) - 1
                )
            ]
        )
        if spectrum.sum()
        else 0.0
    )
    if alias_fraction > 0.01:
        raise ValueError(
            f"Bubble emission has {alias_fraction:.1%} energy above acquisition Nyquist; increase sampling frequency"
        )
    info.update(
        {
            "preset": options["model"],
            "equation": "Keller-Miksis",
            "parameters": parameters,
            "shell_parameters": shell,
            "drive": "Hann-windowed sine; centre equals source emission_s",
            "solver": "diffrax.Dopri5",
            "rtol": options["rtol"],
            "atol": options["rtol"] * 0.01,
            "max_steps": 100_000,
            "converged": True,
            "reference_distance_m": reference_m,
            "source_sampling_hz": fs,
            "oversampling": oversampling,
            "source_time_convention": "trajectory t=0 is drive centre; retarded propagation adds r/c once",
            "max_radius_ratio": float(np.max(trajectory[:, 1]) / options["radius_m"]),
            "min_radius_ratio": float(np.min(trajectory[:, 1]) / options["radius_m"]),
            "max_wall_mach": mach,
            "peak_emission_pa_at_reference": float(np.max(abs(pressure))),
            "energy_above_acquisition_nyquist_fraction": alias_fraction,
            "emission_999_energy_upper_hz": upper_hz,
            "final_emission_relative_peak": float(
                abs(pressure[-1]) / max(np.max(abs(pressure)), 1e-300)
            ),
            "runtime_ms": (time.perf_counter() - started) * 1000,
            "runner_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "runtime_lock_sha256": hashlib.sha256(
                Path(__file__).with_name("uv.lock").read_bytes()
            ).hexdigest(),
        }
    )
    (output / "metadata.json").write_text(json.dumps(info), encoding="utf-8")


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
