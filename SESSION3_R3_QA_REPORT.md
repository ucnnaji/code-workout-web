# PracticeBridge Session 3 R3: offline integration verification

**Release status:** app integration candidate; Session 3 is closed and no live deployment has occurred.

## Preserved

- All **144** question definitions from the uploaded original archive are byte-equivalent as parsed JSON objects to the integrated source (no legacy question rewrite).
- Session 1 and Session 2 question IDs, modality mappings, original session open flags, surveys, consent, and assessment files were unchanged.
- The six-item programming self-efficacy survey and four-task crossover stage order were not modified.
- No participant data, account credentials, or Supabase records were edited.

## Added

- **80** new Session 3 questions across 10 concept families: 40 Python and 40 Java; each language has 20 writing, 10 debugging and 10 code-explanation items.
- Deterministic, versioned 2+1+1 assignment over **four distinct families** for each Session 3 participant.
- Judge0-compatible student code-run wrapper (one designated sample) and a separate hidden-test evaluator for each R3 writing/debugging item.
- Server-only Python and Java R3 specifications with object identity, return-value, mutation and input-preservation checks.
- Four-part, per-criterion rubric scoring for explanation submissions, with AI output constrained to scores of 0/10/18/25 per part.
- Additive R3 migration `migrations/003_session3_r3.sql`; original question IDs are not modified.

## Automated checks performed

- `npm run build:verify`: **passed**. Syntax checks passed for 30 JavaScript files; generated the full question release and additive R3 migration.
- `npm test`: **59 tests total: 58 passed, 1 skipped, 0 failed**. Skipped: environment-dependent database integration check.
- `node scripts/r3-harness-smoke.mjs`: **60/60 executable reference questions passed** their separate hidden-test harnesses in local Python/JDK execution (30 Python and 30 Java; each with multiple test cases). The first reference case is designated a public sample and excluded from the hidden-grade denominator.
- Known debugging defects were exercised in the earlier question-generation validation, and a representative incomplete starter was rejected by the integrated grade path in both languages.
- **100 synthetic participant seeds × 2 languages**: all four assigned questions were distinct and from four different families; both language counts were 2+1+1 and allocations repeat deterministically.
- Referential / preservation audit: **144 old questions unchanged**, 80 new items, Session 1/2 mappings unchanged, Session 3 still closed.

## Not verified in this environment

- Full Express browser startup was not tested; `npm install` could not be completed in this execution environment, and no production service was accessed.
- No live Supabase migration or Judge0/OpenAI service call was performed. The sandbox-specific runtime, quotas, API keys, scoring response format and database writes require a staging test.
- No student pilot has measured completion time or language/modality difficulty equivalence.
- Automated R3 explanation scoring was verified with a mocked OpenAI response, **not** against actual student explanations or expert human grades.

## Deployment recommendation

Use an isolated test Supabase project and Render service first. Review `SESSION3_R3_INTEGRATION.md`, run the **additive** migration, test one complete participant session in each language and initial modality, inspect scoring/attempt logs and exports, and leave Session 3 closed until approved. Instructor test specs must remain in a private deployment directory or secured secret file and must not be published to a public GitHub repository.
