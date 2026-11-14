// Sharing with a fallback for in-app browsers where the share sheet or file saving fails.

/** Minimal model for sharing; the card lane extends it. */
export interface CardModel {
  text: string;
  url: string;
  image?: Blob | null;
}

const FALLBACK_ATTR = 'data-share-fallback';

export async function shareResult(m: CardModel): Promise<'shared' | 'fallback'> {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.share === 'function') {
      const data: ShareData = { text: m.text, url: m.url };
      if (m.image && typeof File !== 'undefined' && typeof nav.canShare === 'function') {
        try {
          const file = new File([m.image], 'dont-press-sell.png', { type: m.image.type || 'image/png' });
          if (nav.canShare({ files: [file] })) data.files = [file];
        } catch {
          /* send text and link only */
        }
      }
      await nav.share(data);
      return 'shared';
    }
  } catch {
    /* rejected, aborted or unsupported: show the fallback */
  }
  try {
    showFallback(m);
  } catch {
    /* nothing more we can do */
  }
  return 'fallback';
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea route */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok !== false;
  } catch {
    return false;
  }
}

let dismissCurrent: ((refocus: boolean) => void) | null = null;
let currentOverlay: HTMLElement | null = null;
let returnFocusTo: HTMLElement | null = null;

function showFallback(m: CardModel): void {
  if (typeof document === 'undefined' || !document.body) return;
  // Re-showing keeps the original focus target, not the old overlay's own button.
  const live = dismissCurrent !== null && currentOverlay !== null && currentOverlay.isConnected;
  const previouslyFocused = live ? returnFocusTo : (document.activeElement as HTMLElement | null);
  if (dismissCurrent) dismissCurrent(false);
  returnFocusTo = previouslyFocused;
  document.querySelector(`[${FALLBACK_ATTR}]`)?.remove();

  const overlay = document.createElement('div');
  overlay.setAttribute(FALLBACK_ATTR, '');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Save or copy your result');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:1000;background:#f3e2d0;color:#1c1a17;display:flex;flex-direction:column;' +
    "align-items:center;gap:16px;padding:24px;overflow:auto;font-family:'Libre Franklin',system-ui,sans-serif;font-weight:500;";

  let objectUrl: string | null = null;
  if (m.image && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      objectUrl = URL.createObjectURL(m.image);
      const img = document.createElement('img');
      img.src = objectUrl;
      img.alt = 'Your result card';
      img.style.cssText = 'max-width:100%;max-height:60dvh;object-fit:contain;border:1px solid #1c1a17;';
      overlay.appendChild(img);
    } catch {
      objectUrl = null;
    }
  }

  if (objectUrl) {
    const hint = document.createElement('p');
    hint.textContent = 'Press and hold to save';
    hint.style.cssText = 'margin:0;font-size:16px;font-weight:700;text-align:center;';
    overlay.appendChild(hint);
  }

  const btnCss =
    "min-height:44px;min-width:44px;padding:0 24px;border:1px solid #1c1a17;border-radius:0;box-shadow:none;font-family:inherit;font-size:16px;font-weight:700;cursor:pointer;";

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy link';
  copy.style.cssText = btnCss + 'background:#1c1a17;color:#f3e2d0;';
  copy.addEventListener('click', () => {
    void copyText(m.url).then((ok) => {
      copy.textContent = ok ? 'Link copied' : 'Copy failed';
    });
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.style.cssText = btnCss + 'background:transparent;color:#1c1a17;';

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss(true);
  };
  function dismiss(refocus: boolean) {
    document.removeEventListener('keydown', onKey);
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* ignore */
      }
    }
    overlay.remove();
    if (dismissCurrent === dismiss) dismissCurrent = null;
    try {
      if (refocus) previouslyFocused?.focus();
    } catch {
      /* ignore */
    }
  }
  dismissCurrent = dismiss;
  currentOverlay = overlay;
  close.addEventListener('click', () => dismiss(true));
  document.addEventListener('keydown', onKey);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;';
  row.append(copy, close);
  overlay.appendChild(row);

  // Visible focus ring without relying on a stylesheet.
  const ring = document.createElement('style');
  ring.textContent = `[${FALLBACK_ATTR}] button:focus-visible{outline:3px solid #a3201a;outline-offset:2px}`;
  overlay.appendChild(ring);

  document.body.appendChild(overlay);
  try {
    copy.focus();
  } catch {
    /* ignore */
  }
}
