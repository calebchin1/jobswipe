#!/usr/bin/env bash
set -euo pipefail
# Every database and role is unique to this run. No pre-existing role is altered.
export PGHOST="${PGHOST:-/tmp}"
export PGPORT="${PGPORT:-5432}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
suffix="$(date +%s)_$$_${RANDOM}"
database="swipe_hire_test_${suffix}"
auth_role="swipe_auth_${suffix}"
anon_role="swipe_anon_${suffix}"
review_role="swipe_review_${suffix}"
operator_role="swipe_operator_${suffix}"
tmp="$(mktemp -d)"
cleanup() {
  dropdb --force --if-exists "$database" >/dev/null 2>&1 || true
  psql -X -d postgres -qc "drop role if exists $auth_role; drop role if exists $anon_role; drop role if exists $operator_role; drop role if exists $review_role;" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 -d postgres -qc "create role $auth_role nologin nosuperuser nocreatedb nocreaterole noinherit; create role $anon_role nologin nosuperuser nocreatedb nocreaterole noinherit; create role $review_role nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls; create role $operator_role nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls; grant $review_role to $operator_role;"
createdb "$database"
export PGDATABASE="$database"
psql -X -v ON_ERROR_STOP=1 -q <<SQL
create schema auth;
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid \$\$;
grant usage on schema auth to $auth_role, $anon_role;
SQL
python3 - "$root" "$tmp" "$auth_role" "$anon_role" "$review_role" "$operator_role" <<'PY'
from pathlib import Path
import re, sys
root, target, authenticated, anon, reviewer, operator = sys.argv[1:]
for path in [*sorted(Path(root, 'supabase/migrations').glob('*.sql')), *[Path(root, 'supabase/tests', name + '.sql') for name in ['security','onboarding','scheduling','review','audio','swipe','eligibility','card_education']]]:
    sql = path.read_text()
    sql = re.sub(r'\bauthenticated\b', authenticated, sql)
    sql = re.sub(r'\banon\b', anon, sql)
    sql = re.sub(r'\bswipe_reviewer\b', reviewer, sql)
    sql = re.sub(r'\bswipe_test_operator\b', operator, sql)
    Path(target, path.name).write_text(sql)
PY
for migration in "$tmp"/20*.sql; do
  psql -X -v ON_ERROR_STOP=1 -q -f "$migration" >"$tmp/migrate.log" 2>&1 || { cat "$tmp/migrate.log"; exit 1; }
done
psql -X -v ON_ERROR_STOP=1 -q -f "$root/supabase/tests/fixtures.sql" >"$tmp/fixtures.log" 2>&1 || { cat "$tmp/fixtures.log"; exit 1; }
psql -X -v ON_ERROR_STOP=1 -q -f "$tmp/security.sql" >"$tmp/security.log" 2>&1 || { cat "$tmp/security.log"; exit 1; }
printf 'Database authorization and lifecycle assertions passed.\n'
# Real independent connections compete for the same job/candidate pair.
card="$(psql -X -Atq -v ON_ERROR_STOP=1 -c "set role $auth_role; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004'; select card_id from app.list_candidate_cards('30000000-0000-0000-0000-000000000002') where headline='Customer service and careful organization';")"
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/apply-race.log" 2>&1 <<SQL &
begin;
set role $auth_role;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select app.apply_to_job('30000000-0000-0000-0000-000000000002');
select pg_sleep(0.4);
commit;
SQL
apply_pid=$!
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/interest-race.log" 2>&1 <<SQL &
begin;
set role $auth_role;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select app.express_employer_interest('30000000-0000-0000-0000-000000000002','$card');
commit;
SQL
interest_pid=$!
wait "$apply_pid" || { cat "$tmp/apply-race.log"; exit 1; }
wait "$interest_pid" || { cat "$tmp/interest-race.log"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/race-assert.log" 2>&1 <<'SQL'
select test.assert((select count(*)=1 from app.applications where job_id='30000000-0000-0000-0000-000000000002' and matched_at is not null),'concurrent actions one match');
select test.assert((select count(*)=1 from ops.outbox_events o join app.applications a on a.id=o.aggregate_id where a.job_id='30000000-0000-0000-0000-000000000002' and o.event_type='application.matched'),'concurrent match one notification');
SQL
printf 'Concurrent match assertions passed.\n'

# Prepare a second completed interview using trusted fixture writes, then have
# withdrawal hold the aggregate lock while a competing reveal attempts access.
application="$(psql -X -Atq -c "select id from app.applications where job_id='30000000-0000-0000-0000-000000000002' and candidate_id='00000000-0000-0000-0000-000000000001';")"
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/prepare-reveal-race.log" 2>&1 <<SQL
insert into app.interviews(id,application_id,status,starts_at,question_ids,attendance_verified_at,candidate_confirmed_at,employer_confirmed_at)
values('60000000-0000-0000-0000-000000000002','$application','completed',now(),array['q1','q2','q3'],now(),now(),now());
set role $auth_role;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select app.submit_scorecard('60000000-0000-0000-0000-000000000002','[{"questionId":"q1","score":4},{"questionId":"q2","score":4},{"questionId":"q3","score":4}]');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select app.authorize_reveal('$application','50000000-0000-0000-0000-000000000001',array['00000000-0000-0000-0000-000000000004'::uuid],2);
SQL
authorization="$(psql -X -Atq -c "select id from app.reveal_authorizations where application_id='$application';")"
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/withdraw-race.log" 2>&1 <<SQL &
begin;
set role $auth_role;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select app.withdraw_application('$application');
\! touch "$tmp/withdraw-lock-held"
select pg_sleep(0.5);
commit;
SQL
withdraw_pid=$!
for attempt in {1..100}; do
  [[ -f "$tmp/withdraw-lock-held" ]] && break
  sleep 0.02
done
[[ -f "$tmp/withdraw-lock-held" ]] || { cat "$tmp/withdraw-race.log"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/grant-race.log" 2>&1 <<SQL
set role $auth_role;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select test.denied('select app.grant_reveal(''$authorization'')','withdrawal wins concurrent reveal');
SQL
wait "$withdraw_pid" || { cat "$tmp/withdraw-race.log"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/withdraw-assert.log" 2>&1 <<SQL
select test.assert((select count(*)=0 from app.reveals where application_id='$application'),'withdrawal race leaves no grant');
select test.assert((select count(*)=0 from ops.outbox_events o join app.reveals r on r.id=o.aggregate_id where r.application_id='$application'),'withdrawal race leaves no disclosure outbox');
SQL
printf 'Concurrent withdrawal/reveal assertions passed.\n'

psql -X -v ON_ERROR_STOP=1 -q -f "$tmp/onboarding.sql" >"$tmp/onboarding.log" 2>&1 || { cat "$tmp/onboarding.log"; exit 1; }
printf 'Onboarding, job publication and private query assertions passed.\n'

psql -X -v ON_ERROR_STOP=1 -q -f "$tmp/scheduling.sql" >"$tmp/scheduling.log" 2>&1 || { cat "$tmp/scheduling.log"; exit 1; }
printf 'Scheduling authorization, lifecycle and conflict assertions passed.\n'
bash "$root/supabase/tests/scheduling-races.sh" "$auth_role" "$tmp"

psql -X -v ON_ERROR_STOP=1 -q -f "$tmp/review.sql" >"$tmp/review.log" 2>&1 || { cat "$tmp/review.log"; exit 1; }
printf 'Operational review and exact candidate approval assertions passed.\n'

psql -X -v ON_ERROR_STOP=1 -q -f "$tmp/audio.sql" >"$tmp/audio.log" 2>&1 || { cat "$tmp/audio.log"; exit 1; }
printf 'Blind audio entitlement and anonymous participant assertions passed.\n'

psql -X -v ON_ERROR_STOP=1 -q -f "$tmp/swipe.sql" >"$tmp/swipe.log" 2>&1 || { cat "$tmp/swipe.log"; exit 1; }
printf 'Swipe pass/undo authorization and deck filtering assertions passed.\n'

psql -X -v ON_ERROR_STOP=1 -q -f "$tmp/eligibility.sql" >"$tmp/eligibility.log" 2>&1 || { cat "$tmp/eligibility.log"; exit 1; }
printf 'Adult pilot attestation, privacy and application gate assertions passed.\n'

psql -X -v ON_ERROR_STOP=1 -q -f "$tmp/card_education.sql" >"$tmp/card-education.log" 2>&1 || { cat "$tmp/card-education.log"; exit 1; }
printf 'Candidate-approved school and availability assertions passed.\n'
