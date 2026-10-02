'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { liveApi } from '../lib/live-api';
import { SignInSchema, SignUpSchema } from '@swipe/contracts';

export function AuthForm({
  mode,
  confirmationFailed = false,
}: {
  mode: 'sign-in' | 'sign-up';
  confirmationFailed?: boolean;
}) {
  const router = useRouter();
  const signingUp = mode === 'sign-up';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    confirmationFailed
      ? 'This confirmation or recovery link is invalid or expired. Sign in if your email is already verified, or request a new password-reset link.'
      : '',
  );
  const [checkEmail, setCheckEmail] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if (signingUp && password !== data.get('confirmPassword')) {
      setError('Your passwords don’t match. Enter the same password twice.');
      return;
    }
    const parsed = signingUp
      ? SignUpSchema.safeParse({ email, password, role: 'employer' })
      : SignInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await liveApi(`/auth/${mode}`, {
        method: 'POST',
        body: parsed.data,
        parse: (value) => {
          if (
            !value ||
            typeof value !== 'object' ||
            !('status' in value) ||
            (value.status !== 'signed_in' && value.status !== 'check_email')
          )
            throw new Error('Invalid auth response');
          return { status: value.status };
        },
      });
      form.reset();
      if (response.status === 'check_email') setCheckEmail(true);
      else {
        router.replace('/workspace');
        router.refresh();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.');
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
          <span className="eyebrow">A BETTER FIRST CONVERSATION</span>
          <h1>
            Meet the potential.
            <br />
            Then meet the person.
          </h1>
          <p>
            A hiring workspace where skills and experience come first. Create clear roles, review
            anonymous profiles, and build your shortlist.
          </p>
          <div className="live-auth-principles">
            <p>
              <span>01</span>Profiles without names or photos
            </p>
            <p>
              <span>02</span>Clear pay and expectations
            </p>
            <p>
              <span>03</span>Candidate-controlled identity sharing
            </p>
          </div>
          <Link href="/">
            Explore the synthetic demo <span aria-hidden="true">↗</span>
          </Link>
        </section>
        <section className="live-auth-card">
          {checkEmail ? (
            <div role="status">
              <span className="live-symbol" aria-hidden="true">
                ✉
              </span>
              <h2>Check your inbox.</h2>
              <p>Follow the confirmation link to verify your email, then return here to sign in.</p>
              <p className="subtle">
                If an eligible account was created, a confirmation email will arrive shortly. Check
                your spam folder too.
              </p>
              <Link href="/sign-in" className="button primary">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <span className="eyebrow">EMPLOYER WORKSPACE</span>
              <h2>{signingUp ? 'Make room for great people.' : 'Welcome back.'}</h2>
              <p>
                {signingUp
                  ? 'Create your account, then tell us about your company.'
                  : 'Sign in to continue with your team.'}
              </p>
              <form onSubmit={submit} className="live-form" aria-busy={busy}>
                <label htmlFor="auth-email">
                  Work email
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                    disabled={busy}
                  />
                </label>
                <label htmlFor="auth-password">
                  Password
                  <input
                    id="auth-password"
                    name="password"
                    type="password"
                    autoComplete={signingUp ? 'new-password' : 'current-password'}
                    minLength={signingUp ? 12 : 1}
                    maxLength={200}
                    required
                    disabled={busy}
                  />
                  {signingUp && <small>Use at least 12 characters.</small>}
                </label>
                {signingUp && (
                  <label htmlFor="auth-confirm">
                    Confirm password
                    <input
                      id="auth-confirm"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      disabled={busy}
                    />
                  </label>
                )}
                {!signingUp && (
                  <Link className="live-forgot-link" href="/forgot-password">
                    Forgot your password?
                  </Link>
                )}
                {error && (
                  <p className="live-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="button primary live-wide" type="submit" disabled={busy}>
                  {busy ? 'Please wait…' : signingUp ? 'Create employer account' : 'Sign in'}
                  <span aria-hidden="true">→</span>
                </button>
              </form>
              <p className="live-auth-switch">
                {signingUp ? 'Already have an account?' : 'New to first?'}{' '}
                <Link href={signingUp ? '/sign-in' : '/sign-up'}>
                  {signingUp ? 'Sign in' : 'Create an employer account'}
                </Link>
              </p>
            </>
          )}
          <div className="live-auth-footnote">
            Secure account access. Your company must be verified before candidate browsing or job
            publishing.
          </div>
        </section>
      </div>
    </main>
  );
}
