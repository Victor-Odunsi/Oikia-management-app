#!/usr/bin/env bash
# Provisions a fresh Ubuntu box (EC2 or otherwise) to run this app via PM2,
# or redeploys onto one already set up this way. Usage:
#
#   ./setup-server.sh <git-remote-url> <branch>
#   e.g. ./setup-server.sh https://github.com/Victor-Odunsi/Oikia-management-app.git sandbox
#
# Does NOT create /opt/app/.env for you — that must be created once, by
# hand, on the server itself, and must never be committed. See ecosystem.config.cjs
# for what it needs to contain (DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY,
# DB_DRIVER=pg, on top of what's already set in ecosystem.config.cjs's env block).
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
  sudo chown "$(whoami)" "$APP_DIR"
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
  pm2 reload ecosystem.config.cjs
else
  pm2 start ecosystem.config.cjs
  pm2 save
  echo "Run the command 'pm2 startup' printed above (once) so PM2 survives a reboot."
fi

# CloudWatch Logs shipping — EC2 only, auto-skipped elsewhere (e.g. the DO
# droplet, which has no CloudWatch to ship to). Detected via IMDSv2 rather
# than an env var, so this reflects the actual host, not app config that's
# otherwise identical between branches. PM2's own log files are the source
# (whichever user runs this script/PM2 — currently root on this box, hence
# $HOME rather than a hardcoded /root).
TOKEN=$(curl -fsS -m 2 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
if [ -n "$TOKEN" ] && curl -fsS -m 2 -H "X-aws-ec2-metadata-token: $TOKEN" "http://169.254.169.254/latest/meta-data/instance-id" >/dev/null 2>&1; then
  echo "Detected EC2 — configuring CloudWatch Logs shipping..."
  # $HOME isn't set under SSM RunCommand (same class of gap as $USER
  # earlier) — look it up directly instead of assuming it's exported.
  HOME_DIR="$(getent passwd "$(whoami)" | cut -d: -f6)"
  if ! command -v /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl >/dev/null 2>&1; then
    ARCH=$(dpkg --print-architecture)
    curl -fsSL "https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/${ARCH}/latest/amazon-cloudwatch-agent.deb" -o /tmp/amazon-cloudwatch-agent.deb
    sudo dpkg -i -E /tmp/amazon-cloudwatch-agent.deb
  fi
  sudo mkdir -p /opt/aws/amazon-cloudwatch-agent/etc
  sudo tee /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json > /dev/null <<CWCONFIG
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "$HOME_DIR/.pm2/logs/occwaypoint-out-0.log",
            "log_group_name": "/oikia/app",
            "log_stream_name": "{instance_id}/stdout",
            "timezone": "UTC"
          },
          {
            "file_path": "$HOME_DIR/.pm2/logs/occwaypoint-error-0.log",
            "log_group_name": "/oikia/app",
            "log_stream_name": "{instance_id}/stderr",
            "timezone": "UTC"
          }
        ]
      }
    }
  }
}
CWCONFIG
  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
else
  echo "Not on EC2 (or metadata unreachable) — skipping CloudWatch Logs shipping setup."
fi
