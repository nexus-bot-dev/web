#!/usr/bin/env bash
set -e
REPO_URL="https://github.com/nexus-bot-dev/web.git"
TARGET_DIR="${1:-web}"
PORT="${PORT:-3000}"

if ! command -v git >/dev/null 2>&1; then echo "Git belum terpasang"; exit 1; fi
if [ -d "$TARGET_DIR/.git" ]; then
  cd "$TARGET_DIR"
else
  git clone --depth=1 "$REPO_URL" "$TARGET_DIR"
  cd "$TARGET_DIR"
fi
if ! command -v node >/dev/null 2>&1; then echo "Node.js belum terpasang"; exit 1; fi
npm install || true

read -rp "Masukkan kunci lisensi 11 digit: " LICENSE_KEY

read -rp "Masukkan domain untuk website (contoh vpn.example.com, kosongkan bila belum siap): " SITE_DOMAIN

if [ -n "$SITE_DOMAIN" ]; then
  mkdir -p data
SITE_DOMAIN_INPUT="$SITE_DOMAIN" node - <<'NODE'
const fs = require('fs')
const path = require('path')
const dataDir = path.join(process.cwd(), 'data')
const file = path.join(dataDir, 'settings.json')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
let records = []
if (fs.existsSync(file)) {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    records = raw ? JSON.parse(raw) : []
  } catch (err) {
    records = []
  }
}
const base = records[0] && typeof records[0] === 'object' ? records[0] : {}
records[0] = {
  ...base,
  primary_domain: process.env.SITE_DOMAIN_INPUT,
  domain_updated_at: new Date().toISOString()
}
fs.writeFileSync(file, JSON.stringify(records, null, 2))
NODE
  unset SITE_DOMAIN_INPUT
  echo "Domain $SITE_DOMAIN disimpan. Pastikan DNS mengarah ke server ini."
else
  echo "Lewati konfigurasi domain. Anda dapat mengatur domain dari panel admin nanti."
fi

if [ -z "$LICENSE_KEY" ]; then
  echo "Tidak ada kunci dimasukkan. Server akan berjalan dalam mode terkunci."
else
  echo "Kunci lisensi diterima. Akan mencoba aktivasi otomatis setelah server berjalan."
fi

echo "Menjalankan server pada port $PORT ..."
PORT=$PORT node server.js &
SERVER_PID=$!
trap "kill $SERVER_PID" INT TERM
sleep 5

if [ -n "$LICENSE_KEY" ]; then
  if npm run license:activate -- "$LICENSE_KEY" "http://127.0.0.1:$PORT"; then
    echo "Lisensi berhasil diaktifkan."
  else
    echo "Aktivasi otomatis gagal. Anda dapat mencoba lagi dengan perintah:"
    echo "  npm run license:activate -- $LICENSE_KEY http://127.0.0.1:$PORT"
  fi
fi

echo "Server siap digunakan. Tekan Ctrl+C untuk menghentikan."
if [ -n "$SITE_DOMAIN" ]; then
  echo "Akses panel melalui domain: http://$SITE_DOMAIN atau gunakan HTTPS sesuai konfigurasi reverse proxy."
else
  echo "Akses panel melalui: http://<alamat-ip-server>:$PORT"
fi
wait $SERVER_PID
