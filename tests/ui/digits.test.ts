// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { createRoll } from '../../src/ui/digits';

it('shows exactly the text it is given, one slot per character', () => {
  const el = document.createElement('span');
  const r = createRoll(el);
  r.set('$10,340');
  expect(el.textContent).toBe('$10,340');
  expect(el.children.length).toBe(7);
  r.set('$9,812');
  expect(el.textContent).toBe('$9,812');
  r.set('$9,813');
  expect(el.textContent).toBe('$9,813');
});

it('keeps unchanged slots and marks the changed ones', () => {
  const el = document.createElement('span');
  const r = createRoll(el);
  r.set('$9,812');
  const first = el.children[0];
  r.set('$9,813');
  expect(el.children[0]).toBe(first);
  expect(r.lastChanged()).toEqual([5]);
});

it('a changing digit swaps at full strength: never greyed, never moved out of its slot (round 2 panel)', () => {
  const el = document.createElement('span');
  const r = createRoll(el);
  r.set('$9,812');
  const calls: { frames: Keyframe[] }[] = [];
  const proto = HTMLElement.prototype as unknown as { animate?: unknown };
  const had = proto.animate;
  proto.animate = vi.fn(function (frames: Keyframe[]) {
    calls.push({ frames });
    return {} as Animation;
  });
  try {
    r.set('$9,903');
  } finally {
    proto.animate = had;
  }
  for (const c of calls) {
    for (const f of c.frames) {
      expect(f.transform).toBeUndefined();
      if (f.opacity !== undefined) expect(Number(f.opacity)).toBe(1);
    }
  }
  expect(el.textContent).toBe('$9,903');
});

it('R43: updates in place, without rebuilding the figure, when the length holds', () => {
  const el = document.createElement('span');
  const r = createRoll(el);
  r.set('$9,812');
  const slots = [...el.children];
  const spy = vi.spyOn(el, 'replaceChildren');
  r.set('$9,903');
  expect(spy).not.toHaveBeenCalled();
  expect([...el.children]).toEqual(slots);
  // A longer and a shorter figure keep the right-hand slots.
  r.set('$10,903');
  expect(el.textContent).toBe('$10,903');
  expect(el.children[el.children.length - 1]).toBe(slots[slots.length - 1]);
  r.set('$903');
  expect(el.textContent).toBe('$903');
  expect(el.children.length).toBe(4);
  expect(el.children[3]).toBe(slots[slots.length - 1]);
});
