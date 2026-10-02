import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
const boundary = vi.hoisted(() => ({
  clear: vi.fn(),
  server: vi.fn(),
  bootstrap: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('./session', () => ({ serverAuth: boundary.server, clearSessionCookies: boundary.clear }));
vi.mock('@swipe/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@swipe/server')>();
  return { ...original, authenticatedRpc: boundary.rpc };
});
import { POST as requestReset } from '../../app/api/v1/auth/password-reset/route';
import {
  GET as getPasswordSession,
  POST as updatePassword,
} from '../../app/api/v1/auth/password/route';
import { GET as confirm } from '../../app/auth/confirm/route';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  user_metadata: { requested_role: 'employer' },
};
function post(path: string, body: unknown, origin = 'http://localhost:3000') {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  boundary.server.mockResolvedValue({ auth });
  boundary.clear.mockResolvedValue(undefined);
  boundary.rpc.mockResolvedValue({ call: boundary.bootstrap });
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  auth.getUser.mockResolvedValue({ data: { user }, error: null });
  auth.updateUser.mockResolvedValue({ data: { user }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.exchangeCodeForSession.mockResolvedValue({
    data: { session: { access_token: 'fake-access-token' }, user },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('password recovery request', () => {
  it('sends only a safe local confirmation redirect and returns a nonidentifying response', async () => {
    const response = await requestReset(
      post('/api/v1/auth/password-reset', { email: 'fictional@example.test' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'check_email' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('fictional@example.test', {
      redirectTo: 'http://localhost:3000/auth/confirm?next=/reset-password',
    });
  });
  it('does not expose unknown-account or account-specific rate-limit errors', async () => {
    for (const status of [400, 404, 429]) {
      auth.resetPasswordForEmail.mockResolvedValueOnce({
        data: null,
        error: { status, message: 'Provider account detail must not escape' },
      });
      const response = await requestReset(
        post('/api/v1/auth/password-reset', { email: 'unknown@example.test' }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'check_email' });
    }
  });
  it('rejects cross-origin, extra-field, and oversized requests before calling Auth', async () => {
    const cross = await requestReset(
      post(
        '/api/v1/auth/password-reset',
        { email: 'fictional@example.test' },
        'https://unrelated.example',
      ),
    );
    expect(cross.status).toBe(403);
    const extra = await requestReset(
      post('/api/v1/auth/password-reset', {
        email: 'fictional@example.test',
        redirectTo: 'https://unrelated.example',
      }),
    );
    expect(extra.status).toBe(422);
    const huge = await requestReset(
      post('/api/v1/auth/password-reset', { email: 'x'.repeat(2100) }),
    );
    expect(huge.status).toBe(413);
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it('reports provider unavailability without provider account details', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { status: 503, message: 'sensitive provider detail' },
    });
    const response = await requestReset(
      post('/api/v1/auth/password-reset', { email: 'fictional@example.test' }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sensitive provider detail');
  });
});

describe('password update', () => {
  it('verifies the session and returns no account information in the readiness response', async () => {
    const response = await getPasswordSession(
      new Request('http://localhost:3000/api/v1/auth/password'),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
    expect(auth.getUser).toHaveBeenCalledOnce();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('blocks password mutation without a verified signed-in user', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    const response = await updatePassword(
      post('/api/v1/auth/password', { password: 'new-fictional-password' }),
    );
    expect(response.status).toBe(401);
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(boundary.clear).toHaveBeenCalledOnce();
  });
  it('preserves the recovery session during an Auth transport outage', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 0 } });
    const response = await getPasswordSession(
      new Request('http://localhost:3000/api/v1/auth/password'),
    );
    expect(response.status).toBe(503);
    expect(boundary.clear).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('verifies before updating and clears the browser recovery session after success', async () => {
    const response = await updatePassword(
      post('/api/v1/auth/password', { password: 'new-fictional-password' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'password_updated' });
    expect(auth.getUser.mock.invocationCallOrder[0]).toBeLessThan(
      auth.updateUser.mock.invocationCallOrder[0],
    );
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-fictional-password' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(boundary.clear).toHaveBeenCalledOnce();
  });
  it('does not repeat a successful password change when signout fails', async () => {
    auth.signOut.mockRejectedValue(new Error('Provider unavailable'));
    const response = await updatePassword(
      post('/api/v1/auth/password', { password: 'new-fictional-password' }),
    );
    expect(response.status).toBe(200);
    expect(boundary.clear).toHaveBeenCalledOnce();
  });
  it('rejects weak passwords and caller-supplied identities', async () => {
    expect(
      (await updatePassword(post('/api/v1/auth/password', { password: 'short' }))).status,
    ).toBe(422);
    expect(
      (
        await updatePassword(
          post('/api/v1/auth/password', { password: 'new-fictional-password', accountId: user.id }),
        )
      ).status,
    ).toBe(422);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe('PKCE confirmation redirect', () => {
  it('accepts only the explicit reset-password destination and forwards a bounded flow id', async () => {
    const response = await confirm(
      new Request(
        'http://localhost:3000/auth/confirm?code=single-use-code&next=/reset-password&sb_flow_id=flow-123',
      ),
    );
    expect(response.headers.get('location')).toBe('http://localhost:3000/reset-password');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('single-use-code', {
      flowId: 'flow-123',
    });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it('does not accept external or protocol-relative return URLs', async () => {
    for (const next of [
      'https://unrelated.example',
      '//unrelated.example',
      '/reset-password/extra',
    ]) {
      const response = await confirm(
        new Request(
          `http://localhost:3000/auth/confirm?code=single-use-code&next=${encodeURIComponent(next)}`,
        ),
      );
      expect(response.headers.get('location')).toBe('http://localhost:3000/workspace');
    }
    expect(boundary.bootstrap).toHaveBeenCalledTimes(3);
  });
  it('clears failed recovery and exposes only a fixed confirmation-failure message', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'code expired' },
    });
    const response = await confirm(
      new Request('http://localhost:3000/auth/confirm?code=expired&next=/reset-password'),
    );
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/sign-in?error=confirmation',
    );
    expect(boundary.clear).toHaveBeenCalledOnce();
  });
});
