const express = require('express');
const {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  getSessionEmail,
  setOAuthStateCookie,
  consumeOAuthStateCookie,
} = require('../lib/auth');
const { getUserByEmail, createUserWithPassword, setUserPassword, upsertOAuthUser } = require('../lib/db');

const router = express.Router();

function publicUser(user) {
  return { email: user.email, name: user.name, plan: user.plan };
}

router.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await getUserByEmail(email);
    if (existing && existing.password_hash) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const user = existing
      ? await setUserPassword(email, passwordHash, name)
      : await createUserWithPassword({ email, passwordHash, name });

    setSessionCookie(res, user);
    return res.json(publicUser(user));
  } catch (err) {
    console.error('signup error', err);
    return res.status(500).json({ error: 'Could not create account' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await getUserByEmail(email);
    if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    setSessionCookie(res, user);
    return res.json(publicUser(user));
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'Could not sign in' });
  }
});

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/auth/session', async (req, res) => {
  const email = getSessionEmail(req);
  if (!email) return res.status(401).json({ error: 'Not signed in' });

  const user = await getUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'Not signed in' });

  return res.json(publicUser(user));
});

// === Google OAuth (Authorization Code flow) ===
router.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(501).send('Google sign-in is not configured yet.');
  }
  const state = setOAuthStateCookie(res);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.FRONTEND_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const expectedState = consumeOAuthStateCookie(req, res);
    if (!code || !state || state !== expectedState) {
      return res.status(400).send('Invalid or expired sign-in attempt. Please try again.');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.FRONTEND_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      throw new Error(tokens.error_description || 'Token exchange failed');
    }

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.email) {
      throw new Error('Could not load Google profile');
    }

    const user = await upsertOAuthUser({ email: profile.email, name: profile.name, googleId: profile.sub });
    setSessionCookie(res, user);
    return res.redirect(`${process.env.FRONTEND_URL}/app.html`);
  } catch (err) {
    console.error('google oauth callback error', err);
    return res.status(500).send('Google sign-in failed. Please try again.');
  }
});

// === Microsoft OAuth (Authorization Code flow, "common" tenant = personal + work/school) ===
router.get('/auth/microsoft', (req, res) => {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    return res.status(501).send('Microsoft sign-in is not configured yet.');
  }
  const state = setOAuthStateCookie(res);
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    redirect_uri: `${process.env.FRONTEND_URL}/api/auth/microsoft/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    response_mode: 'query',
  });
  res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`);
});

router.get('/auth/microsoft/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const expectedState = consumeOAuthStateCookie(req, res);
    if (!code || !state || state !== expectedState) {
      return res.status(400).send('Invalid or expired sign-in attempt. Please try again.');
    }

    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: `${process.env.FRONTEND_URL}/api/auth/microsoft/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      throw new Error(tokens.error_description || 'Token exchange failed');
    }

    const profileRes = await fetch('https://graph.microsoft.com/oidc/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.email) {
      throw new Error('Could not load Microsoft profile');
    }

    const user = await upsertOAuthUser({ email: profile.email, name: profile.name, microsoftId: profile.sub });
    setSessionCookie(res, user);
    return res.redirect(`${process.env.FRONTEND_URL}/app.html`);
  } catch (err) {
    console.error('microsoft oauth callback error', err);
    return res.status(500).send('Microsoft sign-in failed. Please try again.');
  }
});

module.exports = router;
