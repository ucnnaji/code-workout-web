# Research Scoring and Feedback

This version separates the study's two AI behaviors.

## 1. Formative AI hint

- Available only in the `problem-solving` modality.
- Uses the student's current code plus the most recent server-recorded execution of that exact code.
- The browser cannot supply execution output to the model.
- The prompt is hint-only: no score, no hidden rubric, no complete solution, and no full corrected program.
- Debugging and code-explanation tasks do not expose this feature, and the server rejects attempts to call it for those modalities.

## 2. Common rubric evaluation

- Available in all three active modalities.
- Every scored response is immutable in `rubric_evaluations`.
- The first scored response is `attempt_number = 1`; later changed responses create later attempts.
- Re-evaluating an unchanged response returns the stored score instead of calling the model again.
- The response hash includes question ID, rubric version, scoring prompt version, configured scoring model, code, and explanation.
- Final submission is permitted only when the exact response being finalized already has a stored rubric evaluation.
- Student-facing evaluation feedback is generated deterministically from criterion scores and does not reveal hidden tests or answers.

## Required task rubric

Each question used in data collection must have `questions.scoring_rubric` populated. Evaluation deliberately fails closed when a rubric is absent.

Example rubric structure:

```json
{
  "criteria": [
    {
      "id": "C1",
      "label": "Required calculation",
      "max_score": 2,
      "anchors": {
        "0": "The required calculation is absent or materially incorrect.",
        "1": "The calculation shows the correct approach but contains one material error.",
        "2": "The required calculation is correct."
      }
    },
    {
      "id": "C2",
      "label": "Conditional decision",
      "max_score": 2,
      "anchors": {
        "0": "The decision logic is absent or materially incorrect.",
        "1": "The decision structure is mostly correct but has a boundary, ordering, or completeness error.",
        "2": "The decision logic and relevant boundaries are correct."
      }
    }
  ],
  "reference_facts": [],
  "hidden_tests": [
    {
      "stdin": "10\n20\n",
      "expected_stdout": "example expected output"
    }
  ]
}
```

Set `rubric_version` whenever the rubric meaningfully changes. Once data collection begins, keep the scoring model, scoring prompt version, and rubric version fixed for the study wave.

## Code-explanation integrity

The supplied code is read-only in the browser. Program execution is hidden in the UI and rejected by the server. The server also ignores client-supplied code for code-explanation drafts, evaluations, and final submissions, using the stored starter code instead.

## Database migration

Run `supabase_upgrade.sql` before deploying this version. It adds:

- `questions.scoring_rubric`
- `questions.rubric_version`
- `ai_feedback_logs.prompt_version`
- `rubric_evaluations`

Do not begin research scoring until every active research question has a validated rubric.
