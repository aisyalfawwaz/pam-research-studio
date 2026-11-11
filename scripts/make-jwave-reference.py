"""Create a real, reusable 64-channel j-Wave experiment; never overwrite a fixture."""
import json
from pathlib import Path
from uuid import uuid4

import numpy as np
from scipy.signal import hilbert

from pamstudio.cli import demo
from pamstudio.exporting import export_bundle
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config, JWaveSettings
from pamstudio.physics import receivers

root = Path(__file__).resolve().parents[1]
target = root / "examples" / "jwave_64ch"
if (target / "bundle").exists() or (target / "experiment.zip").exists():
    raise SystemExit("Existing j-Wave fixture preserved. Choose a new output directory/version.")
target.mkdir(parents=True, exist_ok=True)
cfg = Config(simulation=JWaveSettings())
options = ReconstructionOptions(methods=["das", "tea", "cf", "rcb", "atp"], atp_timing_known=True)
project, run_id, result = demo(root / ".local" / ("reference-jwave-v03-" + uuid4().hex[:8]), cfg, options)
run = project.run(run_id)
rf = project.read_rf(run_id)
expected = cfg.sources[0].emission_s + np.linalg.norm(receivers(cfg) - [0, 0, .03], axis=1) / cfg.sound_speed_m_s
arrival = abs(hilbert(rf, axis=0)).argmax(axis=0) / cfg.sampling_hz + cfg.capture_t0_s
bundle = export_bundle(project, run_id, target / "experiment.zip", True)
Path(bundle["folder_path"]).rename(target / "bundle")
benchmark = {
    "run_id": run_id, "zip_sha256": bundle["sha256"],
    "environment": run["provenance"], "reconstruction": run["metrics"],
    "arrival_envelope_max_error_s": float(np.max(abs(arrival-expected))),
    "arrival_envelope_rms_error_s": float(np.sqrt(np.mean((arrival-expected)**2))),
    "arrival_note": "Numerical RF envelope peak vs homogeneous nominal distance/c; 2D phase/spreading differ from analytic 3D model.",
}
(target / "BENCHMARK.json").write_text(json.dumps(benchmark, indent=2)+"\n", encoding="utf-8")
print(json.dumps({"run_id": run_id, "zip_sha256": bundle["sha256"], "simulation_ms": run["provenance"]["simulation"]["runtime_ms"], "reconstruction_ms": result.runtime_ms, "max_arrival_error_s": benchmark["arrival_envelope_max_error_s"], "metrics": result.metrics}, indent=2))
