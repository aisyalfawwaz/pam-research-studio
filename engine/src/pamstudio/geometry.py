"""Receive-array geometry, flattened in explicit array/element channel order."""

import numpy as np


def receivers(cfg):
    positions = nominal_receivers(cfg)
    if cfg.receiver_offsets_m:
        positions[:, [0, 2]] += np.asarray(cfg.receiver_offsets_m)
    return positions


def nominal_receivers(cfg):
    if not cfg.arrays:
        positions = np.zeros((cfg.channels, 3), dtype=np.float64)
        positions[:, 0] = (np.arange(cfg.channels) - (cfg.channels - 1) / 2) * cfg.pitch_m
        return positions
    result = []
    for array in cfg.arrays:
        offsets = (np.arange(array.elements) - (array.elements - 1) / 2) * array.pitch_m
        theta = np.deg2rad(array.angle_deg)
        result.append(
            np.column_stack(
                [
                    array.x_m + offsets * np.cos(theta),
                    np.zeros(array.elements),
                    array.z_m + offsets * np.sin(theta),
                ]
            )
        )
    return np.concatenate(result)
