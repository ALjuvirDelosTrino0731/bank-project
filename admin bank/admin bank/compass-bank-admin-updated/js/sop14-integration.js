/* Compass Bank SOP 1-4 inline integration: employee traffic analytics.
   Does not touch authentication, appointment status, or database data. */
(() => {
  'use strict';
  const traffic=document.getElementById('section-traffic');
  const dashboard=document.getElementById('section-dashboard');
  if(!traffic || !dashboard || document.getElementById('compass-sop14-employee'))return;

  const style=document.createElement('style');
  style.id='compass-sop14-employee-style';
  style.textContent=`
    .es14-panel{border:2px solid #d8e63c;border-radius:22px;background:#fff;padding:22px;margin:16px 0;color:#182238;box-shadow:0 5px 18px #1211260b;font-family:Inter,Arial,sans-serif}
    .es14-panel h3{font-family:Merriweather,Georgia,serif;font-size:20px;font-weight:800;margin:0 0 9px}
    .es14-panel h4{font-size:15px;font-weight:800;margin:10px 0}
    .es14-panel p{font-size:13px;color:#525b68;line-height:1.55;margin:6px 0 10px}
    .es14-pill{display:inline-block;color:#8a5b09;background:#fff3d9;border-radius:20px;padding:4px 10px;font-size:11px;font-weight:800;margin-bottom:9px}
    .es14-controls{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:10px 0}
    .es14-controls label{font-size:12px;font-weight:750;display:flex;flex-direction:column;gap:5px}
    .es14-controls input{min-width:90px;max-width:180px;border:1px solid #b5bcd0;border-radius:10px;padding:10px;font-size:14px;background:#fff}
    .es14-button{border:0;border-radius:11px;background:#7b4db1;color:#fff;padding:11px 16px;font-size:13px;font-weight:750;cursor:pointer}
    .es14-button:disabled{cursor:wait;opacity:.65}
    .es14-subgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:15px}
    .es14-box{background:#f7f7fb;padding:14px;border-radius:14px;border:1px solid #e0e2ef;overflow-wrap:anywhere}
    .es14-results{font-size:13px;min-height:30px}
    .es14-big{font-weight:850;font-size:19px;color:#41225c}
    .es14-rows{display:grid;gap:5px;margin:12px 0}
    .es14-row{display:grid;grid-template-columns:55px minmax(0,1fr) 44px;align-items:center;gap:7px;font-size:12px}
    .es14-track{background:#e7dfef;height:12px;overflow:hidden;border-radius:8px}
    .es14-fill{display:block;background:#7b4db1;height:100%}
    .es14-plots{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:13px;margin:13px 0}
    .es14-plots img{max-width:100%;width:100%;height:auto;border:1px solid #e0e3ea;border-radius:10px;background:white}
    .es14-link{color:#663a9f;font-weight:800;text-decoration:underline;font-size:13px}
    .es14-small{font-size:11px!important;color:#697080!important}
    .es14-button:focus-visible,.es14-panel input:focus-visible,.es14-link:focus-visible{outline:3px solid #e5b53e;outline-offset:2px}
  `;
  document.head.appendChild(style);

  function defaultBusinessDate(){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const n=part=>Number(parts.find(p=>p.type===part)?.value);
    const d=new Date(Date.UTC(n('year'),n('month')-1,n('day')+1));
    while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);
    return d.toISOString().slice(0,10);
  }
  const card=document.createElement('section');
  card.id='compass-sop14-employee';
  card.className='es14-panel';
  card.innerHTML=`
    <span class="es14-pill">SOP 2 + SOP 3 · EXPERIMENTAL / SIMULATED</span>
    <h3>Random Forest Traffic Predictions</h3>
    <p>Run both trained models here in your existing employee dashboard. Appointments and their transaction details remain managed through the Appointments tab. These research predictions do not represent verified live bank arrivals.</p>
    <div class="es14-box" style="margin:12px 0;background:#f8fbef;border-color:#d4e2a2">
      <h4>Chapter 4: Current integrated model - SIMULATED 2026 holdout</h4>
      <p><strong>Daily Random Forest Classification:</strong> 24.24% test accuracy (16 of 66 days). Majority-class baseline: 22.73%. Balanced accuracy: 30.38%.</p>
      <p><strong>Random Forest Regression:</strong> 5.65-count median absolute residual vs 6.00-count slot-median baseline; mean signed residual: +1.81 counts.</p>
      <p class="es14-small">Paper-reported historical evaluation, not a live score. The data are simulated, the eight slots are not verified clock hours, and these results are not approved bank traffic forecasts.</p>
    </div>
    <div class="es14-controls">
      <label>Research business date<input id="es14-date" type="date" min="2026-01-01" max="2027-12-31"></label>
      <button class="es14-button" id="es14-forecast" type="button">Predict daily class + 8 slots</button>
    </div>
    <div class="es14-subgrid">
      <div class="es14-box"><h4>SOP 2 · Daily classification</h4><div id="es14-class" class="es14-results" role="status" aria-live="polite">Choose a date and run the model.</div></div>
      <div class="es14-box"><h4>SOP 3 · Regression by numbered slot</h4><div id="es14-reg" class="es14-results" role="status" aria-live="polite">Eight predicted slot counts will appear here.</div></div>
    </div>
    <div class="es14-box" style="margin-top:15px">
      <h4>Optional early-day classification</h4>
      <p>Requires three already-observed slot counts. Enter actual counts or clearly labeled demonstration inputs. This cannot predict traffic before these observations exist.</p>
      <div class="es14-controls">
        <label>Slot 1 count<input id="es14-s1" type="number" min="0" max="10000" value="40"></label>
        <label>Slot 2 count<input id="es14-s2" type="number" min="0" max="10000" value="38"></label>
        <label>Slot 3 count<input id="es14-s3" type="number" min="0" max="10000" value="42"></label>
        <button id="es14-nowcast" class="es14-button" type="button">Run early-day model</button>
      </div>
      <div id="es14-nowcast-out" class="es14-results" aria-live="polite">Exploratory simulated holdout accuracy: 72.73%.</div>
    </div>
    <div class="es14-box" style="margin-top:15px">
      <h4>Holdout evaluation · graphical trend & residual distribution</h4>
      <p id="es14-metrics">Loading regression model evaluation…</p>
      <div class="es14-plots">
        <figure><img loading="lazy" src="/api/research-demo/plot/trend" alt="Simulated actual versus predicted slot counts"><figcaption class="es14-small">Actual vs predicted (simulated holdout)</figcaption></figure>
        <figure><img loading="lazy" src="/api/research-demo/plot/residuals" alt="Distribution of simulated actual minus predicted residuals"><figcaption class="es14-small">Residual distribution</figcaption></figure>
      </div>
      <a class="es14-link" href="/employee/regression-validation.html">Open detailed SOP 3 evaluation: dates, residual table, live model validation</a>
    </div>
    <p class="es14-small">Pre-visit classifier accuracy was 24.24% on simulated holdout; the 72.73% early-day result is exploratory. Eight slot clock times are unverified. Never infer actual 9 AM–5 PM hourly traffic or staffing requirements from these models.</p>`;
  const top=traffic.firstElementChild;
  if(top)top.insertAdjacentElement('afterend',card);
  else traffic.append(card);
  card.querySelector('#es14-date').value=defaultBusinessDate();

  const summary=document.createElement('div');
  summary.id='compass-sop14-dash-link';
  summary.className='es14-panel';
  summary.style.margin='12px 0';
  summary.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:13px;flex-wrap:wrap"><div><span class="es14-pill">SOP 2 + SOP 3</span><h3>Random Forest Research Models</h3><p>Traffic classes, 8-slot regression, and residual evaluation inside Traffic Prediction. Simulated data only.</p></div><button id="es14-open" type="button" class="es14-button">Open traffic predictions</button></div>`;
  if(dashboard.firstElementChild)dashboard.firstElementChild.insertAdjacentElement('afterend',summary);
  else dashboard.append(summary);
  summary.querySelector('#es14-open').addEventListener('click',()=>{
    if(typeof window.switchNavTab==='function')window.switchNavTab('traffic');
    else document.getElementById('nav-traffic')?.click();
  });

  const el=id=>card.querySelector('#'+id);
  const text=(id,value)=>{el(id).textContent=value;};
  const node=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
  const validDate=()=>{const v=el('es14-date').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('Choose a valid Monday–Friday date.');return v;};
  async function request(endpoint,params){
    const response=await fetch('/api/research-demo/'+endpoint+'?'+new URLSearchParams(params),{cache:'no-store'});
    let d;try{d=await response.json();}catch{throw Error('Server response was not JSON.');}
    if(!response.ok||d.status!=='ok')throw Error(d.message||'Research prediction failed');
    return d;
  }
  const probability=(data)=>{const p=Number(data.class_probabilities?.[data.traffic_category]);return Number.isFinite(p)?(100*p).toFixed(1)+'%':'Not reported';};
  const btnForecast=el('es14-forecast');
  btnForecast.addEventListener('click',async()=>{
    btnForecast.disabled=true;text('es14-class','Running trained Random Forest classifier…');text('es14-reg','Running trained Random Forest regressor…');
    try{
      const d=await request('forecast',{date:validDate()});
      text('es14-class','');const clas=el('es14-class');
      clas.append(node('div',d.traffic_category+' traffic','es14-big'),node('p','Model category probability: '+probability(d)));
      clas.append(node('p','Calendar-only simulated test accuracy: 24.24%. Not validated on live branch traffic.','es14-small'));
      const dest=el('es14-reg');dest.replaceChildren();
      if(!Array.isArray(d.estimated_slots)||d.estimated_slots.length!==8)throw Error('Model did not return eight slots');
      dest.append(node('div','Total of predicted slots: '+d.estimated_slot_count_total,'es14-big'));
      const list=node('div','','es14-rows');const max=Math.max(1,...d.estimated_slots.map(s=>Number(s.estimated_count)||0));
      d.estimated_slots.forEach(s=>{
        const val=Number(s.estimated_count)||0;
        const row=node('div','','es14-row');row.append(node('span','Slot '+s.slot));
        const bar=node('div','','es14-track');const fill=node('span','','es14-fill');fill.style.width=Math.max(0,Math.min(100,val/max*100))+'%';
        bar.append(fill);row.append(bar,node('span',val.toFixed(1)));list.append(row);
      });
      dest.append(list,node('p','Numbered slots have no verified clock hours.','es14-small'));
    }catch(e){text('es14-class','Unavailable: '+e.message);text('es14-reg','No validated estimate.');}
    finally{btnForecast.disabled=false;}
  });
  const btnNow=el('es14-nowcast');
  btnNow.addEventListener('click',async()=>{
    const params={date:el('es14-date').value,slot1:el('es14-s1').value,slot2:el('es14-s2').value,slot3:el('es14-s3').value};
    if(['slot1','slot2','slot3'].some(k=>!/^\d{1,5}$/.test(params[k])||Number(params[k])>10000)){
      text('es14-nowcast-out','Enter three nonnegative whole-number slot counts, up to 10000.');return;
    }
    btnNow.disabled=true;text('es14-nowcast-out','Running trained early-day classifier…');
    try{const d=await request('nowcast',{...params,date:validDate()});text('es14-nowcast-out','Early-day estimate: '+d.traffic_category+' | Model category probability: '+probability(d)+' | Simulation only; requires prior slot observations.');}
    catch(e){text('es14-nowcast-out','Unavailable: '+e.message);}
    finally{btnNow.disabled=false;}
  });
  (async()=>{
    try{
      const response=await fetch('/api/research-demo/evaluation',{cache:'no-store'});
      const d=await response.json();if(!response.ok||d.status!=='ok')throw Error(d.message||'No evaluation data');
      const m=d.metrics;
      text('es14-metrics','Regression median absolute residual: '+Number(m.regression_median_absolute_residual).toFixed(2)+' counts (baseline '+Number(m.regression_slot_median_baseline_median_absolute_residual).toFixed(2)+'); mean signed residual: '+Number(m.regression_mean_signed_residual).toFixed(2)+' counts. 528 simulated holdout observations.');
    }catch(e){text('es14-metrics','Model evaluation unavailable: '+e.message);}
  })();
})();
