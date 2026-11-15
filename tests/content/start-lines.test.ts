import { expect, it } from 'vitest';
import { START_LABEL, START_LINES } from '../../src/content/copy';

it("three start lines, the owner's final words, no exclamation marks", () => {
  expect(START_LINES).toEqual([
    'The market is falling. Nobody knows how far.',
    'You have $10,000, and one button.',
    'Press the button to sell if you dare. Get back in cheaper and you win. Wait too long and the market leaves without you.',
  ]);
  for (const l of START_LINES) expect(l).not.toContain('!');
  expect(START_LABEL).toBe('Start');
});
