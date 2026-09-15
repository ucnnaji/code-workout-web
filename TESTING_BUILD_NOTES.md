# Code Workout Testing Build — v4.0.7

## Baseline
This build was created directly from the user-provided `code-workout-web-main (3).zip` baseline. Existing working behavior was preserved unless a change was required by the requested research updates.

The newer Java question edits already present in the uploaded baseline were preserved. The question bank was not replaced wholesale with an older generated bank.

## Requested changes included

### 1. Programming Self-Efficacy survey
- Replaced the 10-item General Self-Efficacy Scale with an IPSES-derived/adapted programming self-efficacy measure.
- Each session uses 6 common programming self-efficacy items plus 2 session-specific items.
- Session 1 uses loops/control-flow items; Session 2 uses functions/methods; Session 3 uses lists/arrays.
- Uses a 7-point Strongly disagree to Strongly agree response scale.
- Pre- and post-surveys use the same 8 programming self-efficacy items within each session.
- Scoring stores the overall mean, six-item core mean, and two-item topic mean without imputing skipped responses.

### 2. Research flow
Participant sequence is now:

`Information → Consent → Language → Pre-survey → Demo → Practice 1 → Practice 2 → Post-survey → Crossover → Incentive → Complete`

- The first two questions use the initially assigned modality.
- The post-survey is required before crossover becomes available.
- Crossover then presents one question from each of the two remaining modalities.
- Server/API and Supabase workflow logic enforce the sequence, not only the browser UI.

### 3. Runtime-input seed questions removed
Only the previously identified question definitions that required participant-provided stdin were removed:
- Python: `PY-PS-18`, `PY-PS-19`, `PY-PS-20`, `PY-DBG-18`, `PY-DBG-19`, `PY-DBG-20`, `PY-TRC-18`, `PY-TRC-19`, `PY-TRC-20`
- Java: `JA-PS-02`, `JA-DBG-02`, `JA-TRC-02`

The resulting bank contains 108 questions. All other question edits in the uploaded baseline were retained.

### 4. Stable AI scoring for identical responses
- Judge0 still executes each Run request.
- Before requesting a new AI grade, the application computes a deterministic scoring fingerprint from the scoring policy/model/prompt version, task/version, language, modality, student response, expected concepts, and stable execution evidence.
- If the same assignment already has a completed score with the same fingerprint, that score is reused instead of requesting another OpenAI grade.
- Changed code, changed explanation, changed task/version, changed model/prompt, or changed execution evidence results in a new AI score request.
- Returned score metadata records whether a score was reused and the source operation ID when applicable.

## Database update
Run **one** generated SQL entry point after backing up Supabase:
- `supabase_upgrade.sql` (recommended for the existing project)
- `supabase_setup.sql`
- `supabase_workflow.sql`

The three generated SQL files are intentionally identical. Do not run all three.

The migration adds the `score_cache_get` workflow operation needed for stable score reuse and updates the workflow for the post-survey-before-crossover sequence.

## Verification performed
- `npm run build:verify` — PASS
- `npm test` — 38 passed, 0 failed, 1 optional Postgres-compatible integration test skipped
- `npm run test:security` — PASS
- `npm run test:browser` — PASS

The skipped integration test requires its optional Postgres-compatible test environment. A live Render + Supabase + Judge0 + OpenAI pilot is still recommended before participant collection.

## Important research note
This is a testing build. The adapted programming self-efficacy instrument and the post-survey-before-crossover procedure differ from the earlier approved study description. Confirm the final instrument/procedure with the PI/IRB before live research collection.


### 5. AI grading diagnostics
- Server logs now emit a privacy-limited `ai_grading_failed` event when grading fails, without logging API keys, participant IDs, or full student responses.
