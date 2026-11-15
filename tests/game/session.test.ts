import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunData, RunResult, Trade } from '../../src/engine/types';
import { leadAt, simulate } from '../../src/engine/simulate';
import { buildSchedule, stepHold, type Step } from '../../src/game/schedule';
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

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] } as const;
beforeEach(() => {
  // performance is faked too: the session measures time left with performance.now().
  vi.useFakeTimers({ toFake: [...FAKE.toFake] });
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

  it('no drift: each step is armed against an absolute deadline, so late timers do not add up', () => {
    // Every timer fires 10 ms late against the session clock (a busy phone): the steps after it are shortened to catch up.
    let lag = 0;
    const at: number[] = [];
    const now = () => performance.now() + lag;
    const s = createSession(tiny, tinySteps, {
      start: 10000,
      now,
      onStep: () => {
        at.push(now());
        lag += 10;
      },
      onEnd: () => at.push(now()),
    });
    s.start();
    vi.advanceTimersByTime(5000);
    const total = tinySteps.reduce((a, st) => a + st.holdMs, 0);
    // Step k starts at the sum of the earlier holds (plus at most one timer's lateness), never at k x 10 ms late.
    let sum = 0;
    tinySteps.forEach((st, k) => {
      expect(at[k] - at[0]).toBeGreaterThanOrEqual(sum);
      expect(at[k] - at[0]).toBeLessThanOrEqual(sum + 10);
      sum += st.holdMs;
    });
    expect(at[at.length - 1] - at[0]).toBeLessThanOrEqual(total + 10);
    s.destroy();
  });

  it('R57 / smooth #4: a late day is caught up over the next several steps, never by squeezing one', () => {
    // Twenty 8-frame steps; one timer fires 100 ms late (a long frame on a busy phone).
    const hold = (8 * 1000) / 60;
    const steps: Step[] = Array.from({ length: 20 }, (_, k) => ({ dayIndex: k, holdMs: hold, phase: 'fall' as const, slow: false }));
    const r: RunData = { ...tiny, closes: steps.map((_, k) => 100 - k), dates: steps.map((_, k) => String(k)), fallEndIndex: 20, lowIndex: 19 };
    let lag = 0;
    const at: number[] = [];
    const views: SessionView[] = [];
    const now = () => performance.now() + lag;
    const s = createSession(r, steps, {
      start: 10000,
      now,
      onStep: (v) => {
        at.push(now());
        views.push(v);
        if (v.stepIndex === 3) lag += 100;
      },
      onEnd: () => at.push(now()),
    });
    s.start();
    vi.advanceTimersByTime(10_000);
    expect(at.length).toBe(21);
    // Step 3 ran 100 ms long; every later step still shows for at least 75% of its hold...
    for (let k = 5; k < at.length; k++) expect(at[k] - at[k - 1], `step ${k - 1}`).toBeGreaterThanOrEqual(0.75 * hold - 1e-6);
    // ...and stepMs says how long each will be shown (the chart grows over it).
    for (let k = 4; k < views.length; k++) expect(Math.abs(at[k + 1] - at[k] - views[k].stepMs), `stepMs of step ${k}`).toBeLessThanOrEqual(1); // timers fire on whole ms
    // The debt is paid within a few steps: from step 8 on the clock is back on schedule.
    for (let k = 8; k < at.length; k++) expect(Math.abs(at[k] - at[0] - k * hold), `step ${k}`).toBeLessThanOrEqual(2); // whole-ms timers
    s.destroy();
  });

  it('no drift across a pause: the time left in the step is kept', () => {
    let lag = 0;
    const now = () => performance.now() + lag;
    const views: SessionView[] = [];
    const s = createSession(tiny, tinySteps, { start: 10000, now, onStep: (v) => { views.push(v); lag += 10; }, onEnd: () => {} });
    s.start();
    vi.advanceTimersByTime(190); // step 0 deadline is 200 on the session clock; it reads 200 (10 ms late) already
    expect(s.view().stepIndex).toBe(0);
    s.pause();
    vi.advanceTimersByTime(10_000);
    s.resume(); // 0 ms left in step 0
    vi.advanceTimersByTime(0);
    expect(s.view().stepIndex).toBe(1);
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
    const views: SessionView[] = [];
    const ends: RunResult[] = [];
    let endedAt = 0;
    const s = createSession(run, steps, {
      start: 10000,
      onStep: (v) => views.push(v),
      onEnd: (res) => {
        ends.push(res);
        endedAt = performance.now();
      },
    });
    const t0 = performance.now();
    s.start();
    const pressAt = new Set([3, 4, 20, 21, 22, 50]);
    let step = 0;
    let t = 0;
    while (ends.length === 0) {
      // R35: quiet fall steps entered in cash hold cashMs, so the clock runs by the view's stepMs.
      const hold = s.view().stepMs;
      // Holds are whole 60 Hz frames (fractional ms); fake timers fire on whole ms and the clock catches up (R57).
      expect(Math.abs(hold - stepHold(steps[step], s.view().invested))).toBeLessThanOrEqual(1.5);
      if (pressAt.has(step)) {
        s.press();
        s.press(); // a double tap
      }
      t += hold;
      vi.advanceTimersByTime(hold);
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
    // Sold on steps 3, 20 and 22, bought on 4, 21 and 50: steps 4, 21 and 23..50 begin in cash and run quicker.
    const inCash = (i: number) => i === 4 || i === 21 || (i >= 23 && i <= 50);
    // The clock ends when the holds say, to the millisecond (whole-ms fake timers), however the steps were cut up.
    const want = steps.reduce((a, x, i) => a + stepHold(x, !inCash(i)), 0);
    expect(Math.abs(endedAt - t0 - want)).toBeLessThanOrEqual(2);
    expect(t).toBeLessThan(steps.reduce((a, x) => a + x.holdMs, 0));
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

  it('holding exactly matches the market, in the R18 order of operations', () => {
    const { s } = make(run, buildSchedule(run, []));
    s.start();
    for (let k = 0; k < 40; k++) {
      const v = s.view();
      expect(v.marketBalance).toBe((10000 / run.closes[0]) * run.closes[v.dayIndex]);
      expect(v.balance).toBe(v.marketBalance);
      expect(v.leadNow).toBe(0);
      vi.advanceTimersByTime(1000);
    }
    s.destroy();
  });

  describe('press(expectedStepIndex): a tap that lands just after the step changed', () => {
    it('pins the trade to the step the UI last rendered when it is the previous step', () => {
      const { s, views, ends } = make(tiny, tinySteps);
      s.start();
      const rendered = views[views.length - 1].stepIndex; // step 0, day 0
      vi.advanceTimersByTime(200); // the clock moves on to step 1 (day 1) before the tap arrives
      expect(s.view().stepIndex).toBe(1);
      s.press(rendered);
      expect(s.view().invested).toBe(false);
      expect(s.view().balance).toBe(10000); // sold at day 0's close, the amount the button showed
      s.press(rendered); // a double tap on the same rendered step: ignored
      expect(s.view().invested).toBe(false);
      vi.advanceTimersByTime(5000);
      expect(ends[0].trades).toEqual([{ dayIndex: 0, side: 'sell' }]);
    });

    it('a pinned tap still allows one press on the current step', () => {
      const { s, ends } = make(tiny, tinySteps);
      s.start();
      vi.advanceTimersByTime(200); // step 1
      s.press(0); // sell at day 0
      s.press(1); // buy back at day 1 (the current step)
      s.press(1); // ignored
      vi.advanceTimersByTime(5000);
      expect(ends[0].trades).toEqual([
        { dayIndex: 0, side: 'sell' },
        { dayIndex: 1, side: 'buy' },
      ]);
    });

    it('ignores a tap pinned to a step already pressed', () => {
      const { s, ends } = make(tiny, tinySteps);
      s.start();
      s.press(0); // sell at day 0
      vi.advanceTimersByTime(200); // step 1
      s.press(0); // late second tap for step 0: ignored
      vi.advanceTimersByTime(5000);
      expect(ends[0].trades).toEqual([{ dayIndex: 0, side: 'sell' }]);
    });

    it('ignores a tap more than one step stale, or for a step not yet shown', () => {
      const { s, ends } = make(tiny, tinySteps);
      s.start();
      vi.advanceTimersByTime(200 + 800); // step 2
      s.press(0); // two steps back
      s.press(3); // the future
      expect(s.view().invested).toBe(true);
      vi.advanceTimersByTime(5000);
      expect(ends[0].trades).toEqual([]);
    });

    it('press(current) behaves as press()', () => {
      const { s, ends } = make(tiny, tinySteps);
      s.start();
      vi.advanceTimersByTime(200);
      s.press(1);
      vi.advanceTimersByTime(5000);
      expect(ends[0].trades).toEqual([{ dayIndex: 1, side: 'sell' }]);
    });
  });

  it('a throwing onStep cannot freeze the clock', () => {
    const ends: RunResult[] = [];
    let calls = 0;
    const s = createSession(tiny, tinySteps, {
      start: 10000,
      onStep: () => {
        calls++;
        throw new Error('UI broke');
      },
      onEnd: (r) => ends.push(r),
    });
    expect(() => s.start()).toThrow('UI broke');
    for (let t = 0; t < 30; t++) {
      try {
        vi.advanceTimersByTime(100);
      } catch {
        // the UI error surfaces from the timer; the clock must carry on
      }
    }
    expect(calls).toBe(tinySteps.length);
    expect(ends.length).toBe(1);
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

describe('C1: holdFor, stepMs and quicker quiet days in cash (R35, R41)', () => {
  const cashSteps: Step[] = [
    { dayIndex: 0, holdMs: 200, phase: 'fall', slow: false },
    { dayIndex: 1, holdMs: 1000, phase: 'fall', slow: false, cashMs: 800 },
    { dayIndex: 2, holdMs: 1000, phase: 'fall', slow: false, cashMs: 800 },
    { dayIndex: 3, holdMs: 3000, phase: 'fall', slow: true },
    { dayIndex: 4, holdMs: 300, phase: 'forward', slow: false },
    { dayIndex: 5, holdMs: 300, phase: 'forward', slow: false },
  ];

  it('stepMs is the current step hold', () => {
    const { s, views } = make(tiny, tinySteps);
    s.start();
    expect(views[0].stepMs).toBe(200);
    vi.advanceTimersByTime(200);
    expect(s.view().stepMs).toBe(800);
    s.destroy();
  });

  it('holdFor(ms) keeps the current day on screen ms longer and moves every later deadline', () => {
    const { s } = make(tiny, tinySteps);
    s.start();
    vi.advanceTimersByTime(100);
    s.holdFor(500);
    expect(s.view().stepMs).toBe(700);
    vi.advanceTimersByTime(599);
    expect(s.view().stepIndex).toBe(0);
    vi.advanceTimersByTime(1);
    expect(s.view().stepIndex).toBe(1);
    // The next step keeps its full hold from the moved deadline.
    vi.advanceTimersByTime(799);
    expect(s.view().stepIndex).toBe(1);
    vi.advanceTimersByTime(1);
    expect(s.view().stepIndex).toBe(2);
    s.destroy();
  });

  it('holdFor while paused adds to the time left; resume keeps it', () => {
    const { s } = make(tiny, tinySteps);
    s.start();
    vi.advanceTimersByTime(200 + 300); // 300 ms into the 800 ms slow step: 500 left
    s.pause();
    s.holdFor(500);
    vi.advanceTimersByTime(30_000);
    s.resume();
    vi.advanceTimersByTime(999);
    expect(s.view().stepIndex).toBe(1);
    vi.advanceTimersByTime(1);
    expect(s.view().stepIndex).toBe(2);
    s.destroy();
  });

  it('holdFor does nothing before start or after the end, and ignores bad values', () => {
    const { s, ends } = make(tiny, tinySteps);
    s.holdFor(500);
    s.start();
    s.holdFor(-100);
    s.holdFor(Number.NaN);
    vi.advanceTimersByTime(200);
    expect(s.view().stepIndex).toBe(1);
    vi.advanceTimersByTime(10_000);
    expect(ends.length).toBe(1);
    s.holdFor(500);
    s.destroy();
  });

  it('holdFor works when called from inside press() (from the onStep a press sends) and right after it', () => {
    let s: ReturnType<typeof createSession> | null = null;
    let calls = 0;
    s = createSession(tiny, tinySteps, {
      start: 10000,
      onStep: (v) => {
        // The play screen holds the day on the sale, from inside the press.
        if (!v.invested && calls++ === 0) s!.holdFor(500);
      },
      onEnd: () => {},
    });
    s.start();
    vi.advanceTimersByTime(100);
    s.press(); // onStep runs inside press() and calls holdFor(500)
    expect(s.view().stepMs).toBe(700);
    s.holdFor(0); // ignored
    vi.advanceTimersByTime(599);
    expect(s.view().stepIndex).toBe(0);
    vi.advanceTimersByTime(1);
    expect(s.view().stepIndex).toBe(1);
    s.destroy();
  });

  it('in cash, quiet fall steps use cashMs; in the market, holdMs', () => {
    const { s, views } = make(tiny, cashSteps);
    s.start();
    vi.advanceTimersByTime(200);
    expect(s.view()).toMatchObject({ stepIndex: 1, stepMs: 1000 });
    s.press(); // sell on day 1
    vi.advanceTimersByTime(1000);
    // Step 2 is entered in cash: 800 ms.
    expect(s.view()).toMatchObject({ stepIndex: 2, stepMs: 800, invested: false });
    vi.advanceTimersByTime(799);
    expect(s.view().stepIndex).toBe(2);
    vi.advanceTimersByTime(1);
    expect(s.view()).toMatchObject({ stepIndex: 3, stepMs: 3000 });
    expect(views.some((v) => v.stepMs === undefined)).toBe(false);
    s.destroy();
  });
});
