# Cruise the Creek

Two projects live in this repository.

| Path | What it is | How it ships |
| --- | --- | --- |
| repo root | **cruisethecreek.com** — the live static site | deployed from the root; edit HTML directly |
| `portal/` | **Customer Portal** — Next.js 16 + Supabase (in development) | not deployed yet |

They are independent. The root has no build step and no `package.json`; the
portal is a self-contained npm project. Working on one does not affect the other.

---

## The static site (repo root)

Plain HTML/CSS/JS — no bundler, no framework. Open any `.html` file directly, or
serve the folder:

```bash
python3 -m http.server 8000    # then visit http://localhost:8000
```

Key pieces:

- `api/` — serverless functions (`chat.js` is the site assistant; it holds the
  chatbot's system prompt).
- `apps-script.gs` and `apps-script-*.snippet.gs` — Google Apps Script source.
  **These are not executed from the repo.** The live code lives in the Apps
  Script editor; the files here are the source of record and paste targets. A
  `.snippet.gs` file has paste instructions in its header comment.
- `data/inventory.json` — bike inventory, synced automatically from the Google
  Sheet by the `sync-inventory` GitHub Action. Don't hand-edit it.
- `site-enhance.js` — shared nav menu and UX polish injected into every page.
  `NAV_MENU` at the top is the site-wide navigation; edit it there only.

## The customer portal (`portal/`)

Next.js 16 (App Router), TypeScript, Tailwind v4, Supabase.

```bash
cd portal
npm install
npm run dev        # http://localhost:3000
```

Needs a `portal/.env.local` before it can reach a database:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Both values come from your Supabase project's API settings. Never commit this
file — `.env*` is already gitignored, and the service-role key must never appear
in any `NEXT_PUBLIC_` variable.

**Database schema:** `portal/supabase/migrations/00001_initial_schema.sql` —
`customers`, `bikes`, `invoices`, `service_tickets`, with Row Level Security on
all four. Apply it with the Supabase CLI (`supabase db push`) or by pasting it
into the SQL editor.

Three RLS rules are deliberate and worth knowing before you build against them:

- **Invoices are read-only to customers.** Billing rows are written with the
  service-role key. A customer who could write an invoice could mark their own
  balance paid.
- **Customers cannot resolve their own service tickets**, and a ticket stops
  being customer-editable once staff move it off `open`.
- **A ticket cannot reference another customer's bike** — enforced by a
  composite foreign key, not by application code.

Current state: routes are placeholders (`/dashboard`, `/dashboard/bikes`,
`/dashboard/invoices`, `/support`, `/auth`). No Supabase client and no auth flow
are wired up yet.
