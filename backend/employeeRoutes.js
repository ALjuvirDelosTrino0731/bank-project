const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const router = express.Router();
const sessions = new Map();
const MAX_AGE = 2 * 60 * 60 * 1000;

// Bank-approved threshold only. No default financial threshold.
const reviewThresholdText =
  String(process.env.BANK_CASH_REVIEW_THRESHOLD_PHP || '').trim();

function parseBankAmount(description) {
  const text = String(description || '');
  const match = text.match(
    /\u20b1\s*([0-9][0-9,]*\.[0-9]{2})(?![0-9A-Za-z.,+\-])/u
  );
  if (!match) return null;

  const raw = match[1];
  const integerPart = raw.split('.')[0];

  if (!/^(?:[0-9]{1,9}|[0-9]{1,3}(?:,[0-9]{3}){1,2})$/.test(integerPart)) {
    return null;
  }

  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) &&
    value > 0 && value <= 999999999.99 ? value : null;
}

const cashReviewThreshold =
  /^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/.test(reviewThresholdText)
    && Number(reviewThresholdText) > 0
    ? Number(reviewThresholdText)
    : null;
const failed = new Map();
function verifyPassword(given, expected) {
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
router.post('/login', (req,res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const ip = req.ip || 'unknown';
  const entry = failed.get(ip) || {count:0, until:0};
  if (entry.until > Date.now()) return res.status(429).json({status:'error',message:'Too many attempts. Try again later.'});
  const configured = process.env.EMPLOYEE_USERNAME && process.env.EMPLOYEE_PASSWORD && process.env.EMPLOYEE_PASSWORD.length >= 12;
  if (!configured) return res.status(503).json({status:'error',message:'Employee login is not configured'});
  if (username !== process.env.EMPLOYEE_USERNAME || !verifyPassword(password, process.env.EMPLOYEE_PASSWORD)) {
    entry.count++;
    if (entry.count >= 5) { entry.until = Date.now() + 15*60*1000; entry.count = 0; }
    failed.set(ip,entry);
    return res.status(401).json({status:'error',message:'Invalid credentials'});
  }
  failed.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token,Date.now()+MAX_AGE);
  res.set('Cache-Control','no-store');
  return res.json({status:'ok',token,expires_in_seconds:MAX_AGE/1000});
});
function auth(req,res,next) {
  const token = /^Bearer ([a-f0-9]{64})$/.exec(req.get('Authorization')||'')?.[1];
  if (!token || !sessions.has(token) || sessions.get(token) < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({status:'error',message:'Employee authentication required'});
  }
  res.set('Cache-Control','no-store');
  req.employeeToken = token;
  next();
}
router.post('/logout',auth,(req,res)=>{sessions.delete(req.employeeToken);res.json({status:'ok'});});
router.get('/appointments',auth,async(req,res)=>{
  try {
    const [rows] = await db.query(`SELECT a.appointment_id,a.reference_number,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS date,TIME_FORMAT(a.appointment_time,'%H:%i') AS time,a.status,c.full_name,c.email,c.phone_number,s.service_name,t.customer_notes FROM appointments a JOIN customers c ON c.customer_id=a.customer_id LEFT JOIN appointment_transactions t ON t.appointment_id=a.appointment_id LEFT JOIN services s ON s.service_id=t.service_id ORDER BY a.appointment_date DESC,a.appointment_time DESC,a.appointment_id DESC LIMIT 1000`);
    const grouped = new Map();
    const descriptions = new Map();

    for (const r of rows) {
      if (!grouped.has(r.appointment_id)) {
        grouped.set(r.appointment_id, {
          id: r.reference_number,
          appointment_id: r.appointment_id,
          name: r.full_name,
          email: r.email,
          phone: r.phone_number,
          date: r.date,
          time: r.time,
          status: r.status,
          transactions: [],
          type: r.service_name || 'Not specified',
          accountNumber: 'Masked',
          amount: null,
          checkNumber: '',
          amountDataQualityIssue: false,
          cashReviewEligible: false,
          cashReviewPolicyConfigured: cashReviewThreshold !== null,
          cashReviewRequired: false
        });

        descriptions.set(r.appointment_id, []);
      }

      if (!r.service_name) continue;

      const seen = descriptions.get(r.appointment_id);
      const note = String(r.customer_notes || '').trim();

      // Evaluate individual cash-related transaction amounts.
      const cashServices = new Set([
        'Cash Deposit',
        'Cash Withdrawal',
        'Bill Payment - Cash'
      ]);

      if (cashServices.has(r.service_name)) {
        const appointment = grouped.get(r.appointment_id);
        appointment.cashReviewEligible = true;

        const amount = parseBankAmount(note);

        if (amount === null) {
          appointment.amountDataQualityIssue = true;
        } else if (
          cashReviewThreshold !== null &&
          amount >= cashReviewThreshold
        ) {
          appointment.cashReviewRequired = true;
        }
      }

      const details = note
        ? note.split(' | ').map(s => s.trim()).filter(Boolean)
        : [r.service_name];

      details.forEach(detail => seen.push(detail));
    }

    for (const [id, appointment] of grouped) {
      appointment.transactions = [...descriptions.get(id)];

      let total = 0;
      let foundAmount = false;

      for (const detail of appointment.transactions) {
        const amount = parseBankAmount(detail);

        if (amount !== null) {
          total += amount;
          foundAmount = true;
        } else if (detail.includes('\u20b1')) {
          appointment.amountDataQualityIssue = true;
        }
      }

      appointment.amount =
        foundAmount && !appointment.amountDataQualityIssue
          ? total
          : null;
    }

    res.json({status:'ok',appointments:[...grouped.values()]});

  } catch(e) {console.error('Employee appointments:',e.code||e.message);res.status(500).json({status:'error',message:'Unable to load appointments'});}
});
router.patch('/appointments/:id/status',auth,async(req,res)=>{
  const nextStatus=String(req.body?.status||'');
  const allowed={pending:['confirmed','cancelled'],confirmed:['cancelled','no_show'],checked_in:['completed'],completed:[],cancelled:[],no_show:[]};
  // Check-ins must go through POST /visits/appointments/:reference/check-in to create a verified event atomically.
  if(!Object.hasOwn(allowed,nextStatus)) return res.status(400).json({status:'error',message:'Invalid status'});
  const connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]=await connection.query("SELECT appointment_id,status,DATE_FORMAT(appointment_date,'%Y-%m-%d') AS appointment_date,TIME_FORMAT(appointment_time,'%H:%i') AS appointment_time FROM appointments WHERE reference_number=? FOR UPDATE",[req.params.id]);
    if(!rows.length){await connection.rollback();return res.status(404).json({status:'error',message:'Appointment not found'});}
    const a=rows[0];
    if(!allowed[a.status]?.includes(nextStatus)){await connection.rollback();return res.status(409).json({status:'error',message:'Invalid status transition'});}
    if(nextStatus==='no_show'){
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
      const p=Object.fromEntries(parts.map(v=>[v.type,v.value]));
      const now=p.year+'-'+p.month+'-'+p.day+' '+p.hour+':'+p.minute;
      const scheduled=a.appointment_date+' '+a.appointment_time;
      if(scheduled>now){
        await connection.rollback();
        return res.status(409).json({status:'error',message:'A no-show can be recorded only after the scheduled appointment time'});
      }
    }
    await connection.query('UPDATE appointments SET status=? WHERE appointment_id=?',[nextStatus,a.appointment_id]);
    await connection.query('INSERT INTO appointment_status_history (appointment_id,old_status,new_status,changed_by_employee_id,change_reason) VALUES (?,?,?,NULL,?)',[a.appointment_id,a.status,nextStatus,'Employee dashboard (prototype login)']);
    await connection.commit();

    // COMPASS_UNIVERSAL_SMTP_V1
    // Send only after the appointment approval is committed.
    let email_delivery = 'not_applicable';

    if (nextStatus === 'confirmed') {
      try {
        email_delivery = await require('./appointmentApprovalMail')
          .sendApprovedAppointment(req.params.id);
      } catch (emailError) {
        console.error(
          'Approval notification error:',
          emailError.code || emailError.message
        );
        email_delivery = 'failed';
      }
    }

    res.json({
      status: 'ok',
      reference_number: req.params.id,
      old_status: a.status,
      new_status: nextStatus,
      email_delivery
    });
  }catch(e){await connection.rollback();console.error('Employee status:',e.code||e.message);res.status(500).json({status:'error',message:'Unable to update appointment'});}finally{connection.release();}
});
router.use('/visits',auth,require('./visitRoutes'));

// Authenticated experimental inference; not a live Philippine branch forecast.
router.post('/research/predict',auth,(req,res)=>{
  const body=req.body;
  if(!body || typeof body!=='object' || Array.isArray(body)){
    return res.status(400).json({ok:false,error:'JSON object required'});
  }

  const validInt=(value,min,max)=>
    Number.isInteger(value) && value>=min && value<=max;

  if(!validInt(body.bank_id,1,3) ||
     !validInt(body.day_position,1,5) ||
     (body.hour!==undefined && body.hour!==null &&
      !validInt(body.hour,8,14))){
    return res.status(400).json({
      ok:false,
      error:'Expected bank_id 1-3, day_position 1-5, optional hour 8-14 (integers)'
    });
  }

  const path=require('path');
  const {spawnSync}=require('child_process');
  const fs=require('fs');

  const root=path.resolve(__dirname,'..');
  const script=path.join(root,'ml-models','reconciled','experimental_inference.py');

  const defaultPython=process.platform==='win32'
    ? path.join(root,'ml-models','.venv','Scripts','python.exe')
    : path.join(root,'ml-models','.venv','bin','python');

  const python=process.env.COMPASS_PYTHON_INFERENCE || defaultPython;

  if(!fs.existsSync(script) || !fs.existsSync(python)){
    return res.status(503).json({
      ok:false,error:'Experimental inference service is not configured'
    });
  }

  const input={
    bank_id:body.bank_id,
    day_position:body.day_position
  };

  if(body.hour!==undefined && body.hour!==null) input.hour=body.hour;

  const run=spawnSync(python,[script],{
    input:JSON.stringify(input),
    encoding:'utf8',
    timeout:15000,
    maxBuffer:256*1024,
    windowsHide:true
  });

  if(run.error || run.status!==0){
    console.error('Experimental inference process failed:',
      run.error?.code || run.status);
    return res.status(503).json({
      ok:false,error:'Experimental model inference unavailable'
    });
  }

  let payload;
  try{
    payload=JSON.parse(run.stdout);
  }catch(_){
    return res.status(503).json({
      ok:false,error:'Invalid experimental model response'
    });
  }

  if(!payload || payload.ok!==true || !payload.result ||
     payload.result.status!=='experimental_model_inference'){
    return res.status(503).json({
      ok:false,error:'Experimental model prediction failed'
    });
  }

  res.set('Cache-Control','no-store');
  return res.json(payload);
});

router.use('/datasets',auth,require('./datasetRoutes'));
module.exports=router;
