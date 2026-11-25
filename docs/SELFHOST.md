# Running Afisa Ugani on a server in Tanzania

Afisa Ugani's backend is written for Convex. Convex's backend is open source, and
the self-hosted build is the same engine that runs Convex Cloud. So the system can
run on one server in Tanzania **without changing any application code**. That
includes realtime updates, offline sync, photo uploads, the monthly and weekly
auto-send jobs, and sign-in.

Everything lives on that one machine:

| Part | What it is | Where the data is |
|---|---|---|
| `postgres` | Database | `pgdata` volume on the server |
| `backend` | Open-source Convex backend | uploaded files in `convexdata` volume |
| `dashboard` | Convex admin dashboard | reachable only through an SSH tunnel |
| `caddy` | HTTPS + hosting for the Field and HQ apps | certificates in `caddy_data` |

Nothing is sent to Convex Cloud, Vercel or Netlify. The backend's usage beacon is
switched off (`DISABLE_BEACON`).

The files are in `deploy/selfhost/`.

## 1. What you need

- **A server in Tanzania.** This can be a VPS in a local data centre or the institute's own machine. Use Ubuntu 22.04 or 24.04.
  - Demo: 2 vCPU, 4 GB RAM, 40 GB SSD.
  - First regions: 4 vCPU, 8 GB RAM, 100 GB+ SSD (photos take most of the space).
- **A public IP** with ports 80 and 443 open.
- **A domain.** Make four DNS A records pointing at the server: `api.`, `site.`, `field.` and `hq.` under your domain (or one wildcard record, `*.afisa.example.co.tz`).
- **Software on the server:** Docker Engine with the compose plugin, Node 22+, pnpm 10, and git.

```bash
curl -fsSL https://get.docker.com | sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs
sudo corepack enable && corepack prepare pnpm@10.28.0 --activate
```

## 2. Start the stack

```bash
git clone <your repo> afisa-ugani && cd afisa-ugani/deploy/selfhost
./setup.sh        # first run: creates .env with fresh secrets, then stops
nano .env         # set DOMAIN=afisa.yourdomain.co.tz and ACME_EMAIL
./setup.sh        # pulls images, starts everything, saves the admin key
```

`setup.sh` writes `.convex-admin.env`. That file holds the admin key, which has full
control of the backend, so keep it off shared drives.

## 3. Deploy the code and the apps

```bash
./deploy.sh
```

This pushes `packages/backend/convex` to your server and builds both apps against
`https://api.<domain>`. It then publishes them at `https://field.<domain>` and
`https://hq.<domain>`. Run it again after every update.

`./deploy.sh backend` pushes only the backend; `./deploy.sh apps` publishes only the apps.

## 4. Create root and a council

`cx.sh` is the normal Convex CLI pointed at your server. Use it wherever
`docs/DEPLOY.md` says `npx convex ... --prod`, and drop the `--prod`.

```bash
./cx.sh run admin:bootstrapRoot '{"username":"900000009","password":"<strong password>","name":"Msimamizi wa Mfumo"}'
./cx.sh run admin:createCouncil '{"name":"Halmashauri ya Mji wa Bagamoyo","region":"Pwani"}'
```

From here, continue with step 4 of `docs/DEPLOY.md` ("Seat the Head of Department").

## 5. Backups

```bash
./backup.sh       # Convex snapshot (data + files) and a pg_dump, kept 14 days
crontab -e        # 15 1 * * * /home/<you>/afisa-ugani/deploy/selfhost/backup.sh >> /var/log/afisa-backup.log 2>&1
```

To restore, run `./cx.sh import --replace-all -y backups/afisa-<date>.zip`. Copy
`backups/` off the server too, for example to another machine at the institute.

## 6. Admin dashboard

The dashboard only listens on the server itself. Open it through an SSH tunnel:

```bash
ssh -L 6791:127.0.0.1:6791 user@server     # then open http://localhost:6791
```

Sign in with the key in `.convex-admin.env`. The dashboard shows tables, logs,
functions, crons and files, the same as on Convex Cloud.

## 7. Moving existing data from Convex Cloud (optional)

For a demo, a fresh start is simpler. If you do need the cloud data:

```bash
./migrate-from-cloud.sh
```

Everyone has to sign in again afterwards, because the new server signs tokens
with its own key.

## Offline demo (no internet in the room)

The Field app needs HTTPS for offline use, the camera and GPS. Without internet,
Let's Encrypt cannot issue certificates, so:

1. In `Caddyfile`, uncomment `local_certs`, then run `docker compose restart caddy`.
2. Copy Caddy's root certificate out of the container:
   `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./afisa-root.crt`
3. Install `afisa-root.crt` as a trusted CA on each demo phone and laptop.
4. Make the four names resolve to the laptop's LAN IP on the demo Wi-Fi. You can do this with a DNS entry on the router, or with `/etc/hosts` on laptops.

The simplest demo is the online setup with a real domain. A phone hotspot is enough
for the audience's devices.

## Showing the institute where the data lives

- `docker compose ps`: every service is running on their server.
- `docker volume inspect afisa-ugani_pgdata`: the database files are on this disk.
- `./cx.sh data`: the tables, read straight from the local backend.
- Disconnect the server from the internet, keep it on the LAN, and show that HQ and the Field app still sync. This works best with the offline-demo setup above.
- In the apps' network tab, every request goes to `api.<your domain>`.

## Limits to tell funders about

- **One machine.** Self-hosted Convex runs as one backend process, not a cluster. That is fine for a pilot and a few regions. For nationwide use, plan for a larger server, nightly off-site backups, and a tested restore. Each region could also get its own instance.
- **You run the upgrades.** Pin `CONVEX_VERSION` once the demo works. Before every upgrade, run `./backup.sh`, then follow the upstream guide: https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/upgrading.md
- **Uploaded files are on local disk.** If photos outgrow the disk, the backend can store them in any S3-compatible store, such as MinIO on a second local server. That uses the `S3_*` variables in the upstream guide.
