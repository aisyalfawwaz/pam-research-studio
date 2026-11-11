import json
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pamstudio.cli import demo
from pamstudio.exporting import export_bundle, import_bundle
from pamstudio.jbubble_adapter import PYTHON as BUBBLE_PYTHON
from pamstudio.jobs import Jobs
from pamstudio.jwave_adapter import PYTHON as WAVE_PYTHON
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config, ReceiveArray
from pamstudio.reconstruction import reconstruct, smoothed_covariance
from pamstudio.server import create_app
from pamstudio.storage import Project
from pamstudio.workflow import WorkflowRequest, compile_graph, coupled_template


def test_1024_channel_limits_and_capture_budget():
    assert Config(channels=1024, samples=8192).channels == 1024
    assert ReceiveArray(elements=1024).elements == 1024
    with pytest.raises(ValueError, match="1024"):
        Config(channels=1025)
    with pytest.raises(ValueError, match="64 MiB"):
        Config(channels=1024, samples=16384)


def test_banded_subarray_covariance_matches_full_independent_matrix():
    rng = np.random.default_rng(792)
    weighted = rng.normal(size=(2, 137, 13)) + 1j * rng.normal(size=(2, 137, 13))
    full = weighted @ weighted.swapaxes(1, 2).conj() / 2.3
    length = 7
    expected = sum(full[:, i : i + length, i : i + length] for i in range(137 - length + 1)) / (
        137 - length + 1
    )
    np.testing.assert_allclose(
        smoothed_covariance(weighted, length, 2.3), expected, rtol=1e-13, atol=1e-13
    )


def test_large_rcb_rejects_excessive_work_before_allocating_alignment():
    cfg = Config(channels=1024, pitch_m=0.00005, samples=512, sampling_hz=10e6, gate_stride=2)
    with pytest.raises(ValueError, match="5 billion"):
        reconstruct(np.zeros((512, 1024)), cfg, options=ReconstructionOptions(methods=["rcb"]))


def test_actual_1024_channel_five_maps_full_preview_export_import_and_last_channel_api(tmp_path):
    cfg = Config(
        channels=1024,
        pitch_m=0.00005,
        grid_n=17,
        sampling_hz=10e6,
        gate_stride=2,
        gate_start_s=6e-6,
        gate_end_s=10e-6,
        snr_db=None,
    )
    options = ReconstructionOptions(
        methods=["das", "tea", "cf", "rcb", "atp"], atp_timing_known=True, rcb_subarray=4
    )
    project, run_id, result = demo(tmp_path / "large", cfg, options)
    assert set(result.maps) == set(options.methods)
    for metric in result.metrics.values():
        assert metric["localization_error_m"] < 0.002
    assert result.diagnostics["pixel_batch_size"] < 64
    rf = project.read_rf(run_id)
    assert rf.shape == (4096, 1024) and rf.nbytes == 32 * 1024**2
    np.testing.assert_allclose(rf[:, 0], rf[:, -1], rtol=1e-12, atol=1e-14)
    preview = project.array(run_id, "rf")
    assert preview.shape == (512, 1024) and preview.nbytes == 2_097_152
    archived = export_bundle(project, run_id, tmp_path / "large.zip", True)
    target = Project(tmp_path / "import", create=True)
    imported = import_bundle(target, archived["zip_path"])
    np.testing.assert_array_equal(target.read_rf(imported["id"]), rf)
    with TestClient(create_app("capacity-test-token")) as client:
        client.headers["Authorization"] = "Bearer capacity-test-token"
        assert (
            client.post("/project", json={"path": str(project.path), "create": False}).status_code
            == 200
        )
        response = client.get(f"/runs/{run_id}/arrays/trace?channel=1023")
        assert response.status_code == 200
        trace = np.frombuffer(response.content, dtype="<f4").reshape(4096, 2)
        np.testing.assert_allclose(trace[:, 1], rf[:, 1023], rtol=1e-6, atol=1e-8)
        assert client.get(f"/runs/{run_id}/arrays/trace?channel=1024").status_code == 422


@pytest.mark.skipif(
    not WAVE_PYTHON.is_file() or not BUBBLE_PYTHON.is_file(),
    reason="Install both optional runtimes",
)
def test_actual_1024_channel_coupled_four_array_live_pipeline(tmp_path):
    graph, cfg, options = coupled_template()
    graph.nodes = [n for n in graph.nodes if n.id != "method_rcb"]
    graph.edges = [e for e in graph.edges if "method_rcb" not in (e.source, e.target)]
    arrays = [
        ReceiveArray(name=f"Array {i + 1}", elements=256, pitch_m=0.00005, x_m=x, z_m=z)
        for i, (x, z) in enumerate([(-0.008, 0), (0.008, 0), (-0.008, 0.002), (0.008, 0.002)])
    ]
    raw = cfg.model_dump() | {
        "channels": 1024,
        "arrays": [a.model_dump() for a in arrays],
        "grid_n": 17,
        "snr_db": None,
    }
    cfg, options, _ = compile_graph(WorkflowRequest(workflow=graph, config=raw, options=options))
    project = Project(tmp_path / "coupled1024", create=True)
    jobs = Jobs()
    try:
        accepted = jobs.start(project, cfg, options=options, workflow=graph.model_dump())
        deadline = time.monotonic() + 120
        snapshots = []
        while jobs.busy() and time.monotonic() < deadline:
            frame = jobs.live()
            if frame.get("rf"):
                assert len(frame["rf"]) <= 64 and len(frame["rf"][0]) == 1024
                assert len(json.dumps(frame)) < 2_000_000
                snapshots.append(frame["time_s"])
            time.sleep(0.08)
        assert jobs.snapshot()["status"] == "complete", jobs.snapshot()
        assert len(set(snapshots)) > 1
        run = project.run(accepted["run_id"])
        assert run["provenance"]["simulation"]["id"] == "jbubble-jwave"
        assert set(run["metrics"]["methods"]) == {"das", "tea", "cf", "atp"}
        assert project.read_rf(run["id"]).shape == (512, 1024)
        assert np.any(project.array(run["id"], "trace", 1023)[:, 1])
    finally:
        jobs.shutdown()
