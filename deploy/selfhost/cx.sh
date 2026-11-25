#!/usr/bin/env bash
# The Convex CLI, aimed at the self-hosted backend instead of Convex Cloud.
#   ./cx.sh deploy
#   ./cx.sh run admin:createCouncil '{"name":"...","region":"Pwani"}'
#   ./cx.sh env set ALLOW_WIPE true
#   ./cx.sh logs
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

[ -f "$HERE/.convex-admin.env" ] || { echo "Run ./setup.sh first (no .convex-admin.env)."; exit 1; }
set -a; . "$HERE/.convex-admin.env"; set +a

# packages/backend/.env.local sets CONVEX_DEPLOYMENT (Convex Cloud). An empty
# value in the shell wins over that file, and the CLI treats empty as unset.
export CONVEX_DEPLOYMENT=
unset CONVEX_DEPLOY_KEY

cd "$ROOT/packages/backend"
exec pnpm exec convex "$@"
