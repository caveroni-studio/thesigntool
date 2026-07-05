const express = require('express');
const stripe = require('../lib/stripe');
const { upsertUserByEmail, updateUserByCustomerId } = require('../lib/db');

const router = express.Router();

function planFromMetadata(metadata) {
  if (!metadata) return null;
  return metadata.plan || null;
}

// Mounted at /api/webhook with express.raw() upstream so req.body is the raw
// Buffer Stripe needs to verify — see src/app.js for why the path is scoped this tightly.
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.customer_details?.email || session.customer_email;
        if (email) {
          const seats = parseInt(session.metadata?.seats || '1', 10);
          await upsertUserByEmail(email, {
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            plan: session.metadata?.plan || 'pro',
            status: 'active',
            seats,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const seats = sub.items?.data?.[0]?.quantity;
        await updateUserByCustomerId(sub.customer, {
          stripeSubscriptionId: sub.id,
          plan: planFromMetadata(sub.metadata) || undefined,
          status: sub.status,
          seats,
          currentPeriodEnd: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : undefined,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await updateUserByCustomerId(sub.customer, {
          plan: 'free',
          status: 'canceled',
          seats: 1,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.customer) {
          await updateUserByCustomerId(invoice.customer, { status: 'past_due' });
        }
        break;
      }

      default:
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error(`webhook handler error for ${event.type}`, err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
});

module.exports = router;
