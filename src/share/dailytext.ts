import { daysInRowLine, leadLine } from '../content/copy';

const BLOCKS = '▁▂▃▄▅▆▇█';
const SKETCH_LEN = 12;

/** 12 block characters sampled evenly from the balances, scaled between their min and max. */
function sketch(balances: number[]): string {
  const vals = balances.filter((n) => Number.isFinite(n));
  if (vals.length === 0) return BLOCKS[0].repeat(SKETCH_LEN);
  let min = Infinity;
  let max = -Infinity;
  for (const v of vals) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  let out = '';
  for (let i = 0; i < SKETCH_LEN; i++) {
    const idx = Math.round((i * (vals.length - 1)) / (SKETCH_LEN - 1));
    const v = vals[idx];
    const level = span > 0 ? Math.round(((v - min) / span) * (BLOCKS.length - 1)) : Math.floor(BLOCKS.length / 2);
    out += BLOCKS[level];
  }
  return out;
}

/** The pasteable daily result. It never names the crash. */
export function dailyText(
  n: number,
  verdictTitle: string,
  lead: number,
  balances: number[],
  url: string,
  daysInRow: number,
): string {
  const lines = [`Don't Press Sell, daily crash ${n}. ${verdictTitle}. ${leadLine(lead)}.`, sketch(balances)];
  if (daysInRow > 1) lines.push(daysInRowLine(daysInRow));
  lines.push(url);
  return lines.join('\n');
}
