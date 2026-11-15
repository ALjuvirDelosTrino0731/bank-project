"use strict";
// Compass Bank customer-owned appointment access.
// DB-backed email challenge & short-lived bearer grant.
// Mount under /api/appointments/access and requireVerifiedAccess before /lookup, /qr, /cancel.
const express = require('express');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
// COMPASS RENDER HTTPS EMAIL V1
const renderMailer = require("./compass-email-delivery.cjs");
const db = require('./db');
const router = express.Router();

const OTP_LIFETIME_MINUTES = 10;
const ACCESS_LIFETIME_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const GENERIC_MESSAGE = 'If the appointment and registered contact match, a code will be sent to the registered email address.';

function validReference(value) {
  return typeof value === 'string' && /^CB-[0-9a-f-]{36}$/i.test(value);
}
function validContact(value) {
  return typeof value === 'string' && value.trim().length >= 3 && value.length <= 254;
}
function normalizeContact(value) { return String(value).trim().toLowerCase(); }
function secret() {
  const value = process.env.COMPASS_OTP_SECRET || '';
  if (value.length < 48) throw new Error('COMPASS_OTP_SECRET is not configured');
  return value;
}
function codeHash(id, code) {
  return crypto.createHmac('sha256', secret()).update(id + ':' + code).digest('hex');
}
function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function enforceOtp() {
  return process.env.COMPASS_CUSTOMER_OTP_ENFORCED === '1';
}
function mailReady() {
  if (process.env.COMPASS_EMAIL_PROVIDER === "resend") return renderMailer.isReady();
  const port = Number(process.env.SMTP_PORT || '587');
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM &&
    Number.isInteger(port) && port > 0 && port < 65536 &&
    ((!process.env.SMTP_USER && !process.env.SMTP_PASS) ||
      (process.env.SMTP_USER && process.env.SMTP_PASS)));
}
function transporter() {
  const port = Number(process.env.SMTP_PORT || '587');
  const config = {
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    tls: {minVersion: 'TLSv1.2'},
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000
  };
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    config.auth = {user:process.env.SMTP_USER, pass:process.env.SMTP_PASS};
  }
  return nodemailer.createTransport(config);
}
async function sendOwnershipEmail(message) {
  if (process.env.COMPASS_EMAIL_PROVIDER === 'resend') {
    return renderMailer.sendMail(message);
  }
  return transporter().sendMail(message);
}
function noStore(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
}
function reply(res, status, payload) { noStore(res); return res.status(status).json(payload); }

// Returns a generic result whether the reference/contact exists or not.
// Email is always taken from the DATABASE, never from an arbitrary delivery address.
router.post('/request-code', async (req, res) => {
  const {reference_number, contact} = req.body || {};
  if (!validReference(reference_number) || !validContact(contact)) {
    return reply(res, 400, {status:'error', message:'Enter a valid appointment reference and registered email or phone.'});
  }
  try { secret(); } catch (_) {
    return reply(res, 503, {status:'error', message:'Email verification is not configured.'});
  }
  if (!mailReady()) {
    return reply(res, 503, {status:'error', message:'Email delivery is not configured.'});
  }

  const dummyId = crypto.randomUUID();
  let connection;
  let challenge = null;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(`
      SELECT a.appointment_id, c.email
      FROM appointments a JOIN customers c ON c.customer_id = a.customer_id
      WHERE a.reference_number = ?
        AND (LOWER(c.email) = ? OR c.phone_number = ?)
      LIMIT 1 FOR UPDATE
    `, [reference_number, normalizeContact(contact), String(contact).trim()]);

    if (rows.length) {
      const row = rows[0];
      const [limits] = await connection.query(`
        SELECT COUNT(*) AS one_hour_count,
               COALESCE(TIMESTAMPDIFF(SECOND, MAX(created_at), UTC_TIMESTAMP(3)), 100000) AS since_last
        FROM appointment_access_codes
        WHERE appointment_id = ?
          AND created_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)
      `, [row.appointment_id]);
      const count = Number(limits[0].one_hour_count);
      const since = Number(limits[0].since_last);
      if (count < 4 && since >= 90) {
        const id = crypto.randomUUID();
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const hash = codeHash(id, code);
        await connection.query(`
          INSERT INTO appointment_access_codes
            (challenge_id, appointment_id, code_hash, created_at, expires_at)
          VALUES (?, ?, ?, UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE))
        `, [id, row.appointment_id, hash]);
        challenge = {id, code, email:row.email};
      }
    }
    await connection.commit();
    connection.release();
    connection = null;

    if (challenge) {
      try {
        await sendOwnershipEmail({
          from:process.env.SMTP_FROM,
          to:challenge.email,
          subject:'Compass Bank appointment verification code',
          text:`Your Compass Bank appointment access code is ${challenge.code}. It expires in ${OTP_LIFETIME_MINUTES} minutes. If you did not request this, ignore this email. Never share this code.`,
          html:`<p>Your Compass Bank appointment verification code is <strong>${challenge.code}</strong>.</p><p>This code expires in ${OTP_LIFETIME_MINUTES} minutes. If you did not request it, ignore this message.</p>`
        });
      } catch (err) {
        console.error('[customer ownership] Email delivery failed:', err.code || err.message);
        try { await db.query('DELETE FROM appointment_access_codes WHERE challenge_id = ?', [challenge.id]); }
        catch (dbErr) { console.error('[customer ownership] Failed to clear unused challenge:', dbErr.code || dbErr.message); }
        // No appointment-existence signal; same API shape as an unmatched reference.
        return reply(res, 202, {status:'ok', message:GENERIC_MESSAGE, challenge_id:dummyId});
      }
    }
    return reply(res, 202, {
      status:'ok', message:GENERIC_MESSAGE,
      challenge_id:challenge ? challenge.id : dummyId
    });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    console.error('[customer ownership] Code request failed:', err.code || err.message);
    return reply(res, 503, {status:'error', message:'Verification is temporarily unavailable.'});
  } finally {
    if (connection) connection.release();
  }
});

// A valid code is exchanged once for a random 15-minute bearer token.
router.post('/verify-code', async (req, res) => {
  const {challenge_id, code} = req.body || {};
  if (typeof challenge_id !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(challenge_id) ||
      typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return reply(res, 400, {status:'error', message:'Invalid verification request.'});
  }
  try { secret(); } catch (_) {
    return reply(res, 503, {status:'error', message:'Email verification is not configured.'});
  }
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(`
      SELECT appointment_id, code_hash, attempts,
             (expires_at <= UTC_TIMESTAMP(3)) AS expired,
             (consumed_at IS NOT NULL) AS consumed
      FROM appointment_access_codes WHERE challenge_id = ? FOR UPDATE
    `, [challenge_id]);
    const row = rows[0];
    if (!row || Number(row.expired) || Number(row.consumed) || Number(row.attempts) >= MAX_ATTEMPTS) {
      await connection.rollback();
      return reply(res, 401, {status:'error', message:'Code is invalid, expired, or already used.'});
    }
    const computed = codeHash(challenge_id, code);
    const valid = crypto.timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(computed, 'hex'));
    if (!valid) {
      await connection.query('UPDATE appointment_access_codes SET attempts = attempts + 1 WHERE challenge_id = ?', [challenge_id]);
      await connection.commit();
      return reply(res, 401, {status:'error', message:'Code is invalid, expired, or already used.'});
    }
    const token = crypto.randomBytes(32).toString('hex');
    const hashed = tokenHash(token);
    await connection.query('UPDATE appointment_access_codes SET consumed_at = UTC_TIMESTAMP(3) WHERE challenge_id = ?', [challenge_id]);
    await connection.query(`
      INSERT INTO appointment_access_grants (token_hash, appointment_id, created_at, expires_at)
      VALUES (?, ?, UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE))
    `, [hashed, row.appointment_id]);
    await connection.commit();
    return reply(res, 200, {status:'ok', access_token:token, expires_in_seconds:ACCESS_LIFETIME_MINUTES * 60});
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('[customer ownership] Verify failed:', err.code || err.message);
    return reply(res, 503, {status:'error', message:'Verification is temporarily unavailable.'});
  } finally { if (connection) connection.release(); }
});

async function requireVerifiedAccess(req, res, next) {
  noStore(res);
  // Staging rollout: legacy endpoints only become restricted after explicitly enabling.
  if (!enforceOtp()) return next();
  const token = req.get('X-Appointment-Access-Token') || req.body?.access_token;
  const reference = req.body?.reference_number;
  const contact = req.body?.contact;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token) ||
      !validReference(reference) || !validContact(contact)) {
    return reply(res, 401, {status:'error', code:'EMAIL_VERIFICATION_REQUIRED',message:'Email verification is required. Use the secure booking management page.'});
  }
  try {
    const [rows] = await db.query(`
      SELECT g.appointment_id
      FROM appointment_access_grants g
      JOIN appointments a ON a.appointment_id = g.appointment_id
      JOIN customers c ON c.customer_id = a.customer_id
      WHERE g.token_hash = ? AND g.revoked_at IS NULL
        AND g.expires_at > UTC_TIMESTAMP(3)
        AND a.reference_number = ?
        AND (LOWER(c.email) = ? OR c.phone_number = ?)
      LIMIT 1
    `, [tokenHash(token), reference, normalizeContact(contact), String(contact).trim()]);
    if (!rows.length) {
      return reply(res, 401, {status:'error', code:'EMAIL_VERIFICATION_REQUIRED',message:'Verification has expired or does not match this appointment.'});
    }
    req.compassAppointmentAccess = {appointment_id:rows[0].appointment_id};
    return next();
  } catch (err) {
    console.error('[customer ownership] Access check failed:', err.code || err.message);
    return reply(res, 503, {status:'error', message:'Verification is temporarily unavailable.'});
  }
}

module.exports = {router, requireVerifiedAccess, _test:{validReference, validContact, codeHash, tokenHash, enforceOtp}};
