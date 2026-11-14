// Vibration where the phone allows it. Never throws.

let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = !!on;
}

export function buzz(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.vibrate === 'function') nav.vibrate(pattern);
  } catch {
    /* vibration is optional */
  }
}
