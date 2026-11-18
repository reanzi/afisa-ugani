# Afisa Ugani

Offline-first field app for Village/Ward Agricultural Extension Officers (VAEO/WAEO), plus the HQ web app that approves officers and manages councils. Officers record their work as it happens, and the app builds the ARDS monthly, quarterly and annual reports from those records.

## Layout

```
apps/
  field/     PWA for officers (Vite, React, Dexie, vite-plugin-pwa, nuqs, react-router)
  hq/        HQ web app (Vite, React, nuqs)
packages/
  backend/   Convex: schema, convex-auth, role guards, audit log, sync
  shared/    Roles, sections, permission rules (used by server and UI), quick actions
  ui/        Design tokens, Shambani/Usiku themes, Swahili formatting
```

Both apps import their types from `@afisa/backend/api`. If a backend change breaks either app, `pnpm typecheck` fails before anything deploys.

## First run (Convex Cloud)

```bash
pnpm install
cd packages/backend
npx convex dev            # log in, create the project; keep it running
```

Copy the deployment URL it prints into `apps/field/.env.local` and `apps/hq/.env.local`:

```
VITE_CONVEX_URL=https://<your-deployment>.convex.cloud
```

Then, in two more terminals:

```bash
pnpm dev:field            # http://localhost:5173
pnpm dev:hq               # http://localhost:5174
```

### Seat the first people

Accounts are created by signing up in the Field app (username + password, usually a phone number). Then, from `packages/backend`:

```bash
npx convex run admin:createCouncil '{"name":"Halmashauri ya Mji ya Bagamoyo","code":"BAMOYO","region":"pwani"}'
npx convex run admin:seatMember '{"username":"100000001","councilCode":"BAMOYO","role":"admin","primarySection":"kilimo","name":"Mkuu Idara Kilimo"}'
npx convex run admin:makeRoot '{"username":"900000009"}'
```
From then on, everything happens in HQ. The HoD adds wards and villages, assigns section heads and approves officers. Section heads approve the officers of their own section.

`admin:*` functions are internal. Only someone holding the deployment key can call them, from the CLI or the dashboard.

## Checks

```bash
pnpm check          # typecheck + tests + builds, every package
```

- `packages/shared`: permission matrix tests.
- `packages/backend`: end-to-end tests on an in-memory Convex with the real convex-auth components. They cover sign-up, joining a council, the approval chain, section grants, hiding root, idempotent sync and ownership.

## Rules that keep offline phones safe

Phones can run a cached app version for weeks, so:

1. **Schema changes are additive only.** Never remove or rename a field a released app still sends.
2. **Payload changes bump `PAYLOAD_VERSION`** in `packages/shared/src/domain.ts`. Keep the old version in `SUPPORTED_PAYLOAD_VERSIONS` until no phone sends it, and upgrade old payloads on the server.
3. **Dexie migrations are new `version()` blocks.** Never edit an old one.
4. **To force an upgrade:** run `npx convex run admin:setMinClientVersion '{"version":"0.2.0"}'`. Older apps show an update notice, and the server still accepts their queued records.

## Deploying

```bash
cd packages/backend
npx convex deploy --cmd "pnpm --filter @afisa/field build" --cmd-url-env-var-name VITE_CONVEX_URL
npx convex deploy --cmd "pnpm --filter @afisa/hq build" --cmd-url-env-var-name VITE_CONVEX_URL
```

The backend deploys first, then each app is built against it. Serve `apps/*/dist` from any static host over HTTPS. The PWA needs HTTPS for the service worker, camera and GPS.

## Generated Convex code

`packages/backend/convex/_generated` is committed. `npx convex dev` regenerates it. Where no deployment is reachable (a sandbox, a first CI run), `node packages/backend/scripts/codegen-offline.mjs` writes equivalent files. Replace them with the official output from `npx convex dev` when you can.
