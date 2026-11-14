import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { commentaryFor, NEUTRAL_LINES } from '../../src/content/commentary';
import type { RunData } from '../../src/engine/types';

// Whole-run scan: every day of every real run, both invested states, several
// rng values. Every number and claim in the line is checked against an
// independent computation from the prices.

const ROOT = join(__dirname, '..', '..');
const RUN_DIR = join(ROOT, 'data', 'runs');
const RAW = join(ROOT, 'data', 'raw', 'gspc-daily.csv');

const NUM: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const num = (w: string) => NUM[w] ?? Number(w);

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Raw { dates: string[]; closes: number[] }
function loadRaw(): Raw {
  const dates: string[] = [];
  const closes: number[] = [];
  for (const row of readFileSync(RAW, 'utf8').trim().split('\n').slice(1)) {
    const [d, c] = row.split(',');
    dates.push(d);
    closes.push(Number(c));
  }
  return { dates, closes };
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function check(line: string, ctx: Parameters<typeof commentaryFor>[0]): number {
  const i = ctx.dayIndex;
  const series = [...ctx.preCloses, ...ctx.closes.slice(0, i + 1)];
  const n = series.length - 1;
  const px = series[n];
  const ch: number[] = [];
  for (let k = 1; k <= n; k++) ch.push((series[k] / series[k - 1] - 1) * 100);
  const chg = ch[n - 1];
  const peak = Math.max(ctx.high, ...series);
  const dd = ((peak - px) / peak) * 100;
  let maxDd = 0;
  let rp = ctx.high;
  for (const x of series) {
    rp = Math.max(rp, x);
    maxDd = Math.max(maxDd, ((rp - x) / rp) * 100);
  }
  const run = ctx.closes.slice(0, i + 1);
  const runMax = Math.max(...run);
  const runFall = ((runMax - px) / runMax) * 100;
  const low = Math.min(...run);
  const streak = (dir: 1 | -1, end: number) => {
    let r = 0;
    for (let j = end; j >= 1 && (series[j] - series[j - 1]) * dir > 0; j--) r++;
    return r;
  };
  const ddMatches = (txt: string) =>
    txt === 'almost 20' ? dd >= 19.5 && dd < 20 : Number(txt) === Math.round(dd) && !(dd < 20 && Math.round(dd) === 20);
  const player = i > 0;
  let checks = 0;
  const ok = (cond: boolean, msg: string) => {
    checks++;
    if (!cond) throw new Error(`${msg}\n  line: ${line}\n  day ${i}, invested ${ctx.invested}, neverSold ${ctx.neverSold}`);
  };
  let m: RegExpMatchArray | null;

  if ((m = line.match(/The market is down (almost 20|\d+)% from the peak/))) ok(ddMatches(m[1]), 'peak figure');
  if (line.includes('a correction')) ok(dd >= 10 && dd < 20 && maxDd < 20, 'correction band');
  if (line.includes('bear market')) ok(dd >= 20, 'bear band');
  if (line.startsWith('About a third')) ok(dd >= 30 && dd <= 40, 'third band');
  if (line.startsWith('About half')) ok(dd >= 45 && dd <= 55, 'half band');
  if (line.startsWith('More than half')) ok(dd > 55, 'more than half band');
  if ((m = line.match(/still (almost 20|\d+)% below the peak/))) ok(ddMatches(m[1]), 'below-peak figure');
  if ((m = line.match(/market (fell|lost|rose) (\d+)% in (?:one|a) day/))) {
    ok(Number(m[2]) === Math.round(Math.abs(chg)), 'one-day figure');
    ok(m[1] === 'rose' ? chg > 0 : chg < 0, 'one-day direction');
  }
  if ((m = line.match(/market is down (\d+)% since day one/))) {
    const f = ctx.closes[0];
    ok(Number(m[1]) === Math.round(((f - px) / f) * 100), 'since day one');
  }
  if ((m = line.match(/market is up (\d+)% (?:from its|off its) lowest close/))) {
    ok(Number(m[1]) === Math.round(((px - low) / low) * 100), 'from low');
  }
  if ((m = line.match(/(Down|Up) (\d+)% on your money/))) {
    const r = (ctx.balance / ctx.start - 1) * 100;
    ok(Number(m[2]) === Math.round(Math.abs(r)) && (m[1] === 'Down' ? r < 0 : r > 0), 'money pct');
  }
  if ((m = line.match(/Your \$([\d,]+) is now \$([\d,]+)/))) {
    ok(m[1] === fmt(ctx.start) && m[2] === fmt(ctx.balance) && m[1] !== m[2], 'money amounts');
  }
  if ((m = line.match(/Prices (down|up) (\w+) days in a row/))) {
    const dir = m[1] === 'down' ? -1 : 1;
    const r = streak(dir, n);
    ok(num(m[2]) === r, 'streak count');
    if (dir === -1) ok(r < n, 'streak not cut off');
  }
  if ((m = line.match(/A bounce after (\w+) falling days/))) {
    const r = streak(-1, n - 1);
    ok(chg > 0 && num(m[1]) === r && r < n - 1, 'bounce count');
  }
  if ((m = line.match(/Prices are (down|up) (\d+)% in a week/))) {
    const w = (px / series[n - 5] - 1) * 100;
    ok(Number(m[2]) === Math.round(Math.abs(w)) && (m[1] === 'down' ? w <= -5 : w >= 5), 'week figure');
  }
  if ((m = line.match(/The (best|worst) day in at least (\w+) weeks/))) {
    const w = num(m[2]);
    const earlier = ch.slice(0, -1);
    ok(w <= Math.floor(n / 5) && w >= 2, 'weeks window');
    if (m[1] === 'best') ok(chg >= 1 && chg > Math.max(...earlier), 'best day');
    else ok(chg <= -1 && chg < Math.min(...earlier), 'worst day');
  }
  if (line.includes('dip kept dipping')) {
    ok(chg < 0 && ch[n - 2] >= 1 && px < Math.min(...ctx.closes.slice(0, i)), 'dipped again');
  }
  if (line.startsWith('Five quiet days')) ok(ch.slice(-5).every((x) => Math.abs(x) < 0.5) && dd >= 3, 'quiet');
  if (line.startsWith('Back within three percent')) ok(dd > 0 && dd <= 3, 'within three');
  if ((m = line.match(/held through a fall of (\d+)% so far/))) {
    ok(Number(m[1]) === Math.round(runFall) && runFall >= 20 && ctx.neverSold && ctx.invested, 'held fall');
  }
  if (/^Holding|Still holding/.test(line)) ok(ctx.neverSold && ctx.invested, 'holding needs neverSold');
  if (/ahead|behind/i.test(line)) ok(false, 'no ahead/behind');

  const inLine = /in the market for it|there for it/.test(line);
  const outLine = /sat out|without you|missed it|out of it|Out for today|sidelines/.test(line);
  if (inLine) ok(player && ctx.invested, 'in-market line needs a held move');
  if (outLine) ok(player && !ctx.invested, 'out line needs a missed move');
  if (/Still holding\?/.test(line)) ok(player && ctx.invested && ctx.neverSold, 'still holding');
  return checks;
}

function checkNeutral(line: string, ctx: Parameters<typeof commentaryFor>[0]) {
  expect(NEUTRAL_LINES).toContain(line);
  const i = ctx.dayIndex;
  const series = [...ctx.preCloses, ...ctx.closes.slice(0, i + 1)];
  const n = series.length - 1;
  const chg = series[n] - series[n - 1];
  const peak = Math.max(ctx.high, ...series);
  const peakBefore = Math.max(ctx.high, ...series.slice(0, n));
  const dd = ((peak - series[n]) / peak) * 100;
  if (/fall|lower|losses/.test(line)) expect(chg).toBeLessThan(0);
  if (/Markets fall again|Another day of losses/.test(line)) expect(series[n - 1] - series[n - 2]).toBeLessThan(0);
  if (/higher|rise|recover/.test(line)) expect(chg).toBeGreaterThan(0);
  if (line === 'Markets recover some ground.') expect(series[n - 1]).toBeLessThan(peakBefore);
  if (line === 'Prices are below where they were.') expect(dd).toBeGreaterThanOrEqual(5);
}

describe('whole-run scan over the twelve real runs', () => {
  const files = readdirSync(RUN_DIR).filter((f) => f.endsWith('.prices.json'));
  const raw = loadRaw();

  it('finds all twelve run files', () => {
    expect(files.length).toBe(12);
  });

  for (const f of files) {
    it(`every line is true on every day of ${f}`, { timeout: 120_000 }, () => {
      const run = JSON.parse(readFileSync(join(RUN_DIR, f), 'utf8')) as RunData;
      const start = raw.dates.indexOf(run.dates[0]);
      expect(start).toBeGreaterThan(30);
      const pre = raw.closes.slice(start - 30, start);
      const high = Math.max(...raw.closes.slice(Math.max(0, start - 250), start));
      let total = 0;
      const seenLines = new Set<string>();
      for (let d = 0; d < run.closes.length; d++) {
        for (const invested of [true, false]) {
          for (const neverSold of [true, false]) {
            const balance = neverSold ? (10000 * run.closes[d]) / run.closes[0] : 9100;
            for (const sombre of [false, true]) {
              if (sombre && !(invested && neverSold)) continue;
              for (let r = 1; r <= (sombre ? 1 : 2); r++) {
                const ctx = {
                  closes: run.closes, dayIndex: d, invested, neverSold, balance, start: 10000,
                  sombre, high, preCloses: pre, rng: lcg(d * 31 + r * 977),
                };
                const line = commentaryFor(ctx);
                seenLines.add(line);
                if (sombre) checkNeutral(line, ctx);
                else total += check(line, ctx);
              }
            }
          }
        }
      }
      expect(total).toBeGreaterThan(50);
      expect(seenLines.size).toBeGreaterThan(10);
    });
  }
});
