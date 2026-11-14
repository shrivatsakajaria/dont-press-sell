import { expect, test, type Page } from '@playwright/test';

const OPENING = 'You have $10,000 of play money in the stock market. Hold your nerve or bail.';
const S2018 = 9; // index in RUN_IDS

/** The link format of src/share/link.ts (version 1), built here so the test does not import Vite-only modules. */
function code(runIndex: number, final: number, days: number[]): string {
  const bytes = [1, runIndex, (final >>> 24) & 255, (final >>> 16) & 255, (final >>> 8) & 255, final & 255, days.length];
  for (const d of days) bytes.push((d >> 8) & 255, d & 255);
  return Buffer.from(bytes).toString('base64url');
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test('a challenge link plays that run blind with the score to beat, and the result names the winner', async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.install();
  await page.goto(`/#c=${code(S2018, 11341, [10, 30])}`);
  await expect(page.locator('.folio')).toContainText('Mystery crash');
  await expect(page.locator('.regret')).toHaveText('Score to beat: $11,341');
  await expect(page.locator('.standfirst')).toHaveText(OPENING);
  await page.clock.runFor(47_000);
  await expect(page.getByText('Late edition')).toBeVisible();
  await expect(page.getByText('Tap to see what that was')).toBeVisible();
  await expect(page.locator('.es-row').filter({ hasText: 'Your challenger' })).toContainText('$11,341');
  await expect(page.locator('.es-vs')).toHaveText(/^(Your challenger beat you by|You beat your challenger by) \$[\d,]+$/);
  await expect(page.locator('[data-line="other"]')).toHaveCount(1);
  // A challenge never starts the countdown.
  await page.clock.runFor(15_000);
  await expect(page.getByText(/Next mystery crash/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const [name, hash] of [
  ['garbage', '#c=garbage!!'],
  ['truncated', `#c=${code(S2018, 11341, [10, 30]).slice(0, 9)}`],
  ['trades beyond the run', `#c=${code(S2018, 11341, [10, 5000])}`],
  ['empty', '#c='],
]) {
  test(`a broken link (${name}) starts a fresh mystery with no error`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`/${hash}`);
    await expect(page.locator('.standfirst')).toHaveText(OPENING);
    await expect(page.locator('.regret')).not.toContainText('Score to beat');
    await expect(page.locator('body')).not.toContainText(/error|invalid/i);
    expect(errors).toEqual([]);
  });
}
