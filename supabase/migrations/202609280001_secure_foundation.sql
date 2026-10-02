-- Initial synthetic-data foundation. Supabase provides auth.uid(), anon and authenticated.
-- Do not expose private or ops through PostgREST. app is an explicit RPC boundary.
create schema app;
create schema private;
create schema ops;
revoke all on schema app, private, ops from public, anon, authenticated;
grant usage on schema app to authenticated;
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema ops revoke execute on functions from public;
alter default privileges in schema app, private, ops revoke all on tables from public, anon, authenticated;
alter default privileges in schema app, private, ops revoke all on sequences from public, anon, authenticated;

create table app.accounts (
 id uuid primary key, status text not null default 'active' check(status in ('active','suspended','closed')),
 created_at timestamptz not null default now()
);
create table app.account_roles (
 account_id uuid references app.accounts(id), role text check(role in ('candidate','employer')),
 primary key(account_id,role)
);
create table app.employers (
 id uuid primary key default gen_random_uuid(), public_name text not null,
 verified_at timestamptz, suspended_at timestamptz
);
create table app.employer_members (
 employer_id uuid references app.employers(id), account_id uuid references app.accounts(id),
 role text not null check(role in ('owner','recruiter','viewer')), revoked_at timestamptz,
 primary key(employer_id,account_id)
);
create index members_account on app.employer_members(account_id);
create table private.candidate_identity (
 candidate_id uuid primary key references app.accounts(id), revision integer not null check(revision > 0),
 legal_name text not null, contact_email text not null, phone text
 -- School disclosure remains production-gated. Never add DOB or precise location here.
);
create table private.candidate_eligibility (
 candidate_id uuid primary key references app.accounts(id), minimum_age_band integer not null check(minimum_age_band in (14,15,16,18)),
 work_attested boolean not null, policy_version text not null,
 refresh_due_at timestamptz not null
 -- Synthetic derived bands only; production collection and refresh policy need legal review.
);
create table app.candidate_profiles (
 candidate_id uuid primary key references app.accounts(id), discoverable boolean not null default false,
 published_version_id uuid
);
create table app.candidate_profile_versions (
 id uuid primary key default gen_random_uuid(), candidate_id uuid not null references app.candidate_profiles(candidate_id),
 headline text not null check(length(headline) between 1 and 60),
 education_level text not null, field text not null, study_status text not null,
 bullets text[] not null check(cardinality(bullets) <= 3), skills text[] not null check(cardinality(skills) <= 8),
 reviewed_at timestamptz not null, approved_at timestamptz not null,
 unique(id,candidate_id)
);
alter table app.candidate_profiles add constraint published_owner foreign key(published_version_id,candidate_id)
 references app.candidate_profile_versions(id,candidate_id);
create table app.jobs (
 id uuid primary key default gen_random_uuid(), employer_id uuid not null references app.employers(id),
 state text not null default 'draft' check(state in ('draft','open','paused','closed')),
 current_version_id uuid, closes_at timestamptz
);
create index jobs_employer on app.jobs(employer_id);
create table app.job_versions (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references app.jobs(id),
 title text not null, pay_min_minor integer not null check(pay_min_minor >= 0),
 pay_max_minor integer not null, currency text not null check(currency = 'CAD'),
 pay_period text not null check(pay_period in ('hour','year')),
 is_vacancy boolean not null, uses_ai_screening boolean not null,
 minimum_age integer not null check(minimum_age in (14,15,16,18)),
 questions text[] not null check(cardinality(questions) between 3 and 5),
 published_at timestamptz not null default now(),
 check(pay_max_minor >= pay_min_minor), unique(id,job_id)
);
alter table app.jobs add constraint current_job_owner foreign key(current_version_id,id) references app.job_versions(id,job_id);
create table private.candidate_card_refs (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references app.jobs(id),
 candidate_id uuid not null references app.candidate_profiles(candidate_id), unique(job_id,candidate_id)
);
create table app.employer_interests (
 job_id uuid not null references app.jobs(id), candidate_id uuid not null references app.candidate_profiles(candidate_id),
 actor_id uuid not null references app.accounts(id), created_at timestamptz not null default now(),
 primary key(job_id,candidate_id)
);
create table app.applications (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references app.jobs(id),
 candidate_id uuid not null references app.candidate_profiles(candidate_id),
 applied_job_version_id uuid not null, applied_profile_version_id uuid not null,
 applied_at timestamptz not null default now(), matched_at timestamptz, withdrawn_at timestamptz,
 unique(job_id,candidate_id),
 foreign key(applied_job_version_id,job_id) references app.job_versions(id,job_id),
 foreign key(applied_profile_version_id,candidate_id) references app.candidate_profile_versions(id,candidate_id)
);
create index applications_candidate on app.applications(candidate_id);
create table app.interviews (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references app.applications(id),
 status text not null check(status in ('scheduled','completed','disputed','cancelled','no_show')),
 starts_at timestamptz not null, question_ids text[] not null check(cardinality(question_ids) between 3 and 5),
 -- Only trusted attendance/completion workflow may set these; no client update grants.
 attendance_verified_at timestamptz, candidate_confirmed_at timestamptz, employer_confirmed_at timestamptz
);
create index interviews_application on app.interviews(application_id);
create table app.scorecards (
 id uuid primary key default gen_random_uuid(), interview_id uuid not null unique references app.interviews(id),
 evaluator_id uuid not null references app.accounts(id), scores jsonb not null,
 submitted_at timestamptz not null default now()
);
create table private.resume_versions (
 id uuid primary key default gen_random_uuid(), candidate_id uuid not null references app.candidate_profiles(candidate_id),
 kind text not null check(kind = 'reveal_pdf'), storage_key text not null unique, checksum text not null,
 approved_at timestamptz not null, scan_clean_at timestamptz not null,
 revoked_at timestamptz, unique(id,candidate_id)
);
create table app.reveal_authorizations (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references app.applications(id),
 identity_revision integer not null, document_id uuid not null references private.resume_versions(id),
 recipient_ids uuid[] not null check(cardinality(recipient_ids) > 0),
 policy_version text not null, consented_at timestamptz not null default now(), revoked_at timestamptz,
 unique(id,application_id),
 unique(application_id,identity_revision,document_id,recipient_ids,policy_version)
);
create table app.reveals (
 id uuid primary key default gen_random_uuid(), authorization_id uuid not null unique references app.reveal_authorizations(id),
 application_id uuid not null references app.applications(id), granted_at timestamptz not null default now(), revoked_at timestamptz,
 foreign key(authorization_id,application_id) references app.reveal_authorizations(id,application_id)
);
create index reveals_application on app.reveals(application_id);
create table private.reveal_snapshots (
 reveal_id uuid primary key references app.reveals(id), legal_name text not null,
 contact_email text not null, phone text
);
create table ops.audit_log (
 id bigint generated always as identity primary key, actor_id uuid,
 action text not null, object_id uuid not null, at timestamptz not null default now()
);
create table ops.outbox_events (
 id uuid primary key default gen_random_uuid(), event_type text not null,
 aggregate_id uuid not null, dedupe_key text not null unique,
 created_at timestamptz not null default now(), dispatched_at timestamptz
 -- Only opaque references. Dispatch/delivery implementation is intentionally deferred.
);
create index outbox_pending on ops.outbox_events(created_at) where dispatched_at is null;

-- RLS defense in depth: clients get no direct data grants except own safe account.
do $$ declare r record; begin
 for r in select schemaname,tablename from pg_tables where schemaname in ('app','private','ops') loop
  execute format('alter table %I.%I enable row level security',r.schemaname,r.tablename);
 end loop;
end $$;
revoke all on all tables in schema app, private, ops from public, anon, authenticated;
revoke all on all sequences in schema app, private, ops from public, anon, authenticated;
grant select on app.accounts to authenticated;
create policy own_account on app.accounts for select to authenticated using(id = auth.uid());

create function private.require_actor() returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); begin
 if actor is null or not exists(select 1 from app.accounts a where a.id=actor and a.status='active') then
  raise exception 'NOT_AUTHORIZED' using errcode='42501';
 end if;
 return actor;
end $$;
create function private.is_recruiter(p_employer uuid,p_actor uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from app.employer_members m join app.employers e on e.id=m.employer_id
 join app.accounts a on a.id=m.account_id where m.employer_id=p_employer and m.account_id=p_actor
 and m.role in ('owner','recruiter') and m.revoked_at is null and e.verified_at is not null
 and e.suspended_at is null and a.status='active')
$$;
create function private.eligible(p_job uuid,p_candidate uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from app.jobs j join app.job_versions v on v.id=j.current_version_id
 join app.employers e on e.id=j.employer_id join app.candidate_profiles p on p.candidate_id=p_candidate
 join app.accounts a on a.id=p.candidate_id join private.candidate_eligibility el on el.candidate_id=p.candidate_id
 where j.id=p_job and j.state='open' and (j.closes_at is null or j.closes_at > now())
 and e.verified_at is not null and e.suspended_at is null and a.status='active'
 and p.discoverable and p.published_version_id is not null and el.work_attested
 and el.minimum_age_band >= v.minimum_age and el.refresh_due_at > now()
 and exists(select 1 from app.account_roles ar where ar.account_id=p_candidate and ar.role='candidate'))
$$;
create function private.immutable_record() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'IMMUTABLE_RECORD' using errcode='42501'; end $$;
create trigger immutable_profile before update or delete on app.candidate_profile_versions for each row execute function private.immutable_record();
create trigger immutable_posting before update or delete on app.job_versions for each row execute function private.immutable_record();
create trigger immutable_scorecard before update or delete on app.scorecards for each row execute function private.immutable_record();
create trigger immutable_snapshot before update or delete on private.reveal_snapshots for each row execute function private.immutable_record();
create trigger immutable_audit before update or delete on ops.audit_log for each row execute function private.immutable_record();

-- Consent and approved file versions may only move to revoked, never change scope
-- or bytes under an existing ID. Privileged workers are subject to these too.
create function private.only_revoke() returns trigger language plpgsql set search_path = '' as $$
begin
 if tg_op='DELETE' then raise exception 'IMMUTABLE_RECORD' using errcode='42501'; end if;
 if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at')
 or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
  raise exception 'IMMUTABLE_SCOPE' using errcode='42501';
 end if;
 return new;
end $$;
create trigger immutable_document before update or delete on private.resume_versions for each row execute function private.only_revoke();
create trigger immutable_authorization before update or delete on app.reveal_authorizations for each row execute function private.only_revoke();
create trigger immutable_grant before update or delete on app.reveals for each row execute function private.only_revoke();
create function private.identity_revision_guard() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.candidate_id<>old.candidate_id or new.revision<>old.revision+1 then
  raise exception 'IDENTITY_REVISION_REQUIRED' using errcode='42501';
 end if;
 return new;
end $$;
create trigger identity_revision before update on private.candidate_identity for each row execute function private.identity_revision_guard();
create function private.interview_scope_guard() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.id<>old.id or new.application_id<>old.application_id or new.question_ids is distinct from old.question_ids then
  raise exception 'IMMUTABLE_INTERVIEW_SCOPE' using errcode='42501';
 end if;
 return new;
end $$;
create trigger immutable_interview_scope before update on app.interviews for each row execute function private.interview_scope_guard();


create function app.list_candidate_cards(p_job uuid) returns table(card_id uuid,handle text,headline text,education_level text,field text,study_status text,bullets text[],skills text[],applied boolean)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_actor(); org uuid; begin
 select employer_id into org from app.jobs where id=p_job;
 if not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 insert into private.candidate_card_refs(job_id,candidate_id)
 select p_job,p.candidate_id from app.candidate_profiles p where private.eligible(p_job,p.candidate_id)
 and not exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=p.candidate_id and a.withdrawn_at is not null)
 on conflict(job_id,candidate_id) do nothing;
 return query select r.id,'Candidate '||upper(substr(replace(r.id::text,'-',''),1,8)),v.headline,v.education_level,v.field,v.study_status,v.bullets,v.skills,
 exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=r.candidate_id and a.withdrawn_at is null)
 from private.candidate_card_refs r join app.candidate_profiles p on p.candidate_id=r.candidate_id
 join app.candidate_profile_versions v on v.id=p.published_version_id
 where r.job_id=p_job and private.eligible(p_job,r.candidate_id)
 and not exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=r.candidate_id and a.withdrawn_at is not null)
 order by r.id;
end $$;

create function app.apply_to_job(p_job uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_actor(); result app.applications; job_version uuid; profile_version uuid; begin
 -- Shared lock order with employer interest prevents lost mutual match under concurrent actions.
 select current_version_id into job_version from app.jobs where id=p_job for update;
 select published_version_id into profile_version from app.candidate_profiles where candidate_id=actor for update;
 if not private.eligible(p_job,actor) then raise exception 'NOT_ELIGIBLE' using errcode='42501'; end if;
 select * into result from app.applications where job_id=p_job and candidate_id=actor for update;
 if result.id is not null then
  if result.withdrawn_at is not null then raise exception 'WITHDRAWN' using errcode='42501'; end if;
  return result.id;
 end if;
 insert into app.applications(job_id,candidate_id,applied_job_version_id,applied_profile_version_id,matched_at)
 values(p_job,actor,job_version,profile_version,case when exists(select 1 from app.employer_interests where job_id=p_job and candidate_id=actor) then now() else null end)
 returning * into result;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'application.created',result.id);
 if result.matched_at is not null then
  insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('application.matched',result.id,'match:'||result.id);
 end if;
 return result.id;
end $$;

create function app.express_employer_interest(p_job uuid,p_card uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_actor(); org uuid; candidate uuid; result app.applications; begin
 select employer_id into org from app.jobs where id=p_job for update;
 if not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select candidate_id into candidate from private.candidate_card_refs where id=p_card and job_id=p_job;
 if candidate is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 perform 1 from app.candidate_profiles where candidate_id=candidate for update;
 if not private.eligible(p_job,candidate) then raise exception 'NOT_ELIGIBLE' using errcode='42501'; end if;
 select * into result from app.applications where job_id=p_job and candidate_id=candidate for update;
 if result.withdrawn_at is not null then raise exception 'WITHDRAWN' using errcode='42501'; end if;
 insert into app.employer_interests(job_id,candidate_id,actor_id) values(p_job,candidate,actor) on conflict do nothing;
 if result.id is not null and result.matched_at is null then
  update app.applications set matched_at=now() where id=result.id;
  insert into ops.audit_log(actor_id,action,object_id) values(actor,'application.matched',result.id);
  insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('application.matched',result.id,'match:'||result.id) on conflict do nothing;
 end if;
 return result.id; -- null means invitation only, never a match or access grant.
end $$;

create function app.withdraw_application(p_application uuid) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_actor(); a app.applications; begin
 select * into a from app.applications where id=p_application for update;
 if a.id is null or a.candidate_id<>actor then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if a.withdrawn_at is not null then return; end if;
 update app.applications set withdrawn_at=now() where id=a.id;
 update app.reveal_authorizations set revoked_at=now() where application_id=a.id and revoked_at is null;
 update app.reveals set revoked_at=now() where application_id=a.id and revoked_at is null;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'application.withdrawn',a.id);
 insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('application.withdrawn',a.id,'withdraw:'||a.id);
end $$;

create function private.completed_interview(p_application uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from app.interviews i join app.scorecards s on s.interview_id=i.id
 where i.application_id=p_application and i.status='completed' and i.attendance_verified_at is not null
 and i.candidate_confirmed_at is not null and i.employer_confirmed_at is not null)
$$;
create function app.submit_scorecard(p_interview uuid,p_scores jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_actor(); i app.interviews; a app.applications; result app.scorecards; begin
 select * into i from app.interviews where id=p_interview;
 select * into a from app.applications where id=i.application_id for update;
 if a.id is null or not private.is_recruiter((select employer_id from app.jobs where id=a.job_id),actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select * into i from app.interviews where id=p_interview for share;
 if a.withdrawn_at is not null or a.matched_at is null or i.status<>'completed' or i.attendance_verified_at is null or i.candidate_confirmed_at is null or i.employer_confirmed_at is null then
  raise exception 'INTERVIEW_NOT_COMPLETE' using errcode='42501'; end if;
 if jsonb_typeof(p_scores) is distinct from 'array' then raise exception 'INVALID_SCORES' using errcode='22023'; end if;
 if jsonb_array_length(p_scores) <> cardinality(i.question_ids)
 or exists(select 1 from jsonb_array_elements(p_scores) x where jsonb_typeof(x) is distinct from 'object'
 or jsonb_typeof(x->'questionId') is distinct from 'string' or jsonb_typeof(x->'score') is distinct from 'number'
 or (x->>'score') not in ('1','2','3','4','5') or x->>'questionId' is null or not ((x->>'questionId')=any(i.question_ids))
 or (select count(*) from jsonb_object_keys(x))<>2)
 or (select count(distinct x->>'questionId') from jsonb_array_elements(p_scores) x)<>cardinality(i.question_ids) then
  raise exception 'INVALID_SCORES' using errcode='22023'; end if;
 select * into result from app.scorecards where interview_id=i.id;
 if result.id is not null then
  if result.scores<>p_scores or result.evaluator_id<>actor then raise exception 'SCORECARD_LOCKED' using errcode='42501'; end if;
  return result.id;
 end if;
 insert into app.scorecards(interview_id,evaluator_id,scores) values(i.id,actor,p_scores) returning * into result;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'scorecard.submitted',result.id);
 return result.id;
end $$;

create function app.authorize_reveal(p_application uuid,p_document uuid,p_recipients uuid[],p_identity_revision integer) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_actor(); a app.applications; org uuid; rev integer; recipients uuid[]; result uuid; begin
 select * into a from app.applications where id=p_application for update;
 if a.id is null or a.candidate_id<>actor or a.withdrawn_at is not null or a.matched_at is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if not private.completed_interview(a.id) then raise exception 'INTERVIEW_NOT_COMPLETE' using errcode='42501'; end if;
 select employer_id into org from app.jobs where id=a.job_id;
 if cardinality(p_recipients)>20 then raise exception 'INVALID_RECIPIENT' using errcode='42501'; end if;
 select array_agg(distinct x order by x) into recipients from unnest(p_recipients) x;
 if recipients is null or array_position(recipients,null) is not null or exists(select 1 from unnest(recipients) x where not private.is_recruiter(org,x)) then raise exception 'INVALID_RECIPIENT' using errcode='42501'; end if;
 if not exists(select 1 from private.resume_versions where id=p_document and candidate_id=actor and revoked_at is null) then raise exception 'INVALID_DOCUMENT' using errcode='42501'; end if;
 select revision into rev from private.candidate_identity where candidate_id=actor for share;
 if rev is null then raise exception 'IDENTITY_MISSING' using errcode='42501'; end if;
 if p_identity_revision is distinct from rev then raise exception 'CONSENT_STALE' using errcode='42501'; end if;
 insert into app.reveal_authorizations(application_id,identity_revision,document_id,recipient_ids,policy_version)
 values(a.id,rev,p_document,recipients,'synthetic-v1') on conflict do nothing returning id into result;
 if result is null then select id into result from app.reveal_authorizations where application_id=a.id and identity_revision=rev and document_id=p_document and recipient_ids=recipients and policy_version='synthetic-v1' and revoked_at is null; end if;
 if result is null then raise exception 'AUTHORIZATION_REVOKED' using errcode='42501'; end if;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'reveal.authorized',result);
 return result;
end $$;

create function app.grant_reveal(p_authorization uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_actor(); c app.reveal_authorizations; a app.applications; org uuid; ident private.candidate_identity; result uuid; begin
 select * into c from app.reveal_authorizations where id=p_authorization;
 select * into a from app.applications where id=c.application_id for update;
 -- Re-read mutable authorization after application lock: withdrawal takes the same lock.
 select * into c from app.reveal_authorizations where id=p_authorization;
 select employer_id into org from app.jobs where id=a.job_id;
 if a.id is null or not private.is_recruiter(org,actor) or not (actor=any(c.recipient_ids)) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if a.withdrawn_at is not null or a.matched_at is null or c.revoked_at is not null or not private.completed_interview(a.id)
 or not exists(select 1 from app.accounts where id=a.candidate_id and status='active') then raise exception 'REVEAL_BLOCKED' using errcode='42501'; end if;
 select * into ident from private.candidate_identity where candidate_id=a.candidate_id for share;
 if ident.revision is distinct from c.identity_revision
 or not exists(select 1 from private.resume_versions where id=c.document_id and candidate_id=a.candidate_id and revoked_at is null)
 or exists(select 1 from unnest(c.recipient_ids) x where not private.is_recruiter(org,x)) then raise exception 'CONSENT_STALE' using errcode='42501'; end if;
 select id into result from app.reveals where authorization_id=c.id and revoked_at is null;
 if result is not null then return result; end if;
 insert into app.reveals(authorization_id,application_id) values(c.id,a.id) returning id into result;
 insert into private.reveal_snapshots(reveal_id,legal_name,contact_email,phone) values(result,ident.legal_name,ident.contact_email,ident.phone);
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'reveal.granted',result);
 insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('reveal.authorized_delivery',result,'reveal:'||result),('reveal.candidate_notice',result,'reveal-notice:'||result);
 return result;
end $$;

create function app.read_reveal(p_reveal uuid) returns table(legal_name text,contact_email text,phone text,document_id uuid)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_actor(); a app.applications; r app.reveals; c app.reveal_authorizations; org uuid; begin
 select * into r from app.reveals where id=p_reveal;
 select * into a from app.applications where id=r.application_id for update;
 select * into r from app.reveals where id=p_reveal;
 select * into c from app.reveal_authorizations where id=r.authorization_id;
 select employer_id into org from app.jobs where id=a.job_id;
 if a.id is null or a.withdrawn_at is not null or r.revoked_at is not null or c.revoked_at is not null
 or not private.completed_interview(a.id)
 or not exists(select 1 from app.accounts where id=a.candidate_id and status='active')
 or not (actor=any(c.recipient_ids)) or not private.is_recruiter(org,actor)
 or not exists(select 1 from private.resume_versions where id=c.document_id and revoked_at is null)
 then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'reveal.viewed',r.id);
 return query select s.legal_name,s.contact_email,s.phone,c.document_id from private.reveal_snapshots s where s.reveal_id=r.id;
end $$;

revoke all on all functions in schema app, private, ops from public, anon, authenticated;
grant execute on function app.list_candidate_cards(uuid), app.apply_to_job(uuid), app.express_employer_interest(uuid,uuid), app.withdraw_application(uuid),
 app.submit_scorecard(uuid,jsonb), app.authorize_reveal(uuid,uuid,uuid[],integer), app.grant_reveal(uuid), app.read_reveal(uuid) to authenticated;
