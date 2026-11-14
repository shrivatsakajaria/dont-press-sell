import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunData, RunResult, Trade } from '../../src/engine/types';
import { leadAt, simulate } from '../../src/engine/simulate';
import { buildSchedule, type Step } from '../../src/game/schedule';
import { createSession, type SessionView } from '../../src/game/session';

const run = JSON.parse(
  readFileSync(join(__dirname, '../../data/runs/s1998.prices.json'), 'utf8'),
) as RunData;

/** A tiny hand-made run and schedule for exact checks. */
const tiny: RunData = {
  id: 't',
  kind: 'scare',
  pickName: 't',
  revealLine: 't',
  dates: ['a', 'b', 'c', 'd', 'e', 'f'],
  closes: [100, 90, 80, 85, 100, 108],
  lowIndex: 2,
  fallEndIndex: 4,
};
const tinySteps: Step[] = [
  { dayIndex: 0, holdMs: 200, phase: 'fall', slow: false },
  { dayIndex: 1, holdMs: 800, phase: 'fall', slow: true },
  { dayIndex: 3, holdMs: 200, phase: 'fall', slow: false },
  { dayIndex: 4, holdMs: 300, phase: 'forward', slow: false },
  { dayIndex: 5, holdMs: 300, phase: 'forward', slow: false },
];

function make(r: RunData, steps: Step[]) {
  const views: SessionView[] = [];
  const ends: RunResult[] = [];
  const s = createSession(r, steps, {
    start: 10000,
    onStep: (v) => views.push(v),
    onEnd: (res) => ends.push(res),
  });
  return { s, views, ends };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createSession', () => {
  it('does nothing until start(), then shows step 0', () => {
    const { s, views } = make(tiny, tinySteps);
    vi.advanceTimersByTime(5000);
    expect(views.length).toBe(0);
    s.start();
    expect(views.length).toBe(1);
    expect(views[0]).toMatchObject({ stepIndex: 0, dayIndex: 0, balance: 10000, invested: true, phase: 'fall', slow: false });
    s.destroy();
  });

  it('advances by each step hold', () => {
    const { s } = make(tiny, tinySteps);
    s.start();
    vi.advanceTimersByTime(199);
    expect(s.view().stepIndex).toBe(0);
    vi.advanceTimersByTime(1);
    expect(s.view()).toMatchObject({ stepIndex: 1, dayIndex: 1, slow: true });
    vi.advanceTimersByTime(800);
    expect(s.view()).toMatchObject({ stepIndex: 2, dayIndex: 3 });
    s.destroy();
  });

  it('two presses inside one step make one trade', () => {
    const { s, ends } = make(tiny, tinySteps);
    s.start();
    vi.advanceTimersByTime(200); // step 1, day 1
    s.press();
    s.press();
    s.press();
    expect(s.view().invested).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(ends.length).toBe(1);
    expect(ends[0].trades).toEqual([{ dayIndex: 1, side: 'sell' }]);
  });

  it('a press records the step dayIndex, at the close shown on the button', () => {
    const { s, ends } = make(tiny, tinySteps);
    s.start();
    vi.advanceTimersByTime(200); // day 1
    const before = s.view();
    expect(before.balance).toBeCloseTo(9000); // "Sell for $9,000"
    s.press();
    expect(s.view().balance).toBeCloseTo(9000);
    vi.advanceTimersByTime(800); // step 2 shows day 3 (day 2 skipped)
    s.press(); // buy back at day 3's close
    vi.advanceTimersByTime(5000);
    expect(ends[0].trades).toEqual([
      { dayIndex: 1, side: 'sell' },
      { dayIndex: 3, side: 'buy' },
    ]);
  });

  it('the view tracks market, peak and lead', () => {
    const { s } = make(tiny, tinySteps);
    s.start();
    vi.advanceTimersByTime(200); // day 1
    s.press(); // sell at 9000
    vi.advanceTimersByTime(800); // day 3, market 8500
    const v = s.view();
    expect(v.marketBalance).toBeCloseTo(8500);
    expect(v.balance).toBeCloseTo(9000);
    expect(v.leadNow).toBeCloseTo(leadAt(tiny.closes, [{ dayIndex: 1, side: 'sell' }], 3));
    expect(v.leadNow).toBeCloseTo(500);
    expect(v.peakBalance).toBeCloseTo(10000);
    s.destroy();
  });

  it('peakBalance is the highest balance on the steps shown so far', () => {
    const { s } = make(tiny, tinySteps);
    s.start();
    vi.advanceTimersByTime(200 + 800 + 200 + 300); // day 5 (108)
    expect(s.view().dayIndex).toBe(5);
    expect(s.view().peakBalance).toBeCloseTo(10800);
    s.destroy();
  });

  it('re-sends the view after a press so the button can change', () => {
    const { s, views } = make(tiny, tinySteps);
    s.start();
    s.press();
    expect(views.length).toBe(2);
    expect(views[1]).toMatchObject({ stepIndex: 0, invested: false });
    s.destroy();
  });

  it('pause, then 60 s, then resume continues from the same step with the time left', () => {
    const { s } = make(tiny, tinySteps);
    s.start();
    vi.advanceTimersByTime(200 + 300); // 300 ms into the 800 ms slow step
    expect(s.view().stepIndex).toBe(1);
    s.pause();
    vi.advanceTimersByTime(60_000);
    expect(s.view().stepIndex).toBe(1);
    s.resume();
    vi.advanceTimersByTime(499);
    expect(s.view().stepIndex).toBe(1);
    vi.advanceTimersByTime(1);
    expect(s.view().stepIndex).toBe(2);
    s.destroy();
  });

  it('ignores presses while paused', () => {
    const { s } = make(tiny, tinySteps);
    s.start();
    s.pause();
    s.press();
    expect(s.view().invested).toBe(true);
    s.resume();
    s.press();
    expect(s.view().invested).toBe(false);
    s.destroy();
  });

  it('a press on the final step is honoured and onEnd fires once with simulate(closes, trades)', () => {
    const { s, ends } = make(tiny, tinySteps);
    s.start();
    vi.advanceTimersByTime(200); // day 1
    s.press(); // sell
    vi.advanceTimersByTime(800 + 200 + 300); // final step, day 5
    expect(s.view().stepIndex).toBe(4);
    vi.advanceTimersByTime(299); // the last frame
    s.press(); // buy back on the final step
    expect(ends.length).toBe(0);
    vi.advanceTimersByTime(1);
    expect(ends.length).toBe(1);
    const trades: Trade[] = [
      { dayIndex: 1, side: 'sell' },
      { dayIndex: 5, side: 'buy' },
    ];
    expect(ends[0]).toEqual(simulate(tiny.closes, trades));
    s.press(); // after the end: ignored
    vi.advanceTimersByTime(60_000);
    expect(ends.length).toBe(1);
  });

  it('plays a real run through its real schedule to one consistent result', () => {
    const steps = buildSchedule(run, []);
    const { s, views, ends } = make(run, steps);
    s.start();
    const pressAt = new Set([3, 4, 20, 21, 22, 50]);
    let step = 0;
    let t = 0;
    while (ends.length === 0) {
      if (pressAt.has(step)) {
        s.press();
        s.press(); // a double tap
      }
      t += steps[step].holdMs;
      vi.advanceTimersByTime(steps[step].holdMs);
      step++;
    }
    expect(step).toBe(steps.length);
    expect(ends.length).toBe(1);
    const res = ends[0];
    expect(res.trades.map((x) => x.dayIndex)).toEqual([3, 4, 20, 21, 22, 50].map((i) => steps[i].dayIndex));
    expect(res).toEqual(simulate(run.closes, res.trades));
    // Every step was shown in order.
    const shown = views.map((v) => v.stepIndex).filter((x, i, a) => a.indexOf(x) === i);
    expect(shown).toEqual(steps.map((_, i) => i));
    expect(t).toBe(steps.reduce((a, x) => a + x.holdMs, 0));
  });

  it('uses opts.simulateFn for the result when given', () => {
    const fake = vi.fn((closes: number[], trades: Trade[], start?: number) => simulate(closes, trades, start));
    const ends: RunResult[] = [];
    const s = createSession(tiny, tinySteps, { start: 5000, onStep: () => {}, onEnd: (r) => ends.push(r), simulateFn: fake });
    s.start();
    expect(s.view().balance).toBeCloseTo(5000);
    vi.advanceTimersByTime(10_000);
    expect(fake).toHaveBeenCalled();
    expect(ends[0].final).toBeCloseTo(5400);
  });

  it('destroy() stops the clock', () => {
    const { s, views, ends } = make(tiny, tinySteps);
    s.start();
    s.destroy();
    vi.advanceTimersByTime(60_000);
    expect(views.length).toBe(1);
    expect(ends.length).toBe(0);
  });
});
