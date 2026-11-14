/**
 * Perfect timing (spec 7.1): the best result with one sale and one buy-back.
 * One pass: track the highest close so far and the best ratio of that high to
 * the current close. When no fall exists the result is the holder's and both
 * indexes are 0.
 */
export function perfectTiming(
  closes: number[],
  start = 10000,
): { final: number; sellIndex: number; buyIndex: number } {
  if (closes.length === 0) return { final: start, sellIndex: 0, buyIndex: 0 };
  let highIdx = 0;
  let bestRatio = 1;
  let sellIndex = 0;
  let buyIndex = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[highIdx]) highIdx = i;
    const ratio = closes[highIdx] / closes[i];
    if (ratio > bestRatio) {
      bestRatio = ratio;
      sellIndex = highIdx;
      buyIndex = i;
    }
  }
  const final = ((start * closes[closes.length - 1]) / closes[0]) * bestRatio;
  return { final, sellIndex, buyIndex };
}
