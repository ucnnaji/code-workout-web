-- Read-only verification for the survey + AI diagnostics update.
-- This update introduces no new schema objects. It verifies the workflow RPC
-- needed by the existing v4.0.7 stable-scoring implementation is installed.

select
  to_regprocedure('public.cw_rpc(text,jsonb)') is not null as cw_rpc_present,
  case
    when to_regprocedure('public.cw_rpc(text,jsonb)') is not null then 'OK: workflow RPC is installed'
    else 'MISSING: run the existing supabase_upgrade.sql from v4.0.7'
  end as status;

-- Optional informational check: show the latest session snapshots.
-- Older sessions are expected to retain their original survey definition.
select id, session_number, started_at, protocol_snapshot->>'contentHash' as content_hash
from public.study_sessions
order by started_at desc
limit 10;
