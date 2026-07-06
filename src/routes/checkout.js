const express = require('express');
const stripe = require('../lib/stripe');
const { resolvePrice, TEAM_MIN_SEATS } = require('../lib/plans');
const { getSessionEmail } = require('../lib/auth');

const router = express.Router();

router.post('/checkout', async (req, res) => {
  try {
    const { plan, billing, seats, email: bodyEmail } = req.body || {};
    // A signed-in session is the real identity; it wins over whatever email the
    // (unrelated) signature form on the page happens to have in it.
    const email = getSessionEmail(req) || bodyEmail;

    if (!['pro', 'team'].includes(plan)) {
      return res.status(400).json({ error: 'plan must be "pro" or "team"' });
    }
    if (!['monthly', 'yearly'].includes(billing)) {
      return res.status(400).json({ error: 'billing must be "monthly" or "yearly"' });
    }
    if (plan === 'team' && billing !== 'yearly') {
      return res.status(400).json({ error: 'Team is billed yearly only' });
    }

    let quantity = 1;
    if (plan === 'team') {
      quantity = parseInt(seats, 10);
      if (!Number.isInteger(quantity) || quantity < TEAM_MIN_SEATS) {
        return res.status(400).json({ error: `Team requires at least ${TEAM_MIN_SEATS} seats` });
      }
    }

    const priceId = resolvePrice(plan, billing);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity }],
      customer_email: email || undefined,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: `${process.env.FRONTEND_URL}/app.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/app.html?checkout=cancelled`,
      metadata: { plan, billing, seats: String(quantity) },
      subscription_data: { metadata: { plan, billing, seats: String(quantity) } },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('checkout error', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

module.exports = router;
