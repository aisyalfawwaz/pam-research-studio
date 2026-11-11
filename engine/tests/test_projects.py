import json
import time
import zipfile

import h5py
import numpy as np
import pytest
from fastapi.testclient import TestClient
from pamstudio.cli import demo
from pamstudio.exporting import export_bundle, import_bundle, verify_folder
from pamstudio.jobs import Jobs
from pamstudio.models import Config
from pamstudio.server import create_app
from pamstudio.storage import Project, digest


@pytest.fixture
def completed(tmp_path):
    return demo(tmp_path / "source", Config(grid_n=17))


@pytest.mark.parametrize("raw", [False, True])
def test_export_reimport_and_hashes(completed, tmp_path, raw):
    project, run_id, result = completed
    bundle = export_bundle(project, run_id, tmp_path / f"experiment-{raw}.zip", raw)
    experiment = verify_folder(bundle["folder_path"])
    assert experiment["config"] == project.run(run_id)["config"]
    assert bundle["sha256"] == digest(bundle["zip_path"])
    destination = Project(tmp_path / "imported", create=True)
    imported = import_bundle(destination, bundle["zip_path"])
    assert imported["metrics"] == project.run(run_id)["metrics"]
    with h5py.File(destination.file(imported["id"]), "r") as src:
        np.testing.assert_array_equal(src["maps/tea"][:], result.maps["tea"])
        assert ("rf" in src) == raw
    assert destination.run(imported["id"])["provenance"]["imported_original_run_id"] == run_id
    if not raw:
        with pytest.raises(ValueError, match="excluded"):
            destination.read_rf(imported["id"])


def test_bundle_corruption_and_zip_traversal_rejected(completed, tmp_path):
    project, run_id, _ = completed
    bundle = export_bundle(project, run_id, tmp_path / "good.zip")
    metrics = __import__("pathlib").Path(bundle["folder_path"]) / "metrics.json"
    metrics.write_text("{}", encoding="utf-8")
    with pytest.raises(ValueError, match="hash mismatch"):
        verify_folder(bundle["folder_path"])
    with zipfile.ZipFile(tmp_path / "bad.zip", "w") as archive:
        archive.writestr("../outside.txt", "attack")
    with pytest.raises(ValueError, match="paths"):
        import_bundle(project, tmp_path / "bad.zip")
    assert not (tmp_path / "outside.txt").exists()


def test_immutable_runs_draft_and_crash_recovery(completed):
    project, run_id, _ = completed
    with pytest.raises(ValueError, match="immutable"):
        project.finish(run_id, "failed")
    project.draft(Config(seed=99))
    unfinished = project.begin(Config())
    reopened = Project(project.path)
    assert reopened.run(unfinished)["status"] == "interrupted"
    assert reopened.info()["draft"]["seed"] == 99
    assert reopened.run(run_id)["config"]["seed"] == 42


def test_real_cancellation_does_not_finalize(tmp_path):
    project = Project(tmp_path / "cancel", create=True)
    jobs = Jobs()
    jobs.start(project, Config(grid_n=192))
    while jobs.busy():
        time.sleep(0.01)
    simulated = jobs.snapshot()["run_id"]
    jobs.reconstruct(project, simulated)
    run_id = jobs.snapshot()["run_id"]
    jobs.cancel()
    jobs.shutdown()
    assert project.run(run_id)["status"] == "interrupted"
    assert not project.file(run_id).exists()


def test_api_auth_validation_binary_and_workflow(tmp_path):
    app = create_app("secret-token-for-tests")
    with TestClient(app) as client:
        assert client.get("/health").status_code == 401
        client.headers["Authorization"] = "Bearer secret-token-for-tests"
        assert (
            client.get("/health", headers={"Origin": "https://malicious.invalid"}).status_code
            == 403
        )
        assert client.get("/health").json()["backend"] == "numpy-cpu"
        assert (
            client.post(
                "/project", json={"path": str(tmp_path / "api"), "create": True}
            ).status_code
            == 200
        )
        cfg = Config(grid_n=17).model_dump(mode="json")
        bad = cfg | {"sampling_hz": 1e6}
        assert client.post("/simulate", json={"config": bad}).status_code == 422
        started = client.post("/simulate", json={"config": cfg}).json()
        while client.get("/job").json()["status"] == "running":
            time.sleep(0.02)
        run_id = started["run_id"]
        binary = client.get(f"/runs/{run_id}/arrays/rf")
        assert binary.status_code == 200
        assert json.loads(binary.headers["X-Array-Shape"]) == [512, 64]
        assert len(binary.content) == 512 * 64 * 4
        assert client.get(f"/runs/{run_id}/arrays/trace?channel=127").status_code == 400
        second = client.post("/reconstruct", json={"input_run_id": run_id}).json()
        while client.get("/job").json()["status"] == "running":
            time.sleep(0.02)
        record = client.get(f"/runs/{second['run_id']}").json()
        assert record["status"] == "complete"
        assert record["methods"]["tea"]["status"] == "reference-only"


def test_array_dimension_and_complex_rejection():
    from pamstudio.reconstruction import reconstruct

    cfg = Config(grid_n=17)
    with pytest.raises(ValueError, match="shape"):
        reconstruct(np.zeros((cfg.channels, cfg.samples)), cfg)
    with pytest.raises(ValueError, match="real RF"):
        reconstruct(np.ones((cfg.samples, cfg.channels), dtype=complex), cfg)


def test_reanalysis_changes_grid_without_resimulating_and_rejects_changed_capture(
    completed, tmp_path
):
    from pamstudio.methods import ReconstructionOptions

    project, parent, _ = completed
    cfg = Config.model_validate(project.run(parent)["config"])
    changed = Config.model_validate(cfg.model_dump() | {"grid_n": 33, "gate_start_s": 5e-6})
    jobs = Jobs()
    accepted = jobs.reconstruct(
        project, parent, ReconstructionOptions(methods=["das"]), config=changed
    )
    while jobs.busy():
        time.sleep(0.01)
    run = project.run(accepted["run_id"])
    assert run["status"] == "complete" and run["config"]["grid_n"] == 33
    with h5py.File(project.file(run["id"]), "r") as src:
        assert src["maps/das"].shape == (33, 33)
        assert json.loads(src.attrs["config_json"])["grid_n"] == 17
        assert json.loads(src.attrs["reconstruction_config_json"])["grid_n"] == 33
    np.testing.assert_array_equal(project.read_rf(run["id"]), project.read_rf(parent))
    package = export_bundle(project, run["id"], tmp_path / "new-grid.zip", True)
    assert verify_folder(package["folder_path"])["config"]["grid_n"] == 33
    with pytest.raises(ValueError, match="acquisition differs"):
        jobs.reconstruct(
            project, parent, config=Config.model_validate(cfg.model_dump() | {"sampling_hz": 25e6})
        )
    jobs.shutdown()


def test_selected_methods_roundtrip_and_reanalysis_preserve_rf(completed, tmp_path):
    from pamstudio.methods import ReconstructionOptions
    from pamstudio.reconstruction import reconstruct
    from pamstudio.storage import canonical

    project, parent, _ = completed
    cfg = Config.model_validate(project.run(parent)["config"])
    options = ReconstructionOptions(
        methods=["cf", "rcb", "atp"], atp_timing_known=True, rcb_subarray=4
    )
    rf = project.read_rf(parent)
    result = reconstruct(rf, cfg, options=options)
    run_id = project.begin(cfg, parent, options.model_dump())
    project.save_reconstruction(run_id, parent, result)
    project.finish(
        run_id,
        "complete",
        {
            "methods": result.metrics,
            "runtime_ms": result.runtime_ms,
            "rf_bytes": rf.nbytes,
            "map_bytes": sum(a.nbytes for a in result.maps.values()),
            "diagnostics": result.diagnostics,
        },
    )
    assert set(project.run(run_id)["methods"]) == set(options.methods)
    np.testing.assert_array_equal(project.read_rf(run_id), rf)
    with h5py.File(project.file(run_id), "r") as src:
        assert set(src["maps"]) == set(options.methods)
        assert src.attrs["analysis_json"] == canonical(options.model_dump())
    bundle = export_bundle(project, run_id, tmp_path / "selected.zip", True)
    experiment = verify_folder(bundle["folder_path"])
    assert experiment["analysis"] == options.model_dump()
    assert set(experiment["methods"]) == set(options.methods)
    with pytest.raises(ValueError, match="not calculated"):
        project.array(run_id, "das")


def test_bundle_rejects_external_hdf5_links_even_with_matching_file_hash(completed, tmp_path):
    from pathlib import Path

    from pamstudio.storage import canonical

    project, run_id, _ = completed
    bundle = export_bundle(project, run_id, tmp_path / "links.zip")
    folder = Path(bundle["folder_path"])
    with h5py.File(folder / "results.h5", "a") as src:
        src["untrusted"] = h5py.ExternalLink("outside.h5", "/data")
    manifest = json.loads((folder / "manifest.json").read_text())
    manifest["files"]["results.h5"] = {
        "sha256": digest(folder / "results.h5"),
        "bytes": (folder / "results.h5").stat().st_size,
    }
    (folder / "manifest.json").write_text(canonical(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="links"):
        verify_folder(folder)
