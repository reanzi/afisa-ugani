#!/usr/bin/env bash
# Nightly backup: a Convex snapshot (data + uploaded files, restorable with
# `./cx.sh import --replace-all <zip>`) and a raw Postgres dump. Keeps 14 days.
# cron: 15 1 * * * /path/to/deploy/selfhost/backup.sh >> /var/log/afisa-backup.log 2>&1
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
mkdir -p backups
TS="$(date +%Y%m%d-%H%M)"

"$HERE/cx.sh" export --include-file-storage --path "$HERE/backups/afisa-$TS.zip"
docker compose exec -T postgres pg_dump -U convex -Fc afisa_ugani > "backups/pg-$TS.dump"
find backups -type f -mtime +14 -delete
echo "Backup done: backups/afisa-$TS.zip, backups/pg-$TS.dump"
