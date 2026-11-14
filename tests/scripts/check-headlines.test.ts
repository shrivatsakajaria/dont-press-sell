import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RunData } from '../../src/engine/types';
import {
  checkHeadlines, parseCsv, parseHeadlineRows, toHeadlines, type HeadlineRow,
} from '../../scripts/lib/headlines';

const dir = new URL('../fixtures/headlines/', import.meta.url);
const run = JSON.parse(readFileSync(new URL('prices.json', dir), 'utf8')) as RunData;
const goodText = readFileSync(new URL('good.csv', dir), 'utf8');

function good(): HeadlineRow[] {
  return parseHeadlineRows(goodText).rows;
}
function mutate(i: number, patch: Partial<HeadlineRow>): HeadlineRow[] {
  const rows = good();
  rows[i] = { ...rows[i], ...patch };
  return rows;
}
const has = (problems: string[], re: RegExp) => problems.some((p) => re.test(p));

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas, CRLF and embedded newlines', () => {
    const out = parseCsv('a,b,c\r\n"x, y","say ""hi""","line\nbreak"\r\n');
    expect(out).toEqual([['a', 'b', 'c'], ['x, y', 'say "hi"', 'line\nbreak']]);
  });
  it('reports an unterminated quote', () => {
    const { problems } = parseHeadlineRows('date,real,anon,big,sombre,source_url,second_source_url,note\n2020-01-02,"oops,b,c,d,e,f,g\n');
    expect(problems.some((p) => /unterminated quote/.test(p))).toBe(true);
  });
  it('keeps empty trailing fields and ignores a final blank line', () => {
    expect(parseCsv('a,b,\n1,,\n')).toEqual([['a', 'b', ''], ['1', '', '']]);
  });
});

describe('parseHeadlineRows', () => {
  it('parses the fixture', () => {
    const { rows, problems } = parseHeadlineRows(goodText);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(10);
    expect(rows[0].anon).toBe('A 158-year-old bank files for bankruptcy');
    expect(rows[1].anon).toBe('Borrowing gets cheaper, "again"');
    expect(rows[1].note).toBe('Over the weekend, a note');
  });
  it('reports a wrong header and short rows', () => {
    expect(parseHeadlineRows('date,real\n1,2\n').problems.length).toBeGreaterThan(0);
    const bad = parseHeadlineRows(goodText.replace(',true,false,https://example.gov/c,https://example.org/c,', ',true'));
    expect(bad.problems.length).toBeGreaterThan(0);
  });
});

describe('checkHeadlines', () => {
  it('passes the good fixture', () => {
    expect(checkHeadlines(good(), run)).toEqual([]);
    expect(checkHeadlines(good(), run, { final: true })).toEqual([]);
  });
  it('fails a date that is not a trading day in the run', () => {
    expect(has(checkHeadlines(mutate(0, { date: '2020-01-04' }), run), /trading day/)).toBe(true);
  });
  it('fails a four-digit year in anon', () => {
    expect(has(checkHeadlines(mutate(1, { anon: 'Rates cut as in 2008' }), run), /year/)).toBe(true);
  });
  it('fails a capitalised name from real that appears in anon', () => {
    expect(has(checkHeadlines(mutate(0, { anon: 'Brothers bank files for bankruptcy' }), run), /Brothers/)).toBe(true);
  });
  it('lets the first word and allow-listed words through', () => {
    const rows = mutate(1, { real: 'Shares cut US rates', anon: 'Shares watchers see US rates cut' });
    expect(has(checkHeadlines(rows, run), /capitalised/)).toBe(false);
    const rows2 = mutate(1, { real: 'Bank cuts US rates', anon: 'The US cuts rates' });
    expect(has(checkHeadlines(rows2, run), /capitalised/)).toBe(false);
  });
  it('fails a capitalised non-first word of real that appears in anon', () => {
    const rows = mutate(1, { real: 'Central bank cuts rates, says Powell', anon: 'Powell says rates are cut' });
    expect(has(checkHeadlines(rows, run), /Powell/)).toBe(true);
  });
  it('fails decades and apostrophe years in anon', () => {
    for (const a of ['Worst since the 1930s', 'Best since the 1990s', "Worse than '87", 'Worse than \u201987']) {
      expect(has(checkHeadlines(mutate(1, { anon: a }), run), /year/), a).toBe(true);
    }
  });
  it('compares names case-insensitively and strips possessives', () => {
    const r = (anon: string) => has(checkHeadlines(mutate(1, { real: 'Rates cut, says Powell', anon }), run), /Powell/);
    expect(r('powell says rates fall')).toBe(true);
    expect(r("Powell's view is calm")).toBe(true);
    const r2 = has(checkHeadlines(mutate(1, { real: "Powell's team cuts rates", anon: 'The powell team acts' }), run), /Powell/);
    expect(r2).toBe(true);
  });
  it('treats a non-listed first word as a name, but exempts common sentence-start words', () => {
    const nameFirst = mutate(1, { real: 'Lehman fails today', anon: 'Lehman is gone' });
    expect(has(checkHeadlines(nameFirst, run), /Lehman/)).toBe(true);
    const common = mutate(1, { real: 'Markets fall hard', anon: 'Markets fall a lot' });
    expect(has(checkHeadlines(common, run), /capitalised/)).toBe(false);
  });
  it('fails "in N years"', () => {
    expect(has(checkHeadlines(mutate(1, { anon: 'Worst fall in 20 years' }), run), /years/)).toBe(true);
  });
  it('fails lines over 56 characters', () => {
    const long = 'x'.repeat(57);
    expect(has(checkHeadlines(mutate(1, { anon: long }), run), /56/)).toBe(true);
    expect(has(checkHeadlines(mutate(1, { real: long }), run), /56/)).toBe(true);
    expect(has(checkHeadlines(mutate(1, { anon: 'y'.repeat(56) }), run), /56/)).toBe(false);
  });
  it('fails jargon in anon', () => {
    for (const w of ['funds', 'fund', 'Liquidity', 'equities', 'Equity', 'tranche', 'tranches', 'basis points', 'basis point', 'yield', 'YIELDS', 'liquidity']) {
      expect(has(checkHeadlines(mutate(1, { anon: `Big ${w} move` }), run), /jargon/)).toBe(true);
    }
  });
  it('fails "S&P" in real or anon, but not in the source columns', () => {
    expect(has(checkHeadlines(mutate(1, { anon: 'S&P cuts the US credit grade' }), run), /S&P/)).toBe(true);
    expect(has(checkHeadlines(mutate(1, { real: 'S&P 500 closes at a record' }), run), /S&P/)).toBe(true);
    const src = mutate(1, { source_url: 'https://example.org/s&p-500', note: 'S&P index' });
    expect(has(checkHeadlines(src, run), /S&P/)).toBe(false);
  });
  it('fails an empty source column; second source only with --final', () => {
    expect(has(checkHeadlines(mutate(1, { source_url: '' }), run), /source_url/)).toBe(true);
    const rows = mutate(1, { second_source_url: '' });
    expect(checkHeadlines(rows, run)).toEqual([]);
    expect(has(checkHeadlines(rows, run, { final: true }), /second_source_url/)).toBe(true);
  });
  it('fails the wrong number of big rows', () => {
    const seven = mutate(2, { big: false });
    expect(has(checkHeadlines(seven, run), /between 8 and 10/)).toBe(true);
    const base = good().map((r) => ({ ...r, big: true }));
    const eleven = [...base, { ...base[0], date: '2020-01-15' }];
    expect(has(checkHeadlines(eleven, run), /between 8 and 10/)).toBe(true);
  });
  it('uses 3 to 5 big rows for a scare', () => {
    const scare: RunData = { ...run, kind: 'scare' };
    const rows = good().map((r, i) => ({ ...r, big: i < 4 }));
    expect(checkHeadlines(rows, scare)).toEqual([]);
    expect(has(checkHeadlines(good(), scare), /between 3 and 5/)).toBe(true);
    const two = good().map((r, i) => ({ ...r, big: i < 2 }));
    expect(has(checkHeadlines(two, scare), /between 3 and 5/)).toBe(true);
  });
  it('fails a big row after fallEndIndex', () => {
    const early: RunData = { ...run, fallEndIndex: 6 };
    expect(has(checkHeadlines(good(), early), /after the fall/)).toBe(true);
  });
  it('fails empty lines', () => {
    expect(has(checkHeadlines(mutate(1, { real: '' }), run), /real/)).toBe(true);
    expect(has(checkHeadlines(mutate(1, { anon: '' }), run), /anon/)).toBe(true);
  });
});

describe('toHeadlines', () => {
  it('maps dates to day indexes', () => {
    const hs = toHeadlines(good(), run);
    expect(hs).toHaveLength(10);
    expect(hs[0]).toEqual({
      dayIndex: 0,
      real: 'Lehman Brothers files for bankruptcy, shocking markets',
      anon: 'A 158-year-old bank files for bankruptcy',
      big: true,
      sombre: false,
    });
    expect(hs[9].dayIndex).toBe(9);
  });
  it('sorts by day index', () => {
    const rows = good().reverse();
    const hs = toHeadlines(rows, run);
    expect(hs.map((h) => h.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
