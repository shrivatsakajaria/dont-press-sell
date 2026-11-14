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
  /** Sum of the leads over the holder of the wins so far in this streak. */
  net: number;
}

export interface AfterRun {
  state: StreakState;
  /** True when "Double or nothing" and "Bank $N" should be offered. */
  offer: boolean;
  /** True when a streak with at least one win has just ended by a level or losing run. */
  ended: boolean;
  /** Wins of the streak that just ended (0 when nothing ended). Record it with recordStreak. */
  bestStreak: number;
  /** The amount to settle the pot with once the streak is over (net lead incl. this run), else null. */
  settle: number | null;
}

export const initialStreak = (): StreakState => ({ wins: 0, start: START_AMOUNT, final: null, net: 0 });

/**
 * Feed in each finished run. Only a mystery run can start or continue a streak
 * (spec 6.11); any other mode leaves the state untouched. A win is a lead over the
 * holder above zero (not final above start: in a scare the holder can gain more
 * than the player). `final` is kept for the carry.
 */
export function afterRun(state: StreakState, mode: Mode, result: { final: number; lead: number }): AfterRun {
  if (mode !== 'mystery') return { state, offer: false, ended: false, bestStreak: 0, settle: null };
  if (result.lead > 0) {
    return {
      state: { wins: state.wins + 1, start: state.start, final: result.final, net: state.net + result.lead },
      offer: true,
      ended: false,
      bestStreak: 0,
      settle: null,
    };
  }
  return {
    state: initialStreak(),
    offer: false,
    ended: state.wins > 0,
    bestStreak: state.wins,
    settle: state.net + result.lead,
  };
}

/** "Double or nothing": the previous final becomes the next start. */
export function doubleDown(state: StreakState): StreakState {
  if (state.final === null) throw new Error('no win to carry');
  return { wins: state.wins, start: state.final, final: null, net: state.net };
}

/** "Bank $N": ends the streak; record `bestStreak` and settle the pot with `settle`. */
export function bank(state: StreakState): { state: StreakState; bestStreak: number; settle: number } {
  return { state: initialStreak(), bestStreak: state.wins, settle: state.net };
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
