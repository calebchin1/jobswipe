-- Deliberately synthetic fixtures, never part of deployment migrations.
do $$ begin
 if current_database() not like 'swipe_hire_test_%' then raise exception 'Fixture database name must begin swipe_hire_test_'; end if;
end $$;
insert into app.accounts(id) values
 ('00000000-0000-0000-0000-000000000001'), -- candidate A
 ('00000000-0000-0000-0000-000000000002'), -- candidate B
 ('00000000-0000-0000-0000-000000000003'), -- recruiter A
 ('00000000-0000-0000-0000-000000000004'), -- recruiter B
 ('00000000-0000-0000-0000-000000000005'), -- unverified recruiter
 ('00000000-0000-0000-0000-000000000006'); -- removed recruiter
insert into app.account_roles values
 ('00000000-0000-0000-0000-000000000001','candidate'),('00000000-0000-0000-0000-000000000002','candidate'),
 ('00000000-0000-0000-0000-000000000003','employer'),('00000000-0000-0000-0000-000000000004','employer'),
 ('00000000-0000-0000-0000-000000000005','employer'),('00000000-0000-0000-0000-000000000006','employer');
insert into app.employers(id,public_name,verified_at) values
 ('10000000-0000-0000-0000-000000000001','Fictional Campus Cafe',now()),
 ('10000000-0000-0000-0000-000000000002','Fictional Bookshop',now()),
 ('10000000-0000-0000-0000-000000000003','Fictional Unverified Shop',null);
insert into app.employer_members values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','owner',null),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','owner',null),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000005','owner',null),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','recruiter',now());
insert into private.candidate_identity values
 ('00000000-0000-0000-0000-000000000001',1,'Alex Example','alex@example.invalid',null),
 ('00000000-0000-0000-0000-000000000002',1,'Robin Example','robin@example.invalid',null);
insert into private.candidate_eligibility values
 ('00000000-0000-0000-0000-000000000001',18,true,'synthetic-v1',now()+interval '1 year'),
 ('00000000-0000-0000-0000-000000000002',14,true,'synthetic-v1',now()+interval '1 year');
insert into app.candidate_profiles(candidate_id,discoverable) values
 ('00000000-0000-0000-0000-000000000001',true),('00000000-0000-0000-0000-000000000002',true);
insert into app.candidate_profile_versions values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Customer service and careful organization','Bachelor','Math','Studying',array['Organized a stock room'],array['Customer service'],now(),now()),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Ready for a first job','Secondary','General','Studying',array[]::text[],array['Organization'],now(),now());
update app.candidate_profiles set published_version_id=case when candidate_id='00000000-0000-0000-0000-000000000001' then '20000000-0000-0000-0000-000000000001'::uuid else '20000000-0000-0000-0000-000000000002'::uuid end;
insert into app.jobs(id,employer_id,state) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','open'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','open'),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','open');
insert into app.job_versions(id,job_id,title,pay_min_minor,pay_max_minor,currency,pay_period,is_vacancy,uses_ai_screening,minimum_age,questions) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Cafe assistant',1900,2200,'CAD','hour',true,false,15,array['q1','q2','q3']),
 ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','Store assistant',1900,2200,'CAD','hour',true,false,14,array['q1','q2','q3']),
 ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','Unverified role',1900,2200,'CAD','hour',true,false,14,array['q1','q2','q3']);
update app.jobs set current_version_id=('40000000'||substring(id::text from 9))::uuid;
insert into private.resume_versions(id,candidate_id,kind,storage_key,checksum,approved_at,scan_clean_at) values
 ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','reveal_pdf','synthetic/alex.pdf','fixture-only-no-file',now(),now()),
 ('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','reveal_pdf','synthetic/robin.pdf','fixture-only-no-file',now(),now());
