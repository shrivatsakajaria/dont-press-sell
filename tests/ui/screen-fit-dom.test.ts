// @vitest-environment happy-dom
// R64: the headline fit is checked on the real news block after it is applied (any engine, late fonts, bars
// resizing): if it overflows, the headline steps down further; at the floor the line under it is clamped to
// whole lines; web fonts finishing refit.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Step } from '../../src/game/schedule';
import { startPlay } from '../../src/ui/screen';

const closes = [100, 101, 99, 100, 90, 92, 95, 100, 104, 108];
const dates = closes.map((_, i) => `2007-11-${String(10 + i).padStart(2, '0')}`);
const run = { id: 't', kind: 'crash' as const, pickName: '', revealLine: '', dates, closes, lowIndex: 4, fallEndIndex: 7 };
const steps: Step[] = closes.map((_, d) => ({ dayIndex: d, holdMs: 1000, phase: d < 7 ? 'fall' : 'forward', slow: false }));

/** The fake layout: the real news block overflows while the headline's step is above `limit`. */
let limit = 0.6;
const real = (e: Element) => e.classList.contains('news') && !e.parentElement?.classList.contains('news-measure');
const kOf = (e: Element) => Number((e.querySelector('.headline') as HTMLElement).style.getPropertyValue('--k') || 1);
const saved: [string, PropertyDescriptor | undefined][] = [];
function fake(name: string, get: (e: HTMLElement) => number) {
  const proto = HTMLElement.prototype;
  const orig = Object.getOwnPropertyDescriptor(proto, name) ?? Object.getOwnPropertyDescriptor(Element.prototype, name);
  saved.push([name, Object.getOwnPropertyDescriptor(proto, name)]);
  Object.defineProperty(proto, name, {
    configurable: true,
    get(this: HTMLElement) {
      const v = get(this);
      return Number.isNaN(v) ? (orig?.get?.call(this) ?? 0) : v;
    },
  });
}

let fonts: EventTarget;
beforeEach(() => {
  vi.useFakeTimers();
  limit = 0.6;
  fake('clientWidth', (e) => (real(e) ? 342 : NaN));
  fake('clientHeight', (e) => (real(e) ? 168 : NaN));
  fake('scrollHeight', (e) => (real(e) ? (kOf(e) > limit + 1e-9 ? 200 : 168) : NaN));
  fonts = new EventTarget();
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  for (const [name, d] of saved.reverse()) {
    if (d) Object.defineProperty(HTMLElement.prototype, name, d);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  }
  saved.length = 0;
});

function mount() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  startPlay(root, run, steps, { runLabel: 'Mystery crash', onEnd: vi.fn() });
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  return { q, k: () => kOf(q('.news')) };
}

it('a probe that says it fits is checked on the real block: overflowing, the headline steps down until it fits', () => {
  const { k, q } = mount();
  expect(k()).toBe(0.6);
  expect(q('.standfirst').classList.contains('clamped')).toBe(false);
});

it('at the smallest step, still overflowing, the line under the headline is clamped to the whole lines that fit', () => {
  limit = 0; // never fits
  const css = document.createElement('style');
  css.textContent = '.standfirst{font-size:18px;line-height:23.4px}';
  document.head.append(css);
  const sf = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = this.classList.contains('standfirst') ? 100 : 0;
    return { top, bottom: top + 100, left: 0, right: 342, width: 342, height: 100, x: 0, y: top, toJSON() {} } as DOMRect;
  });
  const { k, q } = mount();
  sf.mockRestore();
  css.remove();
  expect(k()).toBe(0.46);
  const s = q<HTMLElement>('.standfirst');
  expect(s.classList.contains('clamped')).toBe(true);
  // 168px of block, the line starting 100px down, 23.4px lines: two whole lines (never a cut third).
  expect(s.style.getPropertyValue('--clamp')).toBe('2');
});

it('web fonts finishing refit from scratch (the cache is cleared), and a fit that passes drops the clamp', () => {
  const { k, q } = mount();
  expect(k()).toBe(0.6);
  limit = 0.82;
  fonts.dispatchEvent(new Event('loadingdone'));
  expect(k()).toBe(0.82);
  limit = 0;
  fonts.dispatchEvent(new Event('loadingdone'));
  expect(k()).toBe(0.46);
  expect(q('.standfirst').classList.contains('clamped')).toBe(true);
  limit = 1;
  fonts.dispatchEvent(new Event('loadingdone'));
  expect(k()).toBe(1);
  expect(q('.standfirst').classList.contains('clamped')).toBe(false);
});
