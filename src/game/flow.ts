// Settling a finished run (spec 6.8, 6.11, 6.12): the record, the pot and the double-or-nothing
// streak in one place, so the page code only draws. Storage may be missing: every value lives
// in memory for the visit and is written through when it can be.
import type { BorrowedResult, RunResult, VerdictId } from '../engine/types';
import { dailyStreak, recordRun, recordStreak, type Mode } from '../store/record';
import { cell } from '../store/store';
import { applyToPot, getPot } from './pot';
import { afterRun, bank, doubleDown, initialStreak, RUNGS, type StreakState } from './streak';

/** The streak, stored so a win waiting for a choice is banked if the page closes (see bankPending). */
const streakCell = cell<StreakState>('streak', initialStreak());

/** Borrowed money unlocks after the first blind win (spec 6.13); the switch keeps its own state. */
const unlockedCell = cell<boolean>('borrowedUnlocked', false);
const borrowedOnCell = cell<boolean>('borrowed', false);

export const borrowedUnlocked = (): boolean => unlockedCell.get() === true;
/** The switch: new mystery runs use borrowed money (never double or nothing, daily, challenge or practice). */
export const borrowedOn = (): boolean => borrowedUnlocked() && borrowedOnCell.get() === true;
export function setBorrowed(on: boolean): void {
  borrowedOnCell.set(on);
}

/** The eighth win in a row prints the island front page (spec 6.8). */
export const ISLAND_WINS = RUNGS[RUNGS.length - 1];

function validStreak(s: unknown): StreakState {
  const v = s as StreakState;
  const ok =
    v && typeof v === 'object' && Number.isFinite(v.wins) && Number.isFinite(v.start) && Number.isFinite(v.net) &&
    (v.final === null || Number.isFinite(v.final));
  return ok ? v : initialStreak();
}

export function currentStreak(): StreakState {
  return { ...validStreak(streakCell.get()) };
}

export interface SettleInput {
  mode: Mode;
  runId: string;
  result: RunResult;
  verdict: VerdictId;
  /** The run's lowest-close day, for "sold too early". */
  lowIndex: number;
  /** UTC date of a daily run. */
  date?: string;
  /** What the player and the holder started with. */
  start: number;
  borrowed: boolean;
}

export interface Settled {
  /** A blind run (mystery, first daily, challenge). */
  blind: boolean;
  /** For the result page; while a win waits for a choice it includes that win. */
  pot: { pot: number; tonight: number };
  bust: boolean;
  /**
   * Present when double or nothing is offered; `wins` counts this win. `net` is the whole streak's
   * win so far (this run included): what "Bank" adds to the pot (I1).
   */
  double: { net: number; final: number; wins: number } | null;
  /** The eighth win in a row. */
  island: boolean;
  /** Days in a row of daily crashes, on a first daily; else null. */
  daysInRow: number | null;
}

/**
 * Records the run and settles the pot. A mystery win (not borrowed) is held for the
 * double-or-nothing choice and settled once the streak ends (bank, a loss, or leaving).
 */
export function settle(i: SettleInput): Settled {
  const { blind } = recordRun(i.mode, i.runId, i.result, i.verdict, {
    lowIndex: i.lowIndex, date: i.date, start: i.start, borrowed: i.borrowed,
  });
  const daysInRow = i.mode === 'daily' && blind && i.date ? dailyStreak(i.date) : null;
  if (blind && i.result.lead > 0 && !borrowedUnlocked()) unlockedCell.set(true);
  const out = (p: { pot: number; tonight: number; bust: boolean }, double: Settled['double'] = null): Settled => ({
    blind, pot: { pot: p.pot, tonight: p.tonight }, bust: p.bust, double, island: !!double && double.wins === ISLAND_WINS, daysInRow,
  });

  if (i.borrowed) {
    // A wipe-out loses the $10,000 put in (spec 6.13); otherwise the score as usual. Settled at once.
    const wiped = (i.result as BorrowedResult).wipedAt != null;
    return out(applyToPot('mystery', wiped ? -i.start : i.result.lead, blind));
  }
  if (i.mode === 'mystery') {
    const ar = afterRun(currentStreak(), 'mystery', i.result);
    if (ar.offer) {
      streakCell.set(ar.state);
      const now = getPot();
      return out(
        { pot: now.pot + ar.state.net, tonight: now.tonight + ar.state.net, bust: false },
        { net: ar.state.net, final: i.result.final, wins: ar.state.wins },
      );
    }
    streakCell.set(ar.state);
    if (ar.ended) recordStreak(ar.bestStreak);
    return out(applyToPot('mystery', ar.settle ?? i.result.lead, blind));
  }
  return out(applyToPot(i.mode, i.result.lead, blind));
}

/**
 * Banks the streak: a win waiting for a choice (the player pressed "Bank", or went elsewhere),
 * or a streak whose double-or-nothing run was left unfinished (the page closed). Null when there is none.
 */
export function bankPending(): { pot: number; tonight: number; bust: boolean } | null {
  const s = currentStreak();
  if (s.wins === 0) return null;
  const b = bank(s);
  streakCell.set(b.state);
  recordStreak(b.bestStreak);
  return applyToPot('mystery', b.settle, true);
}

/** "Double or nothing": the last final becomes the next run's start. */
export function doubleUp(): StreakState {
  const next = doubleDown(currentStreak());
  streakCell.set(next);
  return { ...next };
}

/** A decoded challenge can be played only if every trade falls inside the run (spec 6.7). */
export function challengeFits(c: { trades: { dayIndex: number }[] }, runLength: number): boolean {
  return c.trades.every((t) => Number.isInteger(t.dayIndex) && t.dayIndex >= 0 && t.dayIndex < runLength);
}
