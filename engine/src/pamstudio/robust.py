"""Spherical uncertainty RCB: steering estimation, not fixed diagonal loading alone."""

import numpy as np


def robust_steering(covariance, radius, loading=0.001):
    """Batched Hermitian covariances. Radius is relative to ||a0||; a0=ones.

    Solve the convex steering-estimation problem in the covariance eigenbasis.
    Scale covariance before the secular root search; this preserves the optimizer.
    Numerical loading and steering uncertainty are separate recorded parameters.
    Returns the unnormalized constrained minimizer, norm-corrected weights, diagnostics.
    """
    covariance = np.asarray(covariance, dtype=np.complex128)
    single = covariance.ndim == 2
    matrices = covariance[None] if single else covariance
    if matrices.ndim != 3 or matrices.shape[-1] != matrices.shape[-2]:
        raise ValueError("RCB covariance must be square or a batch of square matrices")
    if not 0 <= radius < 1 or not 0 < loading <= 0.1 or not np.isfinite(matrices).all():
        raise ValueError("Invalid RCB uncertainty, numerical loading, or covariance")
    if not np.allclose(matrices, matrices.swapaxes(-1, -2).conj(), rtol=1e-10, atol=1e-14):
        raise ValueError("RCB covariance must be Hermitian")
    m = matrices.shape[-1]
    eigenvalues, vectors = np.linalg.eigh(matrices)
    scale = np.maximum(np.trace(matrices, axis1=-2, axis2=-1).real / m, np.finfo(float).tiny)
    if np.any(eigenvalues[:, 0] < -1e-10 * scale):
        raise ValueError("RCB covariance must be positive semidefinite")
    raw_condition = np.divide(eigenvalues[:, -1], np.maximum(eigenvalues[:, 0], scale * 1e-15))
    eigenvalues = np.maximum(eigenvalues / scale[:, None], 0) + loading
    a0 = np.ones((len(matrices), m), dtype=np.complex128)
    projected = np.einsum("bji,bj->bi", vectors.conj(), a0)
    if radius == 0:
        estimated = a0.copy()
    else:
        lo = np.zeros(len(matrices))
        hi = (1 / radius - 1) / eigenvalues[:, 0]
        target = m * radius**2
        # Monotone secular equation; bisection is bounded and does not form R^-1.
        for _ in range(64):
            mid = (lo + hi) / 2
            residual = (np.abs(projected) ** 2 / (1 + mid[:, None] * eigenvalues) ** 2).sum(axis=1)
            lo = np.where(residual > target, mid, lo)
            hi = np.where(residual > target, hi, mid)
        correction = projected / (1 + ((lo + hi) / 2)[:, None] * eigenvalues)
        estimated = a0 - np.einsum("bij,bj->bi", vectors, correction)
    normalized = estimated * np.sqrt(m) / np.linalg.norm(estimated, axis=1)[:, None]
    coefficients = np.einsum("bji,bj->bi", vectors.conj(), normalized) / eigenvalues
    solved = np.einsum("bij,bj->bi", vectors, coefficients)
    denominator = np.einsum("bi,bi->b", normalized.conj(), solved).real
    weights = solved / denominator[:, None]
    diagnostics = {
        "uncertainty_residual": np.linalg.norm(estimated - a0, axis=1) / np.sqrt(m),
        "condition_before_loading": raw_condition,
        "condition_after_loading": eigenvalues[:, -1] / eigenvalues[:, 0],
    }
    return (
        (estimated[0], weights[0], {k: float(v[0]) for k, v in diagnostics.items()})
        if single
        else (estimated, weights, diagnostics)
    )
