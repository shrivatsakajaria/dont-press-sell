// Every fixed on-screen string (plan, Global Constraints). Verbatim.
// Only the lead agent edits this file.

const usd = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Whole dollars with thousands separators, no sign: 10340 -> "$10,340". */
export function dollars(n: number): string {
  return '$' + usd.format(Math.round(Math.abs(n)));
}

export const MASTHEAD = "Don't Press Sell";
export const OPENING_LINE = 'You have $10,000 of play money in the stock market. Hold your nerve or bail.';
export const FIRST_SALE_LINE = 'You are out. To win, buy back in for less than you sold.';
export const sellLabel = (n: number) => `Sell for ${dollars(n)}`;
export const buyBackLabel = (lead: number) =>
  lead >= 0 ? `Buy back now: ${dollars(lead)} ahead` : `Buy back now: ${dollars(lead)} behind`;
export const TAP_TO_REVEAL = 'Tap to see what that was';
export const nextMysteryLine = (n: number) => `Next mystery crash in ${n}. Tap to stop.`;
export const WINS_IN_A_ROW = 'Wins in a row';
export const sellingAtTopLine = (n: number) => `Selling at the top would have saved you ${dollars(n)}`;
export const daysInRowLine = (n: number) => `${n} days in a row`;
export const leadLine = (lead: number) =>
  lead < 0 ? `${dollars(lead)} behind someone who did nothing` : `${dollars(lead)} ahead of someone who did nothing`;
export const potLine = (n: number) => `Your pot: ${dollars(n)}`;
export const PLAY_BORROWED = 'Play with borrowed money';
export const BORROWED_OPENING = 'You have borrowed $20,000. Every move is three times bigger. Fall a third and you are wiped out.';
export const DOUBLE_OR_NOTHING = 'Double or nothing';
export const bankLabel = (n: number) => `Bank ${dollars(n)}`;
export const REMATCH = 'Rematch this crash';
export const CHALLENGE = 'Challenge a friend';
export const NEW_MYSTERY = 'Play a new mystery crash';
export const CARD_GUESS = 'Can you guess which crash this was?';
export const perfectLine = (perfect: number, you: number) =>
  `Perfect timing made ${dollars(perfect)}. You made ${dollars(you)}.`;

export const FOOTER_PLAY = 'US stock market · Not financial advice';
export const FOOTER_RESULT = 'US stock market · A Still Signal build';

/** The play headline before a run's first news line (always true: every run trades below its old high until the last day). */
export const BEFORE_NEWS = 'Shares are down from their recent high';

// Rematch and challenge (spec 6.7).
export const SOLD_LAST_TIME = 'This is the day you sold last time.';
export const scoreToBeatLine = (n: number) => `Score to beat: ${dollars(n)}`;

// Run labels in the folio (spec 6.2) and special front pages (6.8, 6.12).
export const REMATCH_LABEL = 'Rematch';
export const dailyLabel = (n: number) => `Daily crash ${n}`;
export const BUST_HEADLINE = 'Local investor loses the lot';
export const ISLAND_HEADLINE = 'Local investor retires to private island';
