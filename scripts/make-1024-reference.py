"""Generate a real 1024-channel reference without replacing earlier fixtures."""
import json
import time
from pathlib import Path
from uuid import uuid4

from pamstudio.cli import demo
from pamstudio.exporting import export_bundle, verify_folder
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config

root = Path(__file__).resolve().parents[1]
target = root / "examples/array_1024ch"
if (target / "bundle").exists() or (target / "experiment.zip").exists():
    raise SystemExit("Existing 1024-channel fixture preserved; choose a new directory/version.")
target.mkdir(parents=True, exist_ok=True)
cfg = Config(channels=1024, pitch_m=.00005, grid_n=17, sampling_hz=10e6,
             gate_stride=2, gate_start_s=6e-6, gate_end_s=10e-6, snr_db=None)
options = ReconstructionOptions(methods=["das","tea","cf","rcb","atp"], atp_timing_known=True, rcb_subarray=4)
started = time.perf_counter()
project, run_id, result = demo(root / ".local" / ("reference-1024-v05-" + uuid4().hex[:8]), cfg, options)
run = project.run(run_id)
exported = export_bundle(project, run_id, target / "experiment.zip", True)
verify_folder(exported["folder_path"])
Path(exported["folder_path"]).rename(target / "bundle")
benchmark = {"run_id":run_id,"zip_sha256":exported["sha256"],"total_generation_wall_s":time.perf_counter()-started,
             "rf_shape":[1,cfg.samples,cfg.channels],"preview_shape":[512,1024],
             "environment":run["provenance"],"reconstruction":run["metrics"],"warnings":run["warnings"]}
(target / "BENCHMARK.json").write_text(json.dumps(benchmark,indent=2)+"\n",encoding="utf-8")
print(json.dumps({k:v for k,v in benchmark.items() if k!="environment"},indent=2))
