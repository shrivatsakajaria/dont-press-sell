import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  dailyStreak,
  daysInRowText,
  getLastRun,
  getRecord,
  recordLine,
  recordRun,
  recordStreak,
} from '../../src/store/record';
import { resetCells } from '../../src/store/store';
import type { RunResult } from '../../src/engine/types';

const g = globalThis as unknown as { localStorage?: unknown };

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

beforeEach(() => {
  g.localStorage = memoryStorage();
  resetCells();
});
afterEach(() => {
  delete g.localStorage;
  resetCells();
});

const result = (lead: number, firstSell: number | null = null): RunResult => ({
  final: 10000 + lead,
  holderFinal: 10000,
  perfectFinal: 12000,
  lead,
  share: 0,
  balances: [10000, 9000.4, 10000 + lead],
  daysInCash: 0,
  trades: firstSell === null ? [] : [{ dayIndex: firstSell, side: 'sell' }],
});

describe('recordRun', () => {
  test('only mystery, a first daily and challenge add titles', () => {
    recordRun('mystery', 'c1929', result(100), 'diamond');
    recordRun('daily', 'c1987', result(100), 'nerves', { date: '2026-11-21' });
    recordRun('challenge', 'c2000', result(100), 'paper');
    recordRun('rematch', 'c2007', result(100), 'bagholder');
    recordRun('picked', 'c2020', result(100), 'cashGang');
    expect(getRecord().titles.sort()).toEqual(['diamond', 'nerves', 'paper']);
  });
  test('a replay of the same day does not count as the daily result', () => {
    recordRun('daily', 'c1987', result(100), 'nerves', { date: '2026-11-21' });
    recordRun('daily', 'c1987', result(100), 'bigShort', { date: '2026-11-21' });
    const r = getRecord();
    expect(r.titles).toEqual(['nerves']);
    expect(r.games).toBe(1);
  });
  test('played ids are kept for every mode, without duplicates', () => {
    recordRun('picked', 'c2020', result(-5), 'bagholder');
    recordRun('rematch', 'c2020', result(5), 'bagholder');
    recordRun('mystery', 's2010', result(5), 'bagholder');
    expect(getRecord().played.sort()).toEqual(['c2020', 's2010']);
  });
  test('games and wins count blind runs only; a win is lead above zero', () => {
    recordRun('mystery', 'c1929', result(100), 'diamond');
    recordRun('mystery', 'c1987', result(0), 'diamond');
    recordRun('challenge', 'c2000', result(-100), 'paper');
    recordRun('rematch', 'c2007', result(900), 'diamond');
    const r = getRecord();
    expect(r.games).toBe(3);
    expect(r.wins).toBe(1);
  });
  test('sold too early: first sale before the low and finished behind', () => {
    recordRun('mystery', 'c1929', result(-50, 10), 'paper', { lowIndex: 40 });
    recordRun('mystery', 'c1987', result(-50, 60), 'paper', { lowIndex: 40 }); // sold after the low
    recordRun('mystery', 'c2000', result(80, 10), 'paper', { lowIndex: 40 }); // finished ahead
    recordRun('mystery', 'c2007', result(-50), 'paper', { lowIndex: 40 }); // never sold
    recordRun('rematch', 'c2020', result(-50, 10), 'paper', { lowIndex: 40 }); // practice
    expect(getRecord().soldTooEarly).toBe(1);
  });
  test('last run per crash is kept for the rematch', () => {
    recordRun('mystery', 'c1929', result(100, 2), 'diamond');
    const last = getLastRun('c1929');
    expect(last).toEqual({ balances: [10000, 9000, 10100], trades: [{ dayIndex: 2, side: 'sell' }], final: 10100 });
    expect(getLastRun('c1987')).toBeNull();
  });
  test('survives a reload (state comes back from storage)', () => {
    recordRun('mystery', 'c1929', result(100), 'diamond');
    resetCells();
    expect(getRecord().games).toBe(1);
  });
  test('the record line reads in plain words', () => {
    expect(recordLine({ games: 9, wins: 3, soldTooEarly: 4 })).toBe('9 games, 3 wins, sold too early 4 times');
    expect(recordLine({ games: 1, wins: 1, soldTooEarly: 1 })).toBe('1 game, 1 win, sold too early 1 time');
  });
  test('works with storage blocked', () => {
    delete g.localStorage;
    resetCells();
    recordRun('mystery', 'c1929', result(100), 'diamond');
    recordRun('mystery', 'c1987', result(100), 'diamond');
    expect(getRecord().games).toBe(2);
  });
});

describe('bestStreak', () => {
  test('keeps the maximum', () => {
    expect(getRecord().bestStreak).toBe(0);
    recordStreak(3);
    recordStreak(2);
    expect(getRecord().bestStreak).toBe(3);
  });
});

describe('dailyStreak', () => {
  test('three consecutive dates give 1, 2, 3 and a repeat gives the same', () => {
    expect(dailyStreak('2026-12-30')).toBe(1);
    expect(dailyStreak('2026-12-31')).toBe(2);
    expect(dailyStreak('2026-12-31')).toBe(2);
    expect(dailyStreak('2027-01-01')).toBe(3);
  });
  test('a missed day starts again at one', () => {
    dailyStreak('2026-11-21');
    dailyStreak('2026-11-22');
    expect(dailyStreak('2026-11-24')).toBe(1);
  });
  test('accumulates with storage blocked', () => {
    delete g.localStorage;
    resetCells();
    expect(dailyStreak('2026-11-21')).toBe(1);
    expect(dailyStreak('2026-11-22')).toBe(2);
  });
  test('the line shows only from two', () => {
    expect(daysInRowText(1)).toBeNull();
    expect(daysInRowText(2)).toBe('2 days in a row');
  });
});
