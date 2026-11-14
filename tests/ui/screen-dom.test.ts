// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import type { Step } from '../../src/game/schedule';
import { startPlay } from '../../src/ui/screen';

const closes = [100, 101, 99, 100, 90, 92, 95, 100, 104, 108];
const dates = closes.map((_, i) => `2007-11-${String(10 + i).padStart(2, '0')}`);
const run = { id: 't', kind: 'crash' as const, pickName: '', revealLine: '', dates, closes, lowIndex: 4, fallEndIndex: 7 };
const steps: Step[] = closes.map((_, d) => ({ dayIndex: d, holdMs: 100, phase: d < 7 ? 'fall' : 'forward', slow: d === 4 }));

it('renders the play screen, sells on a tap, pauses, and ends', async () => {
  vi.useFakeTimers();
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onEnd = vi.fn();
  startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd });
  const btn = root.querySelector('button.act') as HTMLButtonElement;
  expect(btn.textContent).toBe('Sell for $10,000');
  expect(root.querySelector('h1')?.textContent).toBe('Headline for day 1');
  expect(root.querySelector('.folio')?.textContent).toContain('Price: your nerve');

  vi.advanceTimersByTime(100); // day 2
  expect(btn.textContent).toBe('Sell for $10,100');
  btn.click();
  expect(btn.textContent).toMatch(/^Buy back now: \$[\d,]+ (ahead|behind)$/);
  expect(root.querySelector('.standfirst')?.textContent).toBe('You are out. To win, buy back in for less than you sold.');

  const pause = root.querySelector('button.pause') as HTMLButtonElement;
  pause.click();
  expect(pause.textContent).toBe('Resume');
  expect(root.querySelector('.folio')?.textContent).toContain('Paused');
  vi.advanceTimersByTime(5000);
  expect(onEnd).not.toHaveBeenCalled();
  pause.click();
  expect(pause.textContent).toBe('Pause');
  vi.advanceTimersByTime(5000);
  expect(onEnd).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

it('borrowed money: its opening line, the counter against the unborrowed market, and a wipe-out ends the run at once', async () => {
  const { simulateBorrowed } = await import('../../src/engine/borrowed');
  vi.useFakeTimers();
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const c = [100, 95, 90, 60, 70, 80, 90, 100, 105, 110];
  const onEnd = vi.fn();
  startPlay(root, { ...run, closes: c }, steps, {
    runLabel: 'Borrowed money', onEnd, simulateFn: simulateBorrowed, borrowed: true,
    opening: 'You have borrowed $20,000. Every move is three times bigger. Fall a third and you are wiped out.',
  });
  expect(root.querySelector('.standfirst')?.textContent).toMatch(/^You have borrowed \$20,000/);
  const btn = root.querySelector('button.act') as HTMLButtonElement;
  vi.advanceTimersByTime(100); // day 2: 3 x 10,000 x 0.95 - 20,000 = 8,500
  expect(btn.textContent).toBe('Sell for $8,500');
  btn.click();
  // In cash with 8,500 while someone who did nothing (unborrowed) has 9,500.
  expect(btn.textContent).toBe('Buy back now: $1,000 behind');
  vi.advanceTimersByTime(100); // day 3: buy back at 90, borrowing twice the balance
  btn.click();
  expect(onEnd).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100); // day 4: 3 x 8,500 x 60 / 90 - 17,000 = 0, wiped out
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(onEnd.mock.calls[0][0].wipedAt).toBe(3);
  vi.advanceTimersByTime(5000);
  expect(onEnd).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
