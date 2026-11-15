'use strict';
// Isolated research-demo endpoints. Never substitutes for approved bank forecasts.
const express = require('express');
const {spawn} = require('child_process');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const root = path.join(__dirname, '..');
const dir = path.join(root, 'ml-models', 'sop-demo', 'results');
const surveyPath = path.join(__dirname, 'data', 'research_sop_survey.ndjson');

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0,10) === value &&
     d.getUTCDay() > 0 && d.getUTCDay() < 6 && d.getUTCFullYear() >= 2026 && d.getUTCFullYear() <= 2027;
}
const modelWorker = require('./sopDemoWorkerClient');
function runPrediction(req,res,mode) {
  const d=req.query.date;
  if(!validDay(d)) return res.status(400).json({status:'error',message:'Choose a valid Monday-Friday date (2026-2027).'});
  const counts=[];
  if(mode==='nowcast') {
    for(const key of ['slot1','slot2','slot3']) {
      const raw=req.query[key];
      if(typeof raw!=='string' || !/^\d{1,5}$/.test(raw) || Number(raw)>10000)
        return res.status(400).json({status:'error',message:'Observed counts must be whole numbers from 0 to 10000.'});
      counts.push(Number(raw));
    }
  }
  modelWorker.predict(mode,d,counts).then(obj=>{
    const {request_id, ...response}=obj;
    res.set('Cache-Control','no-store').json(response);
  }).catch(err=>{
    console.error('Research prediction:',err.message);
    if(!res.headersSent)res.status(503).json({status:'error',message:'Research predictor unavailable: '+err.message});
  });
}
router.get('/forecast',(req,res)=>runPrediction(req,res,'forecast'));
router.get('/nowcast',(req,res)=>runPrediction(req,res,'nowcast'));
router.get('/evaluation',(req,res)=>{
  try {
    const metrics=JSON.parse(fs.readFileSync(path.join(dir,'metrics.json'),'utf8'));
    res.set('Cache-Control','no-store').json({status:'ok',metrics,plots:{trend:'/api/research-demo/plot/trend',residuals:'/api/research-demo/plot/residuals',confusion:'/api/research-demo/plot/confusion'}});
  }catch(e){res.status(503).json({status:'error',message:'Run ML training to generate evaluation results'});}
});
const plotMap={trend:'actual_vs_predicted.png',residuals:'residual_distribution.png',confusion:'confusion_matrix.png'};
router.get('/plot/:name',(req,res)=>{
  const name=plotMap[req.params.name];
  if(!name)return res.status(404).end();
  res.set('Cache-Control','no-store');
  res.sendFile(path.join(dir,name),err=>{if(err&&!res.headersSent)res.status(404).end();});
});
const fields=['functionality','usability','reliability','suitability'];
const roles=new Set(['customer','employee']);
router.post('/survey',async(req,res)=>{
  const b=req.body || {};
  if(!roles.has(b.role) || fields.some(key=>!Number.isInteger(b[key])||b[key]<1||b[key]>5)){
     return res.status(400).json({status:'error',message:'Choose role and four ratings from 1 to 5.'});
  }
  // Anonymous feedback only: do not collect names, account numbers, IPs, or credentials.
  const row={timestamp:new Date().toISOString(),role:b.role};
  for(const k of fields)row[k]=b[k];
  try {
    await fs.promises.mkdir(path.dirname(surveyPath),{recursive:true});
    await fs.promises.appendFile(surveyPath,JSON.stringify(row)+'\n',{encoding:'utf8'});
    res.status(201).json({status:'ok',message:'Anonymous research evaluation recorded.'});
  }catch(e){console.error('Research feedback failure:',e.code||e.message);res.status(503).json({status:'error',message:'Evaluation storage unavailable'});}
});
router.get('/survey-summary',async(req,res)=>{
  try {
    let body='';
    try{body=await fs.promises.readFile(surveyPath,'utf8');}
    catch(e){if(e.code!=='ENOENT')throw e;}
    const rows=body.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    const summary={total:rows.length,by_role:{customer:0,employee:0},mean_scores:{}};
    for(const r of rows)if(roles.has(r.role))summary.by_role[r.role]++;
    for(const k of fields) summary.mean_scores[k]=rows.length ? Number((rows.reduce((sum,r)=>sum+r[k],0)/rows.length).toFixed(2)):null;
    res.set('Cache-Control','no-store').json({status:'ok',summary,notice:'Only actual submitted survey responses are counted; no simulated scores.'});
  }catch(e){res.status(503).json({status:'error',message:'Survey summary unavailable'});}
});
module.exports=router;
