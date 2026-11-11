"""Generate the 0.2 five-method fixture without changing the original example."""
import json
from pathlib import Path

from pamstudio.cli import demo
from pamstudio.exporting import export_bundle
from pamstudio.methods import ReconstructionOptions

root=Path(__file__).resolve().parents[1]
destination=root/'examples'/'five_methods_64ch'
stable=destination/'bundle'
if stable.exists():
    raise SystemExit('Preserve the existing fixture before regenerating it.')
options=ReconstructionOptions(methods=['das','tea','cf','rcb','atp'],atp_timing_known=True)
project,run_id,result=demo(root/'.local'/'reference-v02',options=options)
package=export_bundle(project,run_id,destination/'experiment.zip',include_raw=True)
Path(package['folder_path']).rename(stable)
summary={'run_id':run_id,'zip_sha256':package['sha256'],'runtime_ms':result.runtime_ms,
         'metrics':result.metrics,'diagnostics':result.diagnostics}
(destination/'BENCHMARK.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,indent=2))
