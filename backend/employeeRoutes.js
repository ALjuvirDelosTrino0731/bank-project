const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const router = express.Router();
const sessions = new Map();
const MAX_AGE = 2 * 60 * 60 * 1000;
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
    for(const r of rows) {
      if(!grouped.has(r.appointment_id)) grouped.set(r.appointment_id,{id:r.reference_number,appointment_id:r.appointment_id,name:r.full_name,email:r.email,phone:r.phone_number,date:r.date,time:r.time,status:r.status,transactions:[],type:r.service_name||'Not specified',accountNumber:'Masked',amount:null,checkNumber:''});
      if(r.service_name) {
        const appointment = grouped.get(r.appointment_id);
        appointment.transactions.push(r.customer_notes || r.service_name);
        // Only interpret an amount when the booking notes explicitly contain one.
        // Do not infer amounts from account numbers or expose full account numbers.
        const match = String(r.customer_notes || '').match(/(?:₱|\?)([0-9][0-9,]*\.[0-9]{2})\s*\(Acc:/i);
        if (match) {
          const amount = Number(match[1].replace(/,/g,''));
          if (Number.isFinite(amount) && amount >= 0) appointment.amount = (appointment.amount || 0) + amount;
        }
      }
    }
    res.json({status:'ok',appointments:[...grouped.values()]});
  } catch(e) {console.error('Employee appointments:',e.code||e.message);res.status(500).json({status:'error',message:'Unable to load appointments'});}
});
router.patch('/appointments/:id/status',auth,async(req,res)=>{
  const nextStatus=String(req.body?.status||'');
  const allowed={pending:['confirmed','cancelled'],confirmed:['checked_in','cancelled','no_show'],checked_in:['completed'],completed:[],cancelled:[],no_show:[]};
  if(!Object.hasOwn(allowed,nextStatus)) return res.status(400).json({status:'error',message:'Invalid status'});
  const connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]=await connection.query('SELECT appointment_id,status FROM appointments WHERE reference_number=? FOR UPDATE',[req.params.id]);
    if(!rows.length){await connection.rollback();return res.status(404).json({status:'error',message:'Appointment not found'});}
    const a=rows[0];
    if(!allowed[a.status]?.includes(nextStatus)){await connection.rollback();return res.status(409).json({status:'error',message:'Invalid status transition'});}
    await connection.query('UPDATE appointments SET status=? WHERE appointment_id=?',[nextStatus,a.appointment_id]);
    await connection.query('INSERT INTO appointment_status_history (appointment_id,old_status,new_status,changed_by_employee_id,change_reason) VALUES (?,?,?,NULL,?)',[a.appointment_id,a.status,nextStatus,'Employee dashboard (prototype login)']);
    await connection.commit();res.json({status:'ok',reference_number:req.params.id,old_status:a.status,new_status:nextStatus});
  }catch(e){await connection.rollback();console.error('Employee status:',e.code||e.message);res.status(500).json({status:'error',message:'Unable to update appointment'});}finally{connection.release();}
});
router.use('/datasets',auth,require('./datasetRoutes'));
module.exports=router;
