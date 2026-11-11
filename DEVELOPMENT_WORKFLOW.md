# Compass Bank Development and QA Workflow

## Branches
- `main`: existing baseline, unchanged until QA approval.
- `development/compass-phase4o`: staging branch for the Phase 4O source snapshot and subsequent improvements.

## Roles and change control
- Developer/ML engineer (ChatGPT): propose a scoped change, review relevant code, implement on a feature branch, describe changes and limits, and provide repeatable tests.
- QA (project owner): test the change locally and report PASS/FAIL with screenshots or error messages.
- Changes to the repository require the owner's approval before writing. Merge into `main` only after explicit QA approval.
- Never commit live customer data, real personal details, passwords, tokens, `.env`, or local database exports.

## Next development target
Unify the appointment calendar and experimental traffic calendar in the existing customer and employee UIs. Support month/week/day, predicted vs scheduled totals with unambiguous labels, selection of date then available hour, and backend slot validation. Maintain the booking/approval workflow.

## ML data integrity
Historical external-bank observations must retain source provenance. No fabricated historical dates. Scheduled bookings are inputs/counts, **not** proof of actual visits. Train on verified arrivals/check-ins (and walk-in counts if total branch traffic is the target), using validation and held-out evaluation.

## Phase 4O status
The repository's earlier `main` only contained an outdated frontend. A complete Phase 4O source snapshot still needs to be synchronized from the user's locally tested ZIP; this branch does not yet contain that snapshot. The standalone traffic widget is a prototype and is not the intended final unified UX.
