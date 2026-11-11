'use strict';
const express=require('express');
const db=require('./db');
const router=express.Router();

// Operational events only: no customer PII is inserted into the ML observation table.
// Dates and hours are generated from the server clock in the branch's local timezone.
function manilaNow(){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date());
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return {date:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour)};
}
function fail(res,e,location){
  console.error('Verified visits '+location+':',e.code||e.message);
  if(e.code==='ER_NO_SUCH_TABLE')return res.status(503).json({status:'error',message:'Verified visits database migration has not been applied. Run backend/migrations/phase4q_verified_visits.sql.'});
  return res.status(500).json({status:'error',message:'Unable to process verified visit'});
}
function validRange(from,to){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return false;
  const start=new Date(from+'T00:00:00Z'),end=new Date(to+'T00:00:00Z');
  return !Number.isNaN(start.valueOf())&&!Number.isNaN(end.valueOf())&&start.toISOString().slice(0,10)===from&&end.toISOString().slice(0,10)===to&&end>=start&&end-start<=366*86400000;
}
router.post('/appointments/:reference/check-in',async(req,res)=>{
  const ref=String(req.params.reference||'').trim();
  if(!ref||ref.length>128)return res.status(400).json({status:'error',message:'Invalid appointment reference'});
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query('SELECT appointment_id,status FROM appointments WHERE reference_number=? FOR UPDATE',[ref]);
    if(!rows.length){await conn.rollback();return res.status(404).json({status:'error',message:'Appointment not found'});}
    if(rows[0].status!=='confirmed'){
      await conn.rollback();
      return res.status(409).json({status:'error',message:'Only approved appointments can be checked in. Already checked-in and cancelled bookings cannot be counted twice.'});
    }
    const now=manilaNow();
    await conn.query(
      'INSERT INTO verified_visit_events (event_type,appointment_reference,visit_count,visit_date,visit_hour) VALUES (?,?,?,?,?)',
      ['appointment_checkin',ref,1,now.date,now.hour]
    );
    await conn.query('UPDATE appointments SET status=? WHERE appointment_id=?',['checked_in',rows[0].appointment_id]);
    await conn.query('INSERT INTO appointment_status_history (appointment_id,old_status,new_status,changed_by_employee_id,change_reason) VALUES (?,?,?,NULL,?)',
      [rows[0].appointment_id,'confirmed','checked_in','Employee verified arrival (Phase 4Q-A)']);
    await conn.commit();
    res.status(201).json({status:'ok',reference_number:ref,appointment_status:'checked_in',recorded_visit_date:now.date,recorded_hour:now.hour,recorded_visits:1});
  }catch(e){
    try{await conn.rollback();}catch(_){}
    if(e.code==='ER_DUP_ENTRY')return res.status(409).json({status:'error',message:'This appointment already has a recorded arrival'});
    fail(res,e,'appointment check-in');
  }finally{conn.release();}
});
router.post('/walk-ins',async(req,res)=>{
  const count=req.body?.count;
  if(!Number.isInteger(count)||count<1||count>50)return res.status(400).json({status:'error',message:'Enter a whole-number verified walk-in count from 1 to 50'});
  if(req.body?.confirmed!==true)return res.status(400).json({status:'error',message:'Employee confirmation of observed arrivals is required'});
  const now=manilaNow();
  try{
    const [result]=await db.query(
      'INSERT INTO verified_visit_events (event_type,appointment_reference,visit_count,visit_date,visit_hour) VALUES (?,NULL,?,?,?)',
      ['walk_in',count,now.date,now.hour]
    );
    res.status(201).json({status:'ok',event_id:result.insertId,visit_date:now.date,visit_hour:now.hour,recorded_visits:count});
  }catch(e){fail(res,e,'walk-in');}
});
router.get('/hourly',async(req,res)=>{
  const today=manilaNow().date,from=String(req.query.from||today),to=String(req.query.to||today);
  if(!validRange(from,to))return res.status(400).json({status:'error',message:'Use valid from/to dates (YYYY-MM-DD) within 366 days'});
  try{
    const [rows]=await db.query(
      'SELECT DATE_FORMAT(visit_date,"%Y-%m-%d") AS date,visit_hour AS hour_start,'+
      'SUM(CASE WHEN event_type="appointment_checkin" THEN visit_count ELSE 0 END) AS checked_in,'+
      'SUM(CASE WHEN event_type="walk_in" THEN visit_count ELSE 0 END) AS walk_ins,'+
      'SUM(visit_count) AS verified_total FROM verified_visit_events '+
      'WHERE visit_date BETWEEN ? AND ? GROUP BY visit_date,visit_hour ORDER BY visit_date,visit_hour',
      [from,to]
    );
    const output=rows.map(r=>({date:r.date,hour_start:Number(r.hour_start),checked_in:Number(r.checked_in),walk_ins:Number(r.walk_ins),verified_total:Number(r.verified_total)}));
    res.set('Cache-Control','no-store');
    res.json({status:'ok',source:'employee-verified arrivals only; bookings are not counted',timezone:'Asia/Manila',from,to,rows:output});
  }catch(e){fail(res,e,'hourly data');}
});
router.get('/no-shows',async(req,res)=>{
  const today=manilaNow().date,from=String(req.query.from||today),to=String(req.query.to||today);
  if(!validRange(from,to))return res.status(400).json({status:'error',message:'Use valid from/to dates (YYYY-MM-DD) within 366 days'});
  try{
    const [rows]=await db.query(
      'SELECT DATE_FORMAT(appointment_date,"%Y-%m-%d") AS date,COUNT(*) AS no_show_count FROM appointments WHERE status=? AND appointment_date BETWEEN ? AND ? GROUP BY appointment_date ORDER BY appointment_date',
      ['no_show',from,to]
    );
    res.set('Cache-Control','no-store');
    res.json({status:'ok',source:'employee-reported no-show statuses',rows:rows.map(r=>({date:r.date,no_show_count:Number(r.no_show_count)}))});
  }catch(e){fail(res,e,'no-show report');}
});
module.exports=router;
