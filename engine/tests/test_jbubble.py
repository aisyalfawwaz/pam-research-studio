import time

import h5py
import numpy as np
import pytest
from pamstudio.cli import demo
from pamstudio.exporting import export_bundle, import_bundle, verify_folder
from pamstudio.jbubble_adapter import PYTHON, availability, dynamics
from pamstudio.jobs import Jobs
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import BubbleSettings, Config, JWaveSettings
from pamstudio.physics import receivers, simulate
from pamstudio.storage import Project
from scipy.signal import hilbert, resample_poly


def scene(**changes):
    return Config.model_validate(
        {
            **Config(
                bubble=BubbleSettings(),
                spreading=True,
                gate_stride=1,
                gate_end_s=18e-6,
                grid_n=33,
                snr_db=None,
            ).model_dump(),
            **changes,
        }
    )


def test_model_boundaries_and_legacy_serialization():
    assert "bubble" not in Config().model_dump()
    with pytest.raises(ValueError, match="simultaneous"):
        scene(simulation=JWaveSettings().model_dump())
    with pytest.raises(ValueError, match="gate stride 1"):
        scene(gate_stride=4)
    with pytest.raises(ValueError, match="spreading"):
        scene(spreading=False)
    with pytest.raises(ValueError, match="capture|Capture"):
        scene(samples=512)
    with pytest.raises(ValueError, match="less than or equal"):
        BubbleSettings(drive_pa=1e6)


@pytest.fixture(scope="module")
def numerical():
    if not PYTHON.is_file():
        pytest.skip("Optional jbubble runtime absent; run scripts/setup-jbubble.ps1")
    assert availability()["ready"], availability()
    cfg = scene()
    metadata, extras = {}, {}
    rf = simulate(cfg, metadata=metadata, extras=extras)
    return cfg, rf, extras["bubble/trajectory"], metadata


def test_actual_lipid_dynamics_and_independent_monopole_equation(numerical):
    cfg, rf, curve, info = numerical
    assert info["converged"] and info["equation"] == "Keller-Miksis"
    assert info["packages"]["jbubble"] == "0.2.0"
    assert 1.1 < info["max_radius_ratio"] < 1.4
    assert 0.5 < info["min_radius_ratio"] < 0.9
    assert info["max_wall_mach"] < 0.1
    assert rf.shape == (4096, 64) and np.isfinite(rf).all()
    # Independent dimensional radiation identity; the upstream function supplies
    # the pressure while these state/derivative columns supply the RHS.
    radius, velocity, acceleration = curve[:, 1], curve[:, 2], curve[:, 5]
    expected_pa = 1000 / 0.001 * (radius**2 * acceleration + 2 * radius * velocity**2)
    np.testing.assert_allclose(curve[:, 4], expected_pa, rtol=1e-12, atol=1e-10)
    assert curve[0, 0] == -cfg.duration_s / 2
    assert info["final_emission_relative_peak"] < 0.01
    assert info["energy_above_acquisition_nyquist_fraction"] < 0.01


def test_actual_rf_retardation_order_units_and_time_origin(numerical):
    cfg, rf, curve, info = numerical
    source = resample_poly(curve[:, 4], 1, info["oversampling"])
    source_peak_time = curve[0, 0] + abs(hilbert(source)).argmax() / cfg.sampling_hz
    distance = np.linalg.norm(receivers(cfg) - [0, 0, 0.03], axis=1)
    received = abs(hilbert(rf, axis=0)).argmax(axis=0) / cfg.sampling_hz
    expected = cfg.sources[0].emission_s + source_peak_time + distance / cfg.sound_speed_m_s
    np.testing.assert_allclose(received, expected, atol=0.1e-6, rtol=0)
    # RF is explicitly dimensionless rather than silently labelled Pa.
    assert np.max(abs(rf)) < np.max(abs(source)) / cfg.bubble.drive_pa
    assert info["rf_normalization_pa"] == cfg.bubble.drive_pa
    shifted = simulate(scene(capture_t0_s=0.5e-6))
    np.testing.assert_allclose(shifted[:3000], rf[10:3010], rtol=1e-10, atol=1e-13)


def test_actual_zero_drive_equilibrium(numerical):
    curve, info = dynamics(scene(bubble=BubbleSettings(model="free", drive_pa=0).model_dump()))
    assert info["converged"]
    np.testing.assert_allclose(curve[:, 1], 2e-6, rtol=1e-11, atol=1e-18)
    assert np.max(abs(curve[:, 4])) < 1e-6


def test_actual_weak_free_bubble_linear_limit(numerical):
    first, _ = dynamics(scene(bubble=BubbleSettings(model="free", drive_pa=1000).model_dump()))
    second, _ = dynamics(scene(bubble=BubbleSettings(model="free", drive_pa=2000).model_dump()))
    # The weak-drive Keller-Miksis solution should approach linear response.
    ratio = np.max(abs(second[:, 1] - 2e-6)) / np.max(abs(first[:, 1] - 2e-6))
    assert 1.9 < ratio < 2.1


def test_actual_five_method_export_reimport_with_radius_and_provenance(numerical, tmp_path):
    cfg, _, _, _ = numerical
    options = ReconstructionOptions(
        methods=["das", "tea", "cf", "rcb", "atp"], atp_timing_known=True
    )
    project, run_id, result = demo(tmp_path / "bubble-project", cfg, options)
    assert set(result.maps) == {"das", "tea", "cf", "rcb", "atp"}
    for image in result.maps.values():
        assert np.isfinite(image).all() and image.max() > 0
    bundle = export_bundle(project, run_id, tmp_path / "bubble.zip", False)
    verify_folder(bundle["folder_path"])
    target = Project(tmp_path / "import", create=True)
    imported = import_bundle(target, bundle["zip_path"])
    assert imported["provenance"]["simulation"] == project.run(run_id)["provenance"]["simulation"]
    with h5py.File(target.file(imported["id"]), "r") as stored:
        assert "rf" not in stored
        assert stored["bubble/trajectory"].shape[1] == 6
    assert target.array(imported["id"], "bubble").shape[1] == 6
    assert any("harmonics" in message for message in project.run(run_id)["warnings"])


def test_actual_cancellation_stops_bubble_worker(numerical, tmp_path):
    project = Project(tmp_path / "cancelled", create=True)
    jobs = Jobs()
    try:
        accepted = jobs.start(project, scene())
        deadline = time.monotonic() + 30
        while (
            jobs.busy()
            and "Compiling" not in jobs.snapshot()["stage"]
            and time.monotonic() < deadline
        ):
            time.sleep(0.02)
        assert jobs.busy(), jobs.snapshot()
        jobs.cancel()
        deadline = time.monotonic() + 10
        while jobs.busy() and time.monotonic() < deadline:
            time.sleep(0.02)
        assert jobs.snapshot()["status"] == "interrupted", jobs.snapshot()
        assert not project.file(accepted["run_id"]).exists()
    finally:
        jobs.shutdown()
