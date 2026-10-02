import {
  apiBoundary,
  ApiFailure,
  applicationOrigin,
  assertSameOrigin,
  readJson,
} from '@swipe/server';
import { PasswordResetRequestSchema } from '../../../../../src/lib/password-contracts';
import { serverAuth } from '../../../../../src/server/session';

export async function POST(request: Request) {
  return apiBoundary(async () => {
    assertSameOrigin(request);
    const input = PasswordResetRequestSchema.parse(await readJson(request, 2048));
    const supabase = await serverAuth(request);
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${applicationOrigin(request.url)}/auth/confirm?next=/reset-password`,
    });
    // Never distinguish an unknown account, disabled email, or account-specific limit.
    // Provider transport/outage failures may be reported without exposing account existence.
    if (error && (!error.status || error.status >= 500))
      throw new ApiFailure(
        503,
        'RECOVERY_UNAVAILABLE',
        'Password recovery is temporarily unavailable. Try again shortly.',
      );
    return { status: 'check_email' };
  });
}
