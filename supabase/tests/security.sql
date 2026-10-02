-- Executed as isolated DB owner. Helpers use invoker permissions for the statement.
create schema test;
grant usage on schema test to authenticated, anon;
create function test.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %',label; end if; end $$;
create function test.denied(statement text, label text) returns void language plpgsql as $$
begin
 begin execute statement; exception when insufficient_privilege then return; end;
 raise exception 'EXPECTED DENIAL: %',label;
end $$;
create function test.invalid(statement text, label text) returns void language plpgsql as $$
begin
 begin execute statement; exception when invalid_parameter_value then return; end;
 raise exception 'EXPECTED VALIDATION ERROR: %',label;
end $$;

set role anon;
select test.denied('select app.apply_to_job(''30000000-0000-0000-0000-000000000001'')','anonymous RPC');
reset role;
set role authenticated;
select test.denied('select app.apply_to_job(''30000000-0000-0000-0000-000000000001'')','missing session');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select test.assert((select count(*)=1 from app.accounts),'account RLS own row');
select test.denied('select * from private.candidate_identity','private identity direct read');
select test.denied('select * from private.candidate_eligibility','eligibility direct read');
select test.denied('select private.require_actor()','private helper not callable');
select test.denied('update app.accounts set status=''active''','self status escalation');
select test.denied('insert into app.reveals(authorization_id,application_id) values(gen_random_uuid(),gen_random_uuid())','direct reveal write');
select test.denied('select app.apply_to_job(''30000000-0000-0000-0000-000000000003'')','unverified employer job');
select app.apply_to_job('30000000-0000-0000-0000-000000000001') as application_id \gset
select test.assert(app.apply_to_job('30000000-0000-0000-0000-000000000001')=:'application_id','application retry stable');
select test.denied(format('select app.authorize_reveal(%L,''50000000-0000-0000-0000-000000000001'',array[''00000000-0000-0000-0000-000000000003''::uuid],1)',:'application_id'),'early reveal authorization');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select test.denied('select app.apply_to_job(''30000000-0000-0000-0000-000000000001'')','minimum age eligibility');
select test.denied(format('select app.withdraw_application(%L)',:'application_id'),'other candidate withdraw');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select test.denied('select * from app.list_candidate_cards(''30000000-0000-0000-0000-000000000001'')','cross-company card deck');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
select test.denied('select * from app.list_candidate_cards(''30000000-0000-0000-0000-000000000003'')','unverified deck');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
select test.denied('select * from app.list_candidate_cards(''30000000-0000-0000-0000-000000000001'')','removed seat');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select test.assert((select count(*)=1 from app.list_candidate_cards('30000000-0000-0000-0000-000000000001')),'only eligible cards');
select card_id from app.list_candidate_cards('30000000-0000-0000-0000-000000000001') \gset
select test.assert(app.express_employer_interest('30000000-0000-0000-0000-000000000001',:'card_id')=:'application_id','mutual match');
select app.express_employer_interest('30000000-0000-0000-0000-000000000001',:'card_id');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select test.denied(format('select app.express_employer_interest(''30000000-0000-0000-0000-000000000002'',%L)',:'card_id'),'cross-job card reuse');
reset role;
select test.assert((select count(*)=1 from ops.outbox_events where event_type='application.matched'),'one match outbox event');
insert into app.interviews(id,application_id,status,starts_at,question_ids) values
 ('60000000-0000-0000-0000-000000000001',:'application_id','scheduled',now(),array['q1','q2','q3']);
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select test.denied('update app.interviews set status=''completed''','client cannot fake interview completion');
select test.denied('select app.submit_scorecard(''60000000-0000-0000-0000-000000000001'',''[]'')','scorecard before completion');
reset role;
update app.interviews set status='completed',attendance_verified_at=now(),candidate_confirmed_at=now(),employer_confirmed_at=now();
set role authenticated;
select test.invalid('select app.submit_scorecard(''60000000-0000-0000-0000-000000000001'',''[{"questionId":"q1","score":5},{"questionId":"q1","score":5},{"questionId":"q3","score":5}]'')','duplicate question');
select test.invalid('select app.submit_scorecard(''60000000-0000-0000-0000-000000000001'',''[{"questionId":"q1","score":6},{"questionId":"q2","score":5},{"questionId":"q3","score":5}]'')','score bounds');
select test.invalid('select app.submit_scorecard(''60000000-0000-0000-0000-000000000001'',''[4,5,3]'')','numbers without question IDs');
select test.invalid('select app.submit_scorecard(''60000000-0000-0000-0000-000000000001'',''[{"questionId":"q1","score":4,"extra":true},{"questionId":"q2","score":5},{"questionId":"q3","score":3}]'')','extra score keys');
select test.invalid('select app.submit_scorecard(''60000000-0000-0000-0000-000000000001'',''[{"questionId":"q1","score":"4"},{"questionId":"q2","score":5},{"questionId":"q3","score":3}]'')','string score');
select test.invalid('select app.submit_scorecard(''60000000-0000-0000-0000-000000000001'',''[{"questionId":1,"score":4},{"questionId":"q2","score":5},{"questionId":"q3","score":3}]'')','non-string question ID');
select app.submit_scorecard('60000000-0000-0000-0000-000000000001','[{"questionId":"q1","score":4},{"questionId":"q2","score":5},{"questionId":"q3","score":3}]') as scorecard_id \gset
select test.assert(app.submit_scorecard('60000000-0000-0000-0000-000000000001','[{"questionId":"q1","score":4},{"questionId":"q2","score":5},{"questionId":"q3","score":3}]')=:'scorecard_id','scorecard retry');
select test.denied('select app.submit_scorecard(''60000000-0000-0000-0000-000000000001'',''[{"questionId":"q1","score":5},{"questionId":"q2","score":5},{"questionId":"q3","score":3}]'')','locked score changes');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select test.denied('select * from app.scorecards','candidate cannot read employer scorecard');
select test.denied(format('select app.authorize_reveal(%L,''50000000-0000-0000-0000-000000000002'',array[''00000000-0000-0000-0000-000000000003''::uuid],1)',:'application_id'),'wrong document owner');
select test.denied(format('select app.authorize_reveal(%L,''50000000-0000-0000-0000-000000000001'',array[''00000000-0000-0000-0000-000000000004''::uuid],1)',:'application_id'),'wrong organization recipient');
select app.authorize_reveal(:'application_id','50000000-0000-0000-0000-000000000001',array['00000000-0000-0000-0000-000000000003'::uuid],1) as authorization_id \gset
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
reset role;
update private.candidate_identity set revision=2 where candidate_id='00000000-0000-0000-0000-000000000001';
set role authenticated;
select test.denied(format('select app.grant_reveal(%L)',:'authorization_id'),'stale identity consent');
reset role;
select test.denied('update private.candidate_identity set revision=1 where candidate_id=''00000000-0000-0000-0000-000000000001''','identity revision cannot regress');
select test.denied('update private.candidate_identity set legal_name=''Changed'' where candidate_id=''00000000-0000-0000-0000-000000000001''','identity update must increment revision');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select test.denied(format('select app.authorize_reveal(%L,''50000000-0000-0000-0000-000000000001'',array[''00000000-0000-0000-0000-000000000003''::uuid],1)',:'application_id'),'preview revision must equal current identity');
select app.authorize_reveal(:'application_id','50000000-0000-0000-0000-000000000001',array['00000000-0000-0000-0000-000000000003'::uuid],2) as authorization_id \gset
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
begin;
select app.grant_reveal(:'authorization_id');
rollback;
reset role;
select test.assert((select count(*)=0 from app.reveals),'rolled back grant absent');
select test.assert((select count(*)=0 from ops.outbox_events where event_type like 'reveal.%'),'rolled back grant leaves no outbox');
set role authenticated;
select app.grant_reveal(:'authorization_id') as reveal_id \gset
select test.assert(app.grant_reveal(:'authorization_id')=:'reveal_id','grant retry');
select test.assert((select legal_name='Alex Example' from app.read_reveal(:'reveal_id')),'approved projection');
select test.assert((select not (to_jsonb(r) ? 'minimum_age_band') and not (to_jsonb(r) ? 'candidate_id') from app.read_reveal(:'reveal_id') r),'projection excludes eligibility and global candidate ID');
select test.denied('select * from private.candidate_identity','reveal never grants private base table');
reset role;
update app.interviews set status='disputed' where id='60000000-0000-0000-0000-000000000001';
set role authenticated;
select test.denied(format('select * from app.read_reveal(%L)',:'reveal_id'),'disputed interview stops subsequent reads');
reset role;
update app.interviews set status='completed' where id='60000000-0000-0000-0000-000000000001';
set role authenticated;
reset role;
update app.employers set suspended_at=now() where id='10000000-0000-0000-0000-000000000001';
set role authenticated;
select test.denied(format('select * from app.read_reveal(%L)',:'reveal_id'),'suspended company reveal');
reset role;
update app.employers set suspended_at=null where id='10000000-0000-0000-0000-000000000001';
update app.accounts set status='suspended' where id='00000000-0000-0000-0000-000000000001';
set role authenticated;
select test.denied(format('select * from app.read_reveal(%L)',:'reveal_id'),'suspended candidate reveal');
reset role;
update app.accounts set status='active' where id='00000000-0000-0000-0000-000000000001';
set role authenticated;

set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select test.denied(format('select * from app.read_reveal(%L)',:'reveal_id'),'cross-company reveal');
reset role;
update app.employer_members set revoked_at=now() where account_id='00000000-0000-0000-0000-000000000003';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select test.denied(format('select * from app.read_reveal(%L)',:'reveal_id'),'seat removal revokes reveal');
reset role;
update app.employer_members set revoked_at=null where account_id='00000000-0000-0000-0000-000000000003';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select app.withdraw_application(:'application_id');
select app.withdraw_application(:'application_id');
select test.denied('select app.apply_to_job(''30000000-0000-0000-0000-000000000001'')','withdrawal terminal');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select test.denied(format('select * from app.read_reveal(%L)',:'reveal_id'),'withdrawn reveal');
select test.denied(format('select app.grant_reveal(%L)',:'authorization_id'),'withdrawn grant retry');
select test.assert((select count(*)=0 from app.list_candidate_cards('30000000-0000-0000-0000-000000000001')),'withdrawn candidate absent');
reset role;
select test.denied('update app.scorecards set scores=''[]''','scorecard immutable even for owner');
select test.denied('update app.job_versions set title=''changed''','job history immutable');
select test.denied('delete from ops.audit_log','audit immutable');
select test.denied('update private.resume_versions set storage_key=''replacement.pdf'' where id=''50000000-0000-0000-0000-000000000001''','approved bytes cannot change under document ID');
select test.denied('update app.reveal_authorizations set recipient_ids=array[''00000000-0000-0000-0000-000000000004''::uuid]','consent recipient scope immutable');
select test.denied('update app.reveal_authorizations set revoked_at=null','authorization revocation terminal');
select test.denied('update app.reveals set revoked_at=null','grant revocation terminal');
select test.denied('update app.interviews set question_ids=array[''other1'',''other2'',''other3'']','interview questions frozen');

select test.assert((select count(*)=1 from ops.outbox_events where event_type='reveal.authorized_delivery'),'single disclosure intent');
select test.assert((select count(*)=1 from ops.outbox_events where event_type='reveal.candidate_notice'),'single candidate notice');
select 'security assertions passed' as result;
