/** Browser-only transport. Session credentials stay in HttpOnly same-origin cookies. */
export class LiveApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'LiveApiError';
  }
}

export async function liveApi<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    signal?: AbortSignal;
    parse: (value: unknown) => T;
  },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers:
        options.body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new LiveApiError(
      0,
      'NETWORK_UNAVAILABLE',
      'We couldn’t reach the workspace. Check your connection and try again.',
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'error' in payload
        ? (
            payload as {
              error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]> };
            }
          ).error
        : undefined;
    throw new LiveApiError(
      response.status,
      detail?.code ?? 'REQUEST_FAILED',
      detail?.message ?? 'This request could not be completed. Please try again.',
      detail?.fieldErrors,
    );
  }
  try {
    return options.parse(payload);
  } catch {
    throw new LiveApiError(
      502,
      'INVALID_RESPONSE',
      'The workspace returned an unexpected response. Refresh and try again.',
    );
  }
}
