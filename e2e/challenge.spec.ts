import { expect, test, type Page } from './fixtures';
import { pressStart } from './start';

/** R51: no opening line on the play screen (the Start screen says it); the narrator's own line from day 1. */
const OPENING = /play money|Hold your nerve/;
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
  await pressStart(page);
  await expect(page.locator('.folio')).toContainText('Mystery crash');
  // The link's own final (11,341) is ignored: the trades make $11,804 (I5).
  await expect(page.locator('.regret')).toHaveText('Score to beat: $11,804');
  await expect(page.locator('.standfirst')).not.toHaveText(OPENING);
  await expect(page.locator('.standfirst')).not.toHaveText('');
  await page.clock.runFor(119_000); // R27: s2018 runs about 118 s
  await expect(page.getByText('Late edition')).toBeVisible();
  await expect(page.getByText('Tap to see what that was')).toBeVisible();
  await expect(page.locator('.es-row').filter({ hasText: 'Your challenger' })).toContainText('$11,804');
  await expect(page.locator('.es-vs')).toHaveText(/^(Your challenger beat you by|You beat your challenger by) \$[\d,]+$/);
  // R42: the challenger is a row and a line of words, never a money line on the chart; the chart is the price.
  await expect(page.locator('[data-line="other"]')).toHaveCount(0);
  await expect(page.locator('[data-line="price"]')).toHaveCount(1);
  // A challenge never starts the countdown.
  await page.clock.runFor(15_000);
  await expect(page.getByText(/Next mystery crash/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a hand-edited final is ignored: the score to beat comes from the trades (I5)', async ({ page }) => {
  await page.goto(`/#c=${code(S2018, 1_000_000_000, [10, 30])}`);
  await expect(page.locator('.intro .note')).toHaveText('Score to beat: $11,804');
  await pressStart(page);
  await expect(page.locator('.regret')).toHaveText('Score to beat: $11,804');
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
    await pressStart(page);
    await expect(page.locator('.standfirst')).not.toHaveText(OPENING);
  await expect(page.locator('.standfirst')).not.toHaveText('');
    await expect(page.locator('.regret')).not.toContainText('Score to beat');
    await expect(page.locator('body')).not.toContainText(/error|invalid/i);
    expect(errors).toEqual([]);
  });
}
