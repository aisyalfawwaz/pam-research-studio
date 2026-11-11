import copy
import csv
import io
import json
import time

import pytest
from fastapi.testclient import TestClient
from pamstudio.benchmark import BenchmarkSettings, benchmark_run, compare_reports, report_csv
from pamstudio.cli import demo
from pamstudio.jobs import Jobs
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config
from pamstudio.server import create_app
from pamstudio.workflow import coupled_template


def test_stale_autosaves_cannot_cross_project_sessions(tmp_path):
    token = {"Authorization": "Bearer " + "r" * 32}
    with TestClient(create_app("r" * 32)) as client:

        def open_project(name):
            result = client.post(
                "/project",
                headers=token,
                json={
                    "path": str(tmp_path / name),
                    "create": not (tmp_path / name / "project.sqlite").exists(),
                },
            )
            assert result.status_code == 200, result.text
            return result.json()

        a = open_project("a")
        b = open_project("b")
        assert a["session_id"] != b["session_id"] and a["project_id"] != b["project_id"]
        changed = Config(seed=123).model_dump()
        stale = client.put(
            "/draft", headers=token, json={"session_id": a["session_id"], "config": changed}
        )
        assert stale.status_code == 409
        assert client.get("/project", headers=token).json()["draft"]["seed"] == 42
        graph, _, _ = coupled_template()
        stale = client.put(
            "/workflow",
            headers=token,
            json={"session_id": a["session_id"], "workflow": graph.model_dump()},
        )
        assert stale.status_code == 409 and client.get("/workflow", headers=token).json() is None
        assert (
            client.put(
                "/draft", headers=token, json={"session_id": b["session_id"], "config": changed}
            ).status_code
            == 200
        )
        again = open_project("a")
        assert again["project_id"] == a["project_id"] and again["session_id"] != a["session_id"]
        assert (
            client.put(
                "/draft", headers=token, json={"session_id": a["session_id"], "config": changed}
            ).status_code
            == 409
        )


def test_exact_scenario_differences_deltas_and_report_exports(tmp_path):
    cfg = Config(grid_n=33)
    options = ReconstructionOptions(methods=["das", "tea"])
    project, full, _ = demo(tmp_path / "source", cfg, options)
    jobs = Jobs()
    try:
        accepted = jobs.reconstruct(
            project,
            full,
            options,
            cfg.model_copy(update={"active_channels": list(range(0, 64, 2))}),
        )
        deadline = time.monotonic() + 20
        while jobs.busy() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert jobs.snapshot()["status"] == "complete", jobs.snapshot()
        current, reference = [benchmark_run(project, id) for id in (accepted["run_id"], full)]
        comparison = compare_reports(current, reference)
        assert comparison["differences"] == ["analysis"]
        detail = next(d for d in comparison["details"] if d["field"] == "analysis.active_channels")
        assert detail["current"] == list(range(0, 64, 2)) and detail["reference"] is None
        assert comparison["deltas"]["das"]["gcnr"] == pytest.approx(
            current["methods"]["das"]["gcnr"] - reference["methods"]["das"]["gcnr"]
        )
        missing = copy.deepcopy(current)
        missing["methods"]["das"]["gcnr"] = None
        assert compare_reports(missing, reference)["deltas"]["das"]["gcnr"] is None
        rows = list(csv.DictReader(io.StringIO(report_csv([current, reference]))))
        assert rows[0]["role"] == "current" and rows[0]["pair_matched"] == "False"
        assert float(rows[0]["delta_gcnr"]) == pytest.approx(
            comparison["deltas"][rows[0]["method"]]["gcnr"]
        )
        assert rows[-1]["delta_gcnr"] == "" and rows[-1]["role"] == "reference"
        headers = {"Authorization": "Bearer " + "s" * 32}
        with TestClient(create_app("s" * 32)) as client:
            client.post("/project", headers=headers, json={"path": str(project.path)})
            body = {
                "run_ids": [accepted["run_id"], full],
                "settings": BenchmarkSettings().model_dump(),
            }
            result = client.post("/benchmarks/evaluate", headers=headers, json=body)
            assert result.status_code == 200, result.text
            assert result.json()["comparison"] == comparison
            assert (
                client.post(
                    "/benchmarks/evaluate", headers=headers, json={**body, "run_ids": [full, full]}
                ).status_code
                == 400
            )
            assert client.post("/benchmarks/evaluate", json=body).status_code == 401
            output = tmp_path / "comparison.json"
            assert (
                client.post(
                    "/benchmark-export",
                    headers=headers,
                    json={**body, "path": str(output), "format": "json"},
                ).status_code
                == 200
            )
            assert json.loads(output.read_text())["comparison"] == comparison
    finally:
        jobs.shutdown()
