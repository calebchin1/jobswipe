import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./src/server/test-support/server-only.ts', import.meta.url),
      ),
    },
  },
  test: { include: ['apps/web/src/server/**/*.test.ts'], environment: 'node' },
});
