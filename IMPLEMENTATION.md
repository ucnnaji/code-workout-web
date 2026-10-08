# Implementation and Research Design Notes

## 1. Frontend architecture

The participant UI remains a lightweight static web app served by Express. It is organized as a state-driven workflow: participant ID -> language -> modality dashboard -> current assignment -> three-question review -> modality completion. Only one current assignment is exposed at a time.

Monaco Editor is loaded from jsDelivr with a textarea fallback. Python and Java modes receive syntax highlighting, line numbers, auto-indentation, bracket matching, snippet completion, resizable layout, and execution-derived line markers where possible. Code tracing is intentionally read-only to reduce accidental manipulation of the tracing stimulus.

Drafts are auto-saved after inactivity and a `beforeunload` warning is shown while edits are unsaved. Shared lab machines can use **New Participant** to clear only local browser state; database records remain intact.

## 2. Backend architecture

`server.mjs` is the single trusted application boundary. The browser never receives Supabase or OpenAI credentials. The server validates session/assignment ownership and ordering before every state-changing operation.

The backend handles deterministic question assignment, draft persistence, sandbox execution, AI feedback, finalization, modality completion, analytics, and exports.

## 3. Database architecture

The schema separates experimental entities instead of storing all activity in one event table. The normalized model supports longitudinal analysis, clean joins, and independent retention of code execution and AI interactions.

`question_assignments` is the experimental randomization record. Do not regenerate or delete assignments during a study unless your protocol explicitly calls for it.

## 4. Randomized workflow

For each session/modality, the server selects 3 of the 20 active questions by deterministic HMAC scoring. The random seed is stored in the session and selected IDs/order are stored in assignments. This prevents client manipulation and supports reproducibility.

## 5. Research tracking

Captured records include participant/session identifiers, language, modality, question ID/order/difficulty, autosave snapshots, final code/explanation/output, sandbox execution attempts, compiler/runtime errors, AI request counts/content/timestamps/latency/model, question timing, modality timing, session timing, and completion states.

Generic `analytics_events` supplement the normalized research tables with page visibility, editor focus/blur, run clicks, feedback clicks, save clicks, and modality screen views.

## 6. AI feedback design

The OpenAI Responses API is called only by the server. The model receives the authoritative question, selected language, modality-specific feedback instructions, current code, explanation/trace, and most recent execution output. The system prompt instructs the model to give short formative feedback and not reveal complete solutions.

Every successful AI response is stored verbatim with request number and timestamps in `ai_feedback_logs`.

## 7. Code execution design

The server does not invoke `child_process`, Python, Java, Docker, or shell commands on Render for participant code. It uses a Judge0-compatible sandbox. This preserves the security boundary between untrusted student code and the application server.

For larger/high-stakes studies, run a dedicated sandbox service with quotas, network restrictions, CPU/memory/time limits, monitoring, and a version-pinned Python/Java toolchain.

## 8. Analytics dashboard

`/admin.html` requires the Render `ADMIN_TOKEN`. Aggregate metrics include participants, sessions, completed sessions/modalities, average question/modality time, AI request counts, language usage, and modality completion. The session table adds participant-level language, completion, AI usage, and average question time.

CSV and XLSX exports include all core research tables. The export code intentionally runs server-side so database credentials remain private.

## 9. Research validity considerations

Question randomization is server-side and persistent. Future questions are not sent to the browser before prior completion. Code tracing stimuli are read-only. AI and execution outputs are visually separated and independently logged. Completion actions are explicit and irreversible at the modality level.

If your IRB/protocol requires a different feedback limit, attempt cap, withdrawal behavior, fixed randomization schedule, counterbalancing, or treatment/control conditions, implement those rules before data collection begins and version the study configuration.

## 10. Production checklist

Before participant data collection, verify the migration, RLS/server secret, 120-question count, OpenAI model access, sandbox availability, sample Python and Java executions, autosave behavior, export correctness, Render wake-up behavior, and an end-to-end test of all three modalities for a disposable participant ID.
