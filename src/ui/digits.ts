// Figures that change in place: one slot per character, aligned from the right. A changed digit swaps
// at full strength (round 2 panel: the earlier cross-fade read as greyed, the slide before it as
// clipped), so the whole figure is crisp at every frame of a recording. The chart carries the motion.
// R43: only the slots that changed are touched; the figure is never rebuilt, so a new day costs
// one or two text changes, not a fresh row of elements.
// The element's text is always exactly the figure, so it reads and tests cleanly.

export interface Roll {
  set(text: string): void;
  /** Indexes (from the left) of the slots the last set() changed. */
  lastChanged(): number[];
}

function newSlot(): HTMLElement {
  const slot = document.createElement('span');
  slot.className = 'slot';
  slot.append(document.createElement('span'));
  return slot;
}

export function createRoll(el: HTMLElement): Roll {
  let text = '';
  let changed: number[] = [];

  return {
    set(next: string) {
      changed = [];
      if (next === text) return;
      // Match the length from the left, keeping the right-hand slots (the same distance from the right edge).
      const have = el.children.length;
      if (have < next.length) {
        const add: HTMLElement[] = [];
        for (let i = have; i < next.length; i++) add.push(newSlot());
        el.prepend(...add);
      } else {
        for (let i = have; i > next.length; i--) el.firstElementChild?.remove();
      }
      const slots = el.children;
      for (let i = 0; i < next.length; i++) {
        const glyph = slots[i].firstElementChild as HTMLElement;
        if (glyph.textContent !== next[i]) {
          glyph.textContent = next[i];
          changed.push(i);
        }
      }
      text = next;
    },
    lastChanged() {
      return changed.slice();
    },
  };
}
