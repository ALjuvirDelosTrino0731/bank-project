'use strict';
const express=require('express');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawnSync}=require('child_process');
const router=express.Router();
const runs=new Map();
router.post('/process',express.raw({type:['text/csv','application/octet-stream','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],limit:'8mb'}),(req,res)=>{
  const filename=String(req.get('X-Dataset-Filename')||'').replace(/[^a-zA-Z0-9_.-]/g,'_');
  const ext=path.extname(filename).toLowerCase();
  if(!['.csv','.xlsx'].includes(ext))return res.status(400).json({error:'Only CSV and XLSX files supported'});
  if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'Empty or unsupported upload'});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'compass-dataset-'));
  const input=path.join(dir,'upload'+ext);fs.writeFileSync(input,req.body,{flag:'wx'});
  const result=spawnSync(process.env.COMPASS_PYTHON||'python',[path.join(__dirname,'dataset_processor.py'),input,dir],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  let payload;
  try{payload=JSON.parse(result.stdout.trim());}catch(_){payload={ok:false,error:'Dataset processing failed. Confirm Python and openpyxl are installed.'};}
  if(!payload.ok){fs.rmSync(dir,{recursive:true,force:true});return res.status(422).json(payload);}
  const id=crypto.randomBytes(16).toString('hex');runs.set(id,{dir,created:Date.now(),token:req.employeeToken});
  // Bound temporary disk usage: expire prior runs on every new upload.
  for(const [key,value] of runs)if(Date.now()-value.created>60*60*1000){fs.rmSync(value.dir,{recursive:true,force:true});runs.delete(key);}
  res.json({ok:true,id,report:payload.report});
});
router.get('/download/:id/:kind',(req,res)=>{
  const entry=runs.get(req.params.id);
  if(!entry||entry.token!==req.employeeToken)return res.status(404).json({error:'Result not found or session expired'});
  const allowed={cleaned:'cleaned.csv',flagged:'flagged.csv',report:'report.json'};
  const file=allowed[req.params.kind];if(!file)return res.sendStatus(404);
  res.download(path.join(entry.dir,file));
});
module.exports=router;
