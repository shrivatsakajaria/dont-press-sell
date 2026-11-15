import { expect, test } from 'vitest';
import { siteUrl, withSiteUrl } from '../../scripts/lib/site-url';

test('SITE_URL wins, then Cloudflare Pages CF_PAGES_URL, else empty; no trailing slash (I7)', () => {
  expect(siteUrl({ SITE_URL: 'https://dontpresssell.com/', CF_PAGES_URL: 'https://x.pages.dev' })).toBe('https://dontpresssell.com');
  expect(siteUrl({ CF_PAGES_URL: 'https://abc.dont-press-sell.pages.dev' })).toBe('https://abc.dont-press-sell.pages.dev');
  expect(siteUrl({})).toBe('');
});

test('a Cloudflare Workers build (WORKERS_CI) uses dontpresssell.com unless SITE_URL is set', () => {
  expect(siteUrl({ WORKERS_CI: '1' })).toBe('https://dontpresssell.com');
  expect(siteUrl({ WORKERS_CI: '1', SITE_URL: 'https://dontpresssell.com' })).toBe('https://dontpresssell.com');
});

test('index.html placeholders become absolute image and page URLs', () => {
  const html = '<meta property="og:image" content="%SITE_URL%/og.png"><meta property="og:url" content="%SITE_URL%/">';
  expect(withSiteUrl(html, 'https://a.pages.dev')).toBe(
    '<meta property="og:image" content="https://a.pages.dev/og.png"><meta property="og:url" content="https://a.pages.dev/">',
  );
  expect(withSiteUrl(html, '')).not.toContain('%SITE_URL%');
});
