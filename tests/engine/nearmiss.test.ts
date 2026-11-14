import { describe, expect, it } from 'vitest';
import { nearMisses } from '../../src/engine/nearmiss';
import type { RunData, RunResult, Trade } from '../../src/engine/types';

// Worst day: index 3 (80 / 95). Best day: index 5 (120 / 85).
const closes = [100, 90, 95, 80, 85, 120, 110, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124];
function runData(lowIndex = 3): RunData {
  return {
    id: 'x',
    kind: 'crash',
    pickName: 'Test',
    revealLine: 'That was test',
    dates: closes.map((_, i) => `2000-02-${String(i + 1).padStart(2, '0')}`),
    closes,
    lowIndex,
    fallEndIndex: lowIndex,
  };
}
const sell = (dayIndex: number): Trade => ({ dayIndex, side: 'sell' });
const buy = (dayIndex: number): Trade => ({ dayIndex, side: 'buy' });
function res(trades: Trade[], o: Partial<RunResult> = {}): RunResult {
  return {
    final: 10000,
    holderFinal: 10000,
    perfectFinal: 15000,
    lead: 0,
    share: 0,
    balances: [],
    daysInCash: 0,
    trades,
    ...o,
  };
}
const joined = (r: RunResult, d: RunData) => nearMisses(r, d).join('|');

describe('nearMisses', () => {
  it('a player who did nothing only held through the worst day', () => {
    expect(nearMisses(res([]), runData())).toEqual(['Held through the worst day of the run']);
  });

  it('Sold N days before the bottom, only within 1 to 10 days', () => {
    const r = runData(14);
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

  it('In cash for the best day of the run', () => {
    expect(nearMisses(res([sell(2), buy(6)]), runData())).toContain('In cash for the best day of the run');
    expect(joined(res([sell(5), buy(6)]), runData())).not.toContain('best day');
    expect(joined(res([sell(2), buy(5)]), runData())).not.toContain('best day');
    expect(joined(res([]), runData())).not.toContain('best day');
    expect(nearMisses(res([sell(2)]), runData())).toContain('In cash for the best day of the run');
  });

  it('Held through the worst day of the run', () => {
    expect(nearMisses(res([sell(5), buy(8)]), runData())).toContain('Held through the worst day of the run');
    expect(joined(res([sell(3), buy(8)]), runData())).not.toContain('worst day');
    expect(joined(res([sell(1), buy(8)]), runData())).not.toContain('worst day');
    expect(nearMisses(res([sell(1), buy(2)]), runData())).toContain('Held through the worst day of the run');
  });

  it('N days in cash, singular and plural, absent at zero', () => {
    expect(nearMisses(res([sell(5), buy(8)], { daysInCash: 62 }), runData())).toContain('62 days in cash');
    expect(nearMisses(res([sell(5), buy(6)], { daysInCash: 1 }), runData())).toContain('1 day in cash');
    expect(joined(res([sell(5), buy(6)], { daysInCash: 0 }), runData())).not.toContain('in cash');
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
      '4 days in cash',
      'One trade from perfect: perfect timing made $17,900',
    ]);
  });
});
