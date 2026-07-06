require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoute = require('./routes/auth');
const checkoutRoute = require('./routes/checkout');
const portalRoute = require('./routes/portal');
const meRoute = require('./routes/me');
const webhookRoute = require('./routes/webhook');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/non-browser requests (no Origin header) and configured origins.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(cookieParser());

// Stripe needs the raw request body to verify webhook signatures. Scoped to exactly
// /api/webhook (not all of /api) so it doesn't swallow JSON bodies on the other routes,
// and mounted before the global express.json() below.
app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRoute);

app.use(express.json());
app.use('/api', authRoute);
app.use('/api', checkoutRoute);
app.use('/api', portalRoute);
app.use('/api', meRoute);

app.get('/api/health', (req, res) => res.json({ ok: true }));

module.exports = app;
