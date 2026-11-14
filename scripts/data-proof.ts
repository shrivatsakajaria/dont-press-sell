// Writes the data proof for SK (spec 12, plan Task 2 step 6):
//   docs/review/data-proof.html  the 2008 run as a plain line chart with five famous days
//   docs/review/runs-summary.md  the twelve runs in plain words
// Run after data:fetch and data:build: npm run data:proof
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAll, readRaw, ROOT, type RunInfo } from './build-runs';
import type { RunData } from '../src/engine/types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "29 September 2008" */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Calendar time in plain words: "5 weeks", "4 months", "2 years 8 months". */
export function duration(from: string, to: string): string {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days < 7) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.round(days / (365.25 / 12));
  if (months < 2) {
    const weeks = Math.round(days / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  if (months < 24) return `${months} months`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y} years${m ? ` ${m} month${m === 1 ? '' : 's'}` : ''}`;
}

const pct = (x: number, dp = 2) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(dp)}%`;
const level = (x: number) => x.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface FamousDay {
  date: string;
  what: string;
}

const FAMOUS_2008: FamousDay[] = [
  { date: '2008-09-29', what: 'Congress votes down the bank rescue' },
  { date: '2008-10-13', what: 'Rebound after the weekend bank bail-outs' },
  { date: '2008-10-15', what: 'Sell-off two days later' },
  { date: '2008-11-20', what: 'Lowest close of 2008' },
  { date: '2009-03-09', what: 'The bottom: lowest close of the whole fall' },
];

interface DayMove {
  date: string;
  close: number;
  prevDate: string;
  prevClose: number;
  movePct: number;
  index: number; // within the run
}

function dayMove(raw: { dates: string[]; closes: number[] }, run: RunData, date: string): DayMove {
  const i = raw.dates.indexOf(date);
  const index = run.dates.indexOf(date);
  if (i < 1 || index < 0) throw new Error(`${date} is not a trading day in ${run.id}`);
  const close = raw.closes[i];
  const prevClose = raw.closes[i - 1];
  return { date, close, prevDate: raw.dates[i - 1], prevClose, movePct: (close / prevClose - 1) * 100, index };
}

/** An SVG line chart of closes[from..to] with labelled markers. */
function chartSvg(
  run: RunData,
  from: number,
  to: number,
  marks: { index: number; label: string[]; dx?: number; dy?: number; anchor?: string }[],
  opts: { width: number; height: number; yTicks: number[]; xTicks: { index: number; label: string }[] },
): string {
  const { width: W, height: H } = opts;
  const padL = 44, padR = 12, padT = 16, padB = 28;
  const closes = run.closes.slice(from, to + 1);
  const lo = Math.min(...closes, ...opts.yTicks);
  const hi = Math.max(...closes, ...opts.yTicks);
  const x = (i: number) => padL + ((i - from) / (to - from)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const pts = closes.map((c, k) => `${x(from + k).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
  const grid = opts.yTicks
    .map(
      (v) =>
        `<line x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/>` +
        `<text x="${padL - 4}" y="${(y(v) + 3.5).toFixed(1)}" class="ytick">${v.toLocaleString('en-GB')}</text>`,
    )
    .join('');
  const xt = opts.xTicks
    .map(
      (t) =>
        `<line x1="${x(t.index).toFixed(1)}" x2="${x(t.index).toFixed(1)}" y1="${H - padB}" y2="${H - padB + 4}" class="axis"/>` +
        `<text x="${x(t.index).toFixed(1)}" y="${H - padB + 15}" class="xtick">${esc(t.label)}</text>`,
    )
    .join('');
  const mk = marks
    .map((m) => {
      const cx = x(m.index);
      const cy = y(run.closes[m.index]);
      const tx = cx + (m.dx ?? 0);
      const ty = cy + (m.dy ?? -10 - (m.label.length - 1) * 12);
      const anchor = m.anchor ?? 'middle';
      const tspans = m.label
        .map((l, k) => `<tspan x="${tx.toFixed(1)}" dy="${k === 0 ? 0 : 12}">${esc(l)}</tspan>`)
        .join('');
      return (
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" class="mark"/>` +
        `<text x="${cx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}" class="label">${tspans}</text>`
      );
    })
    .join('');
  return (
    `<svg viewBox="0 0 ${W} ${H}" role="img" xmlns="http://www.w3.org/2000/svg">` +
    `<line x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}" class="axis"/>` +
    grid + xt +
    `<polyline points="${pts}" class="line"/>` +
    mk +
    `</svg>`
  );
}

// Label positions in the close-up, one per famous day, chosen so no label sits on the line.
const ZOOM_PLACES = [
  { dx: -8, dy: -2, anchor: 'end' },
  { dx: 10, dy: -14, anchor: 'start' },
  { dx: -8, dy: 10, anchor: 'end' },
  { dx: 0, dy: 20, anchor: 'middle' },
  { dx: 0, dy: 20, anchor: 'middle' },
];

function firstIndexOnOrAfter(run: RunData, iso: string): number {
  const i = run.dates.findIndex((d) => d >= iso);
  if (i < 0) throw new Error(`no date on or after ${iso}`);
  return i;
}

function proofHtml(run: RunData, info: RunInfo, moves: (DayMove & { what: string })[]): string {
  const last = run.closes.length - 1;
  const yearTicks = ['2008', '2009', '2010', '2011', '2012', '2013'].map((y) => ({
    index: firstIndexOnOrAfter(run, `${y}-01-01`),
    label: y,
  }));
  const short = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
  };
  const full = chartSvg(
    run,
    0,
    last,
    moves.map((m, k) => ({ index: m.index, label: [String(k + 1)], dx: -7, dy: 4, anchor: 'end' })),
    { width: 360, height: 230, yTicks: [600, 800, 1000, 1200, 1400, 1600], xTicks: yearTicks },
  );
  const zFrom = firstIndexOnOrAfter(run, '2008-09-01');
  const zTo = firstIndexOnOrAfter(run, '2009-04-01');
  const zoom = chartSvg(
    run,
    zFrom,
    zTo,
    moves.map((m, k) => ({ index: m.index, label: [short(m.date), pct(m.movePct, 1)], ...ZOOM_PLACES[k] })),
    {
      width: 360,
      height: 300,
      yTicks: [600, 800, 1000, 1200, 1400],
      xTicks: ['2008-10-01', '2008-12-01', '2009-02-01', '2009-04-01'].map((d) => ({
        index: Math.min(firstIndexOnOrAfter(run, d), zTo),
        label: short(d).replace(/^1 /, ''),
      })),
    },
  );
  const rows = moves
    .map(
      (m, k) =>
        `<tr><td>${k + 1}</td><td>${longDate(m.date)}<br><span class="note">${esc(m.what)}</span></td>` +
        `<td class="num">${level(m.close)}</td><td class="num">${pct(m.movePct)}</td></tr>`,
    )
    .join('\n');
  const prevRows = moves
    .map(
      (m) =>
        `<tr><td class="date">${m.date}</td><td class="date">${m.prevDate}</td><td class="num">${level(m.prevClose)}</td>` +
        `<td class="num">${level(m.close)}</td><td class="num">${pct(m.movePct, 4)}</td></tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data proof: 2008</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #fbfaf7; color: #1a1a1a; font: 16px/1.45 Georgia, 'Times New Roman', serif; }
  main { max-width: 680px; margin: 0 auto; padding: 20px 16px 40px; }
  h1 { font-size: 1.5rem; line-height: 1.2; margin: 0 0 6px; }
  h2 { font-size: 1.1rem; margin: 28px 0 6px; }
  p { margin: 8px 0; }
  .lede { color: #444; }
  svg { width: 100%; height: auto; display: block; margin: 8px 0; }
  .line { fill: none; stroke: #b3261e; stroke-width: 1.4; stroke-linejoin: round; }
  .grid { stroke: #e2ded5; stroke-width: 1; }
  .axis { stroke: #888; stroke-width: 1; }
  .ytick, .xtick { font: 10px system-ui, sans-serif; fill: #555; }
  .ytick { text-anchor: end; }
  .xtick { text-anchor: middle; }
  .mark { fill: #1a1a1a; }
  .label { font: 700 10.5px system-ui, sans-serif; fill: #1a1a1a; paint-order: stroke; stroke: #fbfaf7; stroke-width: 3px; stroke-linejoin: round; }
  td.date { white-space: nowrap; }
  table { border-collapse: collapse; width: 100%; font: 14px/1.35 system-ui, sans-serif; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 7px 6px; border-bottom: 1px solid #e2ded5; vertical-align: top; }
  th { font-weight: 600; color: #444; }
  .num { text-align: right; white-space: nowrap; }
  .note { color: #555; font-size: 13px; }
  .small { font: 13px/1.45 system-ui, sans-serif; color: #444; }
  .scroll { overflow-x: auto; }
</style>
</head>
<body>
<main>
<h1>2008: the real numbers</h1>
<p class="lede">Every daily closing value of the US stock market index from the first day of the 2008 run to the day it was back above its old high. Downloaded from Yahoo Finance's free history (symbol ^GSPC).</p>

<h2>The whole run</h2>
<p class="small">${longDate(info.startDate)} to ${longDate(info.endDate)}: ${info.tradingDays.toLocaleString('en-GB')} trading days. Numbered dots are the five days below.</p>
${full}

<h2>Autumn 2008 to spring 2009, close up</h2>
${zoom}

<h2>Five famous days</h2>
<table>
<thead><tr><th></th><th>Day</th><th class="num">Close</th><th class="num">Day's move</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p class="small">The day's move is that day's close against the previous trading day's close.</p>

<h2>The run in plain words</h2>
<p>The old high was ${level(info.high)} on ${longDate(info.highDate)}. The run starts on ${longDate(info.startDate)}, the first close at least 7% below that high (${level(run.closes[0])}). The lowest close was ${level(info.low)} on ${longDate(info.lowDate)}, ${pct(info.fallPct)} from the high. The fall phase ends on ${longDate(info.fallEndDate)}, the first close 20% above the lowest. The run ends on ${longDate(info.endDate)}, the first close back above the old high (${level(info.end)}).</p>

<h2>Workings</h2>
<div class="scroll">
<table>
<thead><tr><th>Date</th><th>Previous day</th><th class="num">Previous close</th><th class="num">Close</th><th class="num">Move</th></tr></thead>
<tbody>
${prevRows}
</tbody>
</table>
</div>
<p class="small">Closes are as published by Yahoo Finance, to two decimals. Comparison with a second source is done separately (plan Task 2 step 5) before the price files are merged.</p>
</main>
</body>
</html>
`;
}

function summaryMd(built: { run: RunData; info: RunInfo }[]): string {
  const lines: string[] = [
    '# The twelve runs',
    '',
    'Daily closing values of the US stock market index from Yahoo Finance (symbol ^GSPC), built by `scripts/build-runs.ts`.',
    '',
    'How each run is cut (spec 7.3):',
    '',
    '- **High:** the level the market has to get back above. For a crash, the all-time record close before the fall. For a scare, its own prior peak: the highest close of the year before it (lead ruling R12). The 2010 and 2011 peaks were below the October 2007 record.',
    '- **Day 1:** the first close at least 7% below that high.',
    '- **Low:** the lowest close of the run, and how far it is below the high.',
    '- **Fall ends:** for a crash, the first close 20% above the low; for a scare, the first close two-thirds of the way back from the low to the high. After this the game fast-forwards.',
    '- **Recovery:** the first close above the high. This is the last day of the run.',
    '- **The fall took** high to low; **the recovery took** low to recovery. Scare reveal lines count months the same way (low to recovery, to the nearest month).',
    '',
    '| Run | High | Day 1 | Low | Fall ends | Recovery | Trading days | Fall took | Recovery took |',
    '|---|---|---|---|---|---|--:|---|---|',
  ];
  for (const { run, info } of built) {
    lines.push(
      `| ${run.id} | ${info.highDate} (${level(info.high)}) | ${info.startDate} | ${info.lowDate} (${level(info.low)}, ${pct(info.fallPct)}) | ${info.fallEndDate} | ${info.endDate} | ${info.tradingDays.toLocaleString('en-GB')} | ${duration(info.highDate, info.lowDate)} | ${duration(info.lowDate, info.endDate)} |`,
    );
  }
  lines.push('', '## In plain words', '');
  for (const { run, info } of built) {
    const kind = run.kind === 'crash' ? 'Crash' : 'Scare';
    lines.push(
      `**${run.pickName}** (${kind.toLowerCase()}, \`${run.id}\`). ` +
        `The market peaked at ${level(info.high)} on ${longDate(info.highDate)}. ` +
        `The run starts on ${longDate(info.startDate)}. ` +
        `It fell ${pct(Math.abs(info.fallPct)).slice(1)} to its lowest close on ${longDate(info.lowDate)}, ${duration(info.highDate, info.lowDate)} after the peak. ` +
        `The fall phase ends on ${longDate(info.fallEndDate)}. ` +
        `It was back above the old high on ${longDate(info.endDate)}, ${duration(info.lowDate, info.endDate)} after the low. ` +
        `${info.tradingDays.toLocaleString('en-GB')} trading days in all. ` +
        `Reveal line: "${run.revealLine}"`,
      '',
    );
  }
  return lines.join('\n');
}

function main(): void {
  const raw = readRaw();
  const built = buildAll();
  const c2007 = built.find((b) => b.run.id === 'c2007');
  if (!c2007) throw new Error('c2007 missing');
  const moves = FAMOUS_2008.map((f) => ({ ...dayMove(raw, c2007.run, f.date), what: f.what }));
  mkdirSync(resolve(ROOT, 'docs/review'), { recursive: true });
  const html = proofHtml(c2007.run, c2007.info, moves);
  if (/S&(amp;)?P/.test(html)) throw new Error('the index name must not appear');
  writeFileSync(resolve(ROOT, 'docs/review/data-proof.html'), html);
  writeFileSync(resolve(ROOT, 'docs/review/runs-summary.md'), summaryMd(built));
  for (const m of moves) console.log(`${m.date}  ${level(m.close).padStart(9)}  ${pct(m.movePct)}`);
  console.log('wrote docs/review/data-proof.html and docs/review/runs-summary.md');
}

main();
