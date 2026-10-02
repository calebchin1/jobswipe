#!/usr/bin/env node
/**
 * Staging-only operator tool for fictional accounts. Never imported by the apps.
 * Hosted Supabase rejects reserved domains and its default mailer will not deliver
 * confirmations, so fictional users are created pre-confirmed via the Admin API.
 * Product roles are then provisioned with the user's own session through app.ensure_account.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const usage = `Staging operator (fictional data only)

Environment: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, POSTGRES_URL_NON_POOLING,
SWIPE_STAGING_PROJECT set to the project ref in SUPABASE_URL, and SUPABASE_CA_FILE pointing at
Supabase's prod-ca-2021.crt (database TLS is verified, never skipped).

Commands:
  node scripts/staging.mjs user <name@example.com> <employer|candidate> --password <password>
  node scripts/staging.mjs eligibility <name@example.com>
  node scripts/staging.mjs reviewer <login-name>

"eligibility" writes a synthetic 18+/work-attested band (policy synthetic-v1). It is not real eligibility.
"reviewer" creates an individual NOLOGIN-group member for scripts/review.mjs and prints its URL once.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}
function env(name) {
  const value = process.env[name];
  if (!value) fail(`Missing ${name}.`);
  return value;
}
function guard() {
  const url = new URL(env('SUPABASE_URL'));
  if (url.hostname.split('.')[0] !== env('SWIPE_STAGING_PROJECT'))
    fail('SWIPE_STAGING_PROJECT does not match SUPABASE_URL. Refusing.');
}
function fictional(email) {
  if (!/^[a-z0-9.+-]+@example\.com$/i.test(email ?? ''))
    fail('Only @example.com addresses are allowed on staging.');
  return email.toLowerCase();
}
async function auth(path, key, body) {
  const response = await fetch(`${env('SUPABASE_URL')}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) fail(`Auth ${path} failed: ${data.msg ?? data.error_description ?? response.status}`);
  return data;
}
async function database(run) {
  const client = new pg.Client({
    connectionString: env('POSTGRES_URL_NON_POOLING').split('?')[0],
    ssl: { ca: readFileSync(env('SUPABASE_CA_FILE'), 'utf8') },
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}
async function userId(client, email) {
  const { rows } = await client.query('select id from auth.users where email=$1', [email]);
  if (!rows[0]) fail(`No user ${email}.`);
  return rows[0].id;
}

async function createUser(email, role, password) {
  if (!['employer', 'candidate'].includes(role)) fail('Role must be employer or candidate.');
  if (!password || password.length < 12) fail('--password must be at least 12 characters.');
  const secret = env('SUPABASE_SECRET_KEY');
  const user = await auth('admin/users', secret, {
    email,
    password,
    email_confirm: true,
    user_metadata: { requested_role: role },
  });
  const session = await auth('token?grant_type=password', env('SUPABASE_PUBLISHABLE_KEY'), {
    email,
    password,
  });
  const response = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/ensure_account`, {
    method: 'POST',
    headers: {
      apikey: env('SUPABASE_PUBLISHABLE_KEY'),
      Authorization: `Bearer ${session.access_token}`,
      'Content-Profile': 'app',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_role: role }),
  });
  if (!response.ok) fail(`ensure_account failed: ${await response.text()}`);
  console.log(`Created ${role} ${email} (${user.id}).`);
}

async function grantEligibility(email) {
  await database(async (client) => {
    const id = await userId(client, email);
    await client.query(
      `insert into private.candidate_eligibility values ($1,18,true,'synthetic-v1',now()+interval '1 year')
       on conflict (candidate_id) do update set minimum_age_band=18, work_attested=true,
       policy_version='synthetic-v1', refresh_due_at=now()+interval '1 year'`,
      [id],
    );
    console.log(`Synthetic eligibility set for ${email}.`);
  });
}

async function createReviewer(login) {
  if (!/^[a-z][a-z0-9_]{2,30}$/.test(login ?? '')) fail('Login must be lowercase snake_case.');
  const password = randomBytes(24).toString('base64url');
  await database(async (client) => {
    await client.query(
      `create role ${login} login password '${password}' nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
    );
    await client.query(`grant swipe_reviewer to ${login}`);
  });
  const base = new URL(env('POSTGRES_URL_NON_POOLING').split('?')[0]);
  base.username = `${login}.${env('SWIPE_STAGING_PROJECT')}`;
  base.password = password;
  base.search = `?sslmode=verify-full&sslrootcert=${encodeURIComponent(env('SUPABASE_CA_FILE'))}`;
  console.log(`SWIPE_REVIEW_DATABASE_URL=${base.toString()}`);
}

const [command, subject, ...rest] = process.argv.slice(2);
if (!command || command === '--help') {
  console.log(usage);
} else {
  guard();
  if (command === 'user') {
    const flag = rest.indexOf('--password');
    await createUser(fictional(subject), rest[0], flag >= 0 ? rest[flag + 1] : undefined);
  } else if (command === 'eligibility') await grantEligibility(fictional(subject));
  else if (command === 'reviewer') await createReviewer(subject);
  else fail(usage);
}
