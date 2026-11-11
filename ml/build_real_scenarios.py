"""Train exploratory Nigerian bank scenario models on observation weeks 1-3.
Week 4 is held out and not used for fitting. Does not create calendar-dated training records.
"""
from pathlib import Path
import json
import pandas as pd
from sklearn.ensemble import RandomForestClassifier,RandomForestRegressor
R=Path(__file__).resolve().parent
raw=pd.read_csv(R/'hourly_observed_counts.csv',encoding='utf-8-sig')
assert len(raw)==419 and raw.calendar_date_available.eq('NO').all()
assert not raw.duplicated(['bank','week','weekday','hour_start']).any()
assert raw.observed_customer_count.ge(0).all()
weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday']
banks=['first','second','third']
raw['weekday_number']=raw.weekday.map({x:i for i,x in enumerate(weekdays)})
raw['bank_number']=raw.bank.map({x:i for i,x in enumerate(banks)})
raw['hour']=raw.hour_start.str[:2].astype(int)
assert raw[['weekday_number','bank_number']].notna().all().all()
assert raw.hour.between(8,14).all()
train=raw[raw.week.le(3)].copy(); heldout=raw[raw.week.eq(4)].copy()
assert train.groupby(['bank','week','weekday']).ngroups==45
assert heldout.groupby(['bank','week','weekday']).ngroups==15
# Train-only category thresholds and labels.
daily=train.groupby(['bank_number','weekday_number','bank','weekday','week'],as_index=False).observed_customer_count.sum()
a=float(daily.observed_customer_count.quantile(1/3)); b=float(daily.observed_customer_count.quantile(2/3))
assert a<b
def level(v): return 'low' if v<=a else ('moderate' if v<=b else 'high')
daily['level']=daily.observed_customer_count.map(level)
clf=RandomForestClassifier(n_estimators=200,min_samples_leaf=2,class_weight='balanced',random_state=42,n_jobs=1)
reg=RandomForestRegressor(n_estimators=200,min_samples_leaf=3,random_state=42,n_jobs=1)
clf.fit(daily[['bank_number','weekday_number']],daily.level)
reg.fit(train[['bank_number','weekday_number','hour']],train.observed_customer_count)
scenarios=[]
for bi,bank in enumerate(banks):
 for wi,weekday in enumerate(weekdays):
  classification=clf.predict(pd.DataFrame([{'bank_number':bi,'weekday_number':wi}]))[0]
  hours=[]
  for hour in range(8,15):
   pred=float(reg.predict(pd.DataFrame([{'bank_number':bi,'weekday_number':wi,'hour':hour}]))[0])
   hours.append({'hour_start':f'{hour:02d}:00','estimated_customers':round(max(0,pred),1)})
  scenarios.append({'bank':bank,'weekday':weekday,'traffic_level':classification,'observed_hours':hours,'estimated_observed_hours_total':round(sum(x['estimated_customers'] for x in hours),1)})
out={'status':'experimental_scenarios_only','source':'Bishop et al. (2018), Data in Brief, DOI: 10.1016/j.dib.2018.05.101; Nigerian banking observations',
 'training_weeks':[1,2,3],'held_out_week':4,'training_bank_days':45,'observed_hours':'08:00–14:59 only',
 'classification_model':'RandomForestClassifier','regression_model':'RandomForestRegressor',
 'daily_level_cutoffs_training_only':{'low_max':a,'moderate_max':b},
 'limitations':['Not a validated forecast for a Philippine bank branch','Calendar dates in the UI are scenario selectors, not historical training dates','No seasonal, holiday, payday, or calendar-date effects modeled','No predictions for 15:00–17:00','Week 4 held out; model performance is limited (40% classification accuracy on 15 held-out bank-days)','Monthly and weekly sums are illustrative repeated-weekday scenario totals, not validated future arrivals','The daily classification and hourly regression are separately trained models; category may differ from a threshold applied to summed hourly estimates'],
 'scenarios':scenarios}
(R/'real_scenarios.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print('Generated',len(scenarios),'scenarios; held-out days:',heldout.groupby(['bank','week','weekday']).ngroups)
