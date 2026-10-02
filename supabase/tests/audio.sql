-- Synthetic end-to-end setup, no actual provider call or completion shortcut.
insert into app.jobs(employer_id,state) values('10000000-0000-0000-0000-000000000001','open') returning id as audio_job \gset
insert into app.job_versions(job_id,title,pay_min_minor,pay_max_minor,currency,pay_period,is_vacancy,uses_ai_screening,minimum_age,questions)
 values(:'audio_job','Audio access test',1900,2100,'CAD','hour',true,false,14,array['Question one','Question two','Question three']) returning id as audio_version \gset
update app.jobs set current_version_id=:'audio_version' where id=:'audio_job';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select app.apply_to_job(:'audio_job') as audio_application \gset
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select app.express_employer_interest(:'audio_job',card_id) from app.list_candidate_cards(:'audio_job') where applied;
select app.create_interview_slot(:'audio_job',clock_timestamp()+interval '10 days',clock_timestamp()+interval '10 days 30 minutes','America/Toronto')->>'id' as far_slot \gset
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select app.book_interview(:'audio_application',:'far_slot')->>'id' as far_interview \gset
select test.conflict(format('select app.get_interview_call_access(%L)',:'far_interview'),'no tokens outside join window');
select app.cancel_interview(:'far_interview');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select app.create_interview_slot(:'audio_job',clock_timestamp()+interval '1 minute',clock_timestamp()+interval '31 minutes','America/Toronto')->>'id' as live_slot \gset
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select app.book_interview(:'audio_application',:'live_slot')->>'id' as live_interview \gset
select app.get_interview_call_access(:'live_interview') as candidate_access \gset
select test.assert(app.get_interview_call_access(:'live_interview')->>'participantIdentity'=(:'candidate_access'::jsonb->>'participantIdentity'),'stable participant identity');
select test.assert(not (:'candidate_access'::jsonb ? 'candidateId') and not (:'candidate_access'::jsonb ? 'email'),'no private identity in entitlement');
select test.assert((:'candidate_access'::jsonb->>'participantIdentity')<>'00000000-0000-0000-0000-000000000001','opaque identity differs from account');
select test.denied('select * from private.interview_call_rooms','call mappings private');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select test.denied(format('select app.get_interview_call_access(%L)',:'live_interview'),'other candidate cannot join');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select test.denied(format('select app.get_interview_call_access(%L)',:'live_interview'),'other recruiter cannot join');
reset role;
insert into app.employer_members(employer_id,account_id,role) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','recruiter');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select test.denied(format('select app.get_interview_call_access(%L)',:'live_interview'),'even same-team unassigned recruiter cannot join');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select app.get_interview_call_access(:'live_interview') as recruiter_access \gset
select test.assert(:'recruiter_access'::jsonb->>'roomName'=:'candidate_access'::jsonb->>'roomName','two authorized participants share room');
select test.assert(:'recruiter_access'::jsonb->>'participantIdentity'<>:'candidate_access'::jsonb->>'participantIdentity','distinct participants');
select test.assert(:'recruiter_access'::jsonb->>'participantName'='Interviewer','anonymous recruiter label');
reset role;
select test.assert((select attendance_verified_at is null and status='scheduled' from app.interviews where id=:'live_interview'),'join never establishes attendance');
update app.employers set suspended_at=now() where id='10000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select test.denied(format('select app.get_interview_call_access(%L)',:'live_interview'),'suspended employer blocks even candidate joining');
reset role;
update app.employers set suspended_at=null where id='10000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select app.withdraw_application(:'audio_application');
select test.denied(format('select app.get_interview_call_access(%L)',:'live_interview'),'withdrawal blocks all future join entitlement');
reset role;
select 'audio join entitlement/privacy checks passed' as result;
