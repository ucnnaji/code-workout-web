# API and data model

## Entity relationships

`participants (1) → (many) study_sessions` is the stable longitudinal link. Each session has a wave number, a unique UUID, a fixed language, topic, content/configuration snapshot and status. Sessions own stage-progress rows and coding assignments; assignments own submissions, draft snapshots and execution/feedback operations.

Consent signatures and compensation contacts are not fields on surveys or submissions. `cw_private_consents` is a separate table linked to a session. `cw_compensation_claims` contains encrypted contact data, and `cw_compensation_links` is the restricted session-to-claim bridge. The payment operator API does not return the bridge or research answers.

| Table | Purpose / main fields |
|---|---|
| `participants` | persistent UUID, unique participant_code, created_at |
| `study_sessions` | UUID, participant_id, study_key, session_number 1–3, language, topic, workflow_version, protocol_snapshot, randomization_seed, is_test, status, timestamps |
| `cw_participant_auth` | salted secret_hash, preferred_language, test flag; never exported |
| `cw_access_tokens` | opaque token hash, participant UUID, expiry; never exported |
| `cw_studies` | validated configuration, revision, update timestamp |
| `cw_stage_progress` | session + stage primary key; ordinal/status, private instrument definition, responses/scoring, revision, stable save/final request IDs, timestamps/active estimate |
| `questions` / `modalities` | existing practice banks and three active modalities |
| `question_assignments` | session/modality/order, question ID, immutable text/input snapshot, status and timestamps |
| `submissions` | current/final code, explanation and structured inputs; revision, skipped flag, final request ID |
| `draft_events` | acknowledged code/explanation/input snapshots, server timestamp |
| `cw_operations` | kind execute/feedback, session/assignment, request UUID and count, submitted snapshot, result/status, requested/completed/displayed times |
| `modality_completions` | one record per modality/session; completion and elapsed duration |
| `cw_private_consents` | encrypted typed signature, source document/version/hash and signed timestamp |
| `cw_compensation_claims` | claim UUID, amount/currency, encrypted contact, request/payment status, test flag |
| `cw_compensation_links` | restricted unique session ↔ claim mapping |
| `cw_audit_events` | pseudonymous workflow/configuration/withdrawal events; payment audit events excluded from research exports |
| `cw_rate_limits` | keyed-HMAC buckets with expirations; raw IP addresses not stored in these rows |

Legacy `study_attempts`, `execution_logs` and `ai_feedback_logs` are not deleted. v3 operations use `cw_operations`; combining old and new research data requires an explicit analyst-controlled mapping. No historical row is automatically asserted to represent Session 1.

## Invariants and validation

- Exactly one v3 session per persistent participant/study/wave, enforced by a partial unique index. Retries resume it.
- Participant identity is obtained from the authenticated token, never trusted from a submitted participant UUID.
- Session UUIDs, revisions, modality enums, language, answer options, input fields and length limits are validated server-side.
- A transaction locks the session before checking stage/order/consent and making state changes.
- Final responses are immutable. Replayed identical request IDs return the stored result instead of a second submission/claim.
- Mandatory information, eligibility, consent, language and completion stages cannot be disabled in configuration.
- Incorrect/unknown credentials do not distinguish account existence in the login error.
- Future question bodies, other participants' data and assessment answer keys are not delivered to participant APIs.
- All new tables have RLS, no anon/authenticated public policies, and explicit service-role grants. Only the backend may execute `cw_rpc(text,jsonb)`.

## HTTP endpoints

All JSON mutation requests require JSON content. Authenticated participant requests carry the HttpOnly cookie and `X-CSRF-Token` returned at login/account retrieval. Cross-origin mutations are rejected. Administrative requests use `X-Admin-Token` for the appropriate role; tokens stay in page memory, not localStorage.

| Method / path | Purpose |
|---|---|
| `GET /health` | database/configuration availability and collection mode, no secrets |
| `GET /api/public` | public title/contact/review notice |
| `POST /api/auth/login` | Participant ID + private access key → opaque cookie, CSRF token |
| `POST /api/auth/logout` | revoke token and clear cookie |
| `GET /api/account` | participant's own wave statuses and opening settings |
| `POST /api/sessions` | `{sessionNumber:1|2|3}` → create/resume exact wave |
| `GET /api/sessions/:sid` | sanitized progress/configuration for own session |
| `POST /api/sessions/:sid/stages/:stage/open` | get current permitted instrument without assessment keys |
| `PUT /api/sessions/:sid/stages/:stage` | draft/final save with revision/requestId; consent and incentive final-only |
| `POST /api/sessions/:sid/heartbeat` | approximate post-consent current-stage activity time |
| `POST /api/sessions/:sid/withdraw` | stop session; optional `requestDataWithdrawal:true` for human review |
| `GET /api/sessions/:sid/consent-copy` | own authenticated printable consent/signature receipt |
| `GET /api/sessions/:sid/claim` | own claim reference/status, not contact plaintext |
| `PUT /api/sessions/:sid/claim` | securely add/update deferred email when eligible |
| `POST /api/modality/start` | current assignment or read-only completed-question review; never future question list |
| `PUT /api/draft` | coding draft/final/skip; revision-checked and idempotent |
| `POST /api/modality/complete` | mark modality only; does not complete whole session |
| `POST /api/execute` | resource-limited sandbox run, separately logged |
| `POST /api/feedback` | enabled formative feedback type, separately logged |
| `POST /api/sessions/:sid/operations/:id/displayed` | acknowledge rendered output/feedback; receipt timestamp is not proof of reading |
| `GET/PUT /api/admin/config` | config/content hash and compare-and-swap updates |
| `POST /api/admin/participants` | generate new ID/access key or provision verified legacy ID |
| `POST /api/admin/participants/reset` | rotate private key and revoke participant sessions |
| `GET /api/admin/dashboard` | aggregate, paired-test and participant × wave metrics |
| `GET /api/admin/export/:table.csv` | allowlisted research dataset; `?includeTest=true` optional |
| `GET /api/admin/export.xlsx` | multi-sheet research export; no signatures/contacts/access credentials |
| `GET /api/compensation-admin/claims` | payment-role-only decrypted payment contact/status; bounded list of newest 1,000 |
| `POST /api/compensation-admin/paid` | record an already-issued payment |

The former ID-only `POST /api/session/start` is retired. Existing integrations must use the new authenticated flow, not add public RLS insert policies.

## Example records (synthetic)

```json
{
  "participant": {"id":"11da8577-f672-4490-b0a7-e026138610b9","participant_code":"CW-DEMO-A8"},
  "sessions": [
    {"id":"4039cf43-99b8-42c6-9263-6a9d0385b488","session_number":1,"status":"completed"},
    {"id":"7f9be05e-dc10-4dcd-b2ee-967f473f6f40","session_number":2,"status":"active"}
  ],
  "stage": {"stage_key":"pre_test","status":"completed","revision":3,"scoring":{"nItems":3,"nAnswered":2,"nSkipped":1,"earned":1,"maximum":3}},
  "operation": {"kind":"feedback","request_number":2,"payload":{"feedbackType":"hint","language":"python","modality":"problem-solving"},"status":"succeeded"}
}
```

Both session rows carry the same `participant_id`; Session 3 is absent until actually started. Do not create an empty “participated” record for an absent wave.

## Research export/analysis notes

Research exports add participant code, session UUID, session number, language and test status to assignment-linked datasets. Normal exports exclude test rows but **do not automatically remove withdrawn or legacy rows**; use the documented status/withdrawal flags and the approved analysis plan. Administrative-only audit events without a session are operational metadata, not participant outcomes. Pagination is stable by ID but is not a frozen transaction across all sheets; export during a quiescent period or take a coordinated database snapshot for a locked analysis dataset.

Protect exported free-text responses: a participant can still type identifying information despite instructions. This is a pseudonymous export, not guaranteed de-identification. CSV neutralizes leading formula characters; Excel writes textual content as strings rather than formulas. Preserve the versioned repository/instruments and approved database snapshots alongside an analysis export; current dashboard settings alone cannot reconstruct historical instruments.

`displayed_at` is a server receipt of a browser display acknowledgement, not eye tracking. It may be null when the client disconnects. A failed/pending/unknown provider outcome is not evidence of incorrect student code. Final output references are attached only when the saved code and inputs match the recorded run; all earlier outputs remain in the operation log.
