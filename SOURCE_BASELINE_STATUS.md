# Phase 4O reviewed source baseline — synchronization status

**Status:** The reviewed Phase 4O application source files are prepared as a separate source-only ZIP and **have not yet been imported into this branch**. This file documents the intended import and research-data exclusions; do not describe the repository as fully synchronized until GitHub Desktop finishes the source commit.

## Import instructions

1. Check out `development/compass-phase4o` in GitHub Desktop.
2. Extract the reviewed `compass_phase4o_public_source_reviewed.zip` into a temporary folder.
3. Copy its contents into the cloned repository root, without replacing `.git`.
4. Review GitHub Desktop changes, confirm no `.env`, private data, research observations or generated evaluation artifacts are staged, then commit and push.
5. Keep `main` unchanged pending QA approval.

## Excluded publication materials

- `ml/hourly_observed_counts.csv`
- `ml/real_scenarios.json`
- `admin bank/admin bank/compass-bank-admin-updated/research-evaluation/` (research CSVs, charts, report)
- Any synthetic forecasts/results, `.env`, `node_modules`, local databases and customer data

Research artifacts should stay local pending provenance, redistribution permission, and reproducibility review. Consequently ML research UI/traffic explorer may have missing-data states when run from a fresh public source checkout.

## Test scope completed on the prepared snapshot

- 18 JavaScript files: `node --check` passed.
- 2 Python files: syntax compilation passed.
- JSON source files: parsing checks passed.
- No live MySQL or browser integration test has been performed on this source-only public snapshot.

## Next development target

Phase 4P: unified appointment and traffic calendar, with strict distinction between verified appointments, observed visits, and experimental model estimates.
