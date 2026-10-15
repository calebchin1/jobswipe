-- School and weekly availability are optional public profile fields.
-- Only new reviewed versions explicitly approved by the candidate expose them.
-- Existing immutable versions keep NULL; school is never a ranking input.
alter table app.candidate_profile_versions
 add column school text check (length(btrim(school)) between 1 and 120),
 add column hours_per_week integer check (hours_per_week between 0 and 60);

create or replace function private.validate_review_profile(p_content jsonb) returns void language plpgsql set search_path='' as $$
declare k text; begin
 if jsonb_typeof(p_content) is distinct from 'object' or not(p_content ?& array['headline','educationLevel','field','studyStatus','bullets','skills'])
 or exists(select 1 from jsonb_object_keys(p_content) x where x not in ('headline','educationLevel','field','studyStatus','bullets','skills','school','hoursPerWeek')) then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
 foreach k in array array['headline','educationLevel','field','studyStatus'] loop
  if jsonb_typeof(p_content->k) is distinct from 'string' or length(btrim(p_content->>k))<1
  or length(p_content->>k)>(case when k='headline' then 60 when k='studyStatus' then 40 else 80 end) then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
 end loop;
 foreach k in array array['bullets','skills'] loop
  if jsonb_typeof(p_content->k) is distinct from 'array' then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
  if jsonb_array_length(p_content->k)>(case when k='bullets' then 3 else 8 end) or (k='skills' and jsonb_array_length(p_content->k)<1)
  or exists(select 1 from jsonb_array_elements(p_content->k) x where jsonb_typeof(x) is distinct from 'string' or length(btrim(x#>>'{}'))<1 or length(x#>>'{}')>(case when k='bullets' then 140 else 60 end)) then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
 end loop;
 if p_content ? 'school' and (jsonb_typeof(p_content->'school') is distinct from 'string'
 or length(btrim(p_content->>'school')) not between 1 and 120) then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
 if p_content ? 'hoursPerWeek' then
  if jsonb_typeof(p_content->'hoursPerWeek') is distinct from 'number' then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
  if (p_content->>'hoursPerWeek')::numeric not between 0 and 60 or trunc((p_content->>'hoursPerWeek')::numeric)<>(p_content->>'hoursPerWeek')::numeric then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
 end if;
end $$;

create or replace function app.save_candidate_profile(p_draft jsonb,p_discoverable boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); begin
 perform 1 from app.candidate_profiles where candidate_id=actor for update;
 if not found or not exists(select 1 from app.account_roles where account_id=actor and role='candidate') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 perform private.validate_review_profile(p_draft);
 insert into private.candidate_profile_drafts(candidate_id,content) values(actor,p_draft)
 on conflict(candidate_id) do update set content=excluded.content,revision=private.candidate_profile_drafts.revision+1,submitted_at=now(),review_status='pending_review'
 where private.candidate_profile_drafts.content is distinct from excluded.content;
 if p_discoverable is not null then update app.candidate_profiles set discoverable=p_discoverable where candidate_id=actor; end if;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'profile.submitted_for_review',actor);
 return private.profile_projection(actor);
end $$;

create or replace function app.approve_profile_proposal(p_proposal uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); proposal private.profile_review_proposals; draft private.candidate_profile_drafts; version uuid; begin
 perform 1 from app.candidate_profiles where candidate_id=actor for update;
 select * into proposal from private.profile_review_proposals where id=p_proposal;
 if proposal.id is null or proposal.candidate_id<>actor then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if exists(select 1 from app.profile_proposal_approvals where proposal_id=proposal.id) then return private.profile_projection(actor); end if;
 select * into draft from private.candidate_profile_drafts where candidate_id=actor for update;
 if draft.revision is distinct from proposal.draft_revision or exists(select 1 from private.profile_review_proposals q where q.candidate_id=actor and q.draft_revision=draft.revision and q.sequence>proposal.sequence) then raise exception 'PROPOSAL_STALE' using errcode='23514'; end if;
 insert into app.candidate_profile_versions(candidate_id,headline,education_level,field,study_status,bullets,skills,reviewed_at,approved_at,proposal_id,school,hours_per_week)
 values(actor,proposal.content->>'headline',proposal.content->>'educationLevel',proposal.content->>'field',proposal.content->>'studyStatus',
 array(select jsonb_array_elements_text(proposal.content->'bullets')),array(select jsonb_array_elements_text(proposal.content->'skills')),proposal.created_at,now(),proposal.id,proposal.content->>'school',(proposal.content->>'hoursPerWeek')::numeric::integer) returning id into version;
 insert into app.profile_proposal_approvals(proposal_id,candidate_id,profile_version_id) values(proposal.id,actor,version);
 update app.candidate_profiles set published_version_id=version where candidate_id=actor;
 update private.candidate_profile_drafts set review_status='approved' where candidate_id=actor;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'profile.proposal_approved',proposal.id);
 insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('profile.approved',version,'profile-version:'||version);
 return private.profile_projection(actor);
end $$;

create or replace function private.profile_projection(p_candidate uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('draft',d.content,
 'proposal',case when proposal.id is not null then jsonb_build_object('id',proposal.id,'draftRevision',proposal.draft_revision,'content',proposal.content) else null end,
 'reviewStatus',case when proposal.id is not null then 'awaiting_approval' when d.review_status='pending_review' then 'pending_review' when p.published_version_id is not null then 'approved' when d.candidate_id is not null then 'pending_review' else 'not_started' end,
 'discoverable',p.discoverable,'published',case when v.id is not null then jsonb_build_object('headline',v.headline,'educationLevel',v.education_level,'field',v.field,'studyStatus',v.study_status,'bullets',v.bullets,'skills',v.skills) || jsonb_strip_nulls(jsonb_build_object('school',v.school,'hoursPerWeek',v.hours_per_week)) else null end)
 from app.candidate_profiles p left join private.candidate_profile_drafts d on d.candidate_id=p.candidate_id
 left join app.candidate_profile_versions v on v.id=p.published_version_id
 left join lateral (select q.* from private.profile_review_proposals q where q.candidate_id=p.candidate_id and q.draft_revision=d.revision
 and not exists(select 1 from app.profile_proposal_approvals approved where approved.proposal_id=q.id)
 and q.sequence=(select max(latest.sequence) from private.profile_review_proposals latest where latest.candidate_id=p.candidate_id and latest.draft_revision=d.revision)
 ) proposal on true where p.candidate_id=p_candidate
$$;

drop function app.list_candidate_cards(uuid);
create function app.list_candidate_cards(p_job uuid) returns table(card_id uuid,handle text,headline text,education_level text,field text,study_status text,bullets text[],skills text[],applied boolean,school text,hours_per_week integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); org uuid; begin
 select employer_id into org from app.jobs where id=p_job;
 if not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 insert into private.candidate_card_refs(job_id,candidate_id)
 select p_job,p.candidate_id from app.candidate_profiles p where private.eligible(p_job,p.candidate_id)
 and (p.discoverable or exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=p.candidate_id and a.withdrawn_at is null))
 and not exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=p.candidate_id and a.withdrawn_at is not null)
 on conflict(job_id,candidate_id) do nothing;
 return query select r.id,'Candidate '||upper(substr(replace(r.id::text,'-',''),1,8)),v.headline,v.education_level,v.field,v.study_status,v.bullets,v.skills,
 exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=r.candidate_id and a.withdrawn_at is null),v.school,v.hours_per_week
 from private.candidate_card_refs r join app.candidate_profiles p on p.candidate_id=r.candidate_id join app.candidate_profile_versions v on v.id=p.published_version_id
 where r.job_id=p_job and private.eligible(p_job,r.candidate_id)
 and (p.discoverable or exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=r.candidate_id and a.withdrawn_at is null))
 and not exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=r.candidate_id and a.withdrawn_at is not null)
 and not exists(select 1 from private.card_passes x where x.job_id=p_job and x.candidate_id=r.candidate_id)
 and not exists(select 1 from app.employer_interests i where i.job_id=p_job and i.candidate_id=r.candidate_id) order by r.id;
end $$;

revoke all on function private.validate_review_profile(jsonb),private.profile_projection(uuid) from public,anon,authenticated,swipe_reviewer;
revoke all on function app.list_candidate_cards(uuid) from public,anon;
grant execute on function app.list_candidate_cards(uuid) to authenticated;
