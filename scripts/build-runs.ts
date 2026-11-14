// Builds the twelve playable runs from data/raw/gspc-daily.csv.
// Writes data/runs/<id>.prices.json (a RunData plus high and preCloses, ruling R13) and regenerates
// src/content/runs.ts (the manifest: RUNS, RUN_IDS, runMeta, loadRun).
// Run: npm run data:build
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { RunData, RunKind, RunMeta } from '../src/engine/types';
import { findEpisode, monthsBetween, monthsInWords } from './lib/episode';

export interface RunEntry {
  id: string;
  kind: RunKind;
  /** Plain name shown in "Pick a crash". */
  pickName: string;
  /**
   * The high the market must regain. Crash: the all-time record close before the fall.
   * Scare (ruling R12): its own prior peak, the highest close of the year before it.
   */
  highDate: string;
  /**
   * Crash: the whole reveal line. Scare: its first sentence; the build adds
   * "It was back in N months." counted from the lowest close to full recovery.
   */
  reveal: string;
}

/**
 * The launch pool (spec 7.2, lead rulings R1 and R12). A crash's high is the all-time
 * record close before it; a scare's high is its own prior peak (2010 and 2011 fall from
 * peaks below the October 2007 record).
 */
export const RUN_TABLE: RunEntry[] = [
  { id: 'c1929', kind: 'crash', pickName: '1929: the Wall Street Crash', highDate: '1929-09-16', reveal: 'That was 1929.' },
  { id: 'c1987', kind: 'crash', pickName: '1987: Black Monday', highDate: '1987-08-25', reveal: 'That was 1987.' },
  { id: 'c2000', kind: 'crash', pickName: '2000: the dot-com crash', highDate: '2000-03-24', reveal: 'That was 2000.' },
  { id: 'c2007', kind: 'crash', pickName: '2008: the financial crisis', highDate: '2007-10-09', reveal: 'That was 2008.' },
  { id: 'c2020', kind: 'crash', pickName: '2020: Covid', highDate: '2020-02-19', reveal: 'That was 2020.' },
  { id: 'c2022', kind: 'crash', pickName: '2022: inflation and interest rates', highDate: '2022-01-03', reveal: 'That was 2022.' },
  { id: 's1998', kind: 'scare', pickName: 'Summer 1998 Russia scare', highDate: '1998-07-17', reveal: 'That was the summer 1998 Russia scare.' },
  { id: 's2010', kind: 'scare', pickName: '2010 flash crash scare', highDate: '2010-04-23', reveal: 'That was the 2010 flash crash scare.' },
  { id: 's2011', kind: 'scare', pickName: '2011 debt downgrade scare', highDate: '2011-04-29', reveal: 'That was the 2011 debt downgrade scare.' },
  { id: 's2015', kind: 'scare', pickName: '2015 China scare', highDate: '2015-05-21', reveal: 'That was the 2015 China scare.' },
  { id: 's2018', kind: 'scare', pickName: 'Autumn 2018 wobble', highDate: '2018-09-20', reveal: 'That was the autumn 2018 wobble.' },
  { id: 's2025', kind: 'scare', pickName: 'Spring 2025 tariff scare', highDate: '2025-02-19', reveal: 'That was the spring 2025 tariff scare.' },
];

/**
 * What a prices.json holds: a RunData plus (lead ruling R13) the reference high's close
 * and the closes of the 30 trading days before day 1, oldest first. The lead adds
 * `high?` and `preCloses?` to RunData in types.ts at merge.
 */
export type RunFile = RunData & { high: number; preCloses: number[] };

/** Trading days of history before day 1 kept in each file. */
export const PRE_DAYS = 30;

export interface RunInfo {
  highDate: string;
  high: number;
  startDate: string;
  lowDate: string;
  low: number;
  /** Lowest close against the high, in percent (negative). */
  fallPct: number;
  fallEndDate: string;
  endDate: string;
  end: number;
  tradingDays: number;
  /** Absolute indices into the raw series. */
  highIndex: number;
  startIndex: number;
}

/** Builds one run and checks it against the pool's rules. Throws on any breach. */
export function buildRun(
  dates: string[],
  closes: number[],
  entry: RunEntry,
): { run: RunFile; info: RunInfo } {
  const highIndex = dates.indexOf(entry.highDate);
  if (highIndex < 0) throw new Error(`${entry.id}: high date ${entry.highDate} not in data`);
  const high = closes[highIndex];
  if (entry.kind === 'crash') {
    for (let i = 0; i < highIndex; i++) {
      if (closes[i] >= high) {
        throw new Error(`${entry.id}: ${entry.highDate} is not a record close (${dates[i]} was ${closes[i]})`);
      }
    }
  } else {
    // Ruling R12: a scare's high is the highest close in the year (365 calendar days) before it.
    const yearBefore = new Date(Date.parse(`${entry.highDate}T00:00:00Z`) - 365 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    for (let i = 0; i < highIndex; i++) {
      if (dates[i] >= yearBefore && closes[i] >= high) {
        throw new Error(`${entry.id}: ${entry.highDate} is not the highest close of the year before it (${dates[i]} was ${closes[i]})`);
      }
    }
  }

  const ep = findEpisode(dates, closes, entry.highDate, entry.kind);
  for (let i = highIndex + 1; i < ep.startIndex; i++) {
    if (closes[i] >= high) {
      throw new Error(`${entry.id}: a higher close (${dates[i]}) comes between the high and day 1`);
    }
  }

  const low = closes[ep.lowIndex];
  const fallPct = (low / high - 1) * 100;
  // Compare prices, not the percentage, so 80 against 100 counts as exactly 20% down.
  const fell20 = low <= high * 0.8 + 1e-9;
  const fell10 = low <= high * 0.9 + 1e-9;
  if (entry.kind === 'crash' && !fell20) {
    throw new Error(`${entry.id}: a crash must fall 20% or more; it fell ${fallPct.toFixed(2)}%`);
  }
  if (entry.kind === 'scare' && (fell20 || !fell10)) {
    throw new Error(`${entry.id}: a scare must fall 10% to under 20%; it fell ${fallPct.toFixed(2)}%`);
  }
  if (entry.kind === 'scare' && monthsBetween(dates[ep.startIndex], dates[ep.endIndex]) > 12) {
    throw new Error(`${entry.id}: a scare must recover within about a year of day 1`);
  }

  let revealLine = entry.reveal;
  if (entry.kind === 'scare') {
    const months = monthsBetween(dates[ep.lowIndex], dates[ep.endIndex]);
    revealLine = `${entry.reveal} It was back in ${monthsInWords(months)}.`;
  }

  const s = ep.startIndex;
  const run: RunFile = {
    id: entry.id,
    kind: entry.kind,
    pickName: entry.pickName,
    revealLine,
    dates: dates.slice(s, ep.endIndex + 1),
    closes: closes.slice(s, ep.endIndex + 1),
    lowIndex: ep.lowIndex - s,
    fallEndIndex: ep.fallEndIndex - s,
    high,
    preCloses: closes.slice(Math.max(0, s - PRE_DAYS), s),
  };
  const info: RunInfo = {
    highDate: entry.highDate,
    high,
    startDate: dates[s],
    lowDate: dates[ep.lowIndex],
    low,
    fallPct,
    fallEndDate: dates[ep.fallEndIndex],
    endDate: dates[ep.endIndex],
    end: closes[ep.endIndex],
    tradingDays: ep.endIndex - s + 1,
    highIndex,
    startIndex: s,
  };
  return { run, info };
}

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Reads data/raw/gspc-daily.csv. */
export function readRaw(): { dates: string[]; closes: number[] } {
  const text = readFileSync(resolve(ROOT, 'data/raw/gspc-daily.csv'), 'utf8');
  const lines = text.trim().split('\n');
  if (lines[0] !== 'date,close') throw new Error('unexpected header in gspc-daily.csv');
  const dates: string[] = [];
  const closes: number[] = [];
  for (const line of lines.slice(1)) {
    const [d, c] = line.split(',');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Number(c))) throw new Error(`bad row: ${line}`);
    dates.push(d);
    closes.push(Number(c));
  }
  return { dates, closes };
}

/** Builds all twelve runs. */
export function buildAll(): { run: RunFile; info: RunInfo }[] {
  const { dates, closes } = readRaw();
  return RUN_TABLE.map((entry) => buildRun(dates, closes, entry));
}

function manifestSource(runs: RunData[]): string {
  const metas: RunMeta[] = runs.map(({ id, kind, pickName, revealLine }) => ({ id, kind, pickName, revealLine }));
  const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const rows = metas
    .map((m) => `  { id: ${q(m.id)}, kind: ${q(m.kind)}, pickName: ${q(m.pickName)}, revealLine: ${q(m.revealLine)} },`)
    .join('\n');
  return `// GENERATED by scripts/build-runs.ts from data/raw/gspc-daily.csv. Do not edit by hand:
// change the table in scripts/build-runs.ts and run \`npm run data:build\`.
import type { RunData, RunMeta } from '../engine/types';

export const RUNS: RunMeta[] = [
${rows}
];

export const RUN_IDS: string[] = RUNS.map((r) => r.id);

export function runMeta(id: string): RunMeta | undefined {
  return RUNS.find((r) => r.id === id);
}

// One lazily loaded chunk per run, so the main bundle carries no prices.
const loaders = import.meta.glob<RunData>('../../data/runs/*.prices.json', { import: 'default' });

/** Loads a run's prices (data/runs/<id>.prices.json). */
export async function loadRun(id: string): Promise<RunData> {
  const load = loaders[\`../../data/runs/\${id}.prices.json\`];
  if (!load) throw new Error(\`unknown run: \${id}\`);
  return load();
}
`;
}

function main(): void {
  const built = buildAll();
  mkdirSync(resolve(ROOT, 'data/runs'), { recursive: true });
  // Remove price files of runs no longer in the table, so loadRun's glob cannot see them.
  const keep = new Set(built.map((b) => `${b.run.id}.prices.json`));
  for (const f of readdirSync(resolve(ROOT, 'data/runs'))) {
    if (f.endsWith('.prices.json') && !keep.has(f)) {
      rmSync(resolve(ROOT, 'data/runs', f));
      console.log(`removed stale data/runs/${f}`);
    }
  }
  for (const { run } of built) {
    writeFileSync(resolve(ROOT, `data/runs/${run.id}.prices.json`), JSON.stringify(run) + '\n');
  }
  writeFileSync(resolve(ROOT, 'src/content/runs.ts'), manifestSource(built.map((b) => b.run)));

  console.log('id     high                start       low                          fall end    recovery    days');
  for (const { run, info } of built) {
    console.log(
      [
        run.id.padEnd(6),
        `${info.highDate} ${info.high.toFixed(2).padStart(8)}`,
        info.startDate,
        `${info.lowDate} ${info.low.toFixed(2).padStart(8)} ${info.fallPct.toFixed(2).padStart(6)}%`,
        info.fallEndDate,
        info.endDate,
        String(info.tradingDays).padStart(5),
      ].join('  '),
    );
  }
  console.log(`wrote ${built.length} price files to data/runs and src/content/runs.ts`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
