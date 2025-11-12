#!/usr/bin/env bash
set -e
REPO_URL="https://github.com/nexus-bot-dev/web.git"
TARGET_DIR="${1:-web}"
if ! command -v git >/dev/null 2>&1; then echo "Git belum terpasang"; exit 1; fi
if [ -d "$TARGET_DIR/.git" ]; then
  cd "$TARGET_DIR"
else
  git clone --depth=1 "$REPO_URL" "$TARGET_DIR"
  cd "$TARGET_DIR"
fi
if ! command -v node >/dev/null 2>&1; then echo "Node.js belum terpasang"; exit 1; fi
npm install || true
node server.js