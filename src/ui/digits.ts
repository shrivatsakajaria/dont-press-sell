// Rolling figures: one slot per character, aligned from the right. A digit that
// changes rolls in from below when the figure rises and from above when it falls.
// The element's text is always exactly the figure, so it reads and tests cleanly.

const EASE = 'cubic-bezier(0.22,1,0.36,1)';
/** Short enough to settle inside the fastest step (125 ms), so the figure is always readable. */
const ROLL_MS = 90;

export interface Roll {
  set(text: string): void;
  /** Indexes (from the left) of the slots the last set() changed. */
  lastChanged(): number[];
}

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const numberOf = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;

export function createRoll(el: HTMLElement): Roll {
  let text = '';
  let changed: number[] = [];

  return {
    set(next: string) {
      if (next === text) {
        changed = [];
        return;
      }
      const old = text;
      const slots = Array.from(el.children) as HTMLElement[];
      const out: HTMLElement[] = [];
      changed = [];
      const animate = !reducedMotion();
      const up = numberOf(next) >= numberOf(old);
      for (let i = 0; i < next.length; i++) {
        // Same distance from the right edge in the old figure.
        const j = slots.length - (next.length - i);
        const ch = next[i];
        let slot = j >= 0 ? slots[j] : undefined;
        if (!slot) {
          // A clipping slot holding one glyph, so a rolling digit slides in from the edge.
          slot = document.createElement('span');
          slot.className = 'slot';
          slot.append(document.createElement('span'));
        }
        const glyph = slot.firstElementChild as HTMLElement;
        if (glyph.textContent !== ch) {
          const was = glyph.textContent;
          glyph.textContent = ch;
          changed.push(i);
          if (animate && was && /\d/.test(ch) && typeof glyph.animate === 'function') {
            glyph.animate(
              [{ transform: `translateY(${up ? '' : '-'}0.6em)` }, { transform: 'translateY(0)' }],
              { duration: ROLL_MS, easing: EASE },
            );
          }
        }
        out.push(slot);
      }
      el.replaceChildren(...out);
      text = next;
    },
    lastChanged() {
      return changed.slice();
    },
  };
}
