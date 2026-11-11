import numpy as np
import pytest
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config, Source
from pamstudio.physics import simulate
from pamstudio.reconstruction import reconstruct
from pamstudio.robust import robust_steering
from pydantic import ValidationError
from scipy.optimize import minimize


def test_cf_limits_and_disabled_weighting():
    cfg = Config(grid_n=17, channels=8, snr_db=None)
    rf = simulate(cfg)
    result = reconstruct(rf, cfg, options=ReconstructionOptions(methods=["das", "cf"]))
    assert np.all(result.maps["cf"] <= result.maps["das"] * (1 + 1e-14))
    identity = reconstruct(
        rf, cfg, options=ReconstructionOptions(methods=["das", "cf"], cf_exponent=0)
    )
    np.testing.assert_allclose(identity.maps["cf"], identity.maps["das"], atol=1e-14)
    assert np.max(result.maps["cf"]) > 0


def test_rcb_spherical_solution_against_independent_constrained_optimizer():
    covariance = np.array([[2, 0.3 + 0.4j], [0.3 - 0.4j, 0.7]], dtype=complex)
    radius = 0.2
    estimated, weights, diagnostics = robust_steering(covariance, radius, loading=0.001)
    loaded = covariance + np.eye(2) * np.trace(covariance).real / 2 * 0.001

    def unpack(x):
        return x[:2] + 1j * x[2:]

    def objective(x):
        a = unpack(x)
        return float(np.vdot(a, np.linalg.solve(loaded, a)).real)

    reference = minimize(
        objective,
        [1, 1, 0, 0],
        constraints=[
            {"type": "ineq", "fun": lambda x: radius**2 * 2 - np.linalg.norm(unpack(x) - 1) ** 2}
        ],
        method="SLSQP",
        options={"ftol": 1e-12, "maxiter": 300},
    )
    assert reference.success
    np.testing.assert_allclose(estimated, unpack(reference.x), atol=2e-6)
    assert diagnostics["uncertainty_residual"] == pytest.approx(radius, abs=1e-12)
    normalized = estimated * np.sqrt(2) / np.linalg.norm(estimated)
    assert np.vdot(weights, normalized) == pytest.approx(1, abs=1e-12)


def test_rcb_zero_radius_mvdr_limit_and_singular_covariance():
    covariance = np.array([[2, 0.4j], [-0.4j, 1]], dtype=complex)
    estimated, weights, _ = robust_steering(covariance, 0)
    loaded = covariance + 0.001 * np.trace(covariance).real / 2 * np.eye(2)
    expected = np.linalg.solve(loaded, np.ones(2))
    expected /= np.vdot(np.ones(2), expected)
    np.testing.assert_allclose(weights, expected, atol=1e-13)
    np.testing.assert_allclose(estimated, np.ones(2))
    _, stable, diagnostics = robust_steering(np.ones((4, 4)), 0.1)
    assert np.isfinite(stable).all()
    assert diagnostics["condition_after_loading"] < 10000
    with pytest.raises(ValueError, match="Hermitian"):
        robust_steering([[1, 1j], [1j, 1]], 0.1)


def test_all_five_methods_use_real_rf_and_are_distinct():
    cfg = Config(grid_n=17, channels=8, snr_db=20)
    options = ReconstructionOptions(
        methods=["das", "tea", "cf", "rcb", "atp"], rcb_subarray=4, atp_timing_known=True
    )
    result = reconstruct(simulate(cfg), cfg, options=options)
    assert set(result.maps) == set(options.methods)
    for method, image in result.maps.items():
        assert image.shape == (17, 17) and np.isfinite(image).all() and image.max() > 0
        assert result.metrics[method]["localization_error_m"] < 0.006
    assert not np.allclose(result.maps["rcb"], result.maps["tea"], rtol=1e-6, atol=1e-14)
    assert result.diagnostics["rcb_constraint_residual_max"] <= options.rcb_radius + 1e-10


def test_atp_known_timing_changes_depth_response_and_rejects_unknown_long_pulse():
    cfg = Config(grid_n=33, channels=16, snr_db=None, duration_s=1e-6)
    rf = simulate(cfg)
    good = reconstruct(
        rf,
        cfg,
        options=ReconstructionOptions(methods=["atp"], atp_timing_known=True, atp_window_s=1e-6),
    )
    wrong = reconstruct(
        rf,
        cfg,
        options=ReconstructionOptions(
            methods=["atp"], atp_timing_known=True, atp_window_s=1e-6, atp_emission_s=10e-6
        ),
    )
    assert good.metrics["atp"]["localization_error_m"] < 0.001
    assert wrong.metrics["atp"]["localization_error_m"] > 0.002
    with pytest.raises(ValidationError, match="known emission"):
        ReconstructionOptions(methods=["atp"])
    with pytest.raises(ValueError, match="short pulse"):
        reconstruct(
            rf,
            cfg,
            options=ReconstructionOptions(
                methods=["atp"], atp_timing_known=True, atp_window_s=10e-6
            ),
        )


def test_atp_plane_wave_uses_candidate_depth_not_truth():
    cfg = Config(
        grid_n=33,
        channels=16,
        snr_db=None,
        duration_s=2e-6,
        sources=[Source(x_m=0, z_m=0.03, emission_s=20e-6)],
    )
    rf = simulate(cfg)
    options = ReconstructionOptions(
        methods=["atp"],
        atp_timing_known=True,
        atp_mode="plane_wave",
        atp_emission_s=0,
        atp_window_s=2e-6,
    )
    first = reconstruct(rf, cfg, options=options)
    # Evaluation truth can change; the calculated map must not.
    changed = cfg.model_copy(update={"sources": [Source(x_m=0.008, z_m=0.04, emission_s=20e-6)]})
    second = reconstruct(rf, changed, options=options)
    np.testing.assert_array_equal(first.maps["atp"], second.maps["atp"])
    assert first.metrics["atp"]["localization_error_m"] < 0.001
