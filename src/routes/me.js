const express = require('express');
const { getUserByEmail } = require('../lib/db');
const { getSessionEmail } = require('../lib/auth');

const router = express.Router();

router.get('/me', async (req, res) => {
  try {
    const email = getSessionEmail(req) || req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Sign in, or pass an email query param' });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return res.json({ email, plan: 'free', status: 'active', seats: 1, current_period_end: null });
    }

    return res.json({
      email: user.email,
      plan: user.plan,
      status: user.status,
      seats: user.seats,
      current_period_end: user.current_period_end,
    });
  } catch (err) {
    console.error('me error', err);
    return res.status(500).json({ error: 'Failed to load account status' });
  }
});

module.exports = router;
