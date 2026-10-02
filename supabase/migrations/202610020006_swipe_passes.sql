-- Persistent swipe-left (pass) for both decks. A pass only removes a card from the
-- actor's deck; it is not a rejection notice, never reaches the other party, and can be undone.
create table app.job_passes (
 candidate_id uuid not null references app.accounts(id), job_id uuid not null references app.jobs(id),
 passed_at timestamptz not null default now(), primary key(candidate_id,job_id)
);
-- Keyed by candidate (not card ref) so a pass survives card-ref regeneration; never exposed directly.
create table private.card_passes (
 job_id uuid not null references app.jobs(id), candidate_id uuid not null references app.accounts(id),
 actor_id uuid not null references app.accounts(id), passed_at timestamptz not null default now(), primary key(job_id,candidate_id)
);
alter table app.job_passes enable row level security;
alter table private.card_passes enable row level security;
revoke all on app.job_passes, private.card_passes from public, anon, authenticated;

create function app.pass_job(p_job uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); begin
 if not exists(select 1 from app.account_roles where account_id=actor and role='candidate') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if not exists(select 1 from app.jobs where id=p_job and state='open') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if exists(select 1 from app.applications where job_id=p_job and candidate_id=actor) then raise exception 'ALREADY_APPLIED' using errcode='42501'; end if;
 insert into app.job_passes(candidate_id,job_id) values(actor,p_job) on conflict do nothing;
end $$;
create function app.undo_job_pass(p_job uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); begin
 delete from app.job_passes where candidate_id=actor and job_id=p_job;
end $$;

create function app.pass_candidate_card(p_job uuid,p_card uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); org uuid; candidate uuid; begin
 select employer_id into org from app.jobs where id=p_job;
 if not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select candidate_id into candidate from private.candidate_card_refs where id=p_card and job_id=p_job;
 if candidate is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 insert into private.card_passes(job_id,candidate_id,actor_id) values(p_job,candidate,actor) on conflict do nothing;
end $$;
create function app.undo_candidate_card_pass(p_job uuid,p_card uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); org uuid; candidate uuid; begin
 select employer_id into org from app.jobs where id=p_job;
 if not private.is_recruiter(org,actor) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select candidate_id into candidate from private.candidate_card_refs where id=p_card and job_id=p_job;
 if candidate is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 delete from private.card_passes where job_id=p_job and candidate_id=candidate;
end $$;

-- Same signatures as 002; adds pass filtering (and, for employers, hides cards already marked interested).
create or replace function app.list_open_jobs(p_limit integer default 20,p_after uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); result jsonb; begin
 if not exists(select 1 from app.account_roles where account_id=actor and role='candidate') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_PAGE_SIZE' using errcode='22023'; end if;
 select coalesce(jsonb_agg(private.job_projection(j.id,false)||jsonb_build_object('canApply',private.eligible(j.id,actor)
 and not exists(select 1 from app.applications a where a.job_id=j.id and a.candidate_id=actor)) order by j.id),'[]'::jsonb) into result
 from (select j.id from app.jobs j join app.employers e on e.id=j.employer_id
 where j.state='open' and j.current_version_id is not null and (j.closes_at is null or j.closes_at>now())
 and e.verified_at is not null and e.suspended_at is null and (p_after is null or j.id>p_after)
 and not exists(select 1 from app.job_passes x where x.candidate_id=actor and x.job_id=j.id) order by j.id limit p_limit) j;
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
 and not exists(select 1 from app.applications a where a.job_id=p_job and a.candidate_id=r.candidate_id and a.withdrawn_at is not null)
 and not exists(select 1 from private.card_passes x where x.job_id=p_job and x.candidate_id=r.candidate_id)
 and not exists(select 1 from app.employer_interests i where i.job_id=p_job and i.candidate_id=r.candidate_id) order by r.id;
end $$;

revoke all on function app.pass_job(uuid),app.undo_job_pass(uuid),app.pass_candidate_card(uuid,uuid),app.undo_candidate_card_pass(uuid,uuid) from public, anon;
grant execute on function app.pass_job(uuid),app.undo_job_pass(uuid),app.pass_candidate_card(uuid,uuid),app.undo_candidate_card_pass(uuid,uuid) to authenticated;
