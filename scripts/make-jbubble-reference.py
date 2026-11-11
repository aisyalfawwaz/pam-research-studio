"""Generate the real default 64-channel jbubble example without overwriting data."""
import json
from pathlib import Path
from uuid import uuid4

from pamstudio.cli import demo
from pamstudio.exporting import export_bundle
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import BubbleSettings, Config

root = Path(__file__).resolve().parents[1]
target = root / "examples/jbubble_64ch"
if (target / "bundle").exists() or (target / "experiment.zip").exists():
    raise SystemExit("Existing jbubble fixture preserved; choose a new directory/version.")
target.mkdir(parents=True, exist_ok=True)
cfg = Config(bubble=BubbleSettings(), spreading=True, gate_stride=1, gate_end_s=18e-6)
options = ReconstructionOptions(methods=["das", "tea", "cf", "rcb", "atp"], atp_timing_known=True)
project, run_id, result = demo(root / ".local" / ("reference-jbubble-v03-" + uuid4().hex[:8]), cfg, options)
run = project.run(run_id)
exported = export_bundle(project, run_id, target / "experiment.zip", True)
Path(exported["folder_path"]).rename(target / "bundle")
benchmark = {"run_id": run_id, "zip_sha256": exported["sha256"], "environment": run["provenance"],
             "reconstruction": run["metrics"], "warnings": run["warnings"]}
(target / "BENCHMARK.json").write_text(json.dumps(benchmark, indent=2)+"\n", encoding="utf-8")
print(json.dumps({"run_id": run_id, "zip_sha256": exported["sha256"], "simulation": run["provenance"]["simulation"], "metrics": result.metrics}, indent=2))
