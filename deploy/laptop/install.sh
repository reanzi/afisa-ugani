#!/usr/bin/env bash
# One-time setup of an Ubuntu laptop (22.04 or 24.04) as the Afisa Ugani server.
# Installs Docker, Node 22, pnpm, Tailscale and jq, then clones the repo.
#
# Works on its own, before the repo is on the laptop:
#   bash install.sh [repo-url] [branch]
# Defaults: https://github.com/reanzi/afisa-ugani.git, branch selfhost.
# For a private repo, use an SSH URL (git@github.com:reanzi/afisa-ugani.git)
# or run `gh auth login` first.
set -euo pipefail

REPO_URL="${1:-https://github.com/reanzi/afisa-ugani.git}"
BRANCH="${2:-selfhost}"
DEST="${AFISA_DIR:-$HOME/afisa-ugani}"
PNPM_VERSION=10.28.0

[ "$(id -u)" -ne 0 ] || { echo "Run as your normal user (the script uses sudo when needed)."; exit 1; }
. /etc/os-release
[ "${ID:-}" = ubuntu ] || echo "Warning: written for Ubuntu, found ${PRETTY_NAME:-unknown}."

step() { printf '\n==> %s\n' "$*"; }

step "Base packages"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git jq openssl

step "Docker Engine"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo systemctl enable --now docker
if ! id -nG "$USER" | grep -qw docker; then
  sudo usermod -aG docker "$USER"
  NEED_RELOGIN=1
fi

step "Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node --version

step "pnpm $PNPM_VERSION"
sudo corepack enable
corepack prepare "pnpm@$PNPM_VERSION" --activate
pnpm --version

step "Tailscale"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
sudo systemctl enable --now tailscaled

step "Repository ($BRANCH)"
if [ -d "$DEST/.git" ]; then
  git -C "$DEST" fetch origin
  git -C "$DEST" checkout "$BRANCH"
  git -C "$DEST" pull --ff-only
else
  git clone --branch "$BRANCH" "$REPO_URL" "$DEST"
fi

step "Project dependencies"
(cd "$DEST" && pnpm install --frozen-lockfile)
chmod +x "$DEST"/deploy/laptop/*.sh

cat <<EOF

Done. Next:
  1. sudo tailscale up            (sign in; first time only)
EOF
if [ "${NEED_RELOGIN:-0}" = 1 ]; then
  echo "  2. Log out and back in (or run: newgrp docker) so Docker works without sudo"
  echo "  3. $DEST/deploy/laptop/start.sh"
else
  echo "  2. $DEST/deploy/laptop/start.sh"
fi
