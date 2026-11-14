// One polite live region for the whole page: big days, trades and the result.

let region: HTMLElement | null = null;

function getRegion(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (region && region.isConnected) return region;
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  // Visually hidden but still read out (never display:none).
  el.style.cssText =
    'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0';
  document.body.appendChild(el);
  region = el;
  return el;
}

/** Create the live region up front so screen readers register it before the first message. */
export function initAnnouncer(): void {
  try {
    getRegion();
  } catch {
    /* announcements are optional */
  }
}

export function announce(text: string): void {
  try {
    const el = getRegion();
    if (!el) return;
    // Clear first, then set on the next tick, so a repeated string is announced again.
    el.textContent = '';
    setTimeout(() => {
      try {
        el.textContent = text;
      } catch {
        /* ignore */
      }
    }, 0);
  } catch {
    /* announcements are optional */
  }
}
