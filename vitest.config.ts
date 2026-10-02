import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./apps/web/src/server/test-support/server-only.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/mobile/src/live/**/*.test.ts', 'apps/web/src/server/**/*.test.ts'],
    environment: 'node',
    coverage: { include: ['packages/*/src/**'] },
  },
});
