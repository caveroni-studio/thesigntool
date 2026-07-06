const express = require('express');
const stripe = require('../lib/stripe');
const { getUserByEmail } = require('../lib/db');
const { getSessionEmail } = require('../lib/auth');

const router = express.Router();

router.post('/portal', async (req, res) => {
  try {
    // Billing portal grants access to payment methods/invoices, so a real session
    // takes priority; only fall back to a client-supplied email when signed out.
    const email = getSessionEmail(req) || (req.body && req.body.email);
    if (!email) {
      return res.status(400).json({ error: 'Sign in, or pass an email, to manage billing' });
    }

    const user = await getUserByEmail(email);
    if (!user || !user.stripe_customer_id) {
      return res.status(404).json({ error: 'No billing account found for this email' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/app.html`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('portal error', err);
    return res.status(500).json({ error: 'Failed to create billing portal session' });
  }
});

module.exports = router;
