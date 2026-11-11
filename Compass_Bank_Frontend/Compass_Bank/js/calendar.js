/* Phase 4P: one booking calendar, one date/time selection.
   Real booking validation remains server-side. Scenario estimates are external and experimental. */
(function () {
  'use strict';
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const HOURS=['9:00 AM – 10:00 AM','10:00 AM – 11:00 AM','11:00 AM – 12:00 PM','12:00 PM – 1:00 PM','1:00 PM – 2:00 PM','2:00 PM – 3:00 PM','3:00 PM – 4:00 PM','4:00 PM – 5:00 PM'];
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
  const dateFrom=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3]);return iso(d)===s?d:null};
  const midnight=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const add=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
  const mon=d=>add(d,-(d.getDay()+6)%7);
  const money=n=>Math.round(n).toLocaleString('en-US');
  const root=document.getElementById('trafficCalendar'),dayRoot=document.getElementById('bookingDayHours');
  const dateField=document.getElementById('appointmentDate'),timeField=document.getElementById('appointmentTime');
  const msg=document.getElementById('trafficMessage'),bankSelect=document.getElementById('scenarioBank');
  if(!root||!dateField||!dayRoot||!timeField)return;
  const views=document.querySelectorAll('[data-booking-view]');
  let view='month',focus=midnight(new Date()),selected=null,model=null,loadAttempted=false;
  const getWindow=()=>({start:midnight(new Date()),end:add(midnight(new Date()),13)});
  const bookable=d=>{const w=getWindow();return d>=w.start&&d<=w.end&&d.getDay()!==0&&d.getDay()!==6};
  const record=d=>model&&model.scenarios?model.scenarios.find(x=>x.bank===bankSelect.value&&x.weekday===DAYS[d.getDay()]):null;
  const asCount=d=>{const r=record(d);return r?Number(r.estimated_observed_hours_total):null};
  const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x};
  const period=ds=>ds.length===1?ds[0].toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}):ds[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+ds[ds.length-1].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const getDates=()=>{if(view==='day')return [focus];if(view==='week')return Array.from({length:7},(_,i)=>add(mon(focus),i));const y=focus.getFullYear(),m=focus.getMonth(),last=new Date(y,m+1,0).getDate();return Array.from({length:last},(_,i)=>new Date(y,m,i+1))};
  function choose(d) {
    focus=d;selected=bookable(d)?iso(d):null;dateField.value=selected||'';
    dateField.dispatchEvent(new Event('change',{bubbles:true}));
    if(view!=='day')view='day';
    render();
  }
  function updateHours() {
    dayRoot.replaceChildren();
    if(view!=='day')return;
    const d=focus,r=record(d),can=bookable(d);
    const h=el('h4','unified-cal-day-title',d.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})+' · Choose an appointment hour');
    dayRoot.append(h);
    const info=el('p','unified-cal-help',!can?'Booking unavailable: outside the 14-day booking window or branch closed.':r?'Traffic figures are experimental hourly estimates, not available booking capacity.':'No experimental traffic model is available for this date; booking can continue.');
    dayRoot.append(info);
    const rows=el('div','unified-cal-hours');
    HOURS.forEach((label,index)=>{
      const b=el('button','unified-cal-hour');b.type='button';
      const hour=9+index,now=new Date();
      const past=iso(d)===iso(now)&&hour<=now.getHours();
      b.disabled=!can||past;
      const modeled=r&&r.observed_hours?r.observed_hours.find(x=>+String(x.hour_start).slice(0,2)===hour):null;
      b.append(el('strong','',label),el('small','',modeled?money(Number(modeled.estimated_customers))+' experimental visits':'No hourly estimate'));
      if(timeField.value===label&&selected===iso(d))b.classList.add('selected');
      b.onclick=()=>{if(!bookable(d))return;selected=iso(d);dateField.value=selected;timeField.value=label;dateField.dispatchEvent(new Event('change',{bubbles:true}));timeField.dispatchEvent(new Event('change',{bubbles:true}));render();};
      rows.append(b);
    });
    dayRoot.append(rows);
    const note=el('p','unified-cal-help','A time selection is a request, not a reservation guarantee. Final availability, capacity and operating hours are validated when booking.');
    dayRoot.append(note);
    if(selected&&bookable(d)&&msg)msg.textContent='Selected: '+d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' at '+timeField.value+'. Complete the form to submit your appointment.';
    else if(msg)msg.textContent='Choose a date within the next 14 days, then select a future appointment hour.';
  }
  function render(){
    views.forEach(b=>{const on=b.dataset.bookingView===view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    root.replaceChildren();
    const dates=getDates(),sum=dates.reduce((n,d)=>n+(asCount(d)||0),0),has=dates.some(d=>asCount(d)!==null);
    const top=el('div','unified-cal-top'),nav=el('div','unified-cal-nav');
    const prev=el('button','','‹'),today=el('button','','Today'),next=el('button','','›');
    [prev,today,next].forEach(b=>b.type='button');
    prev.setAttribute('aria-label','Previous '+view);next.setAttribute('aria-label','Next '+view);
    prev.onclick=()=>move(-1);next.onclick=()=>move(1);today.onclick=()=>{focus=midnight(new Date());render()};
    nav.append(prev,today,next);top.append(nav,el('strong','',view==='month'?MONTHS[focus.getMonth()]+' '+focus.getFullYear():period(dates)));root.append(top);
    const summary=el('div','unified-cal-summary');
    summary.append(el('strong','',has?money(sum)+' experimental estimated visits':'No scenario estimates'),el('small','',view+' total for modeled weekdays/hours only · not scheduled appointments'));
    root.append(summary);
    const body=el('div',view==='month'?'cal-grid unified-cal-grid':'unified-cal-list');
    if(view==='month'){['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(w=>body.append(el('div','cal-weekday',w)));for(let j=0;j<dates[0].getDay();j++)body.append(el('span','cal-empty'));}
    dates.forEach(d=>{
      const r=record(d),b=el('button',view==='month'?'cal-day unified-cal-date':'unified-cal-date unified-cal-row');b.type='button';
      b.setAttribute('aria-label',d.toDateString()+(r?' '+money(Number(r.estimated_observed_hours_total))+' experimental visits':' no estimate')+(bookable(d)?' available for booking':' outside booking window'));
      b.append(el('span','cal-day-num',String(d.getDate())));
      b.append(el('small','unified-cal-count',r?money(Number(r.estimated_observed_hours_total))+' est.':'Not modeled'));
      if(r)b.append(el('small','unified-cal-level',String(r.traffic_level||'').toUpperCase()+' traffic'));
      if(!bookable(d))b.classList.add('unified-cal-unbookable');
      if(selected===iso(d))b.classList.add('selected');
      b.onclick=()=>choose(d);body.append(b);
    });
    root.append(body);
    const note=el('p','unified-cal-disclaimer','Experimental model: external Nigerian banking observations, no verified historical calendar dates. Week/month totals repeat weekday scenarios and are not validated Philippine branch forecasts.');
    if(!model&&loadAttempted)note.textContent='Research traffic estimates unavailable. You can still book an appointment; live bank forecasts are not validated.';
    root.append(note);
    updateHours();
  }
  function move(step){if(view==='month')focus=new Date(focus.getFullYear(),focus.getMonth()+step,1);else focus=add(focus,step*(view==='week'?7:1));render()}
  views.forEach(b=>b.addEventListener('click',()=>{view=b.dataset.bookingView;render()}));
  bankSelect.addEventListener('change',render);
  dateField.form?.addEventListener('reset',()=>setTimeout(()=>{selected=null;focus=midnight(new Date());view='month';render()},0));
  window.CompassCalendar={refresh:render,getWindow,setForecastProvider(){/* Live forecast remains disabled until scientifically validated. */}};
  fetch('/api/research-traffic-scenarios').then(r=>{if(!r.ok)throw Error('No research scenario data');return r.json()}).then(j=>{if(!Array.isArray(j.scenarios))throw Error('Invalid scenarios');model=j;loadAttempted=true;render()}).catch(()=>{loadAttempted=true;render()});
  render();
})();