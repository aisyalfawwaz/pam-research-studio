"""Real three-source RF -> maps -> independent peaks -> gated truth matches."""

import json
import time
from pathlib import Path
from uuid import uuid4

from pamstudio.benchmark import BenchmarkSettings, benchmark_run, report_csv
from pamstudio.exporting import export_bundle, verify_folder
from pamstudio.jobs import Jobs
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config, Source
from pamstudio.peaks import PeakSettings
from pamstudio.reporting import export_pdf
from pamstudio.storage import Project, digest

root = Path(__file__).resolve().parents[1]
output = root / "examples" / "multiple_sources"
output.mkdir(exist_ok=True)
if (output / "evidence.json").exists():
    raise RuntimeError("Frozen evidence exists; choose a new output before regenerating")
project = Project(
    root / ".local" / ("multiple-sources-" + uuid4().hex[:8]),
    "Three-source localization",
    create=True,
)
cfg = Config(
    grid_n=97,
    gate_stride=2,
    duration_s=1e-6,
    snr_db=30,
    sources=[
        Source(x_m=-0.006, z_m=0.028),
        Source(x_m=0, z_m=0.035, amplitude=0.6),
        Source(x_m=0.006, z_m=0.025, amplitude=0.3),
    ],
)
options = ReconstructionOptions(
    methods=["das", "tea", "cf", "atp"], atp_timing_known=True, atp_window_s=1e-6
)
project.draft(cfg)
jobs = Jobs()
try:
    accepted = jobs.start(project, cfg, options=options)
    end = time.monotonic() + 120
    while jobs.busy() and time.monotonic() < end:
        time.sleep(0.05)
    if jobs.snapshot()["status"] != "complete":
        raise RuntimeError(jobs.snapshot())
    run = accepted["run_id"]
    before = digest(project.file(run))
    settings = BenchmarkSettings(peaks=PeakSettings(threshold_db=-12, min_separation_m=0.002))
    for name, parameters in [
        ("selected", settings),
        (
            "sensitive",
            BenchmarkSettings(peaks=PeakSettings(threshold_db=-20, min_separation_m=0.002)),
        ),
        (
            "strict_match",
            BenchmarkSettings(
                peaks=PeakSettings(
                    threshold_db=-12, min_separation_m=0.002, match_tolerance_m=0.00005
                )
            ),
        ),
    ]:
        report = benchmark_run(project, run, parameters)
        (output / (name + ".json")).write_text(json.dumps(report, indent=2) + "\n")
        (output / (name + ".csv")).write_text(report_csv([report]))
        print(
            name,
            {
                key: (
                    m["detected_peaks"],
                    m["matched_sources"],
                    m["missed_sources"],
                    m["false_positive_peaks"],
                )
                for key, m in report["methods"].items()
            },
            flush=True,
        )
    selected = json.loads((output / "selected.json").read_text())
    assert (
        selected["methods"]["atp"]["matched_sources"]
        == selected["methods"]["atp"]["detected_peaks"]
        == 3
    )
    bundle = export_bundle(project, run, output / "experiment.zip", True)
    verify_folder(bundle["folder_path"])
    export_pdf(project, output / "localization.pdf", run_id=run, settings=settings)
    assert digest(project.file(run)) == before
    evidence = {
        "project": str(project.path),
        "run_id": run,
        "settings": settings.model_dump(),
        "results_h5_sha256": before,
        "bundle": bundle,
        "files": {
            str(p.relative_to(output)): digest(p) for p in sorted(output.rglob("*")) if p.is_file()
        },
    }
    (output / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    (root / ".local" / "multipeak-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
finally:
    jobs.shutdown()
