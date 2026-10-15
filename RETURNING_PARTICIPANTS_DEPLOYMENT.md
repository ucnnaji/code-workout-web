# Returning participant continuity and deployment

## Confirmed behavior
- Login authenticates with `participants.participant_code` and `cw_participant_auth.secret_hash`, not a name. A name change does not change this login identifier.
- `session_start` reuses an existing study_session for the same participant UUID, study key and session number, so Session 1 is not replayed or overwritten solely because of login.
- Admin `POST /api/admin/participants/reset` generates a new one-time secret for a verified existing Participant ID. The `credentials_reset` DB action updates `cw_participant_auth.secret_hash`, revokes old session tokens, and does not modify `participants.id` or `study_sessions`. Never auto-generate a replacement ID for recovery.
- A student who has forgotten BOTH ID and access key must contact the research team. Verify identity through an approved private channel and locate their existing ID in an authorized research record; do not search by name on the public login page. If verification is not possible, do not grant access to the old record.

## Deployment
1. Verify a recoverable Supabase backup and approved survey/consent changes.
2. Commit this ZIP's CONTENTS (not the parent folder or the ZIP file) to a GitHub release branch. Do not upload `.env`, participant exports, or secrets.
3. Review DB changes in `supabase_upgrade.sql` in a transaction/maintenance window; run ONLY that entrypoint on the existing Supabase project after backup. The SQL does not need an additional migration solely for the recovery wording change.
4. Check existing `participants`, `cw_participant_auth`, and `study_sessions` rows before and after applying the migration; do not clear/reseed real study tables.
5. Deploy GitHub release branch to the existing Render service during downtime, with `LIVE_COLLECTION_ENABLED=false`, verify `/healthz` and `/readyz`. Keep `PII_ENCRYPTION_KEY` unchanged.
6. Test returning participant login using an approved synthetic account with completed Session 1; verify Session 1 remains completed, Session 2 starts on the SAME participant UUID. Change the test name/contact record and repeat.
7. From Admin, enter the SAME test Participant ID, generate replacement access key, verify old key fails, new key succeeds, and Session 1 remains completed. Never post the key in chat or logs.
8. Test the new required pre/post surveys and all three modalities in both languages, and confirm completed existing Session 1 surveys are not retroactively blocked.
9. Review release/content hash, obtain required study approval, and only then enable production enrollment.

## SQL read-only checks (use test participant ID)
```sql
SELECT p.id, p.participant_code, s.session_number, s.status, s.completed_at
FROM public.participants p
LEFT JOIN public.study_sessions s ON s.participant_id = p.id
WHERE p.participant_code = 'REPLACE_WITH_VERIFIED_TEST_ID'
ORDER BY s.session_number;
```
The participant UUID must be identical across sessions. Do not use a student's name as the join key.

## Constraints
- Automatic unauthenticated recovery is intentionally NOT implemented because it would permit takeover of participant records.
- No real Render/Supabase/Judge0 connection was made from this workspace.
