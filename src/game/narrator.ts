// The words on the play screen for each step: the headline (the run's news line, real or
// anonymised, or a plain price-action line) and the commentary under it (spec 6.2, 8.4, 8.5;
// rulings R13, R36, R37).
//
// R36: a headline is on screen at most HEADLINE_MAX_MS. When a real headline has been up that
// long, the paper prints a generated headline true to the day's move (never one already used in
// the game) until the next real one. R37: the line under it changes only on a slow day, after a
// trade, or once it has been up LINE_MIN_MS; it never repeats, and it is chosen for every day it
// will be on screen (the prices and the schedule are known ahead) and never against the headline.
import { BEFORE_NEWS, FIRST_SALE_LINE, boughtLines, soldLastTimeLine, soldLines } from '../content/copy';
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
import { load } from '../store/store';
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

/** The store key set at this phone's first sale (the play screen writes it). */
export const SEEN_FIRST_SALE = 'seenFirstSale';

export interface Narrator {
  /**
   * The words for a new step showing `dayIndex`. Called once per step, in order. `prevDay` is the day
   * the step before showed (null on the first step), so news on days the step skipped still counts.
   * Called again for the step already shown with a longer `trades` (a press), it acts as trade().
   */
  step(dayIndex: number, prevDay: number | null, balance: number, trades: Trade[]): StepWords;
  /**
   * K1, R52: the words at the moment of a press on the step showing `dayIndex`. `trades` includes the new
   * trade; `balance` is the balance after it. The line under the headline changes at once to a true line
   * about the trade and stays at least LINE_MIN_MS from the press, slow days included.
   */
  trade(dayIndex: number, trades: Trade[], balance: number): { headline: string; commentary: string };
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
  opts: {
    real: boolean;
    rng: () => number;
    start: number;
    steps?: Step[];
    /** This phone has never sold before: its first sale shows FIRST_SALE_LINE. Default: read from the store. */
    firstSale?: boolean;
    /** Rematch: the day the player sold last time; its line goes up on or after that day (R51). */
    soldLastTime?: number | null;
  },
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
  /** R52: the line was set at a press; it stays until it has been up LINE_MIN_MS, slow days included. */
  let locked = false;
  /** The line was set at a press on the step before: count only the press hold for it (the press may have come last). */
  let fromPress = false;
  let lastIndex = -1;
  let lastHold = 0;
  let seenTrades = 0;
  /** Press holds (TRADE_HOLD_MS each) on the step shown last. */
  let pressMs = 0;
  let sombrePrev = false;
  let firstSale = opts.firstSale ?? !load(SEEN_FIRST_SALE, false);
  const soldDay = opts.soldLastTime ?? null;
  let soldShown = soldDay === null;

  const blank: LineCandidate = { text: '', key: '', dir: null, plain: true, must: false, event: false, fallback: false, w: 0, max: 0 };

  function setLine(text: string, key: string) {
    if (text === line) return;
    line = text;
    lineShownMs = 0;
    if (text) {
      usedLines.add(text);
      usedKeys.set(key, (usedKeys.get(key) ?? 0) + 1);
    }
  }

  /** The words for the trade just made (the last of `trades`); null when every wording is used. */
  function tradeLine(trades: Trade[], balance: number): string | null {
    const t = trades[trades.length - 1];
    if (t.side === 'sell') {
      if (firstSale) {
        firstSale = false;
        if (!usedLines.has(FIRST_SALE_LINE)) return FIRST_SALE_LINE;
      }
      return soldLines(balance).find((x) => !usedLines.has(x)) ?? null;
    }
    const sale = trades.slice(0, -1).reverse().find((x) => x.side === 'sell');
    const saleClose = sale ? run.closes[sale.dayIndex] : run.closes[t.dayIndex];
    // R38: the same number as the button and the stamp (the cash against the sale's close).
    const saving = Math.round(balance * (1 - run.closes[t.dayIndex] / saleClose));
    return boughtLines(saving).find((x) => !usedLines.has(x)) ?? null;
  }

  function onTrade(i: number, trades: Trade[], balance: number) {
    const holding = trades[trades.length - 1].side === 'buy';
    const text = tradeLine(trades, balance);
    if (text !== null) setLine(text, 'trade');
    else {
      // Every trade wording is used: a line true for the rest of this step and LINE_MIN_MS after it, slow
      // days included (the lock holds it through them).
      const holds = (j: number) => stepHold(steps[j], holding);
      const next = chooseLine(i, holds, holding, balance, trades, { minMs: holds(i) + LINE_MIN_MS, throughSlow: true });
      setLine(next.text, next.key);
    }
    lineShownMs = 0;
    locked = true;
    fromPress = true;
  }

  function trade(dayIndex: number, trades: Trade[], balance: number): { headline: string; commentary: string } {
    if (lastIndex < 0) {
      const w = step(dayIndex, null, balance, trades);
      return { headline: w.headline, commentary: w.commentary };
    }
    const fresh = trades.length - seenTrades;
    if (fresh > 0) {
      seenTrades = trades.length;
      pressMs += TRADE_HOLD_MS * fresh;
      onTrade(lastIndex, trades, balance);
    }
    return { headline: head ? head.text : BEFORE_NEWS, commentary: line };
  }

  function step(dayIndex: number, prevDay: number | null, balance: number, trades: Trade[]): StepWords {
    // The old wiring: the step already shown, called again after a press.
    if (lastIndex >= 0 && trades.length > seenTrades && steps[lastIndex].dayIndex === dayIndex) {
      const w = trade(dayIndex, trades, balance);
      return { ...w, sombre: sombrePrev };
    }
    let i = stepOfDay.get(dayIndex);
    if (i === undefined || i <= lastIndex) {
      // Not a step of the schedule (a caller without one): the next step on or after the day.
      i = steps.findIndex((s, k) => k > lastIndex && s.dayIndex >= dayIndex);
      if (i < 0) i = steps.length - 1;
    }
    const holding = !trades.length || trades[trades.length - 1].side === 'buy';
    const holds = (j: number) => stepHold(steps[j], holding);
    // A trade this narrator was not told about at its press (it hears of it now).
    const missed = trades.length > seenTrades;
    if (missed) pressMs += TRADE_HOLD_MS * (trades.length - seenTrades);
    seenTrades = trades.length;
    const elapsed = lastIndex < 0 ? 0 : lastHold + pressMs;

    // Headline.
    if (head) head = { ...head, shownMs: head.shownMs + elapsed };
    head = headlineStep(lastIndex < 0 ? null : head, i, holds, usedHeadlines, prevDay);
    lineShownMs += fromPress ? pressMs : elapsed;
    fromPress = false;
    pressMs = 0;
    if (locked && lineShownMs >= LINE_MIN_MS) locked = false;
    const first = lastIndex < 0;
    lastIndex = i;
    lastHold = holds(i);

    if (missed) onTrade(i, trades, balance);
    else if (!locked) {
      // Line: a new one only on the first step, a slow day, after LINE_MIN_MS, or to fill a blank (R37, R51).
      const change = first || steps[i].slow || lineShownMs >= LINE_MIN_MS || line === '';
      if (change) {
        // Rematch (R51): the day sold last time, as soon as the line may change on or after it (fall days only:
        // the fast-forward shows years, not day numbers).
        if (!soldShown && soldDay !== null && steps[i].dayIndex >= soldDay && steps[i].phase === 'fall') {
          soldShown = true;
          setLine(soldLastTimeLine(soldDay), 'sold-last-time');
          lineShownMs = 0;
        } else {
          const next = chooseLine(i, holds, holding, balance, trades);
          setLine(next.text, next.key);
          // A kept line goes on counting; a new one starts from zero (setLine).
        }
      }
    }
    const sombre = sombreOn(i, prevDay) || sombrePrev;
    sombrePrev = sombreOn(i, prevDay);
    return { headline: head.text, sombre, commentary: line };
  }

  return { step, trade };

  /**
   * The line for the window from step i: until the next slow day or LINE_MIN_MS, whichever comes first.
   * A fresh line first (on a slow day, the day's own news first); else the current line while still true;
   * else a fresh fallback (R51); blank only when nothing at all fits.
   */
  function chooseLine(
    i: number, holds: (j: number) => number, holding: boolean, balance: number, trades: Trade[],
    window: { minMs: number; throughSlow: boolean } = { minMs: LINE_MIN_MS, throughSlow: false },
  ): LineCandidate {
    let end = i + 1;
    let t = holds(i);
    while (end < steps.length && (window.throughSlow || !steps[end].slow) && t < window.minMs) {
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
    const main = fresh.filter((c) => !c.fallback);
    // On a slow (big) day, the day's own news comes first.
    const events = steps[i].slow ? main.filter((c) => c.event) : [];
    if (events.length) return pickLine(events, rng);
    if (main.length) return pickLine(main, rng);
    const keep = all.find((c) => c.text === line);
    if (keep) return keep;
    if (fresh.length) return pickLine(fresh, rng);
    return blank;
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
