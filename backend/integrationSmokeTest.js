// Non-destructive smoke tests. Run while node server.js is active.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
  const cases = [
    ['/api/health', 200],
    ['/api/db-health', 200],
    ['/api/services', 200],
    ['/customer/', 200],
  ];
  for (const [route, expected] of cases) {
    const response = await fetch(base + route);
    assert.equal(response.status, expected, route + ' expected HTTP ' + expected);
    console.log('PASS', route, response.status);
  }
  for (const route of ['/api/appointments/lookup','/api/appointments/cancel']) {
    const response = await fetch(base + route, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
    assert.equal(response.status, 400, route + ' must reject invalid input');
    console.log('PASS', route, 'invalid input rejected');
  }
  console.log('6/6 smoke checks passed. These tests do not create or cancel bookings.');
})().catch(e => { console.error('FAIL:', e.message); process.exitCode = 1; });
