import { describe, expect, test } from 'vitest';
import { BEFORE_NEWS } from '../../src/content/copy';
import { NEUTRAL_LINES } from '../../src/content/commentary';
import type { Headline, Trade } from '../../src/engine/types';
import { createNarrator, headlineOn, investedDuring, tradeNews } from '../../src/game/narrator';
import { mulberry32 } from '../../src/game/rng';

const H = (dayIndex: number, extra: Partial<Headline> = {}): Headline => ({
  dayIndex, real: `Real ${dayIndex}`, anon: `Anon ${dayIndex}`, big: false, sombre: false, ...extra,
});

const closes = Array.from({ length: 60 }, (_, i) => 100 - i * 0.5 + (i % 3 === 0 ? 1 : 0));
const run = { closes, high: 108, preCloses: Array.from({ length: 30 }, (_, i) => 100 + i * 0.25) };

describe('headlineOn', () => {
  const list = [H(3), H(10), H(11)];
  test('gives the latest headline on or before the day', () => {
    expect(headlineOn(list, 3)?.dayIndex).toBe(3);
    expect(headlineOn(list, 9)?.dayIndex).toBe(3);
    expect(headlineOn(list, 11)?.dayIndex).toBe(11);
    expect(headlineOn(list, 50)?.dayIndex).toBe(11);
  });
  test('is null before the first headline', () => {
    expect(headlineOn(list, 2)).toBeNull();
    expect(headlineOn([], 5)).toBeNull();
  });
});

describe('investedDuring: the position held through a day\'s move (held at yesterday\'s close)', () => {
  const trades: Trade[] = [{ dayIndex: 5, side: 'sell' }, { dayIndex: 9, side: 'buy' }];
  test('a sale on day 5 still holds through day 5, out from day 6, back in after day 9', () => {
    expect(investedDuring(trades, 5)).toBe(true);
    expect(investedDuring(trades, 6)).toBe(false);
    expect(investedDuring(trades, 9)).toBe(false);
    expect(investedDuring(trades, 10)).toBe(true);
  });
});

describe('createNarrator', () => {
  const list = [H(4), H(6, { sombre: true }), H(20, { big: true })];

  test('blind runs show anon lines, picked runs real lines, and a plain line before the first headline', () => {
    const blind = createNarrator(run, list, { real: false, rng: mulberry32(1), start: 10000 });
    expect(blind.step(0, null, 10000, []).headline).toBe(BEFORE_NEWS);
    expect(blind.step(5, 0, 9800, []).headline).toBe('Anon 4');
    const real = createNarrator(run, list, { real: true, rng: mulberry32(1), start: 10000 });
    expect(real.step(5, null, 9800, []).headline).toBe('Real 4');
  });

  test('a sombre day and the step after it get neutral commentary, then normal lines return', () => {
    const n = createNarrator(run, list, { real: false, rng: mulberry32(2), start: 10000 });
    n.step(5, 4, 9900, []);
    const a = n.step(7, 5, 9800, []); // covers day 6 (sombre)
    const b = n.step(8, 7, 9700, []); // the step after
    const c = n.step(9, 8, 9600, []);
    expect(a.sombre).toBe(true);
    expect(NEUTRAL_LINES).toContain(a.commentary);
    expect(NEUTRAL_LINES).toContain(b.commentary);
    expect(c.sombre).toBe(false);
  });

  test('a line, once replaced, never comes back; and no digit-years or exclamation marks', () => {
    const n = createNarrator(run, [], { real: false, rng: mulberry32(3), start: 10000 });
    const gone = new Set<string>();
    let prev = '';
    for (let d = 0; d < closes.length; d++) {
      const { commentary } = n.step(d, d ? d - 1 : null, 10000 * (closes[d] / closes[0]), []);
      if (commentary !== prev) {
        if (commentary) expect(gone.has(commentary)).toBe(false);
        gone.add(prev);
      }
      expect(commentary).not.toMatch(/!|\b(19|20)\d\d\b/);
      prev = commentary;
    }
  });
});

describe('tradeNews: the real line showing on each traded day', () => {
  const list = [H(4), H(20)];
  test('uses the latest line within ten trading days, and leaves out trades with none', () => {
    const trades: Trade[] = [{ dayIndex: 2, side: 'sell' }, { dayIndex: 8, side: 'buy' }, { dayIndex: 17, side: 'sell' }, { dayIndex: 22, side: 'buy' }];
    expect(tradeNews(list, trades)).toEqual([
      { side: 'buy', real: 'Real 4' },
      { side: 'buy', real: 'Real 20' },
    ]);
  });
});
