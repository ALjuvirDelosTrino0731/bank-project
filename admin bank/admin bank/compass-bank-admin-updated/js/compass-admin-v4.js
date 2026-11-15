/* COMPASS_ADMIN_V4: addon only; no appointment writes or credential handling. */
(() => {
  'use strict';
  const doc = document;
  const $ = id => doc.getElementById(id);
  const mk = (tag, text, cls) => { const e=doc.createElement(tag); if(text!==undefined) e.textContent=String(text); if(cls) e.className=cls; return e; };
  const info = (title, explanation) => {const b=mk('section',undefined,'ca4-guide'); b.append(mk('strong',title),mk('p',explanation));return b;};
  const toName = x => String(x?.name||'Customer');
  const fmt = n => Number(n||0).toLocaleString('en-US');
  const escapeDate = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const addDate = (d,n) => new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
  const isApproved = a => ['Approved','confirmed'].includes(a?.status);
  const appList = () => typeof appointments !== 'undefined' && Array.isArray(appointments) ? appointments : [];
  const getDoc = id => $('section-'+id);
  function updateDashboardCards() {
    const dashboard = getDoc('dashboard'); if(!dashboard)return;
    const total=$('statTotal'), approved=$('statApproved');
    if(!total||!approved)return;
    for(const id of ['statPending','statRejected']){
      const el=$(id);const card=el?.closest('.bg-white.rounded-3xl'); if(card)card.style.display='none';
    }
    const grid=total.closest('.grid'); if(grid){grid.classList.remove('lg:grid-cols-4');grid.classList.add('lg:grid-cols-2');}
    const totalCard=total.closest('.bg-white.rounded-3xl');
    const approvedCard=approved.closest('.bg-white.rounded-3xl');
    if(totalCard){const t=totalCard.querySelector('p.uppercase');if(t)t.textContent='Total appointments today';}
    if(approvedCard){const t=approvedCard.querySelector('p.uppercase');if(t)t.textContent='Approved appointments';const sub=approvedCard.querySelector('span');if(sub)sub.textContent='Approved records (all dates), not arrivals';}
  }
  function fixSortLabels() {
    const sort=$('appointmentSort');if(!sort)return;
    const labels={dateAsc:'Date - earliest first',dateDesc:'Date - latest first',nameAsc:'Customer name - A to Z',nameDesc:'Customer name - Z to A',serviceAsc:'Service type - A to Z',serviceDesc:'Service type - Z to A'};
    for(const option of sort.options){if(labels[option.value])option.textContent=labels[option.value];}
    sort.title='Sort approved appointments; no database records are changed.';
    const search=$('appointmentSearchInput');if(search)search.title='Filter the approved list by name, reference, email, or service.';
  }
  // Keep the existing calendar's navigation controls and appointment detail modal.
  function replaceCalendar() {
    if(typeof window.renderCalendar!=='function')return;
    window.renderCalendar=function() {
      const root=$('calendarGrid'),label=$('calendarMonthLabel'),summary=$('adminCalendarSummary');
      if(!root||!label||typeof calendarCurrentDate==='undefined'||typeof calendarViewMode==='undefined')return;
      root.replaceChildren();
      const mode=['month','week','day'].includes(calendarViewMode)?calendarViewMode:'month';
      const ref=calendarCurrentDate;
      let days=[];
      if(mode==='month')days=Array.from({length:new Date(ref.getFullYear(),ref.getMonth()+1,0).getDate()},(_,i)=>new Date(ref.getFullYear(),ref.getMonth(),i+1));
      else if(mode==='week'){const start=addDate(ref,-((ref.getDay()+6)%7));days=Array.from({length:7},(_,i)=>addDate(start,i));}
      else days=[new Date(ref)];
      const names=new Set(days.map(escapeDate));
      const grouped=new Map();
      for(const item of appList()){
        if(!names.has(item.date)||!isApproved(item))continue;
        if(!grouped.has(item.date))grouped.set(item.date,[]);
        grouped.get(item.date).push(item);
      }
      for(const v of grouped.values())v.sort((a,b)=>(String(a.time)+' '+toName(a)).localeCompare(String(b.time)+' '+toName(b)));
      const count=[...grouped.values()].reduce((a,b)=>a+b.length,0);
      const busyDays=grouped.size;
      const long=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      label.textContent=mode==='month'?ref.toLocaleDateString('en-US',{month:'long',year:'numeric'}):mode==='week'?`${long(days[0])} - ${long(days[6])}`:ref.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
      if(summary)summary.textContent=`${fmt(count)} approved appointment${count!==1?'s':''} in this ${mode} view, across ${fmt(busyDays)} date${busyDays!==1?'s':''}. Cancelled, pending, completed and no-show records are excluded. These are bookings, not verified arrivals.`;
      const dow=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      if(mode==='month'){
        root.className='ca4-calendar-month';
        dow.forEach(x=>root.append(mk('span',x,'ca4-weekday')));
        for(let i=0;i<days[0].getDay();i++)root.append(mk('span','', 'ca4-calendar-empty'));
      }else root.className=mode==='week'?'ca4-calendar-week':'ca4-calendar-day';
      days.forEach(d=>{
        const key=escapeDate(d);const bookings=grouped.get(key)||[];
        const cell=mk('section',undefined,'ca4-date'+(![0,6].includes(d.getDay())?'':' ca4-weekend'));
        const head=mk('button',mode==='month'?String(d.getDate()):d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}),'ca4-date-button');
        head.type='button';head.title='Open '+key+' to see approved appointment details';
        head.addEventListener('click',()=>{calendarCurrentDate=new Date(d);if(typeof window.setCalendarView==='function')window.setCalendarView('day');});
        cell.append(head,mk('span',bookings.length+' approved','ca4-count'));
        if(mode==='day'){
          const rows=mk('div',undefined,'ca4-hours');
          for(let hour=9;hour<17;hour++){
            const label=String(hour).padStart(2,'0')+':00';
            const matched=bookings.filter(a=>String(a.time).startsWith(String(hour).padStart(2,'0')+':'));
            const group=mk('div',undefined,'ca4-hour');
            group.append(mk('strong',label+' - '+String(hour+1).padStart(2,'0')+':00'),mk('span',matched.length+' approved appointment'+(matched.length===1?'':'s'),'ca4-count'));
            if(!matched.length)group.append(mk('small','No approved bookings for this hour.'));
            matched.forEach(a=>{const b=mk('button',String(a.time)+' - '+toName(a)+' - '+String(a.type||'Service'),'ca4-event');b.type='button';b.title='View appointment details';b.addEventListener('click',()=>{if(typeof window.openDetailsModal==='function')window.openDetailsModal(a.id);});group.append(b);});
            rows.append(group);
          }cell.append(rows);
        }else if(mode==='week'){
          bookings.slice(0,5).forEach(a=>{const b=mk('button',String(a.time)+' - '+toName(a),'ca4-event');b.type='button';b.addEventListener('click',()=>{if(typeof window.openDetailsModal==='function')window.openDetailsModal(a.id);});cell.append(b)});
          if(bookings.length>5)cell.append(mk('small','+'+(bookings.length-5)+' more; open day view'));
        }else if(bookings.length){
          const b=mk('button','View '+bookings.length+' appointment'+(bookings.length===1?'':'s'),'ca4-event');b.type='button';b.addEventListener('click',()=>{calendarCurrentDate=new Date(d);if(typeof window.setCalendarView==='function')window.setCalendarView('day');});cell.append(b);
        }
        root.append(cell);
      });
    };
    try{window.renderCalendar();}catch(e){console.error('Admin calendar update failed',e);}
    const totals=$('adminCalendarSummary');if(totals)totals.setAttribute('role','status');
    const h=$('section-calendar');const note=h?.querySelector('.admin-unified-guide');if(note)note.textContent='Month and week show approved appointment counts. Click a date for its 9 AM-5 PM appointment list. Counts are scheduled bookings, not actual bank arrivals.';
  }
  function addGuide(section, title, desc) {
    if(!section||section.querySelector('.ca4-guide'))return;
    const first=section.firstElementChild;const b=info(title,desc);
    if(first)first.insertAdjacentElement('afterend',b);else section.append(b);
  }
  function addGuides() {
    addGuide(getDoc('dashboard'),'Dashboard guide','The two counters are loaded from the appointment database. Total Today counts appointments dated today; Approved Appointments counts confirmed bookings across dates. Simulated ML predictions below are not measured arrivals.');
    addGuide(getDoc('appointments'),'Appointments guide','Search the approved list and sort it by date, customer name or service. Click View to inspect service and transaction details. Historical non-approved records stay in the database; sorting never modifies a booking.');
    addGuide(getDoc('calendar'),'Calendar guide','Use Month, Week and Day for approved appointments only. Click any date to see booked hours and open a customer record. Calendar totals update for the selected period; these are not measured arrivals.');
    addGuide(getDoc('traffic'),'Traffic analysis guide','Run the simulated Random Forest models by choosing a research date. Classification identifies a Low, Moderate or High category; regression estimates counts for eight numbered slots. Data from operational bookings is shown separately.');
    const research=getDoc('research'); if(research&&!research.querySelector('.ca4-guide')){
      const b=info('Research tools guide','Dataset Intelligence checks and cleans supported uploads. Experimental ML Scenarios runs models on simulated 2026 inputs. ML Evaluation compares simulated and historical test results. Uploading data never automatically retrains the models.');research.insertBefore(b,research.querySelector('iframe'));
    }
    for(const [id,title] of [['nav-dashboard','Live appointment summary'],['nav-appointments','Search approved bookings and view details'],['nav-calendar','Review approved bookings by date'],['nav-traffic','Predictions, graphs and explanations']]){const el=$(id);if(el)el.title=title;}
    const btns={'calViewMonth':'See the selected calendar month','calViewWeek':'See the week containing the selected date','calViewDay':'See the selected day in hour-by-hour detail'};
    for(const [id,t] of Object.entries(btns))if($(id))$(id).title=t;
    const buttons=doc.querySelectorAll('[data-research-module]');const hints={dataset:'Upload and clean supported CSV/XLSX research data; original data is never modified',scenarios:'Run simulated Random Forest classification and regression models',evaluation:'Compare simulated 2026 and historical Nigerian holdout evaluation'};
    for(const b of buttons){b.title=hints[b.dataset.researchModule]||'Open research tool';}
  }
  function addDynamicChartExplanation() {
    const pie=$('transactionPieChart'),capacity=$('capacityBarChart');
    const findCard=canvas=>canvas?.closest('.bg-white.rounded-3xl');
    const pieCard=findCard(pie),capacityCard=findCard(capacity);
    if(pieCard&&!$('ca4-mix-explain')){const title=pieCard.querySelector('h3');if(title)title.textContent='Services in approved appointments';const e=mk('p','', 'ca4-explain');e.id='ca4-mix-explain';pieCard.append(e);}
    if(capacityCard&&!$('ca4-hour-explain')){const h=capacityCard.querySelector('p.text-xs');if(h)h.textContent='Confirmed appointments scheduled for today, not actual visitor arrivals or a machine-learning forecast.';const e=mk('p','', 'ca4-explain');e.id='ca4-hour-explain';capacityCard.append(e);}
    function refresh() {
      const items=appList().filter(isApproved);
      const map=new Map();
      for(const a of items){
        const details=Array.isArray(a.transactions)&&a.transactions.length?a.transactions:[a.type];
        for(const t of details){const service=String(t||'Unspecified').split(':')[0].trim()||'Unspecified';map.set(service,(map.get(service)||0)+1);}
      }
      const ranks=[...map.entries()].sort((a,b)=>b[1]-a[1]);
      // Make the rendered charts reflect the SAME approved-only records as their explanations.
      if(typeof transactionPieChartRef!=='undefined' && transactionPieChartRef){
        transactionPieChartRef.data.labels=ranks.length?ranks.map(a=>a[0]):['No approved appointments'];
        transactionPieChartRef.data.datasets[0].data=ranks.length?ranks.map(a=>a[1]):[1];
        transactionPieChartRef.data.datasets[0].backgroundColor=ranks.length?['#8050b0','#a4bb2f','#f59e0b','#10b981','#64748b']:['#e5e7eb'];
        transactionPieChartRef.update('none');
      }
      const e=$('ca4-mix-explain');if(e)e.textContent=ranks.length?`What this means: ${fmt(items.length)} approved appointment records contain ${fmt([...map.values()].reduce((a,b)=>a+b,0))} service entries. The most common service is ${ranks[0][0]} (${fmt(ranks[0][1])} entries). One appointment may have more than one service.`:'What this means: there are no approved appointments in the currently loaded records.';
      const manila=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
      const today=manila.year+'-'+manila.month+'-'+manila.day;
      const list=items.filter(a=>a.date===today);
      const hours=new Map();for(const a of list){const k=String(a.time).slice(0,2);hours.set(k,(hours.get(k)||0)+1);}
      const busiest=[...hours].sort((a,b)=>b[1]-a[1])[0];
      if(typeof capacityBarChartRef!=='undefined' && capacityBarChartRef){
        capacityBarChartRef.data.datasets[0].data=Array.from({length:8},(_,i)=>hours.get(String(i+9).padStart(2,'0'))||0);
        capacityBarChartRef.data.datasets[0].label='Approved appointments by hour (live booking records)';
        capacityBarChartRef.update('none');
      }
      const ce=$('ca4-hour-explain');if(ce)ce.textContent=busiest?`What this means: ${fmt(list.length)} approved appointments are scheduled today. The most-booked hour starts at ${busiest[0]}:00 (${busiest[1]} appointments). This shows booked slots, not predicted traffic or walk-ins.`:'What this means: no approved appointments are scheduled today. A zero count does not prove zero walk-in visits.';
    }
    if(typeof window.renderAnalyticsCharts==='function'){
      const old=window.renderAnalyticsCharts;
      window.renderAnalyticsCharts=function(...args){const res=old.apply(this,args);refresh();return res;};
    }
    refresh();
    const traffic=getDoc('traffic');if(traffic){const grid=traffic.querySelector('.grid');if(grid)grid.classList.add('ca4-large-graph-grid');}
  }
  function trackPredictionInterpretation() {
    const targets=[['cad-category','ca4-dash-interpret'],['es14-class','ca4-traffic-interpret']];
    targets.forEach(([id,explainId])=>{
      const target=$(id);if(!target||$(explainId))return;
      const note=mk('p','', 'ca4-explain');note.id=explainId;target.parentElement.append(note);
      let previous='';
      const update=()=>{const raw=target.textContent.trim();if(raw===previous)return;previous=raw;const level=/\b(Low|Moderate|High)\b/i.exec(raw)?.[1];const meaning={Low:'a lower simulated daily traffic category',Moderate:'a middle simulated daily traffic category',High:'a higher simulated daily traffic category'};note.textContent=level?`Interpretation: ${level} means ${meaning[level]||meaning[level[0].toUpperCase()+level.slice(1).toLowerCase()]}. This category is an experimental model prediction, not a guaranteed waiting time.`:'The interpretation updates after the model produces a valid traffic category.';};
      new MutationObserver(update).observe(target,{childList:true,subtree:true,characterData:true});update();
    });
    const reg=$('es14-reg');if(reg&&!$('ca4-reg-interpret')){
      const e=mk('p','', 'ca4-explain');e.id='ca4-reg-interpret';reg.parentElement.append(e);
      const update=()=>{const vals=[...reg.querySelectorAll('.es14-row')].map(row=>{const n=Number(row.lastElementChild?.textContent);return Number.isFinite(n)?n:null}).filter(x=>x!==null);if(!vals.length){e.textContent='After prediction, this explanation will identify the largest and smallest simulated slot estimates.';return;}const max=Math.max(...vals),min=Math.min(...vals);e.textContent=`Regression meaning: predicted counts range from ${min.toFixed(1)} to ${max.toFixed(1)} across ${vals.length} numbered slots. Slot labels are not verified clock hours, and these are not probabilities.`;};new MutationObserver(update).observe(reg,{childList:true,subtree:true,characterData:true});update();
    }
  }
  function upgradeResearchNav() {
    if(typeof COMPASS_RESEARCH_MODULES!=='undefined'){
      COMPASS_RESEARCH_MODULES.evaluation={src:'evaluation-combined-v4.html',title:'ML Evaluation: Simulated + Historical',subtitle:'Classification, regression, graphs and dynamic interpretations for each dataset'};
      COMPASS_RESEARCH_MODULES.scenarios={src:'scenarios-v4.html',title:'Experimental ML Scenarios',subtitle:'Run the 2026 simulated classification and regression models'};
    }
    for(const b of doc.querySelectorAll('[data-research-module="evaluation"] span'))b.textContent='ML Evaluation (Real + Simulated)';
    const description=doc.querySelector('#section-research > p:last-of-type');if(description)description.textContent='Research models use simulated Indonesian-referenced 2026 data; historical Nigerian results are archived separately. Neither is an approved live Philippine forecast.';
    const iframe=$('researchModuleFrame');if(iframe)iframe.style.height='min(80vh, 1100px)';
  }
  function init() {
    if($('compass-admin-v4-marker'))return;
    const marker=mk('span','','');marker.id='compass-admin-v4-marker';marker.hidden=true;doc.body.append(marker);
    updateDashboardCards();fixSortLabels();replaceCalendar();addGuides();upgradeResearchNav();addDynamicChartExplanation();trackPredictionInterpretation();
    const loginView=$('dashboardView');if(loginView){new MutationObserver(()=>{if(!loginView.classList.contains('hidden')){updateDashboardCards();fixSortLabels();try{window.renderCalendar?.()}catch(_){}}}).observe(loginView,{attributes:true,attributeFilter:['class']});}
  }
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
