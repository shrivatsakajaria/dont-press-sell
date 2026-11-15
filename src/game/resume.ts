// A game that must survive a page reload (I6: a run that would not load, retried by reloading).
// Kept in sessionStorage for one boot only; anything malformed is ignored.
import { RUN_IDS } from '../content/runs';
import type { Mode } from '../store/record';

export interface ResumeState {
  mode: Mode;
  runId: string;
  /** What the player starts with (a carried amount in double or nothing). */
  start: number;
  date?: string;
  dailyNumber?: number;
  borrowed?: boolean;
  /** The challenge link's code (challenge mode). */
  code?: string;
  /** A double-or-nothing run, and whether the start screen showed. */
  double?: boolean;
  gate?: boolean;
}

const KEY = 'dps:resume';
const MODES: Mode[] = ['mystery', 'daily', 'picked', 'rematch', 'challenge'];

function store(): Storage | null {
  try {
    return (globalThis as { sessionStorage?: Storage }).sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function saveResume(s: ResumeState): void {
  try {
    store()?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* no session storage: the reload starts afresh */
  }
}

/** The stored game, once: it is cleared as it is read. */
export function takeResume(): ResumeState | null {
  const st = store();
  if (!st) return null;
  let raw: string | null = null;
  try {
    raw = st.getItem(KEY);
    st.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as ResumeState;
    if (!v || typeof v !== 'object') return null;
    if (!MODES.includes(v.mode) || !RUN_IDS.includes(v.runId)) return null;
    if (!(typeof v.start === 'number' && Number.isFinite(v.start) && v.start > 0)) return null;
    if (v.mode === 'challenge' && typeof v.code !== 'string') return null;
    return v;
  } catch {
    return null;
  }
}
