"""Experimental CT straight-ray slowness integration, independent of PAM truth."""

import hashlib

import numpy as np
from scipy.ndimage import map_coordinates


def ct_delays(points, receivers, cfg, medium, step_m, check_cancel=lambda: None):
    if not cfg.ct or medium is None:
        raise ValueError("CT slowness reconstruction requires the saved HU medium")
    from .ct import cropped_hu

    ct = cfg.ct
    hu = cropped_hu(ct, medium)
    fraction = (
        np.where(hu >= ct.bone_threshold_hu, np.clip(hu / ct.bone_hu, 0, 1), 0)
        if ct.contrast
        else np.zeros_like(hu)
    )
    speed = cfg.sound_speed_m_s + (ct.bone_speed_m_s - cfg.sound_speed_m_s) * fraction
    output = np.empty((len(points), len(receivers)))
    for j, sensor in enumerate(receivers):
        check_cancel()
        distance = np.linalg.norm(points - sensor, axis=1)
        count = max(2, int(np.ceil(distance.max() / step_m)) + 1)
        if count > 8193:
            raise ValueError(
                "Ray quadrature exceeds 8193 samples; shorten geometry or increase ray step"
            )
        u = np.linspace(0, 1, count)
        # Pixels outside the immutable crop are host fluid, as in propagation.
        x = sensor[0] + (points[:, 0, None] - sensor[0]) * u
        z = sensor[2] + (points[:, 2, None] - sensor[2]) * u
        values = map_coordinates(
            speed,
            [(z - ct.origin_z_m) / ct.spacing_z_m, (x - ct.origin_x_m) / ct.spacing_x_m],
            order=1,
            mode="constant",
            cval=cfg.sound_speed_m_s,
            prefilter=False,
        )
        output[:, j] = distance * np.trapezoid(1 / values, u, axis=1)
    return output


def identity(cfg, medium, options):
    return {
        "id": "pam.receive.ct_slowness",
        "version": "1.0.0",
        "model": options.receive_model,
        "ray_step_m": options.ray_step_m,
        "medium_asset_id": cfg.ct.asset_id if cfg.ct else None,
        "hu_sha256": hashlib.sha256(np.asarray(medium["hu"], dtype="<f4").tobytes()).hexdigest()
        if medium
        else None,
        "equation": "tau=integral_straight_path ds/c_CT(x,z)",
        "limitations": "Fixed straight rays; no refraction, diffraction, amplitude correction, shear or multipath. Experimental.",
    }
