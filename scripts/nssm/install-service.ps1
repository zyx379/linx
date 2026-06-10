#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install linx as a Windows service via nssm
#>
param(
  [string]$InstallDir = $PSScriptRoot,
  [string]$ServiceName = 'linx',
  [string]$NodeExe = ''
)

$ErrorActionPreference = 'Stop'

function Invoke-ExternalQuiet {
  param(
    [scriptblock]$Command
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Command 2>&1 | Out-Null
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Invoke-ExternalCapture {
  param(
    [scriptblock]$Command
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  try {
    $lines = & $Command 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { "$_" }
    }
    return ($lines -join [Environment]::NewLine)
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Stop-LinxServiceProcess {
  param(
    [string]$Nssm,
    [string]$Name
  )
  $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $svc) { return }

  if ($svc.Status -eq 'Running') {
    Invoke-ExternalQuiet { & $Nssm stop $Name confirm }
    Start-Sleep -Seconds 3
  }

  try {
    Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
  } catch {
    # ignore stop errors; sc/nssm may still succeed
  }
  Start-Sleep -Seconds 2
  Invoke-ExternalQuiet { sc.exe stop $Name }
  Start-Sleep -Seconds 2
}

function Resolve-InstallDir {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PathInput
  )

  $candidate = $PathInput.Trim().Trim('"').Trim("'").TrimEnd('\', '/')

  if ([string]::IsNullOrWhiteSpace($candidate)) {
    $candidate = $PSScriptRoot
  }

  try {
    $full = [System.IO.Path]::GetFullPath($candidate)
  } catch {
    throw "InstallDir invalid: '$PathInput'"
  }

  if (Test-Path -LiteralPath $full -PathType Container) {
    return $full
  }

  if ($PSScriptRoot -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'start-linx-service.bat'))) {
    Write-Host "[linx] InstallDir not found ($full), using script dir: $PSScriptRoot" -ForegroundColor Yellow
    return $PSScriptRoot
  }

  throw "InstallDir not found: '$full'. Run install-service.bat inside release-portable."
}

function Test-ServiceRegistered {
  param([string]$Name)
  $out = Invoke-ExternalCapture { sc.exe query $Name }
  if ($out -match '1060|does not exist') { return $false }
  return $true
}

function Wait-ServiceRemoved {
  param(
    [string]$Name,
    [int]$TimeoutSec = 90
  )
  Write-Host "[linx] waiting for SCM to release service '$Name' ..."
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-ServiceRegistered -Name $Name)) {
      Write-Host '[linx] service entry cleared' -ForegroundColor Green
      return
    }
    Start-Sleep -Seconds 2
  }
  throw @"
[linx] Service '$Name' is still marked for deletion.
1. Close services.msc and Task Manager (Services tab)
2. Wait 30 seconds
3. Run install-service.bat again as Administrator
If it still fails, reboot Windows and retry.
"@
}

function Remove-LinxService {
  param(
    [string]$Nssm,
    [string]$Name
  )
  if (-not (Test-ServiceRegistered -Name $Name)) { return }

  Write-Host "[linx] removing existing service '$Name' ..." -ForegroundColor Yellow
  Stop-LinxServiceProcess -Nssm $Nssm -Name $Name
  Invoke-ExternalQuiet { & $Nssm remove $Name confirm }
  Invoke-ExternalQuiet { sc.exe delete $Name }
  Wait-ServiceRemoved -Name $Name
}

function Invoke-Nssm {
  param(
    [string[]]$NssmArgs,
    [switch]$AllowPaused
  )
  $out = Invoke-ExternalCapture { & $nssm @NssmArgs }
  if ($out) { Write-Host $out.TrimEnd() }
  if ($out -match '1072|marked for deletion|Error creating service') {
    throw 'SERVICE_PENDING_DELETE'
  }
  if ($out -match 'Error creating service|Error setting parameter') {
    throw "nssm failed: $($NssmArgs -join ' ')"
  }
  if (-not $AllowPaused -and $out -match 'SERVICE_PAUSED|Unexpected status SERVICE_PAUSED') {
    throw 'SERVICE_PAUSED'
  }
  return $out
}

function Normalize-PathEntry {
  param(
    [string]$Value
  )
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $clean = $Value.Trim().Trim('"').Trim("'").TrimEnd('\', '/')
  if ([string]::IsNullOrWhiteSpace($clean)) { return $null }
  return $clean
}

function Get-PathEntries {
  $entries = [System.Collections.Generic.List[string]]::new()
  $keys = @(
    'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'HKCU:\Environment'
  )
  foreach ($key in $keys) {
    if (-not (Test-Path -LiteralPath $key)) { continue }
    $pathVal = (Get-ItemProperty -LiteralPath $key -Name Path -ErrorAction SilentlyContinue).Path
    if ($pathVal) {
      foreach ($part in ($pathVal -split ';')) {
        $trimmed = Normalize-PathEntry $part
        if ($trimmed) { [void]$entries.Add($trimmed) }
      }
    }
  }
  if ($env:Path) {
    foreach ($part in ($env:Path -split ';')) {
      $trimmed = Normalize-PathEntry $part
      if ($trimmed) { [void]$entries.Add($trimmed) }
    }
  }
  return $entries | Select-Object -Unique
}

function Resolve-NodeExe {
  param(
    [string]$Override = ''
  )

  foreach ($candidate in @($Override, $env:LINX_NODE)) {
    $normalized = Normalize-PathEntry $candidate
    if ($normalized -and (Test-Path -LiteralPath $normalized)) {
      return (Resolve-Path -LiteralPath $normalized).Path
    }
  }

  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = [System.Collections.Generic.List[string]]::new()
  foreach ($dir in Get-PathEntries) {
    try {
      [void]$candidates.Add((Join-Path -Path $dir -ChildPath 'node.exe'))
    } catch {
      # skip malformed PATH entries
    }
  }
  foreach ($fixed in @(
      (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
      (Join-Path $env:LocalAppData 'Programs\node\node.exe'),
      (Join-Path $env:AppData 'npm\node.exe')
    )) {
    [void]$candidates.Add($fixed)
  }
  if ($env:NVM_HOME -and (Test-Path -LiteralPath $env:NVM_HOME)) {
    $nvmNodes = Get-ChildItem -Path (Join-Path $env:NVM_HOME 'v*') -Filter 'node.exe' -Recurse -ErrorAction SilentlyContinue |
      Sort-Object { $_.FullName } -Descending
    foreach ($node in $nvmNodes) {
      [void]$candidates.Add($node.FullName)
    }
  }

  foreach ($path in ($candidates | Select-Object -Unique)) {
    if ($path -and (Test-Path -LiteralPath $path)) {
      return (Resolve-Path -LiteralPath $path).Path
    }
  }
  return $null
}

function Test-LinxExecutable {
  param(
    [string]$ExePath,
    [string]$WorkDir,
    [int]$Port = 8080
  )

  $proc = $null
  try {
    $proc = Start-Process -FilePath $ExePath -WorkingDirectory $WorkDir -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(8)
    while ((Get-Date) -lt $deadline) {
      if ($proc.HasExited) {
        Write-Host "[linx] linx.exe exited early (code $($proc.ExitCode))" -ForegroundColor Red
        return $false
      }
      try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { return $true }
      } catch {
        Start-Sleep -Milliseconds 500
      }
    }
    Write-Host '[linx] linx.exe did not respond on /health within 8s' -ForegroundColor Red
    return $false
  } finally {
    if ($proc -and -not $proc.HasExited) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

function Resolve-LinxLaunch {
  param(
    [string]$InstallDir
  )

  $linxExe = Join-Path $InstallDir 'linx.exe'
  if (Test-Path -LiteralPath $linxExe) {
    Write-Host '[linx] verifying linx.exe ...' -ForegroundColor Cyan
    if (-not (Test-LinxExecutable -ExePath $linxExe -WorkDir $InstallDir)) {
      throw @"
[linx] linx.exe failed smoke test in $InstallDir
The exe may be corrupted or built incorrectly. Rebuild on a dev machine:
  cd linx && npm install && npm run dist
Then copy release\linx.exe and release\web\ to this folder and retry.
Check $InstallDir\linx-data\service-stderr.log for details.
"@
    }
    Write-Host '[linx] linx.exe smoke test passed' -ForegroundColor Green
    return @{
      App = $linxExe
      Args = $null
      NodeDir = $null
      Mode = 'linx.exe'
    }
  }

  $indexJs = Join-Path $InstallDir 'dist\index.js'
  $bundleJs = Join-Path $InstallDir 'dist\pkg-bundle.cjs'
  if (-not (Test-Path -LiteralPath $indexJs) -and -not (Test-Path -LiteralPath $bundleJs)) {
    throw "Missing $indexJs. Run npm run dist:portable first."
  }

  $nodeExe = Resolve-NodeExe -Override $NodeExe
  if (-not $nodeExe) {
    throw @"
[linx] node.exe and linx.exe not found under: $InstallDir
Fix A: Install Node.js 18+ (system-wide), then rerun install-service.bat as Administrator
Fix B: Copy linx.exe into $InstallDir, then rerun install-service.bat
Fix C: set LINX_NODE=C:\path\to\node.exe then rerun install-service.bat
"@
  }

  $scriptPath = if (Test-Path -LiteralPath $bundleJs) { $bundleJs } else { $indexJs }

  return @{
    App = $nodeExe
    Args = $scriptPath
    NodeDir = Split-Path -Parent $nodeExe
    Mode = 'node'
  }
}

function Resolve-Nssm {
  $local = Join-Path $PSScriptRoot 'nssm.exe'
  if (Test-Path $local) { return $local }

  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  Write-Host '[linx] nssm.exe not found, downloading...' -ForegroundColor Yellow

  $urls = @(
    'https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip',
    'https://github.com/nssm/nssm/releases/download/2.24/nssm-2.24.zip'
  )
  $tmpZip = Join-Path $env:TEMP 'linx-nssm.zip'
  $tmpDir = Join-Path $env:TEMP 'linx-nssm-extract'
  $downloaded = $false

  foreach ($zipUrl in $urls) {
    try {
      Write-Host "  try: $zipUrl"
      Invoke-WebRequest -Uri $zipUrl -OutFile $tmpZip -UseBasicParsing -TimeoutSec 60
      $downloaded = $true
      break
    } catch {
      Write-Host "  skip: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
  }

  if (-not $downloaded) {
    throw @'
[linx] Failed to download nssm.exe.
Manual steps:
1. Download https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip
2. Copy win64\nssm.exe next to install-service.ps1
3. Run install-service.bat again as Administrator
'@
  }

  try {
    if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force
    $exe = Get-ChildItem -Path $tmpDir -Recurse -Filter 'nssm.exe' |
      Where-Object { $_.FullName -match 'win64' } |
      Select-Object -First 1
    if (-not $exe) {
      $exe = Get-ChildItem -Path $tmpDir -Recurse -Filter 'nssm.exe' | Select-Object -First 1
    }
    if (-not $exe) { throw 'nssm.exe not found inside zip' }
    Copy-Item $exe.FullName $local -Force
    Write-Host "[linx] saved nssm.exe -> $local" -ForegroundColor Green
    return $local
  } finally {
    Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
    Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$InstallDir = Resolve-InstallDir -PathInput $InstallDir
$launch = Resolve-LinxLaunch -InstallDir $InstallDir
Write-Host "[linx] launch mode: $($launch.Mode)" -ForegroundColor Cyan
if ($launch.Mode -eq 'node') {
  Write-Host "  node: $($launch.App)"
} else {
  Write-Host "  exe : $($launch.App)"
}

$dataDir = Join-Path $InstallDir 'linx-data'
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

$envExample = Join-Path $InstallDir 'linx.env.example'
$envFile = Join-Path $InstallDir 'linx.env'
if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
  Copy-Item $envExample $envFile
  Write-Host '[linx] created linx.env from linx.env.example' -ForegroundColor Yellow
}

$nssm = Resolve-Nssm
Remove-LinxService -Nssm $nssm -Name $ServiceName

Write-Host "[linx] installing service $ServiceName ..." -ForegroundColor Cyan
Write-Host "  dir: $InstallDir"

$installAttempts = 5
for ($attempt = 1; $attempt -le $installAttempts; $attempt++) {
  try {
    Invoke-Nssm -NssmArgs @('install', $ServiceName, $launch.App)
    if ($launch.Args) {
      Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppParameters', $launch.Args)
    } else {
      Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppParameters', '')
    }
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppDirectory', $InstallDir)
    if ($launch.NodeDir) {
      $nodePath = $launch.NodeDir
      Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppEnvironmentExtra', "PATH=$nodePath;%PATH%")
    }
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'DisplayName', 'linx relay')
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'Description', 'linx hospital intranet relay')
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'Start', 'SERVICE_AUTO_START')
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppStdout', (Join-Path $dataDir 'service-stdout.log'))
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppStderr', (Join-Path $dataDir 'service-stderr.log'))
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppStdoutCreationDisposition', '4')
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppStderrCreationDisposition', '4')
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppRotateFiles', '1')
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppRotateBytes', '10485760')
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppExit', 'Default', 'Restart')
    Invoke-Nssm -NssmArgs @('set', $ServiceName, 'AppRestartDelay', '5000')
    break
  } catch {
    if ($_.Exception.Message -ne 'SERVICE_PENDING_DELETE' -and $_.ToString() -notmatch '1072|marked for deletion') {
      throw
    }
    if ($attempt -ge $installAttempts) {
      throw "[linx] install still blocked after $installAttempts attempts. Close services.msc, reboot, then retry."
    }
    Write-Host "[linx] SCM still releasing service, retry in 10s ($attempt/$installAttempts)..." -ForegroundColor Yellow
    Invoke-ExternalQuiet { sc.exe delete $ServiceName }
    Start-Sleep -Seconds 10
    Wait-ServiceRemoved -Name $ServiceName -TimeoutSec 30
  }
}

function Show-LinxConnectionInfo {
  param(
    [string]$InstallDir,
    [string]$DataDir
  )

  $configFile = Join-Path $DataDir 'config.json'
  $stderrLog = Join-Path $DataDir 'service-stderr.log'
  $port = 8080
  $apiKey = $null

  if (Test-Path -LiteralPath $configFile) {
    try {
      $cfg = Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($cfg.port) { $port = [int]$cfg.port }
      if ($cfg.apiKey) { $apiKey = [string]$cfg.apiKey }
    } catch {
      Write-Host "[linx] could not read $configFile" -ForegroundColor Yellow
    }
  }

  if (-not $apiKey -and (Test-Path -LiteralPath $stderrLog)) {
    Start-Sleep -Seconds 2
    $log = Get-Content -LiteralPath $stderrLog -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if ($log -match '对外 API Key\s*:\s*(\S+)') {
      $apiKey = $Matches[1]
    }
  }

  Write-Host ''
  Write-Host '--- connection info (copy to zoe-his-mcp) ---' -ForegroundColor Cyan
  if ($apiKey) {
    Write-Host "API Key    : $apiKey" -ForegroundColor Green
    Write-Host "LINX_BASE_URL=http://<FRP-or-public-IP>:<port>"
    Write-Host "LINX_API_KEY=$apiKey"
  } else {
    Write-Host "API Key    : (not found yet)" -ForegroundColor Yellow
    Write-Host "  1) open http://localhost:$port/admin/ on this machine and login"
    Write-Host "  2) or read: $configFile"
    Write-Host "  3) or read: $stderrLog"
  }
  Write-Host "admin UI   : http://localhost:$port/admin/  (local machine only if adminLocalOnly=true)"
  Write-Host "health     : http://localhost:$port/health"
  Write-Host "config file: $configFile"
  Write-Host '---------------------------------------------'
}
try {
  Invoke-Nssm -NssmArgs @('start', $ServiceName) -AllowPaused
} catch {
  if ($_.Exception.Message -ne 'SERVICE_PAUSED' -and $_.ToString() -notmatch 'SERVICE_PAUSED') {
    throw
  }
  Write-Host '[linx] start returned PAUSED (often means the app exited immediately)' -ForegroundColor Yellow
}

Start-Sleep -Seconds 3
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Paused') {
  Write-Host '[linx] attempting to resume paused service...' -ForegroundColor Yellow
  Invoke-ExternalQuiet { sc.exe continue $ServiceName }
  Start-Sleep -Seconds 3
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
}

Write-Host ''
if ($svc -and $svc.Status -eq 'Running') {
  Write-Host "service status: $($svc.Status)" -ForegroundColor Green
  Show-LinxConnectionInfo -InstallDir $InstallDir -DataDir $dataDir
} else {
  $status = if ($svc) { $svc.Status } else { 'NotFound' }
  Write-Host "service status: $status" -ForegroundColor Red
  Write-Host "check logs: $dataDir\service-stderr.log"
  if ($launch.Mode -eq 'node') {
    Write-Host "common fix: install Node.js 18+ (current node: $($launch.App)) or put linx.exe in $InstallDir"
  } else {
    Write-Host "common fix: verify linx.exe runs manually in $InstallDir"
  }
  Write-Host "tip: run uninstall-service.bat then install-service.bat again after fixing"
}
Write-Host "admin UI : http://localhost:8080/admin/"
Write-Host "health   : http://localhost:8080/health"
Write-Host "logs     : $dataDir\service-*.log"
if (-not ($svc -and $svc.Status -eq 'Running')) {
  Write-Host "tip: API Key is in $dataDir\config.json -> apiKey"
}
Write-Host ''
Write-Host 'uninstall: run uninstall-service.bat as Administrator'
