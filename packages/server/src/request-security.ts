import { ApiFailure } from './index';

export function applicationOrigin(requestUrl: string, configured = process.env.APP_ORIGIN): string {
  let url: URL;
  try {
    url = new URL(configured || requestUrl);
  } catch {
    throw new ApiFailure(
      503,
      'INVALID_ORIGIN_CONFIGURATION',
      'Application configuration is unavailable.',
    );
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    (!loopback && (!configured || url.protocol !== 'https:')) ||
    !['http:', 'https:'].includes(url.protocol)
  ) {
    throw new ApiFailure(
      503,
      'INVALID_ORIGIN_CONFIGURATION',
      'A secure application origin is required.',
    );
  }
  return url.origin;
}

/** Cookie authentication needs origin protection even when SameSite cookies are set. */
export function assertSameOrigin(request: Request, configured?: string): void {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null' || origin !== applicationOrigin(request.url, configured)) {
    throw new ApiFailure(403, 'ORIGIN_DENIED', 'This request must come from the application.');
  }
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site')
    throw new ApiFailure(403, 'ORIGIN_DENIED', 'This request must come from the application.');
}

export function safeReturnPath(value: string | null, fallback = '/workspace'): string {
  return value === '/workspace' || value === '/account' ? value : fallback;
}
