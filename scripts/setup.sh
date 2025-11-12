#!/usr/bin/env bash
set -e
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js belum terpasang. Silakan instal Node.js terlebih dahulu."
  exit 1
fi
npm install || true
node server.js