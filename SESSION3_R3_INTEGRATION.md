# PracticeBridge Session 3 R3: integration and validation

## Status

**Integrated into this source archive; not deployed; not approved for public study use.**

This branch retains the original Session 1 and Session 2 assignments and preserves all original question IDs. Session 3 uses 80 new, versioned items (`PB3-PY-...-R3`, `PB3-JA-...-R3`) from 10 topic families. The app still assigns only **four items** to an individual participant: two in the initial assigned modality, then (after the post-survey) one in each other modality.

The Session 3 `open` flag is **false** in `config/study.json`. Do not set it to true until the tests below pass in your own staging deployment and any required research approvals are confirmed.

## Files changed

- `questions.seed.json`: appended 40 Python and 40 Java R3 student-facing questions. Original 144 items preserved. Each R3 item stores `family`, `question_set_version` and `entry_point` as non-sensitive assignment metadata.
- `config/study.json`: Session 3 now maps to the R3 IDs, with a `session3R3Allocation` selection rule; earlier session mappings and consent/surveys were not changed.
- `lib/session3-allocation.mjs`: deterministic four-item allocation selects **four distinct families**, with one of writing A/B variants per chosen family. Respects the leading modality and three-stage crossover order.
- `lib/session3-r3-grader.mjs`: server-side Python/Java harnesses for function-return, object, list/array, and state-change exercises. The first reference case is a **visible sample**; all later cases are hidden graded checks. These tests are run in the existing Judge0 sandbox.
- `lib/providers.mjs`: R3 writing and debugging are graded by executable hidden checks, not a free-form AI numeric grade. R3 explanation uses four separately scored rubric criteria (0, 10, 18 or 25 points each). Non-R3 scoring code remains unchanged.
- `lib/app.mjs`: on R3 code exercises, Run Code executes a sample harness and produces a readable sample result. The saved graded attempt is based on the separate hidden checks; failure to contact a grading service leaves the score unavailable. Existing stage/crossover logic is retained.
- `private/session3-r3/`: server-only test specifications and version mapping. Keep this directory **out of `public` and out of a public GitHub repository**. For a public repository, inject the two private JSON files using protected deployment secrets and set `PB3_R3_SPEC_DIR` to their containing directory. No reference solutions, hidden test cases, or instructor rubric anchors are in the database question seeds or browser-visible snapshots.
- `scripts/build-session3-r3.mjs` and `migrations/003_session3_r3.sql`: repeatable, additive database migration. Only creates/updates the 80 R3 question IDs and stores the new immutable bank snapshot.
- `scripts/build-migration.mjs`: avoids falsely tagging older sessions that lack a pinned bank hash with the *new* bank hash.
- `tests/session3-r3.test.mjs`: allocation, confidentiality, hidden-code grading, timeout handling and explanation-rubric tests.
- `scripts/r3-harness-smoke.mjs`: optional offline reference testing with local Python and the Java JDK. It does not use participant data.

## Database deployment

1. Back up the existing Supabase database and save the currently deployed source commit.
2. Deploy this archive only to an isolated testing branch / staging Render service connected to a **test** Supabase project.
3. Keep the GitHub repository private **or** remove instructor specs before making the repository public and configure Render secret files using `PB3_R3_SPEC_DIR`. Run `npm run build:verify` and `npm test` in the staging build with private specs available. Verify the build reports all 80 R3 items and no duplicate IDs.
4. For an existing PracticeBridge v4 database that already has `public.questions` and `public.cw_question_banks`, run **only** `migrations/003_session3_r3.sql` in staging. For a *new empty* Supabase project use one of the full setup SQL files according to the existing deployment instructions, rather than applying 003 alone.
5. Check that `SELECT count(*) FROM public.questions WHERE id LIKE 'PB3-%-R3'` returns **80**, with 20 writing, 10 debugging, 10 explanation for each language. Do not create a new session until the matching release bank hash exists in `cw_question_banks`.
6. Do **not** modify the `questionBankHash` of existing `study_sessions`, overwrite prior answers, or run the three generated full-migration scripts consecutively.
7. Test with test participants and known-good reference solutions. Only then perform a controlled rollout and separately enable Session 3.

## Application acceptance checklist (must be performed by the study team)

- [ ] Session 1 and 2 participant records, question snapshots, survey responses, and grades remain unchanged after migration.
- [ ] Session 3 stays closed until the approved release time. Test participant workflow can reach Session 3 in staging.
- [ ] Both Python and Java: four distinct families per assigned session and exactly 2+1+1 tasks by modality; pre/post survey timing is unchanged.
- [ ] The run button executes supplied methods/functions **without asking participants to add print calls or a Java `main`**; public sample output is visible.
- [ ] Each reference implementation receives a grade of 100 on the private tests; known-bug debugging starters score below 100.
- [ ] A compile error is graded as an incorrect submission; provider outage or sandbox timeout is recorded as an unavailable grade, **not zero**.
- [ ] Return values, list/array contents, distinct object identity, object field updates, and unchanged input requirements are checked correctly in the actual Judge0 environment.
- [ ] The final submission, code revisions, score history, elapsed time and grader version appear in exports for each item.
- [ ] Each explanation response scores 4 independent criteria and stores the four per-part scores; verify real model output against human reference examples. Borderline examples should be reviewed.
- [ ] Full participants' timed rehearsals fit the approved session duration. The 10-12 and 5-7 minute targets remain *provisional* until checked with students.
- [ ] The administered question versions/Java content match the CS course material and IRB-approved protocol. Confirm the appropriate amendments if study procedures materially change.

## Technical notes

- **Two Judge0 submissions per Run Code** for R3 writing and debugging: first a public sample check, then a separate set of hidden checks for scoring. Check the selected Judge0 instance's quotas, latency and capacity for simultaneous students. OpenAI feedback still uses the original configuration.
- The R3 explanation grader uses a structured OpenAI JSON response. This improves per-criterion consistency but **has not been empirically calibrated to human ratings**.
- Hidden tests are finite; passing them does not prove a solution correct on all possible inputs. Run the instructor examples and add boundary cases if platform tests expose gaps.
- The provided R3 student starter is intentionally incomplete for writing exercises and deliberately faulty for debugging exercises. These are not failures of the question bank.
- This archive does not contain production credentials and cannot verify Render deployment, Supabase state, Judge0 quotas, OpenAI service access, or actual enrolled students' completion times.
