"""File-based, isolated optional j-Wave CPU adapter. Never imports JAX in the worker."""

import functools
import json
import math
import os
import shutil
import subprocess
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

import numpy as np
from scipy.fft import next_fast_len

from .physics import receivers

ROOT = Path(__file__).resolve().parents[3]
RUNNER = ROOT / "adapters" / "jwave" / "runner.py"
PYTHON = (
    ROOT
    / ".adapters"
    / "jwave"
    / ".venv"
    / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
)
IDENTITY = {
    "id": "jwave",
    "adapter_version": "1.0.0",
    "package": "jwave",
    "version": "0.2.1",
    "license": "LGPL-3.0-only",
    "source": "https://github.com/ucl-bug/jwave/tree/v0.2.1",
    "doi": "10.1016/j.softx.2023.101338",
    "validation": "experimental",
    "runtime": "isolated-native-cpu",
}


def process_env():
    return {
        **{
            key: value
            for key, value in os.environ.items()
            if key not in {"PAM_SIDECAR_TOKEN", "ELECTRON_RUN_AS_NODE"}
        },
        "JAX_PLATFORMS": "cpu",
        "JAX_ENABLE_X64": "true",
        "PYTHONUNBUFFERED": "1",
        "MPLBACKEND": "Agg",
    }


@functools.lru_cache(maxsize=1)
def availability():
    info = {
        **IDENTITY,
        "ready": False,
        "message": "Run scripts/setup-jwave.ps1, then restart the app.",
    }
    if not PYTHON.is_file():
        return info
    try:
        process = subprocess.Popen(
            [str(PYTHON), str(RUNNER), "--probe"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=process_env(),
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        try:
            output, errors = process.communicate(timeout=45)
        finally:
            stop_process(process)
        if process.returncode:
            raise ValueError(errors[-1500:] or "j-Wave probe failed")
        details = json.loads(output)
        return {
            **info,
            **details,
            "ready": True,
            "message": "Experimental native CPU. Upstream recommends WSL2 on Windows.",
        }
    except subprocess.TimeoutExpired:
        return {
            **info,
            "message": "j-Wave startup timed out. Check the runtime with scripts/setup-jwave.ps1, then restart the app.",
        }
    except (OSError, ValueError) as error:
        return {**info, "message": f"j-Wave unavailable: {error}"}


def plan(cfg, wave=None):
    """Propagation domain depends on capture geometry, never the reconstruction ROI."""
    settings = cfg.simulation
    if settings is None:
        raise ValueError("j-Wave settings missing")
    if cfg.spreading:
        raise ValueError(
            "Disable analytic 1/r spreading for j-Wave; the 2D solver supplies its own spreading."
        )
    if cfg.emission_kind == "broadband":
        raise ValueError(
            "This j-Wave adapter supports finite pulse/harmonic sources. Broadband requires a separately band-limited convergence study."
        )
    dx = settings.spacing_m
    # Gaussian source's approximate -40 dB upper spectral edge (Hann uses a
    # conservative 3/duration main-lobe bound). Four points per shortest wavelength.
    upper = cfg.frequency_hz + (
        3 / cfg.duration_s if cfg.emission_kind == "harmonic" else 2.9 / cfg.duration_s
    )
    if cfg.bandpass_hz:
        upper = max(upper, cfg.bandpass_hz[1])
    if cfg.coupling:
        upper = cfg.coupling.passband_hz * 1.5
    minimum_speed = (
        min(cfg.sound_speed_m_s, cfg.ct.bone_speed_m_s) if cfg.ct else cfg.sound_speed_m_s
    )
    ppw = minimum_speed / (upper * dx)
    if ppw < 4:
        raise ValueError(
            f"j-Wave grid resolves the source band with only {ppw:.2f} points/wavelength. Reduce propagation spacing (need at least 4)."
        )
    sensors = receivers(cfg)[:, [0, 2]]
    sources = np.array([[s.x_m, s.z_m] for s in cfg.sources])
    geometry = np.concatenate([sensors, sources])
    if cfg.ct:
        ex = cfg.ct.extent()
        geometry = np.concatenate([geometry, [[ex[0], ex[2]], [ex[1], ex[3]]]])
    padding = settings.pml_cells + 12
    origin = np.floor(geometry.min(axis=0) / dx) * dx - padding * dx
    extent = np.ceil((geometry.max(axis=0) - origin) / dx).astype(int) + padding + 2
    shape = [next_fast_len(int(n), real=True) for n in extent]
    maximum_speed = (
        max(cfg.sound_speed_m_s, cfg.ct.bone_speed_m_s) if cfg.ct else cfg.sound_speed_m_s
    )
    substeps = max(1, math.ceil(maximum_speed / (dx * cfg.sampling_hz * settings.cfl)))
    dt = 1 / (cfg.sampling_hz * substeps)
    start = (
        math.floor(
            min(0, cfg.capture_t0_s, min(s.emission_s - cfg.duration_s / 2 for s in cfg.sources))
            * cfg.sampling_hz
        )
        / cfg.sampling_hz
    )
    end = cfg.capture_t0_s + (cfg.samples - 1) / cfg.sampling_hz
    if wave is not None:
        start = (
            math.floor(
                min(start, min(s.emission_s + wave[0, 0] for s in cfg.sources)) * cfg.sampling_hz
            )
            / cfg.sampling_hz
        )
    # Extra samples keep the resample_poly FIR's right edge outside the capture.
    steps = math.ceil((end - start) / dt) + 1 + 12 * substeps
    cells = math.prod(shape)
    if steps * cfg.channels > 12_582_912:
        raise ValueError(
            "j-Wave receiver history exceeds the 96 MiB CPU budget; shorten capture or reduce channels"
        )
    if max(shape) > 768 or cells > 180_000 or steps > 20_000 or cells * steps > 800_000_000:
        raise ValueError(
            f"j-Wave CPU budget exceeded: {shape[0]} × {shape[1]}, {steps} steps. Reduce capture duration/domain or source bandwidth; do not coarsen below the wavelength limit."
        )
    return {
        "shape": shape,
        "spacing_m": dx,
        "origin_xz_m": origin.tolist(),
        "dt_s": dt,
        "start_s": start,
        "steps": steps,
        "substeps": substeps,
        "actual_cfl": maximum_speed * dt / dx,
        "source_band_upper_hz": upper,
        "points_per_shortest_wavelength": ppw,
        "source_grid_xz": ((sources - origin) / dx).tolist(),
        "sensor_grid_xz": ((sensors - origin) / dx).tolist(),
        "pml_cells": settings.pml_cells,
        "mapping": "bilinear source injection and receiver interpolation; channel order preserved",
        "dimension": "2D x-z; line-source spreading, not a 3D point emitter",
        "time_convention": "source evaluated at step midpoint; pressure recorded after step at start+(n+1)*dt; resampled to capture_t0+n/fs",
    }


def stop_process(process):
    if process.poll() is not None:
        return
    if os.name == "nt":
        # The Windows venv launcher owns a child interpreter. Kill only this
        # adapter's known process tree, including compiled XLA execution.
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    else:
        process.terminate()
    process.wait(timeout=10)


@contextmanager
def work_directory(prefix):
    # Windows may release inherited worker.log handles shortly after taskkill
    # returns. Cleanup must not replace the original cancellation exception.
    directory = tempfile.mkdtemp(prefix=prefix)
    try:
        yield directory
    finally:
        for attempt in range(21):
            try:
                shutil.rmtree(directory)
                break
            except PermissionError:
                if attempt == 20:
                    break  # Keep the owned temporary log for diagnosis.
                time.sleep(0.1)


def simulate(
    cfg,
    check_cancel=lambda: None,
    progress=lambda value, stage: None,
    metadata=None,
    wave=None,
    extras=None,
    live_path=None,
    curve=None,
    medium=None,
):
    grid = plan(cfg, wave)
    check_cancel()
    info = availability()
    if not info["ready"]:
        raise ValueError(info["message"])
    with work_directory(prefix="pam-jwave-") as temporary:
        folder = Path(temporary)
        if cfg.ct:
            from .ct import acoustic_maps

            if medium is None:
                raise ValueError("CT medium data is missing")
            hu, speed, density = acoustic_maps(cfg, medium, grid)
            if cfg.bubble:
                from scipy.ndimage import map_coordinates

                source_indices = np.asarray(grid["source_grid_xz"]).T
                if not np.allclose(
                    map_coordinates(speed, source_indices, order=1, prefilter=False),
                    cfg.sound_speed_m_s,
                    rtol=0,
                    atol=1e-6,
                ):
                    raise ValueError(
                        "Place bubble emitters inside host-fluid CT voxels, away from the skull interface"
                    )
            np.savez(folder / "medium.npz", sound_speed=speed, density=density)
            if extras is not None:
                extras["medium/sound_speed_m_s"] = speed.T
                extras["medium/density_kg_m3"] = density.T
        request = folder / "request.json"
        if wave is not None:
            np.savez(
                folder / "coupling.npz",
                time_s=wave[:, 0],
                q_m3_s=wave[:, 1] if wave.shape[1] == 2 else wave[:, 1:],
                trajectory=curve,
            )
        request.write_text(
            json.dumps(
                {
                    "config": cfg.model_dump(),
                    "plan": grid,
                    "coupled": wave is not None,
                    "live_path": str(live_path) if live_path else None,
                    "ct_extent_m": cfg.ct.extent() if cfg.ct else None,
                }
            ),
            encoding="utf-8",
        )
        with (folder / "worker.log").open("w", encoding="utf-8") as logs:
            process = subprocess.Popen(
                [str(PYTHON), str(RUNNER), "--request", str(request), "--output", str(folder)],
                stdin=subprocess.DEVNULL,
                stdout=logs,
                stderr=logs,
                env=process_env(),
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            started = time.monotonic()
            try:
                while process.poll() is None:
                    check_cancel()
                    if time.monotonic() - started > 900:
                        raise ValueError("j-Wave exceeded the 15 minute CPU time limit")
                    try:
                        phase = (folder / "stage.txt").read_text(encoding="utf-8")
                    except OSError:
                        phase = "Starting isolated j-Wave CPU"
                    progress(0.15 if "Compiling" in phase else 0.5, phase)
                    time.sleep(0.1)
            finally:
                stop_process(process)
        check_cancel()
        if process.returncode:
            detail = (folder / "worker.log").read_text(encoding="utf-8", errors="replace")[-3500:]
            raise ValueError(f"j-Wave worker failed ({process.returncode}): {detail}")
        rf = np.load(folder / "rf.npy", allow_pickle=False)
        if rf.shape != (cfg.samples, cfg.channels) or not np.isfinite(rf).all() or not np.any(rf):
            raise ValueError("j-Wave returned invalid or empty channel data")
        details = json.loads((folder / "metadata.json").read_text(encoding="utf-8"))
        if extras is not None and (folder / "frames.npz").is_file():
            with np.load(folder / "frames.npz", allow_pickle=False) as stored:
                extras["wave/pressure"] = stored["pressure"]
                extras["wave/time_s"] = stored["time_s"]
        if metadata is not None:
            metadata.update({**IDENTITY, **details, "plan": grid})
        progress(1, "j-Wave RF complete")
        return rf
