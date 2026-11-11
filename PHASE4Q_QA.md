# Phase 4Q-A — Verified arrivals (QA checklist)

## Status
Feature branch: `feature/phase4q-verified-visits`. Draft PR: pending QA. **Do not merge until explicit PASS and authorization.**

## Safety before testing
**Use a disposable/test MySQL database with test customer appointments.** Do not record invented check-ins or walk-ins in the real study database: these events persist and would contaminate future training data. Never commit `.env`, database backups, or customer PII.

1. In GitHub Desktop, Fetch origin and switch to `feature/phase4q-verified-visits`.
2. Point your local `backend/.env` at the **test** MySQL database. Keep it local.
3. Back up that database, then use MySQL Workbench to execute `backend/migrations/phase4q_verified_visits.sql` once. This adds a table; it does not delete existing appointments. Make sure the existing `appointment_status_history` table and appointment statuses `confirmed`, `checked_in`, `completed`, and `no_show` are supported by the test database.
4. From `backend`, run `npm install` (first run) and `node server.js`. Sign into `http://localhost:3000/employee/`.
5. Select **Calendar**. Scroll to **Verified branch arrivals**.

## Employee UI checks

**QA-A1 — empty baseline**
- Before recording any arrival, verified total should be 0 if the test database has no earlier events. Scheduled booking counts remain separate.
- Refresh; no demo or synthetic arrival rows should appear.

**QA-A2 — walk-in entry**
- Set observed walk-in count 2 and check the confirmation box (on the TEST database only).
- Click **Record walk-ins**, then confirm the dialog.
- Expect +2 walk-ins in the current Manila date/hour and +2 total.
- Hard refresh; count remains.
- Try count 0, 51, fractional 1.5 and unchecked confirmation: must reject.

**QA-A3 — appointment check-in**
- Create or find a test appointment scheduled **today in Asia/Manila**, approve it.
- Open its Details and click **Record check-in** once.
- Expected: status **Checked In**; exactly +1 checked-in/verified total; persists after refresh.
- Reattempt through the API or revisit: a second check-in must be rejected with HTTP 409 and no new count. No generic `PATCH /appointments/:id/status` path should set `checked_in` without recording the visit.
- A future-day, pending, cancelled or no-show booking must not be checked in.
- Click **Complete service** for the checked-in test booking. It should remain a single verified arrival.

**QA-A4 — no-show**
- Use an approved **test** appointment whose scheduled hour has already passed.
- Open Details, click **Mark no-show**, confirm.
- Expected: appointment status **No Show**; no-show tally +1; verified arrival tally unchanged.
- A future appointment cannot be marked no-show.

**QA-A5 — hourly CSV and privacy**
- Click **Export verified hourly CSV**.
- Expect columns `date,hour_start,checked_in,walk_ins,verified_total`, with no customer name, email, phone, account number, or appointment reference.
- Verify hourly total equals checked-in plus walk-in count, and each date/hour has one row.
- The exported rows are **observed-hour groups only**; absent hours must not be silently interpreted as zero visits.

**QA-A6 — authorization**
- After logging out, direct visits to `/api/employee/visits/hourly` and `/api/employee/visits/hourly.csv` must return HTTP 401.
- Anonymous POST requests to check-in/walk-ins must return HTTP 401.

**QA-A7 — regression**
- Repeat Phase 4P booking, approval, month/week/day calendar navigation and experimental forecast-unavailable state.
- Confirm customer-facing booking remains unaffected.
- A real `.env` must not be committed.

## Limitations and scientific integrity
- New records are employee-entered operational observations; employee confirmation is not independent proof of physical arrival.
- No-show status is not a customer visit and is never added to verified hourly counts.
- No automatic model training or automatic prediction claims in Phase 4Q-A.
- Hourly export is suitable as a local-data **candidate**, not a sufficiently large validated training dataset. Additional quality checks, data provenance, and holdout evaluation are required before model retraining.
- `verified_visit_events` has no names, contact details, account numbers; appointment references are retained only to prevent double check-in.
- Timestamps for event records use Asia/Manila; do not backdate visits or fabricate historical samples.
- This change is NOT complete until the owner performs the SQL migration and the above tests on a test DB.

## Rollback
Check out `development/compass-phase4o` in GitHub Desktop. A rollback of source code **does not delete visit events** already written into the test database.
