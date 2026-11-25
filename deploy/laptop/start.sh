#!/usr/bin/env bash
# Start (or restart) the backend on this laptop and publish it with Tailscale
# Funnel. Safe to run every time: the first run also creates secrets, the admin
# key and pushes the backend code.
#   ./start.sh            start and push backend code
#   ./start.sh --no-push  start only
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
PUSH=1; [ "${1:-}" = "--no-push" ] && PUSH=0

docker info >/dev/null 2>&1 || { echo "Docker is not usable. Log out and in after install.sh, or run: newgrp docker"; exit 1; }

# 1. Tailscale address
if ! tailscale status >/dev/null 2>&1; then
  echo "Tailscale is not connected. Run: sudo tailscale up"; exit 1
fi
TS_HOST="$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')"
[ -n "$TS_HOST" ] && [ "$TS_HOST" != null ] || { echo "Could not read the Tailscale hostname."; exit 1; }

# 2. Secrets (created once, never changed)
if [ ! -f .env ]; then
  umask 077
  cat > .env <<EOF
INSTANCE_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
CONVEX_VERSION=latest
TS_HOST=$TS_HOST
EOF
  echo "Created deploy/laptop/.env with fresh secrets."
fi
CURRENT_HOST="$TS_HOST"
set -a; . ./.env; set +a
if [ "$TS_HOST" != "$CURRENT_HOST" ]; then
  echo "The Tailscale name changed ($TS_HOST -> $CURRENT_HOST)."
  echo "Updating .env. Everyone must sign in again, and both Vercel apps need the new VITE_CONVEX_URL."
  sed -i "s/^TS_HOST=.*/TS_HOST=$CURRENT_HOST/" .env
  TS_HOST="$CURRENT_HOST"
fi

# 3. Containers
docker compose up -d
echo -n "Waiting for the backend"
for _ in $(seq 1 90); do
  if curl -sf http://127.0.0.1:3210/version >/dev/null; then echo " ready."; break; fi
  echo -n "."; sleep 2
done
curl -sf http://127.0.0.1:3210/version >/dev/null || { echo; echo "Backend did not start. See: docker compose -f $HERE/docker-compose.yml logs backend"; exit 1; }

# 4. Admin key (once)
if [ ! -f .convex-admin.env ]; then
  KEY="$(docker compose exec -T backend ./generate_admin_key.sh | tr -d '\r' | tail -n 1)"
  umask 077
  printf 'CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210\nCONVEX_SELF_HOSTED_ADMIN_KEY=%s\n' "$KEY" > .convex-admin.env
  echo "Saved the admin key to deploy/laptop/.convex-admin.env (keep it secret)."
fi

# 5. Public HTTPS through Tailscale Funnel (443 = API, 8443 = HTTP actions).
#    The first time, Tailscale may print a link to enable Funnel for your tailnet.
sudo tailscale funnel --bg 3210 >/dev/null
sudo tailscale funnel --bg --https=8443 3211 >/dev/null

# 6. Push the backend functions
if [ "$PUSH" = 1 ]; then
  "$HERE/cx.sh" deploy
fi

# 7. Self-test: Convex Auth needs the backend to fetch its own public JWKS.
echo -n "Checking the public address"
OK=0
for _ in $(seq 1 30); do
  if docker compose exec -T backend curl -sf "https://$TS_HOST/.well-known/jwks.json" >/dev/null 2>&1; then OK=1; break; fi
  echo -n "."; sleep 2
done
if [ "$OK" = 1 ]; then
  echo " ok."
else
  echo
  echo "WARNING: the backend cannot reach https://$TS_HOST/.well-known/jwks.json."
  echo "Sign-in will fail until it can. Check: tailscale funnel status"
fi

cat <<EOF

Backend is live:   https://$TS_HOST
Dashboard (local): http://127.0.0.1:6791   (admin key in deploy/laptop/.convex-admin.env)

In Vercel, set VITE_CONVEX_URL=https://$TS_HOST for both apps, then redeploy.
First time only, create root:
  $HERE/cx.sh run admin:bootstrapRoot '{"username":"900000009","password":"<strong>","name":"Msimamizi wa Mfumo"}'
EOF
