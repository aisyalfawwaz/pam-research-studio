import numpy as np
from scipy.signal import butter, sosfiltfilt

from .geometry import receivers
from .models import Config


def simulate(
    cfg: Config,
    check_cancel=lambda: None,
    progress=lambda value, stage: None,
    metadata=None,
    extras=None,
    live_path=None,
    medium=None,
) -> np.ndarray:
    """RF[sample, channel] at capture_t0+n/fs, using the selected simulation pipeline."""
    if cfg.ct:
        if medium is None:
            raise ValueError("CT-derived simulation requires its immutable HU asset")
        if extras is not None:
            extras["medium/hu"] = medium["hu"]
        if metadata is not None:
            metadata["ct_source"] = medium["metadata"]
    if cfg.coupling:
        from .coupling import simulate as coupled

        return coupled(cfg, check_cancel, progress, metadata, extras, live_path, medium)
    if cfg.bubble:
        from .jbubble_adapter import simulate as bubble_simulation

        return bubble_simulation(cfg, check_cancel, progress, metadata, extras)
    if cfg.simulation:
        from .jwave_adapter import simulate as full_wave

        return full_wave(
            cfg, check_cancel, progress, metadata, extras=extras, live_path=live_path, medium=medium
        )
    if metadata is not None:
        metadata.update(
            id="analytic", adapter_version="1.0.0", compute="numpy-cpu", precision="float64"
        )
    positions = receivers(cfg)
    time = cfg.capture_t0_s + np.arange(cfg.samples) / cfg.sampling_hz
    rf = np.zeros((cfg.samples, cfg.channels), dtype=np.float64)
    count = int(round(cfg.duration_s * cfg.sampling_hz)) + 1
    local = np.linspace(-cfg.duration_s / 2, cfg.duration_s / 2, count)
    envelope = np.exp(-0.5 * (local / (cfg.duration_s / 6)) ** 2)
    for index, source in enumerate(cfg.sources):
        check_cancel()
        if cfg.emission_kind == "broadband":
            carrier = np.random.default_rng(np.random.SeedSequence([cfg.seed, index, 1])).normal(
                size=count
            )
        else:
            carrier = np.cos(2 * np.pi * cfg.frequency_hz * local)
        window = np.hanning(count) if cfg.emission_kind == "harmonic" else envelope
        waveform = source.amplitude * carrier * window
        if cfg.bandpass_hz:
            sos = butter(4, cfg.bandpass_hz, btype="bandpass", fs=cfg.sampling_hz, output="sos")
            waveform = sosfiltfilt(sos, waveform)
        # Explicit finite support; fractional receive delays use linear interpolation.
        waveform[[0, -1]] = 0
        distance = np.linalg.norm(positions - [source.x_m, 0, source.z_m], axis=1)
        for channel in range(cfg.channels):
            if channel % 64 == 0:
                check_cancel()
            scale = 0.03 / distance[channel] if cfg.spreading else 1.0
            rf[:, channel] += scale * np.interp(
                time - distance[channel] / cfg.sound_speed_m_s,
                local + source.emission_s,
                waveform,
                left=0,
                right=0,
            )
    if cfg.snr_db is not None:
        rms = np.sqrt(np.mean(rf**2))
        noise = np.random.default_rng(np.random.SeedSequence([cfg.seed, 2])).normal(size=rf.shape)
        rf += noise * rms * 10 ** (-cfg.snr_db / 20)
    return rf
