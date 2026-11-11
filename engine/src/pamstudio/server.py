import asyncio
import json
import os
import secrets
import socket
import sys
import threading
from contextlib import asynccontextmanager
from enum import Enum
from typing import Literal
from uuid import UUID

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request, Response
from pydantic import Field

from . import __version__
from .benchmark import BenchmarkSettings, benchmark_run, compare_reports, report_csv
from .jobs import Jobs
from .methods import METHODS, ReconstructRequest
from .models import (
    BundleRequest,
    Config,
    ExportRequest,
    ProjectRequest,
    RunRequest,
    StrictModel,
)
from .storage import Project
from .studies import Studies, StudyRequest, plan_study, study_csv


class ArrayKind(str, Enum):
    ct_mask = "ct_mask"
    rf_processed = "rf_processed"
    trace_processed = "trace_processed"
    spectrum_processed = "spectrum_processed"
    dsp_response = "dsp_response"
    wave = "wave"
    wave_time = "wave_time"
    bubble = "bubble"
    rf = "rf"
    trace = "trace"
    spectrum = "spectrum"
    das = "das"
    tea = "tea"
    cf = "cf"
    rcb = "rcb"
    atp = "atp"
    difference = "difference"


def create_app(token: str):
    jobs = Jobs()
    studies = Studies(jobs)
    state = {"binding": None}

    @asynccontextmanager
    async def lifespan(app):
        yield
        await asyncio.to_thread(studies.shutdown)
        await asyncio.to_thread(jobs.shutdown)

    app = FastAPI(
        title="PAM Research Studio",
        version=__version__,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
    )
    app.state.jobs = jobs

    @app.middleware("http")
    async def authenticate(request: Request, call_next):
        auth = request.headers.get("authorization", "")
        # No CORS. Renderer never receives bearer token or accesses HTTP directly.
        if not secrets.compare_digest(auth, "Bearer " + token):
            return Response(status_code=401)
        if request.headers.get("origin"):
            return Response(status_code=403)
        if int(request.headers.get("content-length", "0")) > 65536:
            return Response(status_code=413)
        return await call_next(request)

    @app.exception_handler(ValueError)
    async def invalid(request, error):
        return Response(
            json.dumps({"detail": str(error)}), status_code=400, media_type="application/json"
        )

    def project():
        if state["binding"] is None:
            raise HTTPException(409, "Create or open a project first")
        return state["binding"][0]

    def bound_project(session_id):
        binding = state["binding"]
        if binding is None:
            raise HTTPException(409, "Create or open a project first")
        if session_id is not None and binding[1] != session_id:
            raise HTTPException(
                409, "Project changed; this save belongs to an earlier project session"
            )
        return binding[0]

    @app.get("/health")
    def health():
        return {
            "status": "ready",
            "version": __version__,
            "backend": "numpy-cpu",
            "precision": "float64",
        }

    @app.post("/ct/import")
    def ct_import(body: BundleRequest):
        if jobs.busy():
            raise ValueError("Wait for the active run before importing an anatomy asset")
        from .ct import import_dicom, template

        return template(import_dicom(project(), body.path))

    @app.post("/ct/public")
    def ct_public():
        if jobs.busy():
            raise ValueError("Wait for the active run before loading anatomy")
        from .ct import public_example, template

        return template(public_example(project()))

    @app.post("/ct/phantom")
    def ct_phantom():
        if jobs.busy():
            raise ValueError("Wait for the active run before loading anatomy")
        from .ct import synthetic, template

        return template(synthetic(project()))

    @app.post("/ct/whole")
    def ct_whole(body: Config):
        if jobs.busy() or body.ct is None:
            raise ValueError("Select a CT asset and wait for the active run")
        from .ct import read_asset, template

        data = read_asset(project(), body.ct)
        asset = {
            k: getattr(body.ct, k)
            for k in ("asset_id", "rows", "columns", "spacing_x_m", "spacing_z_m")
        }
        asset["source"] = data["metadata"]["source"]
        return template(asset, whole=True)

    @app.post("/ct/info")
    def ct_info(body: Config):
        if body.ct is None:
            raise ValueError("Select a CT asset first")
        from .ct import read_asset

        return read_asset(project(), body.ct)["metadata"]

    @app.post("/ct/preview")
    def ct_preview(body: Config):
        if body.ct is None:
            raise ValueError("Select a CT asset first")
        import numpy as np

        from .ct import read_asset

        hu = read_asset(project(), body.ct)["hu"]
        stride = max(1, int(np.ceil(max(hu.shape) / 512)))
        value = hu[::stride, ::stride].astype("<f4")
        return Response(
            value.tobytes(),
            media_type="application/octet-stream",
            headers={"X-Array-Shape": json.dumps(list(value.shape)), "X-Array-Dtype": "float32-le"},
        )

    @app.get("/demo")
    def demo():
        return Config().model_dump()

    @app.get("/methods")
    def methods():
        return METHODS

    @app.get("/backends")
    def backends():
        from .jbubble_adapter import availability as bubble_availability
        from .jwave_adapter import availability

        return [
            {
                "id": "analytic",
                "ready": True,
                "version": __version__,
                "compute": "numpy-cpu",
                "precision": "float64",
                "message": "Homogeneous straight-ray reference",
            },
            availability(),
            bubble_availability(),
        ]

    @app.post("/project")
    def open_project(body: ProjectRequest):
        if jobs.busy():
            raise ValueError("Cancel the current job before switching projects")
        binding = (Project(body.path, body.name, body.create), secrets.token_hex(16))
        state["binding"] = binding
        return binding[0].info() | {"session_id": binding[1]}

    @app.get("/project")
    def info():
        project()
        binding = state["binding"]
        return binding[0].info() | {"session_id": binding[1]}

    class DraftSave(RunRequest):
        session_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")

    @app.put("/draft")
    def draft(body: DraftSave):
        bound_project(body.session_id).draft(body.config)
        return {"saved": True, "warnings": body.config.warnings()}

    @app.post("/simulate")
    def simulate(body: RunRequest):
        return jobs.start(project(), body.config)

    @app.post("/reconstruct")
    def reconstruct(body: ReconstructRequest):
        return jobs.reconstruct(project(), body.input_run_id, body.options, body.config)

    @app.get("/job")
    def job():
        return jobs.snapshot()

    @app.get("/live")
    def live():
        return jobs.live()

    @app.get("/workflow")
    def workflow():
        target = project().path / "workflow.json"
        if not target.is_file():
            return None
        if target.stat().st_size > 65536:
            raise ValueError("Workflow document exceeds 64 KiB")
        return Workflow.model_validate_json(target.read_text(encoding="utf-8")).model_dump()

    from .workflow import Workflow, WorkflowRequest, compile_graph

    class WorkflowSave(StrictModel):
        session_id: str = Field(pattern=r"^[a-f0-9]{32}$")
        workflow: Workflow

    @app.put("/workflow")
    def save_workflow(body: Workflow | WorkflowSave):
        if jobs.busy():
            raise ValueError("Wait for the current run before changing its workflow")
        target_project = bound_project(body.session_id if isinstance(body, WorkflowSave) else None)
        workflow = body.workflow if isinstance(body, WorkflowSave) else body
        target = target_project.path / "workflow.json"
        temporary = target.with_suffix(".tmp")
        temporary.write_text(workflow.model_dump_json(), encoding="utf-8")
        os.replace(temporary, target)
        return {"saved": True}

    @app.post("/workflow/validate")
    def validate_workflow(body: WorkflowRequest):
        _, _, plan = compile_graph(body)
        return plan

    @app.post("/workflow/run")
    def run_workflow(body: WorkflowRequest):
        cfg, options, _ = compile_graph(body)
        return jobs.start(project(), cfg, options=options, workflow=body.workflow.model_dump())

    @app.post("/cancel")
    def cancel():
        return jobs.cancel()

    @app.post("/studies/plan")
    def plan_research(body: StudyRequest):
        return plan_study(body)[1]

    class StudyLaunch(StrictModel):
        session_id: str = Field(pattern=r"^[a-f0-9]{32}$")
        study: StudyRequest

    class StudyResume(StrictModel):
        session_id: str = Field(pattern=r"^[a-f0-9]{32}$")

    @app.post("/studies")
    def start_study(body: StudyLaunch):
        return studies.start(bound_project(body.session_id), body.study)

    @app.get("/studies")
    def list_studies():
        return studies.list(project())

    @app.get("/studies/{study_id}")
    def read_study(study_id: UUID):
        return studies.read(project(), study_id)

    @app.post("/studies/{study_id}/resume")
    def resume_study(study_id: UUID, body: StudyResume):
        target = bound_project(body.session_id)
        record = studies.read(target, study_id)
        return studies.start(target, StudyRequest.model_validate(record["request"]), record)

    class StudyExport(StrictModel):
        path: str = Field(min_length=1, max_length=4096)
        format: Literal["csv", "json"]

    @app.post("/studies/{study_id}/export")
    def export_study(study_id: UUID, body: StudyExport):
        from pathlib import Path

        record = studies.read(project(), study_id)
        if record["status"] in ("running", "cancelling"):
            raise ValueError("Finish or stop the study before exporting its frozen report")
        target = Path(body.path)
        if target.suffix.lower() != "." + body.format:
            raise ValueError("Study filename must match its format")
        value = (
            study_csv(record)
            if body.format == "csv"
            else json.dumps(record, indent=2, allow_nan=False)
        )
        temp = target.with_name(target.name + "." + secrets.token_hex(8) + ".tmp")
        try:
            temp.write_text(value, encoding="utf-8")
            os.replace(temp, target)
        finally:
            temp.unlink(missing_ok=True)
        return {"path": str(target)}

    class ReportRequest(StrictModel):
        path: str = Field(min_length=1, max_length=4096)
        settings: BenchmarkSettings | None = None

    @app.get("/runs/{run_id}/presentation-context")
    def presentation(run_id: UUID):
        from .reporting import presentation_context

        return presentation_context(project(), str(run_id))

    @app.post("/runs/{run_id}/report")
    def run_report(run_id: UUID, body: ReportRequest):
        if jobs.busy():
            raise ValueError("Wait for the scientific job/study before exporting a report")
        from .reporting import export_pdf

        return export_pdf(project(), body.path, run_id=str(run_id), settings=body.settings)

    @app.post("/studies/{study_id}/report")
    def study_report(study_id: UUID, body: ReportRequest):
        if jobs.busy():
            raise ValueError("Wait for the scientific job/study before exporting a report")
        from .reporting import export_pdf

        if body.settings is not None:
            raise ValueError("Study reports use their frozen evaluation settings")

        return export_pdf(project(), body.path, study=studies.read(project(), study_id))

    @app.get("/runs")
    def runs():
        return project().runs()

    @app.get("/runs/{run_id}")
    def run(run_id: UUID):
        return project().run(str(run_id))

    @app.get("/runs/{run_id}/arrays/{kind}")
    def array(run_id: UUID, kind: ArrayKind, channel: int = Query(default=0, ge=0, le=1023)):
        value = project().array(str(run_id), kind.value, channel)
        return Response(
            value.tobytes(),
            media_type="application/octet-stream",
            headers={"X-Array-Shape": json.dumps(list(value.shape)), "X-Array-Dtype": "float32-le"},
        )

    @app.post("/runs/{run_id}/benchmark")
    def benchmark(run_id: UUID, body: BenchmarkSettings):
        return benchmark_run(project(), str(run_id), body)

    class BenchmarkEvaluation(StrictModel):
        run_ids: list[UUID] = Field(min_length=1, max_length=2)
        settings: BenchmarkSettings = Field(default_factory=BenchmarkSettings)

    @app.post("/benchmarks/evaluate")
    def evaluate_benchmarks(body: BenchmarkEvaluation):
        if len(set(body.run_ids)) != len(body.run_ids):
            raise ValueError("Choose distinct current and reference runs")
        reports = [benchmark_run(project(), str(run_id), body.settings) for run_id in body.run_ids]
        return {
            "reports": reports,
            "comparison": compare_reports(*reports) if len(reports) == 2 else None,
        }

    class BenchmarkExport(BenchmarkEvaluation):
        path: str = Field(min_length=1, max_length=4096)
        format: Literal["csv", "json"]

    @app.post("/benchmark-export")
    def export_benchmark(body: BenchmarkExport):
        from pathlib import Path

        evaluation = evaluate_benchmarks(body)
        reports, comparison = evaluation["reports"], evaluation["comparison"]
        target = Path(body.path)
        if target.suffix.lower() != "." + body.format:
            raise ValueError("Benchmark filename must match the selected CSV/JSON format")
        content = (
            report_csv(reports)
            if body.format == "csv"
            else json.dumps(
                {"reports": reports, "comparison": comparison}, indent=2, allow_nan=False
            )
        )
        temporary = target.with_name(target.name + "." + secrets.token_hex(8) + ".tmp")
        try:
            temporary.write_text(content, encoding="utf-8")
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
        return {"path": str(target)}

    @app.post("/runs/{run_id}/export")
    def export(run_id: UUID, body: ExportRequest):
        from .exporting import export_bundle

        if jobs.busy():
            raise ValueError("Wait for the scientific job before export")
        return export_bundle(project(), str(run_id), body.path, body.include_raw)

    @app.post("/import")
    def import_experiment(body: BundleRequest):
        from .exporting import import_bundle

        if jobs.busy():
            raise ValueError("Wait for the scientific job before import")
        return import_bundle(project(), body.path)

    @app.post("/runs/{run_id}/rf-export")
    def export_rf(
        run_id: UUID,
        body: ExportRequest,
        channel: int = Query(default=0, ge=0, le=1023),
        signal: Literal["raw", "processed"] = "raw",
    ):
        import shutil
        from pathlib import Path

        import numpy as np

        run = project().run(str(run_id))
        cfg = Config.model_validate(run["config"])
        if channel >= cfg.channels:
            raise ValueError("Channel out of range")
        target = Path(body.path)
        if target.suffix.lower() == ".csv":
            trace = project().array(
                str(run_id), "trace_processed" if signal == "processed" else "trace", channel
            )
            np.savetxt(
                target,
                trace,
                delimiter=",",
                header="time_s,conditioned_amplitude_au"
                if signal == "processed"
                else "time_s,amplitude_au",
                comments="",
            )
        elif target.suffix.lower() == ".h5":
            if not body.include_raw:
                raise ValueError("Raw-data inclusion is required")
            shutil.copyfile(project().file(str(run_id)), target)
        else:
            raise ValueError("Choose .csv for selected channel or .h5 for full arrays")
        return {"path": str(target)}

    return app


def main():
    token = os.environ.pop("PAM_SIDECAR_TOKEN", None)
    if not token or len(token) < 32:
        raise SystemExit("A fresh PAM_SIDECAR_TOKEN with at least 32 characters is required")
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    server = uvicorn.Server(
        uvicorn.Config(create_app(token), log_level="warning", access_log=False)
    )

    def parent_lifecycle():
        # Parent's pipe closes on normal exit or crash. This is not a shell subprocess.
        sys.stdin.buffer.read()
        server.should_exit = True

    threading.Thread(target=parent_lifecycle, daemon=True).start()
    print(json.dumps({"port": listener.getsockname()[1], "protocol": 1}), flush=True)
    server.run(sockets=[listener])


if __name__ == "__main__":
    main()
