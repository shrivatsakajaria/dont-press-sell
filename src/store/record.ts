// The player's record, collection, last runs and daily count (spec 6.9 to 6.11, 7.5).
import { daysInRowLine } from '../content/copy';
import type { RunResult, Trade, VerdictId } from '../engine/types';
import { cell } from './store';

export type Mode = 'mystery' | 'daily' | 'picked' | 'rematch' | 'challenge';

export interface RecordData {
  games: number;
  wins: number;
  soldTooEarly: number;
  played: string[];
  titles: VerdictId[];
  bestStreak: number;
}

export interface LastRun {
  balances: number[];
  trades: Trade[];
  final: number;
}

/**
 * Extra facts recordRun cannot get from RunResult.
 * `lowIndex`: the run's lowest-close day index (RunData.lowIndex), for "sold too early".
 * `date`: UTC date (yyyy-mm-dd) of a daily run; only the first result of a date counts as blind.
 */
export interface RunContext {
  lowIndex?: number;
  date?: string;
}

const EMPTY: RecordData = { games: 0, wins: 0, soldTooEarly: 0, played: [], titles: [], bestStreak: 0 };
const recordCell = cell<RecordData>('record', EMPTY);
const lastRunsCell = cell<Record<string, LastRun>>('lastRuns', {});
const dailyResultsCell = cell<Record<string, { runId: string; lead: number; verdict: VerdictId }>>('dailyResults', {});
const dailyCountCell = cell<{ last: string; count: number } | null>('dailyCount', null);

const KEEP_DAILY_DAYS = 60;

function currentRecord(): RecordData {
  return { ...EMPTY, ...recordCell.get() };
}

/**
 * Records a finished run. Signature differs from the plan's `(mode, runId, result, verdict)`
 * only by the optional fifth argument `ctx`.
 *
 * Blind runs are mystery, the first play of a daily date and challenge. Only they add titles,
 * games, wins (lead > 0) and "sold too early" (first sale before `ctx.lowIndex` and finished
 * behind). Every mode adds the run to `played` and stores it as the last run for that crash.
 */
export function recordRun(mode: Mode, runId: string, result: RunResult, verdict: VerdictId, ctx: RunContext = {}): void {
  let blind = mode === 'mystery' || mode === 'challenge' || mode === 'daily';
  if (mode === 'daily' && ctx.date) {
    const results = { ...dailyResultsCell.get() };
    if (results[ctx.date]) {
      blind = false;
    } else {
      results[ctx.date] = { runId, lead: result.lead, verdict };
      const dates = Object.keys(results).sort();
      for (const d of dates.slice(0, Math.max(0, dates.length - KEEP_DAILY_DAYS))) delete results[d];
      dailyResultsCell.set(results);
    }
  }

  const rec = currentRecord();
  const played = rec.played.includes(runId) ? rec.played : [...rec.played, runId];
  const next: RecordData = { ...rec, played };
  if (blind) {
    next.games = rec.games + 1;
    if (result.lead > 0) next.wins = rec.wins + 1;
    if (!rec.titles.includes(verdict)) next.titles = [...rec.titles, verdict];
    const firstSale = result.trades.find((t) => t.side === 'sell');
    if (ctx.lowIndex !== undefined && firstSale && firstSale.dayIndex < ctx.lowIndex && result.lead < 0) {
      next.soldTooEarly = rec.soldTooEarly + 1;
    }
  }
  recordCell.set(next);

  lastRunsCell.set({
    ...lastRunsCell.get(),
    [runId]: {
      balances: result.balances.map((b) => Math.round(b)),
      trades: result.trades.map((t) => ({ dayIndex: t.dayIndex, side: t.side })),
      final: Math.round(result.final),
    },
  });
}

export function getRecord(): RecordData {
  const r = currentRecord();
  return { ...r, played: r.played.slice(), titles: r.titles.slice() };
}

/** The player's previous run of this crash, for the rematch line, or null. */
export function getLastRun(runId: string): LastRun | null {
  return lastRunsCell.get()[runId] ?? null;
}

/** The first result stored for a daily date, or null. */
export function getDailyResult(date: string): { runId: string; lead: number; verdict: VerdictId } | null {
  return dailyResultsCell.get()[date] ?? null;
}

/** Call with the wins of a streak that has ended or been banked. Keeps the best. */
export function recordStreak(wins: number): void {
  const rec = currentRecord();
  if (wins > rec.bestStreak) recordCell.set({ ...rec, bestStreak: wins });
}

/** "9 games, 3 wins, sold too early 4 times". */
export function recordLine(r: Pick<RecordData, 'games' | 'wins' | 'soldTooEarly'>): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return `${n(r.games, 'game', 'games')}, ${n(r.wins, 'win', 'wins')}, sold too early ${n(r.soldTooEarly, 'time', 'times')}`;
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * Records that a daily crash was played on this UTC date and returns the days in a row.
 * Same date again: same count. Yesterday played: one more. Anything else: back to one.
 */
export function dailyStreak(utcDate: string): number {
  const prev = dailyCountCell.get();
  if (prev && prev.last === utcDate) return prev.count;
  const count = prev && dayNumber(utcDate) - dayNumber(prev.last) === 1 ? prev.count + 1 : 1;
  dailyCountCell.set({ last: utcDate, count });
  return count;
}

/** "N days in a row", shown only from two (spec 6.9); otherwise null. */
export function daysInRowText(n: number): string | null {
  return n >= 2 ? daysInRowLine(n) : null;
}
