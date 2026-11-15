// The words on the play screen for each step: the headline (the run's news line, real or
// anonymised, or a plain price-action line) and the commentary under it (spec 6.2, 8.4, 8.5;
// rulings R13, R36, R37).
//
// R36: a headline is on screen at most HEADLINE_MAX_MS. When a real headline has been up that
// long, the paper prints a generated headline true to the day's move (never one already used in
// the game) until the next real one. R37: the line under it changes only on a slow day, after a
// trade, or once it has been up LINE_MIN_MS; it never repeats, and it is chosen for every day it
// will be on screen (the prices and the schedule are known ahead) and never against the headline.
import { BEFORE_NEWS } from '../content/copy';
import {
  lineCandidates,
  marketState,
  pickLine,
  withPlayer,
  type Dir,
  type LineCandidate,
  type MarketState,
  type State,
} from '../content/commentary';
import { dayHeadlines, realHeadlineDir, stillTrue, type DayHeadline } from '../content/dayheadlines';
import type { Headline, RunData, Trade } from '../engine/types';
import { hashString, mulberry32 } from './rng';
import { buildSchedule, stepHold, type Step } from './schedule';

/** R36: the longest any headline text stays on screen. */
export const HEADLINE_MAX_MS = 8_000;
/** R37: a line stays up at least this long, unless a slow day or a trade comes first. */
export const LINE_MIN_MS = 4_000;
/** R41: the clock holds the day this much longer on each sale or buy (session.holdFor); counted here. */
export const TRADE_HOLD_MS = 500;
/** Steps shorter than this run fast: a headline about where prices stand is preferred to one that would flicker. */
const FAST_STEP_MS = 450;

/** The latest headline dated on or before `dayIndex` (a front page leads with its latest story), or null. */
export function headlineOn(headlines: Headline[], dayIndex: number): Headline | null {
  let best: Headline | null = null;
  for (const h of headlines) {
    if (h.dayIndex <= dayIndex && (best === null || h.dayIndex >= best.dayIndex)) best = h;
  }
  return best;
}

/** Whether the player held shares through day `d`'s move: in the market at yesterday's close (R13). */
export function investedDuring(trades: Trade[], d: number): boolean {
  let invested = true;
  for (const t of trades) if (t.dayIndex < d) invested = t.side === 'buy';
  return invested;
}

export interface NarratorRun {
  closes: number[];
  /** The reference high before the run (price file, R13). */
  high?: number;
  /** The 30 closes before day 1 (price file, R13). */
  preCloses?: number[];
  /** With these two (a full run file) the narrator builds the run's schedule itself. */
  id?: string;
  fallEndIndex?: number;
}

export interface StepWords {
  headline: string;
  /** This step is a sombre day or the step after one: the commentary is plain. */
  sombre: boolean;
  commentary: string;
}

export interface Narrator {
  /**
   * The words for a new step showing `dayIndex`. Called once per step, in order. `prevDay` is the day
   * the step before showed (null on the first step), so news on days the step skipped still counts.
   */
  step(dayIndex: number, prevDay: number | null, balance: number, trades: Trade[]): StepWords;
}

interface HeadState {
  text: string;
  dir: Dir;
  /** The generated headline on screen, if it is one. */
  gen: DayHeadline | null;
  /** How long this text has been on screen before the current step. */
  shownMs: number;
}

export function createNarrator(
  run: NarratorRun,
  headlines: Headline[],
  opts: { real: boolean; rng: () => number; start: number; steps?: Step[] },
): Narrator {
  const sorted = headlines.slice().sort((a, b) => a.dayIndex - b.dayIndex);
  const high = run.high ?? run.closes[0];
  const preCloses = run.preCloses ?? [];
  const steps: Step[] =
    opts.steps ??
    (run.id !== undefined && run.fallEndIndex !== undefined
      ? buildSchedule(run as RunData, headlines)
      : run.closes.map((_, d) => ({ dayIndex: d, holdMs: 1_000, phase: 'fall' as const, slow: false })));
  const stepOfDay = new Map<number, number>();
  steps.forEach((s, i) => stepOfDay.set(s.dayIndex, i));
  const seed = Math.floor(opts.rng() * 2 ** 31);

  const market = new Map<number, MarketState>();
  const marketOn = (d: number) => {
    let m = market.get(d);
    if (!m) market.set(d, (m = marketState(run.closes, preCloses, high, d)));
    return m;
  };
  const prevDayOf = (i: number) => (i > 0 ? steps[i - 1].dayIndex : null);
  /** The real headline that arrives on step i (the latest dated in the days it covers), if any. */
  const arrivingOn = (i: number, from = prevDayOf(i)): Headline | null => {
    const d = steps[i].dayIndex;
    let best: Headline | null = null;
    for (const h of sorted) if (h.dayIndex <= d && (from === null || h.dayIndex > from)) best = h;
    return best;
  };
  const sombreOn = (i: number, prev = prevDayOf(i)) => {
    const d = steps[i].dayIndex;
    const from = prev ?? -1;
    return sorted.some((x) => x.sombre && x.dayIndex > from && x.dayIndex <= d);
  };
  /** A sombre day, or the step after one (global constraint): plain lines only. */
  const sombreStep = (i: number) => i >= 0 && i < steps.length && (sombreOn(i) || (i > 0 && sombreOn(i - 1)));

  // ---- Headlines (R36).
  const usedHeadlines = new Set<string>();

  /** The headline machine for step i, from the state before it. Pure apart from `used`. */
  function headlineStep(
    prev: HeadState | null, i: number, holds: (j: number) => number, used: Set<string>, from = prevDayOf(i),
  ): HeadState {
    const hold = holds(i);
    const real = prev === null ? headlineOn(sorted, steps[i].dayIndex) : arrivingOn(i, from);
    if (real || prev === null) {
      const text = real ? (opts.real ? real.real : real.anon) : BEFORE_NEWS;
      return { text, dir: real ? realHeadlineDir(text) : null, gen: null, shownMs: 0 };
    }
    const m = marketOn(steps[i].dayIndex);
    // A trade on this step holds the day TRADE_HOLD_MS longer, so leave room for it.
    const tooLong = prev.shownMs + hold + TRADE_HOLD_MS > HEADLINE_MAX_MS;
    const untrue = prev.gen !== null && !stillTrue(prev.gen, m);
    if (!tooLong && !untrue) return prev;
    const gen = chooseHeadline(i, holds, used);
    used.add(gen.text);
    return { text: gen.text, dir: gen.dir, gen, shownMs: 0 };
  }

  /** How long a generated headline would stay true from step i on, up to the 8 s limit or the next real headline. */
  function lasts(h: DayHeadline, i: number, holds: (j: number) => number): number {
    let t = holds(i);
    for (let j = i + 1; j < steps.length; j++) {
      if (arrivingOn(j)) break;
      if (!stillTrue(h, marketOn(steps[j].dayIndex))) break;
      if (t + holds(j) + TRADE_HOLD_MS > HEADLINE_MAX_MS) break;
      t += holds(j);
    }
    return t;
  }

  function chooseHeadline(i: number, holds: (j: number) => number, used: Set<string>): DayHeadline {
    const d = steps[i].dayIndex;
    const all = dayHeadlines(marketOn(d)).filter((h) => !used.has(h.text));
    const figures = all.filter((h) => h.key.startsWith('fig-'));
    const words = all.filter((h) => !h.key.startsWith('fig-'));
    const fast = holds(i) < FAST_STEP_MS;
    // Plain words first; standing headlines only when the steps run fast; figures as the fallback.
    let pool = words.filter((h) => fast || !h.standing);
    if (!pool.length) pool = words.length ? words : figures;
    if (!pool.length) {
      // Only a day with no move at all, once every word for it is used.
      return { text: `No change for shares on day ${d + 1}`, key: 'nochange', dir: null, standing: false };
    }
    const scored = pool.map((h) => ({ h, t: lasts(h, i, holds) }));
    const best = Math.max(...scored.map((x) => x.t));
    const good = scored.filter((x) => x.t >= best * 0.7);
    const r = mulberry32(hashString(`${seed}:${i}:${used.size}`))();
    return good[Math.floor(r * good.length)].h;
  }

  // ---- Lines (R37).
  const usedLines = new Set<string>();
  const usedKeys = new Map<string, number>();
  const rng = opts.rng;

  // ---- The running state.
  let head: HeadState | null = null;
  let line = '';
  let lineShownMs = 0;
  let lastIndex = -1;
  let lastHold = 0;
  let lastTrades = 0;
  let sombrePrev = false;

  return {
    step(dayIndex, prevDay, balance, trades) {
      let i = stepOfDay.get(dayIndex);
      if (i === undefined || i <= lastIndex) {
        // Not a step of the schedule (a caller without one): the next step on or after the day.
        i = steps.findIndex((s, k) => k > lastIndex && s.dayIndex >= dayIndex);
        if (i < 0) i = steps.length - 1;
      }
      const holding = !trades.length || trades[trades.length - 1].side === 'buy';
      const holds = (j: number) => stepHold(steps[j], holding);
      const traded = trades.length !== lastTrades;
      const elapsed = lastIndex < 0 ? 0 : lastHold + TRADE_HOLD_MS * Math.max(0, trades.length - lastTrades);
      lastTrades = trades.length;

      // Headline.
      if (head) head = { ...head, shownMs: head.shownMs + elapsed };
      head = headlineStep(lastIndex < 0 ? null : head, i, holds, usedHeadlines, prevDay);
      lineShownMs += elapsed;

      // Line: a new one only on the first step, a slow day, after a trade, or after LINE_MIN_MS.
      const change = lastIndex < 0 || steps[i].slow || traded || lineShownMs >= LINE_MIN_MS;
      if (change) {
        const next = chooseLine(i, holds, holding, balance, trades);
        if (next !== null) {
          if (next.text !== line) {
            line = next.text;
            lineShownMs = 0;
            if (next.text) {
              usedLines.add(next.text);
              usedKeys.set(next.key, (usedKeys.get(next.key) ?? 0) + 1);
            }
          }
        }
      }
      lastIndex = i;
      lastHold = holds(i);
      const sombre = sombreOn(i, prevDay) || sombrePrev;
      sombrePrev = sombreOn(i, prevDay);
      return { headline: head.text, sombre, commentary: line };
    },
  };

  /**
   * The line for the window from step i: until the next slow day or LINE_MIN_MS, whichever comes first.
   * Keeps the current line when nothing new fits and it is still true; otherwise blank.
   */
  function chooseLine(i: number, holds: (j: number) => number, holding: boolean, balance: number, trades: Trade[]): LineCandidate | null {
    let end = i + 1;
    let t = holds(i);
    while (end < steps.length && !steps[end].slow && t < LINE_MIN_MS) {
      t += holds(end);
      end++;
    }
    const d0 = steps[i].dayIndex;
    const neverSold = !trades.some((x) => x.side === 'sell');
    const close0 = run.closes[d0];
    const states: State[] = [];
    const dirs: Dir[] = [];
    let sombre = false;
    // The headlines the window will show (no trade inside it: a trade brings a new line).
    const used = new Set(usedHeadlines);
    let h: HeadState | null = head;
    for (let j = i; j < end; j++) {
      const d = steps[j].dayIndex;
      const bal = holding ? (balance * run.closes[d]) / close0 : balance;
      states.push(withPlayer(marketOn(d), { held: investedDuring(trades, d), neverSold, balance: bal, start: opts.start }));
      if (j > i && h) h = headlineStep({ ...h, shownMs: h.shownMs + holds(j - 1) }, j, holds, used);
      if (h) dirs.push(h.dir);
      if (sombreStep(j)) sombre = true;
    }
    const fits = (c: LineCandidate) =>
      (!sombre || c.plain) && !dirs.some((x) => x !== null && c.dir !== null && x !== c.dir);
    const all = lineCandidates(states, { exactMoney: states.length === 1 || !holding }).filter(fits);
    const fresh = all.filter((c) => !usedLines.has(c.text) && (usedKeys.get(c.key) ?? 0) < c.max);
    // On a slow (big) day, the day's own news comes first.
    const events = steps[i].slow ? fresh.filter((c) => c.event) : [];
    if (events.length) return pickLine(events, rng);
    if (fresh.length) return pickLine(fresh, rng);
    const keep = all.find((c) => c.text === line);
    if (keep) return keep;
    return { text: '', key: '', dir: null, plain: true, must: false, event: false, w: 0, max: 0 };
  }
}

/** Trading days within which a traded day still counts as "the day" of a headline. */
const NEWS_WINDOW = 10;

/** The real line that was the front page on each traded day (end screen, spec 6.6); trades with none are left out. */
export function tradeNews(headlines: Headline[], trades: Trade[], window = NEWS_WINDOW): { side: Trade['side']; real: string }[] {
  const out: { side: Trade['side']; real: string }[] = [];
  for (const t of trades) {
    const h = headlineOn(headlines, t.dayIndex);
    if (h && t.dayIndex - h.dayIndex <= window) out.push({ side: t.side, real: h.real });
  }
  return out;
}
