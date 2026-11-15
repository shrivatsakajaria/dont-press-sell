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
  /** The clock read in milliseconds (default performance.now); tests pass their own. */
  now?(): number;
}

export interface Session {
  /**
   * Starts the clock: shows step 0 (onStep) and runs each step for its holdMs.
   * The session does nothing until this is called, so the caller can keep the
   * handle before the first onStep arrives. Calling it twice does nothing.
   */
  start(): void;
  /**
   * Sell while invested, buy back while in cash, at the close of the day on screen.
   * At most one trade per step.
   *
   * `expectedStepIndex` (optional) is the stepIndex of the view the UI last rendered,
   * i.e. the step whose amount the button showed when the player tapped. If the clock
   * has moved on by exactly one step before the tap arrives, the trade is pinned to
   * that previous step (its day and close), unless that step already has a trade.
   * A tap for any other step (two or more back, or ahead) is ignored. Without it,
   * the press goes to the current step.
   */
  press(expectedStepIndex?: number): void;
  pause(): void;
  resume(): void;
  view(): SessionView;
  /** Clears the timer and the visibility listener. The session is dead afterwards. */
  destroy(): void;
}

/** A timer this late or more (the page was frozen) restarts the step clock rather than racing to catch up. */
const REBASE_MS = 250;

/**
 * The running game. Steps advance with setTimeout using each step's holdMs, each armed against an
 * absolute deadline (the previous step's deadline + its hold), so late timers on a busy phone never add up.
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
  /** Paused by the player (the Pause button). Only the player's Resume clears it. */
  let userPaused = false;
  /** Paused because the page is hidden. Showing the page clears it. */
  let hiddenPaused = false;
  let stepIndex = 0;
  let invested = true;
  const pressedSteps = new Set<number>();
  let peak = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** When the current step ends on the clock, while it runs. */
  let deadline = 0;
  const now =
    opts.now ??
    (() => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()));
  let remaining = 0;
  let current: SessionView = compute();

  function compute(): SessionView {
    const step = steps[stepIndex];
    const d = step ? step.dayIndex : 0;
    const balance = sim(closes, trades, start).balances[d] ?? start;
    // R18: the holder in the same order of operations as the balances.
    const marketBalance = closes.length ? (start / closes[0]) * closes[d] : start;
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

  /** Runs the clock to `until` (an absolute time on the clock). */
  function armUntil(until: number) {
    clearTimeout(timer);
    deadline = until;
    timer = setTimeout(advance, Math.max(0, until - now()));
  }

  /** `from`: the previous step's deadline when the clock ran straight on; null to start from now. */
  function enterStep(from: number | null) {
    current = compute();
    peak = current.peakBalance;
    const hold = steps[stepIndex].holdMs;
    // Arm the clock before calling the UI, so a throwing onStep cannot freeze the run.
    if (!paused) {
      const t = now();
      armUntil(from !== null && t - from < REBASE_MS ? from + hold : t + hold);
    } else remaining = hold;
    opts.onStep({ ...current });
  }

  function advance() {
    timer = undefined;
    const due = deadline;
    if (ended || destroyed) return;
    if (stepIndex >= steps.length - 1) {
      ended = true;
      unbind();
      opts.onEnd(sim(closes, trades, start));
      return;
    }
    stepIndex++;
    enterStep(due);
  }

  const hasDocument = typeof document !== 'undefined';
  const onVisibility = () => {
    hiddenPaused = document.hidden;
    sync();
  };
  /** The clock runs only when neither the player nor a hidden page holds it. */
  function sync() {
    if (userPaused || hiddenPaused) pauseClock();
    else resumeClock();
  }
  function unbind() {
    if (hasDocument) document.removeEventListener('visibilitychange', onVisibility);
  }

  function pauseClock() {
    if (paused || ended || destroyed) return;
    paused = true;
    if (started && timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      remaining = Math.min(steps[stepIndex].holdMs, Math.max(0, deadline - now()));
    }
    opts.onPause?.();
  }

  function resumeClock() {
    if (!paused || ended || destroyed) return;
    paused = false;
    if (started) armUntil(now() + remaining);
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
        if (document.hidden) {
          hiddenPaused = true;
          paused = true;
        }
      }
      enterStep(null);
    },
    press(expectedStepIndex?: number) {
      if (!started || ended || destroyed || paused) return;
      let target = stepIndex;
      if (expectedStepIndex !== undefined && expectedStepIndex !== stepIndex) {
        if (expectedStepIndex !== stepIndex - 1) return;
        target = expectedStepIndex;
      }
      if (pressedSteps.has(target)) return;
      // A pinned trade on the previous step must not come after one on the current step.
      if (target < stepIndex && pressedSteps.has(stepIndex)) return;
      pressedSteps.add(target);
      trades.push({ dayIndex: steps[target].dayIndex, side: invested ? 'sell' : 'buy' });
      invested = !invested;
      current = compute();
      opts.onStep({ ...current });
    },
    pause() {
      userPaused = true;
      sync();
    },
    resume() {
      userPaused = false;
      sync();
    },
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
