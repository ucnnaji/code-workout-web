# Requested workflow modifications in this build

- Startup now stays on a neutral loading screen until public study state is resolved, avoiding the brief returning-participant/login flash.
- Student-facing welcome text replaces the old developer/review-build banner.
- The participant consent page displays the USU IRB protocol number without the internal consent-version identifier.
- After consent, students choose a non-identifying Participant ID and Python/Java study language; the server generates a one-time-display Private Access Key and stores only its salted hash.
- Returning participants resume with Participant ID + Private Access Key.
- Pre- and post-survey item content is preserved; only references to Python/Java are adapted to the participant's selected language.
- Participant-facing session labels are neutral (`Session 1`, `Session 2`, `Session 3`) rather than advertising a programming topic.
- Practice uses four questions total: 2 in the assigned primary modality, 1 in the second modality, 1 in the third modality. Later modalities remain locked until earlier work is complete.
- Judge0-compatible Python/Java sandbox execution is restored with automatic runtime discovery when IDs are not configured.
- Problem Solving and Debugging have Run Code, Program Output, visible scoring, and no explanation textbox.
- Code Explanation keeps the visible read-only code box and explanation textbox, with no Run Code/stdin/output panel; it has a Check Explanation scoring action.
- The editor is compact (approximately 300 px high) with IDE-like editing behavior and Format Code.
- Final per-question scores and scoring details are stored in Supabase.
- Dedicated pre-survey, post-survey, and combined pre/post exports are available from the research dashboard in addition to the workbook export.
- The admin dashboard shows live-release blockers and editable release-review controls while preserving the server-side live-collection safety gate.
- Duplicate-entry protection is enabled by default, records an entry lock after the first finalized research question, and prevents an active locked session from being bypassed by starting another wave.
- The admin dashboard shows entry-lock status in participant tracking.

Existing question text and the supplied consent source are not silently rewritten. Existing workflow sessions retain their versioned snapshot.
