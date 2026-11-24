import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./apps/web', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: [
      'packages/**/tests/**/*.test.ts',
      'api/**/tests/**/*.test.ts',
      'supabase/tests/**/*.test.ts',
      'scripts/tests/**/*.test.ts',
      'apps/web/tests/**/*.test.ts',
    ],
    globals: false,
  },
});
