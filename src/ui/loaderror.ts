// A run whose data did not arrive (flaky connection, or a page left open across a deploy): one plain
// line on the paper, and a tap anywhere on it tries again (I6). No error text, no console output.
import { LOAD_FAILED, MASTHEAD } from '../content/copy';

export function mountLoadError(root: HTMLElement, onRetry: () => void): void {
  const page = document.createElement('main');
  page.className = 'play load-error';
  const mast = document.createElement('div');
  mast.className = 'masthead';
  mast.textContent = MASTHEAD;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'retry';
  b.textContent = LOAD_FAILED;
  let tapped = false;
  b.addEventListener('click', () => {
    if (tapped) return;
    tapped = true;
    onRetry();
  });
  page.append(mast, b);
  root.replaceChildren(page);
}
