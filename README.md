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

From `packages/backend` (add `--prod` on the production deployment):

```bash
npx convex run admin:bootstrapRoot '{"username":"90000009","password":"<Storng Password>,"name":"Msimamizi"}'
npx convex run admin:createCouncil '{"name":"Halmashauri ya Mji ya Bagamoyo","code":"BAGAMOYO-TC","region":"Pwani"}'
npx convex run admin:addAreas '{"councilCode":"BAGAMOYO-TC","wards":[{"name":"Yombo","villages":["Kisutu","Nianjema"]}]}'
```

Then:

1. A council takes sign-ups only once it has addresses (at least one ward with villages): load the NaPA file in HQ (**Halmashauri zote** or the council's **Maeneo**), or use `admin:addAreas`.
2. Each section (Kilimo, Mifugo, Uvuvi) has its own sign-up code, shown in the side menu of the Head of Department (all three) and of everyone in that section (their own), and on "Mimi" in the Field app. Signing up with a section code puts the person straight into that section. The council code (root gives it to the HoD) still works and lets them pick the section. Older deployments: `npx convex run admin:backfillSectionCodes` (HQ also makes them on first view).
3. Everyone signs up in three steps, in HQ or the Field app: the council code, then their section (and, in the Field app, their ward and village; HQ staff are based at head office and their lead can add stations later), then their name, check number, phone and password. One button creates the account and sends the request. Nobody picks a role: each new member is a **guest** (`Mgeni`) until approved. Section and area are only hints for whoever approves.
4. Root opens the council with the switcher and, under **Maombi**, gives the Head of Department the role **Mkuu wa Idara**.
5. The HoD (and vice) then give roles and designations to everyone else; section heads approve guests of their own section as officers. An officer's designation follows their section (Crop, Livestock or Fisheries Officer); village or ward level is set from the areas they are assigned.

`seatMember` and `makeRoot` only promote accounts that already exist. To create an account from the CLI, use `admin:createAccount`.

`admin:*` functions are internal: only someone holding the deployment key can call them, from the CLI or the Convex dashboard.

For a full showcase deployment (Convex Cloud plus static hosting for both apps), see [docs/DEPLOY.md](docs/DEPLOY.md).

## Names

Names of people, councils, regions, wards, villages and streets are stored in lower case and shown capitalised (`presentName` in `packages/shared/src/names.ts`: "Halmashauri ya Mji wa Bagamoyo", "Bagamoyo TC"). After upgrading a deployment that already has data, convert it once:

```bash
npx convex run admin:lowercaseNames
```

## Starting over (wipe)

Root can wipe the whole system: every council with its addresses, members, records, reports and photos, and every account except root. Settings (such as the minimum app version) stay. It is off unless the deployment allows it:

```bash
npx convex env set ALLOW_WIPE true        # allow (never on production you care about)
# then in HQ: Halmashauri zote → Futa mfumo… and type FUTA KILA KITU
# or from the CLI:
npx convex run wipe:startFromCli '{"confirm":"FUTA KILA KITU"}'
npx convex run wipe:statusFromCli
npx convex env remove ALLOW_WIPE          # forbid again
```

The wipe runs in batches in the background; removing `ALLOW_WIPE` stops it at the next batch. Phones that still hold old records are signed out and must sign up again.

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

The backend deploys first, then each app is built against it. Step-by-step hosting instructions are in [docs/DEPLOY.md](docs/DEPLOY.md). Serve `apps/*/dist` from any static host over HTTPS. The PWA needs HTTPS for the service worker, camera and GPS.

## Generated Convex code

`packages/backend/convex/_generated` is committed. `npx convex dev` regenerates it. Where no deployment is reachable (a sandbox, a first CI run), `node packages/backend/scripts/codegen-offline.mjs` writes equivalent files. Replace them with the official output from `npx convex dev` when you can.
