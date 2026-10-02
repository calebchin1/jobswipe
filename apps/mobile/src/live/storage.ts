/** SecureStore values are chunked below platform value-size limits. Only a complete generation is readable. */
export type SecureDriver = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};
export function createChunkedStorage(driver: SecureDriver) {
  const queues = new Map<string, Promise<unknown>>();
  const serialized = <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const operation = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
    queues.set(key, operation);
    return operation.finally(() => {
      if (queues.get(key) === operation) queues.delete(key);
    });
  };
  const prefix = (key: string) =>
    `session.${Array.from(key)
      .map((c) => c.charCodeAt(0).toString(16))
      .join('-')}`;
  type Manifest = { generation: string; count: number };
  async function readManifest(key: string): Promise<Manifest | null> {
    const value = await driver.getItemAsync(key);
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Manifest;
      return typeof parsed.generation === 'string' &&
        /^[a-z0-9-]+$/.test(parsed.generation) &&
        Number.isInteger(parsed.count) &&
        parsed.count > 0 &&
        parsed.count <= 128
        ? parsed
        : null;
    } catch {
      return null;
    }
  }
  async function clearChunks(key: string, manifest: Manifest | null) {
    if (manifest)
      await Promise.all(
        Array.from({ length: manifest.count }, (_, i) =>
          driver.deleteItemAsync(`${key}.${manifest.generation}.${i}`),
        ),
      );
  }
  return {
    getItem: (key: string) =>
      serialized(key, async () => {
        const base = prefix(key);
        const manifest = await readManifest(base);
        if (!manifest) return null;
        const parts = await Promise.all(
          Array.from({ length: manifest.count }, (_, i) =>
            driver.getItemAsync(`${base}.${manifest.generation}.${i}`),
          ),
        );
        if (parts.some((part) => part === null)) return null;
        try {
          return decodeURIComponent(parts.join(''));
        } catch {
          return null;
        }
      }),
    setItem: (key: string, value: string) =>
      serialized(key, async () => {
        const base = prefix(key);
        const previous = await readManifest(base);
        const encoded = encodeURIComponent(value);
        const count = Math.max(1, Math.ceil(encoded.length / 1800));
        if (count > 128) throw new Error('Session exceeds secure storage limit.');
        const manifest = {
          generation: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
          count,
        };
        try {
          for (let i = 0; i < count; i++)
            await driver.setItemAsync(
              `${base}.${manifest.generation}.${i}`,
              encoded.slice(i * 1800, (i + 1) * 1800),
            );
          await driver.setItemAsync(base, JSON.stringify(manifest));
        } catch (error) {
          await clearChunks(base, manifest).catch(() => undefined);
          throw error;
        }
        await clearChunks(base, previous).catch(() => undefined);
      }),
    removeItem: (key: string) =>
      serialized(key, async () => {
        const base = prefix(key);
        const previous = await readManifest(base);
        await driver.deleteItemAsync(base);
        await clearChunks(base, previous);
      }),
  };
}
export function createMemoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: async (key: string) => {
      items.delete(key);
    },
  };
}
