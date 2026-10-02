import { apiBoundary, ApiFailure, assertSameOrigin } from '@swipe/server';
import { clearSessionCookies, serverAuth } from '../../../../../src/server/session';

export async function POST(request: Request) {
  return apiBoundary(async () => {
    assertSameOrigin(request);
    try {
      const supabase = await serverAuth(request);
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error)
        throw new ApiFailure(
          503,
          'SIGN_OUT_INCOMPLETE',
          'Local session cleared. Remote session revocation could not be confirmed.',
        );
    } finally {
      await clearSessionCookies();
    }
    return { status: 'signed_out' };
  });
}
