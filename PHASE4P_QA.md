# Phase 4P — Unified Calendar QA

## Scope
Feature branch: `feature/phase4p-unified-calendar`

The customer appointment calendar now includes Month / Week / Day navigation, experimental traffic summaries and selectable time slots. The employee Calendar tab now combines actual appointment counts with experimental scenario estimates in one view. The separate duplicate traffic widgets have been removed from these screens.

## Setup
1. In GitHub Desktop fetch, then check out `feature/phase4p-unified-calendar`.
2. **Do not commit** local research datasets or environment files. For local testing only, copy the working `.env` into `backend/.env`, and the previously verified real-data `real_scenarios.json` into `ml/real_scenarios.json`. These are not part of the public Git repository.
3. From `backend`, run `npm install` (first run) and `node server.js`.
4. Open `http://localhost:3000/customer/` and `http://localhost:3000/employee/`.

## Customer tests
- Open Schedule New Appointment: exactly **one** calendar in the form; no second Traffic Calendar section.
- Switch Month -> Week -> Day. Month shows an experimental estimate on modeled weekdays; week/day totals update. Weekends show `Not modeled`.
- Select a date within the next 14 days; Day opens showing hours 9 AM–5 PM; choose a future hour. The appointment date/time fields update.
- Switch to another date; previous time selection must clear.
- Hours 3 PM–5 PM are **not modeled** by the external bank dataset, but backend booking validation still applies.
- Submit a valid **Cash Deposit** test booking. Expect pending status and reference number. Do not use real customer personal information in testing.
- Try a past time or a full slot: backend must reject with a controlled warning.
- With `ml/real_scenarios.json` absent, the calendar must state that experimental estimates are unavailable; booking must still function.

## Employee tests
- Login and open Calendar: exactly one calendar.
- Switch Month / Week / Day. The number of **scheduled** (non-cancelled, non-no-show) appointments changes with period; experimental visits remain **separate**.
- Click a date to switch to Day and inspect the hour rows. Click an appointment to open its details.
- Change the research bank selector; experimental estimates may change, but scheduled appointment totals must not change.
- Approve a pending booking, hard-refresh, verify status remains approved and the counts persist.
- Try with real_scenarios.json absent: experimental count should say unavailable and appointment counts should still work.

## Scientific/data limitations
- Scenario estimates use historical external Nigerian bank observations, not verified dates from the selected Philippine bank.
- They are not validated future forecasts. Week/month counts sum repeated weekday scenarios, and do not represent observed or scheduled customers.
- Booking creation is **not** evidence of a customer arrival. It is not yet retraining either ML model.
- Existing server capacity, date-window, branch-closure and service checks remain the final authority.
- This is **not** a complete browser/database test; the owner must report PASS or FAIL before any merge.

## Rollback
Return to `development/compass-phase4o` in GitHub Desktop; no changes are made to `main`.
