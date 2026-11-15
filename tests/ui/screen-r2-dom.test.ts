// @vitest-environment happy-dom
// Round 2, lane C: press moments (R41), the green buy-back (R38), the hidden pot (R40) and the final hold (R49).
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Step } from '../../src/game/schedule';

const holdFor = vi.fn();
vi.mock('../../src/game/session', async (orig) => {
  const real = await orig<typeof import('../../src/game/session')>();
  return {
    ...real,
    createSession: (...a: Parameters<typeof real.createSession>) => ({ ...real.createSession(...a), holdFor }),
  };
});

const { startPlay, END_HOLD_MS, STAMP_MS } = await import('../../src/ui/screen');

const closes = [100, 101, 99, 100, 90, 92, 95, 100, 104, 108];
const dates = closes.map((_, i) => `2007-11-${String(10 + i).padStart(2, '0')}`);
const run = { id: 't', kind: 'crash' as const, pickName: '', revealLine: '', dates, closes, lowIndex: 4, fallEndIndex: 7 };
const steps: Step[] = closes.map((_, d) => ({ dayIndex: d, holdMs: 100, phase: d < 7 ? 'fall' : 'forward', slow: false }));

beforeEach(() => {
  vi.useFakeTimers();
  holdFor.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function mount(onFrame = vi.fn(), onEnd = vi.fn()) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const play = startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd, onFrame });
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  return { root, play, q, onEnd, onFrame, btn: q<HTMLButtonElement>('button.act') };
}

it('a sale holds the day 0.5 s and stamps "Sold at $N" over the paper, readable past the hold (R56)', () => {
  const { btn, q } = mount();
  vi.advanceTimersByTime(100); // day 2: 10,100
  btn.click();
  expect(holdFor).toHaveBeenCalledWith(500);
  const stamp = q<HTMLElement>('.stamp');
  expect(stamp.textContent).toBe('Sold at $10,100');
  expect(stamp.hidden).toBe(false);
  expect(stamp.classList.contains('win')).toBe(false);
  vi.advanceTimersByTime(500);
  expect(stamp.hidden).toBe(false); // R56: the clock's hold is over; the stamp stays up to be read
  vi.advanceTimersByTime(STAMP_MS - 500);
  expect(stamp.hidden).toBe(true);
});

it('a cheaper buy-back: green pulsing button, a win stamp and the win cue', () => {
  const { btn, q, onFrame } = mount();
  vi.advanceTimersByTime(300); // day 4 closes at 100
  btn.click(); // sold 10,000 at 100
  vi.advanceTimersByTime(100); // day 5 closes at 90
  expect(btn.textContent).toBe('Buy back $1,000 cheaper');
  expect(btn.classList.contains('cheaper')).toBe(true);
  btn.click();
  expect(holdFor).toHaveBeenCalledTimes(2);
  const stamp = q<HTMLElement>('.stamp');
  expect(stamp.textContent).toBe('Bought back $1,000 cheaper');
  expect(stamp.classList.contains('win')).toBe(true);
  expect(btn.classList.contains('cheaper')).toBe(false);
  const buyFrame = onFrame.mock.calls.find((c) => c[2].trade === 'buy');
  expect(buyFrame?.[2].win).toBe(true);
});

it('a dearer buy-back is not styled as a win', () => {
  const { btn, q, onFrame } = mount();
  vi.advanceTimersByTime(400); // day 5 closes at 90
  btn.click(); // sold 9,000 at 90
  vi.advanceTimersByTime(200); // day 7 closes at 95
  expect(btn.textContent).toBe('Buy back $500 dearer');
  expect(btn.classList.contains('cheaper')).toBe(false);
  btn.click();
  expect(q<HTMLElement>('.stamp').textContent).toBe('Bought back $500 dearer');
  expect(q<HTMLElement>('.stamp').classList.contains('win')).toBe(false);
  expect(onFrame.mock.calls.find((c) => c[2].trade === 'buy')?.[2].win).toBe(false);
});

it('no pot in the footer (R40)', () => {
  const { q } = mount();
  expect(q<HTMLElement>('.pot').textContent).toBe('');
  expect(q<HTMLElement>('.foot').textContent).not.toMatch(/pot/i);
});

it('the last day stays on screen with the final balance before the result (R49)', () => {
  const { q, onEnd, btn } = mount();
  vi.advanceTimersByTime(1000); // the last step's hold runs out
  expect(onEnd).not.toHaveBeenCalled();
  expect(q<HTMLElement>('.balance').textContent).toBe('$10,800');
  expect(btn.getAttribute('aria-disabled')).toBe('true');
  vi.advanceTimersByTime(END_HOLD_MS);
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(Math.round(onEnd.mock.calls[0][0].final)).toBe(10800);
});

it('a buy-back pinned to the step painted at the finger-down stamps the saving the player saw', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  const { btn, q } = mount();
  vi.advanceTimersByTime(316); // day 4 (100) painted
  btn.click(); // sold 10,000 at 100
  vi.advanceTimersByTime(100); // day 5 (90) painted
  expect(btn.textContent).toBe('Buy back $1,000 cheaper');
  btn.dispatchEvent(new Event('pointerdown'));
  vi.advanceTimersByTime(100); // the clock moves to day 6 (92) before the finger lifts
  btn.click();
  // Bought at day 5's close: the stamp names the $1,000 on the button, not a figure from day 6's balance.
  expect(q<HTMLElement>('.stamp').textContent).toBe('Bought back $1,000 cheaper');
});

it('teardown during the final hold never calls onEnd', () => {
  const { play, onEnd } = mount();
  vi.advanceTimersByTime(1000);
  play.teardown();
  vi.advanceTimersByTime(END_HOLD_MS * 2);
  expect(onEnd).not.toHaveBeenCalled();
});
