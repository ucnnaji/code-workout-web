# Code Workout — v4.0.5 remote self-enrollment build

This build keeps the existing Express + Supabase + Render architecture and applies the requested participant/admin workflow changes without replacing the question bank or approved consent content. It also adds a versioned question-bank release mechanism and burst-load hardening without changing the current question text or consent wording.

## Participant flow

Research Information → Consent → Create Study Access → Pre-survey → Practice Environment Demo → Confirm Language → Four Practice Questions → Post-survey → Incentive → Completion.

After consent, a participant chooses a non-identifying Participant ID and selects Python or Java. The server generates a Private Access Key, displays it once, stores only its salted hash, signs the participant in, and carries the pre-consent decision into the newly created study session. Returning participants use the same Participant ID and Private Access Key.

The pre- and post-surveys keep the supplied item IDs, order, options, and scoring. Only the programming-language wording is adapted between Python and Java.

The participant question bank and consent wording in this package are intentionally unchanged from the supplied current codebase. Release hashing now includes the current question bank and study design configuration as well as consent/surveys/input schemas, so changing reviewed content invalidates the recorded release hash for new live enrollment.

For this remote deployment build, participant self-enrollment is operationally enabled when the saved study configuration has `deliveryMode=remote`, Render has `LIVE_COLLECTION_ENABLED=true`, and deployment startup checks pass. The participant must still accept the current consent, provide a signature, choose Python or Java, pass Participant ID validation and rate limits, and save the generated Private Access Key. Only the salted key hash is stored.

The practice sequence uses four questions total: two questions in the assigned primary modality, then one question in each remaining modality. Later modalities are server-locked until the earlier modality is complete.

Problem Solving and Debugging use the sandbox Run Code workflow and show a visible 0–100 score. Code Explanation has a read-only code box and explanation field, with no Run Code/stdin/output panel; participants use Check Explanation to receive a score. The editor is intentionally compact and provides line numbers, syntax highlighting, indentation, bracket matching, undo/redo, and Format Code.

## Data and administration

Pre/post survey responses remain stored in Supabase `cw_stage_progress.responses`. The research dashboard now has dedicated CSV exports for pre-survey, post-survey, and combined pre/post survey datasets, plus the existing Excel workbook export.

The admin dashboard also shows live-enrollment readiness, release-review controls, the Render live-collection switch state, and a global duplicate-entry protection control. With duplicate protection enabled, finalizing the first research question records an entry lock. Existing participant/session uniqueness remains enforced by the database, and an active locked session must be resumed before another wave can start.

## Code execution

The earlier Judge0-compatible sandbox path is restored. Runtime IDs can be supplied explicitly or discovered from the Judge0 `/languages` endpoint. The default compatible endpoint is `https://ce.judge0.com`; for live research, configure the execution service covered by the approved data-handling plan.

Required/important execution variables:

```text
EXECUTION_PROVIDER=judge0
JUDGE0_URL=https://ce.judge0.com
JUDGE0_PYTHON_ID=        # optional; discovered when blank
JUDGE0_JAVA_ID=          # optional; discovered when blank
JUDGE0_AUTH_TOKEN=       # optional for private Judge0
JUDGE0_RAPIDAPI_KEY=     # optional when applicable
```

All three modalities are scored by the configured OpenAI model. For Problem Solving and Debugging, the scorer receives the student source plus the actual sandbox status/output/compile/runtime evidence; for Code Explanation, it receives the displayed code and the student's explanation. There are no invented hidden answer keys in this build. Score records and scoring metadata are saved with the final submission.

## Deployment

1. Back up Supabase.
2. Run **one** generated migration entry point in Supabase SQL Editor: `supabase_upgrade.sql`. (`supabase_setup.sql` and `supabase_workflow.sql` are identical aliases.)
3. Push the contents of this folder to the existing GitHub repository and deploy the latest commit on Render.
4. Keep the existing private variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `PUBLIC_ORIGIN`, `PII_ENCRYPTION_KEY`, `ADMIN_TOKEN`, `COMPENSATION_ADMIN_TOKEN`, `OPENAI_API_KEY`, and `OPENAI_MODEL`, plus the sandbox variables above.
5. For remote participant self-enrollment, set `deliveryMode` to `remote` in the saved study configuration and set `LIVE_COLLECTION_ENABLED=true` in Render. Students can then create their own Participant ID and one-time-display Private Access Key from the public study page. The release-review checklist remains available to researchers as an administrative record.
6. Use `/health` for setup diagnostics and `/readyz` for strict database readiness. Render liveness remains `/healthz`.

## Verification

```bash
npm test
npm run build:verify
python scripts/browser_test.py
```

`build:verify` regenerates all three SQL aliases, runs JavaScript/JSON checks, validates the draft study configuration, and runs a requested-modification regression check. The browser test is offline and uses an in-memory API; it does not contact Supabase, OpenAI, Judge0, or real participant data.

## Consent/course-credit note

The supplied consent content is deliberately retained byte-for-byte rather than silently rewritten. In particular, declining participation does not automatically award course credit; the participant page directs students to the approved comparable non-research option.


## Updating questions safely

See `docs/QUESTION_BANK_UPDATES.md`. Edit `questions.seed.json`, regenerate/verify the migration, review the new content hash, and deploy the matching SQL + application release. Existing sessions remain pinned to their recorded question-bank release.

## Scale/security verification

Run `npm run test:security` and `npm run test:load`; see `docs/SCALABILITY_SECURITY_REVIEW.md` for scope and limitations.

## Production capacity profile

`render.yaml` now targets the Render `2c-4g` web-service compute plan (the current Pro-equivalent plan ID). Outbound OpenAI and Judge0 work remains bounded per Node process so a participant burst cannot create an unbounded number of sockets or in-memory provider operations. `npm run test:load` defaults to 500 simulated concurrent users. This is a process-level stress test with mocked external providers, not a guarantee of OpenAI, Judge0, Supabase, or campus-network capacity; rehearse the exact deployed stack before a large scheduled lab.
