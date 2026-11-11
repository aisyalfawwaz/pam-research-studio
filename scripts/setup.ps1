$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    uv sync --locked --python 3.13
    if ($LASTEXITCODE -ne 0) { throw 'Python environment setup failed' }
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Node dependency setup failed' }
    node scripts/ensure-electron.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Electron binary setup failed' }
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
} finally { Pop-Location }
