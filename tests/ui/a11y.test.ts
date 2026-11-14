// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { announce, initAnnouncer } from '../../src/ui/a11y';

test('announce writes to one polite live region, created once', async () => {
  announce('Sold for $9,000');
  announce('Bought back');
  await new Promise((r) => setTimeout(r, 5));
  const regions = document.querySelectorAll('[aria-live]');
  expect(regions.length).toBe(1);
  expect(regions[0].getAttribute('aria-live')).toBe('polite');
  expect(regions[0].getAttribute('role')).toBe('status');
  expect(regions[0].textContent).toBe('Bought back');
  expect((regions[0] as HTMLElement).style.display).not.toBe('none');
});

test('announce with empty text does not throw', () => {
  expect(() => announce('')).not.toThrow();
});

test('initAnnouncer creates the region up front, empty', () => {
  document.body.innerHTML = '';
  initAnnouncer();
  const el = document.querySelector('[aria-live]');
  expect(el).not.toBeNull();
  expect(el!.textContent).toBe('');
});

test('a repeated string is cleared first, then set on the next tick', async () => {
  initAnnouncer();
  announce('Sold');
  await new Promise((r) => setTimeout(r, 5));
  announce('Sold');
  const el = document.querySelector('[aria-live]')!;
  expect(el.textContent).toBe('');
  await new Promise((r) => setTimeout(r, 5));
  expect(el.textContent).toBe('Sold');
});
