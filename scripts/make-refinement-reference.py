"""Re-evaluate/repackage immutable v0.7 scientific results with benchmark 1.1 reports.

The original RF, maps, timings and environment are retained, not relabelled as
new simulations. This also exercises import of old report schemas.
"""

import json
from pathlib import Path
from uuid import uuid4

from pamstudio.benchmark import benchmark_run, compare_reports, report_csv
from pamstudio.exporting import export_bundle, import_bundle, verify_folder
from pamstudio.models import Config
from pamstudio.storage import Project

root = Path(__file__).resolve().parents[1]
target = root / "examples/workspace_refinements"
if target.exists():
    raise SystemExit("Existing refinement evidence preserved; choose a new directory/version")
target.mkdir(parents=True)
project = Project(
    root / ".local" / ("workspace-refinements-v08-" + uuid4().hex[:8]),
    "Saved-run evaluation reference",
    create=True,
)
packages = {}
reports = {}
for name in ("full_aperture", "alternate_aperture"):
    record = import_bundle(project, root / "examples/pam_benchmark" / name / "experiment.zip")
    folder = target / name
    folder.mkdir()
    archived = export_bundle(project, record["id"], folder / "experiment.zip", True)
    verify_folder(archived["folder_path"])
    Path(archived["folder_path"]).rename(folder / "bundle")
    reports[name] = benchmark_run(project, record["id"])
    packages[name] = {"run_id": record["id"], "sha256": archived["sha256"]}
project.draft(Config.model_validate(record["config"]))
ordered = [reports["alternate_aperture"], reports["full_aperture"]]
comparison = {"reports": ordered, "comparison": compare_reports(*ordered)}
(target / "comparison.json").write_text(json.dumps(comparison, indent=2) + "\n", encoding="utf-8")
(target / "comparison.csv").write_text(report_csv(ordered), encoding="utf-8")
evidence = {
    "project": str(project.path),
    "packages": packages,
    "metric_version": ordered[0]["version"],
    "source": "Imported v0.7 RF and maps; original scientific provenance/runtime retained; new read-only benchmark 1.1 context/deltas",
    "comparison": comparison["comparison"],
}
(target / "BENCHMARK.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
print(json.dumps({k: v for k, v in evidence.items() if k != "comparison"}, indent=2))
