$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$adapterProject = Join-Path $projectRoot 'adapters/jbubble'
$previousAdapterEnvironment = $env:UV_PROJECT_ENVIRONMENT
$env:UV_PROJECT_ENVIRONMENT = Join-Path $projectRoot '.adapters/jbubble/.venv'
try {
    Write-Host 'Installing the optional, isolated jbubble CPU runtime (MIT).'
    & uv sync --project $adapterProject --locked --python 3.13 --no-dev
    if ($LASTEXITCODE -ne 0) { throw 'jbubble environment setup failed' }
    & (Join-Path $env:UV_PROJECT_ENVIRONMENT 'Scripts/python.exe') (Join-Path $adapterProject 'runner.py') --probe
    if ($LASTEXITCODE -ne 0) { throw 'jbubble runtime health check failed' }
    Write-Host 'jbubble CPU runtime ready. Restart PAM Research Studio.'
} finally {
    if ($null -ne $previousAdapterEnvironment) { $env:UV_PROJECT_ENVIRONMENT = $previousAdapterEnvironment }
    else { Remove-Item Env:UV_PROJECT_ENVIRONMENT -ErrorAction SilentlyContinue }
}
