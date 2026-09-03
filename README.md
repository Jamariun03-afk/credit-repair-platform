# Credit Repair Platform — Full MVP Loop + Security Hardening + Payments

**New here? Read [DEPLOYMENT.md](./DEPLOYMENT.md) first** — it walks through
getting this live at a real URL using only websites (GitHub + Vercel +
Neon), no local install or terminal required for the actual deployment.

Every step in your spec's 18-step MVP definition (§38) has real code behind
it, the two security items flagged early on are closed, and payments now
actually process.

## What's actually wired up end-to-end right now

- **Auth, MFA, RBAC, SSN encryption** — see prior sections below, all real.
- **Payment Tracker + Stripe (new)** — `/billing` is the master "who's paid,
  who hasn't" view across every client. Each charge can be marked paid
  manually OR you can generate a real Stripe Checkout link (staff-side
  "Send Payment Link" button, or the client can pay it themselves from
  `/portal/billing`). **The webhook (`/api/webhooks/stripe`), not the
  success-page redirect, is what actually marks a charge PAID** — that's
  the difference between a real integration and a fake one a user could
  trick by hitting the success URL without paying.
- **Web-based first-run setup (new)** — `/setup` creates your first admin
  account with no terminal needed, and permanently disables itself the
  moment that account exists.
- **Client CRM, Document Vault, Credit Reports & Bureau Comparison,
  Negative Item Tracker, Dispute Engine, Address entry, Client Portal,
  Tasks, Dashboard** — all still real, see git history / prior notes for
  detail on each.

## Local development (if you do have Node.js)

```bash
npm install
```
Set `DATABASE_URL`, `S3_*`, `FIELD_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` in `.env` (copy `.env.example`).
```bash
npx prisma migrate dev --name init
npm run seed:templates   # loads the default dispute letter templates
npm run dev
```
Then visit `/setup` to create your first account (same as production —
there's no separate local-only seed path for the admin account anymore).

## Known gaps still remaining, in order

1. **Manual credit report entry form** — API + comparison view already work.
2. **Non-PDF document conversion** in the package builder.
3. **Automation engine** — trigger hook points are commented in the code.
4. **AI audit assistant** — staging-table pattern per ARCHITECTURE.md § J.
5. **Recurring/subscription billing** — current Stripe integration is
   one-time charges only; monthly auto-billing would need Stripe
   Subscriptions, a meaningfully different flow from Checkout sessions.
6. **Rate limiting, CSRF hardening, full production security pass** (§8).



