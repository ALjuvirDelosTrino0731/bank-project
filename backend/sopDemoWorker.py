"""Persistent line-delimited JSON model worker for Compass Bank research demonstrations.
Loads the existing trained models only once. Never writes to the database.
"""
import json
import sys


def send(obj):
    sys.stdout.write(json.dumps(obj, allow_nan=False, separators=(',', ':')) + '\n')
    sys.stdout.flush()

try:
    import sopDemoPredict as model
except Exception as exc:
    send({'status': 'fatal', 'message': 'Could not load trained research model', 'detail': str(exc)})
    sys.exit(1)

send({'status': 'ready'})
for line in sys.stdin:
    if not line.strip():
        continue
    req_id = None
    try:
        request = json.loads(line)
        req_id = request.get('request_id')
        if not isinstance(req_id, int):
            raise ValueError('Missing request ID')
        mode = request.get('mode')
        d = model.check_day(request.get('date'))
        # Existing prediction functions only call model.show to produce JSON.
        # Attach the ID so concurrent Node requests match the correct output.
        model.show = lambda obj: send(dict(obj, request_id=req_id))
        if mode == 'forecast':
            model.do_forecast(d)
        elif mode == 'nowcast':
            values = request.get('counts')
            if not isinstance(values, list) or len(values) != 3 or any(
                type(v) is not int or v < 0 or v > 10000 for v in values
            ):
                raise ValueError('Three valid observed integer counts are required')
            model.do_nowcast(d, values)
        else:
            raise ValueError('Unknown prediction mode')
    except Exception as exc:
        send({'status': 'error', 'request_id': req_id, 'message': str(exc)})
