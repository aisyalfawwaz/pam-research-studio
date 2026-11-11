"""Execute with the isolated adapter Python, not the primary environment."""
import argparse
import importlib.metadata as metadata
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("adapter", choices=["jwave", "jbubble"])
adapter = parser.parse_args().adapter
records, notices = [], []
for dist in sorted(metadata.distributions(), key=lambda d: d.metadata["Name"].lower()):
    record = {"name": dist.metadata["Name"], "version": dist.version,
              "license_expression": dist.metadata.get("License-Expression"),
              "license": dist.metadata.get("License"), "urls": dist.metadata.get_all("Project-URL", [])}
    records.append(record)
    texts = []
    for entry in dist.files or []:
        if "dist-info" in str(entry) and any(part.lower().startswith(("license", "copying", "notice", "copyright")) for part in entry.parts):
            source = dist.locate_file(entry)
            if source.is_file():
                texts.append(source.read_text(encoding="utf-8", errors="replace"))
    notices.append(f"\n{'='*72}\n{record['name']} {record['version']}\n{'='*72}\n" + "\n".join(texts))
(root / f"adapters/{adapter}/dependencies.json").write_text(json.dumps(records, indent=2)+"\n", encoding="utf-8")
(root / f"docs/{adapter.upper()}_THIRD_PARTY_NOTICES.txt").write_text(f"Optional installed {adapter} development runtime; not a complete redistribution audit.\n" + "\n".join(notices), encoding="utf-8")
print(f"Recorded {len(records)} installed optional-runtime distributions and their notices.")
