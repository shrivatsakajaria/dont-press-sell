// @vitest-environment happy-dom
import { expect, it } from 'vitest';
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
