const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function getUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

async function getUserByCustomerId(customerId) {
  const { rows } = await pool.query('SELECT * FROM users WHERE stripe_customer_id = $1', [customerId]);
  return rows[0] || null;
}

async function upsertUserByEmail(email, fields) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, stripe_customer_id, stripe_subscription_id, plan, status, seats, current_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (email) DO UPDATE SET
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, users.stripe_customer_id),
       stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, users.stripe_subscription_id),
       plan = COALESCE(EXCLUDED.plan, users.plan),
       status = COALESCE(EXCLUDED.status, users.status),
       seats = COALESCE(EXCLUDED.seats, users.seats),
       current_period_end = COALESCE(EXCLUDED.current_period_end, users.current_period_end),
       updated_at = now()
     RETURNING *`,
    [
      email,
      fields.stripeCustomerId ?? null,
      fields.stripeSubscriptionId ?? null,
      fields.plan ?? null,
      fields.status ?? null,
      fields.seats ?? null,
      fields.currentPeriodEnd ?? null,
    ]
  );
  return rows[0];
}

async function updateUserByCustomerId(customerId, fields) {
  const { rows } = await pool.query(
    `UPDATE users SET
       stripe_subscription_id = COALESCE($2, stripe_subscription_id),
       plan = COALESCE($3, plan),
       status = COALESCE($4, status),
       seats = COALESCE($5, seats),
       current_period_end = COALESCE($6, current_period_end),
       updated_at = now()
     WHERE stripe_customer_id = $1
     RETURNING *`,
    [
      customerId,
      fields.stripeSubscriptionId ?? null,
      fields.plan ?? null,
      fields.status ?? null,
      fields.seats ?? null,
      fields.currentPeriodEnd ?? null,
    ]
  );
  return rows[0] || null;
}

module.exports = { pool, getUserByEmail, getUserByCustomerId, upsertUserByEmail, updateUserByCustomerId };
