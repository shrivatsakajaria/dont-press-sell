// Usage: npx tsx scripts/check-headlines.ts [--final] [runId ...]
// Checks data/runs/<id>.headlines.csv against data/runs/<id>.prices.json. Exit 1 on any problem.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunData } from '../src/engine/types';
import { checkHeadlines, parseHeadlineRows } from './lib/headlines';

const dir = join(process.cwd(), 'data', 'runs');
const args = process.argv.slice(2);
const unknown = args.filter((a) => a.startsWith('--') && a !== '--final');
if (unknown.length) {
  console.error(`unknown option: ${unknown.join(' ')}`);
  console.error('usage: npx tsx scripts/check-headlines.ts [--final] [runId ...]');
  process.exit(2);
}
const final = args.includes('--final');
const wanted = args.filter((a) => !a.startsWith('--'));

const ids = wanted.length
  ? wanted
  : existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.prices.json')).map((f) => f.replace('.prices.json', '')).sort()
    : [];

let failed = false;
let checked = 0;
for (const id of ids) {
  const csv = join(dir, `${id}.headlines.csv`);
  const prices = join(dir, `${id}.prices.json`);
  if (!existsSync(csv)) { console.log(`${id}: no headlines file yet, skipped`); continue; }
  if (!existsSync(prices)) { console.log(`${id}: FAIL no prices file`); failed = true; continue; }
  const run = JSON.parse(readFileSync(prices, 'utf8')) as RunData;
  const parsed = parseHeadlineRows(readFileSync(csv, 'utf8'));
  const problems = [...parsed.problems, ...checkHeadlines(parsed.rows, run, { final })];
  checked++;
  if (problems.length) {
    failed = true;
    console.log(`${id}: FAIL (${problems.length})`);
    for (const p of problems) console.log(`  ${p}`);
  } else console.log(`${id}: ok (${parsed.rows.length} rows)`);
}
if (ids.length === 0) console.log('no runs found in data/runs');
console.log(`${checked} file(s) checked${final ? ' (final)' : ''}`);
process.exit(failed ? 1 : 0);
