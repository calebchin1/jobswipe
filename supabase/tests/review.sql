grant usage on schema test to swipe_reviewer;
set session authorization authenticated;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select test.denied('select review.list_pending_employers()','candidate no review schema');
select test.denied('select review.list_pending_profiles()','candidate no raw profile queue');
select test.denied('set role swipe_reviewer','candidate cannot assume operational role');
select test.denied('select * from private.profile_review_proposals','candidate no direct proposals');
select app.save_candidate_profile('{"headline":"Private draft Robin Example","educationLevel":"Secondary","field":"General","studyStatus":"Studying","bullets":[],"skills":["Organization"]}');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select test.denied('select review.list_pending_profiles()','employer no review queue');
reset role;
reset session authorization;
select test.denied('select review.list_pending_profiles()','superuser workflow rejected despite function ownership');
-- A non-superuser operator identity, even though test harness can impersonate it.
set session authorization swipe_test_operator;
set role swipe_reviewer;
select test.denied('select * from private.candidate_eligibility','reviewer cannot read age/work evidence');
select test.denied('select * from private.candidate_identity','reviewer cannot read private identity');
select test.denied('update app.employers set verified_at=now()','reviewer has no raw mutation rights');
select test.assert(jsonb_array_length(review.list_pending_profiles())>0,'operator has scoped draft queue');
select review.get_candidate_draft('00000000-0000-0000-0000-000000000002')->>'draftRevision' as reviewed_revision \gset
select test.conflict('select review.propose_candidate_profile(''00000000-0000-0000-0000-000000000002'',999,''{"headline":"Careful organizer","educationLevel":"Secondary","field":"General","studyStatus":"Studying","bullets":[],"skills":["Organization"]}'',''Synthetic manual review'')','stale operator input rejected');
select review.propose_candidate_profile('00000000-0000-0000-0000-000000000002',:'reviewed_revision','{"headline":"Careful organizer","educationLevel":"Secondary","field":"General","studyStatus":"Studying","bullets":[],"skills":["Organization"]}','Synthetic manual review')->>'id' as proposal_one \gset
select test.assert(review.propose_candidate_profile('00000000-0000-0000-0000-000000000002',:'reviewed_revision','{"headline":"Careful organizer","educationLevel":"Secondary","field":"General","studyStatus":"Studying","bullets":[],"skills":["Organization"]}','Synthetic retry')->>'id'=:'proposal_one','proposal retry deduplicated');
reset role;
reset session authorization;
select test.assert((select p.published_version_id='20000000-0000-0000-0000-000000000002' from app.candidate_profiles p where candidate_id='00000000-0000-0000-0000-000000000002'),'operator proposal does not publish');
select test.assert((select operator_login='swipe_test_operator' from ops.review_decisions where action='profile.proposed' order by at desc limit 1),'operator session identity audited');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select test.denied(format('select app.approve_profile_proposal(%L)',:'proposal_one'),'other candidate cannot approve');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select test.assert(app.get_candidate_profile()->>'reviewStatus'='awaiting_approval','exact review preview ready');
select test.assert(app.get_candidate_profile()->'published'->>'headline'='Ready for a first job','previous approved profile preserved');
select test.assert(app.get_candidate_profile()->'proposal'->>'id'=:'proposal_one','correct proposal shown');
select app.save_candidate_profile('{"headline":"A changed private draft","educationLevel":"Secondary","field":"General","studyStatus":"Studying","bullets":[],"skills":["Organization"]}');
select test.assert(app.get_candidate_profile()->'proposal'='null'::jsonb,'edited draft hides stale proposal');
select test.conflict(format('select app.approve_profile_proposal(%L)',:'proposal_one'),'edited draft invalidates prior approval action');
reset role;
set session authorization swipe_test_operator;
set role swipe_reviewer;
select review.get_candidate_draft('00000000-0000-0000-0000-000000000002')->>'draftRevision' as current_revision \gset
select review.propose_candidate_profile('00000000-0000-0000-0000-000000000002',:'current_revision','{"headline":"Organized and ready to learn","educationLevel":"Secondary","field":"General","studyStatus":"Studying","bullets":[],"skills":["Organization"]}','Synthetic second review')->>'id' as proposal_two \gset
select review.propose_candidate_profile('00000000-0000-0000-0000-000000000002',:'current_revision','{"headline":"Careful organizer ready to learn","educationLevel":"Secondary","field":"General","studyStatus":"Studying","bullets":[],"skills":["Organization"]}','Synthetic correction before approval')->>'id' as proposal_three \gset
select test.conflict(format('select review.propose_candidate_profile(''00000000-0000-0000-0000-000000000002'',%L,''{"headline":"Organized and ready to learn","educationLevel":"Secondary","field":"General","studyStatus":"Studying","bullets":[],"skills":["Organization"]}'',''Late operator retry'')',:'current_revision'),'superseded operator retry fails clearly');
reset role;
reset session authorization;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select test.conflict(format('select app.approve_profile_proposal(%L)',:'proposal_two'),'superseded proposal cannot publish');
select test.assert(app.approve_profile_proposal(:'proposal_three')->'published'->>'headline'='Careful organizer ready to learn','candidate publishes exact reviewed content');
select test.assert(app.approve_profile_proposal(:'proposal_three')->>'reviewStatus'='approved','approval retry idempotent');
select test.assert(app.get_candidate_profile()->'proposal'='null'::jsonb,'approved proposal no longer pending');
reset role;
select test.assert((select count(*)=1 from app.profile_proposal_approvals where proposal_id=:'proposal_three'),'one approval record');
select test.assert((select minimum_age_band=14 from private.candidate_eligibility where candidate_id='00000000-0000-0000-0000-000000000002'),'review never modifies eligibility');
select test.denied('update private.profile_review_proposals set content=''{}''','reviewed proposals immutable');
select test.denied('delete from ops.review_decisions','review decisions immutable');
-- Fresh identity has no eligibility row; profile approval alone cannot invent one.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000020';
select app.ensure_account('candidate');
select app.save_candidate_profile('{"headline":"New candidate draft","educationLevel":"Bachelor","field":"Math","studyStatus":"Studying","bullets":[],"skills":["Organization"]}',true);
reset role;
set session authorization swipe_test_operator;
set role swipe_reviewer;
select review.propose_candidate_profile('00000000-0000-0000-0000-000000000020',1,'{"headline":"New candidate ready for review","educationLevel":"Bachelor","field":"Math","studyStatus":"Studying","bullets":[],"skills":["Organization"]}','Synthetic new candidate review')->>'id' as fresh_proposal \gset
reset role;
reset session authorization;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000020';
select app.approve_profile_proposal(:'fresh_proposal');
select test.assert(not exists(select 1 from jsonb_array_elements(app.list_open_jobs()) j where (j->>'canApply')::boolean),'approved profile does not imply eligibility');
select app.ensure_account('employer');
select app.create_employer('Reviewable Fictional Company','https://review.example.invalid') as review_company \gset
select test.denied(format('select review.verify_employer(%L,''https://review.example.invalid'',''I verify myself'')',:'review_company'),'cannot selfverify employer');
reset role;
set session authorization swipe_test_operator;
set role swipe_reviewer;
select test.conflict(format('select review.verify_employer(%L,''https://wrong.example.invalid'',''Evidence on outdated website'')',:'review_company'),'verification binds reviewed website');
select test.assert(review.verify_employer(:'review_company','https://review.example.invalid','Synthetic evidence reviewed manually')->>'verificationStatus'='verified','operator verification');
select review.verify_employer(:'review_company','https://review.example.invalid','Synthetic retry');
reset role;
reset session authorization;
select test.assert((select count(*)=1 from ops.review_decisions where subject_id=:'review_company' and action='employer.verified'),'verification retry single decision');
select 'operational review authorization and exact publication passed' as result;
