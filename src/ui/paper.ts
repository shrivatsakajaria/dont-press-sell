// Paper colours (spec section 9). Values are exact; do not change without the spec.

export interface Paper {
  bg: string;
  ink: string;
  secondary: string;
  accent: string;
  buttonBg: string;
  buttonInk: string;
}

/** The market's dashed line while the player is in cash. */
export const MARKET_DASH = '#6b6558';

const CALM_BG = '#f3e2d0';
const LOSING_BG = '#efc3b2';
const INK = '#1c1a17';
const CALM_SECONDARY = '#4a443c';
const LOSING_SECONDARY = '#4a2f28';
const RED_INK = '#a3201a';
const LOSS_FULL = 0.3;

function mix(a: string, b: string, t: number): string {
  const out = [1, 3, 5].map((i) => {
    const x = parseInt(a.slice(i, i + 2), 16);
    const y = parseInt(b.slice(i, i + 2), 16);
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  });
  return '#' + out.join('');
}

export function paperFor(s: { lossFrac: number; inCash: boolean; worstDay: boolean }): Paper {
  if (s.worstDay) {
    return {
      bg: '#b3142a', ink: '#fbeee2', secondary: '#fbeee2', accent: '#fbeee2',
      buttonBg: '#fbeee2', buttonInk: '#8f0f22',
    };
  }
  if (s.inCash) {
    const bg = '#ebe4d6';
    return { bg, ink: INK, secondary: '#4a463c', accent: RED_INK, buttonBg: INK, buttonInk: bg };
  }
  const t = Math.min(1, Math.max(0, s.lossFrac / LOSS_FULL));
  const bg = mix(CALM_BG, LOSING_BG, t);
  return {
    bg, ink: INK, secondary: mix(CALM_SECONDARY, LOSING_SECONDARY, t), accent: RED_INK,
    buttonBg: INK, buttonInk: bg,
  };
}
