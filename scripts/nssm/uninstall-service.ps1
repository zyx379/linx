#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Uninstall linx Windows service
#>
param(
  [string]$ServiceName = 'linx'
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
  $ErrorActionPreference = 'Continue'
  try {
    return (& $Command 2>&1 | Out-String)
  } finally {
    $ErrorActionPreference = $prev
  }
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
  Write-Host '[linx] service may still be pending delete. Close services.msc and retry later.' -ForegroundColor Yellow
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
    # ignore stop errors
  }
  Start-Sleep -Seconds 2
  Invoke-ExternalQuiet { sc.exe stop $Name }
  Start-Sleep -Seconds 2
}

$nssm = Join-Path $PSScriptRoot 'nssm.exe'
if (-not (Test-Path $nssm)) {
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { $nssm = $cmd.Source }
}
if (-not $nssm) {
  throw 'nssm.exe not found. Put nssm.exe next to this script.'
}

if (-not (Test-ServiceRegistered -Name $ServiceName)) {
  Write-Host "[linx] service $ServiceName not found, nothing to remove"
  exit 0
}

Write-Host "[linx] stopping and removing service $ServiceName ..."
Stop-LinxServiceProcess -Nssm $nssm -Name $ServiceName
Invoke-ExternalQuiet { & $nssm remove $ServiceName confirm }
Invoke-ExternalQuiet { sc.exe delete $ServiceName }
Wait-ServiceRemoved -Name $ServiceName
Write-Host '[linx] removed' -ForegroundColor Green
