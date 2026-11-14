// The player's record, collection, last runs and daily count (spec 6.9 to 6.11, 7.5).
import { daysInRowLine } from '../content/copy';
import type { RunResult, Trade, VerdictId } from '../engine/types';
import { utcDayNumber } from '../game/picker';
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

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Corrupt storage (null, wrong types) falls back to empty fields; never throws. */
function currentRecord(): RecordData {
  const r = recordCell.get();
  if (!isObj(r)) return { ...EMPTY, played: [], titles: [] };
  return {
    games: num(r.games),
    wins: num(r.wins),
    soldTooEarly: num(r.soldTooEarly),
    played: strs(r.played),
    titles: strs(r.titles) as VerdictId[],
    bestStreak: num(r.bestStreak),
  };
}

function dailyResults(): Record<string, { runId: string; lead: number; verdict: VerdictId }> {
  const d = dailyResultsCell.get();
  return isObj(d) ? (d as ReturnType<typeof dailyResults>) : {};
}

/**
 * The single definition of a blind run (spec 6.11): mystery, challenge, and the first play of
 * a daily. A daily with no date given counts as blind. Rematch and picked never do.
 * `repeatDaily` is true when the daily for that date already has a stored result.
 */
export function isBlind(mode: Mode, opts: { repeatDaily?: boolean } = {}): boolean {
  if (mode === 'mystery' || mode === 'challenge') return true;
  if (mode === 'daily') return !opts.repeatDaily;
  return false;
}

/**
 * Records a finished run. Signature differs from the plan's `(mode, runId, result, verdict)`
 * only by the optional fifth argument `ctx`.
 *
 * Blind runs are mystery, the first play of a daily date and challenge. Only they add titles,
 * games, wins (lead > 0) and "sold too early" (first sale before `ctx.lowIndex` and finished
 * behind). Every mode adds the run to `played` and stores it as the last run for that crash.
 */
export function recordRun(
  mode: Mode,
  runId: string,
  result: RunResult,
  verdict: VerdictId,
  ctx: RunContext = {},
): { blind: boolean } {
  let repeatDaily = false;
  if (mode === 'daily' && ctx.date) {
    const results = { ...dailyResults() };
    if (results[ctx.date]) {
      repeatDaily = true;
    } else {
      results[ctx.date] = { runId, lead: result.lead, verdict };
      const dates = Object.keys(results).sort();
      for (const d of dates.slice(0, Math.max(0, dates.length - KEEP_DAILY_DAYS))) delete results[d];
      dailyResultsCell.set(results);
    }
  }

  const blind = isBlind(mode, { repeatDaily });
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

  const lastRuns = lastRunsCell.get();
  lastRunsCell.set({
    ...(isObj(lastRuns) ? lastRuns : {}),
    [runId]: {
      balances: result.balances.map((b) => Math.round(b)),
      trades: result.trades.map((t) => ({ dayIndex: t.dayIndex, side: t.side })),
      final: Math.round(result.final),
    },
  });
  return { blind };
}

export function getRecord(): RecordData {
  const r = currentRecord();
  return { ...r, played: r.played.slice(), titles: r.titles.slice() };
}

/** The player's previous run of this crash, for the rematch line, or null. */
export function getLastRun(runId: string): LastRun | null {
  const all = lastRunsCell.get();
  const r = isObj(all) ? all[runId] : null;
  if (!isObj(r) || !Array.isArray(r.balances) || !Array.isArray(r.trades) || typeof r.final !== 'number') return null;
  return r as unknown as LastRun;
}

/** The first result stored for a daily date, or null. */
export function getDailyResult(date: string): { runId: string; lead: number; verdict: VerdictId } | null {
  return dailyResults()[date] ?? null;
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

/**
 * Records that a daily crash was played on this UTC date and returns the days in a row.
 * Same date again: same count. Yesterday played: one more. Anything else: back to one.
 */
export function dailyStreak(utcDate: string): number {
  const raw = dailyCountCell.get();
  const prev = isObj(raw) && typeof raw.last === 'string' && typeof raw.count === 'number' ? (raw as { last: string; count: number }) : null;
  if (prev && prev.last === utcDate) return prev.count;
  const count = prev && utcDayNumber(utcDate) - utcDayNumber(prev.last) === 1 ? prev.count + 1 : 1;
  dailyCountCell.set({ last: utcDate, count });
  return count;
}

/** "N days in a row", shown only from two (spec 6.9); otherwise null. */
export function daysInRowText(n: number): string | null {
  return n >= 2 ? daysInRowLine(n) : null;
}
