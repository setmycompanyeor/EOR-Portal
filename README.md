# EOR Hub — client portal

Employer of Record portal for clients hiring in India: onboarding, cost estimates, deposits and invoices, requests with quote approval, courier tracking and asset register, plus an internal ops console with a cross-client work queue.

Stack: Next.js 16 (App Router, Cache Components), React 19, Tailwind v4, Supabase (Postgres, Auth, Storage), Zoho Books sync.

## First-time setup

1. **Create a Supabase project** at supabase.com (free tier is fine). In *Project Settings → API* copy the project URL, the anon key and the service role key.

2. **Run the schema.** Open *SQL Editor* in Supabase, paste the contents of `supabase/migrations/0001_init.sql`, and run it. This creates all tables, row-level-security policies, the `documents` storage bucket, and the trigger that turns invited users into profiles.

3. **Configure env.** Copy `.env.example` to `.env.local` and fill in the three Supabase values. Leave the Zoho values empty until you are ready to connect it.

4. **Install and seed demo data.**

   ```bash
   npm install
   npm run seed
   ```

   The seed creates four demo logins (two client users at a fictional US client, two ops users). Their emails and the shared password are at the top of `scripts/seed.ts`. Re-run with `npm run seed -- --reset` to wipe and recreate.

5. **Run it.**

   ```bash
   npm run dev
   ```

   - `/` public landing, `/estimate` public cost estimator
   - `/login` sign in (password or magic link)
   - `/app` client portal (sign in as a client user)
   - `/ops` ops console (sign in as an ops user)

## How the pieces fit

- `supabase/migrations/0001_init.sql` — schema. Every client-facing table carries `client_id`; RLS lets client users read their tenant and perform only the writes the portal exposes (hire requests, uploads, raising requests, approving quotes). Ops roles bypass tenant scoping.
- `src/lib/pricing.ts` — the one place employer cost is computed (PF, ESI, gratuity, insurance, fee, GST, deposit). Used by the public estimator, hire estimates, monthly invoice generation and deposit requirement recomputation. Rates come from the `pricing_configs` table (global row, optional per-client rows) and are editable at `/ops/pricing`.
- `src/lib/auth.ts` — session and role checks (`requireClient`, `requireOps`). `src/proxy.ts` refreshes the Supabase cookie and bounces signed-out visitors.
- `src/lib/data/portal.ts`, `src/lib/data/ops.ts` — all reads. `src/app/app/actions.ts`, `src/app/ops/actions.ts` — all writes, as server actions with zod validation.
- `src/app/app/*` — client portal screens. `src/app/ops/*` — ops console screens.
- `src/lib/zoho.ts` + `src/app/ops/billing/zoho-actions.ts` — pulls invoices from Zoho Books for clients whose `zoho_contact_id` is set. `src/app/api/webhooks/zoho/route.ts` — receives invoice status changes pushed by a Zoho workflow webhook.

## Inviting real clients

From `/ops/clients` create the client and enter the admin's email. Supabase sends an invite; the invite link lands on `/auth/callback` and drops the user into onboarding. For invite emails to send in production, configure SMTP in Supabase *Authentication → SMTP settings* and set `NEXT_PUBLIC_APP_URL` to your deployed URL (also add it to Supabase *Authentication → URL configuration → Redirect URLs*).

## Connecting Zoho Books

1. In the Zoho API console create a Self Client, scope `ZohoBooks.invoices.READ,ZohoBooks.contacts.READ`, and generate a refresh token.
2. Fill `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORGANIZATION_ID` in `.env.local`.
3. Set each client's `zoho_contact_id` (the Zoho customer id) in the `clients` table.
4. `/ops/billing → Sync from Zoho Books` pulls invoices. For push updates, create a Zoho workflow rule on invoices that calls `POST {APP_URL}/api/webhooks/zoho` with header `x-webhook-secret: {ZOHO_WEBHOOK_SECRET}` and a JSON body containing `invoice_id`, `status`, `total`, `due_date`, `last_payment_date`.

Keka is not wired yet; employees carry a `keka_employee_id` column for when payslip and leave sync is added.

## Scripts

- `npm run dev` / `npm run build` / `npm start`
- `npm run typecheck` — TypeScript
- `npm run lint` — ESLint
- `npm run seed` — demo data (needs the service role key)
