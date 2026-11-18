import { expect, test, UMAMI, type Page } from './fixtures';
import { pressStart } from './start';

// R66-R69: Umami's script is replaced by a stub that records umami.track calls; the real host is never reached.
type Call = [string, Record<string, unknown>];

async function stubUmami(page: Page) {
  const reached: string[] = [];
  await page.route(UMAMI, (route) => {
    reached.push(route.request().url());
    return route.fulfill({
      contentType: 'text/javascript',
      body: 'window.__calls=[];window.umami={track:function(n,d){window.__calls.push([n,d])}};',
    });
  });
  return reached;
}

const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls?: Call[] }).__calls ?? []) as Promise<Call[]>;
const names = async (page: Page) => (await calls(page)).map((c) => c[0]);
const last = async (page: Page, name: string) => (await calls(page)).filter((c) => c[0] === name).at(-1)?.[1];

/** Plays c2007: sells after 4 s, buys back 6 s later (a win), until the front page prints. */
async function playToResult(page: Page, opts: { goto?: boolean } = {}) {
  if (opts.goto !== false) {
    await page.clock.install();
    await page.goto('/?run=c2007');
  }
  await pressStart(page);
  const act = page.locator('button.act');
  await page.clock.runFor(4000);
  await act.click();
  await expect(act).toHaveText(/^Buy back/);
  await page.clock.runFor(6000);
  await act.click();
  await expect(act).toHaveText(/^Sell for/);
  for (let i = 0; i < 160 && (await page.locator('.es-h1').count()) === 0; i++) await page.clock.runFor(1000);
  await expect(page.locator('.es-h1')).toBeVisible();
}

async function hidePage(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test('a game sends game_start, game_end and result_action with the shared context', async ({ page }) => {
  const reached = await stubUmami(page);
  await playToResult(page);
  await page.getByRole('button', { name: 'Tap to see what that was' }).click();
  await page.clock.runFor(3000);
  await page.getByRole('button', { name: 'Rematch this crash' }).click();
  await expect(page.locator('button.act')).toHaveText('Start');
  expect(await names(page)).toEqual(['game_start', 'game_end', 'result_action']);
  const ctx = { g: 1, gt: '1', dsf: '0', entry: 'new', kind: 'crash', run: 'c2007', inapp: 'none', snd: 'on' };
  expect(await last(page, 'game_start')).toEqual({ ...ctx, ms_to_start: expect.stringMatching(/^(<3s|3-10s|10-30s|30-60s|60s\+)$/) });
  expect(await last(page, 'game_end')).toEqual({
    ...ctx, outcome: 'win', lead: expect.stringMatching(/^(1 to 499|500 to 1999|2000 or more)$/), sec: expect.any(String),
    trades: 2, first_sell: expect.stringMatching(/^(before|on|after)_red$/), first_sell_pct: expect.any(Number),
    cash_pct: expect.any(Number), double: false,
  });
  expect(await last(page, 'result_action')).toEqual({ ...ctx, action: 'rematch', result_sec: expect.any(String), revealed: true });
  // Nothing in any event names the player.
  for (const [, d] of await calls(page)) expect(Object.keys(d).join(' ')).not.toMatch(/\b(id|user|uuid|session)\b/i);
  // Only the stub was asked for; the next game's start says it is a rematch, game 2 of the visit.
  expect(reached).toEqual(['https://cloud.umami.is/script.js']);
  await pressStart(page);
  await page.clock.runFor(1000);
  expect(await last(page, 'game_start')).toMatchObject({ g: 2, gt: '2', entry: 'rematch' });
  expect(await last(page, 'game_start')).not.toHaveProperty('ms_to_start');
});

test('leaving mid-game sends game_quit once, with where they were', async ({ page }) => {
  await stubUmami(page);
  await page.clock.install();
  await page.goto('/?run=c2007');
  await pressStart(page);
  await page.clock.runFor(4000);
  await page.locator('button.act').click();
  await expect(page.locator('button.act')).toHaveText(/^Buy back/);
  await hidePage(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  const quits = (await calls(page)).filter((c) => c[0] === 'game_quit');
  expect(quits.length).toBe(1);
  expect(quits[0][1]).toMatchObject({ g: 1, run: 'c2007', phase: 'in_cash', sold: true, pct: expect.any(Number) });
});

test('leaving the start screen sends game_quit from start_screen', async ({ page }) => {
  await stubUmami(page);
  await page.goto('/?run=c2007');
  await expect(page.locator('button.act')).toHaveText('Start');
  await hidePage(page);
  expect(await last(page, 'game_quit')).toMatchObject({ phase: 'start_screen', sold: false });
  expect(await names(page)).toEqual(['game_quit']);
});

test('leaving the result page without a move sends result_action left', async ({ page }) => {
  await stubUmami(page);
  await playToResult(page);
  await hidePage(page);
  expect(await last(page, 'result_action')).toMatchObject({ action: 'left', revealed: false });
});

/** Two games already finished on this phone: this one is the third. */
async function twoPlayedBefore(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('dps:an', JSON.stringify({ n: 2, e: 2, f: '2026-11-01', q: false }));
      sessionStorage.setItem('seeded', '1');
    }
  });
}

test('the question comes after the third finished game only, once; the answer is sent and the line goes', async ({ page }) => {
  await stubUmami(page);
  await twoPlayedBefore(page);
  await playToResult(page);
  const ask = page.locator('.es-ask');
  await expect(ask).toContainText('Play again tomorrow?');
  await page.getByRole('button', { name: 'Tap to see what that was' }).click();
  await page.clock.runFor(3000);
  await ask.getByRole('button', { name: 'Yes' }).click();
  await expect(ask).toHaveCount(0);
  expect(await last(page, 'feedback')).toMatchObject({ answer: 'yes', gt: '3-5', dsf: '8+' });
  // The fourth game: no question.
  await page.getByRole('button', { name: 'Rematch this crash' }).click();
  await playToResult(page, { goto: false });
  await expect(page.locator('.es-ask')).toHaveCount(0);
  expect((await calls(page)).filter((c) => c[0] === 'feedback').length).toBe(1);
});

test('no question on the first or second game', async ({ page }) => {
  await stubUmami(page);
  await playToResult(page);
  await expect(page.locator('.es-ask')).toHaveCount(0);
});

for (const height of [660, 844]) {
  test(`with the question showing, a win still fits one ${height} px screen`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await stubUmami(page);
    await twoPlayedBefore(page);
    await playToResult(page);
    for (const phase of ['cover', 'revealed']) {
      if (phase === 'revealed') {
        await page.getByRole('button', { name: 'Tap to see what that was' }).click();
        await page.clock.runFor(3000);
      }
      await page.screenshot({ path: `e2e/shots/AN/ask-${height}-${phase}.png` });
      const m = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight,
        out: Array.from(document.querySelectorAll('main.es button'))
          .filter((b) => {
            const r = b.getBoundingClientRect();
            return r.height > 0 && (r.top < 0 || r.bottom > innerHeight);
          })
          .map((b) => b.textContent),
      }));
      expect(m.scrollHeight).toBeLessThanOrEqual(m.innerHeight);
      expect(m.out).toEqual([]);
      await expect(page.locator('.es-ask')).toBeInViewport({ ratio: 1 });
      for (const b of await page.locator('.es-ask button').all()) {
        const box = (await b.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    await expect(page.getByRole('button', { name: 'Double or nothing' })).toBeInViewport({ ratio: 1 });
  });
}
