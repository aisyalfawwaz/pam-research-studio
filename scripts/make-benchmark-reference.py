"""Freeze real five-method scores for full/alternate receive apertures on identical RF."""

import json
import time
from pathlib import Path
from uuid import uuid4

from pamstudio.benchmark import benchmark_run, compare_reports, report_csv
from pamstudio.cli import demo
from pamstudio.exporting import export_bundle, verify_folder
from pamstudio.jobs import Jobs
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config

root = Path(__file__).resolve().parents[1]
target = root / "examples/pam_benchmark"
if target.exists():
    raise SystemExit("Existing benchmark evidence preserved; choose a new directory/version")
target.mkdir(parents=True)
cfg = Config(grid_n=129, snr_db=20)
options = ReconstructionOptions(methods=["das", "tea", "cf", "rcb", "atp"], atp_timing_known=True)
project, full_id, _ = demo(root / ".local" / ("pam-benchmark-v07-" + uuid4().hex[:8]), cfg, options)
half = cfg.model_copy(update={"active_channels": list(range(0, 64, 2))})
jobs = Jobs()
try:
    accepted = jobs.reconstruct(project, full_id, options, half)
    while jobs.busy():
        time.sleep(0.1)
    if jobs.snapshot()["status"] != "complete":
        raise RuntimeError(jobs.snapshot())
    project.draft(half)
    reports, packages = [], {}
    for label, run_id in [("full_aperture", full_id), ("alternate_aperture", accepted["run_id"])]:
        folder = target / label
        folder.mkdir()
        exported = export_bundle(project, run_id, folder / "experiment.zip", True)
        verify_folder(exported["folder_path"])
        Path(exported["folder_path"]).rename(folder / "bundle")
        reports.append(benchmark_run(project, run_id))
        packages[label] = {"run_id": run_id, "sha256": exported["sha256"]}
    comparison = {"reports": reports, "comparison": compare_reports(*reports)}
    (target / "comparison.json").write_text(
        json.dumps(comparison, indent=2) + "\n", encoding="utf-8"
    )
    (target / "comparison.csv").write_text(report_csv(reports), encoding="utf-8")
    benchmark = {
        "project": str(project.path),
        "packages": packages,
        "scenario": "Same raw RF; 64 versus 32 alternating active channels; fixed 2 mm truth disks and 100 linear histogram bins",
        "comparison": comparison["comparison"],
    }
    (target / "BENCHMARK.json").write_text(json.dumps(benchmark, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(benchmark, indent=2))
finally:
    jobs.shutdown()
