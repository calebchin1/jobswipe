import { describe, expect, it } from 'vitest';
import { createChunkedStorage, createMemoryStorage, type SecureDriver } from './storage';
function driver() {
  const values = new Map<string, string>();
  return {
    values,
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      if (value.length > 2000) throw new Error('value too long');
      values.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      values.delete(key);
    },
  };
}
describe('native session storage', () => {
  it('round-trips large Unicode sessions without oversized secure-store values', async () => {
    const native = driver();
    const store = createChunkedStorage(native);
    const token = JSON.stringify({ access_token: 'x'.repeat(8000), label: '🪴你好'.repeat(500) });
    await store.setItem('sb-project-auth-token', token);
    expect(await store.getItem('sb-project-auth-token')).toBe(token);
    expect([...native.values.values()].every((value) => value.length <= 1800)).toBe(true);
  });
  it('removes previous generations and all session material on sign-out', async () => {
    const native = driver();
    const store = createChunkedStorage(native);
    await store.setItem('token', 'a'.repeat(9000));
    await store.setItem('token', 'replacement');
    expect(native.values.size).toBe(2);
    await store.removeItem('token');
    expect(await store.getItem('token')).toBeNull();
    expect(native.values.size).toBe(0);
  });
  it('never exposes partial writes and preserves the prior complete token', async () => {
    const native = driver();
    let fail = false;
    const unstable: SecureDriver = {
      ...native,
      setItemAsync: async (key, value) => {
        if (fail && key.endsWith('.1')) throw new Error('device locked');
        await native.setItemAsync(key, value);
      },
    };
    const store = createChunkedStorage(unstable);
    await store.setItem('token', 'old');
    fail = true;
    await expect(store.setItem('token', 'new'.repeat(2000))).rejects.toThrow('device locked');
    expect(await store.getItem('token')).toBe('old');
    expect(native.values.size).toBe(2);
  });
  it('serializes refresh and logout so a pending write cannot resurrect the session', async () => {
    const native = driver();
    const store = createChunkedStorage(native);
    await Promise.all([store.setItem('token', 'a'.repeat(8000)), store.removeItem('token')]);
    expect(await store.getItem('token')).toBeNull();
  });
  it('rejects missing chunks instead of returning a corrupted token', async () => {
    const native = driver();
    const store = createChunkedStorage(native);
    await store.setItem('token', 'x'.repeat(4000));
    const chunk = [...native.values.keys()].find((key) => key.endsWith('.1'))!;
    native.values.delete(chunk);
    expect(await store.getItem('token')).toBeNull();
  });
});
it('web sessions do not cross memory storage instances', async () => {
  const first = createMemoryStorage();
  await first.setItem('token', 'private');
  expect(await first.getItem('token')).toBe('private');
  expect(await createMemoryStorage().getItem('token')).toBeNull();
  await first.removeItem('token');
  expect(await first.getItem('token')).toBeNull();
});
