import { describe, expect, test } from 'vitest';
import {
  daysBetween, daysBucket, gamesBucket, inAppFrom, leadBucket, msToStartBucket, resultSecBucket, secBucket, tens,
} from '../../src/analytics/buckets';

describe('buckets', () => {
  test('games ever: 1, 2, 3-5, 6-10, 11+', () => {
    expect([1, 2, 3, 5, 6, 10, 11, 400].map(gamesBucket)).toEqual(['1', '2', '3-5', '3-5', '6-10', '6-10', '11+', '11+']);
    expect(gamesBucket(0)).toBe('1');
  });
  test('days since first play: 0, 1, 2-7, 8+', () => {
    expect([0, 1, 2, 7, 8, 90].map(daysBucket)).toEqual(['0', '1', '2-7', '2-7', '8+', '8+']);
    expect(daysBucket(-3)).toBe('0');
  });
  test('days between two local dates', () => {
    expect(daysBetween('2026-11-14', '2026-11-14')).toBe(0);
    expect(daysBetween('2026-11-14', '2026-11-17')).toBe(3);
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(daysBetween('nonsense', '2026-11-01')).toBe(0);
  });
  test('time to Start', () => {
    expect([0, 2999, 3000, 9999, 10000, 29999, 30000, 59999, 60000].map(msToStartBucket)).toEqual([
      '<3s', '<3s', '3-10s', '3-10s', '10-30s', '10-30s', '30-60s', '30-60s', '60s+',
    ]);
  });
  test('lead against someone who did nothing, rounded to whole dollars first', () => {
    expect([-5000, -2000, -1999, -500, -499, -1, -0.4, 0, 0.4, 1, 499, 500, 1999, 2000, 9000].map(leadBucket)).toEqual([
      '-2000 or less', '-2000 or less', '-1999 to -500', '-1999 to -500', '-499 to -1', '-499 to -1', '0', '0', '0',
      '1 to 499', '1 to 499', '500 to 1999', '500 to 1999', '2000 or more', '2000 or more',
    ]);
  });
  test('percentages in tens, 0 to 100', () => {
    expect([0, 9.9, 10, 55, 99.9, 100, 140, -5, NaN].map(tens)).toEqual([0, 0, 10, 50, 90, 100, 100, 0, 0]);
  });
  test('game seconds and seconds on the result page', () => {
    expect([10, 30, 59, 60, 90, 119, 120, 179, 180, 500].map(secBucket)).toEqual([
      '<30', '30-59', '30-59', '60-89', '90-119', '90-119', '120-179', '120-179', '180+', '180+',
    ]);
    expect([0, 4.9, 5, 14.9, 15, 29, 30, 59, 60, 999].map(resultSecBucket)).toEqual([
      '<5', '<5', '5-14', '5-14', '15-29', '15-29', '30-59', '30-59', '60+', '60+',
    ]);
  });
});

describe('in-app browser from the user agent', () => {
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const chrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
  const cases: [string, string][] = [
    [safari, 'none'],
    [chrome, 'none'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'none'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1', 'none'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.7', 'linkedin'],
    ['Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36 LinkedInApp/4.1', 'linkedin'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.40', 'x'],
    ['Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36 TwitterAndroid', 'x'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0;FBBV/1]', 'facebook'],
    ['Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0;]', 'facebook'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0 (iPhone15,2; FBAV/1)', 'instagram'],
    ['Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36 WhatsApp/2.24', 'whatsapp'],
    ['Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124 Mobile Safari/537.36', 'other-inapp'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 'other-inapp'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.0', 'other-inapp'],
    ['', 'none'],
  ];
  test.each(cases)('%s -> %s', (ua, want) => {
    expect(inAppFrom(ua)).toBe(want);
  });
});
