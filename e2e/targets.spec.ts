import { expect, test, type Page } from '@playwright/test';
import { pressStart } from './start';

// R48: every tap target at least 44 px each way; small text at least 14 px. Result page and menus.

/** Buttons under 44 x 44 and text set under 14 px inside `root`. */
function audit(page: Page, root: string) {
  return page.evaluate((sel) => {
    const scope = document.querySelector(sel)!;
    const small = Array.from(scope.querySelectorAll('button'))
      .map((b) => ({ t: b.textContent, r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.height > 0 && (r.height < 44 || r.width < 44))
      .map(({ t, r }) => `${t} ${Math.round(r.width)}x${Math.round(r.height)}`);
    const tiny = new Set<string>();
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const e = n.parentElement!;
      if (!n.textContent!.trim() || e.getClientRects().length === 0) continue;
      const size = parseFloat(getComputedStyle(e).fontSize);
      if (size < 14) tiny.add(`${n.textContent!.trim().slice(0, 30)} ${size}px`);
    }
    return { small, tiny: [...tiny] };
  }, root);
}

test('result page, collection and pick a crash: targets 44 px, text 14 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await page.clock.install();
  await page.goto('/?run=s2014');
  await pressStart(page);
  for (let i = 0; i < 60 && (await page.locator('.es-h1').count()) === 0; i++) await page.clock.runFor(1000);
  expect(await audit(page, 'main.es')).toEqual({ small: [], tiny: [] }); // the cover up
  await page.clock.runFor(7000);
  expect(await audit(page, 'main.es')).toEqual({ small: [], tiny: [] });
  await page.getByRole('button', { name: 'Your collection' }).click();
  expect(await audit(page, '.dps-menu')).toEqual({ small: [], tiny: [] });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Pick a crash' }).click();
  expect(await audit(page, '.dps-menu')).toEqual({ small: [], tiny: [] });
});
