# TheSignTool — Stripe subscription backend

Node.js + Express backend for TheSignTool's Free / Pro / Team plans. Runs as a normal
Express server, or as a serverless function on Vercel or Netlify.

## 1. Install

```bash
npm install
cp .env.example .env
```

## 2. Database

Any Postgres works (Supabase, Neon, Vercel Postgres, Railway...). Serverless deploys
(Vercel/Netlify) have no persistent local disk, so SQLite is not an option there — use a
hosted Postgres and put its connection string in `DATABASE_URL`.

```bash
npm run db:migrate   # applies scripts/schema.sql
```

## 3. Create the Stripe products & prices

Either run the setup script (test mode key):

```bash
npm run stripe:setup
```

It prints `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_TEAM_YEARLY` —
copy them into `.env`.

Or create them by hand in the Dashboard (**Product catalog → Add product**):

| Product | Price | Billing |
|---|---|---|
| Pro | $9.00 | Monthly, recurring |
| Pro | $90.00 | Yearly, recurring |
| Team | $72.00 (=$6/seat/mo × 12) | Yearly, recurring, per-unit (quantity = seats) |

Free has no Stripe object — it's just the default DB state.

### Multi-currency (USD/EUR/PLN/GBP)

Turn on **Settings → Payments → Adaptive Pricing** in the Dashboard. Stripe then presents
Checkout in the customer's local currency automatically — no extra Price objects needed. If
you'd rather pin exact per-currency amounts instead of automatic conversion, add
`currency_options` to each Price via the API/Dashboard for EUR/PLN/GBP.

### Stripe Tax

Turn on **Settings → Tax** in the Dashboard, set your origin address, and (if applicable)
your tax registrations. The checkout endpoint already sends `automatic_tax: { enabled: true }`.

## 4. Webhook endpoint

Dashboard → **Developers → Webhooks → Add endpoint**:

- URL: `https://<your-domain>/api/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`

Stripe gives you a signing secret (`whsec_...`) — put it in `STRIPE_WEBHOOK_SECRET`.

For local testing:

```bash
stripe listen --forward-to localhost:3000/api/webhook
```

## 5. Auth (email/password + Google/Microsoft)

Generate a session-signing secret and put it in `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Email/password signup and login work with no further setup. Google and Microsoft are
optional — leave their env vars blank and those two buttons return "not configured yet"
instead of erroring.

**Google**: Google Cloud Console → APIs & Services → Credentials → Create Credentials →
OAuth client ID → Web application. Authorized redirect URI:
`{FRONTEND_URL}/api/auth/google/callback`. Copy the client ID/secret into
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

**Microsoft**: Azure Portal → App registrations → New registration → "Accounts in any
organizational directory and personal Microsoft accounts". Redirect URI (Web platform):
`{FRONTEND_URL}/api/auth/microsoft/callback`. Copy the Application (client) ID into
`MICROSOFT_CLIENT_ID`, and create a client secret (Certificates & secrets) for
`MICROSOFT_CLIENT_SECRET`.

Sessions are a signed JWT in an `httpOnly` cookie (`tst_session`, 30 days) — no server-side
session store to manage.

## 6. Run locally

```bash
npm run dev
```

## Endpoints

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ email, password, name? }` | `{ email, name, plan }` + sets session cookie |
| POST | `/api/auth/login` | `{ email, password }` | `{ email, name, plan }` + sets session cookie |
| POST | `/api/auth/logout` | — | `{ ok: true }`, clears session cookie |
| GET | `/api/auth/session` | — (reads cookie) | `{ email, name, plan }` or 401 |
| GET | `/api/auth/google` | — | redirects to Google, then back to `/app.html` |
| GET | `/api/auth/microsoft` | — | redirects to Microsoft, then back to `/app.html` |
| GET | `/api/auth/providers` | — | `{ google, microsoft }` — whether those OAuth env vars are set |
| POST | `/api/checkout` | `{ plan: "pro"\|"team", billing: "monthly"\|"yearly", seats?, email? }` | `{ url }` |
| POST | `/api/portal` | `{ email }` | `{ url }` |
| POST | `/api/webhook` | (raw Stripe event) | `{ received: true }` |
| GET | `/api/me` | `?email=` | `{ email, plan, status, seats, current_period_end }` |

`checkout`, `portal`, and `me` all check the session cookie first and only fall back to
the `email` in the request when there's no signed-in session (guest checkout still works).
This matters for `/api/portal` in particular — it opens Stripe's billing portal for
whichever account it resolves to, so a real session beats a client-supplied email rather
than trusting it outright.

## Deploy — Vercel

1. `vercel` (or connect the repo in the Vercel dashboard).
2. Add all vars from `.env.example` under **Settings → Environment Variables**.
3. `vercel.json` rewrites `/api/*` to the single `api/index.js` serverless function, which
   wraps the Express app — every route in `src/routes` is served from there.
4. Set the webhook URL in Stripe to `https://<your-vercel-domain>/api/webhook`.

## Deploy — Netlify

1. `netlify deploy` (or connect the repo).
2. Add the env vars below under **Site settings → Environment variables**.
3. `netlify.toml` redirects `/api/*` to the bundled function in `netlify/functions/api.js`.
4. Set the webhook URL in Stripe to `https://<your-netlify-domain>/api/webhook`.
5. Run `npm run db:migrate` (see below) — required, including for this update, since it
   adds columns to `users`.

### Netlify environment variables checklist

Everything below is also in `.env.example`. Values with no default must be filled in.

**Stripe**
| Var | Notes |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from the Stripe webhook endpoint |
| `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY` / `STRIPE_PRICE_TEAM_YEARLY` | from `npm run stripe:setup` |
| `TEAM_MIN_SEATS` | `3` |

**Database**
| Var | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string (Supabase/Neon/Vercel Postgres/...) |

**Auth / sessions**
| Var | Notes |
|---|---|
| `JWT_SECRET` | random string, see "Auth" section above — required, no default |

**Google OAuth** (optional — leave blank to keep the button disabled)
| Var | Notes |
|---|---|
| `GOOGLE_CLIENT_ID` | from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |

**Microsoft OAuth** (optional — leave blank to keep the button disabled)
| Var | Notes |
|---|---|
| `MICROSOFT_CLIENT_ID` | from Azure Portal |
| `MICROSOFT_CLIENT_SECRET` | from Azure Portal |

**Frontend / CORS**
| Var | Notes |
|---|---|
| `FRONTEND_URL` | `https://www.thesigntool.com` — also the OAuth/Checkout/Portal return URL |
| `CORS_ORIGIN` | `https://www.thesigntool.com` (comma-separated if more than one) |

### Do I need to run the migration after this update?

Yes. This update adds `name`, `password_hash`, `google_id`, `microsoft_id` to `users`.
Run `npm run db:migrate` (which just (re-)applies `scripts/schema.sql`, so it's safe to
run again even if you've already run it before) once `DATABASE_URL` and the other vars
above are set.

## Switching from test to live keys

1. In Stripe, toggle **Test mode → Live mode** (top right of the Dashboard).
2. Re-create the products/prices in live mode (`npm run stripe:setup` with a live secret
   key, or repeat the Dashboard steps) — test and live objects are entirely separate.
3. Re-create the webhook endpoint in live mode and grab its live `whsec_...` secret.
4. Update your host's env vars: `STRIPE_SECRET_KEY` → `sk_live_...`,
   `STRIPE_WEBHOOK_SECRET` → the live endpoint's secret, and the three live
   `STRIPE_PRICE_*` IDs.
5. Redeploy.

**Rotate the test key that was ever pasted/screenshotted anywhere** (Dashboard →
Developers → API keys → roll key), even though it's test-mode only.

---

## Frontend wiring

`index.html` / `app.html` / `legal.html` are served from the **same Netlify site** as this
backend (repo root, alongside `netlify.toml`), so `/api/*` is same-origin and every fetch
below uses a relative path with `credentials: "same-origin"`. This is already implemented
in `app.html` — nothing left to wire up manually. What it does, concretely:

- **On page load** (`componentDidMount`): calls `GET /api/auth/session`. If it returns 200,
  the header shows the account name/email instead of "Sign in" — this is what makes login
  survive a page refresh and the redirect back from Google/Microsoft OAuth. If it 401s,
  the header shows "Sign in" and nothing is read from `localStorage` for this — there is no
  local-only fake-login fallback anywhere in the auth flow.
- Also on load: calls `GET /api/auth/providers` to decide whether the Google/Microsoft
  buttons are clickable. If a provider isn't configured, its button is dimmed and clicking
  it shows "Google/Microsoft sign-in coming soon" instead of navigating anywhere.
- **Sign up / log in** (the account modal's email+password form): `POST /api/auth/signup`
  or `POST /api/auth/login`. On success the header updates from the response body (not from
  a locally-fabricated name). On failure it shows the backend's actual error message (e.g.
  "Invalid email or password") — it does not fall back to a fake logged-in state.
- **Sign out**: the account menu (click the header button while signed in) has a "Log out"
  button that calls `POST /api/auth/logout`, then clears the local `user` state.
- **Manage billing**: same account menu, calls `POST /api/portal` — resolves to the signed-in
  account via the session cookie, not any local field.
- **Upgrade to Pro/Team**: the existing upgrade modal's checkout button calls
  `POST /api/checkout` with `{ plan, billing, seats, email }`; the session cookie (if any)
  still wins server-side over that `email`, per the `/api/checkout` behavior described above.

If you ever split the frontend onto a different domain than the backend, these become
cross-origin requests — add that origin to `CORS_ORIGIN` and switch the relative paths to
an absolute backend URL (the `BACKEND_URL` constant near the top of the app's script).
