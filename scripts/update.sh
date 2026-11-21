#!/usr/bin/env bash
# Pull the newest Home Chime code and restart the dashboard service.
#
# Installed on the Raspberry Pi by deploy/home-chime-update.timer. The kiosk
# reloads itself when the build fingerprint changes, so no one has to touch the
# wall display after an update.
set -euo pipefail

APP_DIR="${HOME_CHIME_APP_DIR:-/home/pi/home-chime}"
APP_USER="${HOME_CHIME_APP_USER:-pi}"
SERVICE="${HOME_CHIME_SERVICE:-home-chime}"

if [ ! -d "$APP_DIR/.git" ]; then
  echo "Home Chime checkout not found at $APP_DIR." >&2
  exit 1
fi

cd "$APP_DIR"

# Never fight with hand edits on the Pi; a dirty checkout is left untouched.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Skipping update: $APP_DIR has tracked local changes." >&2
  exit 0
fi

before="$(git rev-parse HEAD)"
git pull --ff-only --quiet
after="$(git rev-parse HEAD)"

if [ "$before" = "$after" ]; then
  echo "Already up to date at ${after:0:8}."
  exit 0
fi

# Home Chime has no runtime dependencies today; this keeps a future dependency
# from being forgotten. It never rewrites package-lock.json in the checkout.
npm install --omit=dev --no-package-lock --no-audit --no-fund >/dev/null 2>&1 || true

# The timer runs as root, so give the checkout back to the normal Pi user.
if [ "$(id -u)" = "0" ]; then
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR" 2>/dev/null || true
fi

systemctl restart "$SERVICE"
echo "Updated ${before:0:8} -> ${after:0:8} and restarted $SERVICE."
