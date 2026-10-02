create function test.conflict(statement text,label text) returns void language plpgsql as $$
begin begin execute statement; exception when check_violation or unique_violation then return; end; raise exception 'EXPECTED CONFLICT: %',label; end $$;
-- Fresh synthetic applications, separate from earlier terminal withdrawals.
insert into app.jobs(id,employer_id,state) values
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','open'),
 ('30000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002','open'),
 ('30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','open');
insert into app.job_versions(id,job_id,title,pay_min_minor,pay_max_minor,currency,pay_period,is_vacancy,uses_ai_screening,minimum_age,questions) values
 ('40000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004','Interview test cafe',1900,2200,'CAD','hour',true,false,14,array['Original question one','Original question two','Original question three']),
 ('40000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000005','Interview test store',1900,2200,'CAD','hour',true,false,14,array['Question one','Question two','Question three']),
 ('40000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000006','Another cafe role',1900,2200,'CAD','hour',true,false,14,array['Question one','Question two','Question three']);
update app.jobs set current_version_id=('40000000'||substring(id::text from 9))::uuid where id in ('30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000006');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select app.apply_to_job('30000000-0000-0000-0000-000000000004') as app_a \gset
select app.apply_to_job('30000000-0000-0000-0000-000000000005') as app_b \gset
select test.denied(format('select app.list_application_interview_slots(%L)',:'app_a'),'unmatched cannot browse slots');
select test.denied('select app.create_interview_slot(''30000000-0000-0000-0000-000000000004'',now()+interval ''2 days'',now()+interval ''2 days 30 minutes'',''America/Toronto'')','candidate cannot create recruiter slot');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select app.apply_to_job('30000000-0000-0000-0000-000000000004') as app_other \gset
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select app.express_employer_interest('30000000-0000-0000-0000-000000000004',card_id) from app.list_candidate_cards('30000000-0000-0000-0000-000000000004');
select test.invalid('select app.create_interview_slot(''30000000-0000-0000-0000-000000000004'',now()-interval ''1 hour'',now()-interval ''30 minutes'',''America/Toronto'')','past slot');
select test.invalid('select app.create_interview_slot(''30000000-0000-0000-0000-000000000004'',now()+interval ''2 days'',now()+interval ''2 days 10 minutes'',''America/Toronto'')','short slot');
select test.invalid('select app.create_interview_slot(''30000000-0000-0000-0000-000000000004'',now()+interval ''2 days'',now()+interval ''2 days 30 minutes'',''Fake/Timezone'')','invalid timezone');
select date_trunc('hour',now()+interval '2 days') as start_time \gset
select app.create_interview_slot('30000000-0000-0000-0000-000000000004',:'start_time',:'start_time'::timestamptz+interval '30 minutes','America/Toronto')->>'id' as slot_a \gset
select test.assert(app.create_interview_slot('30000000-0000-0000-0000-000000000004',:'start_time',:'start_time'::timestamptz+interval '30 minutes','America/Toronto')->>'id'=:'slot_a','create slot retry');
select test.conflict(format('select app.create_interview_slot(''30000000-0000-0000-0000-000000000006'',%L::timestamptz+interval ''20 minutes'',%L::timestamptz+interval ''50 minutes'',''America/Toronto'')',:'start_time',:'start_time'),'recruiter cross-job slot overlap');
select test.conflict(format('select app.create_interview_slot(''30000000-0000-0000-0000-000000000004'',%L::timestamptz+interval ''32 minutes'',%L::timestamptz+interval ''62 minutes'',''America/Toronto'')',:'start_time',:'start_time'),'five-minute gap enforced');
select app.create_interview_slot('30000000-0000-0000-0000-000000000004',:'start_time'::timestamptz+interval '35 minutes',:'start_time'::timestamptz+interval '65 minutes','America/Toronto')->>'id' as slot_later \gset
select test.assert((app.list_employer_interview_slots('30000000-0000-0000-0000-000000000004')->0->>'ownedByMe')::boolean,'employer owns slot projection');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select test.denied(format('select app.cancel_interview_slot(%L)',:'slot_a'),'other company cannot cancel slot');
select app.express_employer_interest('30000000-0000-0000-0000-000000000005',card_id) from app.list_candidate_cards('30000000-0000-0000-0000-000000000005');
select app.create_interview_slot('30000000-0000-0000-0000-000000000005',:'start_time',:'start_time'::timestamptz+interval '30 minutes','America/Toronto')->>'id' as slot_b \gset
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select test.assert(jsonb_array_length(app.list_application_interview_slots(:'app_a'))=2,'matched candidate sees available slots');
select test.assert(not (app.list_application_interview_slots(:'app_a')->0 ? 'ownedByMe') and not (app.list_application_interview_slots(:'app_a')->0 ? 'interviewerId'),'candidate sees no recruiter account IDs');
select test.denied(format('select app.book_interview(%L,%L)',:'app_a',:'slot_b'),'cross-job slot replay');
select app.book_interview(:'app_a',:'slot_a')->>'id' as interview_a \gset
select test.assert(app.book_interview(:'app_a',:'slot_a')->>'id'=:'interview_a','booking retry returns same interview');
select test.conflict(format('select app.book_interview(%L,%L)',:'app_a',:'slot_later'),'one active interview per application');
select test.conflict(format('select app.book_interview(%L,%L)',:'app_b',:'slot_b'),'candidate cross-job overlap');
select test.assert(jsonb_array_length(app.list_application_interview_slots(:'app_b'))=0,'conflicting candidate slots hidden');
select test.assert((select count(*)=1 from jsonb_array_elements(app.list_candidate_interviews()) i where i->>'id'=:'interview_a'),'candidate upcoming query');
select test.denied(format('select app.submit_scorecard(%L,''[]'')',:'interview_a'),'booking never completes interview');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select test.conflict(format('select app.book_interview(%L,%L)',:'app_other',:'slot_a'),'slot cannot be double booked');
select test.denied(format('select app.list_application_interviews(%L)',:'app_a'),'other candidate cannot read interview');
select test.denied(format('select app.cancel_interview(%L)',:'interview_a'),'other candidate cannot cancel interview');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select test.conflict(format('select app.cancel_interview_slot(%L)',:'slot_a'),'booked slot cancellation must cancel interview');
select test.assert(app.list_job_interviews('30000000-0000-0000-0000-000000000004')->0->>'id'=:'interview_a','job interview list');
select test.denied(format('select app.submit_scorecard(%L,''[]'')',:'interview_a'),'employer cannot skip completion evidence');
reset role;
select test.assert((select question_ids=array['40000000-0000-0000-0000-000000000004:q1','40000000-0000-0000-0000-000000000004:q2','40000000-0000-0000-0000-000000000004:q3'] from app.interviews where id=:'interview_a'),'question IDs bound to applied immutable version');
select test.assert((select attendance_verified_at is null and candidate_confirmed_at is null and employer_confirmed_at is null from app.interviews where id=:'interview_a'),'no synthetic attendance from booking');
select test.assert((select count(*)=1 from ops.outbox_events where aggregate_id=:'interview_a' and event_type='interview.booked'),'one booking outbox intent');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select test.assert(app.cancel_interview(:'interview_a','Private reason with a name')->>'status'='cancelled','candidate cancel');
select app.cancel_interview(:'interview_a');
select test.conflict(format('select app.book_interview(%L,%L)',:'app_a',:'slot_a'),'late retry cannot resurrect cancelled booking');
select app.book_interview(:'app_a',:'slot_later')->>'id' as interview_later \gset
select app.withdraw_application(:'app_a');
select test.assert((select i->>'status'='cancelled' from jsonb_array_elements(app.list_application_interviews(:'app_a')) i where i->>'id'=:'interview_later'),'withdrawal atomically cancels scheduled interview');
select test.denied(format('select app.book_interview(%L,%L)',:'app_a',:'slot_a'),'withdrawn cannot book');
select test.denied(format('select app.list_application_interview_slots(%L)',:'app_a'),'withdrawn cannot browse slots');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select app.book_interview(:'app_other',:'slot_a')->>'id' as interview_other \gset
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select test.assert(app.cancel_interview(:'interview_other')->>'status'='cancelled','employer can cancel own job interview');
select test.assert((select s->>'status'='cancelled' from jsonb_array_elements(app.list_employer_interview_slots('30000000-0000-0000-0000-000000000004')) s where s->>'id'=:'slot_a'),'employer cancellation retires slot');
select test.denied('select * from private.interview_cancellations','raw cancellation reason private');
reset role;
select test.assert((select count(*)=1 from ops.outbox_events where aggregate_id=:'interview_a' and event_type='interview.cancelled'),'cancel retries one outbox');
select 'scheduling authorization, lifecycle, conflicts and privacy passed' as result;
