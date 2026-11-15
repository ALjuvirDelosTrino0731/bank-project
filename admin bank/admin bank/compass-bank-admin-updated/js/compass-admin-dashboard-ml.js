/* Compass Bank / Admin Dashboard Research Overview (2026-11).
   Frontend-only. Uses existing research APIs; does not change booking or employee auth.
   Simulated experimental counts are NEVER represented as live Philippine branch traffic. */
(() => {
  'use strict';
  const dashboard = document.getElementById('section-dashboard');
  const shell = document.getElementById('dashboardView');
  if (!dashboard || !shell || document.getElementById('compass-admin-research-overview')) return;

  const oldChart = dashboard.querySelector('#trafficPredictionChart');
  const oldChartCard = oldChart && oldChart.closest('.bg-white.rounded-3xl');
  const oldBanner = Array.from(dashboard.children).find(el =>
    el.classList.contains('bg-brandLime') && /Traffic Forecast/i.test(el.textContent));

  const style = document.createElement('style');
  style.id = 'compass-admin-dashboard-research-style';
  style.textContent = `
    #compass-admin-research-overview{background:#fff;border:1px solid #d6df45;border-radius:24px;padding:24px;box-shadow:0 7px 22px #12152312;color:#171e2c;font-family:Inter,Arial,sans-serif}
    #compass-admin-research-overview *{box-sizing:border-box}
    .cad-kicker{font-size:11px;font-weight:850;color:#885507;background:#fff0cc;border-radius:99px;padding:5px 10px;display:inline-block;letter-spacing:.025em}
    .cad-title{font-family:Merriweather,Georgia,serif;font-size:24px;font-weight:850;margin:9px 0 4px;color:#152038}
    .cad-sub{font-size:13px;line-height:1.55;color:#536071;margin:0}
    .cad-top{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
    .cad-controls{display:flex;gap:9px;align-items:end;flex-wrap:wrap}
    .cad-label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:#314259}
    #cad-date{background:#fff;border:1px solid #b8c0cf;border-radius:12px;padding:10px 12px;max-width:180px;font-size:14px;color:#16233e}
    .cad-btn{background:#7b4db1;color:#fff;border:0;border-radius:12px;padding:11px 16px;font-size:13px;font-weight:750;cursor:pointer}
    .cad-btn:hover{background:#663f96}.cad-btn:disabled{opacity:.65;cursor:wait}
    .cad-board{display:grid;grid-template-columns:minmax(200px,.85fr) minmax(300px,1.45fr);gap:15px;margin-top:18px}
    .cad-box{border:1px solid #e3e6ef;border-radius:18px;background:#f8f9fc;padding:19px;min-width:0}
    .cad-box h4{font-size:14px;font-weight:800;margin:0 0 9px;color:#25304b}
    .cad-category{font-family:Merriweather,Georgia,serif;font-size:26px;font-weight:850;margin:8px 0 5px}
    .cad-category.low{color:#13834d}.cad-category.moderate{color:#977002}.cad-category.high{color:#ba3b3d}
    .cad-category.unknown{color:#543e78}
    .cad-caption{font-size:12px;color:#566176;line-height:1.5}
    .cad-rows{display:grid;gap:8px;margin-top:12px}
    .cad-row{display:grid;grid-template-columns:52px minmax(0,1fr) 46px;align-items:center;gap:9px;font-size:12px}
    .cad-track{height:13px;background:#e7dff0;border-radius:9px;overflow:hidden}
    .cad-fill{display:block;height:100%;background:#8050b0;border-radius:9px}
    .cad-number{font-size:19px;font-weight:850;color:#3e235f}
    .cad-foot{margin-top:15px;padding-top:13px;border-top:1px solid #e5e8ee;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:12px;color:#586276}
    .cad-link{color:#654199;text-decoration:underline;font-weight:750}
    .cad-notice{border-left:3px solid #c08b23;padding:8px 12px;background:#fffbeb;border-radius:0 10px 10px 0;margin-top:15px;font-size:12px;color:#5a481a;line-height:1.55}
    .cad-metrics{margin-top:8px;font-size:12px;color:#536071}
    .cad-date-message{color:#566176;font-size:12px;margin-top:5px;min-height:16px}
    @media(max-width:850px){.cad-board{grid-template-columns:1fr}}
    @media(max-width:580px){#compass-admin-research-overview{padding:16px}.cad-title{font-size:21px}}
    #compass-admin-research-overview button:focus-visible,#compass-admin-research-overview input:focus-visible,#compass-admin-research-overview a:focus-visible{outline:3px solid #d4a52b;outline-offset:2px}
  `;
  document.head.appendChild(style);

  const card = document.createElement('section');
  card.id = 'compass-admin-research-overview';
  card.setAttribute('aria-label', 'Experimental machine learning dashboard overview');
  card.innerHTML = `
    <div class="cad-top">
      <div style="flex:1;min-width:220px">
        <span class="cad-kicker">SOP 2 + SOP 3 • EXPERIMENTAL / SIMULATED</span>
        <h3 class="cad-title">Bank traffic research overview</h3>
        <p class="cad-sub">A working preview of daily Random Forest classification and eight-slot regression. Live appointments remain separate from this simulation.</p>
      </div>
      <div class="cad-controls">
        <label class="cad-label" for="cad-date">Research date
          <input id="cad-date" type="date" min="2026-01-01" max="2027-12-31">
        </label>
        <button class="cad-btn" id="cad-update" type="button">Update prediction</button>
      </div>
    </div>
    <div class="cad-board">
      <div class="cad-box">
        <h4>SOP 2 — Daily classification</h4>
        <div id="cad-category" class="cad-category unknown" role="status" aria-live="polite">Not loaded</div>
        <p id="cad-probability" class="cad-caption">Low, Moderate or High — predicted from simulated data</p>
        <p id="cad-date-message" class="cad-date-message"></p>
        <p class="cad-caption" style="margin-top:16px">For comparison, the pre-visit classifier scored <strong>24.24% accuracy on simulated holdout</strong>. The category probability is not a guarantee.</p>
      </div>
      <div class="cad-box">
        <h4>SOP 3 — Estimated traffic counts by numbered slot</h4>
        <div class="cad-number" id="cad-sum">—</div>
        <div class="cad-caption">Combined estimate across eight numbered slots</div>
        <div id="cad-bars" class="cad-rows" role="img" aria-label="Eight-slot research regression prediction chart"></div>
        <p class="cad-caption" id="cad-regression-message" style="margin-top:10px">Choose a date to load eight trained-model estimates.</p>
      </div>
    </div>
    <div class="cad-metrics" id="cad-metrics" role="status" aria-live="polite">Loading simulated holdout evaluation…</div>
    <div class="cad-notice">Research demonstration only. Training and test data are simulated teller-queue counts, not observed Philippine customer arrivals. The eight source slots do not have verified clock times. Do not use these predictions to set staffing, waiting times, or booking capacity.</div>
    <div class="cad-foot">
      <span><strong>Operational counts above:</strong> loaded from the appointment database.</span>
      <span style="display:flex;flex-wrap:wrap;gap:14px">
        <a id="cad-full-predictions" class="cad-link" href="#">Open full Traffic Prediction</a>
        <a class="cad-link" href="/employee/regression-validation.html">View regression graphs &amp; residuals</a>
      </span>
    </div>`;

  if (oldBanner && oldBanner.parentElement === dashboard) dashboard.insertBefore(card, oldBanner);
  else if (oldChartCard && oldChartCard.parentElement === dashboard) dashboard.insertBefore(card, oldChartCard);
  else {
    const grid = Array.from(dashboard.children).find(el => el.classList.contains('grid'));
    if (grid) grid.insertAdjacentElement('afterend', card); else dashboard.appendChild(card);
  }
  if (oldBanner && oldBanner.parentElement === dashboard) oldBanner.remove();
  if (oldChartCard && oldChartCard.parentElement === dashboard) oldChartCard.remove();
  // Remove only the previous redundant research navigation card; full ML panel remains in Traffic Prediction.
  document.getElementById('compass-sop14-dash-link')?.remove();

  const get = id => card.querySelector('#' + id);
  const todayInManila = () => {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const n = name => Number(parts.find(p=>p.type===name)?.value);
    return new Date(Date.UTC(n('year'),n('month')-1,n('day')));
  };
  const iso = day => day.toISOString().slice(0,10);
  const validWeekday = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && (()=>{
    const x = new Date(date+'T00:00:00Z');
    return !Number.isNaN(x.getTime()) && iso(x)===date && x.getUTCDay()>=1 && x.getUTCDay()<=5;
  })();
  const make = (tag,text,cls) => {const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
  let sequence = 0;
  let firstLoadDone = false;

  async function forecast() {
    const current = ++sequence;
    const date = get('cad-date').value;
    const button = get('cad-update');
    const cat = get('cad-category');
    const p = get('cad-probability');
    const bars = get('cad-bars');
    const sum = get('cad-sum');
    const hourInfo = get('cad-regression-message');
    if (!validWeekday(date)) {
      cat.className='cad-category unknown';cat.textContent='Select a weekday';
      p.textContent='Choose Monday through Friday.';
      bars.replaceChildren();sum.textContent='—';hourInfo.textContent='No prediction requested.';
      return;
    }
    button.disabled=true;cat.className='cad-category unknown';cat.textContent='Loading prediction…';
    p.textContent='';bars.replaceChildren();sum.textContent='—';hourInfo.textContent='Running trained models…';
    try {
      const response = await fetch('/api/research-demo/forecast?'+new URLSearchParams({date}),{cache:'no-store'});
      const data = await response.json();
      if (!response.ok || data.status!=='ok') throw new Error(data.message||'Research service unavailable');
      if (!Array.isArray(data.estimated_slots) || data.estimated_slots.length!==8) throw new Error('Expected eight numbered slots');
      if (current!==sequence) return;
      const category = ['Low','Moderate','High'].includes(data.traffic_category) ? data.traffic_category : 'Unknown';
      cat.className='cad-category '+category.toLowerCase();cat.textContent=category+' traffic';
      const prob=Number(data.class_probabilities?.[category]);
      p.textContent=Number.isFinite(prob)?'Model-estimated category probability: '+(prob*100).toFixed(1)+'%':'Classification probability unavailable';
      const rows = data.estimated_slots.map(s=>({slot:Number(s.slot),value:Number(s.estimated_count)}));
      if(rows.some(s=>!Number.isInteger(s.slot)||s.slot<1||s.slot>8||!Number.isFinite(s.value)||s.value<0))throw Error('Invalid numerical model output');
      const max=Math.max(1,...rows.map(s=>s.value));
      const count=Number(data.estimated_slot_count_total);
      sum.textContent=(Number.isFinite(count)?count:rows.reduce((n,s)=>n+s.value,0)).toFixed(1);
      for(const item of rows){
        const row=make('div','','cad-row');
        const track=make('div','','cad-track');
        const fill=make('span','','cad-fill');fill.style.width=Math.min(100,item.value/max*100).toFixed(1)+'%';track.append(fill);
        row.append(make('span','Slot '+item.slot),track,make('span',item.value.toFixed(1)));
        bars.append(row);
      }
      hourInfo.textContent='Purple bars compare estimated counts between slots. Their lengths are NOT probabilities or verified operating hours.';
      get('cad-date-message').textContent='Simulation date: '+date+' · Not validated against Philippine branch records.';
      // Availability information is independent from the model and only meaningful for the live booking horizon.
      const now=todayInManila();const day=new Date(date+'T00:00:00Z');
      if(day>=now && day<new Date(now.getTime()+14*86400000)){
        try {
          const availability=await fetch('/api/booking-availability?'+new URLSearchParams({date}),{cache:'no-store'});
          if(availability.ok){const a=await availability.json();if(current!==sequence)return;
            if(Array.isArray(a.available_slots)&&a.available_slots.length===0){
              get('cad-date-message').textContent='Branch has no available booking slots for '+date+'. The research result above does not mean the branch is open.';
            }
          }
        } catch (_) {/* Independent booking status should never block the ML research display. */}
      }
    } catch (error) {
      if(current!==sequence)return;
      cat.className='cad-category unknown';cat.textContent='Prediction unavailable';
      p.textContent=String(error.message||'Please retry.');
      bars.replaceChildren();sum.textContent='—';
      hourInfo.textContent='The appointment dashboard remains operational even if research models are unavailable.';
    } finally {if(current===sequence)button.disabled=false;}
  }

  async function loadEvaluation() {
    try {
      const response=await fetch('/api/research-demo/evaluation',{cache:'no-store'});
      const d=await response.json();
      if(!response.ok||d.status!=='ok')throw Error('Evaluation API unavailable');
      const m=d.metrics||{};
      const val=Number(m.regression_median_absolute_residual);
      const baseline=Number(m.regression_slot_median_baseline_median_absolute_residual);
      if(!Number.isFinite(val)||!Number.isFinite(baseline))throw Error('Missing model evaluation metrics');
      get('cad-metrics').textContent='Simulated holdout evaluation: regression median absolute residual '+val.toFixed(2)+' counts, versus '+baseline.toFixed(2)+' baseline counts (528 test slots). See actual-versus-predicted and residual charts for detail.';
    }catch(_){get('cad-metrics').textContent='Regression holdout evaluation is currently unavailable.';}
  }

  async function initialize() {
    if (firstLoadDone) return;
    firstLoadDone=true;
    const now=todayInManila();
    // Prefer the earliest available visit date within the 14-day booking horizon.
    let chosen = '';
    for(let i=0;i<14;i++){
      const day=new Date(now.getTime()+i*86400000);
      if([0,6].includes(day.getUTCDay()))continue;
      const date=iso(day);
      try {
        const response=await fetch('/api/booking-availability?'+new URLSearchParams({date}),{cache:'no-store'});
        if(response.ok){const d=await response.json();if(Array.isArray(d.available_slots)&&d.available_slots.length){chosen=date;break;}}
      } catch (_) {break;}
    }
    if(!chosen){const d=new Date(now.getTime()+86400000);while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);chosen=iso(d);}
    get('cad-date').value=chosen;
    forecast();loadEvaluation();
  }
  get('cad-update').addEventListener('click',forecast);
  get('cad-date').addEventListener('change',forecast);
  get('cad-full-predictions').addEventListener('click',event=>{
    event.preventDefault();
    if(typeof window.switchNavTab==='function')window.switchNavTab('traffic');
    else document.getElementById('nav-traffic')?.click();
  });

  if(!shell.classList.contains('hidden'))initialize();
  new MutationObserver(()=>{if(!shell.classList.contains('hidden'))initialize();}).observe(shell,{attributes:true,attributeFilter:['class']});
})();
