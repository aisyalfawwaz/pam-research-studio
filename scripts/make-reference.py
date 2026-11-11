"""Create the committed-size numerical example in a fresh destination."""
import json
from pathlib import Path

from pamstudio.cli import demo
from pamstudio.exporting import export_bundle

root = Path(__file__).resolve().parents[1]
project, run_id, result = demo(root / '.local' / 'final-reference-project')
target = root / 'examples' / 'point_source_64ch'
bundle = export_bundle(project, run_id, target / 'experiment.zip', include_raw=True)
folder = Path(bundle['folder_path'])
stable = target / 'bundle'
if stable.exists():
    raise SystemExit('Reference bundle directory already exists; preserve it and choose a new destination.')
folder.rename(stable)
print(json.dumps({'bundle': str(stable), 'zip_sha256': bundle['sha256'], 'runtime_ms': result.runtime_ms,
                  'metrics': result.metrics}, indent=2))
