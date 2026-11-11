const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
async function call(path,method='GET',token,body){const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
(async()=>{
  let r=await call('/api/employee/appointments');assert.equal(r.status,401);console.log('PASS unauthorized appointment listing blocked');
  r=await call('/api/employee/login','POST',null,{username:'wrong',password:'wrong'});assert.ok([401,503].includes(r.status));console.log('PASS invalid login denied');
  if(!process.env.EMPLOYEE_USERNAME||!process.env.EMPLOYEE_PASSWORD){console.log('Set EMPLOYEE_USERNAME and EMPLOYEE_PASSWORD in .env to run authenticated checks');return;}
  r=await call('/api/employee/login','POST',null,{username:process.env.EMPLOYEE_USERNAME,password:process.env.EMPLOYEE_PASSWORD});assert.equal(r.status,200);const token=r.body.token;console.log('PASS employee login');
  r=await call('/api/employee/appointments','GET',token);assert.equal(r.status,200);assert.ok(Array.isArray(r.body.appointments));console.log('PASS database appointment list ('+r.body.appointments.length+' bookings)');
  r=await call('/api/employee/appointments/not-real/status','PATCH',token,{status:'confirmed'});assert.equal(r.status,404);console.log('PASS missing appointment rejected');
  r=await call('/api/employee/logout','POST',token);assert.equal(r.status,200);r=await call('/api/employee/appointments','GET',token);assert.equal(r.status,401);console.log('PASS logout revokes access');
  console.log('6/6 employee integration checks passed; no appointments changed.');
})().catch(e=>{console.error('FAIL:',e.message);process.exitCode=1});
