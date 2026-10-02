import { SignInSchema } from '@swipe/contracts';
import { apiBoundary, ApiFailure, assertSameOrigin, readJson } from '@swipe/server';
import { serverAuth } from '../../../../../src/server/session';

export async function POST(request: Request) {
  return apiBoundary(async () => {
    assertSameOrigin(request);
    const input = SignInSchema.parse(await readJson(request));
    const supabase = await serverAuth(request);
    const { data, error } = await supabase.auth.signInWithPassword(input);
    if (error || !data.session)
      throw new ApiFailure(
        error?.status === 429 ? 429 : 401,
        'SIGN_IN_FAILED',
        'Unable to sign in. Check your email and password, or confirm your email first.',
      );
    return { status: 'signed_in' };
  });
}
