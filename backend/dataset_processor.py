"""COMPASS_ADMIN_V4 — conservative CSV/XLSX validator and cleaner.

Supports legacy arrival-event uploads and 2026-style simulated slot-count uploads.
Never treats generated rows as observed measurements or retrains the ML models.
"""
import csv
import io
import json
import re
import sys
from collections import Counter
from datetime import date, datetime, time
from pathlib import Path

DAYS = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
EVENT_FIELDS = {'bank', 'week', 'weekday', 'arrival_time_hhmm'}
SLOT_FIELDS = {'date', 'slot_index', 'customer_count'}
MAX_ROWS = 100_000


def read_data(path):
    if path.suffix.lower() == '.csv':
        with path.open('r', encoding='utf-8-sig', newline='') as f:
            reader = csv.DictReader(f)
            raw_header = reader.fieldnames or []
            raw_rows = list(reader)
    elif path.suffix.lower() == '.xlsx':
        try:
            import openpyxl
        except ImportError:
            raise ValueError('XLSX uploads require openpyxl. Install with: python -m pip install openpyxl')
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        if len(wb.worksheets) != 1:
            raise ValueError('Only one-sheet XLSX tables are accepted. Multiple sheets require an explicit verified import process.')
        it = wb.active.iter_rows(values_only=True)
        raw_header = list(next(it, ()))
        raw_rows = [dict(zip(raw_header, row)) for row in it]
        wb.close()
    else:
        raise ValueError('Only CSV or XLSX inputs are supported')
    if len(raw_rows) > MAX_ROWS:
        raise ValueError(f'Upload exceeds the {MAX_ROWS:,}-row limit')
    headers = [str(h or '').strip() for h in raw_header]
    if any(not h for h in headers) or len(set(headers)) != len(headers):
        raise ValueError('Blank or duplicate column names detected. Give every column a unique header.')
    if any(h.startswith('Unnamed:') for h in headers):
        raise ValueError('Unnamed column detected. Remove index columns before upload.')
    rows = []
    for row in raw_rows:
        clean = {str(k or '').strip(): v for k,v in row.items() if k is not None}
        rows.append(clean)
    return headers, rows


def parse_time(value):
    if isinstance(value, datetime): return value.strftime('%H:%M')
    if isinstance(value, time): return value.strftime('%H:%M')
    text = str(value or '').strip()
    for fmt in ('%H:%M','%H:%M:%S','%I:%M %p'):
        try: return datetime.strptime(text, fmt).strftime('%H:%M')
        except ValueError: pass
    return None


def parse_date(value):
    if isinstance(value, datetime): return value.date().isoformat()
    if isinstance(value, date): return value.isoformat()
    text = str(value or '').strip()
    try:
        d = date.fromisoformat(text)
        if d.isoformat() == text: return text
    except ValueError:
        pass
    return None


def whole(value):
    if isinstance(value, bool): return None
    if isinstance(value, int): return value
    if isinstance(value, float): return int(value) if value.is_integer() else None
    text = str(value or '').strip()
    if re.fullmatch(r'\d+',text): return int(text)
    return None


def safe_str(value):
    return '' if value is None else str(value).strip()


def process(path):
    headers,rows = read_data(Path(path))
    columns = set(headers)
    if EVENT_FIELDS.issubset(columns): schema='arrival_events'
    elif SLOT_FIELDS.issubset(columns): schema='slot_counts'
    else:
        raise ValueError('Unsupported dataset columns. Use bank, week, weekday, arrival_time_hhmm OR date, slot_index, customer_count (weekday optional). Missing fields cannot be inferred.')
    valid,flagged = [],[]
    seen_slots=set()
    seen_days=set()
    counts=Counter()
    detected_simulated=False
    for ix,row in enumerate(rows,2):
        out={h:safe_str(row.get(h)) for h in headers}
        errors=[]
        if schema=='arrival_events':
            bank=out['bank'];w=whole(row.get('week'))
            weekday=out['weekday'].lower()
            parsed=parse_time(row.get('arrival_time_hhmm'))
            if not bank:errors.append('Missing bank')
            if w is None or not 1<=w<=53:errors.append('Week must be 1–53')
            if weekday not in {d.lower() for d in DAYS}:errors.append('Unrecognized weekday')
            if parsed is None:errors.append('Arrival time missing or ambiguous (HH:MM, HH:MM:SS, 9:00 AM supported)')
            if not errors:
                if parsed!=out['arrival_time_hhmm']:counts['normalized_time']+=1
                out.update({'bank':bank,'week':str(w),'weekday':weekday.title(),'arrival_time_hhmm':parsed})
                seen_days.add((bank,w,weekday))
        else:
            day=parse_date(row.get('date'));slot=whole(row.get('slot_index'));amount=whole(row.get('customer_count'))
            if day is None:errors.append('Invalid date: use YYYY-MM-DD (do not invent dates)')
            if slot is None or not 1<=slot<=24:errors.append('Slot index must be an integer from 1 to 24')
            if amount is None or not 0<=amount<=1_000_000:errors.append('Customer count must be a non-negative integer <= 1000000')
            if day and 'weekday' in out and out['weekday']:
                expected=date.fromisoformat(day).strftime('%A')
                if out['weekday'].lower()!=expected.lower():errors.append(f'Weekday/date mismatch: expected {expected}')
                else:out['weekday']=expected
            if day and slot:
                key=(day,slot)
                if key in seen_slots:errors.append('Repeated date/slot pair: review possible duplicate aggregate')
            if not errors:
                seen_slots.add((day,slot));seen_days.add(day)
                out.update({'date':day,'slot_index':str(slot),'customer_count':str(amount)})
            if out.get('record_type','').lower() in ('simulated','synthetic'):
                detected_simulated=True
        if errors:
            flagged.append({'csv_line':ix,'reason':'; '.join(errors),**out})
        else:
            valid.append(out)
    warnings=[
        'Dataset authenticity and bank ownership are NOT verified by this validator.',
        'No automatic model retraining or approved Philippine bank forecast is performed.',
        'Cleaned output excludes flagged rows. Review every flagged row before research use.',
    ]
    if schema=='arrival_events':
        warnings += [
          'Arrival-event CSV/XLSX has no verified calendar date. Calendar forecasts remain blocked.',
          'Do not assume repeated arrival times are duplicates: multiple customers may arrive together.',
        ]
    else:
        warnings += [
          'Numbered slots are NOT verified 9 AM–5 PM hours. This upload does not establish true hourly arrivals.',
          'Counts are slot aggregates; duplicate date/slot values are flagged, not summed automatically.',
        ]
        if detected_simulated:
            warnings.append('Input explicitly labels records as simulated. Outputs must retain that designation.')
        else:
            warnings.append('Input has no verified origin flag; do not describe it as observed bank-arrival data.')
    if len(seen_days)<10:warnings.append('Fewer than ten distinct dates/bank-days; below exploratory demonstration threshold.')
    if flagged:warnings.append(f'{len(flagged)} rows flagged and excluded. Download and inspect flagged rows.')
    status='compatible_for_hourly_aggregation' if schema=='arrival_events' and valid and len(seen_days)>=10 else 'compatible_for_slot_analysis' if schema=='slot_counts' and valid and len(seen_days)>=10 else 'not_fit_for_analysis'
    report={
      'status':status,'schema':schema,'ready_for_training':False,'calendar_forecasting_allowed':False,
      'input_rows':len(rows),'clean_rows':len(valid),'flagged_rows':len(flagged),
      'observation_days':len(seen_days),'time_values_normalized':counts['normalized_time'],
      'source_kind':'simulated (user-declared)' if detected_simulated else 'not independently verified',
      'required_columns':sorted(EVENT_FIELDS if schema=='arrival_events' else SLOT_FIELDS),
      'warnings':warnings,
    }
    return headers,valid,flagged,report


def csv_text(fields,rows):
    buf=io.StringIO();writer=csv.DictWriter(buf,fieldnames=fields,extrasaction='ignore',lineterminator='\n');writer.writeheader();writer.writerows(rows);return buf.getvalue()

if __name__=='__main__':
    try:
        headers,clean,flagged,report=process(sys.argv[1])
        folder=Path(sys.argv[2]);folder.mkdir(parents=True,exist_ok=True)
        (folder/'cleaned.csv').write_text(csv_text(headers,clean),encoding='utf-8-sig')
        (folder/'flagged.csv').write_text(csv_text(['csv_line','reason']+headers,flagged),encoding='utf-8-sig')
        (folder/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps({'ok':True,'report':report}))
    except Exception as exc:
        print(json.dumps({'ok':False,'error':str(exc)}))
        sys.exit(1)
