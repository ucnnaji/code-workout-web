# PracticeBridge integration on original main source

Baseline: the user-supplied `code-workout-web-main (5).zip` (original 108 questions).

This source branch preserves the original enrollment, sessions, logging, feedback, compensation, and server architecture, while integrating the 6 matched sets (18 Python + 18 Java) from the October 7 revised bank.

Changes:
- Adds 36 PB-* items alongside the existing 108 canonical question records.
- Configures three-session matched family question selection for Python and Java.
- Allows structured runtime inputs in Debugging, in addition to Problem Solving.
- Adds conditional retry input fields to Set 3 and serializes active fields in program-read order.
- Includes client and server draft-input persistence fix.
- Updates page/on-screen title to PracticeBridge.
- Regenerates equivalent Supabase SQL entrypoint migrations. Apply **only one** migration after reviewing existing bank/session assignments. Do not run all three.

Local checks: `npm test`: 43 pass, 1 skipped, 0 failures. `npm run build:verify`: pass.

Cautions: No active Supabase, Judge0, or OpenAI credentials are bundled. No real hosted end-to-end test was completed. Automated browser mock checks and sampled reference executions from earlier work do NOT constitute proof that every grading and data-persistence workflow is working on live infrastructure. Back up production DB before migrations and do not enroll live participants until acceptance checks pass. Existing bank-version assignment semantics must be reviewed when switching running studies.
