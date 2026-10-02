-- Persistent pass/undo for both decks. Fresh job at employer 2 (recruiter ...04), minimum age 14.
update app.candidate_profiles set discoverable=true where candidate_id in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
insert into app.jobs(employer_id,state) values('10000000-0000-0000-0000-000000000002','open') returning id as swipe_job \gset
insert into app.job_versions(job_id,title,pay_min_minor,pay_max_minor,currency,pay_period,is_vacancy,uses_ai_screening,minimum_age,questions)
 values(:'swipe_job','Swipe test role',1900,2100,'CAD','hour',true,false,14,array['Question one','Question two','Question three']) returning id as swipe_version \gset
update app.jobs set current_version_id=:'swipe_version' where id=:'swipe_job';

set role anon;
select test.denied(format('select app.pass_job(%L)',:'swipe_job'),'anonymous cannot pass jobs');
reset role;

set role authenticated;
-- Candidate deck.
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select test.assert(exists(select 1 from jsonb_array_elements(app.list_open_jobs(100)) j where j->>'id'=:'swipe_job'),'job starts in deck');
select app.pass_job(:'swipe_job');
select app.pass_job(:'swipe_job');
select test.assert(not exists(select 1 from jsonb_array_elements(app.list_open_jobs(100)) j where j->>'id'=:'swipe_job'),'passed job leaves deck (idempotent)');
select test.denied('select * from app.job_passes','pass table not directly readable');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select test.assert(exists(select 1 from jsonb_array_elements(app.list_open_jobs(100)) j where j->>'id'=:'swipe_job'),'pass is per candidate');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select app.undo_job_pass(:'swipe_job');
select test.assert(exists(select 1 from jsonb_array_elements(app.list_open_jobs(100)) j where j->>'id'=:'swipe_job'),'undo restores job');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select test.denied(format('select app.pass_job(%L)',:'swipe_job'),'employer-only account cannot pass jobs');

-- Candidate A applies; applied jobs cannot be passed.
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select app.apply_to_job(:'swipe_job') as swipe_application \gset
select test.denied(format('select app.pass_job(%L)',:'swipe_job'),'applied job cannot be passed');

-- Employer deck.
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select card_id as card_b from app.list_candidate_cards(:'swipe_job') where not applied limit 1 \gset
select card_id as card_a from app.list_candidate_cards(:'swipe_job') where applied \gset
select app.pass_candidate_card(:'swipe_job',:'card_b');
select app.pass_candidate_card(:'swipe_job',:'card_b');
select test.assert(not exists(select 1 from app.list_candidate_cards(:'swipe_job') where card_id=:'card_b'),'passed card leaves deck (idempotent)');
select test.denied('select * from private.card_passes','card passes private');
select test.denied(format('select app.pass_candidate_card(%L,%L)','30000000-0000-0000-0000-000000000002',:'card_b'),'card ref cannot be reused on another job');
select app.undo_candidate_card_pass(:'swipe_job',:'card_b');
select test.assert(exists(select 1 from app.list_candidate_cards(:'swipe_job') where card_id=:'card_b'),'undo restores card');
select test.assert(app.express_employer_interest(:'swipe_job',:'card_a')=:'swipe_application','interest on applicant matches');
select test.assert(not exists(select 1 from app.list_candidate_cards(:'swipe_job') where card_id=:'card_a'),'acted-on card leaves deck');
select test.assert((select a->>'stage'='Matched' from jsonb_array_elements(app.list_job_applications(:'swipe_job')) a where a->>'id'=:'swipe_application'),'match still listed in applications');

set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select test.denied(format('select app.pass_candidate_card(%L,%L)',:'swipe_job',:'card_b'),'other company cannot pass');
select test.denied(format('select app.undo_candidate_card_pass(%L,%L)',:'swipe_job',:'card_b'),'other company cannot undo');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select test.denied(format('select app.pass_candidate_card(%L,%L)',:'swipe_job',:'card_b'),'candidate cannot use employer pass');
reset role;
