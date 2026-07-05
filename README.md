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

## 5. Run locally

```bash
npm run dev
```

## Endpoints

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/api/checkout` | `{ plan: "pro"\|"team", billing: "monthly"\|"yearly", seats?, email? }` | `{ url }` |
| POST | `/api/portal` | `{ email }` | `{ url }` |
| POST | `/api/webhook` | (raw Stripe event) | `{ received: true }` |
| GET | `/api/me` | `?email=` | `{ email, plan, status, seats, current_period_end }` |

Note: there's no user-auth system specified for the frontend yet, so `/api/me` and
`/api/portal` key off `email`. Once you add real auth, swap the `email` lookup for
whatever identifies the logged-in user (session/JWT) server-side.

## Deploy — Vercel

1. `vercel` (or connect the repo in the Vercel dashboard).
2. Add all vars from `.env.example` under **Settings → Environment Variables**.
3. `vercel.json` rewrites `/api/*` to the single `api/index.js` serverless function, which
   wraps the Express app — every route in `src/routes` is served from there.
4. Set the webhook URL in Stripe to `https://<your-vercel-domain>/api/webhook`.

## Deploy — Netlify

1. `netlify deploy` (or connect the repo).
2. Add the same env vars under **Site settings → Environment variables**.
3. `netlify.toml` redirects `/api/*` to the bundled function in `netlify/functions/api.js`.
4. Set the webhook URL in Stripe to `https://<your-netlify-domain>/api/webhook`.

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

This assumes `index.html` / `app.html` / `legal.html` are served from the **same Netlify
site** as this backend (repo root, alongside `netlify.toml`) — so `/api/*` is same-origin
and the snippets below use relative paths. If the frontend is ever split onto a different
domain, switch these to an absolute URL and set `CORS_ORIGIN` accordingly.

The publishable key (`pk_test_...` / `pk_live_...`) is the only Stripe key allowed in the
frontend. It isn't actually needed for these snippets since Checkout/Portal redirects are
driven entirely by the backend, but keep it handy if you later add Stripe.js/Elements.

**"Upgrade to Pro" button** (`app.html`):

```html
<button id="upgrade-pro-monthly">Upgrade to Pro — $9/mo</button>

<script>
document.getElementById('upgrade-pro-monthly').addEventListener('click', async () => {
  const email = localStorage.getItem('tst_email'); // however you track the logged-in user
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'pro', billing: 'monthly', email }),
  });
  const { url, error } = await res.json();
  if (error) return alert(error);
  window.location = url;
});
</script>
```

For Team, pass `plan: 'team', billing: 'yearly', seats: <n>` (n ≥ 3).

**"Manage billing" link** (account menu):

```html
<button id="manage-billing">Manage billing</button>

<script>
document.getElementById('manage-billing').addEventListener('click', async () => {
  const email = localStorage.getItem('tst_email');
  const res = await fetch('/api/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const { url, error } = await res.json();
  if (error) return alert(error);
  window.location = url;
});
</script>
```

**Capturing the email after checkout** (Checkout collects it even if you didn't pass one).
On the `success_url` page (`app.html?checkout=success&session_id=...`):

```html
<script>
const params = new URLSearchParams(location.search);
if (params.get('checkout') === 'success') {
  fetch(`/api/me?email=${encodeURIComponent(localStorage.getItem('tst_email') || '')}`)
    .then((r) => r.json())
    .then((me) => localStorage.setItem('tst_plan', me.plan));
}
</script>
```

**Gating Pro features** — call `/api/me` on load and branch on `plan`:

```js
const me = await fetch(`/api/me?email=${encodeURIComponent(email)}`).then((r) => r.json());
const isPro = me.plan === 'pro' || me.plan === 'team';
const isActive = me.status === 'active';
if (isPro && isActive) {
  // unlock all templates, hide the "made with TheSignTool" badge, enable bulk deploy
}
```
