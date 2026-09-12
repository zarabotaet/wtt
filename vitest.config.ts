import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()] as any,
  // Next.js resolves the tsconfig `@/*` path alias on its own at build
  // time, but Vitest does not read tsconfig paths automatically — without
  // this, every test file that pulls in a component or hook using `@/lib/...`
  // / `@/components/...` imports (from Task 9 onward) fails to resolve them.
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['components/**', 'jsdom'], ['lib/hooks/**', 'jsdom']],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
