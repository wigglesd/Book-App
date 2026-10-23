'use strict';

const crypto = require('crypto');

const COOKIE = 'bookapp_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Stateless owner sessions: the cookie holds an expiry signed with a key
// derived from the owner password, so changing the password logs everyone out.
function createAuth(ownerPassword) {
  const key = crypto.createHash('sha256').update(`bookapp:${ownerPassword}`).digest();

  function sign(value) {
    return crypto.createHmac('sha256', key).update(value).digest('base64url');
  }

  function safeEqual(a, b) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
  }

  function readCookie(req) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === COOKIE) return rest.join('=');
    }
    return null;
  }

  function isOwner(req) {
    const token = readCookie(req);
    if (!token) return false;
    const [expires, sig] = token.split('.');
    if (!expires || !sig || !safeEqual(sig, sign(expires))) return false;
    return Number(expires) > Date.now();
  }

  return {
    checkPassword(candidate) {
      return typeof candidate === 'string' && safeEqual(sign(candidate), sign(ownerPassword));
    },
    isOwner,
    loginCookie(secure) {
      const expires = String(Date.now() + MAX_AGE_SECONDS * 1000);
      const flags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure ? '; Secure' : ''}`;
      return `${COOKIE}=${expires}.${sign(expires)}; ${flags}`;
    },
    logoutCookie() {
      return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
    },
    requireOwner(req, res, next) {
      if (isOwner(req)) return next();
      res.status(401).json({ error: 'Owner login required' });
    },
  };
}

module.exports = { createAuth };
