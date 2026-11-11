"""Conservative Compass Bank CSV/XLSX dataset cleaner. No invented dates/visits."""
import csv, io, json, sys, re
from collections import Counter
from datetime import datetime, time
from pathlib import Path

DAYS={'monday','tuesday','wednesday','thursday','friday','saturday','sunday'}
REQUIRED={'bank','week','weekday','arrival_time_hhmm'}

def time_parse(v):
    if isinstance(v,(datetime,time)):
        return v.strftime('%H:%M'), 'Excel time'
    s=str(v or '').strip()
    if not s:return None,'Missing arrival time'
    for fmt in ('%H:%M','%H:%M:%S','%I:%M %p'):
        try:return datetime.strptime(s,fmt).strftime('%H:%M'),'Formatted time'
        except ValueError:pass
    # H.MM is intentionally NOT guessed for arbitrary uploads.
    return None,'Unrecognized time; ambiguous numeric times require review'

def process(path):
    path=Path(path)
    if path.suffix.lower()=='.csv':
        with path.open('r',encoding='utf-8-sig',newline='') as f:
            reader=csv.DictReader(f)
            headers=reader.fieldnames or []
            rows=list(reader)
    elif path.suffix.lower()=='.xlsx':
        try:import openpyxl
        except ImportError:raise ValueError('Excel import requires Python package openpyxl')
        wb=openpyxl.load_workbook(path,read_only=True,data_only=True)
        if len(wb.worksheets)!=1:raise ValueError('Multi-sheet Excel files need the verified bank-workbook importer; no automatic sheet assumptions')
        values=wb.active.iter_rows(values_only=True)
        headers=[str(x or '').strip() for x in next(values,())]
        rows=[dict(zip(headers,row)) for row in values]
    else:raise ValueError('Only .csv and .xlsx files are supported')
    missing=REQUIRED-set(headers)
    if missing:raise ValueError('Dataset unsuitable: missing required columns: '+', '.join(sorted(missing)))
    if len(rows)>100000:raise ValueError('Dataset exceeds the 100,000-row processing limit')
    valid=[];flagged=[];counts=Counter();days=set()
    for idx,row in enumerate(rows,2):
        clean={str(k): '' if v is None else str(v) for k,v in row.items() if k is not None}
        t,kind=time_parse(row.get('arrival_time_hhmm'))
        errors=[]
        bank=str(row.get('bank') or '').strip()
        weekday=str(row.get('weekday') or '').strip().lower()
        try:week=int(str(row.get('week') or ''))
        except ValueError:week=0
        if not bank:errors.append('Missing bank')
        if weekday not in DAYS:errors.append('Invalid weekday')
        if week<1 or week>53:errors.append('Invalid week')
        if t is None:errors.append(kind)
        if errors:
            flagged.append({'csv_line':idx,'reason':'; '.join(errors),**clean})
            continue
        clean['bank']=bank;clean['weekday']=weekday.title();clean['week']=str(week)
        if t!=str(row.get('arrival_time_hhmm') or '').strip():counts['time_values_normalized']+=1
        clean['arrival_time_hhmm']=t
        valid.append(clean);days.add((bank,week,weekday))
    accepted=bool(valid) and len(days)>=10
    warnings=['Uploaded data provenance is not independently verified.',
              'Calendar-date and holiday forecasting remain blocked without verified dates.',
              'No automatic model retraining is performed.',
              'This importer supports normalized single-table files, not the original 12 multi-sheet research workbooks.']
    if len(days)<10:warnings.append('Fewer than 10 distinct bank-days: below demonstration threshold, not suitable for training.')
    if flagged:warnings.append(f'{len(flagged)} rows excluded from cleaned output; see flagged download.')
    report={'status':'compatible_for_hourly_aggregation' if accepted else 'not_fit_for_hourly_aggregation',
      'ready_for_training':False,'calendar_forecasting_allowed':False,'input_rows':len(rows),'clean_rows':len(valid),
      'flagged_rows':len(flagged),'time_values_normalized':counts['time_values_normalized'],
      'observation_days':len(days),'warnings':warnings,
      'required_columns':sorted(REQUIRED)}
    return headers,valid,flagged,report

def csv_text(fields,rows):
    b=io.StringIO();w=csv.DictWriter(b,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows);return b.getvalue()

if __name__=='__main__':
    try:
        headers,clean,flagged,report=process(sys.argv[1]);dest=Path(sys.argv[2]);dest.mkdir(exist_ok=True,parents=True)
        (dest/'cleaned.csv').write_text(csv_text(headers,clean),encoding='utf-8-sig')
        (dest/'flagged.csv').write_text(csv_text(['csv_line','reason']+headers,flagged),encoding='utf-8-sig')
        (dest/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps({'ok':True,'report':report}))
    except Exception as e:
        print(json.dumps({'ok':False,'error':str(e)}))
        sys.exit(1)
