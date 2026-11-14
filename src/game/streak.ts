// Double or nothing (spec 6.8): a small pure state machine, plus the ladder.
import type { Mode } from '../store/record';

export const START_AMOUNT = 10000;

export interface StreakState {
  /** Wins in a row so far in this streak. */
  wins: number;
  /** What the player, the holder and perfect timing start the next (or current) run with. */
  start: number;
  /** Final balance of the last finished run when a win is waiting for a choice, else null. */
  final: number | null;
}

export interface AfterRun {
  state: StreakState;
  /** True when "Double or nothing" and "Bank $N" should be offered. */
  offer: boolean;
  /** True when a streak with at least one win has just ended by a level or losing run. */
  ended: boolean;
  /** Wins of the streak that just ended (0 when nothing ended). Record it with recordStreak. */
  bestStreak: number;
}

export const initialStreak = (): StreakState => ({ wins: 0, start: START_AMOUNT, final: null });

/**
 * Feed in each finished run. Only a mystery run can start or continue a streak
 * (spec 6.11); any other mode leaves the state untouched. `start` is the amount
 * that run started with, `final` the player's final balance; lead is their difference.
 */
export function afterRun(state: StreakState, mode: Mode, start: number, final: number): AfterRun {
  if (mode !== 'mystery') return { state, offer: false, ended: false, bestStreak: 0 };
  if (final - start > 0) {
    return { state: { wins: state.wins + 1, start, final }, offer: true, ended: false, bestStreak: 0 };
  }
  return { state: initialStreak(), offer: false, ended: state.wins > 0, bestStreak: state.wins };
}

/** "Double or nothing": the previous final becomes the next start. */
export function doubleDown(state: StreakState): StreakState {
  if (state.final === null) throw new Error('no win to carry');
  return { wins: state.wins, start: state.final, final: null };
}

/** "Bank $N": ends the streak; `bestStreak` is the number of wins to record. */
export function bank(state: StreakState): { state: StreakState; bestStreak: number } {
  return { state: initialStreak(), bestStreak: state.wins };
}

export const RUNGS = [1, 2, 3, 5, 8];
export const RUNG_TITLES = ["Beginner's luck", 'Hot hand', 'Shark', 'Whale', 'Untouchable'];

export function ladder(wins: number): { rungs: number[]; reached: number; next: number | null; title: string | null } {
  let idx = -1;
  RUNGS.forEach((r, i) => {
    if (wins >= r) idx = i;
  });
  return {
    rungs: RUNGS.slice(),
    reached: idx < 0 ? 0 : RUNGS[idx],
    next: idx + 1 < RUNGS.length ? RUNGS[idx + 1] : null,
    title: idx < 0 ? null : RUNG_TITLES[idx],
  };
}
