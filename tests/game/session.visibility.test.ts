// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunData } from '../../src/engine/types';
import type { Step } from '../../src/game/schedule';
import { createSession } from '../../src/game/session';

const tiny: RunData = {
  id: 't',
  kind: 'scare',
  pickName: 't',
  revealLine: 't',
  dates: ['a', 'b', 'c'],
  closes: [100, 90, 108],
  lowIndex: 1,
  fallEndIndex: 2,
};
const steps: Step[] = [
  { dayIndex: 0, holdMs: 1000, phase: 'fall', slow: false },
  { dayIndex: 1, holdMs: 800, phase: 'fall', slow: true },
  { dayIndex: 2, holdMs: 500, phase: 'forward', slow: false },
];

let hidden = false;
const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] } as const;
beforeEach(() => {
  // performance is faked too: the session measures time left with performance.now().
  vi.useFakeTimers({ toFake: [...FAKE.toFake] });
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
});
afterEach(() => {
  vi.useRealTimers();
});

function setHidden(h: boolean) {
  hidden = h;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('createSession and the page going to the background', () => {
  it('pauses when hidden and resumes from the same step without a time jump', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const s = createSession(tiny, steps, { start: 10000, onStep: () => {}, onEnd: () => {}, onPause, onResume });
    s.start();
    vi.advanceTimersByTime(600);
    setHidden(true);
    expect(onPause).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(s.view().stepIndex).toBe(0);
    setHidden(false);
    expect(onResume).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(399);
    expect(s.view().stepIndex).toBe(0);
    vi.advanceTimersByTime(1);
    expect(s.view().stepIndex).toBe(1);
    s.destroy();
  });

  it('destroy() removes the listener', () => {
    const onPause = vi.fn();
    const s = createSession(tiny, steps, { start: 10000, onStep: () => {}, onEnd: () => {}, onPause });
    s.start();
    s.destroy();
    setHidden(true);
    expect(onPause).not.toHaveBeenCalled();
  });

  it('a run started while hidden waits until the page is shown', () => {
    hidden = true;
    const s = createSession(tiny, steps, { start: 10000, onStep: () => {}, onEnd: () => {} });
    s.start();
    vi.advanceTimersByTime(5000);
    expect(s.view().stepIndex).toBe(0);
    setHidden(false);
    vi.advanceTimersByTime(1000);
    expect(s.view().stepIndex).toBe(1);
    s.destroy();
  });

  it('a manual pause is not undone when the page becomes visible again', () => {
    const onResume = vi.fn();
    const s = createSession(tiny, steps, { start: 10000, onStep: () => {}, onEnd: () => {}, onResume });
    s.start();
    vi.advanceTimersByTime(300);
    s.pause();
    setHidden(true);
    setHidden(false);
    expect(onResume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(s.view().stepIndex).toBe(0);
    s.resume();
    expect(onResume).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(700);
    expect(s.view().stepIndex).toBe(1);
    s.destroy();
  });

  it('pressing Resume while the page is hidden waits for the page to be shown', () => {
    const s = createSession(tiny, steps, { start: 10000, onStep: () => {}, onEnd: () => {} });
    s.start();
    s.pause();
    setHidden(true);
    s.resume();
    vi.advanceTimersByTime(5000);
    expect(s.view().stepIndex).toBe(0);
    setHidden(false);
    vi.advanceTimersByTime(1000);
    expect(s.view().stepIndex).toBe(1);
    s.destroy();
  });
});

