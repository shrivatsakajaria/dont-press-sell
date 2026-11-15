import { expect, it } from 'vitest';
import { BORROWED_OPENING, START_LABEL, START_LINES, startLines } from '../../src/content/copy';

it('three start lines, the owner\'s words, no exclamation marks', () => {
  expect(START_LINES).toEqual([
    "You have $10,000 of play money in a stock market that's started to fall.",
    'It might be a real crash, or a scare that blows over. Every instinct will say sell.',
    "Hold your nerve, or don't. Most money at the end wins.",
  ]);
  for (const l of START_LINES) expect(l).not.toContain('!');
  expect(START_LABEL).toBe('Start');
});

it('borrowed money takes the borrowed opening as its second line', () => {
  expect(startLines(false)).toEqual(START_LINES);
  expect(startLines(true)).toEqual([START_LINES[0], BORROWED_OPENING, START_LINES[2]]);
});
