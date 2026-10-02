import { SignUpSchema } from '@swipe/contracts';
import {
  apiBoundary,
  ApiFailure,
  applicationOrigin,
  assertSameOrigin,
  authenticatedRpc,
  readJson,
  workflows,
} from '@swipe/server';
import { serverAuth } from '../../../../../src/server/session';

export async function POST(request: Request) {
  return apiBoundary(async () => {
    assertSameOrigin(request);
    const input = SignUpSchema.parse(await readJson(request));
    const supabase = await serverAuth(request);
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { requested_role: input.role },
        emailRedirectTo: `${applicationOrigin(request.url)}/auth/confirm`,
      },
    });
    if (error)
      throw new ApiFailure(
        error.status === 429 ? 429 : 422,
        'SIGN_UP_FAILED',
        'Unable to create this account. Check the details or try again later.',
      );
    if (!data.session) return { status: 'check_email' };
    const authenticated = new Request(request.url, {
      headers: { authorization: `Bearer ${data.session.access_token}` },
    });
    const client = await authenticatedRpc(authenticated);
    await client.call(workflows.bootstrap, { p_role: input.role });
    return { status: 'signed_in' };
  });
}
