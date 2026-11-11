from dataclasses import dataclass, field
from time import perf_counter

import numpy as np
from scipy.signal import hilbert

from .methods import ReconstructionOptions
from .models import Config
from .physics import receivers
from .robust import robust_steering


@dataclass
class Reconstruction:
    x: np.ndarray
    z: np.ndarray
    maps: dict[str, np.ndarray]
    metrics: dict
    runtime_ms: float
    gate: np.ndarray
    diagnostics: dict = field(default_factory=dict)
    options: dict = field(default_factory=dict)
    conditioned_rf: np.ndarray | None = None
    processing: dict | None = None
    response: np.ndarray | None = None


def fwhm(axis, profile, peak_index):
    """Linear interpolation at half POWER; return None for boundary-truncated lobes."""
    half = profile[peak_index] / 2
    low = peak_index
    high = peak_index
    while low > 0 and profile[low] >= half:
        low -= 1
    while high < len(axis) - 1 and profile[high] >= half:
        high += 1
    if profile[low] >= half or profile[high] >= half:
        return None
    left = axis[low] + (half - profile[low]) / (profile[low + 1] - profile[low]) * (
        axis[low + 1] - axis[low]
    )
    right = axis[high - 1] + (half - profile[high - 1]) / (profile[high] - profile[high - 1]) * (
        axis[high] - axis[high - 1]
    )
    return float(right - left)


def evaluate(image, x, z, cfg):
    iz, ix = np.unravel_index(np.argmax(image), image.shape)
    peak = np.array([x[ix], z[iz]])
    truth = np.array([[s.x_m, s.z_m] for s in cfg.sources])
    xx, zz = np.meshgrid(x, z)
    # Explicit 2 mm exclusion radius: this is a descriptive background ratio, not specificity.
    background = np.ones(image.shape, dtype=bool)
    for sx, sz in truth:
        background &= (xx - sx) ** 2 + (zz - sz) ** 2 > 0.002**2
    return {
        "peak_x_m": float(peak[0]),
        "peak_z_m": float(peak[1]),
        "localization_error_m": float(np.min(np.linalg.norm(truth - peak, axis=1))),
        "truth_nearest_peak_errors_m": [float(np.linalg.norm(t - peak)) for t in truth],
        "lateral_fwhm_m": fwhm(x, image[iz], ix) if len(truth) == 1 else None,
        "axial_fwhm_m": fwhm(z, image[:, ix], iz) if len(truth) == 1 else None,
        "background_peak_ratio": float(image[background].max() / image.max())
        if background.any() and image.max() > 0
        else None,
        "background_exclusion_radius_m": 0.002,
        "metric_note": "Global peak to nearest truth; multi-source FWHM disabled. Broad/boundary-truncated lobes have no FWHM.",
    }


def smoothed_covariance(weighted, subarray, duration):
    """Exact uniform subarray average, without an N-channel square intermediate."""
    count = weighted.shape[1] - subarray + 1
    covariance = np.empty((len(weighted), subarray, subarray), dtype=complex)
    conjugated = weighted.conj()
    for i in range(subarray):
        for j in range(i, subarray):
            value = np.einsum(
                "bnt,bnt->b", weighted[:, i : i + count], conjugated[:, j : j + count]
            ) / (count * duration)
            covariance[:, i, j] = value
            covariance[:, j, i] = value.conj()
    return covariance


def reconstruct(
    rf,
    cfg: Config,
    positions=None,
    check_cancel=lambda: None,
    progress=lambda value: None,
    options: ReconstructionOptions | None = None,
    frame_callback=None,
    medium=None,
):
    started = perf_counter()
    options = options or ReconstructionOptions()
    model_cfg = cfg
    if (
        options.assumed_sound_speed_m_s is not None
        or options.assumed_receiver_offsets_m is not None
    ):
        values = cfg.model_dump()
        if options.assumed_sound_speed_m_s is not None:
            values["sound_speed_m_s"] = options.assumed_sound_speed_m_s
        if options.assumed_receiver_offsets_m is not None:
            values["receiver_offsets_m"] = options.assumed_receiver_offsets_m
        model_cfg = Config.model_validate(values)
    if options.receive_model == "ct_slowness" and (cfg.ct is None or medium is None):
        raise ValueError("Choose a saved CT medium for CT slowness reconstruction")
    selected = options.methods
    positions = receivers(model_cfg) if positions is None else np.asarray(positions)
    if rf.shape != (cfg.samples, cfg.channels) or positions.shape != (cfg.channels, 3):
        raise ValueError(
            "RF shape or receiver mapping mismatch; expected [sample, channel] and [channel, xyz]"
        )
    if not np.isrealobj(rf) or not np.isfinite(rf).all() or not np.isfinite(positions).all():
        raise ValueError("Only finite real RF and receiver coordinates are supported")
    from .dsp import condition

    rf, processing, response = condition(rf, cfg, check_cancel)
    x = np.linspace(cfg.grid_x_min_m, cfg.grid_x_max_m, cfg.grid_n)
    z = np.linspace(cfg.grid_z_min_m, cfg.grid_z_max_m, cfg.grid_n)
    xx, zz = np.meshgrid(x, z)
    points = np.column_stack([xx.ravel(), np.zeros(xx.size), zz.ravel()])
    dt = cfg.gate_stride / cfg.sampling_hz
    gate = (
        cfg.gate_start_s
        + np.arange(int(np.floor((cfg.gate_end_s - cfg.gate_start_s) / dt)) + 1) * dt
    )
    time = cfg.capture_t0_s + np.arange(cfg.samples) / cfg.sampling_hz
    channels = cfg.active_channels if cfg.active_channels is not None else list(range(cfg.channels))
    if len(gate) < 2:
        raise ValueError("The reconstruction gate must contain at least two temporal samples")
    if "atp" in selected:
        if cfg.emission_kind != "pulse" or options.atp_window_s * cfg.frequency_hz > 5.000001:
            raise ValueError(
                "ATP requires a short pulse with a timing window of at most five carrier cycles"
            )
        if options.atp_window_s / dt < 2:
            raise ValueError(
                "ATP window requires at least three temporal samples; reduce gate stride"
            )
    subarray = min(options.rcb_subarray, len(channels))
    delta = np.diff(positions[channels], axis=0)
    irregular = bool(cfg.arrays and len(cfg.arrays) > 1) or not np.allclose(
        delta, delta[0], rtol=1e-6, atol=1e-10
    )
    if irregular and "rcb" in selected:
        if len(channels) > 64:
            raise ValueError(
                "RCB on multiple arrays supports up to 64 active channels; select an aperture mask or another method"
            )
        subarray = len(channels)
    covariance_terms = len(points) * len(channels) * len(gate) * subarray**2
    if "rcb" in selected and len(channels) > 128 and covariance_terms > 5_000_000_000:
        raise ValueError(
            "Large-array RCB exceeds the 5 billion covariance-term CPU budget; reduce grid size, gate samples or subarray length, or select DAS/TEA/CF/ATP"
        )
    analytic = hilbert(rf[:, channels], axis=0) if "rcb" in selected else None
    outputs = {method: np.zeros(len(points)) for method in selected}
    diagnostics = {
        "active_channels": len(channels),
        "gate_samples": len(gate),
        "gate_actual_s": [float(gate[0]), float(gate[-1])],
        "method_status": "reference/experimental",
    }
    if options.receive_model == "ct_slowness":
        from .travel import identity

        diagnostics["receive_propagation"] = identity(cfg, medium, options)
    if "rcb" in selected:
        diagnostics.update(
            rcb_subarray=subarray,
            rcb_snapshots=len(gate),
            rcb_condition_max=0.0,
            rcb_loaded_condition_max=0.0,
            rcb_constraint_residual_max=0.0,
            rcb_covariance_terms_upper_bound=covariance_terms,
        )
        diagnostics["rcb_spatial_smoothing"] = (
            "disabled: full covariance for multiple arrays"
            if irregular
            else "contiguous uniform subarrays"
        )
    temporal_weights = np.full(len(gate), dt)
    temporal_weights[[0, -1]] /= 2
    duration = gate[-1] - gate[0]
    # Bound alignment/covariance scratch instead of multiplying fixed batch size
    # by up to 1024 channels. This excludes input RF and FFT workspaces.
    scratch_per_pixel = max(
        1, len(channels) * len(gate) * 16 * 4 + min(len(channels), 128) ** 2 * 16 * 2
    )
    chunk = max(1, min(64, (32 * 1024**2) // scratch_per_pixel)) if analytic is not None else 64
    diagnostics["pixel_batch_size"] = chunk
    diagnostics["scratch_target_bytes"] = 32 * 1024**2
    for start in range(0, len(points), chunk):
        check_cancel()
        block = points[start : start + chunk]
        distances = np.linalg.norm(block[:, None, :] - positions[None, channels, :], axis=2)
        delays = distances / model_cfg.sound_speed_m_s
        if options.receive_model == "ct_slowness":
            from .travel import ct_delays

            delays = ct_delays(
                block, positions[channels], model_cfg, medium, options.ray_step_m, check_cancel
            )
        summed = np.zeros((len(block), len(gate)))
        incoherent = np.zeros_like(summed)
        analytic_aligned = (
            np.zeros((len(block), len(channels), len(gate)), dtype=complex)
            if analytic is not None
            else None
        )
        for j, channel in enumerate(channels):
            if j % 32 == 0:
                check_cancel()
            # Positive receive delay recovers source-time waveform: s_m(u + distance/c).
            query = gate[None, :] + delays[:, j, None]
            scale = distances[:, j, None] / 0.03 if cfg.spreading else 1.0
            y = (
                np.interp(query.ravel(), time, rf[:, channel], left=0, right=0).reshape(query.shape)
                * scale
            )
            summed += y
            if "cf" in selected:
                incoherent += y**2
            if analytic_aligned is not None:
                imaginary = (
                    np.interp(query.ravel(), time, analytic[:, j].imag, left=0, right=0).reshape(
                        query.shape
                    )
                    * scale
                )
                analytic_aligned[:, j, :] = y + 1j * imaginary
        power = (summed / len(channels)) ** 2
        where = slice(start, start + len(block))
        if "das" in selected:
            outputs["das"][where] = power.max(axis=1)
        if "tea" in selected:
            outputs["tea"][where] = np.trapezoid(power, gate, axis=1)
        if "cf" in selected:
            cf = np.clip(
                np.divide(
                    summed**2,
                    len(channels) * incoherent,
                    out=np.zeros_like(summed),
                    where=incoherent > 0,
                ),
                0,
                1,
            )
            outputs["cf"][where] = (power * cf ** (2 * options.cf_exponent)).max(axis=1)
        if analytic_aligned is not None:
            weighted = analytic_aligned * np.sqrt(temporal_weights)[None, None, :]
            if len(channels) > 128 and not irregular:
                covariance = smoothed_covariance(weighted, subarray, duration)
            else:
                full_cov = (weighted @ weighted.swapaxes(1, 2).conj()) / duration
                count = len(channels) - subarray + 1
                covariance = (
                    sum(full_cov[:, i : i + subarray, i : i + subarray] for i in range(count))
                    / count
                )
            covariance = (covariance + covariance.swapaxes(1, 2).conj()) / 2
            _, weights, details = robust_steering(
                covariance, options.rcb_radius, options.rcb_loading
            )
            exposure = (
                np.einsum("bi,bij,bj->b", weights.conj(), covariance, weights).real * duration / 2
            )
            outputs["rcb"][where] = np.maximum(exposure, 0)
            diagnostics["rcb_condition_max"] = max(
                diagnostics["rcb_condition_max"], float(details["condition_before_loading"].max())
            )
            diagnostics["rcb_loaded_condition_max"] = max(
                diagnostics["rcb_loaded_condition_max"],
                float(details["condition_after_loading"].max()),
            )
            diagnostics["rcb_constraint_residual_max"] = max(
                diagnostics["rcb_constraint_residual_max"],
                float(details["uncertainty_residual"].max()),
            )
        if "atp" in selected:
            offset = np.linspace(
                -options.atp_window_s / 2,
                options.atp_window_s / 2,
                int(np.ceil(options.atp_window_s / dt)) + 1,
            )
            centers = np.full(len(block), options.atp_emission_s)
            if options.atp_mode == "plane_wave":
                centers += (block[:, 2] - options.atp_plane_z_m) / model_cfg.sound_speed_m_s
            atp_sum = np.zeros((len(block), len(offset)))
            for j, channel in enumerate(channels):
                query = centers[:, None] + offset + delays[:, j, None]
                scale = distances[:, j, None] / 0.03 if cfg.spreading else 1
                atp_sum += (
                    np.interp(query.ravel(), time, rf[:, channel], left=0, right=0).reshape(
                        query.shape
                    )
                    * scale
                )
            outputs["atp"][where] = np.trapezoid((atp_sum / len(channels)) ** 2, offset, axis=1)
        progress(min(1, (start + len(block)) / len(points)))
        if frame_callback is not None and (
            start % (chunk * 4) == 0 or start + len(block) >= len(points)
        ):
            frame_callback(outputs, start + len(block))
    if any(not np.isfinite(image).all() or not image.max() > 0 for image in outputs.values()):
        raise ValueError(
            "No finite nonzero signal in reconstruction gate; inspect RF and source-time bounds"
        )
    maps = {method: image.reshape(xx.shape) for method, image in outputs.items()}
    return Reconstruction(
        x,
        z,
        maps,
        {key: evaluate(value, x, z, cfg) for key, value in maps.items()},
        (perf_counter() - started) * 1000,
        gate,
        diagnostics,
        options.model_dump(),
        rf if processing else None,
        processing,
        response,
    )
