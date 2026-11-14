import { describe, expect, test } from 'vitest';
import { START_AMOUNT, afterRun, bank, doubleDown, initialStreak, ladder } from '../../src/game/streak';

describe('ladder', () => {
  test('rungs are 1, 2, 3, 5, 8', () => {
    expect(ladder(0).rungs).toEqual([1, 2, 3, 5, 8]);
  });
  test('zero wins', () => {
    expect(ladder(0)).toEqual({ rungs: [1, 2, 3, 5, 8], reached: 0, next: 1, title: null });
  });
  test('titles at each rung', () => {
    expect(ladder(1).title).toBe("Beginner's luck");
    expect(ladder(2).title).toBe('Hot hand');
    expect(ladder(3)).toMatchObject({ reached: 3, next: 5, title: 'Shark' });
    expect(ladder(4)).toMatchObject({ reached: 3, next: 5, title: 'Shark' });
    expect(ladder(5)).toMatchObject({ reached: 5, next: 8, title: 'Whale' });
    expect(ladder(8)).toMatchObject({ reached: 8, next: null, title: 'Untouchable' });
    expect(ladder(12)).toMatchObject({ reached: 8, next: null, title: 'Untouchable' });
  });
});

describe('streak state machine', () => {
  test('starts from 10000 with no wins', () => {
    expect(initialStreak()).toEqual({ wins: 0, start: START_AMOUNT, final: null });
  });
  test('double or nothing is offered only when lead > 0 in a mystery run', () => {
    expect(afterRun(initialStreak(), 'mystery', 10000, 11640).offer).toBe(true);
    expect(afterRun(initialStreak(), 'mystery', 10000, 10000).offer).toBe(false);
    expect(afterRun(initialStreak(), 'mystery', 10000, 9000).offer).toBe(false);
    for (const mode of ['daily', 'picked', 'rematch', 'challenge'] as const) {
      expect(afterRun(initialStreak(), mode, 10000, 11640).offer).toBe(false);
    }
  });
  test('double carries the previous final as the next start', () => {
    const a = afterRun(initialStreak(), 'mystery', 10000, 11640);
    expect(a.state.wins).toBe(1);
    const next = doubleDown(a.state);
    expect(next.start).toBe(11640);
    expect(next.wins).toBe(1);
    expect(next.final).toBeNull();
    const b = afterRun(next, 'mystery', next.start, 15400);
    expect(b.offer).toBe(true);
    expect(b.state.wins).toBe(2);
  });
  test('lead of zero or less ends the streak and reports the best', () => {
    let s = afterRun(initialStreak(), 'mystery', 10000, 11000).state;
    s = doubleDown(s);
    const lost = afterRun(s, 'mystery', s.start, s.start - 10);
    expect(lost.offer).toBe(false);
    expect(lost.ended).toBe(true);
    expect(lost.bestStreak).toBe(1);
    expect(lost.state).toEqual(initialStreak());
    const level = afterRun(s, 'mystery', s.start, s.start);
    expect(level.ended).toBe(true);
  });
  test('bank ends the streak and reports the wins to record', () => {
    let s = afterRun(initialStreak(), 'mystery', 10000, 11000).state;
    s = doubleDown(s);
    s = afterRun(s, 'mystery', s.start, s.start + 500).state;
    expect(bank(s)).toEqual({ state: initialStreak(), bestStreak: 2 });
  });
  test('a practice run leaves the streak alone', () => {
    const s = afterRun(initialStreak(), 'mystery', 10000, 11000).state;
    expect(afterRun(s, 'rematch', 10000, 12000)).toEqual({ state: s, offer: false, ended: false, bestStreak: 0 });
  });
  test('doubleDown without a pending win throws', () => {
    expect(() => doubleDown(initialStreak())).toThrow();
  });
});
