"""Generate real synthetic v0.10 research fixtures; preserve existing examples."""

import json
import time
from pathlib import Path
from uuid import uuid4

from pamstudio.exporting import export_bundle, verify_folder
from pamstudio.jobs import Jobs
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import BubbleSettings, Config, Source
from pamstudio.reporting import export_pdf
from pamstudio.storage import Project, digest
from pamstudio.studies import Axis, Studies, StudyRequest, study_csv
from pamstudio.workflow import coupled_template


def wait(jobs, timeout=180):
    end = time.monotonic() + timeout
    while jobs.busy() and time.monotonic() < end:
        time.sleep(0.05)
    if jobs.busy() or jobs.snapshot()["status"] != "complete":
        raise RuntimeError(jobs.snapshot())


root = Path(__file__).resolve().parents[1]
output = root / "examples" / "research_refinements"
output.mkdir(exist_ok=True)
if (output / "evidence.json").exists():
    raise RuntimeError("Frozen evidence exists; choose a new output rather than rewriting it")
destination = root / ".local" / ("research-v010-" + uuid4().hex[:8])
project = Project(destination, "Research studies and heterogeneous bubbles", create=True)
jobs = Jobs()
studies = Studies(jobs)
cfg = Config(channels=32, grid_n=65)
options = ReconstructionOptions(methods=["das", "tea", "cf"])
inventory = {"project": str(destination), "studies": {}, "runs": {}}
try:
    requests = [
        StudyRequest(
            name="SNR and source position",
            config=cfg,
            options=options,
            axes=[
                Axis(parameter="snr_db", values=[10, 30]),
                Axis(parameter="source.x_m", values=[-0.003, 0.003]),
            ],
        ),
        StudyRequest(
            name="Noise-free grid refinement",
            kind="convergence",
            config=cfg,
            options=options,
            axes=[Axis(parameter="grid_n", values=[33, 49, 65])],
        ),
        StudyRequest(
            name="Nominal versus actual calibration",
            kind="uncertainty",
            config=cfg,
            options=options,
            trials=16,
            speed_sigma_m_s=15,
            sensor_sigma_m=0.00004,
            seed=2026,
        ),
    ]
    for request in requests:
        accepted = studies.start(project, request)
        wait(jobs)
        record = studies.read(project, accepted["study_id"])
        if record["status"] != "complete":
            raise RuntimeError(record.get("error"))
        label = request.kind
        (output / f"{label}.json").write_text(
            json.dumps(record, indent=2, allow_nan=False), encoding="utf-8"
        )
        (output / f"{label}.csv").write_text(study_csv(record), encoding="utf-8")
        export_pdf(project, output / f"{label}.pdf", study=record)
        inventory["studies"][label] = record["id"]
        print(label, record["status"], record["completed"], flush=True)
    _, coupled, _ = coupled_template()
    raw = coupled.model_dump()
    raw.update(channels=16, arrays=None, grid_n=33, snr_db=None)
    raw["sources"] = [
        Source(x_m=-0.002, z_m=0.012).model_dump(),
        Source(
            x_m=0.002,
            z_m=0.014,
            bubble=BubbleSettings(model="free", radius_m=1.5e-6, drive_pa=15e3, ringdown_cycles=3),
        ).model_dump(),
    ]
    coupled = Config.model_validate(raw)
    accepted = jobs.start(
        project, coupled, options=ReconstructionOptions(methods=["das", "tea", "cf"])
    )
    wait(jobs)
    run = accepted["run_id"]
    bundle = export_bundle(project, run, output / "population-experiment.zip", True)
    verify_folder(bundle["folder_path"])
    export_pdf(project, output / "population.pdf", run_id=run)
    inventory["runs"]["coupled_population"] = run
    # One portable uncertainty case retains actual and assumed calibration in the bundle.
    trial = studies.read(project, inventory["studies"]["uncertainty"])["cases"][0]["run_id"]
    trial_bundle = export_bundle(project, trial, output / "uncertainty-experiment.zip", True)
    verify_folder(trial_bundle["folder_path"])
    inventory["runs"]["uncertainty_trial"] = trial
    project.draft(coupled)
    inventory["files"] = {
        str(p.relative_to(output)): digest(p) for p in sorted(output.rglob("*")) if p.is_file()
    }
    (output / "evidence.json").write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    (root / ".local" / "research-evidence.json").write_text(
        json.dumps(inventory, indent=2) + "\n", encoding="utf-8"
    )
    print("Evidence:", output, "Project:", destination, flush=True)
finally:
    studies.shutdown()
    jobs.shutdown()
