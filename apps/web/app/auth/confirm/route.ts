import { NextResponse } from 'next/server';
import { AccountRoleSchema } from '@swipe/contracts';
import { applicationOrigin, authenticatedRpc, workflows } from '@swipe/server';
import { clearSessionCookies, serverAuth } from '../../../src/server/session';

export async function GET(request: Request) {
  const origin = applicationOrigin(request.url);
  try {
    const params = new URL(request.url).searchParams;
    const code = params.get('code');
    const recovery = params.get('next') === '/reset-password';
    const flowId = params.get('sb_flow_id');
    if (flowId && !/^[A-Za-z0-9_-]{1,128}$/.test(flowId))
      throw new Error('Invalid confirmation flow');
    if (!code || code.length > 4096) throw new Error('Missing confirmation code');
    const supabase = await serverAuth(request);
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (error || !data.session || !data.user) throw new Error('Confirmation failed');
    const role = AccountRoleSchema.safeParse(data.user.user_metadata?.requested_role);
    if (role.success && !recovery) {
      const client = await authenticatedRpc(
        new Request(request.url, {
          headers: { authorization: `Bearer ${data.session.access_token}` },
        }),
      );
      await client.call(workflows.bootstrap, { p_role: role.data });
    }
    const response = NextResponse.redirect(
      `${origin}${recovery ? '/reset-password' : '/workspace'}`,
    );
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    await clearSessionCookies();
    const response = NextResponse.redirect(`${origin}/sign-in?error=confirmation`);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
}
