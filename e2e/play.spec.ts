import { expect, test } from './fixtures';
import { pressStart } from './start';

const FIRST_SALE = 'You are out. To win, buy back in for less than you sold.';

for (const height of [844, 660]) {
  for (const run of ['c2007', 's2018']) {
    test(`play screen at 390 x ${height}, ${run}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height });
      await page.goto(`/?run=${run}`);
      await pressStart(page);
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
      // R38: sold at this close, so buying back now is the same price; one number only (no regret line).
      await expect(button).toHaveText(/^Buy back (at the same price|\$[\d,]+ (cheaper|more expensive))$/);
      await expect(page.locator('.regret')).toBeHidden();
      await expect(page.getByText(FIRST_SALE)).toBeVisible();
      await expect(page.locator('.folio')).toContainText(/You are in cash|Fast forward/);
      await expect(page.locator('.folio')).not.toContainText(/Time slowed|Price: your nerve/);
      await expect(page.locator('.foot')).not.toContainText('Your pot');
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
  await pressStart(page);
  await page.waitForTimeout(800);
  await page.locator('button.pause').click();
  await expect(page.locator('button.pause')).toHaveText('Resume');
  await expect(page.locator('.folio')).toContainText('Paused');
  const day = await page.locator('.folio span').nth(1).textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('.folio span').nth(1)).toHaveText(day!);
  await page.locator('button.pause').click();
  await expect(page.locator('button.pause')).toHaveText('Pause');
  await expect(page.locator('.folio span').nth(1)).not.toHaveText(day!, { timeout: 5000 }); // R27: steps hold up to 3 s
});

test('the fast-forward shows a year counter and the run ends on the result page', async ({ page }) => {
  // R27: s2018 runs about 118 s (108 s fall, 10 s fast-forward), so drive a fake clock.
  await page.clock.install();
  await page.goto('/?run=s2018');
  await pressStart(page);
  await page.clock.runFor(109_000);
  await expect(page.locator('.folio')).toContainText('Fast forward');
  await expect(page.locator('.folio span').nth(1)).toHaveText(/^Year \d+$/);
  await page.clock.runFor(12_000);
  await expect(page.getByText('Late edition')).toBeVisible();
});
