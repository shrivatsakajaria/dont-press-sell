import { describe, expect, it } from 'vitest';
import { verdictCopy, verdictFor } from '../../src/engine/verdict';
import type { BorrowedResult, RunData, RunResult, Trade } from '../../src/engine/types';

function run(kind: 'crash' | 'scare' = 'crash', lowIndex = 20, n = 60, plateau = false): RunData {
  const closes = Array.from({ length: n }, (_, i) => (i <= lowIndex ? 100 - i : 100 - lowIndex + (i - lowIndex)));
  if (plateau) closes[19] = closes[18]; // two equal closes: a sale and buy-back across them changes nothing
  return {
    id: 'x',
    kind,
    pickName: 'Test',
    revealLine: 'That was test',
    dates: closes.map((_, i) => `2000-01-${String(i + 1).padStart(2, '0')}`),
    closes,
    lowIndex,
    fallEndIndex: lowIndex,
  };
}

function result(o: Partial<RunResult> & { trades: Trade[] }): RunResult {
  const holderFinal = 10000;
  const final = o.final ?? holderFinal + (o.lead ?? 0);
  const lead = o.lead ?? final - holderFinal;
  const perfectFinal = o.perfectFinal ?? 20000;
  return {
    final,
    holderFinal,
    perfectFinal,
    lead,
    share: o.share ?? lead / (perfectFinal - holderFinal),
    balances: o.balances ?? [10000, final],
    daysInCash: o.daysInCash ?? 0,
    trades: o.trades,
  };
}

const sell = (dayIndex: number): Trade => ({ dayIndex, side: 'sell' });
const buy = (dayIndex: number): Trade => ({ dayIndex, side: 'buy' });

describe('verdictFor, in spec 8.3 order', () => {
  it('marginCalled when wipedAt is non-null (before every other row)', () => {
    const r: BorrowedResult = { ...result({ trades: [], lead: 6000 }), wipedAt: 12 };
    expect(verdictFor(r, run())).toBe('marginCalled');
  });
  it('a borrowed result with wipedAt null falls through', () => {
    const r: BorrowedResult = { ...result({ trades: [] }), wipedAt: null };
    expect(verdictFor(r, run())).toBe('diamond');
  });
  it('bigShort when share >= 0.5', () => {
    expect(verdictFor(result({ trades: [sell(5), buy(21)], lead: 5000 }), run())).toBe('bigShort');
  });
  it('bigShort wins over nerves at exactly 0.5', () => {
    expect(verdictFor(result({ trades: [sell(5), buy(21)], lead: 5000, share: 0.5 }), run())).toBe('bigShort');
  });
  it('nerves when ahead with share below 0.5', () => {
    expect(verdictFor(result({ trades: [sell(5), buy(10)], lead: 300 }), run())).toBe('nerves');
  });
  it('diamond when there are no trades', () => {
    expect(verdictFor(result({ trades: [] }), run())).toBe('diamond');
  });
  it('shakenOut: a sale in a scare with lead <= 0', () => {
    expect(verdictFor(result({ trades: [sell(25), buy(40)], lead: -400 }), run('scare'))).toBe('shakenOut');
  });
  it('shakenOut also at lead exactly zero', () => {
    expect(verdictFor(result({ trades: [sell(18), buy(19)], lead: 0 }), run('scare', 20, 60, true))).toBe('shakenOut');
  });
  it('paper: sale within 10 days of the low, bought back at a higher close', () => {
    expect(verdictFor(result({ trades: [sell(15), buy(30)], lead: -500 }), run())).toBe('paper');
  });
  it('not paper when the sale is 11 days from the low', () => {
    expect(verdictFor(result({ trades: [sell(9), buy(33)], lead: -200 }), run())).toBe('bagholder');
  });
  it('not paper when the buy-back close is not higher', () => {
    expect(verdictFor(result({ trades: [sell(18), buy(19)], lead: 0 }), run('crash', 20, 60, true))).toBe('bagholder');
  });
  it('cashGang: a sale with no later buy', () => {
    expect(verdictFor(result({ trades: [sell(4)], lead: -800 }), run())).toBe('cashGang');
  });
  it('overtrader: five or more trades', () => {
    const t = [sell(40), buy(41), sell(42), buy(43), sell(44), buy(45)];
    expect(verdictFor(result({ trades: t, lead: -900 }), run())).toBe('overtrader');
  });
  it('five trades ending in a sale is cashGang first', () => {
    const t = [sell(40), buy(41), sell(42), buy(43), sell(44)];
    expect(verdictFor(result({ trades: t, lead: -900 }), run())).toBe('cashGang');
  });
  it('bagholder otherwise', () => {
    expect(verdictFor(result({ trades: [sell(31), buy(38)], lead: -700 }), run())).toBe('bagholder');
  });
});

describe('borrowed hold (R9)', () => {
  const held = (share: number): BorrowedResult => ({
    ...result({ trades: [], lead: 6000, final: 16000, share }),
    wipedAt: null,
  });
  it('a borrowed run with no trades is diamond even when ahead, and even with share >= 0.5', () => {
    expect(verdictFor(held(0.3), run())).toBe('diamond');
    expect(verdictFor(held(0.8), run())).toBe('diamond');
  });
  it('wiped still wins over a no-trade borrowed hold', () => {
    const wiped: BorrowedResult = { ...held(0.8), wipedAt: 30 };
    expect(verdictFor(wiped, run())).toBe('marginCalled');
  });
  it('borrowed diamond copy is borrowed-specific when ahead', () => {
    expect(verdictCopy('diamond', held(0.3), run())).toEqual({
      title: 'Diamond hands',
      line: 'Borrowed three times over and held on',
      headline: 'Local investor borrows big, holds on, gets away with it',
    });
  });
  it('a borrowed no-trade result with lead 0 keeps the plain diamond copy', () => {
    const r: BorrowedResult = { ...result({ trades: [] }), wipedAt: null };
    expect(verdictCopy('diamond', r, run()).line).toBe('Did nothing at all');
  });
  it('a plain result with no trades keeps the plain diamond copy', () => {
    expect(verdictCopy('diamond', result({ trades: [] }), run()).line).toBe('Did nothing at all');
  });
});

describe('verdictCopy', () => {
  const r0 = result({ trades: [] });
  it('uses the spec 8.3 title, line and headline', () => {
    expect(verdictCopy('diamond', r0, run())).toEqual({
      title: 'Diamond hands',
      line: 'Did nothing at all',
      headline: 'Local investor does absolutely nothing, finishes level',
    });
    expect(verdictCopy('marginCalled', r0, run())).toEqual({
      title: 'Margin called',
      line: 'Borrowed three times over and lost the lot',
      headline: 'Local investor gets margin called',
    });
    expect(verdictCopy('bigShort', r0, run())).toEqual({
      title: 'Big Short energy',
      line: 'Out before the fall and back in near the low',
      headline: 'Local investor dodges the worst of the crash',
    });
    expect(verdictCopy('nerves', r0, run())).toEqual({
      title: 'Nerves of steel',
      line: 'Traded, and still came out in front',
      headline: 'Local investor beats the market, tells everyone',
    });
    expect(verdictCopy('shakenOut', r0, run())).toEqual({
      title: 'Shaken out',
      line: 'Sold a dip that bounced straight back',
      headline: 'Local investor flees a crash that never came',
    });
    expect(verdictCopy('cashGang', r0, run())).toEqual({
      title: 'Cash gang',
      line: 'Sold, and watched the whole recovery from the sidelines',
      headline: 'Local investor still waiting for the right moment',
    });
    expect(verdictCopy('bagholder', r0, run())).toEqual({
      title: 'Bagholder',
      line: 'Held most of the way down, then blinked',
      headline: 'Local investor blinks at the wrong moment',
    });
  });
  it('bagholder: an early first sale bought back higher reads "Sold early" (R34), headline kept', () => {
    // run(): the low is day 20, so the first third of the fall is days 0 to 6.
    const early = verdictCopy('bagholder', result({ trades: [sell(3), buy(40)], lead: -300 }), run());
    expect(early).toEqual({
      title: 'Bagholder',
      line: 'Sold early, then bought back higher',
      headline: 'Local investor blinks at the wrong moment',
    });
    // Sold later in the fall: the old line.
    expect(verdictCopy('bagholder', result({ trades: [sell(10), buy(40)], lead: -300 }), run()).line).toBe(
      'Held most of the way down, then blinked',
    );
    // Sold early but bought back lower: the old line.
    expect(verdictCopy('bagholder', result({ trades: [sell(3), buy(15)], lead: -300 }), run()).line).toBe(
      'Held most of the way down, then blinked',
    );
  });
  it('paper headline counts days before the bottom in words', () => {
    const r = result({ trades: [sell(17), buy(30)], lead: -1 });
    const c = verdictCopy('paper', r, run());
    expect(c.headline).toBe('Local investor sells three days before the bottom');
    expect(c.title).toBe('Paper hands');
    expect(c.line).toBe('Sold near the low, then bought back higher');
  });
  it('paper headline: one day, after the bottom, on the day, digits above twelve', () => {
    expect(verdictCopy('paper', result({ trades: [sell(19), buy(30)] }), run()).headline).toBe(
      'Local investor sells a day before the bottom',
    );
    expect(verdictCopy('paper', result({ trades: [sell(23), buy(35)] }), run()).headline).toBe(
      'Local investor sells three days after the bottom',
    );
    expect(verdictCopy('paper', result({ trades: [sell(21), buy(35)] }), run()).headline).toBe(
      'Local investor sells a day after the bottom',
    );
    expect(verdictCopy('paper', result({ trades: [sell(20), buy(35)] }), run()).headline).toBe(
      'Local investor sells on the day of the bottom',
    );
  });
  it('overtrader headline uses the trade count: words to twelve, digits above', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? sell(i + 40) : buy(i + 40)));
    expect(verdictCopy('overtrader', result({ trades: mk(9) }), run()).headline).toBe(
      'Local investor trades nine times, loses to a houseplant',
    );
    expect(verdictCopy('overtrader', result({ trades: mk(13) }), run()).headline).toBe(
      'Local investor trades 13 times, loses to a houseplant',
    );
    const c = verdictCopy('overtrader', result({ trades: mk(9) }), run());
    expect(c.title).toBe('Overtrader');
    expect(c.line).toBe('In and out, and behind for it');
  });
});
