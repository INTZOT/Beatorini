# Sync this repo to the game behavior pack folder (dev deploy)
# Usage: powershell -ExecutionPolicy Bypass -File sync-to-game.ps1
$ErrorActionPreference = "Stop"

$src = $PSScriptRoot
$dst = "D:\Apps\Levilauncher\versions\1.26.42.01\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs\Beatorini"

if (-not (Test-Path -LiteralPath $dst)) {
    throw "Target directory missing: $dst"
}

robocopy $src $dst /E /R:1 /W:1 /XD "$src\.git" "$src\.agents" "$src\node_modules" /XF "sync-to-game.ps1" "HANDOVER.md" /NFL /NDL /NJH /NJS /NP
$code = $LASTEXITCODE
if ($code -ge 8) {
    throw "Sync failed (robocopy exit code $code)"
}

Write-Output "Sync done (robocopy exit code $code): $dst"
