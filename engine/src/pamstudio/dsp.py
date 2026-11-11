"""Versioned offline receive conditioning using the installed SciPy signal library."""

import hashlib
import importlib.metadata

import numpy as np
from scipy.signal import butter, detrend, iirnotch, sosfiltfilt, sosfreqz, tf2sos


def coefficients(cfg):
    p = cfg.processing
    sections = []
    if p.filter_kind != "none":
        cutoff = (
            p.high_hz
            if p.filter_kind == "lowpass"
            else p.low_hz
            if p.filter_kind == "highpass"
            else [p.low_hz, p.high_hz]
        )
        sections.extend(
            butter(p.order, cutoff, btype=p.filter_kind, fs=cfg.sampling_hz, output="sos")
        )
    if p.notch_hz is not None:
        b, a = iirnotch(p.notch_hz, p.notch_q, fs=cfg.sampling_hz)
        sections.extend(tf2sos(b, a))
    return np.asarray(sections, dtype=float).reshape(-1, 6)


def condition(rf, cfg, check_cancel=lambda: None):
    if cfg.processing is None:
        return rf, None, None
    p = cfg.processing
    sos = coefficients(cfg)
    out = np.array(rf, dtype=np.float64, copy=True)
    for start in range(0, cfg.channels, 32):
        check_cancel()
        block = out[:, start : start + 32]
        if p.remove_dc:
            block -= block.mean(axis=0, keepdims=True)
        if p.detrend_linear:
            block = detrend(block, axis=0, type="linear")
        if len(sos):
            block = sosfiltfilt(sos, block, axis=0, padtype="odd")
        out[:, start : start + 32] = block
    if not np.isfinite(out).all():
        raise ValueError("Receive conditioning produced non-finite RF")
    frequency = np.linspace(0, cfg.sampling_hz / 2, 513)
    gain = (
        abs(sosfreqz(sos, worN=frequency, fs=cfg.sampling_hz)[1]) ** 2
        if len(sos)
        else np.ones_like(frequency)
    )
    metadata = {
        "id": "pam.receive.scipy",
        "version": "1.0.0",
        "library": "scipy.signal",
        "scipy": importlib.metadata.version("scipy"),
        "settings": p.model_dump(),
        "sos": sos.tolist(),
        "direction": "forward-backward, zero phase, odd endpoint padding",
        "clock": "sampling and t0 unchanged; offline/noncausal; response amplitude is squared one-pass gain",
        "rf_sha256": hashlib.sha256(out.tobytes()).hexdigest(),
        "warning": "Zero-phase filtering may pre-ring and changes amplitude/noise; inspect endpoints and ATP timing sensitivity. DC/detrend response is not represented by the IIR transfer curve.",
    }
    return out, metadata, np.column_stack([frequency, gain])
