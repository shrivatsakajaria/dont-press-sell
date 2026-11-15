import { expect, test } from '@playwright/test';

// The start screen (ruling R28): a fresh page load stands still until Start is pressed.
const LINES = [
  'The market is falling. Nobody knows how far.',
  'You have $10,000, and one button.',
  'Press the button to sell if you dare. Get back in cheaper and you win. Wait too long and the market leaves without you.',
];
const BORROWED = 'You have borrowed $20,000. Every move is three times bigger. Fall a third and you are wiped out.';
const S2018 = 9; // index in RUN_IDS

function code(runIndex: number, final: number, days: number[]): string {
  const bytes = [1, runIndex, (final >>> 24) & 255, (final >>> 16) & 255, (final >>> 8) & 255, final & 255, days.length];
  for (const d of days) bytes.push((d >> 8) & 255, d & 255);
  return Buffer.from(bytes).toString('base64url');
}

async function layout(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const act = document.querySelector('button.act')!.getBoundingClientRect();
    const chart = document.querySelector('.chart')!.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      bottom: act.bottom,
      buttonHeight: act.height,
      chartHeight: chart.height,
    };
  });
}

for (const height of [660, 844]) {
  test(`the page loads on the start screen and the clock waits for Start (390 x ${height})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await page.goto('/?run=s2018');
    const button = page.locator('button.act');
    await expect(button).toHaveText('Start');
    await expect(page.locator('.intro p')).toHaveText(LINES);
    await expect(page.locator('.folio')).toContainText('Mystery crash');
    await expect(page.locator('.folio')).toContainText('Day 1');
    await expect(page.locator('.balance')).toHaveText('$10,000');
    await expect(page.locator('h1.headline')).toBeHidden();
    const m = await layout(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
    expect(m.scrollHeight).toBeLessThanOrEqual(m.clientHeight);
    expect(height - m.bottom).toBeGreaterThanOrEqual(40);
    expect(m.buttonHeight).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `e2e/shots/S/start-${height}.png` });

    // The clock does not move for 5 s.
    await page.waitForTimeout(5000);
    await expect(page.locator('.folio')).toContainText('Day 1');
    await expect(button).toHaveText('Start');

    await button.click();
    await expect(button).toHaveText(/^Sell for \$[\d,]+$/);
    await expect(page.locator('.intro')).toBeHidden();
    await expect(page.locator('.standfirst')).toHaveText(
      'You have $10,000 of play money in the stock market. Hold your nerve or bail.',
    );
    await expect(page.locator('.folio span').nth(1)).not.toHaveText('Day 1', { timeout: 5000 });
    await page.screenshot({ path: `e2e/shots/S/started-${height}.png` });
  });
}

test('the layout holds two 16-word lines, a 22-word line and a score to beat at 390 x 660', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await page.goto('/?run=c2007');
  await expect(page.locator('button.act')).toHaveText('Start');
  await page.evaluate(() => {
    const sixteen = 'Every word of this line is here to test how sixteen plain words wrap on a phone.';
    const long = 'Every word of this line is here to test how twenty two plain words wrap on a phone, and still leave room.';
    const intro = document.querySelector('.intro')!;
    intro.querySelectorAll('p').forEach((p, i) => (p.textContent = i < 2 ? sixteen : long));
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Score to beat: $11,341';
    intro.append(note);
  });
  const m = await layout(page);
  expect(m.scrollHeight).toBeLessThanOrEqual(m.clientHeight);
  expect(660 - m.bottom).toBeGreaterThanOrEqual(40);
  // No empty chart band and no "level" on the start screen (audit 5): the chart waits for play.
  expect(m.chartHeight).toBe(0);
  await expect(page.locator('.delta')).toBeHidden();
  await expect(page.locator('.folio')).toContainText('Price: your nerve');
  await page.screenshot({ path: 'e2e/shots/S/start-660-long-lines.png' });
});

test('a challenge link shows the score to beat on the start screen, and a start screen every time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  const link = `/#c=${code(S2018, 11341, [10, 30])}`;
  await page.goto(link);
  await expect(page.locator('button.act')).toHaveText('Start');
  // The score to beat is recomputed from the trades (I5): selling on day 11 and buying on day 31 of s2018 makes $11,804.
  await expect(page.locator('.intro .note')).toHaveText('Score to beat: $11,804');
  await page.screenshot({ path: 'e2e/shots/S/start-challenge-660.png' });
  await page.goto('about:blank');
  await page.goto(link);
  // R45: every game opens on Start; a fresh page load shows the full start text again.
  await expect(page.locator('button.act')).toHaveText('Start');
  await expect(page.locator('.intro .note')).toHaveText('Score to beat: $11,804');
});

test('borrowed money shows the three lines and its own line under them, in the secondary colour', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await page.addInitScript(() => {
    localStorage.setItem('dps:borrowedUnlocked', 'true');
    localStorage.setItem('dps:borrowed', 'true');
  });
  await page.goto('/?run=c2007');
  await expect(page.locator('.intro p')).toHaveText([...LINES, BORROWED]);
  const colours = await page.evaluate(() => {
    const c = (q: string) => getComputedStyle(document.querySelector(q)!).color;
    return { extra: c('.intro .extra'), line: c('.intro p:nth-child(2)'), sec: c('.under') };
  });
  expect(colours.extra).toBe(colours.sec);
  expect(colours.extra).not.toBe(colours.line);
  const m = await layout(page);
  expect(m.scrollHeight).toBeLessThanOrEqual(m.clientHeight);
  expect(660 - m.bottom).toBeGreaterThanOrEqual(40);
  await page.screenshot({ path: 'e2e/shots/S/start-borrowed-660.png' });
});
