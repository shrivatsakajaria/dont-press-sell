import { afterEach, expect, test, vi } from 'vitest';
import { buzz, setHapticsEnabled } from '../../src/fx/haptics';

afterEach(() => {
  vi.unstubAllGlobals();
  setHapticsEnabled(true);
});

test('no navigator.vibrate: does not throw', () => {
  vi.stubGlobal('navigator', {});
  expect(() => buzz(30)).not.toThrow();
});

test('vibrate throwing does not throw', () => {
  vi.stubGlobal('navigator', {
    vibrate: () => {
      throw new Error('x');
    },
  });
  expect(() => buzz([10, 20])).not.toThrow();
});

test('calls vibrate when enabled, not when disabled', () => {
  const vibrate = vi.fn();
  vi.stubGlobal('navigator', { vibrate });
  buzz(30);
  expect(vibrate).toHaveBeenCalledWith(30);
  setHapticsEnabled(false);
  buzz(30);
  expect(vibrate).toHaveBeenCalledTimes(1);
});
