import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['apps/mobile/src/live/**/*.test.ts'], environment: 'node' },
});
