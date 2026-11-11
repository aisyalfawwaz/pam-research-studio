import csv
import io
import json
import time

import h5py
import numpy as np
import pytest
from fastapi.testclient import TestClient
from pamstudio.jobs import Jobs
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config, CTSettings, JWaveSettings
from pamstudio.physics import receivers
from pamstudio.reconstruction import reconstruct
from pamstudio.server import create_app
from pamstudio.storage import Project, digest
from pamstudio.studies import (
    Axis,
    Studies,
    StudyRequest,
    plan_study,
    study_csv,
    summarize_uncertainty,
)
from pamstudio.travel import ct_delays


def wait(studies, project, id):
    end = time.monotonic() + 40
    while time.monotonic() < end:
        record = studies.read(project, id)
        if record["status"] not in ("running", "cancelling"):
            assert record["status"] == "complete", record.get("error")
            return record
        time.sleep(0.02)
    raise AssertionError("Study did not finish")


def request(kind="sweep", **changes):
    return StudyRequest(
        config=Config(grid_n=17, channels=8, snr_db=20),
        options=ReconstructionOptions(methods=["das", "tea"]),
        kind=kind,
        axes=[]
        if kind == "uncertainty"
        else [
            Axis(
                parameter="grid_n" if kind == "convergence" else "snr_db",
                values=[17, 25, 33] if kind == "convergence" else [10, 30],
            )
        ],
        **changes,
    )


def test_cartesian_plan_frozen_clock_and_resource_boundaries():
    body = request()
    body.axes.append(Axis(parameter="source.x_m", values=[-0.001, 0.001]))
    plans, info = plan_study(body)
    assert info["case_count"] == 4
    assert {c["config"].sources[0].x_m for c in plans} == {-0.001, 0.001}
    assert body.config.sources[0].x_m == 0
    cfgs, _ = plan_study(request("convergence"))
    assert all(c["config"].snr_db is None for c in cfgs)
    for key, values in [("grid_n", [17.5, 33]), ("bubble.drive_pa", [10, 20])]:
        invalid = body.model_copy(update={"axes": [Axis(parameter=key, values=values)]})
        with pytest.raises(ValueError):
            plan_study(invalid)
    with pytest.raises(ValueError):
        Axis(parameter="../../outside", values=[1, 2])
    old = body.config
    body.config = Config(channels=1024, samples=8192, grid_n=17)
    body.axes = [
        Axis(parameter="snr_db", values=list(range(8))),
        Axis(parameter="source.x_m", values=[i / 1000 for i in range(8)]),
    ]
    with pytest.raises(ValueError, match="2 GiB"):
        plan_study(body)
    assert old.channels == 8


def test_actual_sweep_convergence_reuse_and_immutable_scores(tmp_path):
    project = Project(tmp_path / "project", create=True)
    jobs = Jobs()
    studies = Studies(jobs)
    try:
        accepted = studies.start(project, request())
        record = wait(studies, project, accepted["study_id"])
        assert record["completed"] == 2
        ids = [c["run_id"] for c in record["cases"]]
        assert len(set(ids)) == 2
        assert all(project.run(i)["status"] == "complete" for i in ids)
        assert all(
            c["report"]["methods"]["das"]["localization_error_m"] is not None
            for c in record["cases"]
        )
        assert all(c["report"]["methods"]["das"]["gcnr"] is None for c in record["cases"])
        hashes = {id: digest(project.file(id)) for id in ids}
        conv = wait(studies, project, studies.start(project, request("convergence"))["study_id"])
        assert len(conv["summary"]["cases"]) == 3
        assert conv["summary"]["cases"][0]["value"] == 33
        assert all(c["rf_relative_l2"] == 0 for c in conv["summary"]["cases"])
        assert conv["summary"]["cases"][0]["map_relative_l2"]["das"] == 0
        assert project.run(conv["cases"][1]["run_id"])["parent"] == conv["cases"][0]["run_id"]
        assert {id: digest(project.file(id)) for id in ids} == hashes
        rows = list(csv.DictReader(io.StringIO(study_csv(record))))
        assert len(rows) == 4 and rows[0]["run_id"] in ids
        assert len(studies.list(project)) == 2
    finally:
        studies.shutdown()
        jobs.shutdown()


def test_uncertainty_uses_actual_mismatch_and_reproducible_draws(tmp_path):
    body = request("uncertainty", trials=8, speed_sigma_m_s=15, sensor_sigma_m=0.00004, seed=123)
    plans, summary = plan_study(body)
    again, _ = plan_study(body)
    assert [c["config"].model_dump() for c in plans] == [c["config"].model_dump() for c in again]
    assert len({c["config"].seed for c in plans}) == 8
    assert all(c["options"].assumed_sound_speed_m_s == 1500 for c in plans)
    assert all(c["options"].assumed_receiver_offsets_m == [(0, 0)] * 8 for c in plans)
    assert any(c["config"].sound_speed_m_s != 1500 for c in plans)
    project = Project(tmp_path / "trials", create=True)
    jobs = Jobs()
    studies = Studies(jobs)
    try:
        record = wait(studies, project, studies.start(project, body)["study_id"])
        score = record["summary"]["methods"]["das"]["localization_error_m"]
        assert score["valid"] == score["total"] == 8 and len(score["mean_ci95"]) == 2
        for case in record["cases"]:
            run = project.run(case["run_id"])
            actual = Config.model_validate(run["config"])
            with h5py.File(project.file(run["id"]), "r") as src:
                np.testing.assert_array_equal(src["probe/positions_xyz_m"][:], receivers(actual))
                assert json.loads(src.attrs["analysis_json"])["assumed_sound_speed_m_s"] == 1500
        reports = [c["report"] for c in record["cases"]]
        assert summarize_uncertainty(reports, 8, 123) == summarize_uncertainty(reports, 8, 123)
        assert (
            summarize_uncertainty(reports[:3], 8, 123)["methods"]["das"]["gcnr"]["mean_ci95"]
            is None
        )
    finally:
        studies.shutdown()
        jobs.shutdown()


def test_ct_slowness_constant_medium_and_true_localization():
    ct = CTSettings(
        asset_id="a" * 64,
        rows=128,
        columns=128,
        spacing_x_m=0.0005,
        spacing_z_m=0.0005,
        crop=(0, 128, 0, 128),
        origin_x_m=-0.032,
        origin_z_m=-0.01,
    )
    cfg = Config(
        ct=ct, simulation=JWaveSettings(), channels=32, grid_n=33, snr_db=None, gate_stride=1
    )
    medium = {"hu": np.full((128, 128), 1000, dtype=np.float32)}
    sensors = receivers(cfg)
    source = np.array([[0, 0, 0.03]])
    tau = ct_delays(source, sensors, cfg, medium, 0.0001)
    distance = np.linalg.norm(source[:, None, :] - sensors[None, :, :], axis=2)
    np.testing.assert_allclose(tau, distance / 2800, atol=1e-18)
    uniform = cfg.model_copy(update={"ct": ct.model_copy(update={"contrast": False})})
    np.testing.assert_allclose(
        ct_delays(source, sensors, uniform, medium, 0.0001), distance / 1500, atol=1e-18
    )
    time_axis = cfg.capture_t0_s + np.arange(cfg.samples) / cfg.sampling_hz
    u = time_axis[:, None] - distance / 2800 - cfg.sources[0].emission_s
    rf = np.sin(2 * np.pi * cfg.frequency_hz * u) * np.exp(-0.5 * (u / (cfg.duration_s / 6)) ** 2)
    homogeneous = reconstruct(
        rf, cfg, options=ReconstructionOptions(methods=["atp"], atp_timing_known=True)
    )
    corrected = reconstruct(
        rf,
        cfg,
        options=ReconstructionOptions(
            methods=["atp"], atp_timing_known=True, receive_model="ct_slowness"
        ),
        medium=medium,
    )
    assert corrected.metrics["atp"]["localization_error_m"] < 0.001
    assert homogeneous.metrics["atp"]["localization_error_m"] > 0.005
    assert corrected.diagnostics["receive_propagation"]["medium_asset_id"] == ct.asset_id
    with pytest.raises(ValueError, match="saved CT"):
        reconstruct(rf, cfg, options=ReconstructionOptions(receive_model="ct_slowness"))


def test_authenticated_study_api_sessions_and_export(tmp_path):
    headers = {"Authorization": "Bearer " + "s" * 32}
    with TestClient(create_app("s" * 32)) as client:
        info = client.post(
            "/project", json={"path": str(tmp_path / "api"), "create": True}, headers=headers
        ).json()
        body = request()
        assert client.post("/studies/plan", json=body.model_dump()).status_code == 401
        assert (
            client.post(
                "/studies",
                json={"session_id": "0" * 32, "study": body.model_dump()},
                headers=headers,
            ).status_code
            == 409
        )
        start = client.post(
            "/studies",
            json={"session_id": info["session_id"], "study": body.model_dump()},
            headers=headers,
        )
        assert start.status_code == 200, start.text
        id = start.json()["study_id"]
        end = time.monotonic() + 20
        while time.monotonic() < end:
            data = client.get(f"/studies/{id}", headers=headers).json()
            if data["status"] == "complete":
                break
            time.sleep(0.02)
        assert data["status"] == "complete", data.get("error")
        target = tmp_path / "study.json"
        assert (
            client.post(
                f"/studies/{id}/export",
                json={"path": str(target), "format": "json"},
                headers=headers,
            ).status_code
            == 200
        )
        assert json.loads(target.read_text())["completed"] == 2
        assert client.get("/studies/not-a-uuid", headers=headers).status_code == 422
        assert (
            client.get(
                "/studies/" + "0" * 8 + "-0000-0000-0000-" + "0" * 12, headers=headers
            ).status_code
            == 400
        )


def test_cancel_resume_reuses_only_completed_runs_and_recovers_journal(tmp_path):
    import threading

    from pamstudio.studies import write_record

    project = Project(tmp_path / "resume", create=True)
    jobs, entered, release = Jobs(), threading.Event(), threading.Event()
    studies = Studies(jobs)
    original = jobs.start
    calls = 0

    def controlled(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            entered.set()
            assert release.wait(10)
            if jobs.study_stop.is_set():
                raise InterruptedError("Study cancelled before next case")
        return original(*args, **kwargs)

    jobs.start = controlled
    try:
        body = request()
        id = studies.start(project, body)["study_id"]
        assert entered.wait(10)
        jobs.cancel()
        release.set()
        end = time.monotonic() + 10
        while jobs.study_id and time.monotonic() < end:
            time.sleep(0.01)
        interrupted = studies.read(project, id)
        assert interrupted["status"] == "interrupted" and interrupted["completed"] == 1
        first = interrupted["cases"][0]["run_id"]
        sha = digest(project.file(first))
        jobs.start = original
        resumed = wait(studies, project, studies.start(project, body, interrupted)["study_id"])
        assert resumed["id"] != id and resumed["parent_study_id"] == id
        assert resumed["cases"][0]["run_id"] == first and digest(project.file(first)) == sha
        assert len(project.runs()) == 2
        resumed["status"] = "running"
        write_record(project, resumed)
        assert studies.read(project, resumed["id"])["status"] == "interrupted"
        resumed["status"] = "interrupted"
        resumed["environment"]["engine_source_sha256"] = "0" * 64
        with pytest.raises(ValueError, match="Engine source changed"):
            studies.start(project, body, resumed)
    finally:
        release.set()
        studies.shutdown()
        jobs.shutdown()
