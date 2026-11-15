// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { LOAD_FAILED } from '../../src/content/copy';
import { mountLoadError } from '../../src/ui/loaderror';

test('a run that did not load says so on the paper and retries on a tap (I6)', () => {
  const root = document.createElement('div');
  root.innerHTML = '<p>old</p>';
  const retry = vi.fn();
  mountLoadError(root, retry);
  expect(LOAD_FAILED).toBe('This run did not load. Tap to try again.');
  expect(root.textContent).toContain("Don't Press Sell");
  const b = root.querySelector('button')!;
  expect(b.textContent).toBe(LOAD_FAILED);
  expect(root.textContent).not.toMatch(/error|stack|undefined/i);
  b.click();
  expect(retry).toHaveBeenCalledTimes(1);
  b.click(); // a second tap while the retry runs does nothing more
  expect(retry).toHaveBeenCalledTimes(1);
});
