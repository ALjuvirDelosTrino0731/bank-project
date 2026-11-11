// Integration test: creates exactly one disposable appointment, then cancels it.
// Never touches existing appointments. Run against your LOCAL development server only.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const db = require('./db');
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(BASE)) {
  console.error('Refusing to run: TEST_BASE_URL must be local HTTP localhost/127.0.0.1.');
  process.exit(1);
}
const api = async (route, body) => {
  const r = await fetch(BASE + route, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  return {code:r.status, body:await r.json()};
};
const dateInManila = (days) => {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
};
const capacity = async (date, time) => {
  const [rows] = await db.query(`SELECT COUNT(*) AS n FROM appointments WHERE appointment_date=? AND appointment_time=? AND status IN ('pending','confirmed','checked_in')`,[date,time+':00']);
  return Number(rows[0].n);
};
(async () => {
  let date, slot;
  for (let day=3; day<=30 && !slot; day++) {
    const d=dateInManila(day);
    const r=await fetch(BASE+'/api/booking-availability?date='+d);
    if (!r.ok) throw Error('Availability HTTP '+r.status);
    const b=await r.json();
    const candidate=(b.available_slots||[]).find(s=>s.remaining_capacity>0);
    if (candidate) {date=d;slot=candidate;}
  }
  if (!slot) throw Error('No available future slot within 30 days; no appointment created.');
  const time=slot.time;
  const [services]=await db.query('SELECT service_id FROM services WHERE is_active=1 ORDER BY service_id LIMIT 1');
  if (!services.length) throw Error('No active services; no appointment created.');
  const before=await capacity(date,time);
  const contact='lifecycle-'+randomUUID().slice(0,12)+'@example.com';
  const created=await api('/api/appointments',{full_name:'Automated Lifecycle Test',email:contact,phone_number:'09170000000',appointment_date:date,appointment_time:time,service_ids:[services[0].service_id],customer_notes:'Automated disposable test; no real account details'});
  assert.equal(created.code,201,'Create failed: '+JSON.stringify(created.body));
  const ref=created.body.appointment.reference_number;
  console.log('PASS create temporary pending appointment:',ref,date,time);
  try {
    const after=await capacity(date,time);
    assert.equal(after,before+1,'Active slot count should increase by 1');
    console.log('PASS active slot count increased');
    const lookup=await api('/api/appointments/lookup',{reference_number:ref,contact});
    assert.equal(lookup.code,200,'Lookup failed: '+JSON.stringify(lookup.body));
    assert.equal(lookup.body.appointment.status,'pending');
    console.log('PASS lookup with correct contact');
    const denied=await api('/api/appointments/lookup',{reference_number:ref,contact:'wrong@example.com'});
    assert.equal(denied.code,404,'Incorrect contact should not find booking');
    console.log('PASS incorrect contact denied');
    const cancelled=await api('/api/appointments/cancel',{reference_number:ref,contact});
    assert.equal(cancelled.code,200,'Cancel failed: '+JSON.stringify(cancelled.body));
    console.log('PASS cancel appointment');
    const [rows]=await db.query('SELECT appointment_id,status FROM appointments WHERE reference_number=?',[ref]);
    assert.equal(rows[0].status,'cancelled');
    const [history]=await db.query("SELECT old_status,new_status FROM appointment_status_history WHERE appointment_id=? AND new_status='cancelled'",[rows[0].appointment_id]);
    assert.equal(history.length,1);
    assert.equal(history[0].old_status,'pending');
    console.log('PASS MySQL cancellation and history');
    assert.equal(await capacity(date,time),before,'Cancelled booking must release capacity');
    console.log('PASS slot capacity restored');
    const twice=await api('/api/appointments/cancel',{reference_number:ref,contact});
    assert.equal(twice.code,409,'Second cancellation must be rejected');
    console.log('PASS repeat cancellation rejected');
    console.log('7/7 lifecycle checks passed. Test booking retained with cancelled status for audit history.');
  } catch(err) {
    console.error('TEST FAILED for temporary booking',ref,'— may still be pending. Cancel manually if needed.');
    throw err;
  }
})().catch(e=>{console.error('FAIL:',e.message);process.exitCode=1;}).finally(()=>db.end());
