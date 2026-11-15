'use strict';
// HTTPS-based transactional delivery for Render Free, preserving local SMTP fallback.
// Sends only messages created by the server's existing OTP flow.
function isReady() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}
async function sendMail(message) {
  if (!isReady()) throw new Error('Resend email API is not configured');
  if (!message || !message.to || !message.subject) throw new Error('Email is missing required fields');
  if (typeof fetch !== 'function') throw new Error('Global fetch requires Node.js 18+');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    // Never log API keys, email addresses, OTP codes, or provider response bodies.
    throw new Error('Resend email API rejected request: HTTP ' + response.status);
  }
  return {accepted: [message.to]};
}
module.exports = {isReady, sendMail};
