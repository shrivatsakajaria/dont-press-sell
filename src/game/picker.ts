// Run picking: the mystery pool (spec 7.2) and the daily crash (spec 6.9).
import { RUNS } from '../content/runs';
import type { RunKind } from '../engine/types';

/**
 * The daily crash waits for phase 2 (R47): no link, button, menu item or share text offers it while
 * this is false. The picking code below stays.
 */
export const DAILY_ENABLED = false;

/** The first game a player ever plays is one of these real crashes (R46). */
export const FIRST_GAME_RUNS: readonly string[] = ['c1987', 'c2007', 'c2020', 'c2022'];

/** Daily crash number 1 falls on this UTC date. */
export const LAUNCH_DATE = '2026-11-21';

const idsOf = (kind: RunKind): string[] => RUNS.filter((r) => r.kind === kind).map((r) => r.id);

/**
 * Half of all picks are scares: choose the kind first, then a run of that kind,
 * never the same run three times running. `recent` is most recent first.
 * `firstEver`: the player has never finished a game (their stored record says so): one of FIRST_GAME_RUNS.
 */
export function pickMystery(rng: () => number, recent: string[], opts: { firstEver?: boolean } = {}): string {
  if (opts.firstEver) return FIRST_GAME_RUNS[Math.min(FIRST_GAME_RUNS.length - 1, Math.floor(rng() * FIRST_GAME_RUNS.length))];
  const kind: RunKind = rng() < 0.5 ? 'scare' : 'crash';
  const banned = recent.length >= 2 && recent[0] === recent[1] ? recent[0] : null;
  let pool = idsOf(kind).filter((id) => id !== banned);
  if (pool.length === 0) pool = RUNS.map((r) => r.id).filter((id) => id !== banned);
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[i];
}

// Small fixed-seed generator, local so the daily order never depends on src/game/rng.ts.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DAILY_SEED = 20261121;

/**
 * The fixed daily cycle: crashes and scares each shuffled once with a fixed
 * seed, then interleaved (crash, scare, crash, ...). The cycle repeats every
 * pool-size days, so any run of that many consecutive days covers every run,
 * and half the days are scares.
 */
function dailyCycle(): string[] {
  const rng = mulberry32(DAILY_SEED);
  const crashes = shuffled(idsOf('crash'), rng);
  const scares = shuffled(idsOf('scare'), rng);
  const out: string[] = [];
  for (let i = 0; i < Math.max(crashes.length, scares.length); i++) {
    if (i < crashes.length) out.push(crashes[i]);
    if (i < scares.length) out.push(scares[i]);
  }
  return out;
}

/** Whole days since 1970-01-01 for a yyyy-mm-dd UTC date. */
export function utcDayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function dailyPick(utcDate: string): { number: number; runId: string } {
  const cycle = dailyCycle();
  const number = utcDayNumber(utcDate) - utcDayNumber(LAUNCH_DATE) + 1;
  const idx = (((number - 1) % cycle.length) + cycle.length) % cycle.length;
  return { number, runId: cycle[idx] };
}
