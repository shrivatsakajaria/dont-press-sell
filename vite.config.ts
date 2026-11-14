/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2020', assetsInlineLimit: 0 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
