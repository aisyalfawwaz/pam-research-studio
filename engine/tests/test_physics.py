"""Independent analytic fixtures, not screenshot or implementation-mirroring tests."""

import numpy as np
import pytest
from pamstudio.models import Config, Source
from pamstudio.physics import receivers, simulate
from pamstudio.reconstruction import reconstruct
from pydantic import ValidationError


def small(**updates):
    return Config.model_validate(Config(grid_n=33, snr_db=None).model_dump() | updates)


def test_analytic_arrivals_and_fractional_delay_sign():
    cfg = small()
    rf = simulate(cfg)
    positions = receivers(cfg)
    expected = cfg.sources[0].emission_s + np.hypot(positions[:, 0], 0.03) / cfg.sound_speed_m_s
    actual = cfg.capture_t0_s + np.argmax(rf, axis=0) / cfg.sampling_hz
    assert np.max(np.abs(actual - expected)) <= 1 / cfg.sampling_hz
    assert rf.shape == (4096, 64)


def test_t0_changes_acquisition_samples_not_physics():
    cfg = small()
    shift = 80
    shifted = small(capture_t0_s=shift / cfg.sampling_hz)
    np.testing.assert_allclose(simulate(cfg)[shift:], simulate(shifted)[:-shift], atol=2e-13)


def test_noise_seed_and_mirror():
    a = small(snr_db=15)
    np.testing.assert_array_equal(simulate(a), simulate(a))
    assert not np.array_equal(simulate(a), simulate(small(snr_db=15, seed=43)))
    left = small(sources=[Source(x_m=-0.003, z_m=0.03).model_dump()])
    right = small(sources=[Source(x_m=0.003, z_m=0.03).model_dump()])
    np.testing.assert_allclose(simulate(left)[:, ::-1], simulate(right), atol=1e-13)


def test_localization_and_exposure_are_distinct():
    cfg = small()
    result = reconstruct(simulate(cfg), cfg)
    for method in ("das", "tea"):
        assert result.metrics[method]["localization_error_m"] <= 0.001
        assert np.isfinite(result.maps[method]).all()
        assert result.maps[method].max() > 0
    assert not np.allclose(result.maps["das"], result.maps["tea"])


def test_channel_order_and_missing_channels():
    cfg = small(sources=[Source(x_m=0.003, z_m=0.03).model_dump()])
    rf = simulate(cfg)
    p = np.random.default_rng(2).permutation(cfg.channels)
    normal = reconstruct(rf, cfg)
    permuted = reconstruct(rf[:, p], cfg, positions=receivers(cfg)[p])
    np.testing.assert_allclose(normal.maps["tea"], permuted.maps["tea"], atol=1e-18)
    missing = small(active_channels=list(range(0, 64, 2)))
    assert reconstruct(simulate(missing), missing).metrics["das"]["localization_error_m"] < 0.001


def test_multiple_sources_superpose():
    a = small(sources=[Source(x_m=-0.003).model_dump()])
    b = small(sources=[Source(x_m=0.003, emission_s=12e-6).model_dump()])
    both = small(sources=[*a.model_dump()["sources"], *b.model_dump()["sources"]])
    np.testing.assert_allclose(simulate(both), simulate(a) + simulate(b), atol=1e-13)
    assert reconstruct(simulate(both), both).metrics["das"]["lateral_fwhm_m"] is None


def test_positive_receive_alignment_matches_independent_scalar_energy():
    cfg = small(channels=4)
    # Use arbitrary RF rather than simulator output to catch shared forward/inverse errors.
    rf = np.random.default_rng(7).normal(size=(cfg.samples, cfg.channels))
    result = reconstruct(rf, cfg)
    x, z = result.x[16], result.z[16]
    time = cfg.capture_t0_s + np.arange(cfg.samples) / cfg.sampling_hz
    beam = []
    for u in result.gate:
        received = []
        for channel, receiver in enumerate(receivers(cfg)):
            delay = np.sqrt((x - receiver[0]) ** 2 + z**2) / cfg.sound_speed_m_s
            received.append(np.interp(u + delay, time, rf[:, channel], left=0, right=0))
        beam.append(sum(received) / cfg.channels)
    energy = sum(
        (beam[i] ** 2 + beam[i + 1] ** 2) / 2 * (result.gate[i + 1] - result.gate[i])
        for i in range(len(beam) - 1)
    )
    assert result.maps["tea"][16, 16] == pytest.approx(energy, rel=1e-12)
    assert result.maps["das"][16, 16] == pytest.approx(max(v * v for v in beam), rel=1e-12)


def test_speed_mismatch_and_empty_gate():
    cfg = small()
    rf = simulate(cfg)
    correct = reconstruct(rf, cfg).metrics["tea"]["localization_error_m"]
    wrong = reconstruct(rf, cfg.model_copy(update={"sound_speed_m_s": 1650})).metrics["tea"][
        "localization_error_m"
    ]
    assert wrong > correct + 0.0005
    with pytest.raises(ValueError, match="nonzero"):
        reconstruct(np.zeros_like(rf), cfg)


def test_harmonic_broadband_and_bandpass_are_real_deterministic_options():
    for kind in ("harmonic", "broadband"):
        cfg = small(emission_kind=kind, gate_stride=1)
        data = simulate(cfg)
        assert np.isfinite(data).all() and np.any(data)
        np.testing.assert_array_equal(data, simulate(cfg))
    original = simulate(small())
    filtered = simulate(small(bandpass_hz=(0.5e6, 1.5e6)))
    assert not np.array_equal(original, filtered)
    with pytest.raises(ValidationError, match="stride 1"):
        small(emission_kind="broadband")


@pytest.mark.parametrize(
    "updates",
    [
        {"sampling_hz": 1e6},
        {"sources": [{"x_m": 3, "z_m": 30}]},
        {"grid_x_max_m": -0.02},
        {"active_channels": [0, 0]},
        {"gate_end_s": 1e-3},
        {"frequency_hz": float("nan")},
    ],
)
def test_invalid_units_sampling_and_bounds(updates):
    with pytest.raises(ValidationError):
        small(**updates)
