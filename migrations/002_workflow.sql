-- Additive v3 migration. Does not delete or relabel legacy research records.
alter table public.study_sessions alter column language drop not null;
alter table public.study_sessions add column if not exists study_key text;
alter table public.study_sessions add column if not exists session_number integer check (session_number between 1 and 3);
alter table public.study_sessions add column if not exists topic text;
alter table public.study_sessions add column if not exists workflow_version text;
alter table public.study_sessions add column if not exists protocol_snapshot jsonb;
alter table public.study_sessions add column if not exists is_test boolean not null default false;
alter table public.study_sessions add column if not exists consented_at timestamptz;
alter table public.study_sessions add column if not exists coding_completed_at timestamptz;
alter table public.study_sessions add column if not exists withdrawal_requested_at timestamptz;
alter table public.study_sessions add column if not exists entry_locked_at timestamptz;
-- The old single-active-session constraint prevents longitudinal waves.
drop index if exists public.one_active_session_per_participant;
create unique index if not exists cw_unique_wave on public.study_sessions(participant_id, study_key, session_number)
  where workflow_version is not null;
alter table public.question_assignments add column if not exists question_snapshot jsonb;
-- Freeze the grading concepts into pre-v4.0.3 assignment snapshots so later question-bank
-- revisions cannot silently change the scoring context of an already assigned question.
update public.question_assignments qa
set question_snapshot = qa.question_snapshot || jsonb_build_object('expected_concepts', q.expected_concepts)
from public.questions q
where qa.question_id=q.id and qa.question_snapshot is not null and not (qa.question_snapshot ? 'expected_concepts');
alter table public.submissions add column if not exists revision integer not null default 0;
alter table public.submissions add column if not exists draft_inputs jsonb not null default '{}'::jsonb;
alter table public.submissions add column if not exists final_inputs jsonb;
alter table public.submissions add column if not exists skipped boolean not null default false;
alter table public.submissions add column if not exists final_request_id uuid;
alter table public.submissions add column if not exists last_save_request_id uuid;
alter table public.submissions add column if not exists final_score integer check(final_score between 0 and 100);
alter table public.submissions add column if not exists score_details jsonb;
alter table public.draft_events add column if not exists input_snapshot jsonb;

create table if not exists public.cw_studies (
  study_key text primary key, config jsonb not null, revision integer not null default 1,
  updated_at timestamptz not null default now()
);

-- v4.0.2: if an existing deployment still has the old untouched placeholder
-- delivery settings, align them with the supplied in-person consent without
-- overwriting a researcher-customized configuration.
update public.cw_studies
set config = jsonb_set(
      jsonb_set(config, '{deliveryMode}', to_jsonb('in_person'::text), true),
      '{durationText}', to_jsonb('Each study session will take about 65 minutes.'::text), true
    ),
    revision = revision + 1,
    updated_at = now()
where study_key = 'programming-practice-16317'
  and config->>'deliveryMode' = 'remote'
  and config->>'durationText' = 'The supplied consent describes about 65 minutes per session. Timing for this expanded workflow needs confirmation.';
create table if not exists public.cw_participant_auth (
  participant_id uuid primary key references public.participants(id) on delete restrict,
  secret_hash text not null, preferred_language text check(preferred_language in ('python','java')),
  is_test boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.cw_access_tokens (
  token_hash text primary key, participant_id uuid not null references public.participants(id) on delete cascade,
  expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists cw_tokens_expiry on public.cw_access_tokens(expires_at);
create table if not exists public.cw_rate_limits (
  bucket text primary key, hits integer not null, expires_at timestamptz not null
);
create table if not exists public.cw_question_banks (
  bank_hash text primary key,
  definitions jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists cw_rates_expiry on public.cw_rate_limits(expires_at);
create table if not exists public.cw_stage_progress (
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  stage_key text not null, ordinal integer not null,
  status text not null check(status in ('pending','in_progress','completed','skipped','disabled','declined')),
  definition jsonb not null, responses jsonb not null default '{}'::jsonb,
  scoring jsonb, revision integer not null default 0, final_request_id uuid,
  first_viewed_at timestamptz, saved_at timestamptz, completed_at timestamptz,
  active_seconds integer not null default 0, last_heartbeat timestamptz,
  primary key(session_id,stage_key), unique(session_id,ordinal)
);
create table if not exists public.cw_private_consents (
  id uuid primary key default gen_random_uuid(), session_id uuid not null unique references public.study_sessions(id),
  document_version text not null, document_hash text not null, document_snapshot jsonb not null,
  signature_envelope jsonb not null, signed_at timestamptz not null default now()
);
create table if not exists public.cw_compensation_claims (
  id uuid primary key, amount numeric(8,2) not null, currency text not null,
  contact_envelope jsonb, status text not null check(status in ('requested','contact_pending','declined','paid')),
  is_test boolean not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.cw_compensation_links (
  session_id uuid primary key references public.study_sessions(id),
  claim_id uuid not null unique references public.cw_compensation_claims(id)
);
create table if not exists public.cw_operations (
  id uuid primary key, assignment_id uuid not null references public.question_assignments(id),
  session_id uuid not null references public.study_sessions(id), kind text not null check(kind in ('execute','feedback','score')),
  request_number integer not null, request_id uuid not null,
  payload jsonb not null, result jsonb, status text not null check(status in ('pending','succeeded','failed','interrupted')),
  requested_at timestamptz not null default now(), completed_at timestamptz,
  unique(assignment_id,kind,request_id), unique(assignment_id,kind,request_number)
);
create index if not exists cw_operations_session on public.cw_operations(session_id,requested_at);
create index if not exists cw_operations_assignment_recent on public.cw_operations(assignment_id,kind,requested_at desc);
create table if not exists public.cw_audit_events (
  id bigint generated by default as identity primary key, event_type text not null,
  session_id uuid references public.study_sessions(id), participant_id uuid references public.participants(id),
  metadata jsonb not null default '{}'::jsonb, recorded_at timestamptz not null default now()
);

alter table public.cw_stage_progress add column if not exists last_save_request_id uuid;
alter table public.cw_operations add column if not exists displayed_at timestamptz;
alter table public.cw_operations drop constraint if exists cw_operations_kind_check;
alter table public.cw_operations add constraint cw_operations_kind_check check(kind in ('execute','feedback','score'));

-- One restricted RPC boundary makes critical transitions atomic. Only the trusted
-- backend can execute it. p.pid ALWAYS comes from server authentication, never the browser.
create or replace function public.cw_rpc(action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  s study_sessions%rowtype; st cw_stage_progress%rowtype; a question_assignments%rowtype;
  sub submissions%rowtype; au cw_participant_auth%rowtype; op cw_operations%rowtype;
  pid uuid; sid uuid; current_key text; result jsonb; x jsonb; n integer; cnt integer;
  cfg jsonb; tmp text; claim uuid; latest bigint; now_at timestamptz := clock_timestamp();
begin
  if action='config_init' then
    insert into cw_studies(study_key,config) values(p->>'studyKey',p->'config') on conflict do nothing;
    return (select to_jsonb(c) from cw_studies c where study_key=p->>'studyKey');
  elsif action='config_get' then
    return (select to_jsonb(c) from cw_studies c where study_key=p->>'studyKey');
  elsif action='config_save' then
    update cw_studies set config=p->'config', revision=revision+1, updated_at=now_at
    where study_key=p->>'studyKey' and revision=(p->>'revision')::integer returning to_jsonb(cw_studies.*) into result;
    if result is null then raise exception 'CONFLICT: Configuration changed. Reload first.'; end if;
    insert into cw_audit_events(event_type,metadata) values('configuration_updated',jsonb_build_object('studyKey',p->>'studyKey','revision',result->'revision'));
    return result;
  elsif action='rate' then
    if coalesce((p->>'cleanup')::boolean,false) then
      delete from cw_rate_limits where expires_at < now_at - interval '1 day';
    end if;
    insert into cw_rate_limits(bucket,hits,expires_at) values(p->>'bucket',1,now_at+make_interval(secs=>(p->>'seconds')::integer))
    on conflict(bucket) do update set hits=case when cw_rate_limits.expires_at<=now_at then 1 else cw_rate_limits.hits+1 end,
      expires_at=case when cw_rate_limits.expires_at<=now_at then excluded.expires_at else cw_rate_limits.expires_at end
    returning hits into n;
    return jsonb_build_object('allowed',n <= (p->>'limit')::integer);
  elsif action='enroll' then
    insert into participants(participant_code) values(p->>'code') on conflict(participant_code) do nothing;
    select id into pid from participants where participant_code=p->>'code';
    if exists(select 1 from cw_participant_auth where participant_id=pid) then raise exception 'CONFLICT: Participant already has an access key. Use reset.'; end if;
    insert into cw_participant_auth(participant_id,secret_hash,preferred_language,is_test) values(pid,p->>'hash',nullif(p->>'language',''),(p->>'isTest')::boolean);
    insert into cw_audit_events(event_type,participant_id,metadata) values('participant_enrolled',pid,jsonb_build_object('isTest',p->'isTest'));
    return jsonb_build_object('participantId',pid,'code',p->>'code');
  elsif action='auth_lookup' then
    return (select to_jsonb(ca) || jsonb_build_object('code',pa.participant_code) from cw_participant_auth ca join participants pa on pa.id=ca.participant_id where pa.participant_code=p->>'code');
  elsif action='credentials_reset' then
    select id into pid from participants where participant_code=p->>'code';
    update cw_participant_auth set secret_hash=p->>'hash' where participant_id=pid;
    if not found then raise exception 'NOT_FOUND: Participant not enrolled.'; end if;
    delete from cw_access_tokens where participant_id=pid;
    insert into cw_audit_events(event_type,participant_id) values('participant_access_key_reset',pid);
    return jsonb_build_object('reset',true);
  elsif action='token_issue' then
    delete from cw_access_tokens where expires_at<now_at;
    insert into cw_access_tokens(token_hash,participant_id,expires_at) values(p->>'hash',(p->>'pid')::uuid,now_at+interval '7 days');
    return jsonb_build_object('ok',true);
  elsif action='token_get' then
    return (select jsonb_build_object('pid',t.participant_id,'code',pa.participant_code,'isTest',ca.is_test,'preferredLanguage',ca.preferred_language)
      from cw_access_tokens t join participants pa on pa.id=t.participant_id join cw_participant_auth ca on ca.participant_id=t.participant_id
      where t.token_hash=p->>'hash' and t.expires_at>now_at);
  elsif action='token_delete' then
    delete from cw_access_tokens where token_hash=p->>'hash'; return '{}'::jsonb;
  elsif action='account' then
    return jsonb_build_object('sessions',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'number',ss.session_number,'label',ss.session_label,'language',ss.language,'status',ss.status,'entryLockedAt',ss.entry_locked_at,'startedAt',ss.started_at,'completedAt',ss.completed_at) order by ss.session_number)
      from study_sessions ss where ss.participant_id=(p->>'pid')::uuid and ss.study_key=p->>'studyKey' and ss.workflow_version is not null),'[]'::jsonb));
  elsif action='session_start' then
    pid:=(p->>'pid')::uuid;
    select * into au from cw_participant_auth where participant_id=pid for update;
    if not found then raise exception 'FORBIDDEN: Unknown participant.'; end if;
    select * into s from study_sessions where participant_id=pid and study_key=p->>'studyKey' and session_number=(p->>'number')::integer and workflow_version is not null;
    if found then return to_jsonb(s); end if;
    insert into study_sessions(participant_id,language,session_label,randomization_seed,status,study_key,session_number,topic,workflow_version,protocol_snapshot,is_test)
      values(pid,au.preferred_language,p->>'label',p->>'seed','active',p->>'studyKey',(p->>'number')::integer,p->>'topic',p->>'version',p->'snapshot',au.is_test) returning * into s;
    for x in select value from jsonb_array_elements(p->'stages') loop
      insert into cw_stage_progress(session_id,stage_key,ordinal,status,definition)
        values(s.id,x->>'key',(x->>'ordinal')::integer,case when (x->>'enabled')::boolean then 'pending' else 'disabled' end,x);
    end loop;
    insert into cw_audit_events(event_type,session_id,participant_id,metadata) values('session_created',s.id,pid,jsonb_build_object('number',s.session_number,'isTest',s.is_test));
    return to_jsonb(s);
  elsif action='bank_release' then
    return coalesce((select jsonb_agg(x.value order by x.value->>'id')
      from cw_question_banks b cross join lateral jsonb_array_elements(b.definitions) x(value)
      where b.bank_hash=p->>'bankHash' and x.value->>'language'=p->>'language'
        and coalesce((x.value->>'active')::boolean,true)
        and x.value->>'modality_id' in ('problem-solving','debugging','code-explanation')),'[]'::jsonb);
  elsif action='bank' then
    return coalesce((select jsonb_agg(to_jsonb(q) order by q.id) from questions q where q.active and q.modality_id in ('problem-solving','debugging','code-explanation') and q.language=p->>'language'),'[]'::jsonb);
  elsif action='used_questions' then
    return coalesce((select jsonb_agg(qa.question_id) from question_assignments qa join study_sessions ss on ss.id=qa.session_id
      where ss.participant_id=(p->>'pid')::uuid and ss.study_key=p->>'studyKey' and ss.id<>(p->>'sid')::uuid),'[]'::jsonb);
  elsif action='admin_export' then
    -- Explicit allowlist; NEVER include auth, consent signatures, payment contacts or protocol answer keys.
    tmp:=p->>'table'; n:=least(greatest(coalesce((p->>'limit')::integer,1000),1),1000); cnt:=greatest(coalesce((p->>'offset')::integer,0),0);
    if tmp='participants' then
      return coalesce((select jsonb_agg(to_jsonb(z)) from (select pa.id,pa.participant_code,pa.created_at,ca.is_test from participants pa left join cw_participant_auth ca on ca.participant_id=pa.id order by pa.id limit n offset cnt) z),'[]');
    elsif tmp='sessions' then
      return coalesce((select jsonb_agg(to_jsonb(z)) from (select ss.id,pa.participant_code as participant_code,ss.participant_id,ss.study_key,ss.session_number,ss.session_label,ss.language,ss.workflow_version,ss.is_test,ss.status,ss.entry_locked_at,ss.started_at,ss.completed_at,ss.consented_at,ss.coding_completed_at,ss.withdrawal_requested_at,ss.randomization_seed,ss.protocol_snapshot->>'contentHash' as content_hash,ss.protocol_snapshot->'config'->>'activityDesign' as activity_design from study_sessions ss join participants pa on pa.id=ss.participant_id order by ss.id limit n offset cnt) z),'[]');
    elsif tmp='stages' then
      return coalesce((select jsonb_agg(to_jsonb(z)) from (select session_id,stage_key,status,responses,scoring,revision,first_viewed_at,saved_at,completed_at,active_seconds,definition->>'version' as instrument_version from cw_stage_progress order by session_id,ordinal limit n offset cnt) z),'[]');
    elsif tmp='assignments' then
      return coalesce((select jsonb_agg(to_jsonb(z)) from (select * from question_assignments order by id limit n offset cnt) z),'[]');
    elsif tmp='submissions' then
      return coalesce((select jsonb_agg(to_jsonb(z)) from (select * from submissions order by id limit n offset cnt) z),'[]');
    elsif tmp='operations' then
      return coalesce((select jsonb_agg(to_jsonb(z)) from (select * from cw_operations order by id limit n offset cnt) z),'[]');
    elsif tmp='drafts' then
      return coalesce((select jsonb_agg(to_jsonb(z)) from (select * from draft_events order by id limit n offset cnt) z),'[]');
    elsif tmp='events' then
      return coalesce((select jsonb_agg(to_jsonb(z)) from (select * from cw_audit_events where event_type <> 'compensation_marked_paid' order by id limit n offset cnt) z),'[]');
    elsif tmp='modalities' then
      return coalesce((select jsonb_agg(to_jsonb(z)) from (select * from modality_completions order by id limit n offset cnt) z),'[]');
    else raise exception 'INVALID: Export table not allowed.'; end if;
  elsif action='payment_list' then
    return coalesce((select jsonb_agg(to_jsonb(z)) from (select * from cw_compensation_claims order by created_at desc limit 1000) z),'[]');
  elsif action='payment_paid' then
    update cw_compensation_claims set status='paid',updated_at=now_at where id=(p->>'claimId')::uuid and status='requested' returning to_jsonb(cw_compensation_claims.*) into result;
    if result is null then raise exception 'CONFLICT: Only a requested claim can be marked paid.'; end if;
    insert into cw_audit_events(event_type,metadata) values('compensation_marked_paid',jsonb_build_object('claimId',p->>'claimId'));
    return result;
  end if;

  -- All remaining participant operations bind the session to authenticated PID.
  sid:=(p->>'sid')::uuid; pid:=(p->>'pid')::uuid;
  select * into s from study_sessions where id=sid and participant_id=pid and workflow_version is not null for update;
  if not found then raise exception 'NOT_FOUND: Session not found.'; end if;
  select stage_key into current_key from cw_stage_progress where session_id=s.id and status in ('pending','in_progress') order by ordinal limit 1;
  if action='state' then
    return jsonb_build_object('session',to_jsonb(s),'current',current_key,
      'stages',coalesce((select jsonb_agg(to_jsonb(sp) order by ordinal) from cw_stage_progress sp where session_id=s.id),'[]'),
      'modalities',coalesce((select jsonb_agg(to_jsonb(mc)) from modality_completions mc where session_id=s.id),'[]'));
  elsif action='consent_receipt' then
    return (select to_jsonb(c) from cw_private_consents c where session_id=s.id);
  elsif action='claim_get' then
    return (select jsonb_build_object('id',c.id,'status',c.status,'amount',c.amount,'currency',c.currency,'contactProvided',c.contact_envelope is not null) from cw_compensation_links l join cw_compensation_claims c on c.id=l.claim_id where l.session_id=s.id);
  elsif action='claim_update' then
    if s.consented_at is null then raise exception 'FORBIDDEN: Consent is required.'; end if;
    update cw_compensation_claims c set contact_envelope=p->'envelope',status='requested',updated_at=now_at
      from cw_compensation_links l where l.claim_id=c.id and l.session_id=s.id and c.status in ('contact_pending','requested') returning c.id into claim;
    if claim is null then raise exception 'CONFLICT: This claim cannot be updated.'; end if;
    return jsonb_build_object('id',claim,'saved',true);
  elsif action='withdraw' then
    update study_sessions set status=case when status='active' then 'withdrawn' else status end,
      withdrawal_requested_at=case when coalesce((p->>'requestDataWithdrawal')::boolean,false) then now_at else withdrawal_requested_at end,last_seen_at=now_at where id=s.id;
    insert into cw_audit_events(event_type,session_id,participant_id,metadata) values('participation_stopped',s.id,pid,jsonb_build_object('dataWithdrawalRequested',p->'requestDataWithdrawal'));
    return jsonb_build_object('saved',true);
  end if;
  if action='operation_displayed' then
    update cw_operations set displayed_at=coalesce(displayed_at,now_at) where id=(p->>'id')::uuid and session_id=s.id and status='succeeded';
    return jsonb_build_object('recorded',found);
  elsif action='operation_finish' then
    update cw_operations set status=p->>'status',result=p->'result',completed_at=now_at where id=(p->>'id')::uuid and session_id=s.id and assignment_id=(p->>'assignmentId')::uuid and status='pending' returning * into op;
    return to_jsonb(op);
  elsif action='stage_save' then
    select * into st from cw_stage_progress where session_id=s.id and stage_key=p->>'stage';
    if st.last_save_request_id=(p->>'requestId')::uuid or st.final_request_id=(p->>'requestId')::uuid then return to_jsonb(st); end if;
  end if;
  if s.status<>'active' then raise exception 'CONFLICT: This session is not active.'; end if;

  if action in ('stage_open','stage_save','heartbeat') then
    select * into st from cw_stage_progress where session_id=s.id and stage_key=p->>'stage' for update;
    if not found then raise exception 'NOT_FOUND: Unknown stage.'; end if;
    if action='stage_save' and st.status in ('completed','skipped') and st.final_request_id=(p->>'requestId')::uuid then return to_jsonb(st); end if;
    if current_key is distinct from st.stage_key then raise exception 'CONFLICT: Complete the current stage first.'; end if;
    if action='stage_open' then
      update cw_stage_progress set status='in_progress',first_viewed_at=coalesce(first_viewed_at,now_at) where session_id=s.id and stage_key=st.stage_key returning * into st;
      return to_jsonb(st);
    elsif action='heartbeat' then
      if s.consented_at is not null then
        update cw_stage_progress set active_seconds=active_seconds+case when last_heartbeat is null then 0 else least(30,greatest(0,floor(extract(epoch from (now_at-last_heartbeat)))::integer)) end,last_heartbeat=now_at where session_id=s.id and stage_key=st.stage_key;
      end if;
      return jsonb_build_object('ok',true);
    end if;
    if st.revision<>(p->>'revision')::integer then raise exception 'CONFLICT: A newer response exists. Reload before saving.'; end if;
    if (p->>'final')::boolean then
      if st.stage_key='eligibility' and not coalesce((p->'responses'->>'eligible')::boolean,false) then
        update study_sessions set status='withdrawn' where id=s.id;
        update cw_stage_progress set status='declined',responses='{}',completed_at=now_at,saved_at=now_at,final_request_id=(p->>'requestId')::uuid,last_save_request_id=(p->>'requestId')::uuid,revision=revision+1 where session_id=s.id and stage_key=st.stage_key returning * into st;
        return to_jsonb(st);
      elsif st.stage_key='consent' then
        if not coalesce((p->'responses'->>'consented')::boolean,false) then raise exception 'INVALID: Consent is required to continue.'; end if;
        insert into cw_private_consents(session_id,document_version,document_hash,document_snapshot,signature_envelope)
          values(s.id,p->>'documentVersion',p->>'documentHash',p->'document',p->'signature');
        update study_sessions set consented_at=now_at where id=s.id;
      elsif st.stage_key='language' then
        if p->'responses'->>'language' not in ('python','java') then raise exception 'INVALID: Select a language.'; end if;
        select * into au from cw_participant_auth where participant_id=pid for update;
        if au.preferred_language is not null and au.preferred_language<>p->'responses'->>'language' then raise exception 'CONFLICT: Language is fixed across study sessions.'; end if;
        update cw_participant_auth set preferred_language=p->'responses'->>'language' where participant_id=pid;
        update study_sessions set language=p->'responses'->>'language' where id=s.id;
      elsif st.stage_key='coding' and not coalesce((p->>'skipped')::boolean,false) then
        select count(*) into cnt from modality_completions where session_id=s.id and modality_id in ('problem-solving','debugging','code-explanation');
        if cnt<>3 then raise exception 'CONFLICT: Complete the three modalities first.'; end if;
        update study_sessions set coding_completed_at=now_at where id=s.id;
      elsif st.stage_key='incentive' then
        claim:=(p->>'claimId')::uuid;
        insert into cw_compensation_claims(id,amount,currency,contact_envelope,status,is_test)
          values(claim,(s.protocol_snapshot->'config'->'compensation'->>'amount')::numeric,s.protocol_snapshot->'config'->'compensation'->>'currency',nullif(p->'contact','null'::jsonb),p->>'claimStatus',s.is_test);
        insert into cw_compensation_links(session_id,claim_id) values(s.id,claim);
      end if;
    end if;
    update cw_stage_progress set responses=coalesce(p->'responses','{}'), scoring=p->'scoring',revision=revision+1,last_save_request_id=(p->>'requestId')::uuid,
      first_viewed_at=coalesce(first_viewed_at,now_at),saved_at=now_at,
      status=case when (p->>'final')::boolean then case when coalesce((p->>'skipped')::boolean,false) then 'skipped' else 'completed' end else 'in_progress' end,
      completed_at=case when (p->>'final')::boolean then now_at else null end,
      final_request_id=case when (p->>'final')::boolean then (p->>'requestId')::uuid else null end
      where session_id=s.id and stage_key=st.stage_key returning * into st;
    if (p->>'final')::boolean then
      insert into cw_audit_events(event_type,session_id,participant_id,metadata) values('stage_completed',s.id,pid,jsonb_build_object('stage',st.stage_key,'status',st.status,'revision',st.revision));
      select stage_key into current_key from cw_stage_progress where session_id=s.id and status in ('pending','in_progress') order by ordinal limit 1;
      if current_key='completion' then
        update cw_stage_progress set status='completed',first_viewed_at=now_at,completed_at=now_at where session_id=s.id and stage_key='completion';
        update study_sessions set status='completed',completed_at=now_at,last_seen_at=now_at where id=s.id;
        insert into cw_audit_events(event_type,session_id,participant_id) values('session_completed',s.id,pid);
      end if;
    end if;
    return to_jsonb(st);
  end if;

  if current_key is distinct from 'coding' or s.consented_at is null or s.language is null then raise exception 'FORBIDDEN: Coding is locked until previous stages are completed.'; end if;
  if action='coding_start' then
    tmp:=p->>'modality';
    if tmp not in ('problem-solving','debugging','code-explanation') then raise exception 'INVALID: Unknown modality.'; end if;
    if exists(select 1 from modality_completions where session_id=s.id and modality_id=tmp) then raise exception 'CONFLICT: This modality is complete.'; end if;
    if s.protocol_snapshot->'config'->>'activityDesign'='assigned_crossover' then
      for x in select value from jsonb_array_elements(s.protocol_snapshot->'modalityOrder') loop
        exit when x#>>'{}'=tmp;
        if not exists(select 1 from modality_completions where session_id=s.id and modality_id=x#>>'{}') then raise exception 'CONFLICT: Complete the assigned modality order.'; end if;
      end loop;
    end if;
    if not exists(select 1 from question_assignments where session_id=s.id and modality_id=tmp) then
      if coalesce((p->>'lookupOnly')::boolean,false) then return null; end if;
      -- Serialize new allocations across waves of the same participant. A concurrent
      -- wave can win after the API read its candidate bank; ask the client to retry.
      perform 1 from cw_participant_auth where participant_id=pid for update;
      if coalesce((s.protocol_snapshot->'config'->>'avoidRepeatedQuestions')::boolean,false) and exists(
        select 1 from question_assignments qa join study_sessions ss on ss.id=qa.session_id
        where ss.participant_id=pid and ss.study_key=s.study_key and ss.id<>s.id
        and qa.question_id in (select value->>'id' from jsonb_array_elements(p->'questions'))
      ) then raise exception 'CONFLICT: Another session allocated an overlapping question. Retry opening this modality.'; end if;
      n:=0;
      for x in select value from jsonb_array_elements(p->'questions') loop
        n:=n+1;
        insert into question_assignments(session_id,modality_id,question_id,question_order,question_snapshot)
          values(s.id,tmp,x->>'id',n,x);
      end loop;
      if n <> (
        case
          when s.protocol_snapshot->'config'->>'activityDesign' = 'assigned_crossover' then
            case
              when (s.protocol_snapshot->'modalityOrder'->>0) = tmp then 2
              else 1
            end
          else 3
        end
      ) then
        raise exception 'INVALID: Invalid question assignment count.';
      end if;
      insert into cw_audit_events(event_type,session_id,participant_id,metadata) values('questions_assigned',s.id,pid,jsonb_build_object('modality',tmp,'questionIds',p->'questionIds'));
    end if;
    select * into a from question_assignments where session_id=s.id and modality_id=tmp and status<>'completed' order by question_order limit 1;
    if found then
      update question_assignments set status='in_progress',started_at=coalesce(started_at,now_at) where id=a.id returning * into a;
      insert into submissions(assignment_id,draft_code,draft_explanation,draft_inputs) values(a.id,coalesce(a.question_snapshot->>'starter_code',''),'','{}') on conflict do nothing;
      return jsonb_build_object('assignment',to_jsonb(a),'submission',(select to_jsonb(ss) from submissions ss where assignment_id=a.id),'operations',coalesce((select jsonb_agg(to_jsonb(o) order by requested_at) from cw_operations o where assignment_id=a.id),'[]'),
        'total',(select count(*) from question_assignments where session_id=s.id and modality_id=tmp));
    end if;
    return jsonb_build_object('review',coalesce((select jsonb_agg(jsonb_build_object('assignment',to_jsonb(qa),'submission',to_jsonb(sb)) order by qa.question_order) from question_assignments qa left join submissions sb on sb.assignment_id=qa.id where qa.session_id=s.id and qa.modality_id=tmp),'[]'));
  elsif action='modality_complete' then
    tmp:=p->>'modality';
    select count(*),count(*) filter(where status<>'completed') into n,cnt from question_assignments where session_id=s.id and modality_id=tmp;
    if n=0 or cnt>0 then raise exception 'CONFLICT: Save all assigned questions first.'; end if;
    insert into modality_completions(session_id,modality_id,started_at,completed_at,duration_seconds)
      select s.id,tmp,min(started_at),now_at,greatest(0,floor(extract(epoch from(now_at-min(started_at))))::integer) from question_assignments where session_id=s.id and modality_id=tmp
      on conflict(session_id,modality_id) do nothing;
    return jsonb_build_object('saved',true);
  end if;
  select * into a from question_assignments where id=(p->>'assignmentId')::uuid and session_id=s.id for update;
  if not found then raise exception 'NOT_FOUND: Assignment not found.'; end if;
  if exists(select 1 from question_assignments where session_id=s.id and modality_id=a.modality_id and question_order<a.question_order and status<>'completed') then raise exception 'FORBIDDEN: Future questions are locked.'; end if;
  if action='assignment_get' then return to_jsonb(a)||jsonb_build_object('last_execution',(select to_jsonb(o) from cw_operations o where assignment_id=a.id and kind='execute' and status='succeeded' order by requested_at desc limit 1),'last_score',(select to_jsonb(o) from cw_operations o where assignment_id=a.id and kind in ('execute','score') and status='succeeded' and (case when o.kind='execute' then o.result ? 'score' else true end) order by requested_at desc limit 1)); end if;
  select * into sub from submissions where assignment_id=a.id for update;
  if action='assignment_save' and (sub.final_request_id=(p->>'requestId')::uuid or sub.last_save_request_id=(p->>'requestId')::uuid) then return to_jsonb(sub); end if;
  if a.status<>'in_progress' then raise exception 'CONFLICT: This question is not open for changes.'; end if;
  if action='assignment_save' then
    if sub.revision<>(p->>'revision')::integer then raise exception 'CONFLICT: A newer draft exists. Reload before saving.'; end if;
    update submissions set draft_code=p->>'code',draft_explanation=p->>'explanation',draft_inputs=p->'inputs',revision=revision+1,last_save_request_id=(p->>'requestId')::uuid,updated_at=now_at,
      status=case when (p->>'final')::boolean then 'final' else 'draft' end,
      final_code=case when (p->>'final')::boolean then p->>'code' else final_code end,
      final_explanation=case when (p->>'final')::boolean then p->>'explanation' else final_explanation end,
      final_inputs=case when (p->>'final')::boolean then p->'inputs' else final_inputs end,
      final_output=case when (p->>'final')::boolean then (select o.result->>'stdout' from cw_operations o where o.assignment_id=a.id and o.kind='execute' and o.status='succeeded' and o.payload->>'code'=p->>'code' and o.payload->'inputValues'=p->'inputs' order by requested_at desc limit 1) else final_output end,
      final_score=case when (p->>'final')::boolean then nullif(p->'score'->>'score','')::integer else final_score end,
      score_details=case when (p->>'final')::boolean then p->'score' else score_details end,
      skipped=coalesce((p->>'skipped')::boolean,false),saved_at=case when (p->>'final')::boolean then now_at else null end,
      final_request_id=case when (p->>'final')::boolean then (p->>'requestId')::uuid else null end
      where assignment_id=a.id returning * into sub;
    insert into draft_events(assignment_id,code_snapshot,explanation_snapshot,input_snapshot) values(a.id,p->>'code',p->>'explanation',p->'inputs');
    if (p->>'final')::boolean then
      update question_assignments set status='completed',completed_at=now_at where id=a.id;
      if coalesce((s.protocol_snapshot->'config'->>'preventDuplicateEntries')::boolean,false) and s.entry_locked_at is null then
        update study_sessions set entry_locked_at=now_at where id=s.id returning * into s;
      end if;
      insert into cw_audit_events(event_type,session_id,participant_id,metadata) values('question_finalized',s.id,pid,jsonb_build_object('assignmentId',a.id,'skipped',sub.skipped));
    end if;
    return to_jsonb(sub);
  elsif action='operation_begin' then
    update cw_operations set status='interrupted',completed_at=now_at,result='{"error":"Server restart or provider timeout; delivery is unknown."}'::jsonb
      where assignment_id=a.id and status='pending' and requested_at<now_at-interval '3 minutes';
    select * into op from cw_operations where assignment_id=a.id and kind=p->>'kind' and request_id=(p->>'requestId')::uuid;
    if found then return to_jsonb(op)||jsonb_build_object('existing',true); end if;
    if exists(select 1 from cw_operations where assignment_id=a.id and status='pending') then raise exception 'CONFLICT: Wait for the current run or feedback request.'; end if;
    select coalesce(max(request_number),0)+1 into n from cw_operations where assignment_id=a.id and kind=p->>'kind';
    if n>(p->>'limit')::integer then raise exception 'LIMIT: The request limit for this question has been reached.'; end if;
    insert into cw_operations(id,assignment_id,session_id,kind,request_number,request_id,payload,status)
      values((p->>'id')::uuid,a.id,s.id,p->>'kind',n,(p->>'requestId')::uuid,p->'payload','pending') returning * into op;
    return to_jsonb(op)||jsonb_build_object('existing',false);
  elsif action='operation_finish' then
    update cw_operations set status=p->>'status',result=p->'result',completed_at=now_at where id=(p->>'id')::uuid and assignment_id=a.id and status='pending' returning * into op;
    return to_jsonb(op);
  end if;
  raise exception 'INVALID: Unknown operation.';
end $$;

-- Explicit database privileges: no public/browser grants or permissive RLS policies.
do $$ declare t text; begin
  foreach t in array array['cw_studies','cw_participant_auth','cw_access_tokens','cw_rate_limits','cw_question_banks','cw_stage_progress','cw_private_consents','cw_compensation_claims','cw_compensation_links','cw_operations','cw_audit_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('grant select, insert, update, delete on table public.%I to service_role',t);
  end loop;
end $$;
grant select,insert,update,delete on public.participants,public.questions,public.study_sessions,public.question_assignments,public.submissions,public.draft_events,public.modality_completions to service_role;
grant usage,select on sequence public.draft_events_id_seq,public.cw_audit_events_id_seq to service_role;
revoke all on function public.cw_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.cw_rpc(text,jsonb) to service_role;
notify pgrst, 'reload schema';
