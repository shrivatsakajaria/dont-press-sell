import { leadAt, simulate } from '../engine/simulate';
import type { RunData, RunResult, Trade } from '../engine/types';
import type { Step } from './schedule';

/** What the play screen needs to draw the current step. */
export interface SessionView {
  stepIndex: number;
  dayIndex: number;
  /** The player's balance at today's close: what "Sell for $N" shows while invested. */
  balance: number;
  invested: boolean;
  /** The holder's balance at today's close. */
  marketBalance: number;
  /** The highest balance on the steps shown so far in this run (today included). */
  peakBalance: number;
  /** The player's balance minus the holder's at today's close (leadAt). */
  leadNow: number;
  phase: 'fall' | 'forward';
  slow: boolean;
}

export type SimulateFn = (closes: number[], trades: Trade[], start?: number) => RunResult;

export interface SessionOpts {
  /** Starting amount: $10,000, or the carried amount in a double-or-nothing run. */
  start: number;
  /** Called on every new step, and again after a press (the button changes). */
  onStep(s: SessionView): void;
  /** Called once, when the final step's hold has run out. */
  onEnd(r: RunResult): void;
  /** Rule book used for balances and the result. Defaults to `simulate`; borrowed money plugs in `simulateBorrowed`. */
  simulateFn?: SimulateFn;
  /** Called when the clock pauses (the page went to the background): stop sound here. */
  onPause?(): void;
  /** Called when the clock resumes. */
  onResume?(): void;
}

export interface Session {
  /**
   * Starts the clock: shows step 0 (onStep) and runs each step for its holdMs.
   * The session does nothing until this is called, so the caller can keep the
   * handle before the first onStep arrives. Calling it twice does nothing.
   */
  start(): void;
  /** Sell while invested, buy back while in cash, at the close of the day on screen. At most one trade per step. */
  press(): void;
  pause(): void;
  resume(): void;
  view(): SessionView;
  /** Clears the timer and the visibility listener. The session is dead afterwards. */
  destroy(): void;
}

/**
 * The running game. Steps advance with setTimeout using each step's holdMs.
 * When the page is hidden (phone locked, app switched) the clock pauses and
 * later resumes in the same step with the time that was left.
 */
export function createSession(run: RunData, steps: Step[], opts: SessionOpts): Session {
  const closes = run.closes;
  const start = opts.start;
  const sim = opts.simulateFn ?? simulate;
  const trades: Trade[] = [];

  let started = false;
  let ended = false;
  let destroyed = false;
  let paused = false;
  let stepIndex = 0;
  let invested = true;
  let pressedThisStep = false;
  let peak = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stepStartedAt = 0;
  let remaining = 0;
  let current: SessionView = compute();

  function compute(): SessionView {
    const step = steps[stepIndex];
    const d = step ? step.dayIndex : 0;
    const balance = sim(closes, trades, start).balances[d] ?? start;
    const marketBalance = closes.length ? (start * closes[d]) / closes[0] : start;
    return {
      stepIndex,
      dayIndex: d,
      balance,
      invested,
      marketBalance,
      peakBalance: Math.max(peak, balance),
      leadNow: closes.length ? leadAt(closes, trades, d, start) : 0,
      phase: step ? step.phase : 'fall',
      slow: step ? step.slow : false,
    };
  }

  function arm(ms: number) {
    clearTimeout(timer);
    remaining = ms;
    stepStartedAt = Date.now();
    timer = setTimeout(advance, ms);
  }

  function enterStep() {
    pressedThisStep = false;
    current = compute();
    peak = current.peakBalance;
    opts.onStep({ ...current });
    if (!paused) arm(steps[stepIndex].holdMs);
    else remaining = steps[stepIndex].holdMs;
  }

  function advance() {
    timer = undefined;
    if (ended || destroyed) return;
    if (stepIndex >= steps.length - 1) {
      ended = true;
      unbind();
      opts.onEnd(sim(closes, trades, start));
      return;
    }
    stepIndex++;
    enterStep();
  }

  const hasDocument = typeof document !== 'undefined';
  const onVisibility = () => {
    if (document.hidden) pause();
    else resume();
  };
  function unbind() {
    if (hasDocument) document.removeEventListener('visibilitychange', onVisibility);
  }

  function pause() {
    if (paused || ended || destroyed) return;
    paused = true;
    if (started && timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      remaining = Math.max(0, remaining - (Date.now() - stepStartedAt));
    }
    opts.onPause?.();
  }

  function resume() {
    if (!paused || ended || destroyed) return;
    paused = false;
    if (started) arm(remaining);
    opts.onResume?.();
  }

  return {
    start() {
      if (started || destroyed) return;
      started = true;
      if (steps.length === 0) {
        ended = true;
        opts.onEnd(sim(closes, trades, start));
        return;
      }
      if (hasDocument) {
        document.addEventListener('visibilitychange', onVisibility);
        if (document.hidden) paused = true;
      }
      enterStep();
    },
    press() {
      if (!started || ended || destroyed || paused || pressedThisStep) return;
      pressedThisStep = true;
      trades.push({ dayIndex: steps[stepIndex].dayIndex, side: invested ? 'sell' : 'buy' });
      invested = !invested;
      current = compute();
      opts.onStep({ ...current });
    },
    pause,
    resume,
    view() {
      return { ...current };
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      timer = undefined;
      unbind();
    },
  };
}
