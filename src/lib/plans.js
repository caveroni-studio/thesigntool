const TEAM_MIN_SEATS = parseInt(process.env.TEAM_MIN_SEATS || '3', 10);

// plan/billing -> Stripe Price ID. Team is yearly-only, per the product spec.
const PRICE_MAP = {
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  },
  team: {
    yearly: process.env.STRIPE_PRICE_TEAM_YEARLY,
  },
};

function resolvePrice(plan, billing) {
  const priceId = PRICE_MAP[plan] && PRICE_MAP[plan][billing];
  if (!priceId) {
    throw new Error(`No Stripe price configured for plan="${plan}" billing="${billing}"`);
  }
  return priceId;
}

module.exports = { PRICE_MAP, resolvePrice, TEAM_MIN_SEATS };
