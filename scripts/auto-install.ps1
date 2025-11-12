Param(
  [string]$TargetDir = "web",
  [int]$Port = 3000
)
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
$licenseKey = Read-Host "Masukkan kunci lisensi 11 digit"
$siteDomain = Read-Host "Masukkan domain untuk website (contoh vpn.example.com, kosongkan bila belum siap)"
if (-not [string]::IsNullOrWhiteSpace($siteDomain)) {
  New-Item -ItemType Directory -Path "data" -Force | Out-Null
  $env:SITE_DOMAIN_INPUT = $siteDomain
  node -e "const fs=require('fs');const path=require('path');const dataDir=path.join(process.cwd(),'data');if(!fs.existsSync(dataDir))fs.mkdirSync(dataDir,{recursive:true});const file=path.join(dataDir,'settings.json');let records=[];if(fs.existsSync(file)){try{const raw=fs.readFileSync(file,'utf8');records=raw?JSON.parse(raw):[];}catch(e){records=[];}}const base=records[0]&&typeof records[0]==='object'?records[0]:{};records[0]={...base,primary_domain:process.env.SITE_DOMAIN_INPUT,domain_updated_at:new Date().toISOString()};fs.writeFileSync(file,JSON.stringify(records,null,2));"
  Remove-Item Env:SITE_DOMAIN_INPUT
  Write-Host "Domain $siteDomain disimpan. Pastikan DNS mengarah ke server ini."
} else {
  Write-Host "Lewati konfigurasi domain. Anda dapat mengatur domain dari panel admin nanti."
}
if ([string]::IsNullOrWhiteSpace($licenseKey)) {
  Write-Host "Tidak ada kunci dimasukkan. Server akan berjalan dalam mode terkunci."
} else {
  Write-Host "Kunci lisensi diterima. Akan mencoba aktivasi otomatis setelah server berjalan."
}
$env:PORT = $Port
Write-Host "Menjalankan server pada port $Port ..."
$server = Start-Process node -ArgumentList "server.js" -PassThru
Start-Sleep -Seconds 5
if (-not [string]::IsNullOrWhiteSpace($licenseKey)) {
  try {
    npm run license:activate -- $licenseKey "http://127.0.0.1:$Port"
    Write-Host "Lisensi berhasil diaktifkan."
  } catch {
    Write-Host "Aktivasi otomatis gagal. Jalankan ulang perintah:"
    Write-Host "  npm run license:activate -- $licenseKey http://127.0.0.1:$Port"
  }
}
Write-Host "Server siap digunakan. Tutup jendela ini untuk menghentikan."
if (-not [string]::IsNullOrWhiteSpace($siteDomain)) {
  Write-Host "Akses panel melalui: http://$siteDomain (konfigurasi HTTPS melalui reverse proxy sesuai kebutuhan)."
} else {
  Write-Host "Akses panel melalui: http://<alamat-ip-server>:$Port"
}
$server.WaitForExit()
