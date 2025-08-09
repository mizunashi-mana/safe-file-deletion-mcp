import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'eslint/',
        'dist/',
        'test/',
        '**/*.d.ts',
        '*.ts',
        '*.mjs',
      ],
    },
  },
  plugins: [tsconfigPaths()],
});
