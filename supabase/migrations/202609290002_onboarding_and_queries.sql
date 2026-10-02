-- Additive second slice. No DOB collection, self-verification, or auto-approval.
alter table app.employers add column website text;
alter table app.job_versions add column details jsonb;
create table private.job_drafts (
 job_id uuid primary key references app.jobs(id), content jsonb not null,
 revision integer not null default 1 check(revision>0), updated_at timestamptz not null default now()
);
create table private.candidate_profile_drafts (
 candidate_id uuid primary key references app.candidate_profiles(candidate_id), content jsonb not null,
 revision integer not null default 1 check(revision>0), submitted_at timestamptz not null default now(),
 review_status text not null default 'pending_review' check(review_status in ('pending_review','approved','needs_changes'))
);
alter table private.job_drafts enable row level security;
alter table private.candidate_profile_drafts enable row level security;
revoke all on private.job_drafts, private.candidate_profile_drafts from public, anon, authenticated;

create function private.is_member(p_employer uuid,p_actor uuid,p_write boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from app.employer_members m join app.employers e on e.id=m.employer_id
 join app.accounts a on a.id=m.account_id where m.employer_id=p_employer and m.account_id=p_actor
 and m.revoked_at is null and a.status='active' and e.suspended_at is null
 and (not p_write or m.role in ('owner','recruiter')))
$$;
create function private.account_context(p_actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('accountId',a.id,'status',a.status,
 'roles',coalesce((select jsonb_agg(r.role order by r.role) from app.account_roles r where r.account_id=a.id),'[]'::jsonb),
 'employers',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.public_name,'website',e.website,'role',m.role,
 'verificationStatus',case when e.suspended_at is not null then 'suspended' when e.verified_at is not null then 'verified' else 'pending' end) order by e.id)
 from app.employer_members m join app.employers e on e.id=m.employer_id where m.account_id=a.id and m.revoked_at is null),'[]'::jsonb),
 'candidate',(select jsonb_build_object('reviewStatus',case when d.review_status='pending_review' then 'pending_review'
 when p.published_version_id is not null then 'approved' when d.candidate_id is not null then 'pending_review' else 'not_started' end,
 'discoverable',p.discoverable) from app.candidate_profiles p left join private.candidate_profile_drafts d on d.candidate_id=p.candidate_id where p.candidate_id=a.id))
 from app.accounts a where a.id=p_actor
$$;
create function app.ensure_account(p_role text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); current_status text; begin
 if actor is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if p_role is null or p_role not in ('candidate','employer') then raise exception 'INVALID_ROLE' using errcode='22023'; end if;
 insert into app.accounts(id) values(actor) on conflict do nothing;
 select status into current_status from app.accounts where id=actor for update;
 if current_status<>'active' then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 -- These are product capabilities, never administrative privileges.
 insert into app.account_roles(account_id,role) values(actor,p_role) on conflict do nothing;
 if p_role='candidate' then insert into app.candidate_profiles(candidate_id) values(actor) on conflict do nothing; end if;
 return private.account_context(actor);
end $$;
create function app.get_account_context() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); begin
 if actor is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if not exists(select 1 from app.accounts where id=actor) then
  return jsonb_build_object('accountId',actor,'status','active','roles','[]'::jsonb,'employers','[]'::jsonb,'candidate',null);
 end if;
 perform private.require_actor();
 return private.account_context(actor);
end $$;

create function app.create_employer(p_name text,p_website text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); result uuid; begin
 if not exists(select 1 from app.account_roles where account_id=actor and role='employer') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 2 and 100
 or p_website is null or length(p_website)>500 or p_website !~ '^https?://[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]([/:?#][^[:space:]]*)?$' then
 raise exception 'INVALID_EMPLOYER' using errcode='22023'; end if;
 perform 1 from app.accounts where id=actor for update;
 -- Idempotent retry for the same owner's exact normalized name/site; a domain is
 -- never proof of ownership and never joins an existing third-party organization.
 select e.id into result from app.employers e join app.employer_members m on m.employer_id=e.id
 where m.account_id=actor and m.role='owner' and m.revoked_at is null
 and e.public_name=btrim(p_name) and e.website=btrim(p_website) order by e.id limit 1;
 if result is not null then return result; end if;
 insert into app.employers(public_name,website) values(btrim(p_name),btrim(p_website)) returning id into result;
 insert into app.employer_members(employer_id,account_id,role) values(result,actor,'owner');
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'employer.created_pending',result);
 return result;
end $$;

create function private.validate_job_draft(p_value jsonb,p_complete boolean) returns jsonb
language plpgsql set search_path='' as $$
declare k text; v jsonb; derived_age integer; result jsonb:=p_value; n integer; begin
 if jsonb_typeof(p_value) is distinct from 'object' or octet_length(p_value::text)>24000 then raise exception 'INVALID_JOB' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_value) x where x not in ('title','description','payMinMinor','payMaxMinor','payPeriod','currency','location','hoursPerWeek','schedule','skills','mustHaves','niceToHaves','questions','isVacancy','usesAiScreening','workplaceType','minimumAge','jobType')) then raise exception 'INVALID_JOB_KEYS' using errcode='22023'; end if;
 if p_complete and not(p_value ?& array['title','description','payMinMinor','payMaxMinor','payPeriod','currency','location','hoursPerWeek','schedule','skills','mustHaves','niceToHaves','questions','isVacancy','usesAiScreening','workplaceType','jobType']) then raise exception 'INCOMPLETE_JOB' using errcode='22023'; end if;
 foreach k in array array['title','description','location','payPeriod','currency','workplaceType','jobType'] loop
  if p_value ? k then
   if jsonb_typeof(p_value->k) is distinct from 'string' then raise exception 'INVALID_JOB_TEXT' using errcode='22023'; end if;
   result:=jsonb_set(result,array[k],to_jsonb(btrim(p_value->>k)));
   if length(result->>k)>(case when k='description' then 5000 else 100 end) or (p_complete and length(result->>k)<1) then raise exception 'INVALID_JOB_TEXT' using errcode='22023'; end if;
  end if;
 end loop;
 if p_complete and (length(result->>'title')<3 or length(result->>'description')<20 or length(result->>'location')<2) then raise exception 'INVALID_JOB_TEXT' using errcode='22023'; end if;
 foreach k in array array['payMinMinor','payMaxMinor','hoursPerWeek','minimumAge'] loop
  if p_value ? k then
   if jsonb_typeof(p_value->k) is distinct from 'number' or (p_value->>k)!~'^[0-9]{1,9}$' then raise exception 'INVALID_JOB_NUMBER' using errcode='22023'; end if;
   if (p_value->>k)::integer<1 then raise exception 'INVALID_JOB_NUMBER' using errcode='22023'; end if;
  end if;
 end loop;
 if p_value ? 'hoursPerWeek' and (p_value->>'hoursPerWeek')::integer>60 then raise exception 'INVALID_HOURS' using errcode='22023'; end if;
 foreach k in array array['schedule','skills','mustHaves','niceToHaves','questions'] loop
  if p_value ? k then
   v:=p_value->k;
   if jsonb_typeof(v) is distinct from 'array' then raise exception 'INVALID_JOB_ARRAY' using errcode='22023'; end if;
   n:=jsonb_array_length(v);
   if n>(case k when 'schedule' then 7 when 'skills' then 8 when 'questions' then 5 else 3 end)
    or (p_complete and k in ('schedule','skills','mustHaves') and n<1) or (p_complete and k='questions' and n<3)
    or exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) is distinct from 'string'
      or length(btrim(x#>>'{}'))<1 or length(x#>>'{}')>(case k when 'questions' then 300 when 'skills' then 60 else 160 end)) then
    raise exception 'INVALID_JOB_ARRAY' using errcode='22023'; end if;
   if k='questions' and p_complete and exists(select 1 from jsonb_array_elements_text(v) x where length(btrim(x))<5) then raise exception 'INVALID_QUESTIONS' using errcode='22023'; end if;
   if k='schedule' and exists(select 1 from jsonb_array_elements_text(v) x where x not in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')) then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  end if;
 end loop;
 foreach k in array array['isVacancy','usesAiScreening'] loop
  if p_value ? k and jsonb_typeof(p_value->k) is distinct from 'boolean' then raise exception 'INVALID_DISCLOSURE' using errcode='22023'; end if;
 end loop;
 if (p_value ? 'currency' and p_value->>'currency'<>'CAD') or (p_value ? 'payPeriod' and p_value->>'payPeriod' not in ('hour','year'))
 or (p_value ? 'jobType' and p_value->>'jobType' not in ('Part-time','Summer','Internship','Full-time')) then raise exception 'INVALID_JOB_ENUM' using errcode='22023'; end if;
 if p_value ? 'workplaceType' then
  derived_age:=case p_value->>'workplaceType' when 'office' then 14 when 'retail' then 14 when 'restaurant_service' then 14 when 'restaurant_kitchen' then 15 when 'warehouse' then 15 when 'construction' then 16 else null end;
  if derived_age is null or (p_value ? 'minimumAge' and (p_value->>'minimumAge')::integer<>derived_age) then raise exception 'INVALID_WORKPLACE_AGE' using errcode='22023'; end if;
  result:=jsonb_set(result,'{minimumAge}',to_jsonb(derived_age));
 elsif p_value ? 'minimumAge' then raise exception 'WORKPLACE_REQUIRED' using errcode='22023'; end if;
 if p_complete then
  if (p_value->>'payMaxMinor')::integer<(p_value->>'payMinMinor')::integer then raise exception 'INVALID_PAY_RANGE' using errcode='22023'; end if;
  if ((p_value->>'payMaxMinor')::bigint-(p_value->>'payMinMinor')::bigint)*(case when p_value->>'payPeriod'='hour' then (p_value->>'hoursPerWeek')::bigint*52 else 1 end)>5000000 then raise exception 'PAY_RANGE_TOO_WIDE' using errcode='22023'; end if;
  if result::text ~* 'canadian[[:space:]]+(work[[:space:]]+)?experience' then raise exception 'CANADIAN_EXPERIENCE_REQUIREMENT' using errcode='22023'; end if;
 end if;
 return result;
end $$;

create function app.save_job_draft(p_employer uuid,p_job uuid,p_draft jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); result uuid:=p_job; content jsonb; begin
 if not private.is_member(p_employer,actor,true) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 content:=private.validate_job_draft(p_draft,false);
 if result is null then insert into app.jobs(employer_id) values(p_employer) returning id into result;
 else
  perform 1 from app.jobs where id=result and employer_id=p_employer for update;
  if not found then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 end if;
 insert into private.job_drafts(job_id,content) values(result,content)
 on conflict(job_id) do update set content=excluded.content,revision=private.job_drafts.revision+1,updated_at=now()
 where private.job_drafts.content is distinct from excluded.content;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'job.draft_saved',result);
 return result;
end $$;
create function app.publish_job(p_job uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); j app.jobs; content jsonb; version_id uuid; begin
 select * into j from app.jobs where id=p_job for update;
 if j.id is null or not private.is_recruiter(j.employer_id,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select d.content into content from private.job_drafts d where d.job_id=j.id;
 content:=private.validate_job_draft(content,true);
 if exists(select 1 from app.job_versions v where v.id=j.current_version_id and v.details=content) then
  update app.jobs set state='open' where id=j.id;
  return j.current_version_id;
 end if;
 insert into app.job_versions(job_id,title,pay_min_minor,pay_max_minor,currency,pay_period,is_vacancy,uses_ai_screening,minimum_age,questions,details)
 values(j.id,content->>'title',(content->>'payMinMinor')::integer,(content->>'payMaxMinor')::integer,content->>'currency',content->>'payPeriod',
 (content->>'isVacancy')::boolean,(content->>'usesAiScreening')::boolean,(content->>'minimumAge')::integer,array(select jsonb_array_elements_text(content->'questions')),content)
 returning id into version_id;
 update app.jobs set state='open',current_version_id=version_id where id=j.id;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'job.published',version_id);
 insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('job.published',j.id,'job-version:'||version_id);
 return version_id;
end $$;
create function private.job_projection(p_job uuid,p_include_draft boolean) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',j.id,'employerId',j.employer_id,'company',e.public_name,'status',j.state,'versionId',j.current_version_id,
 'details',case when v.id is not null or (p_include_draft and d.job_id is not null) then
 jsonb_build_object('title',coalesce(v.title,''),'description','','payMinMinor',coalesce(v.pay_min_minor,0),'payMaxMinor',coalesce(v.pay_max_minor,0),
 'currency',coalesce(v.currency,'CAD'),'payPeriod',coalesce(v.pay_period,'hour'),'location','','hoursPerWeek',0,'schedule','[]'::jsonb,
 'skills','[]'::jsonb,'mustHaves','[]'::jsonb,'niceToHaves','[]'::jsonb,'questions',coalesce(to_jsonb(v.questions),'[]'::jsonb),
 'isVacancy',coalesce(v.is_vacancy,false),'usesAiScreening',coalesce(v.uses_ai_screening,false),'workplaceType','office',
 'minimumAge',coalesce(v.minimum_age,14),'jobType','') || coalesce(v.details,'{}'::jsonb)
 || (case when p_include_draft then coalesce(d.content,'{}'::jsonb) else '{}'::jsonb end)
 else null end,
 'hasUnpublishedChanges',case when p_include_draft then d.content is not null and d.content is distinct from v.details else false end)
 from app.jobs j join app.employers e on e.id=j.employer_id left join app.job_versions v on v.id=j.current_version_id
 left join private.job_drafts d on d.job_id=j.id where j.id=p_job
$$;
create function app.list_employer_jobs(p_employer uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); result jsonb; begin
 if not private.is_member(p_employer,actor,false) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.job_projection(j.id,true) order by j.id),'[]'::jsonb) into result from app.jobs j where j.employer_id=p_employer;
 return result;
end $$;

-- Legal eligibility and proactive visibility are different: a hidden candidate
-- may deliberately apply, which authorizes that employer's application context.
create or replace function private.eligible(p_job uuid,p_candidate uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app.jobs j join app.job_versions v on v.id=j.current_version_id
 join app.employers e on e.id=j.employer_id join app.candidate_profiles p on p.candidate_id=p_candidate
 join app.accounts a on a.id=p.candidate_id join private.candidate_eligibility el on el.candidate_id=p.candidate_id
 where j.id=p_job and j.state='open' and (j.closes_at is null or j.closes_at>now())
 and e.verified_at is not null and e.suspended_at is null and a.status='active'
 and p.published_version_id is not null and el.work_attested and el.minimum_age_band>=v.minimum_age and el.refresh_due_at>now()
 and exists(select 1 from app.account_roles ar where ar.account_id=p_candidate and ar.role='candidate'))
$$;
create function app.list_open_jobs(p_limit integer default 20,p_after uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); result jsonb; begin
 if not exists(select 1 from app.account_roles where account_id=actor and role='candidate') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_PAGE_SIZE' using errcode='22023'; end if;
 select coalesce(jsonb_agg(private.job_projection(j.id,false)||jsonb_build_object('canApply',private.eligible(j.id,actor)
 and not exists(select 1 from app.applications a where a.job_id=j.id and a.candidate_id=actor)) order by j.id),'[]'::jsonb) into result
 from (select j.id from app.jobs j join app.employers e on e.id=j.employer_id
 where j.state='open' and j.current_version_id is not null and (j.closes_at is null or j.closes_at>now())
 and e.verified_at is not null and e.suspended_at is null and (p_after is null or j.id>p_after) order by j.id limit p_limit) j;
 return result;
end $$;

create or replace function app.list_candidate_cards(p_job uuid) returns table(card_id uuid,handle text,headline text,education_level text,field text,study_status text,bullets text[],skills text[],applied boolean)
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
 exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=r.candidate_id and a.withdrawn_at is null)
 from private.candidate_card_refs r join app.candidate_profiles p on p.candidate_id=r.candidate_id join app.candidate_profile_versions v on v.id=p.published_version_id
 where r.job_id=p_job and private.eligible(p_job,r.candidate_id)
 and (p.discoverable or exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=r.candidate_id and a.withdrawn_at is null))
 and not exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=r.candidate_id and a.withdrawn_at is not null) order by r.id;
end $$;
create or replace function app.express_employer_interest(p_job uuid,p_card uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); org uuid; candidate uuid; visible boolean; result app.applications; begin
 select employer_id into org from app.jobs where id=p_job for update;
 if not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select candidate_id into candidate from private.candidate_card_refs where id=p_card and job_id=p_job;
 if candidate is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select discoverable into visible from app.candidate_profiles where candidate_id=candidate for update;
 if not private.eligible(p_job,candidate) then raise exception 'NOT_ELIGIBLE' using errcode='42501'; end if;
 select * into result from app.applications where job_id=p_job and candidate_id=candidate for update;
 if result.withdrawn_at is not null then raise exception 'WITHDRAWN' using errcode='42501'; end if;
 if not visible and result.id is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 insert into app.employer_interests(job_id,candidate_id,actor_id) values(p_job,candidate,actor) on conflict do nothing;
 if result.id is not null and result.matched_at is null then
  update app.applications set matched_at=now() where id=result.id;
  insert into ops.audit_log(actor_id,action,object_id) values(actor,'application.matched',result.id);
  insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('application.matched',result.id,'match:'||result.id) on conflict do nothing;
 end if;
 return result.id;
end $$;

create function private.application_stage(p_application uuid) returns text language sql stable security definer set search_path='' as $$
 select case when a.withdrawn_at is not null then 'Withdrawn'
 when exists(select 1 from app.reveals r where r.application_id=a.id and r.revoked_at is null) then 'Revealed'
 when exists(select 1 from app.interviews i where i.application_id=a.id and i.status='completed') then 'Interviewed'
 when exists(select 1 from app.interviews i where i.application_id=a.id and i.status='scheduled') then 'Interview booked'
 when a.matched_at is not null then 'Matched' else 'Applied' end from app.applications a where a.id=p_application
$$;
create function app.list_my_applications() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); result jsonb; begin
 if not exists(select 1 from app.account_roles where account_id=actor and role='candidate') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'jobId',a.job_id,'jobTitle',v.title,'company',e.public_name,
 'stage',private.application_stage(a.id),'appliedAt',a.applied_at,'matchedAt',a.matched_at,'withdrawnAt',a.withdrawn_at) order by a.applied_at desc,a.id),'[]'::jsonb) into result
 from app.applications a join app.jobs j on j.id=a.job_id join app.job_versions v on v.id=a.applied_job_version_id join app.employers e on e.id=j.employer_id where a.candidate_id=actor;
 return result;
end $$;
create function app.list_job_applications(p_job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); org uuid; result jsonb; begin
 select employer_id into org from app.jobs where id=p_job;
 if not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 insert into private.candidate_card_refs(job_id,candidate_id) select a.job_id,a.candidate_id from app.applications a where a.job_id=p_job and a.withdrawn_at is null on conflict do nothing;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'jobId',a.job_id,'jobTitle',v.title,'company',e.public_name,
 'stage',private.application_stage(a.id),'appliedAt',a.applied_at,'matchedAt',a.matched_at,'withdrawnAt',a.withdrawn_at,
 'cardId',case when a.withdrawn_at is null then r.id else null end,
 'handle',case when a.withdrawn_at is null then 'Candidate '||upper(substr(replace(r.id::text,'-',''),1,8)) else 'Withdrawn' end,
 'headline',case when a.withdrawn_at is null then p.headline else null end) order by a.applied_at desc,a.id),'[]'::jsonb) into result
 from app.applications a join app.jobs j on j.id=a.job_id join app.employers e on e.id=j.employer_id
 join app.job_versions v on v.id=a.applied_job_version_id join app.candidate_profile_versions p on p.id=a.applied_profile_version_id
 left join private.candidate_card_refs r on r.job_id=a.job_id and r.candidate_id=a.candidate_id where a.job_id=p_job;
 return result;
end $$;

create function private.profile_projection(p_candidate uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('draft',d.content,'reviewStatus',case when d.review_status='pending_review' then 'pending_review' when p.published_version_id is not null then 'approved' when d.candidate_id is not null then 'pending_review' else 'not_started' end,
 'discoverable',p.discoverable,'published',case when v.id is not null then jsonb_build_object('headline',v.headline,'educationLevel',v.education_level,'field',v.field,'studyStatus',v.study_status,'bullets',v.bullets,'skills',v.skills) else null end)
 from app.candidate_profiles p left join private.candidate_profile_drafts d on d.candidate_id=p.candidate_id left join app.candidate_profile_versions v on v.id=p.published_version_id where p.candidate_id=p_candidate
$$;
create function app.get_candidate_profile() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); result jsonb; begin
 select private.profile_projection(actor) into result;
 if result is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 return result;
end $$;
create function app.save_candidate_profile(p_draft jsonb,p_discoverable boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); k text; begin
 perform 1 from app.candidate_profiles where candidate_id=actor for update;
 if not found or not exists(select 1 from app.account_roles where account_id=actor and role='candidate') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if jsonb_typeof(p_draft) is distinct from 'object' or not (p_draft ?& array['headline','educationLevel','field','studyStatus','bullets','skills'])
 or exists(select 1 from jsonb_object_keys(p_draft) x where x not in ('headline','educationLevel','field','studyStatus','bullets','skills')) then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
 foreach k in array array['headline','educationLevel','field','studyStatus'] loop
  if jsonb_typeof(p_draft->k) is distinct from 'string' or length(btrim(p_draft->>k))<1 or length(p_draft->>k)>(case when k='headline' then 60 when k='studyStatus' then 40 else 80 end) then raise exception 'INVALID_PROFILE_TEXT' using errcode='22023'; end if;
 end loop;
 foreach k in array array['bullets','skills'] loop
  if jsonb_typeof(p_draft->k) is distinct from 'array' then raise exception 'INVALID_PROFILE_ARRAY' using errcode='22023'; end if;
  if (k='skills' and jsonb_array_length(p_draft->k)<1) or jsonb_array_length(p_draft->k)>(case when k='bullets' then 3 else 8 end)
  or exists(select 1 from jsonb_array_elements(p_draft->k) x where jsonb_typeof(x) is distinct from 'string' or length(btrim(x#>>'{}'))<1 or length(x#>>'{}')>(case when k='bullets' then 140 else 60 end)) then raise exception 'INVALID_PROFILE_ARRAY' using errcode='22023'; end if;
 end loop;
 insert into private.candidate_profile_drafts(candidate_id,content) values(actor,p_draft)
 on conflict(candidate_id) do update set content=excluded.content,revision=private.candidate_profile_drafts.revision+1,submitted_at=now(),review_status='pending_review'
 where private.candidate_profile_drafts.content is distinct from excluded.content;
 if p_discoverable is not null then update app.candidate_profiles set discoverable=p_discoverable where candidate_id=actor; end if;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'profile.submitted_for_review',actor);
 return private.profile_projection(actor);
end $$;
create function app.set_candidate_visibility(p_discoverable boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); begin
 if p_discoverable is null then raise exception 'INVALID_VISIBILITY' using errcode='22023'; end if;
 update app.candidate_profiles set discoverable=p_discoverable where candidate_id=actor;
 if not found then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'profile.visibility_changed',actor);
 return private.profile_projection(actor);
end $$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function app.ensure_account(text),app.get_account_context(),app.create_employer(text,text),app.save_job_draft(uuid,uuid,jsonb),app.publish_job(uuid),app.list_employer_jobs(uuid),
 app.list_open_jobs(integer,uuid),app.list_my_applications(),app.list_job_applications(uuid),app.get_candidate_profile(),app.save_candidate_profile(jsonb,boolean),app.set_candidate_visibility(boolean) from public,anon;
grant execute on function app.ensure_account(text),app.get_account_context(),app.create_employer(text,text),app.save_job_draft(uuid,uuid,jsonb),app.publish_job(uuid),app.list_employer_jobs(uuid),
 app.list_open_jobs(integer,uuid),app.list_my_applications(),app.list_job_applications(uuid),app.get_candidate_profile(),app.save_candidate_profile(jsonb,boolean),app.set_candidate_visibility(boolean) to authenticated;
