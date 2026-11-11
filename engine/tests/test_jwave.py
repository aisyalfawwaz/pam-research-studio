"""Adapter contract checks plus actual optional j-Wave CPU integration tests."""

import time

import h5py
import numpy as np
import pytest
from pamstudio.cli import demo
from pamstudio.exporting import export_bundle, import_bundle, verify_folder
from pamstudio.jobs import Jobs
from pamstudio.jwave_adapter import PYTHON, availability, plan
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config, JWaveSettings, Source
from pamstudio.physics import receivers, simulate
from pamstudio.storage import Project
from scipy.signal import hilbert


def scene(**overrides):
    return Config.model_validate(
        {
            **Config(
                channels=16,
                samples=512,
                sampling_hz=10e6,
                frequency_hz=0.5e6,
                gate_stride=2,
                snr_db=None,
                sources=[Source(x_m=0.00065, z_m=0.0063)],
                grid_x_min_m=-0.004,
                grid_x_max_m=0.004,
                grid_z_min_m=0.003,
                grid_z_max_m=0.010,
                grid_n=65,
                simulation=JWaveSettings(spacing_m=0.00025),
            ).model_dump(),
            **overrides,
        }
    )


def test_plan_preserves_geometry_clock_and_ignores_analysis_roi():
    cfg = scene()
    grid = plan(cfg)
    changed = scene(grid_n=33, grid_z_max_m=0.04, gate_end_s=14e-6)
    assert grid == plan(changed)
    assert grid["actual_cfl"] <= cfg.simulation.cfl
    assert grid["points_per_shortest_wavelength"] >= 4
    origin, dx = np.array(grid["origin_xz_m"]), grid["spacing_m"]
    np.testing.assert_allclose(
        np.array(grid["sensor_grid_xz"]) * dx + origin, receivers(cfg)[:, [0, 2]], atol=1e-17
    )
    np.testing.assert_allclose(
        np.array(grid["source_grid_xz"]) * dx + origin, [[0.00065, 0.0063]], atol=1e-17
    )
    assert grid["dt_s"] * grid["substeps"] == 1 / cfg.sampling_hz


@pytest.mark.parametrize(
    "change,message",
    [
        ({"spreading": True}, "spreading"),
        ({"emission_kind": "broadband", "gate_stride": 1}, "Broadband"),
        ({"simulation": JWaveSettings(spacing_m=0.001).model_dump()}, "points/wavelength"),
        ({"samples": 16384, "simulation": JWaveSettings(spacing_m=0.00005).model_dump()}, "budget"),
    ],
)
def test_unsupported_or_unresolved_models_rejected_before_execution(change, message):
    with pytest.raises(ValueError, match=message):
        plan(scene(**change))


def test_analytic_config_remains_legacy_compatible():
    cfg = Config()
    assert "simulation" not in cfg.model_dump()
    assert (
        "simulation"
        not in Config.model_validate({**cfg.model_dump(), "simulation": None}).model_dump()
    )


@pytest.fixture(scope="module")
def numerical():
    if not PYTHON.is_file():
        pytest.skip("Optional j-Wave runtime is not installed; run scripts/setup-jwave.ps1")
    assert availability()["ready"], availability()
    metadata = {}
    cfg = scene()
    return cfg, simulate(cfg, metadata=metadata), metadata


def test_real_jwave_arrival_channel_order_and_boundary(numerical):
    cfg, rf, metadata = numerical
    assert rf.shape == (512, 16) and rf.dtype == np.float64
    expected = (
        cfg.sources[0].emission_s
        + np.linalg.norm(receivers(cfg) - [0.00065, 0, 0.0063], axis=1) / cfg.sound_speed_m_s
    )
    envelope = abs(hilbert(rf, axis=0))
    arrival = cfg.capture_t0_s + envelope.argmax(axis=0) / cfg.sampling_hz
    # Absolute arrival tolerance is below one coarse propagation cell transit.
    np.testing.assert_allclose(arrival, expected, atol=0.15e-6, rtol=0)
    assert abs(arrival[0] - expected[0]) < abs(arrival[0] - expected[-1])
    assert np.max(abs(rf[:45])) < 0.01 * np.max(abs(rf))
    assert np.sqrt(np.mean(rf[350:] ** 2)) < 0.002 * np.max(abs(rf))
    assert metadata["packages"]["jwave"] == "0.2.1"
    assert metadata["precision"] == "float64" and metadata["compute"] == "jax-cpu"
    assert metadata["plan"]["mapping"].startswith("bilinear")


def test_real_jwave_determinism_and_nonzero_capture_origin(numerical):
    cfg, rf, _ = numerical
    np.testing.assert_array_equal(simulate(cfg), rf)
    shifted = scene(capture_t0_s=0.7e-6)
    shifted_rf = simulate(shifted)
    # Acquisition reindexing, not a different emission clock or channel order.
    np.testing.assert_allclose(shifted_rf[:450], rf[7:457], atol=1e-12, rtol=1e-10)


def test_real_jwave_five_methods_export_import_and_reanalysis(numerical, tmp_path):
    cfg, _, _ = numerical
    options = ReconstructionOptions(
        methods=["das", "tea", "cf", "rcb", "atp"], atp_timing_known=True, rcb_subarray=8
    )
    project, run_id, result = demo(tmp_path / "jwave-project", cfg, options)
    for key, image in result.maps.items():
        assert np.isfinite(image).all() and image.max() > 0
        assert result.metrics[key]["localization_error_m"] < 0.001
    original = project.run(run_id)
    assert original["provenance"]["simulation"]["id"] == "jwave"
    bundle = export_bundle(project, run_id, tmp_path / "jwave.zip", True)
    assert verify_folder(bundle["folder_path"])["config"]["simulation"]["backend"] == "jwave"
    imported = import_bundle(Project(tmp_path / "imported", create=True), bundle["zip_path"])
    assert imported["provenance"]["simulation"] == original["provenance"]["simulation"]
    jobs = Jobs()
    try:
        accepted = jobs.reconstruct(
            project, run_id, ReconstructionOptions(methods=["das"]), scene(grid_n=33)
        )
        deadline = time.monotonic() + 15
        while jobs.busy() and time.monotonic() < deadline:
            time.sleep(0.02)
        assert jobs.snapshot()["status"] == "complete", jobs.snapshot()
        rerun = project.run(accepted["run_id"])
        assert rerun["provenance"]["simulation"] == original["provenance"]["simulation"]
        with h5py.File(project.file(rerun["id"]), "r") as stored:
            assert stored["maps/das"].shape == (33, 33)
    finally:
        jobs.shutdown()


def test_real_jwave_cancellation_discards_run_and_stops_worker(numerical, tmp_path):
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
        assert project.run(accepted["run_id"])["status"] == "interrupted"
    finally:
        jobs.shutdown()
