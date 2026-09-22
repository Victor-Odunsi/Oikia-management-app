#!/usr/bin/env bash
# Provisions a fresh Ubuntu box (EC2 or otherwise) to run this app via PM2,
# or redeploys onto one already set up this way. Usage:
#
#   ./setup-server.sh <git-remote-url> <branch>
#   e.g. ./setup-server.sh https://github.com/Victor-Odunsi/Oikia-management-app.git sandbox
#
# Does NOT create /opt/app/.env for you — that must be created once, by
# hand, on the server itself, and must never be committed. See ecosystem.config.js
# for what it needs to contain (DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY,
# DB_DRIVER=pg, on top of what's already set in ecosystem.config.js's env block).
set -euo pipefail

REPO_URL="${1:?Usage: $0 <git-remote-url> <branch>}"
BRANCH="${2:?Usage: $0 <git-remote-url> <branch>}"
APP_DIR="/opt/app"

if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Installing PM2..."
  sudo npm install -g pm2
fi

if [ -d "$APP_DIR/.git" ]; then
  echo "Updating existing checkout..."
  cd "$APP_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  echo "Cloning fresh checkout..."
  sudo mkdir -p "$APP_DIR"
  sudo chown "$USER" "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

if [ ! -f .env ]; then
  echo "WARNING: $APP_DIR/.env does not exist. Create it now with at least" >&2
  echo "DATABASE_URL, SESSION_SECRET, and ENCRYPTION_KEY before starting the app." >&2
  exit 1
fi

npm ci
npm run build

if pm2 describe occwaypoint >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js
else
  pm2 start ecosystem.config.js
  pm2 save
  echo "Run the command 'pm2 startup' printed above (once) so PM2 survives a reboot."
fi
