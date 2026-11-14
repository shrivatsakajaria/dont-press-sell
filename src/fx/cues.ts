// Which sound and vibration go with each moment of play (spec 9, Task 12).
import type { Sfx } from './sound';

export interface CueInput {
  newStep: boolean;
  trade: 'sell' | 'buy' | null;
  holdMs: number;
  worst: boolean;
  invested: boolean;
  phase: 'fall' | 'forward';
  /** The live counter while in cash: cash minus what the holder's shares are worth. */
  leadNow: number;
  start: number;
  /** 0 to 1 through the fast-forward. */
  forwardProgress: number;
}

/** The counter's lead mapped to a tone level: 10% behind is the bottom, 20% ahead the top. */
const counterLevel = (lead: number, start: number) => Math.min(1, Math.max(0, (lead / start + 0.1) / 0.3));

export function playCues(sfx: Sfx, buzz: (p: number | number[]) => void, c: CueInput): void {
  if (c.trade) {
    sfx.till();
    buzz(40);
    return;
  }
  if (!c.newStep) return;
  if (c.worst) {
    sfx.thud();
    buzz([60, 40, 60]);
  } else if (!c.invested) {
    sfx.counter(counterLevel(c.leadNow, c.start));
  } else if (c.phase === 'forward') {
    sfx.rise(c.forwardProgress);
  } else {
    sfx.tick(c.holdMs > 0 ? 1000 / c.holdMs : 0);
  }
}
