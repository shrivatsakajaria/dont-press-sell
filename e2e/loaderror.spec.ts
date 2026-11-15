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
