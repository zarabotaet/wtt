import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Next.js resolves the tsconfig `@/*` path alias on its own at build
// time, but Vitest does not read tsconfig paths automatically — without
// this, every test file that pulls in a component or hook using `@/lib/...`
// / `@/components/...` imports fails to resolve them.
const shared = {
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
};

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      {
        ...shared,
        test: {
          name: 'node',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          environment: 'node',
          include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
          exclude: ['lib/hooks/**'],
        },
      },
      {
        ...shared,
        test: {
          name: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          environment: 'jsdom',
          include: ['components/**/*.test.tsx', 'lib/hooks/**/*.test.tsx'],
        },
      },
    ],
  },
});
