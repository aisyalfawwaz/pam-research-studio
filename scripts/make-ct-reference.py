"""Manual, user-requested public-anatomy demonstration; never an automated test.

Only the bundled, attributed, metadata-minimized slice is read. Acoustic drive
and receivers are synthetic. Preserve existing evidence instead of overwriting.
"""

import argparse
import json
import sys
import time
from pathlib import Path
from uuid import uuid4

import h5py
import numpy as np
from pamstudio.ct import public_example, template
from pamstudio.exporting import export_bundle, verify_folder
from pamstudio.jobs import Jobs
from pamstudio.storage import Project
from pamstudio.workflow import WorkflowRequest, compile_graph

sys.stdout.reconfigure(encoding="utf-8")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--whole", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
name = "ct_head_slice" if args.whole else "ct_skull_patch"
target = root / "examples" / name
if target.exists():
    raise SystemExit("Existing reference preserved; choose a new directory/version")
target.mkdir(parents=True)
project = Project(
    root / ".local" / (name + "-v06-" + uuid4().hex[:8]),
    "Public CT / water comparison",
    create=True,
)
body = template(public_example(project), whole=args.whole)
job = Jobs()
records = {}
try:
    for label, contrast in [("water", False), ("ct", True)]:
        body["config"]["ct"]["contrast"] = contrast
        request = WorkflowRequest(**{k: body[k] for k in ("workflow", "config", "options")})
        cfg, options, plan = compile_graph(request)
        project.draft(cfg)
        (project.path / "workflow.json").write_text(
            request.workflow.model_dump_json(indent=2), encoding="utf-8"
        )
        started = time.perf_counter()
        accepted = job.start(project, cfg, options=options, workflow=body["workflow"])
        previous = ""
        while job.busy():
            stage = job.snapshot()["stage"]
            if stage != previous:
                print(label, stage, flush=True)
                previous = stage
            time.sleep(0.5)
        if job.snapshot()["status"] != "complete":
            raise RuntimeError(job.snapshot())
        record = project.run(accepted["run_id"])
        folder = target / label
        folder.mkdir()
        exported = export_bundle(project, record["id"], folder / "experiment.zip", True)
        verify_folder(exported["folder_path"])
        Path(exported["folder_path"]).rename(folder / "bundle")
        records[label] = {
            "run_id": record["id"],
            "zip_sha256": exported["sha256"],
            "wall_s": time.perf_counter() - started,
            "metrics": record["metrics"],
            "warnings": record["warnings"],
            "provenance": record["provenance"],
        }
    with (
        h5py.File(project.file(records["water"]["run_id"]), "r") as water,
        h5py.File(project.file(records["ct"]["run_id"]), "r") as skull,
    ):
        a, b = water["rf"][:], skull["rf"][:]
        difference = {
            "relative_rf_l2_difference": float(np.linalg.norm(b - a) / np.linalg.norm(a)),
            "water_rf_rms": float(np.sqrt(np.mean(a * a))),
            "ct_rf_rms": float(np.sqrt(np.mean(b * b))),
            "rf_shape": list(a.shape),
            "medium_shape_zx": list(skull["medium/sound_speed_m_s"].shape),
        }
    summary = {
        "manual_public_anatomy_demo": True,
        "project": str(project.path),
        "comparison": difference,
        "runs": records,
    }
    (target / "BENCHMARK.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "project": str(project.path),
                **difference,
                "hashes": {k: v["zip_sha256"] for k, v in records.items()},
            },
            indent=2,
        )
    )
finally:
    job.shutdown()
