# Safe question-bank updates

`questions.seed.json` is the canonical editable question source. Do not hand-edit the generated `supabase_*.sql` files.

For a wording/code/rubric-concept revision to an existing question, keep its stable `id`, edit the JSON record, and run `npm run build:verify`. The build regenerates all SQL entry files and upserts the current definition by ID. To retire a question without deleting historical references, set `"active": false` instead of removing its ID. For a materially different/new question, prefer a new unique ID.

If a question reads structured stdin, update `content/input-schemas.json` for that ID as part of the same reviewed change. The release hash includes both question definitions and input schemas.

The database stores immutable question-bank releases in `cw_question_banks`. Each session records `questionBankHash`, and every assigned question also stores its full `question_snapshot`, including scoring concepts. Therefore later edits do not silently change the questions or grading context of sessions that already started. The upgrade migration backfills the current bank hash into older workflow sessions and freezes missing scoring concepts in older assignment snapshots.

After any question/content change:

1. Edit `questions.seed.json` (and `content/input-schemas.json` if needed).
2. Run `npm run build:verify` and `npm test`.
3. Review the changed content with the research team.
4. Run the newly generated `supabase_upgrade.sql` once.
5. Re-open the admin release-readiness page. The content hash will have changed, so a prior approval hash will no longer enable new live enrollment until the new content is reviewed/recorded.
6. Deploy the matching application commit. Never deploy changed application content without its matching migration/release record.

The supplied consent file is deliberately not part of this editable-question workflow; its regression hash remains pinned so accidental consent wording changes fail the build.
