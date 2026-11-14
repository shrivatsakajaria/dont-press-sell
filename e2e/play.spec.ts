import { expect, test } from '@playwright/test';

const FIRST_SALE = 'You are out. To win, buy back in for less than you sold.';

for (const height of [844, 660]) {
  for (const run of ['c2007', 's2018']) {
    test(`play screen at 390 x ${height}, ${run}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height });
      await page.goto(`/?run=${run}`);
      const button = page.locator('button.act');
      await expect(button).toHaveText(/^Sell for \$[\d,]+$/);

      // Let a few days run, then check the layout.
      await page.waitForTimeout(1500);
      await expect(button).toHaveText(/^Sell for \$[\d,]+$/);
      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bottom: document.querySelector('button.act')!.getBoundingClientRect().bottom,
        buttonHeight: document.querySelector('button.act')!.getBoundingClientRect().height,
      }));
      expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
      expect(height - m.bottom).toBeGreaterThanOrEqual(40);
      expect(m.buttonHeight).toBeGreaterThanOrEqual(44);
      for (const q of ['button.pause', 'button.sound']) {
        const box = await page.locator(q).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: `e2e/shots/play-${run}-${height}-holding.png` });

      await button.click();
      await expect(button).toHaveText(/^Buy back now: \$[\d,]+ (ahead|behind)$/);
      await expect(page.getByText(FIRST_SALE)).toBeVisible();
      await expect(page.locator('.folio')).toContainText(/You are in cash|Time slowed|Fast forward/);
      const after = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bottom: document.querySelector('button.act')!.getBoundingClientRect().bottom,
      }));
      expect(after.scrollWidth).toBeLessThanOrEqual(after.clientWidth);
      expect(height - after.bottom).toBeGreaterThanOrEqual(40);
      await page.screenshot({ path: `e2e/shots/play-${run}-${height}-sold.png` });
    });
  }
}

test('pause stops the clock and resume starts it again', async ({ page }) => {
  await page.goto('/?run=s2018');
  await page.waitForTimeout(800);
  await page.locator('button.pause').click();
  await expect(page.locator('button.pause')).toHaveText('Resume');
  await expect(page.locator('.folio')).toContainText('Paused');
  const day = await page.locator('.folio span').nth(1).textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('.folio span').nth(1)).toHaveText(day!);
  await page.locator('button.pause').click();
  await expect(page.locator('button.pause')).toHaveText('Pause');
  await expect(page.locator('.folio span').nth(1)).not.toHaveText(day!, { timeout: 3000 });
});

test('the fast-forward shows a year counter and the run ends', async ({ page }) => {
  await page.goto('/?run=s2018');
  await expect(page.locator('.folio')).toContainText('Fast forward', { timeout: 60_000 });
  await expect(page.locator('.folio span').nth(1)).toHaveText(/^Year \d+$/);
  await expect(page.getByText('Run over')).toBeVisible({ timeout: 20_000 });
});
