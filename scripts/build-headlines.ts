// Writes data/runs/<id>.headlines.json (Headline[] only: no sources, no notes) from each
// run's headlines CSV, so the site ships one small lazy file per run.
// Usage: npx tsx scripts/build-headlines.ts (also run by `npm run build`).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Headline, RunData } from '../src/engine/types';
import { parseHeadlineRows, toHeadlines } from './lib/headlines';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data', 'runs');

export function headlinesFor(id: string): Headline[] {
  const run = JSON.parse(readFileSync(join(DIR, `${id}.prices.json`), 'utf8')) as RunData;
  const parsed = parseHeadlineRows(readFileSync(join(DIR, `${id}.headlines.csv`), 'utf8'));
  if (parsed.problems.length) throw new Error(`${id}: ${parsed.problems.join('; ')}`);
  return toHeadlines(parsed.rows, run).map(({ dayIndex, real, anon, big, sombre }) => ({ dayIndex, real, anon, big, sombre }));
}

const isMain = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  // runs.ts uses Vite's import.meta.glob, so the ids come from the files here.
  const ids = readdirSync(DIR).filter((f) => f.endsWith('.headlines.csv')).map((f) => f.replace('.headlines.csv', ''));
  for (const id of ids) {
    writeFileSync(join(DIR, `${id}.headlines.json`), JSON.stringify(headlinesFor(id)) + '\n');
  }
  console.log(`wrote ${ids.length} headline files`);
}
