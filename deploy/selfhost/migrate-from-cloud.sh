#!/usr/bin/env bash
# Copy everything from the Convex Cloud production deployment into the
# self-hosted one. REPLACES all self-hosted data. Not needed for a fresh demo.
# Everyone has to sign in again afterwards: the new server signs tokens with
# its own key.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
mkdir -p "$HERE/backups"
SNAP="$HERE/backups/from-cloud-$(date +%Y%m%d-%H%M).zip"

read -r -p "This replaces ALL data on the self-hosted server. Type YES to continue: " ok
[ "$ok" = YES ] || exit 1

# 1. Export from Convex Cloud (uses packages/backend/.env.local as usual).
(cd "$ROOT/packages/backend" && pnpm exec convex export --prod --include-file-storage --path "$SNAP")

# 2. Code first, so the schema and components exist, then the data.
"$HERE/cx.sh" deploy
"$HERE/cx.sh" import --replace-all -y "$SNAP"
echo "Imported $SNAP. Copy any environment variables too: ./cx.sh env set NAME value"
