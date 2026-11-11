$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$adapterProject = Join-Path $projectRoot 'adapters/jwave'
$previousAdapterEnvironment = $env:UV_PROJECT_ENVIRONMENT
$env:UV_PROJECT_ENVIRONMENT = Join-Path $projectRoot '.adapters/jwave/.venv'
try {
    Write-Host 'Installing the optional, isolated j-Wave CPU runtime (LGPL-3.0-only).'
    & uv sync --project $adapterProject --locked --python 3.12 --no-dev
    if ($LASTEXITCODE -ne 0) { throw 'j-Wave environment setup failed' }
    $adapterPython = Join-Path $env:UV_PROJECT_ENVIRONMENT 'Scripts/python.exe'
    & $adapterPython (Join-Path $adapterProject 'runner.py') --probe
    if ($LASTEXITCODE -ne 0) { throw 'j-Wave runtime health check failed' }
    Write-Host 'j-Wave CPU runtime ready. Restart PAM Research Studio to refresh backend detection.'
} finally {
    if ($null -ne $previousAdapterEnvironment) { $env:UV_PROJECT_ENVIRONMENT = $previousAdapterEnvironment }
    else { Remove-Item Env:UV_PROJECT_ENVIRONMENT -ErrorAction SilentlyContinue }
}
