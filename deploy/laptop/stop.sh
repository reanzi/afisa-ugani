#!/usr/bin/env bash
# Take the backend off the internet and stop it. Data is kept.
#   ./stop.sh          stop
#   ./stop.sh --wipe   stop AND delete all data (database + uploaded files)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

sudo tailscale funnel --https=443 off >/dev/null 2>&1 || true
sudo tailscale funnel --https=8443 off >/dev/null 2>&1 || true

if [ "${1:-}" = "--wipe" ]; then
  read -r -p "Delete ALL Afisa Ugani data on this laptop? Type YES: " ok
  [ "$ok" = YES ] || exit 1
  docker compose down -v
  rm -f .convex-admin.env
  echo "Stopped and wiped. ./start.sh starts fresh (secrets in .env are kept)."
else
  docker compose stop
  echo "Stopped. ./start.sh brings it back with the same data."
fi
