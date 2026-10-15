-- Adult-only pilot: self-attestation, separate from anonymous profile review.
-- This records declarations; it does not verify identity or immigration documents.
create table private.candidate_pilot_attestations (
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 candidate_id uuid not null references app.candidate_profiles(candidate_id),
 adult boolean not null, authorized_to_work boolean not null,
 policy_version text not null check(policy_version='adult-pilot-v1'),
 attested_at timestamptz not null default now(),
 refresh_due_at timestamptz not null
);
create index pilot_attestation_candidate on private.candidate_pilot_attestations(candidate_id,sequence desc);
alter table private.candidate_pilot_attestations enable row level security;
revoke all on private.candidate_pilot_attestations from public,anon,authenticated,swipe_reviewer;
revoke all on sequence private.candidate_pilot_attestations_sequence_seq from public,anon,authenticated,swipe_reviewer;
create trigger immutable_pilot_attestation before update or delete on private.candidate_pilot_attestations
 for each row execute function private.immutable_record();

create function app.get_candidate_eligibility() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); latest private.candidate_pilot_attestations; begin
 if not exists(select 1 from app.account_roles where account_id=actor and role='candidate') then
  raise exception 'CANDIDATE_REQUIRED' using errcode='42501'; end if;
 select * into latest from private.candidate_pilot_attestations where candidate_id=actor order by sequence desc limit 1;
 return jsonb_build_object('policyVersion','adult-pilot-v1','status',
  case when latest.id is null then 'not_started'
   when not latest.adult or not latest.authorized_to_work then 'not_eligible'
   when latest.refresh_due_at<=now() then 'expired' else 'eligible' end,
  'attestedAt',latest.attested_at,'refreshDueAt',latest.refresh_due_at);
end $$;

create function app.attest_candidate_eligibility(p_adult boolean,p_authorized_to_work boolean,p_policy_version text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); due timestamptz:=now()+interval '90 days'; begin
 if not exists(select 1 from app.account_roles where account_id=actor and role='candidate') then
  raise exception 'CANDIDATE_REQUIRED' using errcode='42501'; end if;
 if p_adult is null or p_authorized_to_work is null or p_policy_version is distinct from 'adult-pilot-v1' then
  raise exception 'INVALID_ATTESTATION' using errcode='22023'; end if;
 -- Same aggregate lock as profile publication/application gating.
 perform 1 from app.candidate_profiles where candidate_id=actor for update;
 if not found then raise exception 'CANDIDATE_REQUIRED' using errcode='42501'; end if;
 insert into private.candidate_pilot_attestations(candidate_id,adult,authorized_to_work,policy_version,refresh_due_at)
 values(actor,p_adult,p_authorized_to_work,p_policy_version,due);
 if p_adult and p_authorized_to_work then
  insert into private.candidate_eligibility(candidate_id,minimum_age_band,work_attested,policy_version,refresh_due_at)
  values(actor,18,true,'adult-pilot-v1',due)
  on conflict(candidate_id) do update set minimum_age_band=18,work_attested=true,policy_version='adult-pilot-v1',refresh_due_at=excluded.refresh_due_at;
 else
  delete from private.candidate_eligibility where candidate_id=actor;
 end if;
 insert into ops.audit_log(actor_id,action,object_id) values(actor,'candidate.eligibility_attested',actor);
 return app.get_candidate_eligibility();
end $$;
revoke all on function app.get_candidate_eligibility(),app.attest_candidate_eligibility(boolean,boolean,text) from public,anon;
grant execute on function app.get_candidate_eligibility(),app.attest_candidate_eligibility(boolean,boolean,text) to authenticated;
