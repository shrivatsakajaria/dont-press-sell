import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { RunResult } from '../../src/engine/types';
import { bankPending, borrowedUnlocked, challengeFits, currentStreak, doubleUp, settle, verifiedChallenge } from '../../src/game/flow';
import { getPot, resetPot } from '../../src/game/pot';
import { getRecord } from '../../src/store/record';
import { resetCells } from '../../src/store/store';

const g = globalThis as unknown as { localStorage?: unknown };
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
function throwingStorage() {
  const no = () => {
    throw new Error('blocked');
  };
  return { getItem: no, setItem: no, removeItem: no };
}

const result = (lead: number, final = 10750 + lead, extra: Partial<RunResult> = {}): RunResult => ({
  final, holderFinal: final - lead, perfectFinal: 20000, lead, share: 0, balances: [10000, final], daysInCash: 0, trades: [], ...extra,
});
const base = { runId: 'c2007', verdict: 'nerves' as const, lowIndex: 300, start: 10000, borrowed: false };

for (const [name, make] of [['with storage', memoryStorage], ['with storage throwing', throwingStorage]] as const) {
  describe(`settle (${name})`, () => {
    beforeEach(() => {
      g.localStorage = make();
      resetCells();
      resetPot();
    });
    afterEach(() => {
      delete g.localStorage;
      resetCells();
    });

    test('a mystery loss takes the lead off the pot at once and offers nothing', () => {
      const s = settle({ ...base, mode: 'mystery', result: result(-2300) });
      expect(s.blind).toBe(true);
      expect(s.double).toBeNull();
      expect(s.pot).toEqual({ pot: 7700, tonight: -2300 });
      expect(getPot().pot).toBe(7700);
    });

    test('a mystery win offers double or nothing; the pot shows the win but settles only when banked', () => {
      const s = settle({ ...base, mode: 'mystery', result: result(1640, 12390) });
      expect(s.double).toEqual({ net: 1640, final: 12390, wins: 1 });
      expect(s.pot).toEqual({ pot: 11640, tonight: 1640 });
      expect(getPot().pot).toBe(10000);
      expect(bankPending()).toEqual({ pot: 11640, tonight: 1640, bust: false });
      expect(getPot().pot).toBe(11640);
      expect(getRecord().bestStreak).toBe(1);
      expect(bankPending()).toBeNull();
    });

    test('double or nothing carries the final as the next start; a loss settles the whole streak once', () => {
      settle({ ...base, mode: 'mystery', result: result(1640, 12390) });
      expect(doubleUp().start).toBe(12390);
      expect(currentStreak().start).toBe(12390);
      const two = settle({ ...base, start: 12390, mode: 'mystery', result: result(1000, 14000) });
      expect(two.double?.wins).toBe(2);
      // I1: "Bank $N" banks the whole streak's net, so the figure is the net, not this run's lead.
      expect(two.double?.net).toBe(2640);
      doubleUp();
      const lost = settle({ ...base, start: 14000, mode: 'mystery', result: result(-3000, 12000) });
      expect(lost.double).toBeNull();
      expect(getPot().pot).toBe(10000 + 1640 + 1000 - 3000);
      expect(getRecord().bestStreak).toBe(2);
      expect(currentStreak().wins).toBe(0);
      expect(currentStreak().start).toBe(10000);
    });

    test('a streak left in the middle of a double-or-nothing run is banked at the next visit', () => {
      settle({ ...base, mode: 'mystery', result: result(1640, 12390) });
      doubleUp();
      expect(bankPending()).toEqual({ pot: 11640, tonight: 1640, bust: false });
      expect(currentStreak()).toEqual({ wins: 0, start: 10000, final: null, net: 0 });
    });

    test('practice runs never move the pot or offer the double', () => {
      for (const mode of ['rematch', 'picked'] as const) {
        const s = settle({ ...base, mode, result: result(5000) });
        expect(s.blind).toBe(false);
        expect(s.double).toBeNull();
      }
      expect(getPot().pot).toBe(10000);
    });

    test('the first daily of a date counts and gives the days in a row; it never offers the double', () => {
      const s = settle({ ...base, mode: 'daily', date: '2026-11-21', result: result(500) });
      expect(s.blind).toBe(true);
      expect(s.double).toBeNull();
      expect(s.daysInRow).toBe(1);
      expect(getPot().pot).toBe(10500);
    });

    test('a pot taken to zero is bust and starts again', () => {
      const s = settle({ ...base, mode: 'challenge', result: result(-10000) });
      expect(s.bust).toBe(true);
      expect(s.pot.pot).toBe(10000);
      expect(getPot().busts).toBe(1);
    });

    test('the eighth win in a row prints the island page', () => {
      let s = settle({ ...base, mode: 'mystery', result: result(100) });
      for (let i = 2; i <= 8; i++) {
        doubleUp();
        s = settle({ ...base, mode: 'mystery', result: result(100) });
      }
      expect(s.double?.wins).toBe(8);
      expect(s.island).toBe(true);
    });

    test('a first blind win unlocks borrowed money; practice wins and blind losses do not', () => {
      expect(borrowedUnlocked()).toBe(false);
      settle({ ...base, mode: 'picked', result: result(900) });
      settle({ ...base, mode: 'challenge', result: result(-900) });
      expect(borrowedUnlocked()).toBe(false);
      settle({ ...base, mode: 'challenge', result: result(900) });
      expect(borrowedUnlocked()).toBe(true);
    });

    test('a borrowed run settles at once, never offers the double, and a wipe-out costs the pot $10,000', () => {
      const won = settle({ ...base, borrowed: true, mode: 'mystery', result: result(1500) });
      expect(won.double).toBeNull();
      expect(getPot().pot).toBe(11500);
      const wiped = { ...result(-6000, 0), wipedAt: 40 };
      settle({ ...base, borrowed: true, mode: 'mystery', result: wiped });
      expect(getPot().pot).toBe(1500);
    });
  });
}

describe('challengeFits', () => {
  const c = (days: number[]) => ({ runId: 'c2007', final: 7150, trades: days.map((d, i) => ({ dayIndex: d, side: (i % 2 ? 'buy' : 'sell') as 'buy' | 'sell' })) });
  test('trades inside the run fit; a trade on or beyond the last day does not', () => {
    expect(challengeFits(c([3, 40]), 100)).toBe(true);
    expect(challengeFits(c([]), 100)).toBe(true);
    expect(challengeFits(c([3, 99]), 100)).toBe(true);
    expect(challengeFits(c([3, 100]), 100)).toBe(false);
    expect(challengeFits(c([3, 5000]), 100)).toBe(false);
  });
});

describe('verifiedChallenge (I5)', () => {
  const closes = [100, 90, 80, 100, 107.5];
  const c = (final: number, days: number[]) => ({
    runId: 'c2007', final, trades: days.map((d, i) => ({ dayIndex: d, side: (i % 2 ? 'buy' : 'sell') as 'buy' | 'sell' })),
  });
  test('the score to beat is recomputed from the run and the trades; the encoded final is ignored', () => {
    // Sold at 90, back in at 80: 9,000 -> 12,093.75 at the end.
    const forged = verifiedChallenge(c(1_000_000_000, [1, 2]), closes)!;
    expect(forged.final).toBe(12094);
    expect(forged.trades).toEqual([{ dayIndex: 1, side: 'sell' }, { dayIndex: 2, side: 'buy' }]);
    expect(verifiedChallenge(c(5, []), closes)!.final).toBe(10750);
  });
  test('a code whose trades do not fit the run is rejected', () => {
    expect(verifiedChallenge(c(9000, [1, 5]), closes)).toBeNull();
  });
});
