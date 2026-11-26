# eKilimo integration checklist

**Status:** planning only. Nothing is implemented. Start once permission is granted.
**Goal:** share members (officers) and chosen resources between Afisa Ugani (Convex, self-hosted) and eKilimo (Angular + Spring Boot).

All of this works the same whether Afisa Ugani runs on Convex Cloud, on a self-hosted server (`deploy/selfhost/`) or on the laptop (`deploy/laptop/`). Only the base URLs change.

---

## Phase 0: Permission and decisions (before any code)

### Permissions
- [ ] Written permission from the eKilimo system owner to integrate.
- [ ] A named technical contact on the eKilimo side (Spring Boot backend).
- [ ] Agreement on which personal data is shared (names, phone numbers, check numbers) and its legal basis. Tanzania's Personal Data Protection Act applies.
- [ ] Agreement on where each system is hosted. Both should be in Tanzania, to keep the data-residency promise.
- [ ] Access to the eKilimo repo, or at least: the user/member entity, the auth configuration and the API docs.

### Decisions (write the answers here)

| # | Question | Options | Decision |
|---|---|---|---|
| D1 | Who **owns** member records? | Afisa Ugani / eKilimo / each keeps its own, linked by check number | |
| D2 | **Matching key** for a person in both systems | Public-service **check number** (recommended) / phone / national ID | |
| D3 | **Sign-in** | Separate logins / eKilimo trusts Afisa Ugani logins / Afisa Ugani trusts eKilimo logins | |
| D4 | **Shared resources**, and who may change them | councils, wards/villages (`areas`), slaughterhouses, submitted reports, … | |
| D5 | **Direction and timing** | eKilimo pulls on demand / Afisa Ugani pushes on change / both | |
| D6 | Does the **Angular** app need **live** updates? | Yes (Convex JS client) / No (REST is enough) | |

> Rule: each record type has exactly **one owner**. The other side reads it, or sends change *requests*. Never sync the same records both ways.

---

## Phase 1: Integration options (pick per decision above)

### Option A: Afisa Ugani exposes a REST API (eKilimo pulls)
For D5 = pull. This is the safest option: Afisa Ugani's own permission checks stay in charge.

- [ ] Create `packages/backend/convex/http.ts` with `httpRouter()`. It doesn't exist yet.
- [ ] Add an API-key check. Store the key with `cx.sh env set EKILIMO_API_KEY <random>` and compare it to the `Authorization: Bearer` header. Never accept the Convex admin key from eKilimo.
- [ ] Endpoints (read-only first, versioned under `/ekilimo/v1/`):
  - [ ] `GET /ekilimo/v1/members?council=<code>&updatedSince=<ms>`: active memberships with name, check number, phone, role, sections, level, areas.
  - [ ] `GET /ekilimo/v1/members/<checkNumber>`
  - [ ] `GET /ekilimo/v1/councils` and `GET /ekilimo/v1/councils/<code>/areas`
  - [ ] `GET /ekilimo/v1/slaughterhouses?council=<code>` (if chosen in D4)
  - [ ] `GET /ekilimo/v1/reports?council=<code>&period=<yyyy-mm>` (if chosen in D4; submitted reports only)
- [ ] Add an index on `users.checkNumber` in `schema.ts` (`by_checkNumber`); lookups by check number need it.
- [ ] Add `updatedAt` to `users` and `memberships` (set it on every write) so eKilimo can fetch only what changed.
- [ ] Paginate (limit + cursor). Never return whole tables.
- [ ] Never include `isRoot` users, password data or audit details.
- [ ] Write every eKilimo call to `auditLog` (who, what, how many records).
- [ ] Base URL: `https://site.<domain>` (server), `https://<laptop>.ts.net:8443` (laptop), `https://<name>.convex.site` (cloud).

### Option B: Afisa Ugani pushes changes to eKilimo (webhooks)
For D5 = push.

- [ ] eKilimo provides an endpoint (e.g. `POST /api/afisa-ugani/events`) and a shared secret.
- [ ] In Convex, after a member is approved, changes role, or is suspended, call `ctx.scheduler.runAfter(0, internal.ekilimo.notify, {...})`.
- [ ] `internal.ekilimo.notify` is an **action** that does `fetch()` to eKilimo with an HMAC signature header. Retry with back-off on failure, and give up after N tries with a log entry.
- [ ] Event payload: `{ event: "member.approved" | "member.updated" | "member.suspended", checkNumber, councilCode, ..., occurredAt, eventId }`.
- [ ] eKilimo must ignore duplicate `eventId`s (deliveries can repeat).
- [ ] Settings: `EKILIMO_WEBHOOK_URL`, `EKILIMO_WEBHOOK_SECRET` (via `cx.sh env set`).

### Option C: Single sign-on
**C1: eKilimo (Spring Boot) accepts Afisa Ugani logins.**
- [ ] In Spring Security, configure a JWT resource server:
  - `jwk-set-uri`: `https://api.<domain>/.well-known/jwks.json`
  - `issuer`: `https://api.<domain>/components/auth`
  - audience: `convex-auth`, algorithm `ES256`
- [ ] Map the token's user to eKilimo's user by check number. Confirm which claim carries the user id; it may need a lookup through Option A.
- [ ] Angular gets the token from the Afisa Ugani sign-in and sends it as `Authorization: Bearer`.

**C2: Afisa Ugani accepts eKilimo logins** (if eKilimo has Keycloak or Spring Authorization Server).
- [ ] Add eKilimo's issuer as a `customJwt`/OIDC provider in `packages/backend/convex/auth.config.ts`, next to `convexAuthProvider()`.
- [ ] Link identities by check number in `users.ts` (`createUser` / `onSignIn`).
- [ ] Decide what happens to officers who exist in only one system.

### Option D: Angular uses Convex directly (live data)
For D6 = yes.
- [ ] `npm i convex` in the Angular app.
- [ ] Create one `ConvexClient` service (from `convex/browser`) pointing at `https://api.<domain>`.
- [ ] Wrap `client.onUpdate(api.x.y, args, cb)` in an RxJS `Observable` and unsubscribe on destroy.
- [ ] Share types: publish `@afisa/backend` `api` types to the Angular repo (copy `_generated`, or a small npm package).
- [ ] Only works with a signed-in user (needs C1 or C2), because Convex functions check membership.

### Never do this
- [ ] ~~Let Spring Boot read or write Convex's Postgres directly.~~ Convex stores documents in its own internal format. Direct access bypasses permission checks and can corrupt data.
- [ ] ~~Give eKilimo the Convex admin key.~~ It can do anything, including wipe.

---

## Phase 2: Build (in this order)

1. [ ] Branch `ekilimo-integration` from `main` (or from `selfhost` if testing on the laptop).
2. [ ] Schema: `users.by_checkNumber` index, plus `updatedAt` on `users` and `memberships`.
3. [ ] Option A, read-only member endpoints + API key + audit log.
4. [ ] Tests in `packages/backend/convex/*.test.ts` (convex-test): wrong or missing key gives 401; root is never returned; pagination works.
5. [ ] Test against the laptop backend with `curl` and a Spring Boot `RestClient`.
6. [ ] Option B webhooks (if chosen).
7. [ ] Option C SSO (if chosen).
8. [ ] Option D in Angular (if chosen).

## Phase 3: Security review
- [ ] API keys and webhook secrets are random, stored only in env vars, and can be rotated.
- [ ] Every endpoint checks the key first and returns the minimum fields.
- [ ] Rate limit per key (e.g. `convex-helpers` rate limiter).
- [ ] HTTPS only. Requests on both sides happen server-to-server where possible.
- [ ] Audit log reviewed by root.
- [ ] Data-sharing agreement signed.

## Phase 4: Rollout
- [ ] Pilot with one council (Bagamoyo) on both systems.
- [ ] Reconcile: the count of shared members on both sides matches, and mismatched check numbers are listed.
- [ ] Monitoring: failed webhooks and 401s show up in `cx.sh logs`.
- [ ] Documented runbook: rotating keys, re-syncing a council, switching the integration off (unset the env vars).

---

## Afisa Ugani facts the eKilimo team will need

| Item | Value |
|---|---|
| Person key | `users.checkNumber` (public-service check number; also the sign-in name) |
| Member record | `memberships` (one per user per council): `role`, `status`, `primarySection`, `sections`, `level`, `areaIds` |
| Sections | crops (`kilimo`), livestock (`mifugo`), fisheries (`uvuvi`) |
| Councils | `councils`, joined with an 8-character council code |
| Locations | `areas` (wards, villages/mitaa, from NaPA address reports) |
| Token issuer (SSO) | `https://api.<domain>/components/auth`, audience `convex-auth`, ES256, JWKS at `/.well-known/jwks.json` |
| HTTP endpoints base | `https://site.<domain>` (self-hosted server) |

## Open questions
- [ ] Does eKilimo already have officer records? How many, and do they carry check numbers?
- [ ] Does eKilimo use Keycloak, Spring Authorization Server or its own login?
- [ ] Which eKilimo screens would show Afisa Ugani data?
- [ ] Who hosts eKilimo, and where?
