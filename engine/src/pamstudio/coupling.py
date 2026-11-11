"""One-way conservation-based 3D bubble volume flow → equivalent 2D line source."""

import hashlib

import numpy as np
from scipy.signal import fftconvolve, firwin, kaiserord

from .jbubble_adapter import population, save_population
from .jwave_adapter import simulate as propagate


def filter_spec(cfg):
    fs = cfg.sampling_hz * max(4, int(np.ceil(128 * cfg.frequency_hz / cfg.sampling_hz)))
    cutoff = cfg.coupling.passband_hz
    count, beta = kaiserord(80, 0.5 * cutoff / (fs / 2))
    count = int(count) | 1
    if count > 8193:
        raise ValueError(
            "Coupling filter exceeds 8193 taps; increase passband or reduce source sampling"
        )
    return fs, count, beta


def volume_flow(curve, cfg):
    fs, count, beta = filter_spec(cfg)
    cutoff = cfg.coupling.passband_hz
    taps = firwin(count, 1.25 * cutoff, fs=fs, window=("kaiser", beta))
    raw = 4 * np.pi * curve[:, 1] ** 2 * curve[:, 2]
    filtered = fftconvolve(raw, taps, mode="full")
    times = curve[0, 0] + np.arange(len(filtered)) / fs
    details = {
        "mode": "volume_flow_2d",
        "effective_length_m": cfg.coupling.effective_length_m,
        "passband_hz": cutoff,
        "stopband_hz": 1.5 * cutoff,
        "filter_taps": count,
        "filter": "causal 80 dB Kaiser FIR, full convolution; group delay retained",
        "source_delay_s": (count - 1) / (2 * fs),
        "q_equation": "Q_3D=4*pi*R^2*Rdot [m^3/s]; Q_2D=Q_3D/L [m^2/s]",
        "injection_equation": "jwave Sources value=rho*c*Q_3D/(2*L*dx); summed density rate=rho*Q_3D/(L*dx^2)",
        "waveform_sha256": hashlib.sha256(np.column_stack([times, filtered]).tobytes()).hexdigest(),
        "source_time_range_s": [float(times[0]), float(times[-1])],
        "normalization_pa": cfg.bubble.drive_pa or 1.0,
        "assumptions": "one-way equivalent line source; no acoustic feedback or 3D pressure equivalence",
    }
    return np.column_stack([times, filtered]), details


def simulate(cfg, check_cancel, progress, metadata, extras, live_path=None, medium=None):
    curves, bubble = population(cfg, check_cancel, progress)
    curve = curves[0]
    if max(np.max(c[:, 1]) for c in curves) > cfg.simulation.spacing_m / 4:
        raise ValueError(
            "Equivalent point coupling requires Rmax < propagation spacing/4; use a smaller bubble or a resolved interface model"
        )
    wave, bridge = volume_flow(curve, cfg)
    if any(s.bubble for s in cfg.sources):
        waves = [volume_flow(c, cfg)[0] for c in curves]
        times = max(waves, key=len)[:, 0]
        wave = np.column_stack(
            [times] + [np.interp(times, w[:, 0], w[:, 1], left=0, right=0) for w in waves]
        )
        bridge["waveform_sha256"] = hashlib.sha256(wave.tobytes()).hexdigest()
        bridge["source_time_range_s"] = [float(times[0]), float(times[-1])]
        bridge["columns"] = "source_time_s, then per-source filtered volume flow in source order"
    from .geometry import receivers

    positions = receivers(cfg)
    for source in cfg.sources:
        distance = np.linalg.norm(positions - [source.x_m, 0, source.z_m], axis=1)
        if (
            source.emission_s + wave[0, 0] + distance.min() / cfg.sound_speed_m_s < cfg.capture_t0_s
            or source.emission_s + wave[-1, 0] + distance.max() / cfg.sound_speed_m_s
            > cfg.capture_t0_s + (cfg.samples - 1) / cfg.sampling_hz
        ):
            raise ValueError(
                "Capture truncates the FIR source support plus propagation; extend acquisition time origin or sample count"
            )
    if extras is not None:
        save_population(extras, curves, cfg)
        extras["coupling/volume_flow"] = wave
    wave_metadata = {}
    rf = propagate(
        cfg, check_cancel, progress, wave_metadata, wave, extras, live_path, curve, medium
    )
    if metadata is not None:
        metadata.update(
            id="jbubble-jwave",
            adapter_version="1.0.0",
            compute="jax-cpu",
            precision="float64",
            bubble=bubble,
            propagation=wave_metadata,
            coupling=bridge,
            rf_unit="2D model pressure divided by drive pressure",
        )
    return rf
