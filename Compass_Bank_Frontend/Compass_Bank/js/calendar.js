/* Phase 4P: one booking calendar, one date/time selection.
   Real booking validation remains server-side. No research predictions are mapped to booking dates. */
(function () {
  'use strict';
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const HOURS=['9:00 AM – 10:00 AM','10:00 AM – 11:00 AM','11:00 AM – 12:00 PM','12:00 PM – 1:00 PM','1:00 PM – 2:00 PM','2:00 PM – 3:00 PM','3:00 PM – 4:00 PM','4:00 PM – 5:00 PM'];
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
  const dateFrom=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3]);return iso(d)===s?d:null};
  const midnight=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const add=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
  const mon=d=>add(d,-(d.getDay()+6)%7);
  const root=document.getElementById('trafficCalendar'),dayRoot=document.getElementById('bookingDayHours');
  const dateField=document.getElementById('appointmentDate'),timeField=document.getElementById('appointmentTime');
  const msg=document.getElementById('trafficMessage');
  if(!root||!dateField||!dayRoot||!timeField)return;
  const views=document.querySelectorAll('[data-booking-view]');
  let view='month',focus=midnight(new Date()),selected=null;
  const getWindow=()=>({start:midnight(new Date()),end:add(midnight(new Date()),13)});
  const bookable=d=>{const w=getWindow();return d>=w.start&&d<=w.end&&d.getDay()!==0&&d.getDay()!==6&&!['2026-11-16','2026-11-17','2026-11-18'].includes(iso(d))};
  const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x};
  const period=ds=>ds.length===1?ds[0].toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}):ds[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+ds[ds.length-1].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const getDates=()=>{if(view==='day')return [focus];if(view==='week')return Array.from({length:7},(_,i)=>add(mon(focus),i));const y=focus.getFullYear(),m=focus.getMonth(),last=new Date(y,m+1,0).getDate();return Array.from({length:last},(_,i)=>new Date(y,m,i+1))};
  function choose(d) {
    focus=d;selected=bookable(d)?iso(d):null;dateField.value=selected||'';timeField.value='';
    dateField.dispatchEvent(new Event('change',{bubbles:true}));
    if(view!=='day')view='day';
    render();
  }
  function syncBookingTimeOptions(allowedTimes) {
    for (const option of timeField.options) {
      if (!option.value) continue;

      const match = /^(\d{1,2}):\d{2} (AM|PM)/.exec(option.value);
      if (!match) {
        option.disabled=true;
        continue;
      }

      let hour=Number(match[1])%12;
      if (match[2]==='PM') hour+=12;

      const key=String(hour).padStart(2,'0')+':00';
      option.disabled=!allowedTimes.has(key);
    }
  }

  syncBookingTimeOptions(new Set());
  let availabilityRequestId=0;

  function updateHours() {
    const requestId=++availabilityRequestId;
    const previousTime=timeField.value;
    syncBookingTimeOptions(new Set());
    dayRoot.replaceChildren();
    if(view!=='day')return;

    const d=focus;
    const date=iso(d);
    const can=bookable(d);

    const h=el('h4','unified-cal-day-title',
      d.toLocaleDateString('en-US',{
        weekday:'long',month:'short',day:'numeric'
      })+' ? Choose an appointment hour');
    dayRoot.append(h);

    const info=el('p','unified-cal-help',
      can
        ? 'Checking live appointment availability...'
        : 'Booking unavailable: outside the 14-day booking window or branch closed.');
    dayRoot.append(info);

    const rows=el('div','unified-cal-hours');
    const buttons=[];

    const parts=new Intl.DateTimeFormat('en-US',{
      timeZone:'Asia/Manila',
      year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',hourCycle:'h23'
    }).formatToParts(new Date());

    const values=Object.fromEntries(
      parts.map(part=>[part.type,part.value])
    );

    const branchToday=
      values.year+'-'+values.month+'-'+values.day;
    const branchHour=Number(values.hour);

    HOURS.forEach((label,index)=>{
      const hour=9+index;
      const time=String(hour).padStart(2,'0')+':00';
      const past=date===branchToday && hour<=branchHour;

      const button=el('button','unified-cal-hour');button.dataset.compassSlot=String(index+1);
      button.type='button';
      button.disabled=true;
      button.append(el('strong','',label));

      const availability=el('small','unified-cal-help',
        !can?'Unavailable':past?'Time has passed':'Checking availability...');

      button.append(availability);

      if(timeField.value===label && selected===date){
        button.classList.add('selected');
      }

      buttons.push({button,availability,label,time,past});
      rows.append(button);
    });

    dayRoot.append(rows);

    dayRoot.append(el('p','unified-cal-help',
      'Remaining places describe scheduled appointment capacity, not predicted walk-in traffic. Final availability is checked when booking.'));

    function clearUnavailableSelection() {
      const chosen=buttons.find(
        entry=>entry.label===timeField.value
      );

      if(selected===date && chosen &&
         chosen.button.disabled){
        timeField.value='';
        timeField.dispatchEvent(
          new Event('change',{bubbles:true})
        );
      }
    }

    if(!can){
      clearUnavailableSelection();
      if(msg)msg.textContent=
        'Select a date within the next 14 days when the branch is open.';
      return;
    }

    fetch('/api/booking-availability?date='+encodeURIComponent(date),{
      cache:'no-store'
    })
    .then(async response=>{
      if(!response.ok)throw new Error('Availability unavailable');
      return response.json();
    })
    .then(data=>{
      if(requestId!==availabilityRequestId ||
         view!=='day' || iso(focus)!==date)return;

      if(data.status!=='ok' ||
         data.date!==date ||
         !Array.isArray(data.available_slots)){
        throw new Error('Unexpected availability response');
      }

      const maximum=data.max_appointments_per_slot;
      const validMaximum=Number.isInteger(maximum) && maximum>0;

      const slotMap=new Map();

      for(const slot of data.available_slots){
        if(typeof slot.time!=='string' ||
           !Number.isInteger(slot.remaining_capacity) ||
           !validMaximum ||
           slot.remaining_capacity<1 ||
           slot.remaining_capacity>maximum){
          throw new Error('Invalid appointment capacity data');
        }
        slotMap.set(slot.time.slice(0,5),slot.remaining_capacity);
      }

      const allowedTimes=new Set();

      for(const entry of buttons){
        const remaining=slotMap.get(entry.time);
        const available=!entry.past &&
          Number.isInteger(remaining) &&
          remaining>0;

        entry.button.disabled=!available;
        if(available) allowedTimes.add(entry.time);

        entry.availability.textContent=entry.past
          ? 'Time has passed'
          : available
            ? remaining+' of '+maximum+' appointment places left'
            : 'No appointment places available';

        if(available){
          entry.button.onclick=()=>{
            if(!bookable(d) || entry.button.disabled)return;

            selected=date;
            focus=d;
            dateField.value=date;
            timeField.value=entry.label;

            dateField.dispatchEvent(
              new Event('change',{bubbles:true})
            );
            timeField.dispatchEvent(
              new Event('change',{bubbles:true})
            );

            render();
          };
        }
      }

      syncBookingTimeOptions(allowedTimes);

      const previousOption=[...timeField.options].find(
        option=>option.value===previousTime
      );
      const keepSelection=selected===date &&
        previousOption && !previousOption.disabled;

      if(keepSelection){
        timeField.value=previousTime;
      }else if(previousTime){
        timeField.value='';
        timeField.dispatchEvent(
          new Event('change',{bubbles:true})
        );
      }

      clearUnavailableSelection();
      info.textContent=
        'Live appointment availability loaded. Choose an available hour.';
      window.dispatchEvent(new CustomEvent('compass:hours-loaded',{detail:{date}}));

      if(msg){
        msg.textContent=timeField.value && selected===date
          ? 'Selected: '+date+' at '+timeField.value+
            '. Final capacity is checked when booking.'
          : 'Choose an available appointment hour.';
      }
    })
    .catch(()=>{
      if(requestId!==availabilityRequestId ||
         view!=='day' || iso(focus)!==date)return;

      syncBookingTimeOptions(new Set());

      for(const entry of buttons){
        entry.button.disabled=true;
        entry.availability.textContent=
          'Availability temporarily unavailable';
      }

      if(previousTime){
        timeField.value='';
        timeField.dispatchEvent(
          new Event('change',{bubbles:true})
        );
      }

      clearUnavailableSelection();
      info.textContent=
        'Could not verify appointment availability. Select the date again to retry.';

      if(msg)msg.textContent=
        'Appointment availability could not be verified.';
    });
  }

  function render(){
    views.forEach(b=>{const on=b.dataset.bookingView===view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    root.replaceChildren();
    const dates=getDates();
    const top=el('div','unified-cal-top'),nav=el('div','unified-cal-nav');
    const prev=el('button','','‹'),today=el('button','','Today'),next=el('button','','›');
    [prev,today,next].forEach(b=>b.type='button');
    prev.setAttribute('aria-label','Previous '+view);next.setAttribute('aria-label','Next '+view);
    prev.onclick=()=>move(-1);next.onclick=()=>move(1);today.onclick=()=>{focus=midnight(new Date());render()};
    nav.append(prev,today,next);top.append(nav,el('strong','',view==='month'?MONTHS[focus.getMonth()]+' '+focus.getFullYear():period(dates)));root.append(top);
    const summary=el('div','unified-cal-summary');
    summary.append(el('strong','','Appointment scheduling'),el('small','','Select a date within the next 14 days. Final slot availability is checked when booking.'));
    root.append(summary);
    const body=el('div',view==='month'?'cal-grid unified-cal-grid':'unified-cal-list');
    if(view==='month'){['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(w=>body.append(el('div','cal-weekday',w)));for(let j=0;j<dates[0].getDay();j++)body.append(el('span','cal-empty'));}
    dates.forEach(d=>{
      const b=el('button',view==='month'?'cal-day unified-cal-date':'unified-cal-date unified-cal-row');b.type='button';b.dataset.compassDate=iso(d);
      b.setAttribute('aria-label',d.toDateString()+(bookable(d)?' within booking window':' outside booking window'));
      b.append(el('span','cal-day-num',String(d.getDate())));
      b.append(el('small','unified-cal-count',bookable(d)?'Select date':'Unavailable'));
      if(!bookable(d))b.classList.add('unified-cal-unbookable');
      if(selected===iso(d))b.classList.add('selected');
      b.onclick=()=>choose(d);body.append(b);
    });
    root.append(body);
    const note=el('p','unified-cal-disclaimer','Appointment requests are subject to branch hours, slot capacity and final server validation.');
    root.append(note);
    window.dispatchEvent(new CustomEvent('compass:calendar-rendered',{detail:{view}}));
    updateHours();
  }
  function move(step){if(view==='month')focus=new Date(focus.getFullYear(),focus.getMonth()+step,1);else focus=add(focus,step*(view==='week'?7:1));render()}
  views.forEach(b=>b.addEventListener('click',()=>{view=b.dataset.bookingView;render()}));
  dateField.form?.addEventListener('reset',()=>setTimeout(()=>{selected=null;focus=midnight(new Date());view='month';render()},0));
  window.CompassCalendar={refresh:render,getWindow,setForecastProvider(){/* Live forecast remains disabled until scientifically validated. */}};
  render();
})();