# Required staging acceptance tests

Use only synthetic participants and a separate staging Supabase project. A checked item is evidence of your own test result, not an automatic assertion by the code generator.

## Database and authorization

- Apply the complete migration on a fresh staging database and on a copy of the old database; apply it twice. Verify existing research/question content is preserved.
- Run `npm test` with development dependencies installed; the Postgres integration test must not be skipped for release acceptance.
- Verify anon/publishable keys cannot read private/research tables or execute `cw_rpc`; verify backend secret-key access works without adding public policies.
- Try another participant's session UUID and assignment UUID. Expect not found/forbidden; no research content should be returned.
- Try a future stage, a future coding question, an already-final response and an out-of-order crossover modality. Expect rejection.
- Save with stale revisions, repeat identical final request IDs, and submit simultaneous final/incentive requests. Confirm no duplicate rows/claims.
- Run concurrent Session 1/2 question assignment; confirm the non-repeat setting either selects distinct questions or explicitly rejects and retries.

## Participant workflow

- Sign in with ID/key, complete information, fail either eligibility item; verify consent/research cannot begin.
- Decline consent; verify no research activity becomes accessible. Test typed agreement, signed timestamp, source hash and downloadable/printable consent copy with synthetic names.
- Complete Python and Java paths. Verify all eight source efficacy items, desired new questions and selected-language wording after approval.
- Save an incomplete survey/test, refresh, sign out and use a second browser. Only server-acknowledged answers must persist across devices.
- Edit while an earlier save is pending. Drop the response after a commit, retry, and verify stable request IDs prevent duplicated saves.
- Open two tabs; verify revision conflicts never silently overwrite newer work. Confirm sessionStorage drafts do not contain the signature/payment email/access key.
- Test each question with zero, one and two configured inputs; integer errors, long values, pasted newlines and missing inputs must have clear messages.
- Run valid/invalid Python and Java with the real sandbox. Try timeout/output limits and prohibited network access. Verify actual stdout/stderr/compile errors are not AI feedback.
- Request real enabled AI feedback; verify model/prompt metadata and matching-code execution context. Confirm disabled modalities and assessment stages reject AI calls.
- Complete the assigned 2/1/1 sequence (four questions total), review each modality, confirm completion, and verify coding alone does not finish the session.
- Complete/skip permitted post sections and choose each incentive option. Confirm no payment is sent automatically and scores do not control eligibility.
- Test stopping and requesting data withdrawal without forcing further study activity.

## Three waves and administrative controls

- With the same ID/key, open Sessions 1, 2 and 3; verify the same participant UUID and three distinct session UUIDs/numbers.
- Reopen each wave twice; verify no duplicate sessions, repeated completed modalities or re-randomized assigned questions.
- Simulate an absent earlier wave. Verify missing participation stays absent rather than being fabricated.
- Change optional stages/content for a future session. Verify already-created session snapshots remain unchanged and closed waves cannot start new sessions.
- Research admin can see longitudinal metrics/exports but cannot use the payment-only API; payment admin cannot use research endpoints.
- Export CSV and XLSX; inspect missingness, version identifiers, test exclusion and withdrawal flags. Verify no signatures, emails, access hashes or tokens occur in normal datasets.
- Test privacy review for participant-entered identifying free text and safe handling of formula-like CSV text.

## Operations/accessibility

- Verify Monaco, local workers, keyboard-only navigation, screen-reader labels, contrast and focus with actual supported browsers, including 390px mobile layout.
- Interrupt network, restart Render during a run, and test idle-session resume; pending/failed operation status must not be mislabeled as a code result.
- Test the actual planned concurrent participant count, network delays, time estimates, model/provider quota and hosting behavior.
- Verify encrypted-data backups plus key recovery, approved deletion/withdrawal procedures and cloud access/MFA.
- Confirm all protocol/content/storage decisions in PROTOCOL_REVIEW.md before issuing real participant credentials.
