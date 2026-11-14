// The words on the play screen for each step: the headline (the run's news line, real or
// anonymised) and the commentary under it (spec 6.2, 8.4, 8.5; ruling R13).
import { BEFORE_NEWS } from '../content/copy';
import { commentaryFor } from '../content/commentary';
import type { Headline, Trade } from '../engine/types';

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
}

export interface StepWords {
  headline: string;
  /** This step is a sombre day or the step after one: the commentary is neutral. */
  sombre: boolean;
  commentary: string;
}

export interface Narrator {
  /**
   * The words for a new step showing `dayIndex`. `prevDay` is the day the step before showed
   * (null on the first step), so news on days the step skipped still counts.
   */
  step(dayIndex: number, prevDay: number | null, balance: number, trades: Trade[]): StepWords;
}

export function createNarrator(
  run: NarratorRun,
  headlines: Headline[],
  opts: { real: boolean; rng: () => number; start: number },
): Narrator {
  const sorted = headlines.slice().sort((a, b) => a.dayIndex - b.dayIndex);
  const high = run.high ?? run.closes[0];
  const preCloses = run.preCloses ?? [];
  let previous: string | undefined;
  let sombreCarry = false;
  return {
    step(dayIndex, prevDay, balance, trades) {
      const h = headlineOn(sorted, dayIndex);
      const headline = h ? (opts.real ? h.real : h.anon) : BEFORE_NEWS;
      const from = prevDay ?? -1;
      const sombreToday = sorted.some((x) => x.sombre && x.dayIndex > from && x.dayIndex <= dayIndex);
      const sombre = sombreToday || sombreCarry;
      sombreCarry = sombreToday;
      const commentary = commentaryFor({
        closes: run.closes,
        dayIndex,
        invested: investedDuring(trades, dayIndex),
        neverSold: !trades.some((t) => t.side === 'sell' && t.dayIndex <= dayIndex),
        balance,
        start: opts.start,
        sombre,
        rng: opts.rng,
        high,
        preCloses,
        previous,
      });
      previous = commentary;
      return { headline, sombre, commentary };
    },
  };
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
