import { expect, test, type Page } from './fixtures';
import { pressStart } from './start';

const FIRST_SALE = 'You are out. To win, buy back in for less than you sold.';

/** Collects console errors and page errors. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test('with storage blocked a full run completes, the first-sale line shows, and nothing errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('storage is blocked');
      },
    });
  });
  await page.clock.install();
  await page.goto('/?run=s2018');
  await pressStart(page);
  const button = page.locator('button.act');
  await expect(button).toHaveText(/^Sell for \$[\d,]+$/);
  await page.clock.runFor(5000);
  await button.click();
  await expect(page.getByText(FIRST_SALE)).toBeVisible();
  await page.clock.runFor(114_000); // R27: s2018 runs about 118 s
  await expect(page.getByText('Late edition')).toBeVisible();
  await expect(page.getByText(/Your pot/)).toHaveCount(0); // R40: hidden
  // Foot links work without storage too.
  await page.getByRole('button', { name: 'Your collection' }).click();
  await expect(page.getByText('For this visit')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Runs', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Pick a crash' }).click();
  await page.locator('[data-run="c2020"]').click();
  await expect(page.locator('.folio')).toContainText('2020');
  expect(errors).toEqual([]);
});

test('a second first sale shows the line again when storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('storage is blocked');
      },
    });
  });
  await page.clock.install();
  await page.goto('/?run=s2014');
  await pressStart(page);
  await expect(page.locator('button.act')).toHaveText(/^Sell for/);
  await page.clock.runFor(2000);
  await page.locator('button.act').click();
  await expect(page.getByText(FIRST_SALE)).toBeVisible();
  // R35: quiet days in cash run quicker, so s2014 ends sooner (about 27 s after this sale); stop
  // before the end screen's countdown starts the next game.
  await page.clock.runFor(32_000);
  await page.getByRole('button', { name: 'Rematch this crash' }).click();
  await pressStart(page);
  await expect(page.locator('.folio')).toContainText('Rematch');
  await page.clock.runFor(1500);
  await page.locator('button.act').click();
  await expect(page.getByText(FIRST_SALE)).toBeVisible();
});

test('the daily crash waits for phase 2: nothing on the result page or the menus offers or names it (R47)', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?run=s2014');
  await pressStart(page);
  await page.clock.runFor(40_000);
  await expect(page.getByText('Late edition')).toBeVisible();
  await page.clock.runFor(10_000);
  const daily = /daily/i;
  await expect(page.locator('body')).not.toContainText(daily);
  await expect(page.getByRole('button', { name: daily })).toHaveCount(0);
  await page.getByRole('button', { name: 'Your collection' }).click();
  await expect(page.locator('body')).not.toContainText(daily);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Pick a crash' }).click();
  await expect(page.locator('body')).not.toContainText(daily);
});
