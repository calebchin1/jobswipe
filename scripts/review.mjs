#!/usr/bin/env node
/** Scoped operational review CLI. Never imported by the web/mobile applications. */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const usage = `Operational review (no public admin endpoint)

Set SWIPE_REVIEW_DATABASE_URL to an individual, non-superuser operator login.
The login must be explicitly granted membership in the NOLOGIN swipe_reviewer group.

Commands:
  node scripts/review.mjs pending-employers
  node scripts/review.mjs pending-profiles
  node scripts/review.mjs show-profile <candidate-uuid>
  node scripts/review.mjs verify-employer <employer-uuid> --website <reviewed-url> --note-file <path>
  node scripts/review.mjs propose-profile <candidate-uuid> --revision <n> --content-file <json-path> --note-file <path>

The candidate must preview and approve the exact proposal separately.
This tool never approves age/work eligibility, sends email or publishes a candidate profile.
`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(code) {
  throw Object.assign(new Error(code), { safeCode: code });
}
function options(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (
      !['--website', '--note-file', '--revision', '--content-file'].includes(key) ||
      !argv[index + 1] ||
      key in output
    )
      fail('INVALID_ARGUMENTS');
    output[key] = argv[index + 1];
  }
  return output;
}
async function readNote(file) {
  if (!file) fail('NOTE_FILE_REQUIRED');
  const note = (await readFile(file, 'utf8')).trim();
  if (!note || note.length > 1000) fail('NOTE_MUST_BE_1_TO_1000_CHARACTERS');
  return note;
}
export async function runReviewCommand(argv, environment = process.env) {
  if (argv.length === 0 || argv[0] === '--help') return { help: usage };
  const [command, reference, ...rest] = argv;
  let functionName;
  let parameters = [];
  let types = [];
  if (command === 'pending-employers' || command === 'pending-profiles') {
    if (reference !== undefined) fail('INVALID_ARGUMENTS');
    functionName =
      command === 'pending-employers' ? 'list_pending_employers' : 'list_pending_profiles';
  } else {
    if (!uuid.test(reference || '')) fail('VALID_UUID_REQUIRED');
    const flags = options(rest);
    if (command === 'show-profile') {
      if (Object.keys(flags).length) fail('INVALID_ARGUMENTS');
      functionName = 'get_candidate_draft';
      parameters = [reference];
      types = ['uuid'];
    } else if (command === 'verify-employer') {
      if (
        !flags['--website'] ||
        Object.keys(flags).some((flag) => !['--website', '--note-file'].includes(flag))
      )
        fail('INVALID_ARGUMENTS');
      functionName = 'verify_employer';
      parameters = [reference, flags['--website'], await readNote(flags['--note-file'])];
      types = ['uuid', 'text', 'text'];
    } else if (command === 'propose-profile') {
      if (
        !/^[1-9][0-9]{0,8}$/.test(flags['--revision'] || '') ||
        !flags['--content-file'] ||
        Object.keys(flags).some(
          (flag) => !['--revision', '--content-file', '--note-file'].includes(flag),
        )
      )
        fail('INVALID_ARGUMENTS');
      const source = await readFile(flags['--content-file'], 'utf8');
      if (Buffer.byteLength(source) > 16000) fail('PROFILE_FILE_TOO_LARGE');
      let content;
      try {
        content = JSON.parse(source);
      } catch {
        fail('PROFILE_FILE_INVALID_JSON');
      }
      functionName = 'propose_candidate_profile';
      parameters = [
        reference,
        Number(flags['--revision']),
        JSON.stringify(content),
        await readNote(flags['--note-file']),
      ];
      types = ['uuid', 'integer', 'jsonb', 'text'];
    } else fail('UNKNOWN_COMMAND');
  }
  if (!environment.SWIPE_REVIEW_DATABASE_URL) fail('DEDICATED_OPERATOR_DATABASE_URL_REQUIRED');
  let url;
  try {
    url = new URL(environment.SWIPE_REVIEW_DATABASE_URL);
  } catch {
    fail('INVALID_DATABASE_URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) fail('INVALID_DATABASE_URL');
  const local =
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    (!url.hostname && url.searchParams.get('host')?.startsWith('/'));
  if (!local && url.searchParams.get('sslmode') !== 'verify-full')
    fail('REMOTE_DATABASE_REQUIRES_SSLMODE_VERIFY_FULL');
  const client = new pg.Client({
    connectionString: environment.SWIPE_REVIEW_DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const {
      rows: [actor],
    } = await client.query(
      `select r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole from pg_roles r where r.rolname=session_user`,
    );
    if (!actor || actor.rolsuper || actor.rolbypassrls || actor.rolcreatedb || actor.rolcreaterole)
      fail('DEDICATED_NONPRIVILEGED_OPERATOR_REQUIRED');
    const {
      rows: [membership],
    } = await client.query(
      "select pg_has_role(session_user,'swipe_reviewer','member') as permitted",
    );
    if (!membership?.permitted) fail('DEDICATED_NONPRIVILEGED_OPERATOR_REQUIRED');
    await client.query('begin');
    await client.query('set local role swipe_reviewer');
    await client.query("set local statement_timeout='15s'");
    const { rows } = await client.query(
      `select review.${functionName}(${types.map((type, index) => `$${index + 1}::${type}`).join(',')}) as result`,
      parameters,
    );
    await client.query('commit');
    return { result: rows[0].result };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const output = await runReviewCommand(process.argv.slice(2));
    if (output.help) process.stdout.write(output.help);
    else console.log(JSON.stringify(output.result, null, 2));
  } catch (error) {
    // Do not print connection strings, credentials, raw SQL diagnostics or draft text.
    console.error(
      `Review operation failed: ${error.safeCode || (error.code ? `DATABASE_${error.code}` : 'UNAVAILABLE')}`,
    );
    process.exitCode = 1;
  }
}
