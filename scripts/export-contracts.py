"""Run with uv run python scripts/export-contracts.py after changing API/models."""
import json
from pathlib import Path

from pamstudio.models import Config
from pamstudio.methods import ReconstructionOptions, METHODS
from pamstudio.server import create_app
from pamstudio.workflow import coupled_template

target = Path(__file__).resolve().parents[1] / "packages" / "contracts"
target.mkdir(parents=True, exist_ok=True)
workflow,config,options=coupled_template()
def analysis_contract(options):
    return options.model_dump() | {"receive_model":options.receive_model,"ray_step_m":options.ray_step_m}
(target / "coupled-template.json").write_text(json.dumps({"workflow":workflow.model_dump(),"config":config.model_dump(),"options":analysis_contract(options)},indent=2)+"\n",encoding="utf-8")
(target / 'analysis.schema.json').write_text(json.dumps(ReconstructionOptions.model_json_schema(), indent=2)+'\n',encoding='utf-8')
(target / 'analysis.json').write_text(json.dumps(analysis_contract(ReconstructionOptions()),indent=2)+'\n',encoding='utf-8')
(target / 'methods.json').write_text(json.dumps(METHODS,indent=2)+'\n',encoding='utf-8')
(target / "config.schema.json").write_text(json.dumps(Config.model_json_schema(), indent=2) + "\n", encoding="utf-8")
(target / "demo.json").write_text(Config().model_dump_json(indent=2) + "\n", encoding="utf-8")
(target / "openapi.json").write_text(json.dumps(create_app("schema-only").openapi(), indent=2) + "\n", encoding="utf-8")
