import { expect, test } from './fixtures';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Task 13 budgets: main JS gzipped, first-load transfer, no third parties, no index name in the build.
const DIST = 'dist';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('main JavaScript is under 60 KB gzipped', () => {
  const main = readdirSync(join(DIST, 'assets')).filter((n) => /^index-.*\.js$/.test(n));
  expect(main.length).toBe(1);
  const gz = gzipSync(readFileSync(join(DIST, 'assets', main[0]!)), { level: 9 }).length;
  console.log(`main JS gzip: ${(gz / 1024).toFixed(2)} KB`);
  expect(gz).toBeLessThan(60 * 1024);
});

test('dist never names the index the game is based on', () => {
  const hits = walk(DIST).filter((p) => /S&P/i.test(readFileSync(p).toString('latin1')));
  expect(hits).toEqual([]);
});

test('first load stays under 300 KB with no third-party requests but the analytics beacon', async ({ page }) => {
  const urls: string[] = [];
  let bytes = 0;
  const pending: Promise<void>[] = [];
  page.on('request', (req) => {
    urls.push(req.url());
  });
  page.on('requestfinished', (req) => {
    pending.push(
      req.sizes().then((s) => {
        bytes += s.responseBodySize + s.responseHeadersSize;
      }),
    );
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('button.act')).toHaveText('Start');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await Promise.all(pending);
  console.log(`first load: ${(bytes / 1024).toFixed(1)} KB over ${urls.length} requests`);
  expect(bytes).toBeLessThan(300 * 1024);

  const origin = new URL(page.url()).origin;
  const foreign = urls.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
  // R66: the one outside script is Umami's, asked for and answered here by the fixture with an empty script (never reached in tests).
  const umami = foreign.filter((u) => new URL(u).hostname === 'cloud.umami.is');
  expect(umami).toEqual(['https://cloud.umami.is/script.js']);
  const bad = foreign.filter((u) => !['static.cloudflareinsights.com', 'cloud.umami.is'].includes(new URL(u).hostname));
  expect(bad).toEqual([]);
  expect(urls.filter((u) => /fonts\.(googleapis|gstatic)\.com|cdn/i.test(u) && !/cloudflareinsights/.test(u))).toEqual([]);
});
