# API and Data Model Reference

## Participant APIs

### `POST /api/session/start`

Request:

```json
{ "participantId": "P2011", "language": "python" }
```

Creates or resumes the participant's study session. A participant with an existing session cannot switch language.

### `GET /api/session/:sessionId`

Returns session metadata, modality completion states, and overall progress.

### `POST /api/modality/start`

```json
{ "sessionId": "<uuid>", "modalityId": "debugging" }
```

On first use, deterministically assigns 3 questions from the 20-question bank. Returns only the current question. If all three have been finalized but the modality has not yet been confirmed, returns the review payload.

### `POST /api/draft`

```json
{
  "sessionId": "<uuid>",
  "assignmentId": "<uuid>",
  "code": "print('draft')",
  "explanation": "",
  "clientTimestamp": "2026-09-03T21:00:00.000Z"
}
```

Upserts the latest draft and records a snapshot in `draft_events`.

### `POST /api/execute`

```json
{
  "sessionId": "<uuid>",
  "assignmentId": "<uuid>",
  "code": "print('hello')",
  "stdin": ""
}
```

Returns sandbox status, stdout, stderr, compiler output, runtime, and memory. All attempts are logged.

### `POST /api/feedback`

```json
{
  "sessionId": "<uuid>",
  "assignmentId": "<uuid>",
  "code": "for i in range(3): print(i)",
  "explanation": "",
  "executionOutput": "STDOUT\n0\n1\n2"
}
```

Returns formative AI feedback and the per-question request number. Every successful interaction is stored in `ai_feedback_logs`.

### `POST /api/submissions/finalize`

```json
{
  "sessionId": "<uuid>",
  "assignmentId": "<uuid>",
  "code": "final code",
  "explanation": "final explanation"
}
```

Locks the current question and either returns the next randomized assignment or the three-question review payload.

### `GET /api/modality/review?sessionId=<uuid>&modalityId=problem-solving`

Returns the three finalized responses for review.

### `POST /api/modality/complete`

```json
{ "sessionId": "<uuid>", "modalityId": "problem-solving" }
```

Creates the modality completion record and locks the modality. When all three modalities are complete, marks the study session complete.

## Admin APIs

All admin APIs require:

```text
X-Admin-Token: <ADMIN_TOKEN>
```

- `GET /api/admin/dashboard` — aggregate and participant/session metrics.
- `GET /api/admin/export.csv` — full research export as sectioned CSV.
- `GET /api/admin/export.xlsx` — multi-sheet Excel export.

## Example database records

### `participants`

```json
{
  "id": "a00c3d9f-...",
  "participant_code": "P2011",
  "created_at": "2026-09-03T21:00:00Z"
}
```

### `study_sessions`

```json
{
  "id": "9cd15c6b-...",
  "participant_id": "a00c3d9f-...",
  "language": "python",
  "session_label": "study-2026",
  "randomization_seed": "8b4d...",
  "status": "active",
  "started_at": "2026-09-03T21:02:00Z"
}
```

### `question_assignments`

```json
{
  "id": "48ac1bb0-...",
  "session_id": "9cd15c6b-...",
  "modality_id": "debugging",
  "question_id": "PY-DBG-14",
  "question_order": 1,
  "status": "in_progress",
  "assigned_at": "2026-09-03T21:05:00Z",
  "started_at": "2026-09-03T21:05:00Z"
}
```

### `execution_logs`

```json
{
  "assignment_id": "48ac1bb0-...",
  "language": "python",
  "source_code": "for n in range(3): print(n)",
  "stdout": "0\n1\n2\n",
  "stderr": null,
  "compile_output": null,
  "status": "Accepted",
  "runtime_ms": 31,
  "provider": "judge0"
}
```

### `ai_feedback_logs`

```json
{
  "assignment_id": "48ac1bb0-...",
  "language": "python",
  "modality_id": "debugging",
  "request_number": 1,
  "student_code": "...",
  "execution_output": "...",
  "feedback": "Your loop structure is close. Check the range boundary...",
  "model": "gpt-5.5",
  "requested_at": "2026-09-03T21:08:00Z",
  "responded_at": "2026-09-03T21:08:01Z",
  "latency_ms": 932
}
```

## Entity relationship summary

```text
participants (1) ----< study_sessions (1) ----< question_assignments >---- (1) questions
                              |                         |
                              |                         +---- (1) submissions
                              |                         +----< draft_events
                              |                         +----< execution_logs
                              |                         +----< ai_feedback_logs
                              |
                              +----< modality_completions
                              +----< analytics_events

modalities (1) ----< questions
modalities (1) ----< question_assignments
modalities (1) ----< modality_completions
```
