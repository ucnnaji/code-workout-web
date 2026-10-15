# PracticeBridge: Required surveys and USU course enrollment question

## Changes
- Both pre-survey and post-survey are mandatory at every study session. Every presented survey item is required before final submission. Incomplete drafts can still autosave.
- Backend rejects incomplete final survey responses even if browser validation is bypassed.
- Backend rejects survey skip requests, and study configuration cannot disable either survey.
- First-session pre-survey includes a required item asking whether the participant is currently a USU student enrolled in CS 1400, CS 1410, both, or neither. This collects a response; it does NOT automatically reject a participant or change the protocol eligibility criteria.
- The response label is unchanged in Python and Java variants. Existing response data and existing in-progress session snapshots are not rewritten.
- Browser indicates required fields and blocks navigation with unanswered items.

## Critical research/ethics checkpoint
The previously supplied research information and possibly the approved consent document may say survey questions can be skipped. Review the participant-facing consent and IRB-approved protocol with the PI before deploying a requirement to answer every survey item. Participants retain the ability to stop participation. Changing eligibility requirements (e.g., excluding students not enrolled in CS 1400/1410) is a separate study decision and is NOT implemented in this patch.

## Migration/deployment
- Rebuilt `supabase_upgrade.sql`, `supabase_setup.sql`, and `supabase_workflow.sql` from 144 current question records. Execute only ONE after backup and compatibility review.
- Release content hash changes; the current release needs review/approval according to existing platform configuration.
- Existing sessions with saved snapshots may still use their prior instruments; new sessions use the updated question definition. Do not rewrite historical records.

## Verification
- `npm run build:verify`: success
- `npm test`: 46 passed, 0 failed, 1 skipped
- Added `tests/required-surveys.test.mjs` for required surveys in each session/language, course wording, and configuration controls.
- No deployment or live Supabase execution was performed.
