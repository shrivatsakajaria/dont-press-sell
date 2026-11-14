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
