// One-time setup script: creates the Pro and Team products/prices in Stripe.
// Run with: STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-resources.js
// Prints the price IDs to paste into your .env file.
require('dotenv').config();
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

async function main() {
  const pro = await stripe.products.create({ name: 'TheSignTool Pro' });
  const proMonthly = await stripe.prices.create({
    product: pro.id,
    currency: 'usd',
    unit_amount: 900,
    recurring: { interval: 'month' },
  });
  const proYearly = await stripe.prices.create({
    product: pro.id,
    currency: 'usd',
    unit_amount: 9000, // $90/yr = 2 months free vs $9 x 12
    recurring: { interval: 'year' },
  });

  const team = await stripe.products.create({ name: 'TheSignTool Team' });
  const teamYearly = await stripe.prices.create({
    product: team.id,
    currency: 'usd',
    unit_amount: 7200, // $6/seat/mo billed yearly = $72/seat/yr
    recurring: { interval: 'year' },
    billing_scheme: 'per_unit',
  });

  console.log('\nAdd these to your .env:\n');
  console.log(`STRIPE_PRICE_PRO_MONTHLY=${proMonthly.id}`);
  console.log(`STRIPE_PRICE_PRO_YEARLY=${proYearly.id}`);
  console.log(`STRIPE_PRICE_TEAM_YEARLY=${teamYearly.id}`);
  console.log(
    '\nNote: multi-currency presentment and tax collection are account-level settings and ' +
      'must be turned on in the Dashboard (see README.md) — they are not created by this script.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
