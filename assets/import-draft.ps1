param([string]$DraftRoot, [string]$IndexPath)

$ErrorActionPreference = 'Stop'
$package = Split-Path -Parent $PSScriptRoot
$profilePath = Join-Path $PSScriptRoot 'assets/runtime-profile.json'
$profile = Get-Content -LiteralPath $profilePath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $DraftRoot) { $DraftRoot = $profile.draftRoot }
if (-not $IndexPath) { $IndexPath = $profile.indexPath }
$node = $profile.nodePath
if (-not (Test-Path -LiteralPath $node)) {
    $node = (Get-Command node -ErrorAction Stop).Source
}
if (-not (Test-Path -LiteralPath $IndexPath)) {
    throw 'Draft index not found. Pass -IndexPath for the actual Jianying root index.'
}
Write-Host "Draft package: $package"
Write-Host "Target root: $DraftRoot"
Write-Host "Tested Jianying version: $($profile.testedJianyingVersion)"
Write-Host 'Save your existing project and return to the Jianying home page first.'
$answer = Read-Host 'Type IMPORT to register a NEW draft without overwriting existing projects'
if ($answer -cne 'IMPORT') { exit 0 }
& $node (Join-Path $PSScriptRoot 'scripts/register-draft.mjs') $package --draft-root $DraftRoot --index $IndexPath
if ($LASTEXITCODE -ne 0) { throw 'Import failed. Existing projects were not intentionally overwritten; inspect the error and backup.' }
Write-Host 'Imported. Reopen Jianying to refresh its draft list.'
