#!/usr/bin/env node
/**
 * TEST ONLY. Supabase-shaped loopback adapter backed by an isolated PostgreSQL DB.
 * No production auth implementation; never import this from either application.
 */
import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';

export async function startTestBackend({ port = 0, accessTokenLifetimeSeconds = 3600 } = {}) {
  if (
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    !Number.isInteger(accessTokenLifetimeSeconds) ||
    accessTokenLifetimeSeconds < 15 ||
    accessTokenLifetimeSeconds > 3600
  )
    throw new Error('Invalid test gateway options.');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const host = process.env.PGHOST || '/tmp';
  if (!(host.startsWith('/') || ['localhost', '127.0.0.1', '::1'].includes(host))) {
    throw new Error('Test gateway requires a local PostgreSQL connection.');
  }
  const suffix = `${process.pid}_${randomBytes(6).toString('hex')}`;
  const database = `swipe_hire_test_gateway_${suffix}`;
  const authRole = `swipe_gateway_auth_${suffix}`;
  const anonRole = `swipe_gateway_anon_${suffix}`;
  const reviewRole = `swipe_gateway_review_${suffix}`;
  const operatorRole = `swipe_gateway_operator_${suffix}`;
  const apiKey = `sb_publishable_test_${randomBytes(20).toString('hex')}`;
  const signingKey = randomBytes(32);
  const password = 'Synthetic-only-password1!';
  const configuration = {
    host,
    port: Number(process.env.PGPORT || 5432),
    connectionTimeoutMillis: 5000,
  };
  const admin = new pg.Client({ ...configuration, database: 'postgres' });
  let pool;
  let server;
  let cleanupPromise;
  let connectedAdmin = false;
  let createdDatabase = false;
  const createdRoles = [];
  const users = new Map();
  const accessTokens = new Map();
  const refreshTokens = new Map();
  const sqlStateStatus = (code) =>
    ['42501'].includes(code)
      ? 403
      : code?.startsWith('22')
        ? 400
        : code?.startsWith('23')
          ? 409
          : 500;

  // Trusted names/types only. Request values are always PostgreSQL parameters.
  const rpc = {
    get_interview_call_access: [['p_interview', 'uuid']],
    approve_profile_proposal: [['p_proposal', 'uuid']],
    create_interview_slot: [
      ['p_job', 'uuid'],
      ['p_starts_at', 'timestamptz'],
      ['p_ends_at', 'timestamptz'],
      ['p_time_zone', 'text'],
    ],
    list_employer_interview_slots: [['p_job', 'uuid']],
    cancel_interview_slot: [['p_slot', 'uuid']],
    list_application_interview_slots: [['p_application', 'uuid']],
    book_interview: [
      ['p_application', 'uuid'],
      ['p_slot', 'uuid'],
    ],
    list_application_interviews: [['p_application', 'uuid']],
    list_candidate_interviews: [],
    list_job_interviews: [['p_job', 'uuid']],
    cancel_interview: [
      ['p_interview', 'uuid'],
      ['p_reason', 'text', null],
    ],
    ensure_account: [['p_role', 'text']],
    get_account_context: [],
    create_employer: [
      ['p_name', 'text'],
      ['p_website', 'text'],
    ],
    list_employer_jobs: [['p_employer', 'uuid']],
    save_job_draft: [
      ['p_employer', 'uuid'],
      ['p_job', 'uuid'],
      ['p_draft', 'jsonb'],
    ],
    publish_job: [['p_job', 'uuid']],
    list_open_jobs: [
      ['p_limit', 'integer', 20],
      ['p_after', 'uuid', null],
    ],
    list_my_applications: [],
    list_job_applications: [['p_job', 'uuid']],
    get_candidate_profile: [],
    save_candidate_profile: [
      ['p_draft', 'jsonb'],
      ['p_discoverable', 'boolean', null],
    ],
    set_candidate_visibility: [['p_discoverable', 'boolean']],
    list_candidate_cards: [['p_job', 'uuid']],
    apply_to_job: [['p_job', 'uuid']],
    express_employer_interest: [
      ['p_job', 'uuid'],
      ['p_card', 'uuid'],
    ],
    withdraw_application: [['p_application', 'uuid']],
    pass_job: [['p_job', 'uuid']],
    undo_job_pass: [['p_job', 'uuid']],
    pass_candidate_card: [
      ['p_job', 'uuid'],
      ['p_card', 'uuid'],
    ],
    undo_candidate_card_pass: [
      ['p_job', 'uuid'],
      ['p_card', 'uuid'],
    ],
    submit_scorecard: [
      ['p_interview', 'uuid'],
      ['p_scores', 'jsonb'],
    ],
    authorize_reveal: [
      ['p_application', 'uuid'],
      ['p_document', 'uuid'],
      ['p_recipients', 'uuid[]'],
      ['p_identity_revision', 'integer'],
    ],
    grant_reveal: [['p_authorization', 'uuid']],
    read_reveal: [['p_reveal', 'uuid']],
  };
  const rowFunctions = new Set(['list_candidate_cards', 'read_reveal']);
  const voidFunctions = new Set([
    'withdraw_application',
    'pass_job',
    'undo_job_pass',
    'pass_candidate_card',
    'undo_candidate_card_pass',
  ]);

  function addUser(id, email, requestedRole) {
    const salt = randomBytes(16);
    const entry = {
      id,
      email,
      salt,
      passwordHash: scryptSync(password, salt, 32),
      requestedRole,
      createdAt: new Date().toISOString(),
    };
    users.set(email.toLowerCase(), entry);
    return entry;
  }
  function publicUser(entry) {
    return {
      id: entry.id,
      email: entry.email,
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: entry.createdAt,
      confirmed_at: entry.createdAt,
      created_at: entry.createdAt,
      updated_at: entry.createdAt,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { requested_role: entry.requestedRole },
      identities: [],
      is_anonymous: false,
    };
  }
  function issueSession(entry, sessionId = randomUUID()) {
    const iat = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: entry.id,
        aud: 'authenticated',
        role: 'authenticated',
        iat,
        exp: iat + accessTokenLifetimeSeconds,
        session_id: sessionId,
      }),
    ).toString('base64url');
    const signature = createHmac('sha256', signingKey)
      .update(`${header}.${payload}`)
      .digest('base64url');
    const token = `${header}.${payload}.${signature}`;
    const refresh = randomBytes(32).toString('hex');
    const record = { entry, sessionId, expiresAt: iat + accessTokenLifetimeSeconds };
    accessTokens.set(token, record);
    refreshTokens.set(refresh, { entry, sessionId });
    return {
      access_token: token,
      token_type: 'bearer',
      expires_in: accessTokenLifetimeSeconds,
      expires_at: iat + accessTokenLifetimeSeconds,
      refresh_token: refresh,
      user: publicUser(entry),
    };
  }
  function authenticated(request) {
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const record = accessTokens.get(token);
    return record && record.expiresAt > Date.now() / 1000 ? record : null;
  }
  function reply(response, status, body) {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(JSON.stringify(body));
  }
  async function body(request) {
    const chunks = [];
    let count = 0;
    for await (const chunk of request) {
      count += chunk.length;
      if (count > 32768) throw Object.assign(new Error('REQUEST_TOO_LARGE'), { status: 413 });
      chunks.push(chunk);
    }
    let value;
    try {
      value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      throw Object.assign(new Error('INVALID_JSON'), { status: 400 });
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Object.assign(new Error('INVALID_BODY'), { status: 400 });
    return value;
  }
  async function callRpc(name, args, actor) {
    const spec = Object.hasOwn(rpc, name) ? rpc[name] : null;
    if (!spec || Object.keys(args).some((key) => !spec.some(([expected]) => expected === key))) {
      throw Object.assign(new Error('RPC_NOT_ALLOWED'), { code: '42501' });
    }
    const values = spec.map(([key, type, fallback]) => {
      if (!(key in args) && fallback === undefined)
        throw Object.assign(new Error('MISSING_ARGUMENT'), { code: '22023' });
      const value = key in args ? args[key] : fallback;
      return type === 'jsonb' ? JSON.stringify(value) : value;
    });
    const placeholders = spec.map(([, type], index) => `$${index + 1}::${type}`).join(',');
    const query = rowFunctions.has(name)
      ? `select * from app.${name}(${placeholders})`
      : `select app.${name}(${placeholders}) as value`;
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local role "${authRole}"`);
      await client.query("set local statement_timeout = '10s'");
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
      const result = await client.query(query, values);
      await client.query('commit');
      return rowFunctions.has(name)
        ? result.rows
        : voidFunctions.has(name)
          ? null
          : result.rows[0].value;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  // Test orchestration only: never registered as an HTTP handler.
  async function callReview(name, args = {}) {
    const allowed = {
      list_pending_employers: [['p_limit', 'integer', 20]],
      list_pending_profiles: [['p_limit', 'integer', 20]],
      get_candidate_draft: [['p_candidate', 'uuid']],
      verify_employer: [
        ['p_employer', 'uuid'],
        ['p_expected_website', 'text'],
        ['p_evidence_note', 'text'],
      ],
      propose_candidate_profile: [
        ['p_candidate', 'uuid'],
        ['p_expected_revision', 'integer'],
        ['p_content', 'jsonb'],
        ['p_evidence_note', 'text'],
      ],
    };
    const spec = Object.hasOwn(allowed, name) ? allowed[name] : null;
    if (!spec || Object.keys(args).some((key) => !spec.some(([expected]) => expected === key)))
      throw new Error('Unknown test review operation.');
    const values = spec.map(([key, type, fallback]) => {
      if (!(key in args) && fallback === undefined)
        throw new Error('Missing test review argument.');
      const value = key in args ? args[key] : fallback;
      return type === 'jsonb' ? JSON.stringify(value) : value;
    });
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local session authorization "${operatorRole}"`);
      await client.query(`set local role "${reviewRole}"`);
      const result = await client.query(
        `select review.${name}(${spec.map(([, type], i) => `$${i + 1}::${type}`).join(',')}) as value`,
        values,
      );
      await client.query('commit');
      return result.rows[0].value;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  async function handle(request, response) {
    try {
      const requestHost = new URL(`http://${request.headers.host || ''}`).hostname;
      if (!['127.0.0.1', 'localhost'].includes(requestHost))
        return reply(response, 403, { code: 'LOCAL_ONLY' });
      const origin = request.headers.origin;
      if (origin) {
        const parsed = new URL(origin);
        if (
          !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
          !['http:', 'https:'].includes(parsed.protocol)
        )
          return reply(response, 403, { code: 'LOCAL_ONLY' });
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader(
          'Access-Control-Allow-Headers',
          'authorization, apikey, content-type, content-profile, accept-profile, x-client-info, x-supabase-api-version',
        );
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      }
      if (request.method === 'OPTIONS') return reply(response, 200, {});
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/health' && request.method === 'GET')
        return reply(response, 200, { status: 'ok', testOnly: true });
      if (request.headers.apikey !== apiKey)
        return reply(response, 401, {
          code: 'INVALID_TEST_API_KEY',
          message: 'Invalid local test key.',
        });
      if (url.pathname === '/auth/v1/token' && request.method === 'POST') {
        const input = await body(request);
        if (url.searchParams.get('grant_type') === 'password') {
          const entry = users.get(String(input.email || '').toLowerCase());
          if (
            !entry ||
            typeof input.password !== 'string' ||
            input.password.length > 200 ||
            !timingSafeEqual(scryptSync(input.password, entry.salt, 32), entry.passwordHash)
          ) {
            return reply(response, 400, {
              error: 'invalid_grant',
              error_code: 'invalid_credentials',
              message: 'Invalid test credentials.',
            });
          }
          return reply(response, 200, issueSession(entry));
        }
        if (url.searchParams.get('grant_type') === 'refresh_token') {
          const session = refreshTokens.get(input.refresh_token);
          if (!session)
            return reply(response, 400, {
              error: 'invalid_grant',
              error_code: 'refresh_token_not_found',
              message: 'Invalid test session.',
            });
          refreshTokens.delete(input.refresh_token);
          return reply(response, 200, issueSession(session.entry, session.sessionId));
        }
        return reply(response, 400, { error: 'unsupported_grant_type' });
      }
      if (url.pathname === '/auth/v1/signup' && request.method === 'POST') {
        const input = await body(request);
        if (
          typeof input.email !== 'string' ||
          !/^[^\s@]+@[^\s@]+\.invalid$/i.test(input.email) ||
          typeof input.password !== 'string' ||
          input.password.length < 12 ||
          input.password.length > 200 ||
          users.has(input.email.toLowerCase())
        ) {
          return reply(response, 422, {
            error_code: 'validation_failed',
            message: 'Use a new reserved .invalid email and a 12–200 character test password.',
          });
        }
        const entry = addUser(
          randomUUID(),
          input.email.toLowerCase(),
          input.data?.requested_role === 'employer' ? 'employer' : 'candidate',
        );
        entry.passwordHash = scryptSync(input.password, entry.salt, 32);
        return reply(response, 200, issueSession(entry));
      }
      const session = authenticated(request);
      if (!session)
        return reply(response, 401, {
          error_code: 'bad_jwt',
          code: '401',
          message: 'Invalid or expired test session.',
        });
      if (url.pathname === '/auth/v1/user' && request.method === 'GET')
        return reply(response, 200, publicUser(session.entry));
      if (url.pathname === '/auth/v1/logout' && request.method === 'POST') {
        for (const [key, value] of accessTokens)
          if (value.sessionId === session.sessionId) accessTokens.delete(key);
        for (const [key, value] of refreshTokens)
          if (value.sessionId === session.sessionId) refreshTokens.delete(key);
        return reply(response, 200, {});
      }
      const match = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
      if (match && request.method === 'POST') {
        if (request.headers['content-profile'] !== 'app')
          return reply(response, 406, {
            code: 'PGRST106',
            message: 'Only the app RPC schema is available.',
          });
        return reply(response, 200, await callRpc(match[1], await body(request), session.entry.id));
      }
      return reply(response, 404, { code: 'NOT_IMPLEMENTED_TEST_SURFACE' });
    } catch (error) {
      reply(response, error.status || sqlStateStatus(error.code), {
        code: error.code || 'TEST_GATEWAY_ERROR',
        message: error.code ? 'Database operation rejected.' : 'Test request failed.',
      });
    }
  }
  function cleanup() {
    if (!cleanupPromise)
      cleanupPromise = (async () => {
        if (server)
          await new Promise((resolve) => {
            server.close(resolve);
            server.closeAllConnections();
          });
        if (pool) await pool.end();
        if (connectedAdmin) {
          if (createdDatabase)
            await admin.query(`drop database if exists "${database}" with (force)`);
          for (const role of createdRoles.reverse())
            await admin.query(`drop role if exists "${role}"`);
          await admin.end();
        }
      })();
    return cleanupPromise;
  }

  async function selfTest(url) {
    const request = (route, token, data) =>
      fetch(url + route, {
        method: data === undefined ? 'GET' : 'POST',
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/json',
          'Content-Profile': 'app',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    const login = await request('/auth/v1/token?grant_type=password', null, {
      email: 'candidate@example.invalid',
      password,
    });
    if (!login.ok) throw new Error('Self-test login failed.');
    const session = await login.json();
    const context = await request('/rest/v1/rpc/get_account_context', session.access_token, {});
    const value = await context.json();
    if (!context.ok || value.roles[0] !== 'candidate')
      throw new Error('Self-test RPC role failed.');
    const denied = await request('/rest/v1/rpc/list_job_applications', session.access_token, {
      p_job: '30000000-0000-4000-8000-000000000001',
    });
    if (denied.status !== 403) throw new Error('Self-test permission denial failed.');
    const refreshed = await request('/auth/v1/token?grant_type=refresh_token', null, {
      refresh_token: session.refresh_token,
    });
    if (!refreshed.ok) throw new Error('Self-test refresh failed.');
    const next = await refreshed.json();
    const logout = await request('/auth/v1/logout?scope=local', next.access_token, {});
    if (!logout.ok) throw new Error('Self-test logout failed.');
    const rejected = await request('/auth/v1/user', next.access_token);
    if (rejected.status !== 401) throw new Error('Self-test revoked token accepted.');
    console.log('Loopback gateway auth, PostgreSQL permission and revocation self-test passed.');
  }

  try {
    await admin.connect();
    connectedAdmin = true;
    for (const role of [authRole, anonRole, reviewRole, operatorRole]) {
      await admin.query(
        `create role "${role}" nologin nosuperuser nocreatedb nocreaterole noinherit`,
      );
      createdRoles.push(role);
    }
    await admin.query(`grant "${reviewRole}" to "${operatorRole}"`);
    await admin.query(`create database "${database}"`);
    createdDatabase = true;
    pool = new pg.Pool({ ...configuration, database, max: 8 });
    await pool.query(`create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to "${authRole}","${anonRole}";`);
    const migrationDir = path.join(root, 'supabase/migrations');
    for (const name of (await readdir(migrationDir))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const sql = (await readFile(path.join(migrationDir, name), 'utf8'))
        .replace(/\bauthenticated\b/g, authRole)
        .replace(/\banon\b/g, anonRole)
        .replace(/\bswipe_reviewer\b/g, reviewRole);
      await pool.query(sql);
      // Exercise upgrading 001 with existing records; the SQL runner separately
      // exercises applying the complete chain to an empty database.
      if (name === '202609280001_secure_foundation.sql') {
        await pool.query(
          (await readFile(path.join(root, 'supabase/tests/fixtures.sql'), 'utf8')).replaceAll(
            '-0000-0000-0000-',
            '-0000-4000-8000-',
          ),
        );
      }
    }
    const fixtures = [
      ['00000000-0000-4000-8000-000000000001', 'candidate@example.invalid', 'candidate'],
      ['00000000-0000-4000-8000-000000000002', 'candidate-younger@example.invalid', 'candidate'],
      ['00000000-0000-4000-8000-000000000003', 'employer@example.invalid', 'employer'],
      ['00000000-0000-4000-8000-000000000004', 'other-employer@example.invalid', 'employer'],
      ['00000000-0000-4000-8000-000000000005', 'pending-employer@example.invalid', 'employer'],
      ['00000000-0000-4000-8000-000000000006', 'removed-employer@example.invalid', 'employer'],
    ];
    fixtures.forEach((args) => addUser(...args));
    server = createServer(handle);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    return {
      url,
      publishableKey: apiKey,
      database,
      fixtures: fixtures.map(([, email, role]) => ({ email, password, role })),
      environment: { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: apiKey },
      close: cleanup,
      selfTest: () => selfTest(url),
      review: callReview,
    };
  } catch (error) {
    await cleanup().catch(() => {});
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv.includes('--test-only')) {
    console.error(
      'Explicit --test-only is required. This gateway is only for isolated synthetic-data tests.',
    );
    process.exitCode = 1;
  } else {
    let gateway;
    try {
      const index = process.argv.indexOf('--port');
      gateway = await startTestBackend({
        port: index >= 0 ? Number(process.argv[index + 1]) : 54329,
      });
      const { close, selfTest, ...configuration } = gateway;
      console.log(
        JSON.stringify({ event: 'test_backend_ready', testOnly: true, ...configuration }),
      );
      if (process.argv.includes('--self-test')) {
        await selfTest();
        await close();
      } else
        for (const signal of ['SIGINT', 'SIGTERM'])
          process.on(signal, () => {
            close().then(
              () => process.exit(0),
              () => process.exit(1),
            );
          });
    } catch (error) {
      console.error(`Local test backend failed: ${error.message}`);
      if (gateway) await gateway.close().catch(() => {});
      process.exitCode = 1;
    }
  }
}
