"""Offline simulated-data inference. No bank arrival / operational claims."""
import sys, json
from pathlib import Path
import joblib
import pandas as pd
from datetime import date

base = Path(__file__).resolve().parent.parent / "ml-models" / "sop-demo" / "results"
pack = joblib.load(base / "models.joblib")

def show(obj):
    print(json.dumps(obj,allow_nan=False))

def check_day(s):
    d=date.fromisoformat(s)
    if d.isoformat()!=s or d.weekday()>4 or not 2026<=d.year<=2027:
        raise ValueError("Use a valid Monday-Friday date in 2026-2027")
    return d

def probs(model,row):
    vals=model.predict_proba(row)[0]
    return {str(cls):round(float(p),5) for cls,p in zip(model.classes_,vals)}

def do_forecast(d):
    w,m=d.weekday(),d.month
    row=pd.DataFrame([[w,m]],columns=["weekday_number","month"])
    cls=pack["classifier"]
    predicted=str(cls.predict(row)[0])
    samples=pd.DataFrame([[w,m,i] for i in range(1,9)],columns=["weekday_number","month","slot_index"])
    counts=pack["regressor"].predict(samples)
    show({"status":"ok","date":d.isoformat(),"traffic_category":predicted,
          "class_probabilities":probs(cls,row),
          "estimated_slots":[{"slot":i,"estimated_count":round(max(0,float(n)),1)} for i,n in enumerate(counts,1)],
          "estimated_slot_count_total":round(float(sum(counts)),1),
          "mode":"Simulated research PRE-VISIT forecast, unvalidated for real operations",
          "warning":"Pre-visit classification was only 24.24% accurate on a simulated holdout; clock times unverified."})

def do_nowcast(d,counts):
    w,m=d.weekday(),d.month
    x=pd.DataFrame([[w,m]+counts],columns=["weekday_number","month","slot_1","slot_2","slot_3"])
    cls=pack["nowcast"]
    show({"status":"ok","date":d.isoformat(),"traffic_category":str(cls.predict(x)[0]),
          "class_probabilities":probs(cls,x),
          "mode":"Simulated research EARLY-DAY nowcast, not a pre-visit forecast",
          "warning":"Requires first three observed slot counts; 72.73% exploratory test accuracy is not validated for real bank operations."})

if __name__=="__main__":
    try:
        if len(sys.argv)<3:raise ValueError("Expected mode and date")
        mode=sys.argv[1]
        d=check_day(sys.argv[2])
        if mode=="forecast" and len(sys.argv)==3:
            do_forecast(d)
        elif mode=="nowcast" and len(sys.argv)==6:
            counts=[int(v) for v in sys.argv[3:6]]
            if any(v<0 or v>10000 for v in counts):raise ValueError("Invalid slot count")
            do_nowcast(d,counts)
        else:raise ValueError("Invalid mode or arguments")
    except Exception as ex:
        print(json.dumps({"status":"error","message":str(ex)}),file=sys.stderr)
        sys.exit(1)
