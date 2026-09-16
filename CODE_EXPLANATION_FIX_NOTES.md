# Code Explanation display fix

This patch fixes blank Code Explanation code displays while preserving the existing v4.0.7 behavior, including the StableGrade cache-fallback diagnostics.

## What changed

1. `public/app.js`
   - Code Explanation now always displays the immutable `question_snapshot.starter_code` instead of allowing a blank saved `draft_code` to override it.
   - The same rule is applied when Monaco initializes after the assignment has already loaded.

2. `lib/app.mjs`
   - Existing task-specific Code Explanation prompts are preserved.
   - The generic explanation prompt is used only when a Code Explanation item has no prompt.
   - Existing StableGrade fallback/logging changes are retained.

3. `questions.seed.json`
   - `PY-TRC-07` previously had an empty `starter_code`; its two comparison programs were only embedded in the prompt.
   - It now has explicit read-only starter code, so every active Code Explanation item has code to display.

4. `scripts/requirements-check.mjs`
   - Regression checks now fail the build if any active Code Explanation item has blank starter code.

## Database update required

Yes. Because the canonical question bank changed, run the regenerated `supabase_upgrade.sql` once in Supabase after backing up the database.

The migration creates the new immutable question-bank release required by new sessions. Run only ONE generated SQL entry point; use `supabase_upgrade.sql`.

Existing already-created assignment snapshots are intentionally not rewritten. Test with a NEW participant/session after the SQL update and Render deployment.

## Validation completed

- `npm run build:verify` PASS
- `npm test` PASS: 38 passed, 0 failed, 1 optional database integration test skipped
- `npm run test:security` PASS
- `npm run test:browser` PASS
