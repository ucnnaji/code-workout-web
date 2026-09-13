# Implementation and system architecture

## Scope and preserved design

The supplied three-modality v2 archive is the base. Original `styles.css` rules are retained; new progress, survey, information-card and structured-input rules are appended. The participant page retains the top bar, typography, colors, card treatments, modality grid, coding editor/output/feedback layout and review cards. Necessary additions are authentication, session selection, research information, stage forms and completion/compensation controls. No external survey site or embedded third-party form is required.

The inherited question bank is not silently replaced or claimed to be topic-equated. It contains 120 active questions across Python/Java and the three modalities, plus an inactive completion bank. Some Code Explanation IDs still contain `TRC`; preserving IDs avoids breaking historical research references.

## Frontend implementation

`public/app.js` coordinates one authenticated participant and one chosen session. The server returns a safe session state and the currently permitted stage; frontend progress is a rendering of that state, not the authority. Future stages are not links. At a survey/test, a stage-definition renderer builds optional text, radio, multiple-choice and multi-select controls. Assessment answer keys never go to the participant browser. Screens render stored text using escaping or textContent.

`public/autosave.mjs` serializes draft writes. A save carries the last acknowledged revision plus a stable request UUID. It retains an outstanding attempt if the response is lost and retries the same ID before newer edits. Two-tab conflicts are shown rather than silently overwriting newer work. Research drafts are cached in the current tab's sessionStorage only; there is no local cache of private access keys, typed signatures or compensation emails. Server-acknowledged content survives browser/device changes. Unsaved edits cannot be guaranteed after a device crash or closed tab; the UI reports this and warns before navigation while dirty.

Monaco remains the preferred editor, now served from the installed dependency on the same origin. If unavailable, an explicitly labeled textarea fallback keeps the task usable. Python/Java syntax and suggestions remain; a full language-server formatter is not bundled. The Format Code control uses a compatible registered formatter when present, otherwise explains that no formatter is installed and does not change code. This avoids pretending basic indentation is a complete formatter.

## Backend implementation

`server.mjs` validates required private variables, rejects a publishable key, initializes configuration only when absent, and starts Express. `lib/app.mjs` implements HTTP authentication, CSRF checks, schema validation, role-specific admin APIs, provider orchestration and export allowlists. `lib/database.mjs` is a server-only Supabase REST/RPC adapter. `lib/providers.mjs` contains bounded Judge0 and OpenAI calls; no student code runs inside this application process.

All critical state changes use the service-role-only `cw_rpc` function. It checks ownership, locks the session row, validates the current stage and revision, and writes the dependent records atomically. A new stage cannot be obtained by inventing a session UUID or bypassing a disabled browser button. Provider calls occur outside database transactions, with a pending operation created first and success/failure recorded afterward. A lost upstream connection can have an unknown outcome: the system records that uncertainty rather than claiming exactly-once external execution.

## Requirement mapping

| Requirement | Implemented behavior / files |
|---|---|
| Persistent Participant ID | `participants` UUID + stable code, `cw_participant_auth`, private access-key login |
| Three sessions | unique `(participant_id, study_key, session_number)` for v3; UUID per wave |
| Research information | concise six-card accessible HTML infographic and Continue |
| Eligibility | exact two supplied screening questions before consent; failed screening stops the session |
| Consent | preserved source text, explicit agreement + typed signature, encrypted private record, version/hash/timestamp, printable authenticated copy |
| Pre-survey | supplied background and eight self-efficacy items; separately marked requested additions |
| Pre/post tests | language/topic-specific illustrative items, server scoring, timestamps, missingness, locked feedback/execution |
| Coding | same three modalities; three stored random questions per modality by default |
| Structured inputs | `content/input-schemas.json`; labeled fields serialized by the server into ordered stdin |
| AI tracking | feedback type, request ID/count, model/prompt metadata, code snapshot, requested/completed/display-ack timestamps |
| Post-survey | source eight efficacy items and practice-confidence item; requested experience/AI/usefulness additions separately defined |
| Incentives | independent encrypted contact record and mapping table; defer/decline allowed; no payment automation |
| Recovery | opaque cookie login, server stage state, CAS autosave, request deduplication, unsaved-change warnings |
| Longitudinal analytics | participant × session matrix, missing/withdrawn waves visible, paired test metrics, modality time/AI counts, language stats |
| Exports | research-only CSV and XLSX allowlists; test exclusion by default; separate payment console |
| Future studies | optional stage switches and per-wave open/closed settings for new sessions; mandatory safety gates cannot be disabled |
| Delivery | web application supports the participant workflow; this package defaults to in-person delivery to match the supplied consent. A future remote release still requires reviewed remote/e-consent materials. |

## Participant architecture and identity linkage

Participants enter a study code and a separately delivered private access key. The code is not a student number or an email hash and is not sufficient to view research records. The key is a random credential stored using salted scrypt; opaque authentication-token hashes expire after seven days. Resetting a key invalidates existing tokens but preserves the participant UUID and all waves.

The researcher maintains any roster-to-study-code linkage outside research responses in the university-approved administration location. The app does not need names/emails to administer research responses; typed consent names and compensation emails are intentionally separate identifying records. These data are pseudonymous, not anonymous.

## Session architecture

Participant-facing Session 1/2/3 labels are intentionally topic-neutral while the reviewed question banks are being finalized. Opening a wave is an administrative choice, not a self-reported session number. A missed earlier wave does not force a fabricated participation record. Closing a wave prevents new starts but does not strand an existing in-progress session. The language selection is persistent; switching it requires a reviewed migration rather than creating a second participant.

Each new session snapshots the study configuration, instruments, source content hash, modality-order assignment and topic. Each assigned coding question snapshots its actual text, starter code and input schema. Existing sessions never adopt newly edited questions or instruments implicitly. A session starts as active and becomes completed only after all enabled stages are finalized or explicitly skipped where permitted. Coding completion is a separate timestamp.

`three_each` preserves the existing application workflow: 3 questions × 3 modalities = 9 questions per wave. The alternative `assigned_crossover` assigns 2 questions in a primary modality and 1 in each other modality, rotating the initial modality across the three waves with a recorded deterministic participant bucket. This is a configurable proposal inspired by the source, **not an assertion that cohort balance, exact timing or the study's randomization protocol has been validated**. Neither design enforces a 65-minute cutoff or replaces researcher-approved task selection.

## Progress and research validity

The progress tracker distinguishes pending, in progress, completed, skipped, disabled and declined. “Complete a stage” means record a final decision, not force every response. Questions and entire research sections may be skipped where supported. Stop participation is available throughout; data-withdrawal requests are recorded for human handling, not silently treated as database erasure. An ineligible participant cannot view consent or perform research activities.

Test scores include `nItems`, `nAnswered`, `nSkipped`, `earned`, and `maximum`. A wholly unanswered test has `earned:null`; partial responses retain missingness. Do not compare percentages without a pre-specified rule for missing responses. Self-efficacy summaries use only the source eight items and report answered-item means descriptively; they are not declared validated composites. Do not pool new engagement/usability items into the efficacy measure.

Elapsed question/modality/session times include time away, network waits and interruptions. Stage heartbeat time is an approximate visible/recently-active measure; it is not an exact measure of cognitive engagement. Model inference is nondeterministic even with a pinned model. Store the actual feedback and prompt/version metadata rather than promising reproducible generated text.

## Beginner-friendly input handling

The old raw Optional Program Input box is removed. Exercises with inputs have a question-specific schema with stable field IDs, visible labels, examples, type/range validation and defaults. For example, fields “First number” = 4 and “Second number” = 7 become `4\n7\n` on the server. The student does not manage line endings. Extra fields, line-break injection, oversized values and invalid execution-time types are rejected. Incomplete values such as a temporarily typed minus sign may still be autosaved as drafts.

Only two active inherited starter programs read stdin; explicit mappings are included for those questions. A two-field example schema is included for adding a genuine multiple-input exercise. Questions with no declared input schema show “Use the values provided in the question or starter code.” The browser does not attempt to infer `input()`/Scanner behavior or accept arbitrary hidden stdin. Review and add metadata whenever the bank changes.

## Administrator workflow

The research console provides enrollment/key reset, open/close waves, optional-stage switches, versioned configuration, longitudinal metrics and exports. Advanced JSON changes must first be applied to controls and then saved; conflicts require reloading. Settings changes affect new session snapshots, not existing sessions. The payment console requires a different token and cannot export research answers through its API. Shared operator tokens are a practical initial deployment boundary, not individually attributable SSO; named, MFA-protected operator accounts should be reviewed before broader production use.
