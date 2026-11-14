// The pot (spec 6.12): a running total that follows the player. Never changes any starting amount.
import { cell } from '../store/store';
import { isBlind, type Mode } from '../store/record';

export const POT_START = 10000;

const potCell = cell<number>('pot', POT_START);
const bustsCell = cell<number>('busts', 0);
/** "Tonight" counts from page open: plain module memory, never stored. */
let tonight = 0;

/**
 * Settles one finished run. Blind runs (mystery, a first daily, challenge) move the
 * pot by `lead`; rematch and picked runs change nothing. For double or nothing call
 * this once, when the streak ends, with the `settle` value from streak.ts. Pass
 * `recordRun(...).blind` as `blind` so a repeated daily cannot move the pot twice.
 * A pot at zero or below is a bust: counted, then reset to $10,000.
 */
export function applyToPot(mode: Mode, lead: number, blind: boolean = isBlind(mode)): { pot: number; tonight: number; bust: boolean } {
  if (!blind) return { pot: potCell.get(), tonight, bust: false };
  tonight += lead;
  const next = potCell.get() + lead;
  if (next <= 0) {
    bustsCell.set(bustsCell.get() + 1);
    potCell.set(POT_START);
    return { pot: POT_START, tonight, bust: true };
  }
  potCell.set(next);
  return { pot: next, tonight, bust: false };
}

export function getPot(): { pot: number; tonight: number; busts: number } {
  return { pot: potCell.get(), tonight, busts: bustsCell.get() };
}

/** Test helper: pretend the page has just been opened. */
export function resetPot(): void {
  tonight = 0;
}
