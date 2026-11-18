import { expect, test, type Page } from './fixtures';
import { pressStart } from './start';

// Round 2 fix wave, lane FD (R58 and the sound part of R57): the result page and its flow.

/** Plays c2007: sells after 4 s, buys back after `buyAfter` ms more (or never), until the front page prints. */
async function play(page: Page, height: number, buyAfter: number | null) {
  await page.setViewportSize({ width: 390, height });
  await page.clock.install();
  await page.goto('/?run=c2007');
  await pressStart(page);
  const act = page.locator('button.act');
  await page.clock.runFor(4000);
  await act.click();
  await expect(act).toHaveText(/^Buy back/);
  if (buyAfter !== null) {
    await page.clock.runFor(buyAfter);
    await act.click();
    await expect(act).toHaveText(/^Sell for/);
  }
  for (let i = 0; i < 160 && (await page.locator('.es-h1').count()) === 0; i++) await page.clock.runFor(1000);
  await expect(page.locator('.es-h1')).toBeVisible();
}

const tops = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Array.from(document.querySelectorAll('main.es button'))
        .filter((b) => b.getBoundingClientRect().height > 0)
        .map((b) => [b.textContent, Math.round(b.getBoundingClientRect().top)]),
    ),
  );

for (const height of [660, 844]) {
  test(`at ${height} px the result chart has at least 100 px of line and the page is one screen, before and after the reveal`, async ({ page }) => {
    await play(page, height, null);
    const chartH = () => page.evaluate(() => document.querySelector('main.es svg')!.getBoundingClientRect().height);
    const before = await chartH();
    // 140 (660) / 160 (844) tall; it comes down to 124 / 112 only to keep the foot links on the page.
    const footShown = await page.locator('.es-foot').isVisible();
    expect(before).toBeGreaterThanOrEqual(footShown ? (height <= 700 ? 124 : 112) : height <= 700 ? 140 : 160);
    const buttonsBefore = await tops(page);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
    await page.getByRole('button', { name: 'Tap to see what that was' }).click();
    await page.clock.runFor(3000);
    // Nothing jumps at the reveal: the chart keeps its size and the buttons their place.
    expect(await chartH()).toBe(before);
    const buttonsAfter = await tops(page);
    for (const [name, top] of Object.entries(buttonsBefore)) {
      if (name !== 'Tap to see what that was') expect(buttonsAfter[name], name).toBe(top);
    }
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
    await expect(page.getByText(/You finished with \$[\d,]+\./)).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `e2e/shots/FD/result-${height}-loss.png` });
  });

  test(`at ${height} px a win prints "You finished with $N" and a "Keep my win" button with no figure`, async ({ page }) => {
    await play(page, height, 6000);
    await page.getByRole('button', { name: 'Tap to see what that was' }).click();
    await page.clock.runFor(3000);
    await expect(page.getByText(/You finished with \$[\d,]+\./)).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Keep my win' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: /^Bank/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
    await page.screenshot({ path: `e2e/shots/FD/result-${height}-win.png` });
  });
}

test('Keep my win keeps "Challenge a friend", and the page comes back without a count or a sound', async ({ page }) => {
  await play(page, 844, 6000);
  await page.getByRole('button', { name: 'Tap to see what that was' }).click();
  await page.clock.runFor(3000);
  const lead = await page.locator('.es-lead').textContent();
  await expect(page.getByRole('button', { name: 'Challenge a friend' })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { tones: number }).tones = 0;
    const proto = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)?.prototype;
    const make = proto?.createOscillator;
    if (proto && make) {
      proto.createOscillator = function (this: AudioContext) {
        (window as unknown as { tones: number }).tones++;
        return make.call(this);
      };
    }
  });
  await page.getByRole('button', { name: 'Keep my win' }).click();
  await expect(page.locator('.es-lead')).toHaveText(lead!);
  await expect(page.getByRole('button', { name: 'Challenge a friend' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Double or nothing' })).toHaveCount(0);
  await expect(page.locator('.es-double h2')).toHaveText('Wins in a row: 1');
  await page.clock.runFor(3000);
  expect(await page.evaluate(() => (window as unknown as { tones: number }).tones)).toBe(0);
  // Back from a menu: the same page, already counted, and Challenge still there.
  await page.getByRole('button', { name: 'Your collection' }).click();
  await page.getByRole('button', { name: /Back/ }).first().click();
  await expect(page.locator('.es-lead')).toHaveText(lead!);
  await expect(page.getByRole('button', { name: 'Challenge a friend' })).toBeVisible();
  await page.clock.runFor(3000);
  expect(await page.evaluate(() => (window as unknown as { tones: number }).tones)).toBe(0);
});

test('the sound system is built after the clock starts, not in the Start tap (R57)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { built: { gate: boolean; at: number }[] };
    w.built = [];
    const Real = window.AudioContext;
    if (!Real) return;
    window.AudioContext = class extends Real {
      constructor(o?: AudioContextOptions) {
        w.built.push({ gate: !!document.querySelector('.is-gate'), at: performance.now() });
        super(o);
      }
    } as typeof AudioContext;
  });
  await page.goto('/?run=c2007');
  await pressStart(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { built: unknown[] }).built.length)).toBe(1);
  const built = await page.evaluate(() => (window as unknown as { built: { gate: boolean }[] }).built);
  expect(built[0].gate).toBe(false);
  // A later tap still finds the one context (resumed, not rebuilt).
  await page.locator('button.act').click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { built: unknown[] }).built.length)).toBe(1);
});

test('keyboard: Enter on "Tap to see what that was" leaves focus on the crash name, not on the page', async ({ page }) => {
  await play(page, 844, null);
  await page.getByRole('button', { name: 'Tap to see what that was' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.es-name')).toBeFocused();
});
