# Getting This Actually Running — No Local Install Required

This path uses only websites — no terminal commands on your own computer.
Total time: 20-30 minutes the first time.

## Step 1 — Put the code on GitHub

1. Go to [github.com](https://github.com) and create a free account if you
   don't have one.
2. Click the **+** in the top right → **New repository**. Name it
   `credit-repair-platform`. Keep it Private. Click **Create repository**.
3. On the next page, click **uploading an existing file**.
4. Drag in every file and folder from the zip I gave you (unzip it first —
   your computer's file explorer can do this by double-clicking the zip).
5. Scroll down, click **Commit changes**.

You now have the code on GitHub. Nothing is running yet — this is just storage.

## Step 2 — Create the database (Neon, free tier)

1. Go to [neon.tech](https://neon.tech) → sign up (you can use your GitHub
   account to sign in, one click).
2. Click **Create a project**. Any name is fine. Region: pick the one
   closest to you.
3. Once created, find the **Connection string** on the project dashboard.
   It looks like `postgresql://user:password@ep-xxxx.neon.tech/dbname`.
   **Copy this** — you'll need it in Step 3.

## Step 3 — Deploy to Vercel (free tier)

1. Go to [vercel.com](https://vercel.com) → sign up with your GitHub account.
2. Click **Add New** → **Project**.
3. Find `credit-repair-platform` in the list (the repo from Step 1) and
   click **Import**.
4. Before clicking Deploy, expand **Environment Variables** and add these
   one at a time (name on the left, value on the right):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from Step 2 |
   | `NEXTAUTH_URL` | leave blank for now — you'll fill this in after first deploy |
   | `NEXTAUTH_SECRET` | any random 32+ character string (Vercel has a "Generate" option, or mash your keyboard) |
   | `FIELD_ENCRYPTION_KEY` | another random 32+ character string, different from the one above |
   | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | from your S3 or Cloudflare R2 account — document upload won't work until these are real, everything else will |
   | `STRIPE_SECRET_KEY` | from your Stripe dashboard → Developers → API keys (starts with `sk_`) |
   | `STRIPE_WEBHOOK_SECRET` | see Step 5 below — comes after first deploy |

5. Click **Deploy**. Wait ~2 minutes.
6. Once deployed, Vercel gives you a URL like
   `https://credit-repair-platform-yourname.vercel.app`. **Copy it.**
7. Go back to **Settings → Environment Variables**, edit `NEXTAUTH_URL`,
   paste that URL in. Redeploy (Deployments tab → ⋯ on the latest → Redeploy).

## Step 4 — Set up the database tables (automatic)

Nothing to do here — `package.json` has a `vercel-build` script that runs
your database migrations automatically on every deploy. As long as Step 3
succeeded, your tables already exist in Neon.

## Step 5 — Create your admin account (web-based, no terminal)

1. Visit `https://your-vercel-url.vercel.app/setup`
2. Enter an email and password. This page **only works once** — the moment
   an account exists, it permanently disables itself (visiting it again
   just says "already set up").
3. You'll be redirected to `/login`. Log in — since this is a SUPER_ADMIN
   account, you'll immediately be sent to `/mfa-setup` to scan a QR code
   with an authenticator app (Google Authenticator, Authy, 1Password).
   This is required, not optional, for this role.
4. After that, log in again with email + password + the 6-digit code.
   You're in.

## Step 6 — Stripe webhook

In your Stripe dashboard → Developers → Webhooks → **Add endpoint**.
URL: `https://your-vercel-url.vercel.app/api/webhooks/stripe`.
Event to send: `checkout.session.completed`. Copy the **Signing secret**
(starts with `whsec_`) into Vercel's `STRIPE_WEBHOOK_SECRET` environment
variable and redeploy.

## Honest summary

Every step above is click-through-a-website — no terminal, no local
install. The one thing to know: `npm run seed` (mentioned elsewhere in
this repo for local development) is no longer how you create your first
admin on a real deployment — `/setup` replaces it for exactly that reason.
