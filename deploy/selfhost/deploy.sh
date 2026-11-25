#!/usr/bin/env bash
# Push backend functions and publish the Field and HQ apps. Run after each update.
#   ./deploy.sh            backend + both apps
#   ./deploy.sh backend    functions only
#   ./deploy.sh apps       apps only
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
set -a; . "$HERE/.env"; set +a
WHAT="${1:-all}"

cd "$ROOT"
pnpm install --frozen-lockfile

if [ "$WHAT" = all ] || [ "$WHAT" = backend ]; then
  "$HERE/cx.sh" deploy
fi

if [ "$WHAT" = all ] || [ "$WHAT" = apps ]; then
  # A shell variable beats the apps' .env.local, which points at Convex Cloud.
  export VITE_CONVEX_URL="https://api.${DOMAIN}"
  pnpm build:field
  pnpm build:hq
  for app in field hq; do
    # Swap the whole folder at once so nobody loads a half-copied build.
    rm -rf "$HERE/www/.$app.new" "$HERE/www/.$app.old"
    cp -r "$ROOT/apps/$app/dist" "$HERE/www/.$app.new"
    [ -d "$HERE/www/$app" ] && mv "$HERE/www/$app" "$HERE/www/.$app.old"
    mv "$HERE/www/.$app.new" "$HERE/www/$app"
    rm -rf "$HERE/www/.$app.old"
  done
  echo "Published https://field.${DOMAIN} and https://hq.${DOMAIN}"
fi
