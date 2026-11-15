// @vitest-environment happy-dom
// Contract K2: a press calls the chart's extendChart (lane FB) with the clock's hold, so the line's growth stretches over it.
import { afterEach, expect, it, vi } from 'vitest';
import type { Step } from '../../src/game/schedule';

const extendChart = vi.fn();
vi.mock('../../src/ui/chart', async (orig) => ({ ...(await orig<typeof import('../../src/ui/chart')>()), extendChart }));

const { startPlay, PRESS_HOLD_MS } = await import('../../src/ui/screen');

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

it('a press stretches the chart growth by the press hold', () => {
  vi.useFakeTimers();
  const closes = [100, 101, 99, 100];
  const run = { id: 't', kind: 'crash' as const, pickName: '', revealLine: '', dates: closes.map((_, i) => `2007-11-1${i}`), closes, lowIndex: 2, fallEndIndex: 3 };
  const steps: Step[] = closes.map((_, d) => ({ dayIndex: d, holdMs: 1000, phase: 'fall', slow: false }));
  const root = document.createElement('div');
  document.body.appendChild(root);
  startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd: vi.fn() });
  vi.advanceTimersByTime(1000);
  expect(extendChart).not.toHaveBeenCalled();
  (root.querySelector('button.act') as HTMLButtonElement).click();
  expect(extendChart).toHaveBeenCalledTimes(1);
  expect(extendChart.mock.calls[0][0]).toBe(root.querySelector('.chart svg'));
  expect(extendChart.mock.calls[0][1]).toBe(PRESS_HOLD_MS);
});
