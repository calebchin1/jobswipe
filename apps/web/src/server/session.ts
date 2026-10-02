import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  apiBoundary,
  ApiFailure,
  applicationOrigin,
  assertSameOrigin,
  authenticatedRpc,
  backendConfig,
  type RpcClient,
} from '@swipe/server';

const cookieName = 'swipe-auth';

export async function serverAuth(request: Request) {
  const config = backendConfig();
  const origin = applicationOrigin(request.url);
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: {
      name: cookieName,
      httpOnly: true,
      secure: origin.startsWith('https:'),
      sameSite: 'lax',
      path: '/',
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) {
          store.set(name, value, {
            ...options,
            httpOnly: true,
            secure: origin.startsWith('https:'),
            sameSite: 'lax',
            path: '/',
          });
        }
      },
    },
  });
}

export async function clearSessionCookies() {
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (cookie.name === cookieName || cookie.name.startsWith(`${cookieName}.`))
      store.delete(cookie.name);
  }
}

/** Route handlers only: refresh cookies here, verify JWT with Auth, then forward the same JWT. */
export function withActor(
  request: Request,
  run: (client: RpcClient, input: Request) => Promise<unknown>,
): Promise<Response> {
  return apiBoundary(async () => {
    let input = request;
    if (!request.headers.has('authorization')) {
      const store = await cookies();
      if (
        !store
          .getAll()
          .some((cookie) => cookie.name === cookieName || cookie.name.startsWith(`${cookieName}.`))
      ) {
        throw new ApiFailure(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) assertSameOrigin(request);
      const supabase = await serverAuth(request);
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        await clearSessionCookies();
        throw new ApiFailure(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.');
      }
      const headers = new Headers(request.headers);
      headers.set('authorization', `Bearer ${data.session.access_token}`);
      // Auth verification only needs headers. Do not clone NextRequest across
      // runtime Request implementations or consume the route handler's body.
      input = new Request(request.url, { headers });
    }
    // getSession above is not an authorization decision. Auth /user verifies this token.
    const client = await authenticatedRpc(input);
    return run(client, request);
  });
}
