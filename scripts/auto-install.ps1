Param([string]$TargetDir="web")
$RepoUrl = "https://github.com/nexus-bot-dev/web.git"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host "Git belum terpasang"; exit 1 }
if (Test-Path "$TargetDir/.git") {
  Set-Location $TargetDir
} else {
  git clone --depth=1 $RepoUrl $TargetDir
  Set-Location $TargetDir
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Node.js belum terpasang"; exit 1 }
try { npm install } catch {}
node server.js