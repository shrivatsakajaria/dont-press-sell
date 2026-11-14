// Headline CSV parsing and rules, as pure functions (plan Task 10 step 1, spec 8.4).
import type { Headline, RunData } from '../../src/engine/types';

export const COLUMNS = [
  'date', 'real', 'anon', 'big', 'sombre', 'source_url', 'second_source_url', 'note',
] as const;

export interface HeadlineRow {
  date: string;
  real: string;
  anon: string;
  big: boolean;
  sombre: boolean;
  source_url: string;
  second_source_url: string;
  note: string;
}

export const MAX_LINE = 56;
/** Jargon banned from anon lines, as case-insensitive stems that also catch simple plurals. */
export const JARGON: { label: string; re: RegExp }[] = [
  { label: 'funds', re: /\bfunds?\b/i },
  { label: 'liquidity', re: /\bliquidity\b/i },
  { label: 'equities', re: /\bequit(?:y|ies)\b/i },
  { label: 'tranche', re: /\btranches?\b/i },
  { label: 'basis points', re: /\bbasis points?\b/i },
  { label: 'yield', re: /\byields?\b/i },
];
/**
 * Capitalised words exempt from the name rule: ordinary sentence-start words and
 * country abbreviations. Any other capitalised word in `real`, the first word
 * included, is treated as a name and must not appear in `anon`.
 */
export const ALLOW = [
  'A', 'An', 'The', 'Over', 'After', 'Before', 'Shares', 'Stocks', 'Markets', 'Banks',
  'Investors', 'Officials', 'Traders', 'Prices', 'Rates', 'Government', 'Congress',
  'Shops', 'Stores', 'Companies', 'People', 'Workers', 'Another', 'More', 'Some', 'Many',
  'Most', 'No', 'New', 'In', 'On', 'At', 'As', 'By', 'For', 'From', 'Into', 'With',
  'US', 'UK', 'EU', 'I',
];

/** RFC 4180 parser: quoted fields, "" escapes, commas and newlines inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  return parseCsvChecked(text).rows;
}

/** Like parseCsv, but also reports whether a quoted field was never closed. */
export function parseCsvChecked(text: string): { rows: string[][]; unterminated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let any = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; any = true; }
    else if (c === ',') { row.push(field); field = ''; any = true; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (any || field !== '') { row.push(field); rows.push(row); }
      row = []; field = ''; any = false;
    } else { field += c; any = true; }
  }
  if (any || field !== '') { row.push(field); rows.push(row); }
  return { rows, unterminated: quoted };
}

function parseBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'x'].includes(s)) return true;
  if (['', 'false', '0', 'no', 'n'].includes(s)) return false;
  return null;
}

/** Turn CSV text into rows. Structural problems (header, column count, bad flags) come back as problems. */
export function parseHeadlineRows(text: string): { rows: HeadlineRow[]; problems: string[] } {
  const { rows: table, unterminated } = parseCsvChecked(text.replace(/^\uFEFF/, ''));
  const problems: string[] = [];
  if (unterminated) {
    return { rows: [], problems: ['unterminated quote: a quoted field is never closed, so the rest of the file is unreadable'] };
  }
  const rows: HeadlineRow[] = [];
  if (table.length === 0) return { rows, problems: ['file is empty'] };
  const header = table[0].map((h) => h.trim());
  if (header.join(',') !== COLUMNS.join(',')) {
    return { rows, problems: [`header must be exactly: ${COLUMNS.join(',')}`] };
  }
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    if (cells.length !== COLUMNS.length) {
      problems.push(`row ${line}: expected ${COLUMNS.length} columns, found ${cells.length}`);
      return;
    }
    const [date, real, anon, big, sombre, source_url, second_source_url, note] = cells;
    const b = parseBool(big);
    const s = parseBool(sombre);
    if (b === null) problems.push(`row ${line}: big must be true or false`);
    if (s === null) problems.push(`row ${line}: sombre must be true or false`);
    rows.push({
      date: date.trim(), real: real.trim(), anon: anon.trim(), big: b === true, sombre: s === true,
      source_url: source_url.trim(), second_source_url: second_source_url.trim(), note: note.trim(),
    });
  });
  return { rows, problems };
}

function words(line: string): string[] {
  return line.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
}

function stem(w: string): string {
  return w.replace(/['\u2019]s$/i, '').toLowerCase();
}

/** Capitalised words of `real` that are not on the allow-list (possessives stripped). */
function namesIn(real: string): string[] {
  return words(real)
    .filter((w) => /^\p{Lu}/u.test(w))
    .map((w) => w.replace(/['\u2019]s$/i, ''))
    .filter((w) => !ALLOW.includes(w));
}

/** Returns a list of problems; empty means the file passes. */
export function checkHeadlines(
  rows: HeadlineRow[], run: RunData, opts: { final?: boolean } = {},
): string[] {
  const out: string[] = [];
  const trading = new Set(run.dates);
  rows.forEach((r, i) => {
    const at = `row ${i + 2} (${r.date || 'no date'})`;
    const bad = (msg: string) => out.push(`${at}: ${msg}`);
    if (!trading.has(r.date)) bad(`date is not a trading day in ${run.id}`);
    if (!r.real) bad('real line is empty');
    if (!r.anon) bad('anon line is empty');
    if (r.real.length > MAX_LINE) bad(`real line is over ${MAX_LINE} characters (${r.real.length})`);
    if (r.anon.length > MAX_LINE) bad(`anon line is over ${MAX_LINE} characters (${r.anon.length})`);
    if (/\b(1[0-9]|20)\d{2}s?\b/.test(r.anon) || /(?<![\p{L}\p{N}])['\u2019]\d{2}(?!\d)/u.test(r.anon)) {
      bad('anon line contains a year or decade');
    }
    if (/\bin \d+ years\b/i.test(r.anon)) bad('anon line contains an "in N years" figure');
    const anonWords = new Set(words(r.anon).map(stem));
    for (const name of new Set(namesIn(r.real))) {
      if (anonWords.has(stem(name))) {
        bad(`anon line repeats the capitalised name "${name}" from the real line`);
      }
    }
    for (const j of JARGON) {
      if (j.re.test(r.anon)) bad(`anon line uses jargon: "${j.label}"`);
    }
    if (!r.source_url) bad('source_url is empty');
    if (opts.final && !r.second_source_url) bad('second_source_url is empty (required with --final)');
    if (r.big) {
      const idx = run.dates.indexOf(r.date);
      if (idx > run.fallEndIndex) bad('big row is dated after the fall ends');
    }
  });
  const bigs = rows.filter((r) => r.big).length;
  const [lo, hi] = run.kind === 'crash' ? [8, 10] : [3, 5];
  if (bigs < lo || bigs > hi) {
    out.push(`a ${run.kind} needs between ${lo} and ${hi} big rows, found ${bigs}`);
  }
  return out;
}

/** Map checked rows to the engine's Headline shape, ordered by day. */
export function toHeadlines(rows: HeadlineRow[], run: RunData): Headline[] {
  return rows
    .map((r) => ({
      dayIndex: run.dates.indexOf(r.date), real: r.real, anon: r.anon, big: r.big, sombre: r.sombre,
    }))
    .filter((h) => h.dayIndex >= 0)
    .sort((a, b) => a.dayIndex - b.dayIndex);
}
