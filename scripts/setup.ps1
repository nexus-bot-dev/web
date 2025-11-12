Param()
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js belum terpasang. Silakan instal Node.js terlebih dahulu."
  exit 1
}
try { npm install } catch {}
node server.js