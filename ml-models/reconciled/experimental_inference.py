"""Experimental inference from reconciled bank-arrival models.

Inputs are historical observation positions, not calendar dates.
Only bank IDs 1-3, day positions 1-5, and hours 8-14 are supported.
"""

import json
import math
import sys
from pathlib import Path

import joblib
import pandas as pd


MODELS = Path(__file__).resolve().parent / "trained"


def valid_integer(value, minimum, maximum, name):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(
            f"{name} must be an integer between {minimum} and {maximum}"
        )
    return value


def predict(payload):
    if not isinstance(payload, dict):
        raise ValueError("Request must be a JSON object")

    bank_id = valid_integer(payload.get("bank_id"), 1, 3, "bank_id")
    day_position = valid_integer(
        payload.get("day_position"), 1, 5, "day_position"
    )

    selected_hour = payload.get("hour")

    if selected_hour is not None:
        selected_hour = valid_integer(
            selected_hour, 8, 14, "hour"
        )

    classification = joblib.load(
        MODELS / "classification_reconciled.joblib"
    )
    regression = joblib.load(
        MODELS / "regression_reconciled.joblib"
    )

    if classification["features"] != ["bank_id", "day_position"]:
        raise ValueError("Unexpected classification model features")

    if regression["features"] != [
        "bank_id", "day_position", "hour"
    ]:
        raise ValueError("Unexpected regression model features")

    cls_input = pd.DataFrame([{
        "bank_id": bank_id,
        "day_position": day_position
    }])

    traffic_level = str(
        classification["model"].predict(cls_input)[0]
    )

    if traffic_level not in ("Low", "Moderate", "High"):
        raise ValueError("Unexpected traffic classification result")

    hours = list(range(8, 15))

    reg_input = pd.DataFrame([{
        "bank_id": bank_id,
        "day_position": day_position,
        "hour": hour
    } for hour in hours])

    predictions = regression["model"].predict(reg_input)

    hourly = []

    for hour, prediction in zip(hours, predictions):
        value = float(prediction)

        if not math.isfinite(value) or value < 0:
            raise ValueError("Invalid regression prediction")

        hourly.append({
            "hour_start": f"{hour:02d}:00",
            "estimated_customers": round(value, 1)
        })

    selected = next(
        (item for item in hourly
         if int(item["hour_start"][:2]) == selected_hour),
        None
    ) if selected_hour is not None else None

    return {
        "status": "experimental_model_inference",
        "model_version": "reconciled_419",
        "bank_id": bank_id,
        "day_position": day_position,
        "traffic_level": traffic_level,
        "observed_hours": hourly,
        "selected_hour_prediction": selected,
        "estimated_observed_hours_total": round(
            sum(item["estimated_customers"] for item in hourly), 1
        ),
        "source": "Four weeks of Nigerian bank-arrival observations",
        "limitation": (
            "Experimental historical-observation scenario only. "
            "Day positions are not verified weekdays or calendar dates. "
            "Supported observations cover 08:00-14:59 only. "
            "Not validated for future Philippine branch forecasting."
        )
    }


def main():
    try:
        payload = json.loads(sys.stdin.read())
        result = predict(payload)
        print(json.dumps({"ok": True, "result": result}))
        return 0
    except (
        ValueError, TypeError, KeyError, OSError,
        json.JSONDecodeError
    ) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
