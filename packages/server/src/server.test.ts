import { describe, expect, it, vi } from 'vitest';
import {
  apiBoundary,
  authenticatedRpc,
  backendConfig,
  projectRpcResult,
  readJson,
  workflows,
} from './index';

const userId = '11111111-1111-4111-8111-111111111111';
const objectId = '22222222-2222-4222-8222-222222222222';
const config = { url: 'https://test.supabase.co', key: 'sb_publishable_fixture' };
const request = () =>
  new Request('http://localhost/api', { headers: { Authorization: 'Bearer fixture-token' } });

describe('authenticated server boundary', () => {
  it('denies anonymous requests before touching the backend', async () => {
    const fetcher = vi.fn();
    await expect(
      authenticatedRpc(new Request('http://localhost/api'), { config, fetcher }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects missing configuration and privileged credentials', () => {
    expect(() => backendConfig({})).toThrow('not been configured');
    expect(() =>
      backendConfig({ SUPABASE_URL: config.url, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_unsafe' }),
    ).toThrow('publishable');
    const jwt = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
    expect(() =>
      backendConfig({ SUPABASE_URL: config.url, SUPABASE_PUBLISHABLE_KEY: jwt }),
    ).toThrow('publishable');
  });
  it('accepts local development HTTP but rejects insecure remote configuration', () => {
    expect(
      backendConfig({
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_PUBLISHABLE_KEY: config.key,
      }).url,
    ).toBe('http://127.0.0.1:54321');
    expect(() =>
      backendConfig({ SUPABASE_URL: 'http://example.com', SUPABASE_PUBLISHABLE_KEY: config.key }),
    ).toThrow('invalid');
  });
  it('forwards verified caller token to app-schema RPC, never substitutes admin auth', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: userId }))
      .mockResolvedValueOnce(Response.json(objectId));
    const client = await authenticatedRpc(request(), { config, fetcher });
    expect(client.userId).toBe(userId);
    expect(await client.call(workflows.apply, { p_job: objectId })).toBe(objectId);
    expect(fetcher.mock.calls[1]?.[0]).toBe(`${config.url}/rest/v1/rpc/apply_to_job`);
    const options = fetcher.mock.calls[1]?.[1];
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer fixture-token',
      'Content-Profile': 'app',
      apikey: config.key,
    });
    expect(options?.body).toBe(JSON.stringify({ p_job: objectId }));
    expect(options?.cache).toBe('no-store');
  });
  it('rejects invalid sessions and unauthorized RPC names', async () => {
    await expect(
      authenticatedRpc(request(), {
        config,
        fetcher: vi.fn().mockResolvedValue(new Response('', { status: 401 })),
      }),
    ).rejects.toMatchObject({ status: 401 });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: userId }));
    const client = await authenticatedRpc(request(), { config, fetcher });
    await expect(client.call('delete_all_users', {})).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('redacts SQL errors and private provider payloads', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: userId }))
      .mockResolvedValueOnce(
        Response.json(
          { code: '42501', message: 'private.candidate_identity secret@example.com' },
          { status: 403 },
        ),
      );
    const response = await apiBoundary(async () =>
      (await authenticatedRpc(request(), { config, fetcher })).call(workflows.identity, {
        p_reveal: objectId,
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const text = await response.text();
    expect(text).not.toMatch(/candidate_identity|secret@example/);
    expect(JSON.parse(text).error.requestId).toBeTruthy();
  });
  it('treats authentication outage as unavailable, not a revoked session', async () => {
    await expect(
      authenticatedRpc(request(), {
        config,
        fetcher: vi.fn().mockResolvedValue(new Response('', { status: 503 })),
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe('allowlisted response projections', () => {
  it('drops identity fields from candidate-card rows and maps job-scoped refs', () => {
    const result = projectRpcResult(workflows.candidates, [
      {
        card_id: objectId,
        handle: 'Candidate X',
        headline: 'Helpful teammate',
        education_level: 'Diploma',
        field: 'Business',
        study_status: 'Year 1',
        bullets: [],
        skills: [],
        applied: true,
        date_of_birth: '2000-01-01',
        legal_name: 'Should not leave server',
        candidate_id: userId,
      },
    ]);
    expect(result).toEqual([
      {
        cardRef: objectId,
        handle: 'Candidate X',
        headline: 'Helpful teammate',
        education: { level: 'Diploma', field: 'Business', status: 'Year 1' },
        bullets: [],
        skills: [],
        applied: true,
      },
    ]);
  });
  it('reveals only approved identity fields, excluding DOB and postal code', () => {
    const result = projectRpcResult(workflows.identity, [
      {
        legal_name: 'Synthetic Person',
        contact_email: 'test@example.test',
        phone: null,
        document_id: objectId,
        date_of_birth: '2000-01-01',
        postal_code: 'N2L 1A1',
      },
    ]);
    expect(result).toEqual({
      displayName: 'Synthetic Person',
      email: 'test@example.test',
      phone: null,
      documentId: objectId,
    });
  });
  it('rejects malformed output instead of passing it through', () => {
    expect(() => projectRpcResult(workflows.apply, { secret: 'value' })).toThrow('unexpected');
    expect(() => projectRpcResult(workflows.candidates, [{ candidate_id: userId }])).toThrow(
      'unexpected',
    );
    expect(projectRpcResult(workflows.employerInterest, null)).toBeNull();
  });
});

describe('request size and serialization boundary', () => {
  it('rejects non-JSON, malformed and oversized bodies', async () => {
    await expect(
      readJson(new Request('http://localhost', { method: 'POST', body: 'data' })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readJson(
        new Request('http://localhost', {
          method: 'POST',
          body: '{',
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readJson(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ data: 'x'.repeat(100) }),
          headers: { 'Content-Type': 'application/json' },
        }),
        20,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it('returns safe errors for unexpected failures', async () => {
    const response = await apiBoundary(async () => {
      throw new Error('secret key: never print');
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('never print');
  });
});
