import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createChunkedStorage, createMemoryStorage } from './storage';
import { createSessionBoundary } from './session-boundary';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const api = process.env.EXPO_PUBLIC_API_URL;
function safeUrl(value: string | undefined) {
  try {
    const parsed = new URL(value ?? '');
    return (
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '10.0.2.2'].includes(parsed.hostname))
    );
  } catch {
    return false;
  }
}
export const configurationError =
  !safeUrl(url) || !key || !safeUrl(api)
    ? 'Live connection is not configured. Set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY and EXPO_PUBLIC_API_URL, then rebuild the app. Use a publishable key only.'
    : null;
export const apiBase = api?.replace(/\/$/, '') ?? '';
let client: SupabaseClient | null = null;
const boundary = createSessionBoundary();
export function authClient() {
  if (configurationError) throw new Error(configurationError);
  if (!client)
    client = createClient(url!, key!, {
      auth: {
        storage: Platform.OS === 'web' ? createMemoryStorage() : createChunkedStorage(SecureStore),
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  return client;
}
type AuthState = {
  session: Session | null;
  sessionKey: string | null;
  ready: boolean;
  error: string | null;
  signOut: () => Promise<void>;
};
const Context = createContext<AuthState | null>(null);
export function LiveAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(configurationError);
  useEffect(() => {
    if (configurationError) {
      setReady(true);
      return;
    }
    let active = true;
    const supabase = authClient();
    let observed = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      observed = true;
      boundary.observe(event, next?.user.id ?? null);
      if (active) {
        setSessionKey(boundary.key());
        setError(null);
        setSession(next);
        setReady(true);
      }
    });
    void supabase.auth
      .getSession()
      .then(({ data, error: failure }) => {
        if (active) {
          if (failure) setError('Could not restore your session. Sign in again.');
          if (!observed) {
            boundary.observe('INITIAL_SESSION', data.session?.user.id ?? null);
            setSession(data.session);
            setSessionKey(boundary.key());
          }
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setError('Could not read secure session storage.');
          setReady(true);
        }
      });
    const refresh = (state: string) => {
      const operation =
        state === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh();
      void operation.catch(() => {
        if (active)
          setError(
            'Session refresh is unavailable. Reopen Account and sign in again if requests fail.',
          );
      });
    };
    refresh(AppState.currentState);
    const listener = AppState.addEventListener('change', refresh);
    return () => {
      active = false;
      subscription.unsubscribe();
      listener.remove();
      void supabase.auth.stopAutoRefresh().catch(() => undefined);
    };
  }, []);
  async function signOut() {
    const { error: failure } = await authClient().auth.signOut({ scope: 'local' });
    if (failure)
      throw new Error(
        'Sign-out could not be confirmed. You remain signed in; check your connection and try again.',
      );
    setSession(null);
    setSessionKey(null);
  }
  return (
    <Context.Provider value={{ session, sessionKey, ready, error, signOut }}>
      {children}
    </Context.Provider>
  );
}
export function useLiveAuth() {
  const auth = useContext(Context);
  if (!auth) throw new Error('LiveAuthProvider missing');
  return auth;
}
export async function liveRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const expectedSession = boundary.version;
  const { data, error } = await authClient().auth.getSession();
  boundary.assert(expectedSession);
  if (error || !data.session) throw new Error('Sign in to continue.');
  let response: Response;
  let result: unknown;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    response = await fetch(`${apiBase}/api/v1${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    result = await response.json();
  } catch {
    throw new Error('Cannot reach the API. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
  boundary.assert(expectedSession);
  if (!response.ok) {
    const detail = result as { error?: { message?: string } } | null;
    throw new Error(
      detail?.error?.message ?? `Request failed (${response.status}). Try refreshing.`,
    );
  }
  return result as T;
}
