# Independent review passes for requested-modifications build

This package was reviewed in separate passes against the user's requested changes. These are independent review passes and automated checks, not a claim that multiple external human reviewers or agents executed the code.

## Pass 1 - Participant workflow and UI
- Startup remains on a neutral loading screen until public study state resolves; no Participant ID flash.
- Public wording is neutral about programming topics.
- Consent display hides the internal consent version identifier.
- New live participants choose a non-identifying Participant ID and Python/Java after consent, receive a one-time private access key, confirm it is saved, and continue.
- Python/Java pre- and post-survey wording uses the same item IDs, order, options, and constructs; only language references are adapted.
- Assigned activity order is 2 questions in the primary modality, then 1 in each of the other two modalities (4 total), with later modalities locked.
- Problem Solving/Debugging hide the explanation field. Code Explanation keeps the explanation field and hides Run Code/stdin/output.
- Monaco editor height is compact and retains normal editor affordances plus Format Code.

## Pass 2 - Authentication, duplicate-entry protection, and privacy
- Access keys are shown once and only salted hashes are stored.
- Participant API requests use the existing authenticated HttpOnly session cookie and CSRF protection.
- Finalizing the first live research question sets the database entry lock and a signed HttpOnly browser lock cookie. The browser lock is not cleared by normal logout and is consulted before self-enrollment when duplicate protection is enabled.
- Same Participant ID/study/session duplicates are blocked by the database uniqueness rule; an active locked session must be resumed.
- Consent signatures and compensation contacts remain excluded from ordinary research exports.

## Pass 3 - Execution, scoring, and modality behavior
- Python and Java execution use the Judge0 sandbox path; runtime IDs may be discovered from Judge0 when not explicitly configured.
- Network execution is disabled and resource limits are included in Judge0 requests.
- All three modalities receive an OpenAI rubric score. Problem Solving/Debugging send the actual Judge0 execution result as evidence; Code Explanation uses the displayed code plus the student explanation.
- Code Explanation is blocked from the execution endpoint server-side, not just hidden in the browser.

## Pass 4 - Supabase migration and admin exports
- Additive migration adds entry lock and score fields without deleting legacy records.
- Three generated SQL entry-point files are byte-identical; run only one.
- Pre-survey, post-survey, and combined pre/post datasets are available as dedicated admin exports and Excel workbook sheets.
- Admin dashboard exposes release-readiness blockers and duplicate-entry protection control. The release hash includes the current question bank and study-design configuration in addition to consent/instruments.

## Pass 5 - Automated verification
Commands run successfully in this artifact environment:

- `npm run build:verify`
- `npm test` -> 33 tests discovered; 32 passed; 1 optional Postgres-compatible/PGlite integration test skipped because the dev dependency was unavailable.
- `npm run test:browser` -> PASS
- `npm run test:admin-browser` -> PASS

A production-style `npm install` was also attempted in this artifact environment but package download did not complete before the environment timeout. Render should install the declared dependencies during deployment. Because of that environment limitation, the optional PGlite integration test did not run here; this is explicitly reported rather than treated as a pass.
