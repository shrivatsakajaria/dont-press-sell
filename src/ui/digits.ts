// Rolling figures: one slot per character, aligned from the right. A digit that
// changes cross-fades in place (R28: a slide clipped mid-roll looked cut off in
// screenshots), so the whole figure stays readable at every frame.
// The element's text is always exactly the figure, so it reads and tests cleanly.

const EASE = 'cubic-bezier(0.22,1,0.36,1)';
/** Short enough to settle well inside the fastest step (125 ms). */
const ROLL_MS = 60;
/** A changed digit starts at this strength: never faint enough to misread. */
const FROM_OPACITY = 0.5;

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

export function createRoll(el: HTMLElement): Roll {
  let text = '';
  let changed: number[] = [];

  return {
    set(next: string) {
      if (next === text) {
        changed = [];
        return;
      }
      const slots = Array.from(el.children) as HTMLElement[];
      const out: HTMLElement[] = [];
      changed = [];
      const animate = !reducedMotion();
      for (let i = 0; i < next.length; i++) {
        // Same distance from the right edge in the old figure.
        const j = slots.length - (next.length - i);
        const ch = next[i];
        let slot = j >= 0 ? slots[j] : undefined;
        if (!slot) {
          // A slot holding one glyph.
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
            glyph.animate([{ opacity: FROM_OPACITY }, { opacity: 1 }], { duration: ROLL_MS, easing: EASE });
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
