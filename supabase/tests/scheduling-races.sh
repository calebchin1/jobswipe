#!/usr/bin/env bash
# Invoked only by run.sh inside its isolated database and role lifecycle.
set -euo pipefail
auth_role="$1"
tmp="$2"
psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >"$tmp/scheduling-race-setup.log" 2>&1
create function test.book_attempt(application uuid, slot uuid) returns text language plpgsql as $$
begin
 begin perform app.book_interview(application,slot); return 'booked';
 exception when check_violation or unique_violation then return 'conflict'; end;
end $$;
insert into app.jobs(id,employer_id,state) values
 ('30000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','open'),
 ('30000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000002','open');
insert into app.job_versions(id,job_id,title,pay_min_minor,pay_max_minor,currency,pay_period,is_vacancy,uses_ai_screening,minimum_age,questions) values
 ('40000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000007','Race role seven',1900,2200,'CAD','hour',true,false,14,array['Question one','Question two','Question three']),
 ('40000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000008','Race role eight',1900,2200,'CAD','hour',true,false,14,array['Question one','Question two','Question three']);
update app.jobs set current_version_id=('40000000'||substring(id::text from 9))::uuid where id in ('30000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000008');
SQL
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/scheduling-race-applications.log" 2>&1 <<SQL
set role $auth_role;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select app.apply_to_job('30000000-0000-0000-0000-000000000006');
select app.apply_to_job('30000000-0000-0000-0000-000000000007');
select app.apply_to_job('30000000-0000-0000-0000-000000000008');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select app.apply_to_job('30000000-0000-0000-0000-000000000006');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select app.express_employer_interest('30000000-0000-0000-0000-000000000006',card_id) from app.list_candidate_cards('30000000-0000-0000-0000-000000000006');
select app.express_employer_interest('30000000-0000-0000-0000-000000000007',card_id) from app.list_candidate_cards('30000000-0000-0000-0000-000000000007');
select app.create_interview_slot('30000000-0000-0000-0000-000000000006',date_trunc('day',now()+interval '3 days')+interval '12 hours',date_trunc('day',now()+interval '3 days')+interval '12 hours 30 minutes','America/Toronto');
select app.create_interview_slot('30000000-0000-0000-0000-000000000007',date_trunc('day',now()+interval '4 days')+interval '12 hours',date_trunc('day',now()+interval '4 days')+interval '12 hours 30 minutes','America/Toronto');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select app.express_employer_interest('30000000-0000-0000-0000-000000000008',card_id) from app.list_candidate_cards('30000000-0000-0000-0000-000000000008');
select app.create_interview_slot('30000000-0000-0000-0000-000000000008',date_trunc('day',now()+interval '4 days')+interval '12 hours',date_trunc('day',now()+interval '4 days')+interval '12 hours 30 minutes','America/Toronto');
SQL
lookup_application() {
  psql -X -Atq -c "select id from app.applications where job_id='$1' and candidate_id='$2';"
}
lookup_slot() {
  psql -X -Atq -c "select id from app.interview_slots where job_id='$1' and status='available';"
}
run_booking() {
  psql -X -Atq -v ON_ERROR_STOP=1 <<SQL
begin;
set role $auth_role;
set request.jwt.claim.sub='$1';
select test.book_attempt('$2','$3');
select pg_sleep(0.25);
commit;
SQL
}
check_results() {
  python3 - "$1" "$2" <<'PY'
from pathlib import Path
import sys
outcomes = [line for name in sys.argv[1:] for line in Path(name).read_text().splitlines() if line.strip()]
assert sorted(outcomes) == ['booked', 'conflict'], outcomes
PY
}
candidate_a='00000000-0000-0000-0000-000000000001'
candidate_b='00000000-0000-0000-0000-000000000002'
application_a="$(lookup_application '30000000-0000-0000-0000-000000000006' "$candidate_a")"
application_b="$(lookup_application '30000000-0000-0000-0000-000000000006' "$candidate_b")"
slot="$(lookup_slot '30000000-0000-0000-0000-000000000006')"
run_booking "$candidate_a" "$application_a" "$slot" >"$tmp/same-slot-a.log" 2>&1 & first=$!
run_booking "$candidate_b" "$application_b" "$slot" >"$tmp/same-slot-b.log" 2>&1 & second=$!
wait "$first" || { cat "$tmp/same-slot-a.log"; exit 1; }
wait "$second" || { cat "$tmp/same-slot-b.log"; exit 1; }
check_results "$tmp/same-slot-a.log" "$tmp/same-slot-b.log"
psql -X -q -v ON_ERROR_STOP=1 -c "select test.assert((select count(*)=1 from app.interviews where slot_id='$slot' and status='scheduled'),'one slot race winner');" >"$tmp/same-slot-assert.log" 2>&1
application_seven="$(lookup_application '30000000-0000-0000-0000-000000000007' "$candidate_a")"
application_eight="$(lookup_application '30000000-0000-0000-0000-000000000008' "$candidate_a")"
slot_seven="$(lookup_slot '30000000-0000-0000-0000-000000000007')"
slot_eight="$(lookup_slot '30000000-0000-0000-0000-000000000008')"
run_booking "$candidate_a" "$application_seven" "$slot_seven" >"$tmp/candidate-race-a.log" 2>&1 & first=$!
run_booking "$candidate_a" "$application_eight" "$slot_eight" >"$tmp/candidate-race-b.log" 2>&1 & second=$!
wait "$first" || { cat "$tmp/candidate-race-a.log"; exit 1; }
wait "$second" || { cat "$tmp/candidate-race-b.log"; exit 1; }
check_results "$tmp/candidate-race-a.log" "$tmp/candidate-race-b.log"
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/candidate-race-assert.log" 2>&1 <<SQL
select test.assert((select count(*)=1 from app.interviews where slot_id in ('$slot_seven','$slot_eight') and status='scheduled'),'one candidate calendar race winner');
select test.assert((select count(*)=1 from ops.outbox_events o join app.interviews i on i.id=o.aggregate_id where i.slot_id in ('$slot_seven','$slot_eight') and o.event_type='interview.booked'),'one race booking intent');
SQL
printf 'Concurrent slot contention and cross-job candidate calendar assertions passed.\n'
