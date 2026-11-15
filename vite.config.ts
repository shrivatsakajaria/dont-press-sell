/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { siteUrl, withSiteUrl } from './scripts/lib/site-url';

export default defineConfig({
  build: { target: 'es2020', assetsInlineLimit: 0 },
  plugins: [
    {
      // Absolute Open Graph and X image URLs (I7): see README.
      name: 'site-url',
      transformIndexHtml: (html) => withSiteUrl(html, siteUrl(process.env)),
    },
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The game clock reads performance.now(): fake it with the timers so both clocks agree in tests.
    fakeTimers: { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'Date', 'performance'] },
  },
});
