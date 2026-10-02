import 'server-only';
import { ApiFailure } from '@swipe/server';
import { clearSessionCookies, serverAuth } from './session';

/** Verify with the Auth service; cookie/session contents alone are not authorization. */
export async function verifiedPasswordSession(request: Request) {
  const supabase = await serverAuth(request);
  const { data, error } = await supabase.auth.getUser();
  if (error && (!error.status || error.status === 429 || error.status >= 500))
    throw new ApiFailure(
      503,
      'AUTH_UNAVAILABLE',
      'Account verification is temporarily unavailable. Try again shortly.',
    );
  if (error || !data.user) {
    await clearSessionCookies();
    throw new ApiFailure(
      401,
      'RECOVERY_SESSION_REQUIRED',
      'Open a fresh password-reset link in the same browser where you requested it.',
    );
  }
  return supabase;
}
