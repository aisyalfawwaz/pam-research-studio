"""Freeze a real coupled, two-array workflow; never overwrite earlier evidence."""
import json
import time
from pathlib import Path
from uuid import uuid4

import h5py

from pamstudio.exporting import export_bundle, verify_folder
from pamstudio.jobs import Jobs
from pamstudio.storage import Project
from pamstudio.workflow import WorkflowRequest, compile_graph, coupled_template

root = Path(__file__).resolve().parents[1]
target = root / "examples/coupled_arrays"
if (target / "bundle").exists() or (target / "experiment.zip").exists():
    raise SystemExit("Existing coupled fixture preserved; choose a new directory/version.")
target.mkdir(parents=True, exist_ok=True)
graph, draft, raw_options = coupled_template()
graph.analysis = raw_options
cfg, options, _ = compile_graph(WorkflowRequest(workflow=graph, config=draft.model_dump(), options=raw_options))
project = Project(root / ".local" / ("reference-coupled-v04-" + uuid4().hex[:8]), "Coupled two-array reference", create=True)
project.draft(cfg)
(project.path / "workflow.json").write_text(graph.model_dump_json(indent=2), encoding="utf-8")
jobs = Jobs()
started = time.perf_counter()
try:
    accepted = jobs.start(project, cfg, options=options, workflow=graph.model_dump())
    while jobs.busy():
        time.sleep(.1)
    if jobs.snapshot()["status"] != "complete":
        raise RuntimeError(jobs.snapshot())
    elapsed = time.perf_counter() - started
    run = project.run(accepted["run_id"])
    exported = export_bundle(project, run["id"], target / "experiment.zip", True)
    verify_folder(exported["folder_path"])
    Path(exported["folder_path"]).rename(target / "bundle")
    with h5py.File(project.file(run["id"]), "r") as stored:
        shapes = {key: list(stored[key].shape) for key in ("rf", "bubble/trajectory", "coupling/volume_flow", "wave/pressure", "wave/time_s")}
    benchmark = {"run_id": run["id"], "zip_sha256": exported["sha256"], "end_to_end_wall_s": elapsed,
                 "array_shapes": shapes, "environment": run["provenance"], "reconstruction": run["metrics"], "warnings": run["warnings"]}
    (target / "BENCHMARK.json").write_text(json.dumps(benchmark, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k,v in benchmark.items() if k != "environment"}, indent=2))
finally:
    jobs.shutdown()
