# COMPASS BANK — REAL-DATA ML SCENARIO PROTOTYPE

## Research Data

Source: Bishop et al. (2018), Data in Brief.
DOI: 10.1016/j.dib.2018.05.101

The project uses aggregated hourly customer-arrival observations from three Nigerian banks.

The dataset contains bank identifiers, observation weeks, weekdays, and hourly customer counts.

The historical observations do not contain verified calendar dates.

## Machine Learning Models

**Model 1 — Random Forest Classification**

Predicts Low, Moderate, or High daily customer traffic based on historical bank and weekday information.

**Model 2 — Random Forest Regression**

Estimates hourly customer counts using bank, weekday, and hour information.

## Training and Testing

- Training: Observation weeks 1–3 (45 bank-days).
- Held-out testing: Observation week 4 (15 bank-days).
- Modeled hours: 08:00–14:59.
- Traffic category thresholds are calculated using training observations only.

## Files

- `hourly_observed_counts.csv` — Aggregated historical observations.
- `build_real_scenarios.py` — Trains both Random Forest models and generates experimental scenarios.
- `real_scenarios.json` — Generated scenario estimates and their limitations.
- `requirements.txt` — Required Python packages.

## Running the Scenario Builder

From the project root:

```text
cd ml
py -m pip install -r requirements.txt
py build_real_scenarios.py
```

## Research Limitations

These models were trained using historical Nigerian banking observations, not verified traffic data from the selected Philippine bank branch.

Calendar dates selected in the interface are scenario inputs. They are not authentic dates from the historical dataset.

The models do not account for Philippine holidays, paydays, seasonal patterns, or other calendar-specific influences.

The results are experimental estimates and must not be presented as validated real-world forecasts.

The scenario builder does not independently generate held-out evaluation reports. Evaluation evidence must be produced and verified separately.

## Development Status

This is a research prototype. Its classification and regression outputs require further testing before they can be used for operational banking decisions.

No historical calendar dates have been fabricated. Synthetic demonstration results are excluded from this real-data ML staging folder.