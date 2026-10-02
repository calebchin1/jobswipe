-- An authorized join is not attendance or completion evidence.
create table private.interview_call_rooms (
 interview_id uuid primary key references app.interviews(id),
 room_name uuid not null unique default gen_random_uuid(),
 candidate_participant uuid not null unique default gen_random_uuid(),
 interviewer_participant uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now()
);
alter table private.interview_call_rooms enable row level security;
revoke all on private.interview_call_rooms from public,anon,authenticated;
create trigger immutable_call_room before update or delete on private.interview_call_rooms
 for each row execute function private.immutable_record();

create function app.get_interview_call_access(p_interview uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); target_application uuid; a app.applications; i app.interviews; s app.interview_slots;
 org uuid; r private.interview_call_rooms; is_candidate boolean; handle text; close_at timestamptz; begin
 select application_id into target_application from app.interviews where id=p_interview;
 select * into a from app.applications where id=target_application for update;
 if a.id is null or a.withdrawn_at is not null or a.matched_at is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select * into i from app.interviews where id=p_interview for update;
 select * into s from app.interview_slots where id=i.slot_id;
 select employer_id into org from app.jobs where id=a.job_id;
 if s.id is null or i.status<>'scheduled' or s.status<>'booked'
 or not private.is_recruiter(org,s.interviewer_id)
 or not exists(select 1 from app.accounts where id=a.candidate_id and status='active')
 then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 is_candidate:=actor=a.candidate_id;
 if not is_candidate and actor<>s.interviewer_id then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 close_at:=i.ends_at+interval '15 minutes';
 if clock_timestamp()<i.starts_at-interval '10 minutes' or clock_timestamp()>=close_at then
  raise exception 'OUTSIDE_JOIN_WINDOW' using errcode='23514';
 end if;
 if (select count(*) from ops.audit_log where actor_id=actor and object_id=i.id and action='interview.join_authorized' and at>clock_timestamp()-interval '1 minute')>=12 then
  raise exception 'JOIN_RATE_LIMIT' using errcode='23514';
 end if;
 insert into private.interview_call_rooms(interview_id) values(i.id) on conflict do nothing;
 select * into r from private.interview_call_rooms where interview_id=i.id;
 select 'Candidate '||upper(substr(replace(id::text,'-',''),1,8)) into handle from private.candidate_card_refs where job_id=a.job_id and candidate_id=a.candidate_id;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'interview.join_authorized',i.id);
 return jsonb_build_object('interviewId',i.id,'roomName',r.room_name,
 'participantIdentity',case when is_candidate then r.candidate_participant else r.interviewer_participant end,
 'participantName',case when is_candidate then coalesce(handle,'Candidate') else 'Interviewer' end,
 'joinClosesAt',close_at);
end $$;
revoke all on function app.get_interview_call_access(uuid) from public,anon;
grant execute on function app.get_interview_call_access(uuid) to authenticated;

-- Calendar viewers are not necessarily assigned call participants.
create or replace function private.interview_projection(p_interview uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'applicationId',a.id,'jobId',a.job_id,'jobTitle',v.title,'company',e.public_name,
 'slotId',i.slot_id,'startsAt',i.starts_at,'endsAt',coalesce(i.ends_at,i.starts_at+interval '30 minutes'),
 'timeZone',coalesce(s.time_zone,'UTC'),'status',i.status,'round',1,
 'isParticipant',coalesce(auth.uid() in (a.candidate_id,s.interviewer_id),false))
 from app.interviews i join app.applications a on a.id=i.application_id join app.jobs j on j.id=a.job_id
 join app.job_versions v on v.id=a.applied_job_version_id join app.employers e on e.id=j.employer_id
 left join app.interview_slots s on s.id=i.slot_id where i.id=p_interview
$$;

-- A user's cleanup scope never includes another application's live room.
create function app.get_cancelled_call_rooms(p_application uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); a app.applications; org uuid; result jsonb; begin
 select * into a from app.applications where id=p_application;
 select employer_id into org from app.jobs where id=a.job_id;
 if a.id is null or (actor<>a.candidate_id and not private.is_recruiter(org,actor)) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(r.room_name),'[]'::jsonb) into result
 from app.interviews i join private.interview_call_rooms r on r.interview_id=i.id
 where i.application_id=a.id and (i.status in ('cancelled','completed','disputed','no_show') or a.withdrawn_at is not null);
 return result;
end $$;
revoke all on function app.get_cancelled_call_rooms(uuid) from public,anon;
grant execute on function app.get_cancelled_call_rooms(uuid) to authenticated;
create function private.enqueue_call_close() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='scheduled' and new.status<>'scheduled' and exists(select 1 from private.interview_call_rooms where interview_id=new.id) then
  insert into ops.outbox_events(event_type,aggregate_id,dedupe_key) values('call.close_requested',new.id,'call-close:'||new.id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.enqueue_call_close() from public,anon,authenticated;
create trigger call_close_intent after update of status on app.interviews for each row execute function private.enqueue_call_close();
