"""Record installed Python package provenance without installing optional engines."""
import importlib.metadata as metadata
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
records = []
notices = []
for dist in sorted(metadata.distributions(), key=lambda item: item.metadata['Name'].lower()):
    record = {'name': dist.metadata['Name'], 'version': dist.version,
              'license_expression': dist.metadata.get('License-Expression'),
              'home_page': dist.metadata.get('Home-page'),
              'project_urls': dist.metadata.get_all('Project-URL', [])}
    records.append(record)
    text = dist.metadata.get('License', '')
    for entry in dist.files or []:
        if 'dist-info' in str(entry) and entry.name.lower() in ('license', 'license.txt', 'license.md', 'copying', 'copyright'):
            text += '\n' + dist.locate_file(entry).read_text(encoding='utf-8', errors='replace')
    if text:
        notices.append(f"\n{'='*72}\n{record['name']} {record['version']}\n{'='*72}\n{text}\n")
(root / 'docs' / 'python-dependencies.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')
(root / 'docs' / 'PYTHON_THIRD_PARTY_NOTICES.txt').write_text('Installed development environment notices; not a complete packaged-runtime legal audit.\n' + ''.join(notices), encoding='utf-8')
