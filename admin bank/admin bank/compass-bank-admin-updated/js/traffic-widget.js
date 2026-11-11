(function(){'use strict';
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const add=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const monday=d=>add(d,-(d.getDay()+6)%7);
const fmt=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
const long=d=>d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
const sum=xs=>Math.round(xs.reduce((a,x)=>a+Number(x.estimated_observed_hours_total||0),0));
function init(root){
 let date=new Date(),view='month',data=null;
 const one=s=>root.querySelector(s);
 const get=d=>data?.scenarios?.find(x=>x.bank===one('[data-bank]').value&&x.weekday===days[d.getDay()]);
 const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x};
 function render(){
  root.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const area=one('[data-calendar]');area.replaceChildren();if(!data)return;
  let dates=[],period='';
  if(view==='month'){const start=new Date(date.getFullYear(),date.getMonth(),1),end=new Date(date.getFullYear(),date.getMonth()+1,0);for(let d=start;d<=end;d=add(d,1))dates.push(d);period=date.toLocaleDateString('en-US',{month:'long',year:'numeric'});}
  else if(view==='week'){const start=monday(date);dates=Array.from({length:7},(_,i)=>add(start,i));period=fmt(start)+' – '+fmt(dates[6]);}
  else{dates=[date];period=long(date);}
  one('[data-period]').textContent=period;
  const modeled=dates.map(get).filter(Boolean);one('[data-total]').textContent=modeled.length?sum(modeled).toLocaleString()+' est.':'Not modeled';
  one('[data-total-label]').textContent=(view==='month'?'Month':view==='week'?'Week':'Day')+' estimated visits (modeled hours)';
  if(view==='month'){
   const grid=el('div','ctw-month');for(const d of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])grid.append(el('span','ctw-weekday',d));
   for(let i=0;i<(dates[0].getDay()+6)%7;i++)grid.append(el('span','ctw-empty'));
   dates.forEach(d=>{const x=get(d),b=el('button','ctw-date');b.type='button';b.append(el('strong','',String(d.getDate())),el('small','',x?Math.round(x.estimated_observed_hours_total).toLocaleString()+' est.':'Not modeled'));if(x)b.append(el('span','ctw-level',x.traffic_level+' traffic'));b.onclick=()=>{date=new Date(d);view='day';render()};grid.append(b)});area.append(grid);
  }else if(view==='week'){
   const rows=el('div','ctw-rows');dates.forEach(d=>{const x=get(d),b=el('button','ctw-row');b.type='button';b.append(el('strong','',fmt(d)),el('span','',x?Math.round(x.estimated_observed_hours_total)+' est.':'Not modeled'));if(x)b.append(el('small','',x.traffic_level+' traffic'));b.onclick=()=>{date=new Date(d);view='day';render()};rows.append(b)});area.append(rows);
  }else{
   const x=get(date),rows=el('div','ctw-rows');if(!x){rows.append(el('p','', 'No modeled weekday scenario for this date.'));}else{rows.append(el('p','ctw-level','Random Forest classification: '+x.traffic_level.toUpperCase()+' (experimental)'));x.observed_hours.forEach(h=>{const row=el('div','ctw-hour'),bar=el('div','ctw-bar'),fill=el('span');fill.style.width=Math.min(100,Number(h.estimated_customers)/200*100)+'%';bar.append(fill);row.append(el('strong','',h.hour_start),bar,el('span','',h.estimated_customers+' est.'));rows.append(row)})}area.append(rows);
  }
 }
 root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;render()}));
 one('[data-bank]').addEventListener('change',render);
 root.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>{const direction=b.dataset.nav==='prev'?-1:b.dataset.nav==='next'?1:0;if(!direction)date=new Date();else if(view==='month')date=new Date(date.getFullYear(),date.getMonth()+direction,Math.min(date.getDate(),28));else date=add(date,direction*(view==='week'?7:1));render()}));
 fetch('/api/research-traffic-scenarios').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(j=>{if(!Array.isArray(j.scenarios)||j.scenarios.length!==15)throw Error('Invalid scenario dataset');data=j;render()}).catch(()=>{one('[data-calendar]').textContent='Experimental traffic scenarios are unavailable. Appointment booking is unaffected.'});
}
document.querySelectorAll('[data-traffic-widget]').forEach(init);
})();