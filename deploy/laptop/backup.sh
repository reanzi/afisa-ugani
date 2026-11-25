#!/usr/bin/env bash
# Backup: a Convex snapshot (data + uploaded files) and a raw Postgres dump.
# Restore the snapshot with: ./cx.sh import --replace-all -y backups/afisa-<date>.zip
# Copy backups/ to a USB disk or another machine; a laptop is easy to lose.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
mkdir -p backups
TS="$(date +%Y%m%d-%H%M)"

"$HERE/cx.sh" export --include-file-storage --path "$HERE/backups/afisa-$TS.zip"
docker compose exec -T postgres pg_dump -U convex -Fc afisa_ugani > "backups/pg-$TS.dump"
find backups -type f -mtime +14 -delete
echo "Backup done: deploy/laptop/backups/afisa-$TS.zip and pg-$TS.dump"
