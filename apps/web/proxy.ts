import { NextRequest, NextResponse } from 'next/server';

/** Browser previews of the candidate app use Bearer tokens; cookies stay same-origin. */
export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowed = (process.env.ALLOWED_CLIENT_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const ownOrigin = process.env.APP_ORIGIN
    ? new URL(process.env.APP_ORIGIN).origin
    : request.nextUrl.origin;
  const crossClient = !!origin && origin !== ownOrigin;
  if (!crossClient) return NextResponse.next();
  const authRoute = request.nextUrl.pathname.startsWith('/api/v1/auth/');
  const permitted = allowed.includes(origin) && !authRoute;
  if (!permitted)
    return NextResponse.json(
      { error: { code: 'ORIGIN_DENIED', message: 'This client is not allowed.' } },
      { status: 403 },
    );
  const preflight = request.method === 'OPTIONS';
  if (!preflight && !request.headers.has('authorization')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } },
      { status: 401 },
    );
  }
  const response = preflight ? new NextResponse(null, { status: 204 }) : NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.headers.set('Vary', 'Origin');
  response.headers.set('Cache-Control', 'private, no-store');
  // Deliberately no Access-Control-Allow-Credentials: native/browser clients supply a JWT.
  return response;
}

export const config = { matcher: '/api/v1/:path*' };
