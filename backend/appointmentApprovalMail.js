'use strict';

// COMPASS_UNIVERSAL_SMTP_V1
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const db = require('./db');

function configured() {
  return ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
    .every(key => Boolean(process.env[key]?.trim()));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

async function sendApprovedAppointment(reference) {
  if (!configured()) {
    console.log('Approval email skipped: SMTP not configured');
    return 'not_configured';
  }

  try {
    const [rows] = await db.query(
      `SELECT c.email, c.full_name,
              DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS visit_date,
              TIME_FORMAT(a.appointment_time, '%H:%i') AS visit_time
       FROM appointments a
       JOIN customers c ON c.customer_id = a.customer_id
       WHERE a.reference_number = ?
         AND a.status = 'confirmed'
       LIMIT 1`,
      [reference]
    );

    if (!rows.length || !rows[0].email) {
      return 'no_recipient';
    }

    const appointment = rows[0];
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = port === 465;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      requireTLS: !secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });

    const qr = await QRCode.toBuffer(reference, {
      type: 'png',
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    const name = escapeHtml(appointment.full_name);
    const ref = escapeHtml(reference);
    const date = escapeHtml(appointment.visit_date);
    const time = escapeHtml(appointment.visit_time);

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: appointment.email,
      subject: 'Compass Bank - Appointment Approved',
      text:
        'Hello ' + appointment.full_name + ',\n\n' +
        'Your Compass Bank appointment is approved.\n\n' +
        'Reference: ' + reference + '\n' +
        'Date: ' + appointment.visit_date + '\n' +
        'Time: ' + appointment.visit_time + ' (Asia/Manila)\n\n' +
        'Present your QR code and a valid ID at the branch. ' +
        'An employee must verify your arrival.\n\n' +
        'This message is from a student prototype.',
      html:
        '<h2>Compass Bank - Appointment Approved</h2>' +
        '<p>Hello ' + name + ',</p>' +
        '<p>Your branch appointment has been approved.</p>' +
        '<p><b>Reference:</b> ' + ref + '</p>' +
        '<p><b>Date:</b> ' + date + '</p>' +
        '<p><b>Time:</b> ' + time + ' (Asia/Manila)</p>' +
        '<p><img src="cid:compass-arrival-qr" ' +
        'alt="Appointment QR code" width="240"></p>' +
        '<p>Present this QR and a valid ID to branch staff. ' +
        'Employee verification is required to check in.</p>' +
        '<p><small>Student prototype demonstration.</small></p>',
      attachments: [{
        filename: 'compass-appointment-qr.png',
        content: qr,
        cid: 'compass-arrival-qr',
        contentType: 'image/png'
      }]
    });

    console.log('Approval email accepted by SMTP provider');
    return 'sent';

  } catch (error) {
    console.error(
      'Approval email failed:',
      error.code || error.message
    );
    return 'failed';
  }
}

module.exports = { sendApprovedAppointment };