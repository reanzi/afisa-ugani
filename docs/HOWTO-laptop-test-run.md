# How to: test-run Afisa Ugani on my laptop (Tanzania-hosted demo)

**Goal:** the backend and database run on my Ubuntu laptop, so the data stays in Tanzania. The Field and HQ apps stay on Vercel and reach the laptop through Tailscale Funnel.

**Files needed:**
- `selfhost-convex.patch`, already applied on the `selfhost` branch
- `laptop-server.patch`, which adds `deploy/laptop/` and `docs/LAPTOP.md`

Full details are in `docs/LAPTOP.md` once the patch is applied.

---

## Before starting

- [ ] The laptop is booted into **Ubuntu** (22.04 or 24.04).
- [ ] I have a **Tailscale account** (free at https://login.tailscale.com).
- [ ] The laptop is on mains power with a stable internet connection.
- [ ] The backend code in `packages/backend/convex` **typechecks**. `start.sh` pushes whatever is there, uncommitted work included.

## 1. Apply the patch and push the branch

```bash
cd /path/to/your/afisa-ugani
git checkout selfhost
git apply laptop-server.patch
git add deploy/laptop docs/LAPTOP.md
git commit -m "Laptop self-host kit (Tailscale Funnel)"
git push -u origin selfhost
```

> Push with `-u`. Without an upstream branch, `install.sh` stops at `git pull`.
> Vercel previews also need the branch pushed.

## 2. Install everything (once)

Run this from inside the repo, so it reuses this clone instead of cloning a second one:

```bash
AFISA_DIR="$(pwd)" bash deploy/laptop/install.sh
```

This installs Docker, Node 22, pnpm, Tailscale and jq, and runs `pnpm install`.

## 3. Connect Tailscale and enable Docker for my user

```bash
sudo tailscale up      # sign in through the link it shows
newgrp docker          # or log out and back in
```

## 4. Start the server

```bash
deploy/laptop/start.sh
```

- **First run only:** Tailscale prints a link to allow **Funnel** and **HTTPS** for my tailnet. Open it, allow both, and the script continues.
- At the end it prints my public address, for example `https://sote.tailXXXX.ts.net`. **Write this address down.**
- It should also print `Checking the public address... ok`. If it prints a **WARNING** instead, sign-in will fail. See Troubleshooting.

## 5. Create the root account (once)

```bash
deploy/laptop/cx.sh run admin:bootstrapRoot '{"username":"900000009","password":"<strong password>","name":"Msimamizi wa Mfumo"}'
```

## 6. Point the Vercel apps at the laptop

In **both** Vercel projects (Field and HQ), open Settings → Environment Variables.

- **Option A (simple):** set `VITE_CONVEX_URL` to the address from step 4, then go to Deployments → ⋯ → **Redeploy**.
- **Option B (production stays on Convex Cloud):** set `VITE_CONVEX_URL` only for **Preview**, limited to the `selfhost` branch. Then demo from the `selfhost` preview URLs.

> A redeploy is required, because Vite bakes the URL into the build.

## 7. Test like a real user

- [ ] On a **phone using mobile data** (not the laptop's Wi-Fi), open HQ and sign in as root.
- [ ] Create a council (Halmashauri) and seat a Head of Department (see `docs/DEPLOY.md`, step 4).
- [ ] On another phone, sign up in the Field app with the council code and record an entry.
- [ ] Check that HQ updates **live**, without a refresh.
- [ ] Turn off the phone's data, record an entry, turn data back on, and check that it syncs.
- [ ] Upload a photo and check that it opens in HQ.

---

## Everyday commands (run in `deploy/laptop/`)

| Command | What it does |
|---|---|
| `./start.sh` | Start, push the latest backend code, re-open Funnel |
| `./start.sh --no-push` | Start without pushing code (use after a reboot) |
| `./stop.sh` | Take it off the internet and stop it (data kept) |
| `./stop.sh --wipe` | Stop and **delete all data** |
| `./backup.sh` | Snapshot plus Postgres dump into `backups/`; copy them off the laptop |
| `./cx.sh logs` | Live backend logs |
| `./cx.sh data` | List tables |
| `./cx.sh env set NAME value` | Set a backend environment variable (e.g. `ALLOW_WIPE true`) |

**Dashboard:** http://127.0.0.1:6791 on the laptop. Sign in with the key in `deploy/laptop/.convex-admin.env`.

## Before a real demo

- [ ] Stop the laptop sleeping. In Settings → Power, set automatic suspend to Off. Then keep it awake with the lid closed:
  `sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf && sudo systemctl restart systemd-logind`
- [ ] Run `./start.sh --no-push` and check that the address works.
- [ ] Run `./backup.sh`.
- [ ] Do the step 7 test once more.

## Showing the institute that the data is in Tanzania

- `docker compose -f deploy/laptop/docker-compose.yml ps`: everything is running on this laptop.
- `docker volume inspect afisa-laptop_pgdata`: the database files are on this disk.
- In the browser's Network tab, every data request goes to my own `*.ts.net` address, not `convex.cloud`.

## Troubleshooting

| Problem | What to check |
|---|---|
| `install.sh` stops at `git pull` | Run `git push -u origin selfhost` first |
| "Docker is not usable" | Run `newgrp docker`, or log out and back in |
| `start.sh` prints the JWKS **WARNING** | Run `tailscale funnel status`. Did I allow Funnel through the link? |
| Backend does not start | `docker compose -f deploy/laptop/docker-compose.yml logs backend` |
| Push (`cx.sh deploy`) fails | A TypeScript error in `packages/backend/convex`. Fix it, or use `./start.sh --no-push` |
| Apps still talk to Convex Cloud | `VITE_CONVEX_URL` was not set in Vercel, or the app was not redeployed |
| Everyone was logged out | The Tailscale name changed. Update `VITE_CONVEX_URL` in Vercel and redeploy |

When asking Claude for help, send the end of the `start.sh` output, `tailscale funnel status`, and `docker compose logs backend`.

## Known limits

- **The laptop must be on and online** for anyone to use the system. The Field app still records offline and syncs later.
- **Tailscale Funnel has bandwidth limits.** Fine for a demo; not for country-wide use (`deploy/selfhost/` is for a real server).
- **None of this has been run end to end yet.** This is the first real test.
