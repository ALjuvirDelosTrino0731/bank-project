'use strict';
// Compass Bank private staging gate for Render/Railway.
// Install BEFORE all static files, booking guard, and API routes.
// Do not use as a substitute for application employee authentication.
const crypto = require('node:crypto');

const stage = process.env.COMPASS_DEPLOYMENT_STAGE === 'staging';
const onCloud = process.env.RENDER === 'true' ||
  Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_ID);
if (onCloud && !stage) {
  throw new Error('Compass staging gate: cloud deployment requires COMPASS_DEPLOYMENT_STAGE=staging. Refusing unprotected startup.');
}

const username = String(process.env.COMPASS_STAGING_USERNAME || '');
const password = String(process.env.COMPASS_STAGING_PASSWORD || '');
if (stage && (username.length < 4 || password.length < 20 || username.includes(':'))) {
  throw new Error('Compass staging diagnostic: ' + JSON.stringify({
    usernameReceived: username.length > 0,
    usernameLengthOK: username.length >= 4,
    usernameContainsColon: username.includes(':'),
    passwordReceived: password.length > 0,
    passwordLengthOK: password.length >= 20
  }));
}
const COOKIE_NAME = 'compass_staging_access';
const SESSION_SECONDS = 8 * 60 * 60;
const hash = value => crypto.createHash('sha256').update(value, 'utf8').digest();
const expectedUsernameHash = stage ? hash(username) : null;
const expectedPasswordHash = stage ? hash(password) : null;
const sessionKey = stage ? crypto.createHmac('sha256', password).update('compass-staging-v2:' + username).digest() : null;

function unauthorized(res) {
  res.setHeader('WWW-Authenticate', 'Basic realm="Compass Bank private staging", charset="UTF-8"');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(401).type('text/plain').send('Private staging: authentication required');
}
function validBasic(header) {
  if (typeof header !== 'string' || header.length > 1024 || !/^Basic\s+[A-Za-z0-9+/=]+$/i.test(header)) return false;
  let decoded;
  try { decoded = Buffer.from(header.replace(/^Basic\s+/i, ''), 'base64').toString('utf8'); }
  catch (_) { return false; }
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  return crypto.timingSafeEqual(hash(decoded.slice(0, sep)), expectedUsernameHash) &&
    crypto.timingSafeEqual(hash(decoded.slice(sep + 1)), expectedPasswordHash);
}
function cookieSignature(expires) {
  return crypto.createHmac('sha256', sessionKey).update('v2:' + expires).digest('hex');
}
function validSessionCookie(req) {
  const cookies = String(req.headers?.cookie || '').split(';');
  const match = cookies.map(item => item.trim()).find(item => item.startsWith(COOKIE_NAME + '='));
  if (!match) return false;
  let value;
  try { value = decodeURIComponent(match.slice(COOKIE_NAME.length + 1)); }
  catch (_) { return false; }
  const result = /^(\d{10,13})\.([a-f0-9]{64})$/.exec(value);
  if (!result) return false;
  const expires = Number(result[1]);
  const now = Date.now();
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + SESSION_SECONDS * 1000) return false;
  return crypto.timingSafeEqual(Buffer.from(result[2], 'hex'), Buffer.from(cookieSignature(result[1]), 'hex'));
}
function issueSessionCookie(req, res) {
  const expires = String(Date.now() + SESSION_SECONDS * 1000);
  const value = expires + '.' + cookieSignature(expires);
  const secure = process.env.RENDER === 'true' || process.env.RAILWAY_PROJECT_ID ||
    req.secure === true;
  const attributes = [COOKIE_NAME + '=' + encodeURIComponent(value), 'Path=/', 'HttpOnly',
    'SameSite=Lax', 'Max-Age=' + SESSION_SECONDS];
  if (secure) attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

module.exports = function compassStagingGate(req, res, next) {
  if (!stage) return next();
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Render health checks must not require credentials. These paths return no customer data.
  if (req.method === 'GET' && (req.path === '/health' || req.path === '/ready')) return next();

  // A browser first logs in with Basic Auth. A signed HttpOnly cookie then lets API
  // requests carry their normal Authorization: Bearer <employee-token> header.
  if (validBasic(req.headers?.authorization)) {
    issueSessionCookie(req, res);
  } else if (!validSessionCookie(req)) {
    return unauthorized(res);
  }

  if (process.env.COMPASS_STAGING_BLOCK_PUBLIC_BOOKINGS !== '0' &&
      req.method === 'POST' && /^\/api\/appointments\/?$/.test(req.path)) {
    return res.status(503).json({status:'unavailable', message:'New customer bookings are disabled in private staging.'});
  }
  if (req.method === 'POST' && /^\/api\/research-demo\/survey\/?$/.test(req.path)) {
    return res.status(404).json({status:'error', message:'Survey submission unavailable in staging.'});
  }
  return next();
};
