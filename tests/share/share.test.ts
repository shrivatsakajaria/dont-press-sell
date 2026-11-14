// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { shareResult } from '../../src/share/share';

const model = { text: 'Beat me', url: 'https://example.pages.dev/' };

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function stubNav(n: Record<string, unknown>) {
  vi.stubGlobal('navigator', n);
}

test('no navigator.share resolves fallback and shows overlay', async () => {
  stubNav({});
  expect(await shareResult(model)).toBe('fallback');
  const o = document.querySelector('[data-share-fallback]');
  expect(o).not.toBeNull();
  expect(o!.textContent).toContain('Copy link');
});

test('rejecting share (AbortError) resolves fallback, nothing unhandled', async () => {
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  stubNav({ share: () => Promise.reject(new DOMException('x', 'AbortError')) });
  expect(await shareResult(model)).toBe('fallback');
  await new Promise((r) => setTimeout(r, 10));
  process.off('unhandledRejection', unhandled);
  expect(unhandled).not.toHaveBeenCalled();
});

test('synchronously throwing share resolves fallback', async () => {
  stubNav({
    share: () => {
      throw new Error('no');
    },
  });
  expect(await shareResult(model)).toBe('fallback');
});

test('successful share resolves shared and shows no overlay', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  stubNav({ share });
  expect(await shareResult(model)).toBe('shared');
  expect(document.querySelector('[data-share-fallback]')).toBeNull();
  expect(share).toHaveBeenCalledWith({ text: model.text, url: model.url });
});

test('shares files when canShare allows', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  stubNav({ share, canShare: () => true });
  const image = new Blob(['x'], { type: 'image/png' });
  expect(await shareResult({ ...model, image })).toBe('shared');
  const arg = share.mock.calls[0][0];
  expect(arg.files).toHaveLength(1);
  expect(arg.files[0].type).toBe('image/png');
});

test('copy link falls back to textarea when clipboard is denied, never throws; close removes overlay', async () => {
  stubNav({ clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
  const exec = vi.fn(() => true);
  const original = (document as any).execCommand;
  (document as any).execCommand = exec;
  await shareResult(model);
  const buttons = [...document.querySelectorAll('[data-share-fallback] button')] as HTMLButtonElement[];
  buttons.find((b) => b.textContent === 'Copy link')!.click();
  await new Promise((r) => setTimeout(r, 10));
  expect(exec).toHaveBeenCalledWith('copy');
  expect(buttons.some((b) => b.textContent === 'Link copied')).toBe(true);
  buttons.find((b) => b.textContent === 'Close')!.click();
  expect(document.querySelector('[data-share-fallback]')).toBeNull();
  (document as any).execCommand = original;
});

test('shows Copy failed when both copy routes fail', async () => {
  stubNav({});
  const original = (document as any).execCommand;
  (document as any).execCommand = () => false;
  await shareResult(model);
  const buttons = [...document.querySelectorAll('[data-share-fallback] button')] as HTMLButtonElement[];
  buttons.find((b) => b.textContent === 'Copy link')!.click();
  await new Promise((r) => setTimeout(r, 10));
  expect(buttons.some((b) => b.textContent === 'Copy failed')).toBe(true);
  (document as any).execCommand = original;
});

test('hint only shows with an image', async () => {
  stubNav({});
  await shareResult(model);
  expect(document.querySelector('[data-share-fallback]')!.textContent).not.toContain('Press and hold');
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() });
  await shareResult({ ...model, image: new Blob(['x']) });
  expect(document.querySelector('[data-share-fallback]')!.textContent).toContain('Press and hold to save');
});

test('re-showing replaces the old overlay, and close returns focus', async () => {
  stubNav({});
  const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: revoke });
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();
  await shareResult({ ...model, image: new Blob(['x']) });
  await shareResult(model);
  expect(document.querySelectorAll('[data-share-fallback]').length).toBe(1);
  expect(revoke).toHaveBeenCalled();
  const close = [...document.querySelectorAll('[data-share-fallback] button')].find((b) => b.textContent === 'Close') as HTMLButtonElement;
  close.click();
  expect(document.activeElement).toBe(opener);
});
