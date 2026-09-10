$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pgCtl = Join-Path $projectRoot '.local/pgsql/bin/pg_ctl.exe'
$pgData = Join-Path $projectRoot '.local/pgdata'
if (Test-Path -LiteralPath $pgCtl) {
    & $pgCtl -D $pgData status
    if ($LASTEXITCODE -ne 0) {
        & $pgCtl -D $pgData -l (Join-Path $projectRoot '.local/postgres.log') -o '-h 127.0.0.1 -p 55432' -w start
        if ($LASTEXITCODE -ne 0) { throw 'Local PostgreSQL did not start.' }
    }
}
Set-Location -LiteralPath $projectRoot
if (Test-Path -LiteralPath $pgCtl) {
    $env:DATABASE_URL = 'postgresql://inwards@127.0.0.1:55432/inwards'
    $env:APP_URL = 'http://localhost:3100'
}
npm.cmd run dev
