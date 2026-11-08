param([ValidateSet('start','setup','build','dev','check')][string]$Mode = 'start')
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
  $runtimeDirectory = Join-Path $PSScriptRoot '.tools/package/bin'
  if (Test-Path -LiteralPath (Join-Path $runtimeDirectory 'node.exe')) { $env:PATH = $runtimeDirectory + ';' + $env:PATH }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node 24.22.1 belum tersedia. Ikuti README.' }
  $runtimeVersion = & node --version
  if ($runtimeVersion -notmatch '^v24\.' -or [version]$runtimeVersion.Substring(1) -lt [version]'24.22.1') { throw 'Gunakan Node 24.22.1 atau Node 24 patch lebih baru.' }
  if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) { throw 'pnpm 10.27.0 belum tersedia. Ikuti README.' }
  if ((& pnpm.cmd --version) -ne '10.27.0') { throw 'Gunakan pnpm 10.27.0 sesuai lockfile.' }
  switch ($Mode) {
    'check' { Write-Output "Runtime siap. Workspace: $PSScriptRoot" }
    'setup' { & pnpm.cmd install --frozen-lockfile; if ($LASTEXITCODE -ne 0) { throw 'Instalasi dependency gagal.' }; & pnpm.cmd build; if ($LASTEXITCODE -ne 0) { throw 'Build gagal.' } }
    'build' { & pnpm.cmd build; if ($LASTEXITCODE -ne 0) { throw 'Build gagal.' } }
    'dev' { & pnpm.cmd dev; if ($LASTEXITCODE -ne 0) { throw 'Dev berhenti dengan error.' } }
    'start' { if (-not (Test-Path -LiteralPath 'apps/server/dist/main.js') -or -not (Test-Path -LiteralPath 'apps/web/dist/index.html')) { throw 'Build belum tersedia. Jalankan .\start.ps1 setup.' }; & pnpm.cmd start; if ($LASTEXITCODE -ne 0) { throw 'Server berhenti dengan error; periksa pesan sebelumnya.' } }
  }
} finally { Pop-Location }
