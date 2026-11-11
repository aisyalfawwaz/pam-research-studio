"""Isolated jbubble dynamics and a dimensionless 3D retarded monopole RF bridge."""

import functools
import json
import os
import subprocess
import time

import numpy as np
from scipy.signal import resample_poly

from .jwave_adapter import ROOT, process_env, stop_process, work_directory
from .physics import receivers

PYTHON = (
    ROOT / ".adapters/jbubble/.venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
)
RUNNER = ROOT / "adapters/jbubble/runner.py"
IDENTITY = {
    "id": "jbubble",
    "adapter_version": "1.0.0",
    "package": "jbubble",
    "version": "0.2.0",
    "license": "MIT",
    "source": "https://github.com/imperial-nsb/jbubble",
    "validation": "experimental",
    "runtime": "isolated-native-cpu",
    "propagation": "3D quasi-acoustic monopole, homogeneous retarded time",
}


@functools.lru_cache(maxsize=1)
def availability():
    info = {
        **IDENTITY,
        "ready": False,
        "message": "Run scripts/setup-jbubble.ps1, then restart the app.",
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
            output, error = process.communicate(timeout=45)
        finally:
            stop_process(process)
        if process.returncode:
            raise ValueError(error[-1500:] or "jbubble runtime health check failed")
        return {
            **info,
            **json.loads(output),
            "ready": True,
            "message": "jbubble 0.2.0 beta · isolated CPU · experimental",
        }
    except subprocess.TimeoutExpired:
        return {
            **info,
            "message": "jbubble startup timed out. Run scripts/setup-jbubble.ps1 and restart the app.",
        }
    except (OSError, ValueError) as error:
        return {**info, "message": f"jbubble unavailable: {error}"}


def dynamics(cfg, check_cancel=lambda: None, progress=lambda value, stage: None):
    if not cfg.bubble:
        raise ValueError("Bubble settings missing")
    check_cancel()
    info = availability()
    if not info["ready"]:
        raise ValueError(info["message"])
    with work_directory(prefix="pam-jbubble-") as temporary:
        from pathlib import Path

        folder = Path(temporary)
        request = folder / "request.json"
        request.write_text(cfg.model_dump_json(), encoding="utf-8")
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
                    if time.monotonic() - started > 300:
                        raise ValueError("jbubble exceeded its five minute CPU time limit")
                    try:
                        stage = (folder / "stage.txt").read_text(encoding="utf-8")
                    except OSError:
                        stage = "Starting isolated jbubble CPU"
                    progress(0.5, stage)
                    time.sleep(0.1)
            finally:
                stop_process(process)
        check_cancel()
        if process.returncode:
            error = (folder / "worker.log").read_text(encoding="utf-8", errors="replace")[-3500:]
            raise ValueError(f"jbubble worker failed ({process.returncode}): {error}")
        trajectory = np.load(folder / "bubble.npy", allow_pickle=False)
        details = json.loads((folder / "metadata.json").read_text(encoding="utf-8"))
        if trajectory.ndim != 2 or trajectory.shape[1] != 6 or not np.isfinite(trajectory).all():
            raise ValueError("Invalid bubble trajectory")
        return trajectory, {**IDENTITY, **details}


def population(cfg, check_cancel=lambda: None, progress=lambda value, stage: None):
    """Independent per-source radial solves; identical settings share a solve."""
    cache, curves, records = {}, [], []
    for i, source in enumerate(cfg.sources):
        check_cancel()
        settings = source.bubble or cfg.bubble
        key = settings.model_dump_json()
        if key not in cache:
            local = cfg.model_copy(update={"bubble": settings})
            cache[key] = dynamics(local, check_cancel, progress)
        curve, info = cache[key]
        curves.append(curve)
        records.append({"source_index": i, "settings": settings.model_dump(), "simulation": info})
    info = dict(records[0]["simulation"])
    if any(s.bubble for s in cfg.sources):
        info.update(
            population=records,
            unique_radial_solves=len(cache),
            population_assumption="Independent bubbles, shared frequency/duration and host medium; no mutual acoustic feedback",
        )
    return curves, info


def save_population(extras, curves, cfg):
    if extras is None:
        return
    extras["bubble/trajectory"] = curves[0]
    if any(s.bubble for s in cfg.sources):
        extras["bubble/population"] = np.concatenate(
            [np.column_stack([np.full(len(curve), i), curve]) for i, curve in enumerate(curves)]
        )


def simulate(
    cfg, check_cancel=lambda: None, progress=lambda value, stage: None, metadata=None, extras=None
):
    curves, info = population(cfg, check_cancel, progress)
    trajectory = curves[0]
    factor = info["oversampling"]
    normalization = cfg.bubble.drive_pa or 1.0
    rf = np.zeros((cfg.samples, cfg.channels), dtype=np.float64)
    positions = receivers(cfg)
    for emitter, trajectory in zip(cfg.sources, curves, strict=True):
        source = resample_poly(trajectory[:, 4], 1, factor) / normalization
        local_time = trajectory[0, 0] + np.arange(len(source)) / cfg.sampling_hz
        check_cancel()
        distance = np.linalg.norm(positions - [emitter.x_m, 0, emitter.z_m], axis=1)
        if distance.min() < 10 * trajectory[:, 1].max():
            raise ValueError(
                "Receiver too close for monopole approximation: require distance > 10 Rmax"
            )
        for channel in range(cfg.channels):
            coordinate = (
                np.arange(cfg.samples, dtype=np.float64)
                + (
                    cfg.capture_t0_s
                    - distance[channel] / cfg.sound_speed_m_s
                    - emitter.emission_s
                    - local_time[0]
                )
                * cfg.sampling_hz
            )
            # Snap roundoff at exact acquisition/source sample boundaries. This
            # preserves integer t0 reindexing at the finite support endpoints.
            nearest = np.rint(coordinate)
            coordinate = np.where(abs(coordinate - nearest) < 1e-8, nearest, coordinate)
            rf[:, channel] += (
                emitter.amplitude
                * info["reference_distance_m"]
                / distance[channel]
                * np.interp(
                    coordinate,
                    np.arange(len(source)),
                    source,
                    left=0,
                    right=0,
                )
            )
    if cfg.snr_db is not None:
        noise = np.random.default_rng(np.random.SeedSequence([cfg.seed, 2])).normal(size=rf.shape)
        rf += noise * np.sqrt(np.mean(rf**2)) * 10 ** (-cfg.snr_db / 20)
    info.update(
        rf_normalization_pa=normalization,
        rf_unit="dimensionless simulated pressure / drive pressure",
        source_weights="Source amplitude scales each independent emission; per-source bubble settings set its nonlinear driving pressure"
        if any(s.bubble for s in cfg.sources)
        else "Source amplitude scales identical independent bubble emissions, not the driving pressure",
        resampling="polyphase anti-alias low-pass before acquisition-rate decimation",
    )
    if metadata is not None:
        metadata.update(info)
    save_population(extras, curves, cfg)
    progress(1, "jbubble RF complete")
    return rf
