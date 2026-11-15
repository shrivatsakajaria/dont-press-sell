import { describe, expect, test, vi } from 'vitest';
import { playCues, type CueInput } from '../../src/fx/cues';
import type { Sfx } from '../../src/fx/sound';

function fake() {
  const sfx = { unlock: vi.fn(), tick: vi.fn(), thud: vi.fn(), till: vi.fn(), rise: vi.fn(), counter: vi.fn(), payout: vi.fn(), setMuted: vi.fn() } satisfies Sfx;
  return { sfx, buzz: vi.fn() };
}
const base: CueInput = {
  newStep: true, trade: null, holdMs: 250, worst: false, invested: true, phase: 'fall', leadNow: 0, start: 10000, forwardProgress: 0,
};

describe('playCues', () => {
  test('an ordinary step ticks, faster as the step is shorter', () => {
    const f = fake();
    playCues(f.sfx, f.buzz, base);
    expect(f.sfx.tick).toHaveBeenCalledWith(4);
    expect(f.buzz).not.toHaveBeenCalled();
  });
  test('a worst day thuds and buzzes', () => {
    const f = fake();
    playCues(f.sfx, f.buzz, { ...base, worst: true });
    expect(f.sfx.thud).toHaveBeenCalled();
    expect(f.buzz).toHaveBeenCalled();
    expect(f.sfx.tick).not.toHaveBeenCalled();
  });
  test('a trade rings the till and buzzes, without a step sound', () => {
    const f = fake();
    playCues(f.sfx, f.buzz, { ...base, newStep: false, trade: 'sell' });
    expect(f.sfx.till).toHaveBeenCalled();
    expect(f.buzz).toHaveBeenCalled();
    expect(f.sfx.tick).not.toHaveBeenCalled();
  });
  test('in cash the counter tone rises with the lead', () => {
    const f = fake();
    playCues(f.sfx, f.buzz, { ...base, invested: false, leadNow: -1000 });
    playCues(f.sfx, f.buzz, { ...base, invested: false, leadNow: 1000 });
    const [a, b] = f.sfx.counter.mock.calls.map((c) => c[0]);
    expect(b).toBeGreaterThan(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThanOrEqual(1);
  });
  test('the fast-forward rises while holding', () => {
    const f = fake();
    playCues(f.sfx, f.buzz, { ...base, phase: 'forward', forwardProgress: 0.5 });
    expect(f.sfx.rise).toHaveBeenCalledWith(0.5);
  });
  test('a cheaper buy-back (R41) rings the till, plays the win and buzzes a little longer', () => {
    const f = fake();
    playCues(f.sfx, f.buzz, { ...base, newStep: false, trade: 'buy', win: true });
    expect(f.sfx.till).toHaveBeenCalled();
    expect(f.sfx.payout).toHaveBeenCalledWith(true);
    expect(f.buzz).toHaveBeenCalledWith([40, 60, 40]);
  });
  test('a more expensive buy-back is a plain trade: no win', () => {
    const f = fake();
    playCues(f.sfx, f.buzz, { ...base, newStep: false, trade: 'buy', win: false });
    expect(f.sfx.till).toHaveBeenCalled();
    expect(f.sfx.payout).not.toHaveBeenCalled();
    expect(f.buzz).toHaveBeenCalledWith(40);
  });
  test('a repaint of the same step with no trade is silent', () => {
    const f = fake();
    playCues(f.sfx, f.buzz, { ...base, newStep: false });
    for (const fn of Object.values(f.sfx)) expect(fn).not.toHaveBeenCalled();
  });
});
