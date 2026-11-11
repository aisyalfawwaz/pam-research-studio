import hashlib
import json

import numpy as np
import pytest
from pamstudio.cli import demo
from pamstudio.exporting import export_bundle, import_bundle, verify_folder
from pamstudio.jbubble_adapter import PYTHON, simulate
from pamstudio.jobs import Jobs
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import BubbleSettings, Config, Source
from pamstudio.physics import receivers
from pamstudio.reporting import export_pdf
from pamstudio.storage import Project, digest
from pamstudio.studies import Axis, Studies, StudyRequest
from scipy.signal import resample_poly


def test_real_heterogeneous_coupling_has_per_source_flow_and_preserves_exchange(tmp_path):
    import h5py
    from pamstudio.jwave_adapter import PYTHON as WAVE_PYTHON
    from pamstudio.physics import simulate as capture
    from pamstudio.workflow import coupled_template

    if not PYTHON.is_file() or not WAVE_PYTHON.is_file():
        pytest.skip("Optional native adapters absent")
    _, cfg, _ = coupled_template()
    raw = cfg.model_dump()
    raw.update(channels=8, arrays=None, grid_n=17, snr_db=None)
    raw["sources"] = [
        Source(x_m=-0.001, z_m=0.012).model_dump(),
        Source(
            x_m=0.001,
            z_m=0.012,
            bubble=BubbleSettings(model="free", radius_m=1.5e-6, drive_pa=15e3, ringdown_cycles=3),
        ).model_dump(),
    ]
    cfg = Config.model_validate(raw)
    metadata, extras = {}, {}
    rf = capture(cfg, metadata=metadata, extras=extras)
    assert rf.shape == (cfg.samples, 8) and np.isfinite(rf).all() and abs(rf).max() > 0
    flow = extras["coupling/volume_flow"]
    assert flow.shape[1] == 3 and not np.array_equal(flow[:, 1], flow[:, 2])
    assert metadata["coupling"]["waveform_sha256"] == hashlib.sha256(flow.tobytes()).hexdigest()
    assert metadata["bubble"]["unique_radial_solves"] == 2
    project = Project(tmp_path / "coupled-population", create=True)
    run = project.begin(cfg)
    project.save_rf(run, rf, cfg, metadata, extras)
    project.finish(run, "simulated")
    from pamstudio.reconstruction import reconstruct

    options = ReconstructionOptions(methods=["das"])
    result = reconstruct(rf, cfg, options=options)
    acquired = run
    run = project.begin(cfg, acquired, options.model_dump())
    project.save_reconstruction(run, acquired, result)
    project.finish(run, "complete", {"methods": result.metrics, "runtime_ms": result.runtime_ms})
    bundle = export_bundle(project, run, tmp_path / "coupled-population.zip", True)
    verify_folder(bundle["folder_path"])
    target = Project(tmp_path / "copy", create=True)
    imported = import_bundle(target, bundle["zip_path"])
    with h5py.File(target.file(imported["id"]), "r") as stored:
        np.testing.assert_array_equal(stored["coupling/volume_flow"][:], flow)
        np.testing.assert_array_equal(stored["rf"][0], rf)


def test_independent_population_exact_monopole_sum_and_no_raw_exchange(tmp_path):
    if not PYTHON.is_file():
        pytest.skip("Optional jbubble runtime absent")
    base = BubbleSettings(drive_pa=20e3, ringdown_cycles=2)
    cfg = Config(
        bubble=base,
        spreading=True,
        gate_stride=1,
        channels=8,
        grid_n=17,
        sampling_hz=10e6,
        samples=1024,
        snr_db=None,
        sources=[
            Source(x_m=-0.001, z_m=0.02),
            Source(
                x_m=0.001,
                z_m=0.02,
                bubble=BubbleSettings(
                    model="free", radius_m=1.5e-6, drive_pa=30e3, ringdown_cycles=3
                ),
            ),
        ],
    )
    metadata, extras = {}, {}
    rf = simulate(cfg, metadata=metadata, extras=extras)
    pop = extras["bubble/population"]
    curves = [pop[pop[:, 0] == i, 1:] for i in range(2)]
    assert metadata["unique_radial_solves"] == 2
    assert np.isclose(curves[0][0, 1], 2e-6) and np.isclose(curves[1][0, 1], 1.5e-6)
    assert len(curves[0]) != len(curves[1])
    assert metadata["population"][1]["settings"]["drive_pa"] == 30e3
    t = cfg.capture_t0_s + np.arange(cfg.samples) / cfg.sampling_hz
    independent = np.zeros_like(rf)
    for i, (curve, source) in enumerate(zip(curves, cfg.sources, strict=True)):
        waveform = (
            resample_poly(curve[:, 4], 1, metadata["population"][i]["simulation"]["oversampling"])
            / 20e3
        )
        clock = curve[0, 0] + np.arange(len(waveform)) / cfg.sampling_hz
        distances = np.linalg.norm(receivers(cfg) - [source.x_m, 0, source.z_m], axis=1)
        for j, distance in enumerate(distances):
            independent[:, j] += (
                0.001
                / distance
                * np.interp(
                    t - distance / cfg.sound_speed_m_s - source.emission_s,
                    clock,
                    waveform,
                    left=0,
                    right=0,
                )
            )
    np.testing.assert_allclose(rf, independent, rtol=1e-10, atol=1e-12)
    from pamstudio.reconstruction import reconstruct

    project = Project(tmp_path / "population", create=True)
    acquired = project.begin(cfg)
    project.save_rf(acquired, rf, cfg, metadata, extras)
    project.finish(acquired, "simulated")
    options = ReconstructionOptions(methods=["das"])
    result = reconstruct(rf, cfg, options=options)
    run = project.begin(cfg, acquired, options.model_dump())
    project.save_reconstruction(run, acquired, result)
    project.finish(run, "complete", {"methods": result.metrics, "runtime_ms": result.runtime_ms})
    np.testing.assert_allclose(project.array(run, "bubble", 1), curves[1], rtol=1e-7, atol=1e-4)
    package = export_bundle(project, run, tmp_path / "population.zip", False)
    verify_folder(package["folder_path"])
    imported_project = Project(tmp_path / "import", create=True)
    record = import_bundle(imported_project, package["zip_path"])
    np.testing.assert_array_equal(
        project.array(run, "bubble", 1), imported_project.array(record["id"], "bubble", 1)
    )
    assert (
        "10.1121/1.2109427"
        in (__import__("pathlib").Path(package["folder_path"]) / "references.bib").read_text()
    )
    before = digest(project.file(run))
    report = export_pdf(project, tmp_path / "population.pdf", run_id=run)
    assert (tmp_path / "population.pdf").read_bytes().startswith(b"%PDF-")
    context = json.loads((tmp_path / "population.report.json").read_text())
    assert context["run"]["config"]["sources"][1]["bubble"]["model"] == "free"
    assert context["pdf_sha256"] == digest(tmp_path / "population.pdf") == report["sha256"]
    assert digest(project.file(run)) == before


def test_run_pdf_actual_scores_hashes_and_safe_text(tmp_path):
    project, run, _ = demo(
        tmp_path / "report",
        Config(grid_n=33, channels=8),
        ReconstructionOptions(methods=["das", "tea"]),
    )
    project.name = "Study <not markup>"
    original = digest(project.file(run))
    result = export_pdf(project, tmp_path / "run.pdf", run_id=run)
    assert result["context_path"].endswith(".report.json")
    context = json.loads((tmp_path / "run.report.json").read_text())
    assert context["benchmark"]["run_id"] == run
    assert context["results_h5_sha256"] == original
    assert (tmp_path / "run.pdf").stat().st_size > 20_000
    assert digest(project.file(run)) == original
    with pytest.raises(ValueError, match=".pdf"):
        export_pdf(project, tmp_path / "bad.html", run_id=run)


def test_study_pdf_full_trial_inventory_and_context(tmp_path):
    project = Project(tmp_path / "study", create=True)
    jobs = Jobs()
    studies = Studies(jobs)
    try:
        body = StudyRequest(
            config=Config(grid_n=17, channels=4),
            options=ReconstructionOptions(methods=["das"]),
            axes=[Axis(parameter="snr_db", values=[10, 20])],
        )
        id = studies.start(project, body)["study_id"]
        import time

        end = time.monotonic() + 10
        while jobs.busy() and time.monotonic() < end:
            time.sleep(0.02)
        record = studies.read(project, id)
        assert record["status"] == "complete"
        export_pdf(project, tmp_path / "study.pdf", study=record)
        context = json.loads((tmp_path / "study.report.json").read_text())
        assert len(context["study"]["cases"]) == 2
        assert (tmp_path / "study.pdf").read_bytes().startswith(b"%PDF-")
    finally:
        studies.shutdown()
        jobs.shutdown()
