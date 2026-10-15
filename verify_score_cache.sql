-- READ-ONLY verification for the v4.0.7 stable-score database support.
-- This file does not modify your database.

-- Confirm the main RPC exists.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'cw_rpc';

-- The score_cache_get operation is implemented inside public.cw_rpc,
-- so inspect its definition for that branch.
select
  case
    when pg_get_functiondef(p.oid) ilike '%score_cache_get%'
      then 'OK: score_cache_get branch is present in public.cw_rpc'
    else 'MISSING: score_cache_get branch was not found in public.cw_rpc'
  end as score_cache_status
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'cw_rpc';
