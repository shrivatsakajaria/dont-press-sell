// Shared types. Every module uses these exact names (plan, "Shared types").

export type RunKind = 'crash' | 'scare';

/**
 * One playable run: daily closes from day 1 (the first close about 7% below
 * the previous high) to the first close back above that high.
 * Stored on disk as `data/runs/<id>.prices.json` with exactly these fields.
 */
export interface RunData {
  id: string;
  kind: RunKind;
  pickName: string;
  revealLine: string;
  dates: string[]; // ISO yyyy-mm-dd, trading days only
  closes: number[];
  lowIndex: number;
  fallEndIndex: number;
  /** The closes before day 1 (in the run files), so day 1 has a move of its own. */
  preCloses?: number[];
}

export interface Headline {
  dayIndex: number;
  real: string;
  anon: string;
  big: boolean;
  sombre: boolean;
}

export interface Trade {
  dayIndex: number;
  side: 'sell' | 'buy';
}

export interface RunResult {
  final: number;
  holderFinal: number;
  perfectFinal: number;
  lead: number;
  share: number;
  balances: number[];
  daysInCash: number;
  trades: Trade[];
}

export type VerdictId =
  | 'marginCalled'
  | 'bigShort'
  | 'nerves'
  | 'diamond'
  | 'shakenOut'
  | 'paper'
  | 'cashGang'
  | 'overtrader'
  | 'bagholder';

/** Result of a borrowed-money run (spec 6.13). `wipedAt` is the day index of a wipe-out, or null. */
export type BorrowedResult = RunResult & { wipedAt: number | null };

/** Run metadata without prices: what the manifest in src/content/runs.ts lists. */
export interface RunMeta {
  id: string;
  kind: RunKind;
  pickName: string;
  revealLine: string;
}
