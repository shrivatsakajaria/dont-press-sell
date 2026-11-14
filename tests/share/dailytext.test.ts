import { expect, test } from 'vitest';
import { dailyText } from '../../src/share/dailytext';

const balances = Array.from({ length: 80 }, (_, i) => 10000 - i * 40 + (i % 7) * 90);
const url = 'https://example.pages.dev/';
const sketchLine = (t: string) => t.split('\n').find((l) => /^[▁▂▃▄▅▆▇█]+$/.test(l));

test('starts with the daily number, verdict and score', () => {
  const t = dailyText(12, 'Paper hands', -2300, balances, url, 4);
  expect(t.startsWith("Don't Press Sell, daily crash 12. Paper hands. $2,300 behind someone who did nothing.")).toBe(true);
});

test('ahead wording', () => {
  const t = dailyText(3, 'Diamond hands', 1640, balances, url, 1);
  expect(t).toContain('$1,640 ahead of someone who did nothing.');
});

test('streak line only when more than one day', () => {
  expect(dailyText(12, 'x', -1, balances, url, 4)).toContain('4 days in a row');
  expect(dailyText(12, 'x', -1, balances, url, 1)).not.toContain('days in a row');
});

test('sketch is 12 block characters', () => {
  const line = sketchLine(dailyText(12, 'x', -1, balances, url, 1));
  expect(line).toBeDefined();
  expect([...line!].length).toBe(12);
});

test('flat and short balances do not break the sketch', () => {
  for (const b of [[], [5], [100, 100, 100], Array(50).fill(10000)]) {
    const line = sketchLine(dailyText(1, 'x', 0, b, url, 1));
    expect([...(line ?? '')].length).toBe(12);
  }
});

test('ends with the url and names no crash', () => {
  const t = dailyText(12, 'Paper hands', -2300, balances, url, 4);
  expect(t.endsWith(url)).toBe(true);
  expect(t).not.toMatch(/19\d\d|20\d\d|Black|Lehman|pandemic/i);
});
