const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}

const SESSION_COOKIE = 'tst_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const OAUTH_STATE_COOKIE = 'tst_oauth_state';
const OAUTH_STATE_TTL_SECONDS = 60 * 10; // 10 minutes

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function setSessionCookie(res, user) {
  const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// Returns the authenticated email, or null if there's no/invalid session cookie.
function getSessionEmail(req) {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET).email;
  } catch (e) {
    return null;
  }
}

// Short-lived cookie carrying a random nonce, checked against the OAuth callback's
// `state` param — CSRF protection without needing server-side session storage.
function setOAuthStateCookie(res) {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
  });
  return state;
}

function consumeOAuthStateCookie(req, res) {
  const cookieState = req.cookies && req.cookies[OAUTH_STATE_COOKIE];
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
  return cookieState || null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  getSessionEmail,
  setOAuthStateCookie,
  consumeOAuthStateCookie,
};
