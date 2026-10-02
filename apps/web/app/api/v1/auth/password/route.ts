import { apiBoundary, ApiFailure, assertSameOrigin, readJson } from '@swipe/server';
import { PasswordUpdateSchema } from '../../../../../src/lib/password-contracts';
import { clearSessionCookies } from '../../../../../src/server/session';
import { verifiedPasswordSession } from '../../../../../src/server/password-recovery';

export async function GET(request: Request) {
  return apiBoundary(async () => {
    await verifiedPasswordSession(request);
    return { status: 'ready' };
  });
}

export async function POST(request: Request) {
  return apiBoundary(async () => {
    assertSameOrigin(request);
    const input = PasswordUpdateSchema.parse(await readJson(request, 2048));
    const supabase = await verifiedPasswordSession(request);
    const { data, error } = await supabase.auth.updateUser({ password: input.password });
    if (error || !data.user)
      throw new ApiFailure(
        error?.status === 429 ? 429 : 422,
        'PASSWORD_UPDATE_FAILED',
        'The password could not be updated. Choose a different password that meets the requirements, or request a fresh reset link.',
      );
    // Password success must not be reported as failure if remote sign-out has a transient error.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* The browser's recovery session is still cleared below. */
    } finally {
      await clearSessionCookies();
    }
    return { status: 'password_updated' };
  });
}
