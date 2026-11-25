#!/usr/bin/env bash
# First-time setup of the self-hosted stack. Safe to run again.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

command -v docker >/dev/null || { echo "Docker is not installed (https://docs.docker.com/engine/install/ubuntu/)."; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required."; exit 1; }

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^INSTANCE_SECRET=__GENERATE__/INSTANCE_SECRET=$(openssl rand -hex 32)/" .env
  sed -i "s/^POSTGRES_PASSWORD=__GENERATE__/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
  chmod 600 .env
  echo "Created deploy/selfhost/.env with fresh secrets."
  echo "Set DOMAIN and ACME_EMAIL in it, point DNS at this server, then run ./setup.sh again."
  exit 0
fi

set -a; . ./.env; set +a
case "$DOMAIN" in *example*) echo "Set DOMAIN in deploy/selfhost/.env first."; exit 1;; esac

# Placeholder pages until ./deploy.sh builds the apps.
for app in field hq; do
  mkdir -p "www/$app"
  [ -f "www/$app/index.html" ] || echo "<h1>Afisa Ugani $app: not deployed yet</h1>" > "www/$app/index.html"
done

docker compose pull
docker compose up -d

echo -n "Waiting for the backend"
for _ in $(seq 1 60); do
  if docker compose exec -T backend curl -sf http://localhost:3210/version >/dev/null 2>&1; then echo " ready."; break; fi
  echo -n "."; sleep 2
done
docker compose exec -T backend curl -sf http://localhost:3210/version >/dev/null || { echo; echo "Backend did not start: docker compose logs backend"; exit 1; }

if [ ! -f .convex-admin.env ]; then
  KEY="$(docker compose exec -T backend ./generate_admin_key.sh | tr -d '\r' | tail -n 1)"
  umask 077
  cat > .convex-admin.env <<EOF
CONVEX_SELF_HOSTED_URL=https://api.${DOMAIN}
CONVEX_SELF_HOSTED_ADMIN_KEY=${KEY}
EOF
  echo "Saved the admin key to deploy/selfhost/.convex-admin.env (keep it secret)."
fi

cat <<EOF

Stack is up. Next:
  ./deploy.sh                                    push the backend code and publish both apps
  ./cx.sh run admin:bootstrapRoot '{"username":"900000009","password":"<strong>","name":"Msimamizi wa Mfumo"}'

Field:  https://field.${DOMAIN}
HQ:     https://hq.${DOMAIN}
API:    https://api.${DOMAIN}
EOF
