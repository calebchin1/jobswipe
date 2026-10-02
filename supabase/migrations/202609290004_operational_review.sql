-- Dedicated operational review, never exposed through PostgREST or client roles.
-- Creating individual operator logins/membership is a separate DBA action.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='swipe_reviewer') then
  create role swipe_reviewer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
 elsif exists(select 1 from pg_roles where rolname='swipe_reviewer' and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolbypassrls)) then
  raise exception 'UNSAFE_REVIEW_ROLE';
 end if;
end $$;
create schema review;
revoke all on schema review from public,anon,authenticated;
grant usage on schema review to swipe_reviewer;
alter default privileges in schema review revoke execute on functions from public;
create table ops.review_decisions (
 id uuid primary key default gen_random_uuid(), operator_login text not null, action text not null,
 subject_id uuid not null, source_revision integer, evidence_note text not null check(length(evidence_note) between 1 and 1000),
 at timestamptz not null default now()
);
create table private.profile_review_proposals (
 id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique,
 candidate_id uuid not null references app.candidate_profiles(candidate_id), draft_revision integer not null check(draft_revision>0),
 content jsonb not null, decision_id uuid not null references ops.review_decisions(id), created_at timestamptz not null default now(),
 unique(candidate_id,draft_revision,content)
);
alter table app.candidate_profile_versions add column proposal_id uuid unique references private.profile_review_proposals(id);
create table app.profile_proposal_approvals (
 proposal_id uuid primary key references private.profile_review_proposals(id), candidate_id uuid not null references app.candidate_profiles(candidate_id),
 profile_version_id uuid not null unique references app.candidate_profile_versions(id), approved_at timestamptz not null default now()
);
alter table ops.review_decisions enable row level security;
alter table private.profile_review_proposals enable row level security;
alter table app.profile_proposal_approvals enable row level security;
revoke all on ops.review_decisions,private.profile_review_proposals,app.profile_proposal_approvals from public,anon,authenticated,swipe_reviewer;
create trigger immutable_review_decision before update or delete on ops.review_decisions for each row execute function private.immutable_record();
create trigger immutable_profile_proposal before update or delete on private.profile_review_proposals for each row execute function private.immutable_record();
create trigger immutable_profile_approval before update or delete on app.profile_proposal_approvals for each row execute function private.immutable_record();

create function private.require_reviewer() returns text language plpgsql security definer set search_path='' as $$
begin
 -- session_user records the individual database login, not the definer owner or
 -- a request-supplied actor. Broad service/admin logins cannot use this workflow.
 if not pg_has_role(session_user,'swipe_reviewer','member')
 or exists(select 1 from pg_roles where rolname=session_user and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)) then
  raise exception 'REVIEW_OPERATOR_REQUIRED' using errcode='42501';
 end if;
 return session_user::text;
end $$;
create function private.validate_review_profile(p_content jsonb) returns void language plpgsql set search_path='' as $$
declare k text; begin
 if jsonb_typeof(p_content) is distinct from 'object' or not(p_content ?& array['headline','educationLevel','field','studyStatus','bullets','skills'])
 or exists(select 1 from jsonb_object_keys(p_content) x where x not in ('headline','educationLevel','field','studyStatus','bullets','skills')) then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
 foreach k in array array['headline','educationLevel','field','studyStatus'] loop
  if jsonb_typeof(p_content->k) is distinct from 'string' or length(btrim(p_content->>k))<1
  or length(p_content->>k)>(case when k='headline' then 60 when k='studyStatus' then 40 else 80 end) then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
 end loop;
 foreach k in array array['bullets','skills'] loop
  if jsonb_typeof(p_content->k) is distinct from 'array' then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
  if jsonb_array_length(p_content->k)>(case when k='bullets' then 3 else 8 end) or (k='skills' and jsonb_array_length(p_content->k)<1)
  or exists(select 1 from jsonb_array_elements(p_content->k) x where jsonb_typeof(x) is distinct from 'string' or length(btrim(x#>>'{}'))<1 or length(x#>>'{}')>(case when k='bullets' then 140 else 60 end)) then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
 end loop;
end $$;

create function review.list_pending_employers(p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare operator_login text:=private.require_reviewer(); result jsonb; begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_PAGE_SIZE' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.public_name,'website',e.website) order by e.id),'[]'::jsonb) into result
 from (select id,public_name,website from app.employers where verified_at is null and suspended_at is null order by id limit p_limit) e;
 return result;
end $$;
create function review.verify_employer(p_employer uuid,p_expected_website text,p_evidence_note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare operator_login text:=private.require_reviewer(); e app.employers; begin
 if p_evidence_note is null or length(btrim(p_evidence_note)) not between 1 and 1000 then raise exception 'EVIDENCE_REQUIRED' using errcode='22023'; end if;
 select * into e from app.employers where id=p_employer for update;
 if e.id is null or e.suspended_at is not null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if e.website is null or e.website is distinct from p_expected_website then raise exception 'REVIEW_STALE' using errcode='23514'; end if;
 if e.verified_at is null then
  insert into ops.review_decisions(operator_login,action,subject_id,evidence_note) values(operator_login,'employer.verified',e.id,btrim(p_evidence_note));
  update app.employers set verified_at=now() where id=e.id;
  insert into ops.audit_log(actor_id,action,object_id) values(null,'review.employer_verified',e.id);
 end if;
 return jsonb_build_object('id',e.id,'verificationStatus','verified');
end $$;
create function review.list_pending_profiles(p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare operator_login text:=private.require_reviewer(); result jsonb; begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_PAGE_SIZE' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('candidateId',d.candidate_id,'draftRevision',d.revision,'content',d.content,'submittedAt',d.submitted_at) order by d.submitted_at,d.candidate_id),'[]'::jsonb) into result
 from (select d.* from private.candidate_profile_drafts d join app.accounts a on a.id=d.candidate_id
 where d.review_status='pending_review' and a.status='active'
 and not exists(select 1 from private.profile_review_proposals p where p.candidate_id=d.candidate_id and p.draft_revision=d.revision)
 order by d.submitted_at,d.candidate_id limit p_limit) d;
 return result;
end $$;
create function review.get_candidate_draft(p_candidate uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare operator_login text:=private.require_reviewer(); result jsonb; begin
 select jsonb_build_object('candidateId',d.candidate_id,'draftRevision',d.revision,'content',d.content,'submittedAt',d.submitted_at) into result
 from private.candidate_profile_drafts d join app.accounts a on a.id=d.candidate_id where d.candidate_id=p_candidate and a.status='active';
 if result is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 return result;
end $$;
create function review.propose_candidate_profile(p_candidate uuid,p_expected_revision integer,p_content jsonb,p_evidence_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare operator_login text:=private.require_reviewer(); d private.candidate_profile_drafts; result uuid; decision uuid; begin
 if p_evidence_note is null or length(btrim(p_evidence_note)) not between 1 and 1000 then raise exception 'EVIDENCE_REQUIRED' using errcode='22023'; end if;
 perform private.validate_review_profile(p_content);
 perform 1 from app.candidate_profiles where candidate_id=p_candidate for update;
 select * into d from private.candidate_profile_drafts where candidate_id=p_candidate for update;
 if d.candidate_id is null or not exists(select 1 from app.accounts where id=p_candidate and status='active') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if p_expected_revision is distinct from d.revision then raise exception 'REVIEW_STALE' using errcode='23514'; end if;
 select id into result from private.profile_review_proposals where candidate_id=p_candidate and draft_revision=d.revision and content=p_content;
 if result is not null and exists(select 1 from private.profile_review_proposals q where q.candidate_id=p_candidate and q.draft_revision=d.revision and q.sequence>(select sequence from private.profile_review_proposals where id=result)) then
  raise exception 'PROPOSAL_SUPERSEDED' using errcode='23514';
 end if;
 if result is null then
  insert into ops.review_decisions(operator_login,action,subject_id,source_revision,evidence_note) values(operator_login,'profile.proposed',p_candidate,d.revision,btrim(p_evidence_note)) returning id into decision;
  insert into private.profile_review_proposals(candidate_id,draft_revision,content,decision_id) values(p_candidate,d.revision,p_content,decision) returning id into result;
  insert into ops.audit_log(actor_id,action,object_id) values(null,'review.profile_proposed',result);
 end if;
 return jsonb_build_object('id',result,'draftRevision',d.revision,'content',p_content);
end $$;

create or replace function private.profile_projection(p_candidate uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('draft',d.content,
 'proposal',case when proposal.id is not null then jsonb_build_object('id',proposal.id,'draftRevision',proposal.draft_revision,'content',proposal.content) else null end,
 'reviewStatus',case when proposal.id is not null then 'awaiting_approval' when d.review_status='pending_review' then 'pending_review' when p.published_version_id is not null then 'approved' when d.candidate_id is not null then 'pending_review' else 'not_started' end,
 'discoverable',p.discoverable,'published',case when v.id is not null then jsonb_build_object('headline',v.headline,'educationLevel',v.education_level,'field',v.field,'studyStatus',v.study_status,'bullets',v.bullets,'skills',v.skills) else null end)
 from app.candidate_profiles p left join private.candidate_profile_drafts d on d.candidate_id=p.candidate_id
 left join app.candidate_profile_versions v on v.id=p.published_version_id
 left join lateral (select q.* from private.profile_review_proposals q where q.candidate_id=p.candidate_id and q.draft_revision=d.revision
 and not exists(select 1 from app.profile_proposal_approvals approved where approved.proposal_id=q.id)
 and q.sequence=(select max(latest.sequence) from private.profile_review_proposals latest where latest.candidate_id=p.candidate_id and latest.draft_revision=d.revision)
 ) proposal on true where p.candidate_id=p_candidate
$$;
create or replace function private.account_context(p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('accountId',a.id,'status',a.status,
 'roles',coalesce((select jsonb_agg(r.role order by r.role) from app.account_roles r where r.account_id=a.id),'[]'::jsonb),
 'employers',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.public_name,'website',e.website,'role',m.role,
 'verificationStatus',case when e.suspended_at is not null then 'suspended' when e.verified_at is not null then 'verified' else 'pending' end) order by e.id)
 from app.employer_members m join app.employers e on e.id=m.employer_id where m.account_id=a.id and m.revoked_at is null),'[]'::jsonb),
 'candidate',(select jsonb_build_object('reviewStatus',private.profile_projection(p.candidate_id)->>'reviewStatus','discoverable',p.discoverable) from app.candidate_profiles p where p.candidate_id=a.id))
 from app.accounts a where a.id=p_actor
$$;
create function app.approve_profile_proposal(p_proposal uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); proposal private.profile_review_proposals; draft private.candidate_profile_drafts; version uuid; begin
 perform 1 from app.candidate_profiles where candidate_id=actor for update;
 select * into proposal from private.profile_review_proposals where id=p_proposal;
 if proposal.id is null or proposal.candidate_id<>actor then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if exists(select 1 from app.profile_proposal_approvals where proposal_id=proposal.id) then return private.profile_projection(actor); end if;
 select * into draft from private.candidate_profile_drafts where candidate_id=actor for update;
 if draft.revision is distinct from proposal.draft_revision or exists(select 1 from private.profile_review_proposals q where q.candidate_id=actor and q.draft_revision=draft.revision and q.sequence>proposal.sequence) then raise exception 'PROPOSAL_STALE' using errcode='23514'; end if;
 insert into app.candidate_profile_versions(candidate_id,headline,education_level,field,study_status,bullets,skills,reviewed_at,approved_at,proposal_id)
 values(actor,proposal.content->>'headline',proposal.content->>'educationLevel',proposal.content->>'field',proposal.content->>'studyStatus',
 array(select jsonb_array_elements_text(proposal.content->'bullets')),array(select jsonb_array_elements_text(proposal.content->'skills')),proposal.created_at,now(),proposal.id) returning id into version;
 insert into app.profile_proposal_approvals(proposal_id,candidate_id,profile_version_id) values(proposal.id,actor,version);
 update app.candidate_profiles set published_version_id=version where candidate_id=actor;
 update private.candidate_profile_drafts set review_status='approved' where candidate_id=actor;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'profile.proposal_approved',proposal.id);
 insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('profile.approved',version,'profile-version:'||version);
 return private.profile_projection(actor);
end $$;
revoke all on all functions in schema review from public,anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated,swipe_reviewer;
grant execute on function review.list_pending_employers(integer),review.verify_employer(uuid,text,text),review.list_pending_profiles(integer),review.get_candidate_draft(uuid),review.propose_candidate_profile(uuid,integer,jsonb,text) to swipe_reviewer;
revoke all on function app.approve_profile_proposal(uuid) from public,anon;
grant execute on function app.approve_profile_proposal(uuid) to authenticated;
