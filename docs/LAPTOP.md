# Demo server on a laptop (Ubuntu + Tailscale Funnel)

The backend and the database run on your laptop, in Tanzania. The Field and HQ
apps stay on Vercel and talk to the laptop over HTTPS. Application code doesn't
change: the open-source Convex backend runs the same functions, realtime,
uploads, crons and sign-in as Convex Cloud.

```
Phone / browser ──HTTPS──> Vercel (static app files only)
       │
       └──HTTPS (API, realtime)──> Tailscale Funnel ──> your laptop: Convex backend + Postgres
```

Tailscale Funnel gives the laptop a fixed public address such as
`https://sote.tail1234.ts.net`. You don't need a domain, an open router port or a
static IP. Encryption ends on the laptop, so Tailscale relays only bytes it can't read.

## 1. Install (once)

You need a Tailscale account; sign up free at https://login.tailscale.com.

```bash
curl -fsSLO https://raw.githubusercontent.com/reanzi/afisa-ugani/selfhost/deploy/laptop/install.sh
bash install.sh                       # or: bash install.sh git@github.com:reanzi/afisa-ugani.git selfhost
sudo tailscale up                     # sign in
newgrp docker                         # or log out and back in
```

If the repo is private, the `curl` line won't work. Copy `install.sh` over
another way, and pass an SSH URL (or run `gh auth login` first).

`install.sh` installs Docker, Node 22, pnpm, Tailscale and jq. It then clones
the repo to `~/afisa-ugani` on the `selfhost` branch and runs `pnpm install`.

## 2. Start

```bash
~/afisa-ugani/deploy/laptop/start.sh
```

The first time, the script does the following:

- **Creates secrets** in `deploy/laptop/.env`.
- **Starts** Postgres, the backend and the dashboard.
- **Saves the admin key** to `deploy/laptop/.convex-admin.env`.
- **Turns on Funnel.** The first time, Tailscale prints a link: open it and allow Funnel and HTTPS for your tailnet, and the script continues.
- **Pushes `packages/backend/convex`.**
- **Checks** that sign-in tokens can be verified through the public address.

The script ends by printing your address, for example `https://sote.tail1234.ts.net`.

Create root once:

```bash
cd ~/afisa-ugani/deploy/laptop
./cx.sh run admin:bootstrapRoot '{"username":"900000009","password":"<strong password>","name":"Msimamizi wa Mfumo"}'
```

## 3. Point the Vercel apps at the laptop

In **each** Vercel project (Field and HQ), go to Settings → Environment Variables.

**Simplest:** set `VITE_CONVEX_URL` to `https://<your address>`, then redeploy
(Deployments → ⋯ → Redeploy). Vite bakes this value into the build, so a redeploy
is required.

**Keeps production on Convex Cloud:** set `VITE_CONVEX_URL` only for the
**Preview** environment, limited to the `selfhost` branch. Then push the branch:

```bash
git push origin selfhost
```

Vercel builds the branch with its own preview URLs pointing at the laptop.
Production is untouched. Use those preview URLs for the demo.

## Everyday commands (in `deploy/laptop/`)

| Command | What it does |
|---|---|
| `./start.sh` | Start, push latest backend code, re-open Funnel |
| `./start.sh --no-push` | Start without pushing code |
| `./stop.sh` | Close Funnel and stop (data kept) |
| `./stop.sh --wipe` | Stop and delete all data |
| `./backup.sh` | Snapshot + Postgres dump into `backups/` |
| `./cx.sh <convex command>` | Any Convex CLI command against the laptop (`logs`, `data`, `env set`, `run`, `import`) |

The containers restart on their own after a reboot. Funnel stays configured
too. Run `./start.sh --no-push` after a reboot anyway, to check that the address
works.

The dashboard is at http://127.0.0.1:6791 on the laptop. Sign in with the key in
`.convex-admin.env`.

## Before the demo

- **Stop the laptop sleeping.** In Settings → Power, set automatic suspend to Off. Then keep it awake with the lid closed:
  `sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf && sudo systemctl restart systemd-logind`
- **Keep it on mains power and a stable connection** (wired or a good hotspot). Every phone talks to the laptop, so the laptop's upload speed limits everyone.
- **Test from a phone on mobile data**, not the same Wi-Fi as the laptop. Sign in, record an entry, and check that HQ updates live.
- **Run `./backup.sh`** and keep a copy off the laptop.

## Limits

- **The laptop must be on and online** for anyone to use the system. The Field app still records offline and syncs when the laptop is back, as it does with Convex Cloud.
- **Funnel has bandwidth limits** that Tailscale does not publish. That's fine for a demo with tens of users, not for a national rollout. The server kit in `deploy/selfhost/` is for that.
- **Don't rename the laptop in Tailscale.** If the name changes, the address changes. `start.sh` notices and updates the backend, but everyone must sign in again and both Vercel apps need the new `VITE_CONVEX_URL`.
