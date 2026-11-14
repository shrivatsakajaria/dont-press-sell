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

const res = (_start: number, final: number, holder: number) => ({ final, lead: final - holder });

describe('streak state machine', () => {
  test('starts from 10000 with no wins', () => {
    expect(initialStreak()).toEqual({ wins: 0, start: START_AMOUNT, final: null, net: 0 });
  });
  test('offered only when lead over the holder > 0 in a mystery run', () => {
    expect(afterRun(initialStreak(), 'mystery', { final: 11640, lead: 1640 }).offer).toBe(true);
    expect(afterRun(initialStreak(), 'mystery', { final: 10000, lead: 0 }).offer).toBe(false);
    expect(afterRun(initialStreak(), 'mystery', { final: 9000, lead: -500 }).offer).toBe(false);
    for (const mode of ['daily', 'picked', 'rematch', 'challenge'] as const) {
      expect(afterRun(initialStreak(), mode, { final: 11640, lead: 1640 }).offer).toBe(false);
    }
  });
  test('a scare where the holder gains more: final above start but lead below zero ends it', () => {
    const r = afterRun(initialStreak(), 'mystery', res(10000, 10300, 10700));
    expect(r.offer).toBe(false);
    expect(r.settle).toBe(-400);
  });
  test('double carries the previous final as the next start and accumulates net lead', () => {
    const a = afterRun(initialStreak(), 'mystery', { final: 11640, lead: 1640 });
    expect(a.state.wins).toBe(1);
    const next = doubleDown(a.state);
    expect(next).toEqual({ wins: 1, start: 11640, final: null, net: 1640 });
    const b = afterRun(next, 'mystery', { final: 15400, lead: 500 });
    expect(b.offer).toBe(true);
    expect(b.state.wins).toBe(2);
    expect(b.state.net).toBe(2140);
  });
  test('lead of zero or less ends the streak; settle is the net including the last run', () => {
    let s = afterRun(initialStreak(), 'mystery', { final: 11000, lead: 1000 }).state;
    s = doubleDown(s);
    const lost = afterRun(s, 'mystery', { final: 10990, lead: -10 });
    expect(lost).toMatchObject({ offer: false, ended: true, bestStreak: 1, settle: 990 });
    expect(lost.state).toEqual(initialStreak());
    expect(afterRun(s, 'mystery', { final: 11000, lead: 0 }).ended).toBe(true);
  });
  test('a single losing mystery run settles its own lead and is not an ended streak', () => {
    const r = afterRun(initialStreak(), 'mystery', { final: 9000, lead: -700 });
    expect(r).toMatchObject({ ended: false, bestStreak: 0, settle: -700 });
  });
  test('bank ends the streak, reports wins and the net to settle', () => {
    let s = afterRun(initialStreak(), 'mystery', { final: 11000, lead: 1000 }).state;
    s = doubleDown(s);
    s = afterRun(s, 'mystery', { final: 11500, lead: 500 }).state;
    expect(bank(s)).toEqual({ state: initialStreak(), bestStreak: 2, settle: 1500 });
  });
  test('a practice run leaves the streak alone', () => {
    const s = afterRun(initialStreak(), 'mystery', { final: 11000, lead: 1000 }).state;
    expect(afterRun(s, 'rematch', { final: 12000, lead: 2000 })).toEqual({
      state: s, offer: false, ended: false, bestStreak: 0, settle: null,
    });
  });
  test('doubleDown without a pending win throws', () => {
    expect(() => doubleDown(initialStreak())).toThrow();
  });
});
