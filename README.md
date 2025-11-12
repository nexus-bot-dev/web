# SSH & VPN Multi Server

Aplikasi web untuk membuat akun SSH/VMess/VLess/Trojan terintegrasi saldo dan deposit QRIS, mendukung multi server, limit IP/kuota, perpanjang, dan notifikasi.

## Instalasi Cepat

- Windows (PowerShell):
  - `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1`
- Linux/macOS:
  - `bash scripts/setup.sh`
- Docker:
  - `docker build -t ssh-vpn-web .`
  - `docker run -p 3000:3000 ssh-vpn-web`
- Docker Compose:
  - `docker-compose up --build`

## Auto Install via Repo

- Windows:
  - `powershell -ExecutionPolicy Bypass -File scripts/auto-install.ps1`
- Linux/macOS:
  - `bash scripts/auto-install.sh`

Script akan mengkloning repositori `https://github.com/nexus-bot-dev/web.git` ke folder `web` (atau nama yang Anda beri sebagai argumen), memasang dependensi, dan menjalankan server.

## Instalasi via VPS (Ubuntu/Debian)

- Persiapan paket dasar:
  - `sudo apt update && sudo apt install -y git curl`
- Instal Node.js 18:
  - `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -`
  - `sudo apt install -y nodejs`
- Kloning repo dan jalankan:
  - `git clone https://github.com/nexus-bot-dev/web.git`
  - `cd web`
  - `npm install`
  - Jalankan di background: `nohup node server.js > app.log 2>&1 &`
- Buka port (opsional jika firewall aktif):
  - `sudo ufw allow 3000/tcp`
- Cek layanan:
  - `curl http://localhost:3000`
- Hentikan layanan (background):
  - `pkill -f "node server.js"`

### Opsi: Auto Install di VPS

- Jalankan skrip auto install:
  - `git clone https://github.com/nexus-bot-dev/web.git && cd web`
  - `bash scripts/auto-install.sh`

### Opsi: Docker di VPS

- Instal Docker (Ubuntu):
  - `sudo apt update && sudo apt install -y docker.io`
- Build & run:
  - `cd web`
  - `docker build -t ssh-vpn-web .`
  - `docker run -d -p 3000:3000 --name ssh-vpn-web ssh-vpn-web`

## Menjalankan Manual

- `node server.js`
- Buka `http://localhost:3000`

## Login Wajib

- Pengguna harus login sebelum mengakses dashboard dan fitur.
- Admin login: masukkan username dan password, admin pertama dibuat otomatis.

## Konfigurasi Awal

- Simpan `API Key` deposit di panel admin.
- Tambahkan server: `Nama`, `Domain`, `Auth`, harga per tipe, default `Limit IP` dan `Kuota`.

## Fitur Utama

- Multi server dengan domain dan auth per server
- Harga per tipe: SSH, VMess, VLess, Trojan
- Limit IP dan kuota untuk VMess/VLess/Trojan
- Trial akun tanpa pemotongan saldo
- Beli akun dengan pemotongan saldo otomatis
- Perpanjang akun (renew) dengan pemotongan saldo
- Deposit QRIS: pembuatan, status, penambahan saldo otomatis
- Notifikasi admin atas transaksi dan broadcast ke user
- Tampilan detail akun yang rapi (non‑JSON)

## Integrasi API Eksternal

- Deposit QRIS:
  - Create: `https://my-payment.autsc.my.id/api/deposit?amount=...&apikey=...`
  - Status: `https://my-payment.autsc.my.id/api/status/payment?transaction_id=...&apikey=...`
- Pembuatan akun server (contoh berdasarkan domain server):
  - SSH: `https://{domain}/api/create-ssh?auth=...&user=...&password=...&exp=...&limitip=...`
  - VMess: `https://{domain}/api/create-vmess?auth=...&user=...&quota=...&limitip=...&exp=...`
  - VLess: `https://{domain}/api/create-vless?auth=...&user=...&quota=...&limitip=...&exp=...`
  - Trojan: `https://{domain}/api/create-trojan?auth=...&user=...&quota=...&limitip=...&exp=...`
- Renew:
  - VMess: `https://{domain}/api/renws?auth=...&num=...&exp=...`
  - SSH: `https://{domain}/api/rensh?auth=...&num=...&exp=...`
  - Trojan: `https://{domain}/api/rentr?auth=...&num=...&exp=...`
  - VLess: `https://{domain}/api/renvl?auth=...&num=...&exp=...`

## Aturan Saldo

- Beli/Renew: saldo dipotong hanya jika API eksternal sukses.
- Deposit: saldo ditambahkan jika status pembayaran `paid=true` dan `status=success`.
- Kegagalan seperti `{"status":"failed","message":"Unauthorized"}` tidak mengubah saldo.

## Struktur Proyek

- `server.js` — server HTTP dan API
- `public/` — aset frontend (HTML, CSS, JS)
- `data/` — penyimpanan JSON (dibuat otomatis)
- `scripts/` — skrip instalasi cepat
- `Dockerfile`, `docker-compose.yml` — jalankan dengan container

## Catatan

- Pastikan Node.js terpasang di mesin jika tidak menggunakan Docker.
- Isi harga per tipe di server agar sistem mengontrol saldo.