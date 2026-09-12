This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment variables

Set these on the Vercel project (and in `.env.local` for local work). `NEXT_PUBLIC_*`
values are baked into the client bundle at build time, so changing one requires a
redeploy — and nothing secret may ever carry that prefix.

| Variable | Where it runs | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Anon key. Safe to ship; RLS is what protects the data. |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Bypasses **all** RLS. Never prefix this with `NEXT_PUBLIC_`. |
| `ADMIN_API_KEY` | server only | Shared secret for the admin API routes (see below). |
| `NEXT_PUBLIC_STORE_URL` | browser + server | Storefront origin, e.g. `https://cruisethecreek.com`. Also builds the CORS allowlist for the admin routes. |
| `NEXT_PUBLIC_SITE_URL` | browser + server | This portal's own origin. |

### `ADMIN_API_KEY`

`/api/customers`, `/api/invoices/sync` and `/api/invoices/upload` run with the
service-role key, so they can read and write every customer's data. They are
guarded by `lib/api-auth.ts`, which requires an `x-ctc-admin-key` request header
matching `ADMIN_API_KEY`.

It **fails closed**: if `ADMIN_API_KEY` is unset or blank, every request to those
routes is rejected with a 503 rather than being served unauthenticated.

Two callers have to know the same value:

- **`invoice.html`** (the staff invoicing page) prompts for it once per device and
  keeps it in `localStorage`. Nothing is hardcoded — that page is publicly reachable.
- **The CMS Apps Script** posts to `/api/invoices/sync` after emailing a receipt. Set
  the key there under *Project Settings → Script Properties* as `PORTAL_ADMIN_KEY`.
  Without it the sync returns 401 and the invoice never reaches Supabase; the
  invoice page reports that failure instead of hiding it.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

This app lives in the `portal/` subdirectory of a repository whose root is the
static storefront. **The repo root has no `package.json` at all.** So on the
Vercel project, Settings -> Build & Deployment -> **Root Directory must be
`portal`**. If it is empty or wrong, every build fails with:

```
Error: No Next.js version detected. Make sure your package.json has "next" in
either "dependencies" or "devDependencies".
```

Don't try to fix that from the repo. The root `vercel.json` is shared with the
storefront's own Vercel project, so a `buildCommand` added there would break
that one instead. Root Directory is a dashboard setting and has to be set there.

### A failed build is not a safe state

When a production build fails, Vercel keeps serving the **previous successful
deployment**. Nothing goes down, nothing warns you, and the old code stays live
indefinitely — so merging a fix to `main` does nothing at all until a build
actually goes green.

That is not hypothetical here. The admin-API guard in `lib/api-auth.ts` sat
merged for a day while production kept serving a build that predated it, and
`/api/customers` returned every customer's name, email, phone and home address
to anyone who asked. The code was right; it was never deployed.

So after merging anything that matters, confirm the deployment succeeded, then
confirm the behaviour:

```
GET https://portal.cruisethecreek.com/api/customers
```

- **401** — the guard is live and `ADMIN_API_KEY` is set. This is what you want.
- **503** — the guard is live, `ADMIN_API_KEY` is missing. Safe, but configure it.
- **Customer data** — an old build is serving. Pause the project (Settings ->
  General -> Pause Project) and fix the deployment before doing anything else.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
