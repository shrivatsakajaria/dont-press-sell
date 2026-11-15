import { describe, expect, it } from 'vitest';
import { nearMisses } from '../../src/engine/nearmiss';
import type { BorrowedResult, RunData, RunResult, Trade } from '../../src/engine/types';

// Worst day: index 3 (80 / 95). Best day: index 5 (120 / 85).
const closes = [100, 90, 95, 80, 85, 120, 110, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124];
// The fall (days shown one by one) runs to index 8 by default, so both days are in it.
function runData(lowIndex = 3, fallEndIndex = 8): RunData {
  return {
    id: 'x',
    kind: 'crash',
    pickName: 'Test',
    revealLine: 'That was test',
    dates: closes.map((_, i) => `2000-02-${String(i + 1).padStart(2, '0')}`),
    closes,
    lowIndex,
    fallEndIndex,
  };
}
// A run whose lowest close really is at index 14 (for the "before the bottom" window).
function runLow14(): RunData {
  const c = Array.from({ length: 30 }, (_, i) => (i <= 14 ? 100 - i : 86 + (i - 14)));
  return {
    id: 'y',
    kind: 'crash',
    pickName: 'Test',
    revealLine: 'That was test',
    dates: c.map((_, i) => `2000-03-${String(i + 1).padStart(2, '0')}`),
    closes: c,
    lowIndex: 14,
    fallEndIndex: 14,
  };
}
const sell = (dayIndex: number): Trade => ({ dayIndex, side: 'sell' });
const buy = (dayIndex: number): Trade => ({ dayIndex, side: 'buy' });
function res(trades: Trade[], o: Partial<RunResult> = {}): RunResult {
  const final = o.final ?? 10000;
  const perfectFinal = o.perfectFinal ?? 15000;
  const lead = final - 10000;
  return {
    final,
    holderFinal: 10000,
    perfectFinal,
    lead,
    share: lead / (perfectFinal - 10000),
    balances: [10000, final],
    daysInCash: 0,
    trades,
    ...o,
  };
}
const joined = (r: RunResult, d: RunData) => nearMisses(r, d).join('|');

describe('nearMisses', () => {
  it('a wiped-out run gets no near-miss lines (R10)', () => {
    const wiped: BorrowedResult = { ...res([]), wipedAt: 2 };
    expect(nearMisses(wiped, runData())).toEqual([]);
    const wiped2: BorrowedResult = { ...res([sell(1), buy(5)], { daysInCash: 4 }), wipedAt: 7 };
    expect(nearMisses(wiped2, runData())).toEqual([]);
  });
  it('a borrowed run that was not wiped still gets lines', () => {
    const ok: BorrowedResult = { ...res([]), wipedAt: null };
    expect(nearMisses(ok, runData())).toEqual(['Held through day 4, the worst day of the run']);
  });

  it('a player who did nothing only held through the worst day', () => {
    expect(nearMisses(res([]), runData())).toEqual(['Held through day 4, the worst day of the run']);
  });

  it('Sold N days before the bottom, only within 1 to 10 days', () => {
    const r = runLow14();
    expect(nearMisses(res([sell(11)]), r)).toContain('Sold 3 days before the bottom');
    expect(nearMisses(res([sell(13)]), r)).toContain('Sold 1 day before the bottom');
    expect(joined(res([sell(4)]), r)).toContain('Sold 10 days before the bottom');
    expect(joined(res([sell(3)]), r)).not.toContain('before the bottom');
    expect(joined(res([sell(14)]), r)).not.toContain('before the bottom');
    expect(joined(res([sell(16)]), r)).not.toContain('before the bottom');
  });

  it('Bought back N days after the bottom, only within 1 to 10 days', () => {
    const r = runData(3);
    expect(nearMisses(res([sell(1), buy(5)]), r)).toContain('Bought back 2 days after the bottom');
    expect(nearMisses(res([sell(1), buy(4)]), r)).toContain('Bought back 1 day after the bottom');
    expect(joined(res([sell(1), buy(3)]), r)).not.toContain('Bought back');
    expect(joined(res([sell(1), buy(14)]), r)).not.toContain('Bought back');
  });

  it('In cash on day 6, the best day of the run', () => {
    expect(nearMisses(res([sell(2), buy(6)]), runData())).toContain('In cash on day 6, the best day of the run');
    expect(joined(res([sell(5), buy(6)]), runData())).not.toContain('best day');
    expect(joined(res([sell(2), buy(5)]), runData())).not.toContain('best day');
    expect(joined(res([]), runData())).not.toContain('best day');
    expect(nearMisses(res([sell(2)]), runData())).toContain('In cash on day 6, the best day of the run');
  });

  it('names no day after the fall: the fast-forward samples days, so the player never saw them (r2 review M1)', () => {
    // fallEndIndex 4: days 0..3 are the fall. The best day (index 5) is in the fast-forward.
    expect(joined(res([sell(2)]), runData(3, 4))).not.toContain('best day');
    expect(nearMisses(res([]), runData(3, 4))).toContain('Held through day 4, the worst day of the run');
    // fallEndIndex 3: the worst day (index 3) is the first forward day. No line: a lesser fall day is not "the worst".
    expect(joined(res([]), runData(3, 3))).not.toContain('worst day');
  });

  it('R49: buying back at the close of the worst day is not holding through it (panel, 2020)', () => {
    // Out from day 2 to the close of day 4 (index 3): the fall from 95 to 80 happened while in cash.
    expect(joined(res([sell(1), buy(3)]), runData())).not.toContain('worst day');
  });

  it('R49: the line names the day, as the play screen numbered it (Day N = index + 1)', () => {
    expect(nearMisses(res([]), runData())).toContain('Held through day 4, the worst day of the run');
  });

  it('Held through day 4, the worst day of the run', () => {
    expect(nearMisses(res([sell(5), buy(8)]), runData())).toContain('Held through day 4, the worst day of the run');
    expect(joined(res([sell(3), buy(8)]), runData())).not.toContain('worst day');
    expect(joined(res([sell(1), buy(8)]), runData())).not.toContain('worst day');
    expect(nearMisses(res([sell(1), buy(2)]), runData())).toContain('Held through day 4, the worst day of the run');
  });

  it('time out of the market in plain words, from the dates', () => {
    // runData dates: 2000-02-01 onwards, one calendar day per index.
    expect(nearMisses(res([sell(5), buy(8)], { daysInCash: 3 }), runData())).toContain('Out of the market for three days');
    expect(nearMisses(res([sell(5), buy(6)], { daysInCash: 1 }), runData())).toContain('Out of the market for one day');
    expect(nearMisses(res([sell(1), buy(10)], { daysInCash: 9 }), runData())).toContain('Out of the market for one week and two days');
    // Two spells add up.
    expect(nearMisses(res([sell(1), buy(4), sell(10), buy(14)], { daysInCash: 7 }), runData())).toContain(
      'Out of the market for one week',
    );
    // Never bought back: to the last day of the run (index 21).
    expect(nearMisses(res([sell(7)], { daysInCash: 15 }), runData())).toContain('Out of the market for two weeks');
    expect(joined(res([sell(5), buy(6)], { daysInCash: 0 }), runData())).not.toContain('Out of the market');
    expect(joined(res([]), runData())).not.toContain('Out of the market');
    expect(joined(res([sell(5), buy(8)], { daysInCash: 3 }), runData())).not.toContain('in cash');
  });

  it('One trade from perfect: exactly one sale and one buy, and behind perfect', () => {
    const line = 'One trade from perfect: perfect timing made $17,900';
    const base = { perfectFinal: 17900, final: 12000 };
    expect(nearMisses(res([sell(1), buy(5)], base), runData())).toContain(line);
    expect(joined(res([sell(1)], base), runData())).not.toContain('One trade');
    expect(joined(res([sell(1), buy(5), sell(7), buy(9)], base), runData())).not.toContain('One trade');
    expect(joined(res([sell(1), buy(5)], { perfectFinal: 17900, final: 17900 }), runData())).not.toContain('One trade');
  });

  it('keeps spec order', () => {
    const out = nearMisses(res([sell(1), buy(5)], { daysInCash: 4, perfectFinal: 17900, final: 12000 }), runData());
    expect(out).toEqual([
      'Sold 2 days before the bottom',
      'Bought back 2 days after the bottom',
      'Out of the market for four days',
      'One trade from perfect: perfect timing made $17,900',
    ]);
  });
});
