import { describe, expect, test } from 'vitest';
import { backIn, findEpisode, monthsBetween, monthsInWords } from '../../scripts/lib/episode';

describe('monthsBetween', () => {
  test('rounds calendar days to the nearest whole month', () => {
    // Autumn 2018: lowest close 24 Dec 2018, back above the high 23 Apr 2019 (spec: "four months")
    expect(monthsBetween('2018-12-24', '2019-04-23')).toBe(4);
    expect(monthsBetween('2016-02-11', '2016-07-11')).toBe(5);
    expect(monthsBetween('2025-04-08', '2025-06-27')).toBe(3); // 80 days, 2.63 months
    expect(monthsBetween('2000-01-01', '2000-01-16')).toBe(0); // 15 days, 0.49 months
    expect(monthsBetween('2000-01-01', '2000-01-17')).toBe(1); // 16 days, 0.53 months
  });
});

describe('monthsInWords', () => {
  test('words, not digits', () => {
    expect(monthsInWords(1)).toBe('a month');
    expect(monthsInWords(2)).toBe('two months');
    expect(monthsInWords(4)).toBe('four months');
    expect(monthsInWords(11)).toBe('eleven months');
    expect(monthsInWords(12)).toBe('twelve months');
  });
  test('refuses amounts it has no word for', () => {
    expect(() => monthsInWords(0)).toThrow();
    expect(() => monthsInWords(13)).toThrow();
  });
});

function days(n: number): string[] {
  // Synthetic consecutive dates; findEpisode only needs them to be unique and ordered.
  return Array.from({ length: n }, (_, i) => `2000-01-${String(i + 1).padStart(2, '0')}`);
}

describe('findEpisode', () => {
  test('crash: plan Task 2 step 1 synthetic series', () => {
    const closes = [100, 96, 92.9, 80, 60, 72, 90, 100.5];
    const dates = days(closes.length);
    expect(findEpisode(dates, closes, dates[0])).toEqual({
      startIndex: 2, // first close at or below 93
      lowIndex: 4, // 60
      fallEndIndex: 5, // first close at or above 60 x 1.20 = 72
      endIndex: 7, // first close above 100
    });
  });

  test('kind defaults to crash', () => {
    const closes = [100, 96, 92.9, 80, 60, 72, 90, 100.5];
    const dates = days(closes.length);
    expect(findEpisode(dates, closes, dates[0], 'crash')).toEqual(
      findEpisode(dates, closes, dates[0]),
    );
  });

  test('scare: fall ends two-thirds of the way back from low to high', () => {
    // high 100, low 85, two-thirds back = 85 + 15 * 2 / 3 = 95
    const closes = [100, 92, 88, 85, 90, 94.99, 95, 99, 100.01];
    const dates = days(closes.length);
    expect(findEpisode(dates, closes, dates[0], 'scare')).toEqual({
      startIndex: 1,
      lowIndex: 3,
      fallEndIndex: 6,
      endIndex: 8,
    });
  });

  test('high need not be at index 0; indices are into the full series', () => {
    const closes = [50, 80, 100, 99, 93.5, 93, 70, 84, 100, 101];
    const dates = days(closes.length);
    expect(findEpisode(dates, closes, dates[2])).toEqual({
      startIndex: 5, // 93 is exactly 7% below 100
      lowIndex: 6,
      fallEndIndex: 7, // 70 x 1.2 = 84
      endIndex: 9, // 100 equals the high, so not above it; 101 is
    });
  });

  test('lowest close is the first one when the low is repeated', () => {
    const closes = [100, 90, 60, 65, 60, 80, 101];
    const dates = days(closes.length);
    expect(findEpisode(dates, closes, dates[0]).lowIndex).toBe(2);
  });

  test('throws when the high date is not in the series', () => {
    const closes = [100, 90, 101];
    expect(() => findEpisode(days(3), closes, '1999-12-31')).toThrow(/not found/);
  });

  test('throws when the market never falls 7%', () => {
    const closes = [100, 95, 94, 101];
    const dates = days(closes.length);
    expect(() => findEpisode(dates, closes, dates[0])).toThrow(/7%/);
  });

  test('throws when the market never regains the high', () => {
    const closes = [100, 90, 80, 95];
    const dates = days(closes.length);
    expect(() => findEpisode(dates, closes, dates[0])).toThrow(/regain/);
  });
});

describe('backIn (ruling R22)', () => {
  test('weeks under two months, months from two months, low to recovery', () => {
    expect(backIn('2014-10-15', '2014-10-31')).toBe('two weeks'); // 16 days
    expect(backIn('2024-08-05', '2024-09-19')).toBe('six weeks'); // 45 days
    expect(backIn('2000-01-03', '2000-01-10')).toBe('a week');
    expect(backIn('2000-01-01', '2000-03-01')).toBe('nine weeks'); // 60 days = 8.6 weeks, under 2 months
    expect(backIn('2000-01-01', '2000-03-02')).toBe('two months'); // 61 days
    expect(backIn('2018-12-24', '2019-04-23')).toBe('four months');
  });
});
