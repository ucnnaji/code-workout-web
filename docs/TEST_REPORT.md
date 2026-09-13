# Test report — v4.0.4 production-hardening pass

The final build was checked with complementary unit, browser, security, build, and synthetic-load passes.

- `npm test`: 37 tests discovered; 36 passed, 0 failed, 1 skipped. The skipped case is the optional PGlite/Postgres-compatible integration test, which requires the dev dependency to be installed.
- `npm run build:verify`: passed. It regenerated the three identical Supabase SQL entry points from the canonical question JSON, syntax-checked the JavaScript, parsed/validated configuration/content, and ran requested-modification regression assertions.
- `npm run test:security`: passed. It checked environment-variable coverage, generated SQL equality, hard-coded-secret signatures, runtime shell/eval primitives, cookie/CSRF/security controls, provider isolation, and question-bank release wiring.
- `LOAD_USERS=500 npm run test:load`: passed. 500 concurrent access-key verifications completed; 500 mocked OpenAI grading calls respected the 120-request outbound gate; 500 mocked Judge0 runs used one coalesced language discovery and respected the 120-submission gate.
- `python scripts/browser_test.py`: passed. It covers the no-flicker landing state, consent, student-created credentials, Java/Python survey wording, demo/language flow, locked 2+1+1 practice sequence, score display, modality-specific controls, and completion.
- `python scripts/admin_browser_test.py`: passed. It covers the modified research dashboard interactions.

Synthetic load tests deliberately mock OpenAI/Judge0 and do not establish end-to-end capacity of Render, Supabase, external providers, or the campus network. A staging rehearsal against the exact production services remains recommended before a large scheduled session.

The canonical current question bank and consent wording were hash-compared against the v4.0.2 AI-scoring build and are byte-for-byte unchanged.

A production dependency audit was attempted, but this source package has no committed npm lockfile and generating one from the registry timed out in this execution environment. This limitation is reported rather than represented as a successful audit. The declared runtime dependency versions remain pinned in `package.json`.
