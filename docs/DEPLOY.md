# Deploying Afisa Ugani for a showcase

This takes about 30 minutes the first time. You end up with:

- the backend on Convex Cloud (production deployment);
- the **Field app** (officers' PWA) at its own HTTPS address;
- the **HQ app** at another HTTPS address;
- a root account, one council, its wards and villages, and a Head of Department ready to approve officers.

You need Node 22+, pnpm 10, a Convex account, and an account on one static host (Netlify, Cloudflare Pages or Vercel; all have free tiers). Commands run from the repo root unless a step says otherwise.

## 1. Deploy the backend

```bash
pnpm install
cd packages/backend
npx convex deploy            # first time: confirms the production deployment
```

Note the production URL it prints, e.g. `https://happy-otter-123.convex.cloud`. Both apps need it.

## 2. Create the root account and the council

Still in `packages/backend`. Every command takes `--prod`:

```bash
npx convex run --prod admin:bootstrapRoot '{"username":"900000009","password":"<a strong password>","name":"Msimamizi wa Mfumo"}'

npx convex run --prod admin:createCouncil '{"name":"Halmashauri ya Mji ya Bagamoyo","code":"BAGAMOYO-TC","region":"Pwani"}'

npx convex run --prod admin:addAreas '{"councilCode":"BAGAMOYO-TC","wards":[
  {"name":"Dunda","villages":["Kisutu","Nianjema"]},
  {"name":"Magomeni","villages":["Kitopeni","Mwanakalenge"]}
]}'
```

- `bootstrapRoot` creates the account and makes it root in one step. Running it again is safe.
- Keep the root password somewhere safe. Root can see and do everything, and nobody else can see root.
- Councils can also be created later by root in HQ, on the **Halmashauri** page.

## 3. Build and host the two apps

Build both against the production URL:

```bash
cd ../..
VITE_CONVEX_URL=https://happy-otter-123.convex.cloud pnpm build:field
VITE_CONVEX_URL=https://happy-otter-123.convex.cloud pnpm build:hq
```

Then upload `apps/field/dist` and `apps/hq/dist` as **two separate sites**. Each app already includes the files its host needs to serve the app on every route (`_redirects` for Netlify and Cloudflare Pages, `vercel.json` for Vercel).

**Netlify** (simplest): drag each `dist` folder onto app.netlify.com/drop, or use the CLI:
```bash
npx netlify deploy --prod --dir apps/field/dist
npx netlify deploy --prod --dir apps/hq/dist
```

**Cloudflare Pages:**
```bash
npx wrangler pages deploy apps/field/dist --project-name afisa-ugani
npx wrangler pages deploy apps/hq/dist --project-name afisa-ugani-hq
```

**Vercel:** import the repo twice. Set Root Directory to `apps/field` (then `apps/hq`), Build Command to `cd ../.. && pnpm build:field` (or `build:hq`), Output Directory to `dist`, and add the environment variable `VITE_CONVEX_URL`.

All three serve HTTPS, which the Field app needs for offline use, the camera and GPS.

## 4. Seat the Head of Department

1. The HoD opens the **HQ address**, chooses **Fungua akaunti** (create account), and signs up with their phone number as the username.
2. They type the council code (`BAGAMOYO-TC`), pick **Mkuu wa Idara** and their section, and send the request.
3. Root signs in to HQ, opens **Maombi**, and approves the request. The HoD's screen opens HQ on its own.

From here the HoD runs the council in HQ:
- assigns section heads (they sign up the same way with the code and are approved by the HoD);
- adds or renames wards and villages;
- approves officers, together with the section heads.

## 5. Officers

Officers open the **Field address** on their phone and sign up, then choose **Afisa ugani**, the council, their section and their level. They install the app from the browser menu ("Add to Home screen"). After the section head approves them, they can work offline.

## Updating later

```bash
cd packages/backend && npx convex deploy
cd ../.. && VITE_CONVEX_URL=… pnpm build:field && VITE_CONVEX_URL=… pnpm build:hq
# upload both dist folders again
```

Officers' phones pick up the new Field version the next time they open the app online, and a small "Toleo jipya" (new version) bar asks them to refresh. If a release must not run alongside older phones, raise the floor:

```bash
npx convex run --prod admin:setMinClientVersion '{"version":"0.2.0"}'
```

## Moving to your own server later

See the Convex self-hosting skill in your Claude account. In short: the same backend runs in Docker. You export with `npx convex export`, import on the new server, and rebuild both apps with the new URL. With convex-auth 2.0, everyone signs in once more after the move.
