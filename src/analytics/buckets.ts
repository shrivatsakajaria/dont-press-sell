// Analytics buckets (R67, R68): counts kept on the phone and timings go out as coarse groups only.

/** Picks the label of the first band whose upper bound (exclusive) is above v; the last label otherwise. */
function band(v: number, bounds: number[], labels: string[]): string {
  for (let i = 0; i < bounds.length; i++) if (v < bounds[i]) return labels[i];
  return labels[labels.length - 1];
}

/** Games ever on this phone, this one included. */
export const gamesBucket = (n: number) => band(n, [2, 3, 6, 11], ['1', '2', '3-5', '6-10', '11+']);

/** Whole days since the first game on this phone. */
export const daysBucket = (d: number) => band(d, [1, 2, 8], ['0', '1', '2-7', '8+']);

/** Days from one local date (YYYY-MM-DD) to another; 0 when either does not read. */
export function daysBetween(from: string, to: string): number {
  const d = Math.round((Date.parse(to) - Date.parse(from)) / 864e5);
  return Number.isFinite(d) ? d : 0;
}

/** From page load to the Start press (first game of a visit). */
export const msToStartBucket = (ms: number) => band(ms, [3e3, 1e4, 3e4, 6e4], ['<3s', '3-10s', '10-30s', '30-60s', '60s+']);

/** Whole dollars ahead (+) or behind (-) someone who did nothing. */
export function leadBucket(lead: number): string {
  const l = Math.round(lead) || 0;
  if (l === 0) return '0';
  if (l < 0) return band(l, [-1999, -499, 0], ['-2000 or less', '-1999 to -500', '-499 to -1']);
  return band(l, [500, 2000], ['1 to 499', '500 to 1999', '2000 or more']);
}

/** A percentage in tens: 0, 10, ... 100. */
export const tens = (p: number) => (p > 0 ? Math.min(100, Math.floor(p / 10) * 10) : 0);

/** Seconds of play, Start to the result. */
export const secBucket = (s: number) => band(s, [30, 60, 90, 120, 180], ['<30', '30-59', '60-89', '90-119', '120-179', '180+']);

/** Seconds on the result page before the next move. */
export const resultSecBucket = (s: number) => band(s, [5, 15, 30, 60], ['<5', '5-14', '15-29', '30-59', '60+']);

export type InApp = 'linkedin' | 'x' | 'facebook' | 'instagram' | 'whatsapp' | 'other-inapp' | 'none';

/** Which app's built-in browser the page is open in, from the user agent; 'none' for a plain browser. */
export function inAppFrom(ua: string): InApp {
  if (/LinkedInApp/i.test(ua)) return 'linkedin';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) return 'facebook';
  if (/Twitter/i.test(ua)) return 'x';
  if (/WhatsApp/i.test(ua)) return 'whatsapp';
  // Android WebView marks itself "; wv)"; an iPhone or iPad web view leaves "Safari/" off.
  if (/; wv\)|Snapchat|TikTok|musical_ly|Bytedance|MicroMessenger|Line\/|Pinterest|Telegram|GSA\//i.test(ua)) return 'other-inapp';
  if (/iPhone|iPad|iPod/.test(ua) && /Mobile\//.test(ua) && !/Safari\//.test(ua)) return 'other-inapp';
  return 'none';
}
