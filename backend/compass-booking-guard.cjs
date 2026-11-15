'use strict';
// Compass Bank demo anti-abuse guard (single Node.js process only).
// This is NOT network-layer DDoS mitigation and does NOT check DB slot capacity.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DIR = path.join(__dirname, '.compass-security');
fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
const SECRET_PATH = path.join(DIR, 'secret');
const STATE_PATH = path.join(DIR, 'successful-bookings.json');
if (!fs.existsSync(SECRET_PATH)) {
  try { fs.writeFileSync(SECRET_PATH, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
const secret = fs.readFileSync(SECRET_PATH, 'utf8').trim();
const hash = value => crypto.createHmac('sha256', secret).update(String(value)).digest('hex');

// Caps can be tuned for the demo without editing this module.
const GLOBAL_WINDOW_MS = 5 * 60 * 1000;
const GLOBAL_MAX = 120;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_BOOKING_ATTEMPTS_IP = 5;
const MAX_BOOKING_ATTEMPTS_ID = 5;
const SUCCESS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_SUCCESS_PER_ID = 2;
const MAX_SUCCESS_PER_IP = 6;

const globalRequests = new Map();
const ipAttempts = new Map();
const identityAttempts = new Map();
const inFlight = new Set();
let successes = [];
if (fs.existsSync(STATE_PATH)) {
  const decoded = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  if (!Array.isArray(decoded)) throw new Error('Invalid Compass booking guard state; refusing to disable protection.');
  successes = decoded;
}
function saveSuccesses() {
  const temp = STATE_PATH + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(successes), { mode: 0o600 });
  fs.renameSync(temp, STATE_PATH);
}
function reject(res, status, code, message, retrySeconds) {
  if (retrySeconds) res.setHeader('Retry-After', String(retrySeconds));
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json({ error: code, message });
}
function take(map, key, max, windowMs, now) {
  const records = (map.get(key) || []).filter(time => now - time < windowMs);
  if (records.length >= max) {
    map.set(key, records);
    return Math.ceil((records[0] + windowMs - now) / 1000);
  }
  records.push(now);
  map.set(key, records);
  return 0;
}
function cleanValue(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
}
function idsFromBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const data = body.customer && typeof body.customer === 'object' && !Array.isArray(body.customer)
    ? Object.assign({}, body.customer, body) : body;
  const pairs = [
    ['account', data.accountNumber || data.account_number || data.accountNo || data.account_no],
    ['email', data.email || data.emailAddress || data.email_address],
    ['phone', data.phone || data.phoneNumber || data.contactNumber || data.mobile],
  ];
  return pairs.map(([type, value]) => cleanValue(value) ? hash(type + ':' + cleanValue(value)) : null).filter(Boolean);
}
function bookingPath(url) {
  // Only creation routes. Do not treat cancellations/changes as new bookings.
  const pathname = String(url || '').split('?')[0];
  if (/\/(admin|employee)(?:\/|$)/i.test(pathname)) return false;
  return /\/(appointments?|bookings?|reservations?|schedule)(?:\/(?:create|new|reserve|submit))?\/?$/i.test(pathname) ||
    /\/slots\/(?:reserve|hold|book)\/?$/i.test(pathname) ||
    /\/(?:book-appointment|reserve-slot)\/?$/i.test(pathname);
}

module.exports = function compassBookingProtection(req, res, next) {
  const now = Date.now();
  const pathname = (req.originalUrl || req.url || '').split('?')[0];
  if (!/\/(?:api|customers?|appointments?|bookings?|reservations?|schedule|slots|book-appointment|reserve-slot)(?:\/|$)/i.test(pathname)) return next();

  // Use the actual network peer, not a user-supplied X-Forwarded-For header.
  // If behind a trusted reverse proxy, configure IP handling at the proxy.
  const peer = String(req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown');
  const ipHash = hash('ip:' + peer);
  const globalWait = take(globalRequests, ipHash, GLOBAL_MAX, GLOBAL_WINDOW_MS, now);
  if (globalWait) return reject(res, 429, 'RATE_LIMIT', 'Too many requests. Please try again shortly.', globalWait);
  if (req.method !== 'POST' || !bookingPath(pathname)) return next();

  const ipWait = take(ipAttempts, ipHash, MAX_BOOKING_ATTEMPTS_IP, ATTEMPT_WINDOW_MS, now);
  if (ipWait) return reject(res, 429, 'BOOKING_THROTTLED', 'Too many appointment attempts. Please retry later.', ipWait);

  const identityIds = idsFromBody(req.body);
  // When no identity fields were parsed, IP restrictions still apply.
  for (const id of identityIds) {
    const wait = take(identityAttempts, id, MAX_BOOKING_ATTEMPTS_ID, ATTEMPT_WINDOW_MS, now);
    if (wait) return reject(res, 429, 'CUSTOMER_THROTTLED', 'Too many booking attempts for this customer.', wait);
  }

  successes = successes.filter(entry => entry && Number.isFinite(entry.at) && now - entry.at < SUCCESS_WINDOW_MS);
  if (successes.filter(s => s.ip === ipHash).length >= MAX_SUCCESS_PER_IP) {
    return reject(res, 429, 'BOOKING_LIMIT', 'Maximum bookings from this connection reached for the current period.', 86400);
  }
  if (identityIds.some(id => successes.filter(s => s.ids.includes(id)).length >= MAX_SUCCESS_PER_ID)) {
    return reject(res, 429, 'CUSTOMER_BOOKING_LIMIT', 'Maximum appointments reached for this customer in the current period.', 86400);
  }
  const lockKeys = identityIds.length ? identityIds : [ipHash];
  if (lockKeys.some(k => inFlight.has(k))) {
    return reject(res, 409, 'BOOKING_IN_PROGRESS', 'An appointment request is already processing. Please do not submit twice.', 5);
  }
  lockKeys.forEach(k => inFlight.add(k));
  let finished = false;
  const release = () => lockKeys.forEach(k => inFlight.delete(k));
  res.once('finish', () => {
    if (finished) return;
    finished = true;
    try {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        successes.push({ at: Date.now(), ip: ipHash, ids: identityIds });
        saveSuccesses();
      }
    } catch (error) {
      console.error('[compass-booking-guard] Could not persist successful booking event:', error);
    } finally {
      release();
    }
  });
  res.once('close', () => { if (!finished) release(); });
  next();
};