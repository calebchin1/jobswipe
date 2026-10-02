-- Dated first-round scheduling. No client-controlled completion or attendance.
create table app.interview_slots (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references app.jobs(id),
 interviewer_id uuid not null references app.accounts(id), starts_at timestamptz not null, ends_at timestamptz not null,
 time_zone text not null, status text not null default 'available' check(status in ('available','booked','cancelled')),
 check(ends_at-starts_at between interval '15 minutes' and interval '60 minutes'), created_at timestamptz not null default now()
);
create index interview_slots_job on app.interview_slots(job_id,starts_at);
create index interview_slots_calendar on app.interview_slots(interviewer_id,starts_at) where status<>'cancelled';
alter table app.interview_slots enable row level security;
revoke all on app.interview_slots from public,anon,authenticated;
alter table app.interviews add column slot_id uuid references app.interview_slots(id);
alter table app.interviews add column ends_at timestamptz;
create unique index one_scheduled_interview_per_application on app.interviews(application_id) where status='scheduled';
create unique index one_scheduled_interview_per_slot on app.interviews(slot_id) where status='scheduled' and slot_id is not null;
create unique index one_booking_per_application_slot on app.interviews(application_id,slot_id) where slot_id is not null;
create table private.interview_cancellations (
 interview_id uuid primary key references app.interviews(id), actor_id uuid not null references app.accounts(id),
 reason text check(length(reason)<=500), cancelled_at timestamptz not null default now()
);
alter table private.interview_cancellations enable row level security;
revoke all on private.interview_cancellations from public,anon,authenticated;

create function private.scheduling_scope_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.slot_id is distinct from old.slot_id then
  raise exception 'IMMUTABLE_SCHEDULE' using errcode='42501';
 end if;
 return new;
end $$;
create trigger immutable_scheduling_scope before update on app.interviews for each row execute function private.scheduling_scope_guard();
create function private.slot_scope_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'IMMUTABLE_SLOT' using errcode='42501'; end if;
 if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') or (old.status='cancelled' and new.status<>'cancelled') then
  raise exception 'IMMUTABLE_SLOT' using errcode='42501';
 end if;
 return new;
end $$;
create trigger immutable_slot_scope before update or delete on app.interview_slots for each row execute function private.slot_scope_guard();

create function private.slot_projection(p_slot uuid,p_actor uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'jobId',s.job_id,'startsAt',s.starts_at,'endsAt',s.ends_at,'timeZone',s.time_zone,'status',s.status)
 || case when p_actor is not null then jsonb_build_object('ownedByMe',s.interviewer_id=p_actor) else '{}'::jsonb end
 from app.interview_slots s where s.id=p_slot
$$;
create function private.interview_projection(p_interview uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'applicationId',a.id,'jobId',a.job_id,'jobTitle',v.title,'company',e.public_name,
 'slotId',i.slot_id,'startsAt',i.starts_at,'endsAt',coalesce(i.ends_at,i.starts_at+interval '30 minutes'),
 'timeZone',coalesce(s.time_zone,'UTC'),'status',i.status,'round',1)
 from app.interviews i join app.applications a on a.id=i.application_id join app.jobs j on j.id=a.job_id
 join app.job_versions v on v.id=a.applied_job_version_id join app.employers e on e.id=j.employer_id
 left join app.interview_slots s on s.id=i.slot_id where i.id=p_interview
$$;
create function private.interview_calendar_conflict(p_account uuid,p_start timestamptz,p_end timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from app.interviews i join app.applications a on a.id=i.application_id
 left join app.interview_slots s on s.id=i.slot_id
 where i.status='scheduled' and (a.candidate_id=p_account or s.interviewer_id=p_account)
 and tstzrange(i.starts_at,coalesce(i.ends_at,i.starts_at+interval '30 minutes')+interval '5 minutes','[)')
 && tstzrange(p_start,p_end+interval '5 minutes','[)'))
$$;

create function app.create_interview_slot(p_job uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_time_zone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); org uuid; result uuid; begin
 select employer_id into org from app.jobs where id=p_job;
 if not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if p_starts_at is null or p_ends_at is null or not isfinite(p_starts_at) or not isfinite(p_ends_at) or p_starts_at<=clock_timestamp()
 or p_ends_at-p_starts_at not between interval '15 minutes' and interval '60 minutes'
 or p_time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone) then
  raise exception 'INVALID_SLOT' using errcode='22023'; end if;
 -- All calendar writers lock these same account rows, so cross-job slots and
 -- bookings serialize even when they touch different applications or recruiters.
 perform 1 from app.accounts where id=actor for update;
 if not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select id into result from app.interview_slots where job_id=p_job and interviewer_id=actor and starts_at=p_starts_at and ends_at=p_ends_at and time_zone=p_time_zone and status<>'cancelled';
 if result is not null then return private.slot_projection(result,actor); end if;
 if exists(select 1 from app.interview_slots s where s.interviewer_id=actor and s.status<>'cancelled'
 and tstzrange(s.starts_at,s.ends_at+interval '5 minutes','[)') && tstzrange(p_starts_at,p_ends_at+interval '5 minutes','[)'))
 or private.interview_calendar_conflict(actor,p_starts_at,p_ends_at) then raise exception 'CALENDAR_CONFLICT' using errcode='23514'; end if;
 insert into app.interview_slots(job_id,interviewer_id,starts_at,ends_at,time_zone) values(p_job,actor,p_starts_at,p_ends_at,p_time_zone) returning id into result;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'interview.slot_created',result);
 return private.slot_projection(result,actor);
end $$;
create function app.list_employer_interview_slots(p_job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); org uuid; result jsonb; begin
 select employer_id into org from app.jobs where id=p_job;
 if not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.slot_projection(s.id,actor) order by s.starts_at,s.id),'[]'::jsonb) into result from app.interview_slots s where s.job_id=p_job;
 return result;
end $$;
create function app.cancel_interview_slot(p_slot uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); s app.interview_slots; org uuid; begin
 select * into s from app.interview_slots where id=p_slot;
 select employer_id into org from app.jobs where id=s.job_id;
 if s.id is null or s.interviewer_id<>actor or not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 perform 1 from app.accounts where id=actor for update;
 select * into s from app.interview_slots where id=p_slot for update;
 if s.status='booked' then raise exception 'CANCEL_INTERVIEW_FIRST' using errcode='23514'; end if;
 if s.status='cancelled' then return private.slot_projection(s.id,actor); end if;
 update app.interview_slots set status='cancelled' where id=s.id;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'interview.slot_cancelled',s.id);
 return private.slot_projection(s.id,actor);
end $$;

create function app.list_application_interview_slots(p_application uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); a app.applications; org uuid; result jsonb; begin
 select * into a from app.applications where id=p_application;
 select employer_id into org from app.jobs where id=a.job_id;
 if a.id is null or a.candidate_id<>actor or a.matched_at is null or a.withdrawn_at is not null
 or not exists(select 1 from app.employers where id=org and verified_at is not null and suspended_at is null) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.slot_projection(s.id) order by s.starts_at,s.id),'[]'::jsonb) into result
 from app.interview_slots s where s.job_id=a.job_id and s.status='available' and s.starts_at>clock_timestamp()
 and s.interviewer_id<>actor and private.is_recruiter(org,s.interviewer_id)
 and not private.interview_calendar_conflict(actor,s.starts_at,s.ends_at);
 return result;
end $$;
create function app.book_interview(p_application uuid,p_slot uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); a app.applications; s app.interview_slots; org uuid; existing app.interviews; result uuid; questions text[]; begin
 select * into a from app.applications where id=p_application for update;
 if a.id is null or a.candidate_id<>actor or a.matched_at is null or a.withdrawn_at is not null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select * into s from app.interview_slots where id=p_slot;
 select employer_id into org from app.jobs where id=a.job_id;
 if s.id is null or s.job_id<>a.job_id or s.interviewer_id=actor or not private.is_recruiter(org,s.interviewer_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 perform id from app.accounts where id in (actor,s.interviewer_id) order by id for update;
 select * into s from app.interview_slots where id=p_slot for update;
 if not private.is_recruiter(org,s.interviewer_id) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select * into existing from app.interviews where application_id=a.id and status='scheduled';
 if existing.id is not null then
  if existing.slot_id=s.id then return private.interview_projection(existing.id); end if;
  raise exception 'INTERVIEW_ALREADY_SCHEDULED' using errcode='23514';
 end if;
 if exists(select 1 from app.interviews where application_id=a.id and slot_id=s.id) then raise exception 'BOOKING_ALREADY_USED' using errcode='23514'; end if;
 if s.status<>'available' or s.starts_at<=clock_timestamp() then raise exception 'SLOT_UNAVAILABLE' using errcode='23514'; end if;
 if private.interview_calendar_conflict(actor,s.starts_at,s.ends_at) or private.interview_calendar_conflict(s.interviewer_id,s.starts_at,s.ends_at) then raise exception 'CALENDAR_CONFLICT' using errcode='23514'; end if;
 -- Question identities are frozen to the applied posting, never the edited job.
 select array_agg(v.id::text||':q'||n::text order by n) into questions from app.job_versions v
 cross join lateral generate_subscripts(v.questions,1) n where v.id=a.applied_job_version_id;
 insert into app.interviews(application_id,status,starts_at,ends_at,question_ids,slot_id) values(a.id,'scheduled',s.starts_at,s.ends_at,questions,s.id) returning id into result;
 update app.interview_slots set status='booked' where id=s.id;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'interview.booked',result);
 insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('interview.booked',result,'interview-booked:'||result);
 return private.interview_projection(result);
end $$;

create function app.list_application_interviews(p_application uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); a app.applications; org uuid; result jsonb; begin
 select * into a from app.applications where id=p_application;
 select employer_id into org from app.jobs where id=a.job_id;
 if a.id is null or (a.candidate_id<>actor and not private.is_recruiter(org,actor)) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.interview_projection(i.id) order by i.starts_at,i.id),'[]'::jsonb) into result from app.interviews i where i.application_id=a.id;
 return result;
end $$;
create function app.list_candidate_interviews() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); result jsonb; begin
 if not exists(select 1 from app.account_roles where account_id=actor and role='candidate') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.interview_projection(i.id) order by i.starts_at,i.id),'[]'::jsonb) into result
 from app.interviews i join app.applications a on a.id=i.application_id where a.candidate_id=actor;
 return result;
end $$;
create function app.list_job_interviews(p_job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); org uuid; result jsonb; begin
 select employer_id into org from app.jobs where id=p_job;
 if not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.interview_projection(i.id) order by i.starts_at,i.id),'[]'::jsonb) into result
 from app.interviews i join app.applications a on a.id=i.application_id where a.job_id=p_job;
 return result;
end $$;
create function app.cancel_interview(p_interview uuid,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); i app.interviews; a app.applications; s app.interview_slots; org uuid; candidate_cancel boolean; begin
 select * into i from app.interviews where id=p_interview;
 select * into a from app.applications where id=i.application_id for update;
 select employer_id into org from app.jobs where id=a.job_id;
 if a.id is null or (a.candidate_id<>actor and not private.is_recruiter(org,actor)) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if length(p_reason)>500 then raise exception 'INVALID_REASON' using errcode='22023'; end if;
 select * into i from app.interviews where id=p_interview;
 if i.status='cancelled' then return private.interview_projection(i.id); end if;
 if i.status<>'scheduled' then raise exception 'INTERVIEW_NOT_CANCELLABLE' using errcode='23514'; end if;
 select * into s from app.interview_slots where id=i.slot_id;
 perform id from app.accounts where id in (a.candidate_id,s.interviewer_id) order by id for update;
 if s.id is not null then perform 1 from app.interview_slots where id=s.id for update; end if;
 candidate_cancel:=actor=a.candidate_id;
 update app.interviews set status='cancelled' where id=i.id;
 if s.id is not null then
  update app.interview_slots set status=case when candidate_cancel and s.starts_at>clock_timestamp() and private.is_recruiter(org,s.interviewer_id) then 'available' else 'cancelled' end where id=s.id;
 end if;
 insert into private.interview_cancellations(interview_id,actor_id,reason) values(i.id,actor,nullif(btrim(p_reason),''));
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'interview.cancelled',i.id);
 insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('interview.cancelled',i.id,'interview-cancelled:'||i.id);
 return private.interview_projection(i.id);
end $$;

create or replace function app.withdraw_application(p_application uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); a app.applications; appointment record; begin
 select * into a from app.applications where id=p_application for update;
 if a.id is null or a.candidate_id<>actor then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if a.withdrawn_at is not null then return; end if;
 for appointment in select id from app.interviews where application_id=a.id and status='scheduled' order by id loop
  perform app.cancel_interview(appointment.id,'Application withdrawn');
 end loop;
 update app.applications set withdrawn_at=now() where id=a.id;
 update app.reveal_authorizations set revoked_at=now() where application_id=a.id and revoked_at is null;
 update app.reveals set revoked_at=now() where application_id=a.id and revoked_at is null;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'application.withdrawn',a.id);
 insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('application.withdrawn',a.id,'withdraw:'||a.id);
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function app.create_interview_slot(uuid,timestamptz,timestamptz,text),app.list_employer_interview_slots(uuid),app.cancel_interview_slot(uuid),
 app.list_application_interview_slots(uuid),app.book_interview(uuid,uuid),app.list_application_interviews(uuid),app.list_candidate_interviews(),app.list_job_interviews(uuid),app.cancel_interview(uuid,text) from public,anon;
grant execute on function app.create_interview_slot(uuid,timestamptz,timestamptz,text),app.list_employer_interview_slots(uuid),app.cancel_interview_slot(uuid),
 app.list_application_interview_slots(uuid),app.book_interview(uuid,uuid),app.list_application_interviews(uuid),app.list_candidate_interviews(),app.list_job_interviews(uuid),app.cancel_interview(uuid,text) to authenticated;
