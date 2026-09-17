# Compensation / Incentive Stage Fix

## Symptom
After completing crossover, clicking **Continue to incentive** displayed:

`This stage is not editable.`

## Root cause
The browser correctly finalized the active `crossover` stage, but the API stage-save handler only recognized `coding` as a practice stage. As a result, a valid crossover completion request fell through to the generic non-editable-stage error before the database could advance the workflow to `incentive`.

## Fix
`lib/app.mjs` now treats both `coding` and `crossover` as practice stages when finalizing stage progress.

The database workflow already contained crossover completion validation and the transition to incentive, so no SQL migration is required for this fix.

## Verification
- npm test: PASS (38 passed, 0 failed, 1 optional DB integration test skipped)
- npm run build:verify: PASS
- npm run test:security: PASS
- npm run test:browser: PASS

After deployment, use a fresh or existing test session that reaches crossover. Complete both crossover modalities and click **Continue to incentive**. The Incentive page should open instead of showing the non-editable-stage toast.
