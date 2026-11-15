// R64: the headline fit, checked on the real element. Pure helpers (the play screen does the measuring).

/** What the real news block shows with a step applied: px it overflows by, and the headline's line count. */
export interface FitCheck {
  overflow: number;
  lines: number;
}

/**
 * Applies steps from `start` (the probe's guess) downwards, checking the real element after each, until one
 * fits (no overflow beyond half a pixel of rounding, at most `maxLines` headline lines). Bounded: at most
 * one try per step. Returns the step left applied, and whether it fit (false: the floor, still over).
 */
export function settleStep(
  start: number, count: number, apply: (i: number) => void, check: () => FitCheck, maxLines = 3,
): { step: number; ok: boolean } {
  const last = Math.max(0, count - 1);
  for (let i = Math.max(0, Math.min(last, start)); i <= last; i++) {
    apply(i);
    const r = check();
    if (r.overflow <= 0.5 && r.lines <= maxLines) return { step: i, ok: true };
  }
  return { step: last, ok: false };
}

/** The whole lines of height `lineHeight` that fit in `room` px (never a part line). */
export function wholeLines(room: number, lineHeight: number): number {
  if (!(lineHeight > 0) || !(room > 0)) return 0;
  return Math.floor(room / lineHeight + 1e-6);
}
