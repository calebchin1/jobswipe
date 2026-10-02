'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { liveApi, LiveApiError } from '../lib/live-api';
import { PasswordResetRequestSchema, PasswordUpdateSchema } from '../lib/password-contracts';

const statusParser = (expected: string) => (value: unknown) => {
  if (!value || typeof value !== 'object' || !('status' in value) || value.status !== expected)
    throw new Error('Unexpected recovery response');
  return expected;
};

export function PasswordRecoveryForm({ mode }: { mode: 'request' | 'update' }) {
  const updating = mode === 'update';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [sessionState, setSessionState] = useState<
    'checking' | 'ready' | 'expired' | 'unavailable'
  >(updating ? 'checking' : 'ready');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!updating) return;
    const controller = new AbortController();
    setSessionState('checking');
    setError('');
    liveApi('/auth/password', { signal: controller.signal, parse: statusParser('ready') })
      .then(() => {
        if (!controller.signal.aborted) setSessionState('ready');
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setSessionState(
          failure instanceof LiveApiError && failure.status === 401 ? 'expired' : 'unavailable',
        );
        setError(
          failure instanceof Error ? failure.message : 'Your reset session could not be verified.',
        );
      });
    return () => controller.abort();
  }, [updating, retry]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || sessionState !== 'ready') return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    if (updating && password !== data.get('confirmPassword')) {
      setError('Your passwords don’t match. Enter the same new password twice.');
      return;
    }
    const input = updating
      ? PasswordUpdateSchema.safeParse({ password })
      : PasswordResetRequestSchema.safeParse({ email: String(data.get('email') ?? '').trim() });
    if (!input.success) {
      setError(input.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await liveApi(updating ? '/auth/password' : '/auth/password-reset', {
        method: 'POST',
        body: input.data,
        parse: statusParser(updating ? 'password_updated' : 'check_email'),
      });
      form.reset();
      setDone(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'The request could not be completed. Try again.',
      );
      if (updating && failure instanceof LiveApiError && failure.status === 401)
        setSessionState('expired');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="live-auth-shell">
      <Link className="brand live-auth-brand" href="/" aria-label="First demo home">
        <span className="brand-mark">
          f<span>↗</span>
        </span>
        first<span className="brand-period">.</span>
      </Link>
      <div className="live-auth-grid">
        <section className="live-auth-story">
          <span className="eyebrow">YOUR NEXT CONVERSATION IS AHEAD</span>
          <h1>
            Let’s get you
            <br />
            back to it.
          </h1>
          <p>Recover access to your account so you can pick up where you left off.</p>
          <Link href="/sign-in">
            Back to sign in <span aria-hidden="true">↗</span>
          </Link>
        </section>
        <section className="live-auth-card">
          {done ? (
            <div role="status">
              <span className="live-symbol" aria-hidden="true">
                {updating ? '✓' : '✉'}
              </span>
              <h2>{updating ? 'Your password is updated.' : 'Check your inbox.'}</h2>
              <p>
                {updating
                  ? 'Your recovery session has been cleared. Sign in with your new password to continue.'
                  : 'If this email is eligible for password recovery, you’ll receive a link to choose a new password. Check your spam folder too.'}
              </p>
              {!updating && (
                <p className="subtle">
                  Open the link in this same browser. Recovery links expire and can only be used
                  once.
                </p>
              )}
              <Link className="button primary" href="/sign-in">
                Back to sign in
              </Link>
            </div>
          ) : sessionState === 'checking' ? (
            <div role="status" aria-busy="true">
              <h2>Checking your reset link.</h2>
              <p>Verifying your session before you choose a new password…</p>
            </div>
          ) : sessionState === 'expired' || sessionState === 'unavailable' ? (
            <>
              <h2>
                {sessionState === 'expired'
                  ? 'Let’s get you a fresh link.'
                  : 'Recovery is unavailable right now.'}
              </h2>
              <p className="live-error" role="alert">
                {error}
              </p>
              {sessionState === 'unavailable' && (
                <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>
                  Try again
                </button>
              )}
              <Link className="button primary live-recovery-link" href="/forgot-password">
                Request a new reset link
              </Link>
            </>
          ) : (
            <>
              <span className="eyebrow">ACCOUNT RECOVERY</span>
              <h2>{updating ? 'Choose a new password.' : 'Forgot your password?'}</h2>
              <p>
                {updating
                  ? 'Use a long, unique password you haven’t used for this account before.'
                  : 'Enter your account email and we’ll help you recover access.'}
              </p>
              <form className="live-form" onSubmit={submit} aria-busy={busy}>
                {updating ? (
                  <>
                    <label htmlFor="recovery-password">
                      New password
                      <input
                        id="recovery-password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={12}
                        maxLength={200}
                        disabled={busy}
                        aria-describedby="recovery-password-help"
                      />
                    </label>
                    <small id="recovery-password-help">At least 12 characters.</small>
                    <label htmlFor="recovery-confirm">
                      Confirm new password
                      <input
                        id="recovery-confirm"
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        maxLength={200}
                        disabled={busy}
                      />
                    </label>
                  </>
                ) : (
                  <label htmlFor="recovery-email">
                    Account email
                    <input
                      id="recovery-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      disabled={busy}
                    />
                  </label>
                )}
                {error && (
                  <p className="live-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="button primary live-wide" type="submit" disabled={busy}>
                  {busy ? 'Please wait…' : updating ? 'Update password' : 'Send reset link'}
                  <span aria-hidden="true">→</span>
                </button>
              </form>
            </>
          )}
          <div className="live-auth-footnote live-recovery-footnote">
            {updating
              ? 'Your new password is sent only to the authenticated account service.'
              : 'For your privacy, this page won’t confirm whether an email address has an account.'}
          </div>
        </section>
      </div>
    </main>
  );
}
