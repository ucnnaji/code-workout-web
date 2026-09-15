# Database update notes for the programming self-efficacy survey update

No new database schema migration is required solely for this survey change or for the AI-grading diagnostic log. Survey definitions are stored in the application content and copied into each newly created session snapshot. Stage responses and scoring are already stored as JSON.

## Existing v4.0.7 requirement
The deployed database must already include the v4.0.7 workflow migration, including the `score_cache_get` action used by stable AI scoring. If you have not successfully run the v4.0.7 migration, run **one** of the generated entry-point files (`supabase_upgrade.sql` is recommended for an existing project). Do not run all three because they are intentionally equivalent entry points.

## Existing sessions
Do not rewrite historical session snapshots. A session that was started before this survey update retains the survey definition it started with. Use a new test participant/session to verify the new survey.

## Verification
Run `verify_database_v4.0.8.sql` in the Supabase SQL Editor. It is read-only and checks that the main workflow function exists.
