/* Compass Bank Admin Calendar v5.
   Read-only add-on for the approved-only v4 calendar. Same /api/research-demo/forecast
   model as the customer calendar; availability still comes from the operational API.
   No booking/employee/database writes. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const make = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = String(text);
    if (cls) e.className = cls;
    return e;
  };
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const fromIso = v => { const [y,m,d] = v.split('-').map(Number); return new Date(y,m-1,d); };
  const add = (d,n) => new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
  const weekday = d => d.getDay() >= 1 && d.getDay() <= 5;
  const approved = a => ['Approved','confirmed'].includes(a?.status);
  const records = () => typeof appointments !== 'undefined' && Array.isArray(appointments) ? appointments.filter(approved) : [];
  const todayManila = () => {
    const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const v = Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return `${v.year}-${v.month}-${v.day}`;
  };
  const validIso = x => /^\d{4}-\d{2}-\d{2}$/.test(x) && iso(fromIso(x))===x;
  const requestCache = new Map();
  const availableCache = new Map();
  let risk = null;
  let run = 0;
  let forecastsEnabled = true;
  let search = '';
  let started = false;

  function getDays() {
    if (typeof calendarCurrentDate === 'undefined' || typeof calendarViewMode === 'undefined') return [];
    const ref = calendarCurrentDate;
    if (calendarViewMode==='month') return Array.from({length:new Date(ref.getFullYear(),ref.getMonth()+1,0).getDate()},(_,i)=>new Date(ref.getFullYear(),ref.getMonth(),i+1));
    if (calendarViewMode==='week') {
      const start=add(ref,-((ref.getDay()+6)%7));
      return Array.from({length:7},(_,i)=>add(start,i));
    }
    return [new Date(ref)];
  }
  const eligible = key => {
    if(!validIso(key))return false;
    const days=Math.round((Date.UTC(...[Number(key.slice(0,4)),Number(key.slice(5,7))-1,Number(key.slice(8,10))])-
      Date.UTC(...[Number(todayManila().slice(0,4)),Number(todayManila().slice(5,7))-1,Number(todayManila().slice(8,10))])) / 86400000);
    return days>=0 && days<14 && weekday(fromIso(key));
  };
  const memo = async (map,key,maxAge,fn) => {
    const old=map.get(key);
    if(old && Date.now()-old.at < maxAge) return old.promise;
    const promise=fn().catch(e=>{if(map.get(key)?.promise===promise)map.delete(key);throw e;});
    map.set(key,{at:Date.now(),promise});
    return promise;
  };
  async function json(route) {
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),8500);
    try{
      const r=await fetch(route,{cache:'no-store',signal:c.signal});
      const v=await r.json().catch(()=>null);
      if(!r.ok||!v||v.status!=='ok')throw Error(v?.message||'Server did not return a valid response');
      return v;
    } finally {clearTimeout(timer);}
  }
  const forecast = date => memo(requestCache,date,90000,async()=>{
    const data=await json('/api/research-demo/forecast?date='+encodeURIComponent(date));
    if(!['Low','Moderate','High'].includes(data.traffic_category)||!Array.isArray(data.estimated_slots)||data.estimated_slots.length!==8) throw Error('Model results are incomplete');
    return data;
  });
  const availability = date => memo(availableCache,date,15000,async()=>{
    const d=await json('/api/booking-availability?date='+encodeURIComponent(date));
    if(!Array.isArray(d.available_slots))throw Error('No availability data');
    return d;
  });
  function setStatus(message) {const e=$('cav5-status');if(e)e.textContent=message;}
  function categoryLabel(cat){return cat==='Low'?'Low':cat==='Moderate'?'Moderate':'High';}
  function renderLegend() {
    const section=$('section-calendar');if(!section)return;
    const existing=section.querySelector('.hidden.md\\:flex');
    if(existing){
      existing.replaceChildren();
      existing.className='cav5-old-legend';
      existing.append(make('span','● Approved appointments','cav5-legend-approved'));
      existing.setAttribute('aria-label','Calendar includes approved appointments only');
    }
  }
  function buildInterface() {
    const section=$('section-calendar'),grid=$('calendarGrid');
    if(!section||!grid||$('cav5-controls'))return;
    const head=section.querySelector('h2');
    if(head?.textContent?.includes('Interactive Calendar')){
      const sub=head.parentElement?.querySelector('p');
      if(sub)sub.textContent='Approved appointments and the same simulated traffic research preview used by the customer calendar.';
    }
    const guide=section.querySelector('.ca4-guide p');
    if(guide)guide.textContent='Use Month/Week/Day, choose a date, search confirmed bookings, and compare the same simulated traffic category used by the customer calendar. Green=Low, yellow=Moderate, red=High; closed, full and out-of-window days stay neutral. Only approved appointments are listed. Research predictions never control scheduling.';
    renderLegend();

    const bar=make('section',undefined,'cav5-tools');bar.id='cav5-controls';
    const label=make('label','Jump to date','cav5-field');
    const pick=make('input');pick.type='date';pick.id='cav5-date';pick.min='2026-01-01';pick.max='2027-12-31';pick.setAttribute('aria-label','Calendar date to inspect');label.append(pick);
    const jump=make('button','Open date','cav5-action');jump.type='button';jump.id='cav5-jump';
    const next=make('button','Next approved day','cav5-action cav5-secondary');next.type='button';next.id='cav5-next';
    const refresh=make('button','Refresh records + preview','cav5-action cav5-secondary');refresh.type='button';refresh.id='cav5-refresh';
    const searchLabel=make('label','Find an approved appointment','cav5-field');
    const query=make('input');query.type='search';query.id='cav5-search';query.placeholder='Name, service, time, reference';searchLabel.append(query);
    const toggle=make('label',undefined,'cav5-toggle');
    const check=make('input');check.type='checkbox';check.checked=true;check.id='cav5-show-traffic';
    toggle.append(check,make('span','Show simulated traffic colors'));
    const status=make('p','Traffic categories load for dates open to customers. Predictions are simulated, not actual arrivals.','cav5-status');status.id='cav5-status';status.setAttribute('role','status');
    const color=make('div',undefined,'cav5-legend');
    for(const [cat,txt] of [['approved','Approved bookings'],['low','Low (simulated)'],['moderate','Moderate (simulated)'],['high','High (simulated)'],['closed','Unavailable to book']]){
      const item=make('span',txt);const dot=make('i',undefined,'cav5-dot cav5-'+cat);dot.setAttribute('aria-hidden','true');item.prepend(dot);color.append(item);
    }
    bar.append(label,jump,next,refresh,searchLabel,toggle,color,status);
    const container=grid.parentElement;
    container.parentNode.insertBefore(bar,container);
    const panel=make('section',undefined,'cav5-detail');panel.id='cav5-detail';panel.setAttribute('aria-live','polite');
    container.insertAdjacentElement('afterend',panel);

    const jumpTo=key=>{
      if(!validIso(key)){setStatus('Enter a valid calendar date.');return;}
      calendarCurrentDate=fromIso(key);
      if(typeof window.setCalendarView==='function')window.setCalendarView('day');
      else window.renderCalendar?.();
    };
    jump.addEventListener('click',()=>jumpTo(pick.value));
    pick.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();jumpTo(pick.value);}});
    next.addEventListener('click',()=>{
      const current=todayManila();
      const upcoming=[...new Set(records().map(a=>String(a.date)))].filter(d=>validIso(d)&&d>=current).sort();
      if(upcoming.length)jumpTo(upcoming[0]);
      else setStatus('No upcoming approved appointment found in the loaded records.');
    });
    refresh.addEventListener('click',async()=>{
      refresh.disabled=true;refresh.textContent='Refreshing…';requestCache.clear();availableCache.clear();
      try{
        if(typeof window.refreshEmployeeAppointments==='function')await window.refreshEmployeeAppointments();
        else window.renderCalendar?.();
        setStatus('Appointment records and simulated forecast previews refreshed.');
      }catch(e){setStatus('Could not refresh appointment records. '+e.message);}
      finally{refresh.disabled=false;refresh.textContent='Refresh records + preview';}
    });
    query.addEventListener('input',()=>{search=query.value.trim().toLowerCase();applySearch();});
    check.addEventListener('change',()=>{forecastsEnabled=check.checked;window.renderCalendar?.();});
  }
  function approvedMatching(date) {
    const a=records().filter(x=>x.date===date);
    if(!search)return {all:a,matching:a};
    const matching=a.filter(x=>[x.name,x.email,x.time,x.type,x.id,...(Array.isArray(x.transactions)?x.transactions:[])].some(v=>String(v??'').toLowerCase().includes(search)));
    return {all:a,matching};
  }
  function applySearch() {
    const dates=getDays();const cells=[...document.querySelectorAll('#calendarGrid .ca4-date')];
    for(let i=0;i<cells.length&&i<dates.length;i++){
      const key=iso(dates[i]),set=approvedMatching(key);const cell=cells[i];
      cell.classList.toggle('cav5-no-search-match',!!search&&set.matching.length===0);
      const matched=cell.querySelector('.cav5-match-note')||make('small',undefined,'cav5-match-note');
      matched.textContent=search?`${set.matching.length} of ${set.all.length} approved match${set.matching.length===1?'':'es'}`:'';
      if(!matched.isConnected)cell.append(matched);
      for(const e of cell.querySelectorAll('.ca4-event')){
        const text=e.textContent.toLowerCase();e.hidden=!!search&&!text.includes(search);
        // A service query may match a hidden transaction not printed in the row.
        if(e.hidden&&set.matching.some(a=>text.includes(String(a.time).toLowerCase())&&text.includes(String(a.name||'').toLowerCase())))e.hidden=false;
      }
    }
    const visible=dates.reduce((n,d)=>n+approvedMatching(iso(d)).matching.length,0);
    const all=dates.reduce((n,d)=>n+approvedMatching(iso(d)).all.length,0);
    const el=$('cav5-search-summary');
    if(el)el.textContent=search?`Search: ${visible} of ${all} approved appointments match in this ${calendarViewMode} view. Calendar totals above remain unfiltered.`:'';
  }
  function slotLikelihood(date,slot) {
    if(!risk||!validIso(date))return null;
    const d=fromIso(date);const key=`${d.getMonth()+1}-${d.getDay()}-${slot}`;
    const x=risk.percentages?.[key];
    return typeof x==='number'&&Number.isFinite(x)?x:null;
  }
  function addHourEvidence(date) {
    const hours=[...document.querySelectorAll('#calendarGrid .ca4-hour')];
    for(let i=0;i<hours.length;i++){
      const box=hours[i],previous=box.querySelector('.cav5-hour-note');previous?.remove();
      if(!forecastsEnabled||!weekday(fromIso(date)))continue;
      const score=slotLikelihood(date,i+1);
      const note=make('p',`Research slot ${i+1}: ${score===null?'likelihood unavailable':score+'% illustrative chance of high simulated slot count'}. Slot-to-hour mapping is unverified.`,'cav5-hour-note');
      note.title='Based on smoothed high-count frequencies in simulated training data, not measured waiting times or real bank-hour probability.';
      box.append(note);
    }
  }
  function renderForecastBars(data,date) {
    const wrap=make('div',undefined,'cav5-forecast-result');
    const className=data.traffic_category;
    const prob=Number(data.class_probabilities?.[className]);
    wrap.append(make('h4',`Simulated ${className.toLowerCase()} traffic on ${date}`));
    wrap.append(make('p',`Random Forest daily class (same result as customer preview)${Number.isFinite(prob)?` • model category probability ${(prob*100).toFixed(1)}%`:''}. This is not a confidence guarantee or verified bank traffic.`));
    const counts=data.estimated_slots.map(x=>Number(x.estimated_count)).map(n=>Number.isFinite(n)?n:0);
    const high=Math.max(1,...counts);const table=make('div',undefined,'cav5-bars');
    data.estimated_slots.forEach((item,i)=>{
      const row=make('div',undefined,'cav5-bar-row');
      row.append(make('span','Slot '+String(item.slot??i+1)));
      const track=make('div',undefined,'cav5-track');const fill=make('div',undefined,'cav5-fill');fill.style.width=(100*counts[i]/high).toFixed(1)+'%';track.append(fill);
      row.append(track,make('strong',counts[i].toFixed(1)));table.append(row);
    });
    wrap.append(table);
    const index=counts.indexOf(Math.max(...counts));const total=counts.reduce((a,b)=>a+b,0);
    wrap.append(make('p',`What this means: across eight numbered research slots, the total estimate is ${total.toFixed(1)} simulated counts. Slot ${index+1} has the largest estimated count (${counts[index].toFixed(1)}). These eight slots are NOT verified 9 AM–5 PM hours and the bar heights are NOT probabilities.`,'cav5-meaning'));
    return wrap;
  }
  async function populateDay(date,current) {
    const panel=$('cav5-detail');if(!panel||current!==run||!panel.isConnected)return;
    panel.replaceChildren();
    const {all}=approvedMatching(date);
    panel.append(make('h3',`Selected day: ${date}`),make('p',`${all.length} approved appointment${all.length===1?'':'s'} scheduled. These are bookings, not observed arrivals.`));
    if(!weekday(fromIso(date))){panel.append(make('p','Weekend: no simulated weekday forecast. The calendar still shows any approved historical appointments.','cav5-meaning'));return;}
    if(!forecastsEnabled){panel.append(make('p','Research traffic display is turned off. Turn on “Show simulated traffic colors” to view the same customer-side model.'));return;}
    const placeholder=make('p','Loading the same simulated traffic model used by the customer preview…','cav5-loading');panel.append(placeholder);
    try{
      const info=eligible(date)?await availability(date).catch(()=>null):null;
      if(current!==run)return;
      if(info){
        const free=info.available_slots.filter(s=>Number(s.remaining_capacity)>0);
        panel.append(make('p',free.length?`${free.length} currently available booking slots from the operational database. Research colors cannot approve or block bookings.`:`No currently available customer booking slots (${info.message||'closed or full'}). Historical approved appointments remain visible.`,'cav5-availability'));
      } else if(!eligible(date)) panel.append(make('p','This date is outside the customer calendar’s 14-day booking window. The research estimate below is illustrative only.','cav5-availability'));
      const data=await forecast(date);
      if(current!==run)return;
      placeholder.replaceWith(renderForecastBars(data,date));
      addHourEvidence(date);
    }catch(error){if(current!==run)return;placeholder.textContent='Research prediction unavailable: '+error.message+'. Approved appointment details remain available.';}
  }
  async function colorDay(key,cell,expectedRun) {
    const badge=make('small','Checking booking availability…','cav5-traffic-label');cell.append(badge);
    try{
      const open=await availability(key);
      if(run!==expectedRun||!cell.isConnected)return;
      if(!open.available_slots.some(s=>Number(s.remaining_capacity)>0)){
        cell.classList.add('cav5-closed');badge.textContent='Unavailable to book';badge.title=open.message||'No open capacity';return;
      }
      badge.textContent='Loading traffic category…';
      const data=await forecast(key);
      if(run!==expectedRun||!cell.isConnected)return;
      cell.classList.add('cav5-traffic-'+data.traffic_category.toLowerCase());
      badge.textContent=categoryLabel(data.traffic_category)+' traffic (simulated)';
      badge.title='Same daily classification model as the customer calendar. Live capacity is stored in MySQL.';
    }catch(e){if(run!==expectedRun||!cell.isConnected)return;badge.textContent='Research preview unavailable';badge.title=e.message;cell.classList.add('cav5-unavailable');}
  }
  async function colorVisible(days,views,expectedRun) {
    let n=0;
    const tasks=[];
    for(let i=0;i<days.length&&i<views.length;i++){
      const date=iso(days[i]);const cell=views[i];cell.dataset.cav5Date=date;
      if(!forecastsEnabled)continue;
      if(!weekday(days[i])){cell.classList.add('cav5-closed');cell.append(make('small','Weekend / unavailable','cav5-traffic-label'));continue;}
      if(!eligible(date)){cell.classList.add('cav5-outside');cell.append(make('small','Outside booking window','cav5-traffic-label'));continue;}
      tasks.push([date,cell]);
    }
    const workers=Array.from({length:Math.min(4,tasks.length)},async()=>{
      while(n<tasks.length && expectedRun===run){const [date,cell]=tasks[n++];await colorDay(date,cell,expectedRun);}
    });
    await Promise.all(workers);
    if(expectedRun===run&&tasks.length)setStatus(`Traffic previews checked for ${tasks.length} eligible weekday${tasks.length===1?'':'s'}. Low/Moderate/High matches the customer research model; booking availability remains independent.`);
    else if(expectedRun===run)setStatus('Approved appointments are shown. Traffic colors appear only on dates currently bookable by customers.');
  }
  function postRender() {
    if(!$('cav5-controls'))return;
    const current=++run;
    const days=getDays(),cells=[...document.querySelectorAll('#calendarGrid .ca4-date')];
    const dateField=$('cav5-date');if(dateField&&typeof calendarCurrentDate!=='undefined')dateField.value=iso(calendarCurrentDate);
    const summary=$('adminCalendarSummary');if(summary){summary.textContent=summary.textContent.replace('Cancelled, pending, completed and no-show records are excluded.','Only approved bookings are counted.').replace('Cancelled, pending, completed and no-show records are excluded.','Only approved bookings are counted.');}
    const searchSummary=$('cav5-search-summary');if(!searchSummary&&summary){const e=make('div',undefined,'cav5-search-summary');e.id='cav5-search-summary';summary.insertAdjacentElement('afterend',e);}
    for(const c of cells)c.classList.remove('cav5-closed','cav5-outside','cav5-unavailable','cav5-traffic-low','cav5-traffic-moderate','cav5-traffic-high');
    applySearch();
    void colorVisible(days,cells,current);
    if(calendarViewMode==='day'&&days.length)void populateDay(iso(days[0]),current);
    else {const p=$('cav5-detail');if(p){p.replaceChildren(make('h3','Select a date for more details'),make('p','Click any day to open its approved appointment list, the eight-slot simulated forecast, and explanatory information.'));}}
  }
  function init() {
    if(started)return;
    if(!$('section-calendar')||!$('calendarGrid')||typeof window.renderCalendar!=='function')return;
    if(!$('compass-admin-v4-marker')){
      console.warn('Admin Calendar v5 needs the previous admin v4 calendar upgrade.');return;
    }
    started=true;
    buildInterface();
    const original=window.renderCalendar;
    window.renderCalendar=function(...args){const result=original.apply(this,args);postRender();return result;};
    window.renderCalendar();
    async function loadRisk(){
      for(const url of ['/customer/js/compass-traffic-risk.json','/employee/js/admin-simulated-hour-risk.json']){
        try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)continue;const d=await r.json();if(d.kind==='experimental_simulated_high_slot_probability'&&d.percentages){risk=d;if(calendarViewMode==='day'){const day=getDays()[0];if(day)addHourEvidence(iso(day));}return;}}catch(_){/* try fallback */}
      }
      console.warn('Illustrative slot likelihood file unavailable; daily classification will still work.');
    }
    void loadRisk();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
