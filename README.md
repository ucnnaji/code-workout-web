# Code Workout Web v2

A research-oriented programming practice platform for Python and Java. The app runs on Render, stores study data in Supabase, uses OpenAI for formative feedback, and sends untrusted code to an external sandbox provider for execution.

## What changed in v2

- Participant ID + required language selection (Python or Java).
- Four modalities per language: Problem Solving, Debugging, Code Explanation, Code Completion.
- 20 seeded questions per modality per language (120 total).
- Server-side deterministic randomization: 3 questions per modality, stored with question order and IDs.
- Sequential question release. Future questions are not returned until the current one is finalized.
- Monaco Editor with syntax highlighting, line numbers, indentation, bracket matching, snippets/autocomplete, resizable editor, and execution-error markers when line numbers can be inferred.
- Separate Program Output and AI Feedback panels.
- Auto-save drafts plus research snapshots.
- Run-code logs, AI-feedback logs, timing data, completion data, and general analytics events.
- Completed modalities are locked.
- Final review screen after the third question before a modality is marked complete.
- Admin research dashboard at `/admin.html` with aggregate and participant-level metrics plus CSV/XLSX export.

## Required one-time Supabase migration

The v2 server depends on new research tables. A Render restart alone cannot create PostgreSQL tables through the Supabase REST API.

Before deploying v2, open **Supabase > SQL Editor**, paste the full contents of `supabase_upgrade.sql`, and click **Run**. It is safe to rerun. At the bottom, the validation query should return 6 rows, each with `question_count = 20`.

The migration creates:

- `participants`
- `modalities`
- `study_sessions`
- `questions`
- `question_assignments`
- `submissions`
- `draft_events`
- `execution_logs`
- `ai_feedback_logs`
- `modality_completions`
- `analytics_events`

RLS is enabled on every research table. The participant browser never talks to Supabase directly. Render must use a **Supabase Secret key** (or legacy `service_role` key), not an anon/publishable key.

## Render environment variables

Required:

```text
OPENAI_API_KEY=...
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=<Supabase Secret/service_role key>
ADMIN_TOKEN=<long random administrator secret>
```

Configured by `render.yaml`:

```text
OPENAI_MODEL=gpt-5.5
SESSION_LABEL=study-2026
EXECUTION_PROVIDER=judge0
JUDGE0_URL=https://ce.judge0.com
FEEDBACK_RATE_LIMIT=60
EXECUTION_RATE_LIMIT=120
SAVE_RATE_LIMIT=600
```

Optional:

```text
JUDGE0_AUTH_TOKEN=...
```

Only add `JUDGE0_AUTH_TOKEN` if your Judge0 instance requires authentication.

## Deployment sequence

1. Run `supabase_upgrade.sql` in the Supabase SQL Editor.
2. In Supabase, confirm the `questions` table contains 160 rows and that the 8 language/modality groups contain 20 questions each.
3. Confirm Render's `SUPABASE_SECRET_KEY` is a server-side Secret/service-role key. This is important because RLS is enabled.
4. Replace your GitHub repository files with this v2 project and push to `main`.
5. In Render, sync/redeploy the Blueprint. Add `ADMIN_TOKEN` when prompted if it is new.
6. Open `/health`. Expected shape:

```json
{
  "ok": true,
  "database": true,
  "questions": 160,
  "model": "gpt-5.5",
  "executionProvider": "judge0"
}
```

7. Test with a non-study Participant ID before collecting real research data.
8. Open `/admin.html`, enter the `ADMIN_TOKEN`, and verify the test session appears in the dashboard/export.

## Code execution

Untrusted participant code is **never executed inside the Render Node process**. `/api/execute` forwards code to a Judge0-compatible sandbox and stores stdout, stderr, compiler output, runtime, memory, language, timestamps, and status in `execution_logs`.

The default `JUDGE0_URL=https://ce.judge0.com` is convenient for pilot testing, but a third-party public sandbox is outside your control. For a rigorous or larger study, use a dedicated/self-hosted Judge0 deployment (or another managed sandbox) and set `JUDGE0_URL` accordingly. If the provider requires a token, add `JUDGE0_AUTH_TOKEN` in Render.

## Randomization and reproducibility

Each study session receives a cryptographically random `randomization_seed`. For each modality, the server deterministically scores all active question IDs with HMAC-SHA256 using that seed and chooses the first three. The chosen question IDs and order are written to `question_assignments`.

This means:

- participants do not randomize questions in the browser;
- future questions are not sent early;
- the exact assignment is permanently stored;
- the same seed/question bank can reproduce the selection logic.

## Research data model

Key relationships:

```text
participants
  1 -> many study_sessions
study_sessions
  1 -> many question_assignments
  1 -> many modality_completions
  1 -> many analytics_events
questions
  1 -> many question_assignments
question_assignments
  1 -> 1 submissions
  1 -> many draft_events
  1 -> many execution_logs
  1 -> many ai_feedback_logs
```

Timing is stored with server timestamps. Question duration is derived from assignment `started_at` and `completed_at`; modality duration is stored in `modality_completions`; total study duration is derived from `study_sessions.started_at` and `completed_at`.

## Main API

Participant workflow:

```text
POST /api/session/start
GET  /api/session/:sessionId
POST /api/modality/start
POST /api/draft
POST /api/execute
POST /api/feedback
POST /api/submissions/finalize
GET  /api/modality/review
POST /api/modality/complete
POST /api/events
```

Administrator workflow:

```text
GET /api/admin/dashboard
GET /api/admin/export.csv
GET /api/admin/export.xlsx
```

Admin endpoints require `X-Admin-Token`.

## Validation and data-integrity rules

- Participant IDs: uppercase letters, numbers, `_`, `-`; maximum 64 characters.
- Language can only be `python` or `java`.
- A participant's language cannot change after a session is created.
- One active session per participant.
- Exactly three question-order slots per modality (`1..3`).
- A question cannot be assigned twice in the same session.
- Completed modalities cannot be restarted.
- Earlier questions must be completed before a later assignment can be used by execution, feedback, or final-save APIs.
- Code, explanations, stdin, and request-body sizes are bounded.
- AI feedback requests and code execution are rate limited per client IP.

## Security notes

- Never commit `.env`, `OPENAI_API_KEY`, `SUPABASE_SECRET_KEY`, `ADMIN_TOKEN`, or sandbox credentials.
- Do not use a Supabase anon/publishable key for the Render backend; it will be blocked by RLS and is not appropriate for privileged research writes.
- Participant browsers receive no OpenAI/Supabase server keys.
- Code execution is isolated from Render by an external sandbox.
- Admin exports contain research records and should be treated as sensitive research data.
- Participant IDs should remain pseudonymous; do not collect names/emails unless your approved study protocol requires them.

## Local checks

```bash
npm install
npm run check
npm start
```

For local execution, set the environment variables from `.env.example` in your shell or start Node with an env-file mechanism.
