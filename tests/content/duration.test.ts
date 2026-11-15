import { expect, it } from 'vitest';
import { outOfMarketLine, timeWords } from '../../src/content/copy';

it('says a length of time in plain words, small numbers as words', () => {
  expect(timeWords(1)).toBe('one day');
  expect(timeWords(6)).toBe('six days');
  expect(timeWords(7)).toBe('one week');
  expect(timeWords(17)).toBe('two weeks and three days');
  expect(timeWords(31)).toBe('one month');
  expect(timeWords(45)).toBe('one month and two weeks');
  expect(timeWords(70)).toBe('two months and one week');
  expect(timeWords(365)).toBe('one year');
  expect(timeWords(366)).toBe('one year');
  expect(timeWords(400)).toBe('one year and one month');
  // 3 years and 5 months: 2019-01-10 to 2022-06-20.
  expect(timeWords(1257)).toBe('three years and five months');
  expect(timeWords(12 * 365 + 3)).toBe('12 years');
  expect(timeWords(330)).toBe('ten months and three weeks');
  expect(timeWords(89)).toBe('two months and three weeks');
});

it('never rounds up: the words are never longer than the time', () => {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
  for (let d = 1; d < 3000; d++) {
    const w = timeWords(d);
    const n = (re: RegExp) => {
      const m = re.exec(w);
      if (!m) return 0;
      return words.includes(m[1]) ? words.indexOf(m[1]) : Number(m[1]);
    };
    const total = n(/(\w+) years?/) * 365 + n(/(\w+) months?/) * 30 + n(/(\w+) weeks?/) * 7 + n(/(\w+) days?/);
    expect(total, `${d}: ${w}`).toBeLessThanOrEqual(d);
  }
});

it('the line', () => {
  expect(outOfMarketLine(1257)).toBe('Out of the market for three years and five months');
});

it('words or digits, never both in one line: a pair with a number over ten is all digits', () => {
  // 24 years and 10 months (c1929-style): digits for both.
  expect(timeWords(Math.floor(24 * 365.25 + 10 * 30.44 + 2))).toBe('24 years and 10 months');
  expect(timeWords(Math.floor(11 * 365.25 + 3 * 30.44 + 2))).toBe('11 years and 3 months');
  expect(timeWords(Math.floor(11 * 365.25 + 2))).toBe('11 years');
  expect(timeWords(1257)).toBe('three years and five months');
  for (let d = 1; d < 12000; d += 7) {
    const w = timeWords(d);
    expect(/\d/.test(w) && /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/.test(w), `${d}: ${w}`).toBe(false);
  }
});
