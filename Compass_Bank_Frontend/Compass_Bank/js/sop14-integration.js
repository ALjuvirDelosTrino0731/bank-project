/* Compass Bank SOP 1-4 inline integration: customer-facing research traffic.
   Isolated from booking handlers and appointment validation. */
(() => {
  'use strict';
  const home = document.getElementById('mainPage');
  const form = document.getElementById('appointmentFormPage');
  if (!home || !form || document.getElementById('compass-sop14-customer')) return;

  const style = document.createElement('style');
  style.id = 'compass-sop14-customer-style';
  style.textContent = `
    .cs14-panel{background:#fff;border:2px solid #d9e33d;border-radius:22px;padding:20px;margin-top:22px;box-shadow:0 5px 18px #12112612;color:#1f2332;font-family:Inter,Arial,sans-serif}
    .cs14-panel h3{margin:0 0 7px;font-family:Merriweather,Georgia,serif;font-size:20px;font-weight:800}
    .cs14-panel p{font-size:13px;line-height:1.55;margin:5px 0 12px;color:#4b5262}
    .cs14-pill{display:inline-block;background:#fff2d5;color:#87530b;border-radius:18px;padding:3px 9px;font-size:11px;font-weight:800;margin-bottom:9px}
    .cs14-controls{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:10px 0}
    .cs14-controls label{font-size:12px;font-weight:700;display:flex;flex-direction:column;gap:5px}
    .cs14-controls input{border:1px solid #a8aec2;border-radius:10px;padding:10px;color:#12121a;background:#fff;font-size:14px;max-width:180px}
    .cs14-button{background:#7b4db1;color:#fff;border:0;border-radius:12px;padding:11px 16px;cursor:pointer;font-weight:750;font-size:13px}
    .cs14-button:disabled{opacity:.65;cursor:wait}
    .cs14-out{margin-top:12px;padding:13px;border-radius:12px;background:#f5f3fa;font-size:13px;overflow-wrap:anywhere}
    .cs14-out:empty{display:none}
    .cs14-out .cs14-prediction{font-size:19px;font-weight:850;color:#402064;margin-bottom:4px}
    .cs14-bars{display:grid;gap:5px;margin-top:12px}
    .cs14-bar{display:grid;grid-template-columns:54px minmax(0,1fr) 42px;align-items:center;gap:8px;font-size:12px}
    .cs14-track{background:#e5ddef;height:12px;border-radius:7px;overflow:hidden}
    .cs14-fill{display:block;background:#7b4db1;height:100%;min-width:1px}
    .cs14-small{font-size:11px!important;color:#626775!important;line-height:1.5!important}
    .cs14-panel button:focus-visible,.cs14-panel input:focus-visible{outline:3px solid #e1b538;outline-offset:2px}
  `;
  document.head.appendChild(style);

  function nextBusinessDate() {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'})
      .formatToParts(new Date());
    const pick = type => Number(parts.find(p => p.type === type)?.value);
    const d = new Date(Date.UTC(pick('year'),pick('month')-1,pick('day')+1));
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate()+1);
    return d.toISOString().slice(0,10);
  }
  const defaultDay = nextBusinessDate();
  const panel = document.createElement('section');
  panel.id = 'compass-sop14-customer';
  panel.className = 'cs14-panel';
  panel.setAttribute('aria-label','Simulated research bank traffic estimate');
  panel.innerHTML = `
    <span class="cs14-pill">RESEARCH DEMONSTRATION — SIMULATED DATA</span>
    <h3>Bank Traffic Predictions</h3>
    <p>Preview an experimental daily traffic category and eight estimated traffic-slot counts using trained Random Forest models. This is <b>not</b> verified live branch traffic or a recommendation about actual waiting times.</p>
    <div class="cs14-controls">
      <label>Choose a weekday<input id="cs14-customer-date" type="date" min="2026-01-01" max="2027-12-31"></label>
      <button id="cs14-customer-run" type="button" class="cs14-button">Show research prediction</button>
    </div>
    <div id="cs14-customer-output" class="cs14-out" role="status" aria-live="polite">Choose a business date to explore the trained model.</div>
    <p class="cs14-small">Daily classification accuracy on simulated holdout: 24.24%. Source clock times for the eight slots are unverified. Bookable days and hours are determined separately by the appointment calendar.</p>`;
  const landingColumn = home.children[1];
  if (!landingColumn) return;
  landingColumn.appendChild(panel);
  panel.querySelector('#cs14-customer-date').value = defaultDay;

  const formPanel = document.createElement('div');
  formPanel.id = 'compass-sop14-form';
  formPanel.className = 'cs14-panel';
  formPanel.innerHTML = `
    <span class="cs14-pill">OPTIONAL RESEARCH PREVIEW</span>
    <h3>Traffic prediction for your selected date</h3>
    <p>After choosing an available date on the appointment calendar, explore a simulated traffic estimate. This does not change your reservation or guarantee a shorter wait.</p>
    <button id="cs14-form-run" type="button" class="cs14-button">Show estimate for selected date</button>
    <div id="cs14-form-output" class="cs14-out" role="status" aria-live="polite">Select an appointment date above first.</div>`;
  const calendar = form.querySelector('.traffic-panel');
  if (calendar) calendar.insertAdjacentElement('afterend', formPanel);
  else form.querySelector('form')?.prepend(formPanel);

  const request = async date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('Choose a valid business date.');
    const response = await fetch('/api/research-demo/forecast?' + new URLSearchParams({date}), {cache:'no-store'});
    let body;
    try {body = await response.json();} catch {throw Error('Prediction server returned invalid data.');}
    if (!response.ok || body.status !== 'ok') throw Error(body.message || 'Model unavailable');
    if (!Array.isArray(body.estimated_slots) || body.estimated_slots.length !== 8) throw Error('Eight-slot prediction data missing.');
    return body;
  };
  const line = (tag,text,cls) => {
    const el=document.createElement(tag); el.textContent=text; if(cls)el.className=cls; return el;
  };
  function render(out,data){
    out.replaceChildren();
    const category = data.traffic_category;
    const p = Number(data.class_probabilities?.[category]);
    out.appendChild(line('div','Predicted category: '+category,'cs14-prediction'));
    out.appendChild(line('div','Model class probability: '+(Number.isFinite(p)?(p*100).toFixed(1)+'%':'Not reported')));
    out.appendChild(line('div','Estimated sum across 8 numbered slots: '+data.estimated_slot_count_total));
    const bars=line('div','','cs14-bars');
    const max=Math.max(1,...data.estimated_slots.map(x=>Number(x.estimated_count)||0));
    for(const record of data.estimated_slots){
      const n=Number(record.estimated_count)||0;
      const item=line('div','','cs14-bar');
      item.appendChild(line('span','Slot '+record.slot));
      const track=line('div','','cs14-track');
      const fill=line('span','','cs14-fill');
      fill.style.width=Math.max(0,Math.min(100,n/max*100))+'%';
      track.appendChild(fill);item.appendChild(track);
      item.appendChild(line('span',n.toFixed(1)));
      bars.appendChild(item);
    }
    out.appendChild(bars);
    out.appendChild(line('p','Experimental simulated-data results only. Slots are not verified 9 AM–5 PM hours. Booking capacity is separate.','cs14-small'));
  }
  async function run(button,out,date){
    button.disabled=true;out.textContent='Running trained Random Forest models…';
    try{ render(out,await request(date)); }
    catch(e){out.textContent='Research prediction unavailable: '+e.message;}
    finally{button.disabled=false;}
  }
  const btn=panel.querySelector('#cs14-customer-run');
  btn.addEventListener('click',()=>run(btn,panel.querySelector('#cs14-customer-output'),panel.querySelector('#cs14-customer-date').value));
  const formBtn=formPanel.querySelector('#cs14-form-run');
  formBtn.addEventListener('click',()=>run(formBtn,formPanel.querySelector('#cs14-form-output'),String(document.getElementById('appointmentDate')?.value||'')));
})();
