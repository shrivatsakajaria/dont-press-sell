// @vitest-environment happy-dom
// Round 2 fix lane FB (K2, R57): the play screen hands the chart the whole step, stretches the chart's
// growth over a press hold, and holds the chart still while paused.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Step } from '../../src/game/schedule';

const drawSpy = vi.fn();
const extendSpy = vi.fn();
vi.mock('../../src/ui/chart', async (orig) => {
  const real = await orig<typeof import('../../src/ui/chart')>();
  return {
    ...real,
    drawChart: (...a: Parameters<typeof real.drawChart>) => {
      drawSpy(...a);
      return real.drawChart(...a);
    },
    extendChart: (...a: Parameters<typeof real.extendChart>) => {
      extendSpy(...a);
      return real.extendChart(...a);
    },
  };
});

const { startPlay } = await import('../../src/ui/screen');

const closes = [100, 101, 99, 100, 90, 92, 95, 100, 104, 108];
const dates = closes.map((_, i) => `2007-11-${String(10 + i).padStart(2, '0')}`);
const run = { id: 't', kind: 'crash' as const, pickName: '', revealLine: '', dates, closes, lowIndex: 4, fallEndIndex: 7 };
const steps: Step[] = closes.map((_, d) => ({ dayIndex: d, holdMs: 1000, phase: d < 7 ? 'fall' : 'forward', slow: false }));

beforeEach(() => {
  vi.useFakeTimers();
  drawSpy.mockClear();
  extendSpy.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function mount() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const play = startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd: vi.fn() });
  return { root, play, btn: root.querySelector('button.act') as HTMLButtonElement, pause: root.querySelector('button.pause') as HTMLButtonElement };
}

it('a press stretches the chart growth by the same 0.5 s the clock holds', () => {
  const { btn, root } = mount();
  vi.advanceTimersByTime(1000);
  btn.click();
  expect(extendSpy).toHaveBeenCalledTimes(1);
  expect(extendSpy.mock.calls[0][0]).toBe(root.querySelector('.chart svg'));
  expect(extendSpy.mock.calls[0][1]).toBe(500);
});

it('the chart is told the whole step, and that the clock is paused while it is', () => {
  const { pause } = mount();
  vi.advanceTimersByTime(1000);
  const lastOpts = () => drawSpy.mock.calls[drawSpy.mock.calls.length - 1][5];
  expect(lastOpts().animateMs).toBe(1000);
  expect(lastOpts().paused).toBe(false);
  pause.click();
  expect(lastOpts().paused).toBe(true);
  pause.click();
  expect(lastOpts().paused).toBe(false);
});
