import { expect, test } from '@playwright/test';
import { pressStart } from './start';

test('a run that does not load says so on the paper and a tap tries again (I6)', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  let fail = true;
  await page.route(/c2007\.prices-.*\.js$/, (route) => (fail ? route.abort() : route.continue()));
  await page.goto('/?run=c2007');
  const retry = page.getByRole('button', { name: 'This run did not load. Tap to try again.' });
  await expect(retry).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/error|failed|undefined/i);
  fail = false;
  await retry.click();
  await pressStart(page);
  await expect(page.locator('.folio')).toContainText('Day');
  expect(pageErrors).toEqual([]);
});

test('a challenge whose run will not load keeps the same challenge across the reload', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  // s2018 (index 9), sold on day 10 and back on day 30: the trades make $11,804.
  const code = Buffer.from([1, 9, 0, 0, 44, 77, 2, 0, 10, 0, 30]).toString('base64url');
  let fail = true;
  await page.route(/s2018\.prices-.*\.js$/, (route) => (fail ? route.abort() : route.continue()));
  await page.goto(`/#c=${code}`);
  const retry = page.getByRole('button', { name: 'This run did not load. Tap to try again.' });
  await expect(retry).toBeVisible();
  await retry.click();
  fail = false;
  await expect(page.locator('body')).toContainText('Score to beat: $11,804');
  expect(await page.evaluate(() => sessionStorage.getItem('dps:resume'))).toBeNull();
  expect(pageErrors).toEqual([]);
});
