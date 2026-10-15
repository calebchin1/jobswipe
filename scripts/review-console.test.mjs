import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { startReviewConsole } from './review-console.mjs';
import { runReviewOperation } from './review.mjs';

test('console blocks foreign origins, missing tokens, oversized bodies and diagnostic leaks', async (t) => {
  const calls = [];
  const server = await startReviewConsole({
    port: 0,
    run: async (input) => {
      calls.push(input);
      if (input.action === 'show-profile')
        throw new Error('postgres://secret-password/private-draft');
      return { result: [] };
    },
  });
  t.after(() => server.close());
  const home = await fetch(server.origin);
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const token = (await home.text()).match(/name="review-token" content="([a-f0-9]+)"/)[1];
  const post = (body, headers = {}) =>
    fetch(`${server.origin}/api/review`, {
      method: 'POST',
      headers: {
        Origin: server.origin,
        'Content-Type': 'application/json',
        'X-Review-Token': token,
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  assert.equal(
    (await post({ action: 'pending-employers' }, { Origin: 'https://other.example' })).status,
    403,
  );
  assert.equal((await post({ action: 'pending-employers' }, { 'X-Review-Token': '' })).status, 403);
  const forgedHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(
      server.origin,
      { headers: { Host: 'other.example' } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on('error', reject);
    request.end();
  });
  assert.equal(forgedHostStatus, 403);
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post('a'.repeat(33000))).status, 413);
  assert.equal(calls.length, 0);
  assert.equal((await post({ action: 'pending-employers' })).status, 200);
  const failure = await post({ action: 'show-profile' });
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: 'REVIEW_UNAVAILABLE' });
  assert.equal((await fetch(`${server.origin}/api/review`)).status, 404);
});

test('structured review requires a dedicated reviewer, parameterizes writes and rejects arbitrary operations', async () => {
  const queries = [];
  let permitted = true;
  class Client {
    async connect() {}
    async end() {}
    async query(sql, values) {
      queries.push([sql, values]);
      if (sql.includes('pg_roles'))
        return {
          rows: [
            { rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false },
          ],
        };
      if (sql.includes('pg_has_role')) return { rows: [{ permitted }] };
      return { rows: [{ result: { verificationStatus: 'verified' } }] };
    }
  }
  const environment = { SWIPE_REVIEW_DATABASE_URL: 'postgres://reviewer@localhost/test' };
  const operation = {
    action: 'verify-employer',
    employerId: '11111111-1111-4111-8111-111111111111',
    website: 'https://business.example',
    note: "Evidence includes 'literal SQL'",
  };
  await assert.rejects(
    runReviewOperation({ ...operation, action: 'drop-tables' }, environment, Client),
  );
  await assert.rejects(
    runReviewOperation({ ...operation, operator: 'admin' }, environment, Client),
  );
  assert.equal(queries.length, 0);
  await runReviewOperation(operation, environment, Client);
  assert(queries.some(([sql]) => sql === 'set local role swipe_reviewer'));
  const write = queries.find(([sql]) => sql.startsWith('select review.verify_employer('));
  assert.equal(write[0], 'select review.verify_employer($1::uuid,$2::text,$3::text) as result');
  assert.deepEqual(write[1], [operation.employerId, operation.website, operation.note]);
  permitted = false;
  await assert.rejects(runReviewOperation(operation, environment, Client), {
    safeCode: 'DEDICATED_NONPRIVILEGED_OPERATOR_REQUIRED',
  });
  await assert.rejects(
    runReviewOperation(
      operation,
      { SWIPE_REVIEW_DATABASE_URL: 'postgres://reviewer@remote.example/test' },
      Client,
    ),
    { safeCode: 'REMOTE_DATABASE_REQUIRES_SSLMODE_VERIFY_FULL' },
  );
});
