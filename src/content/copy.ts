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
// Time out of the market (result page, near-miss list), in plain words (R28).
const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n: number, unit: string) => `${n <= 10 ? SMALL[n] : n} ${unit}${n === 1 ? '' : 's'}`;
const YEAR = 365.25;
const MONTH = YEAR / 12;
/**
 * A number of calendar days as "three years and five months", "two weeks and three days" or "one day":
 * the two largest units, always rounded down (a 365-day year counts as a year).
 */
export function timeWords(days: number): string {
  const d = Math.max(0, Math.floor(days));
  const years = Math.floor((d + 1) / YEAR);
  let rest = d - Math.round(years * YEAR);
  const months = Math.max(0, Math.floor((rest + 1) / MONTH));
  rest = Math.max(0, rest - Math.round(months * MONTH));
  const weeks = Math.floor(rest / 7);
  const left = rest % 7;
  const pair = (a: string, b: string | null) => (b ? `${a} and ${b}` : a);
  if (years) return pair(count(years, 'year'), months ? count(months, 'month') : null);
  if (months) return pair(count(months, 'month'), weeks ? count(weeks, 'week') : null);
  if (weeks) return pair(count(weeks, 'week'), left ? count(left, 'day') : null);
  return count(left, 'day');
}
export const outOfMarketLine = (days: number) => `Out of the market for ${timeWords(days)}`;
/** Under the result table, the first time a player sees a result. */
export const HOLDER_NOTE = 'Someone who did nothing kept all their money in the market the whole time.';

export const potLine =(n: number) => `Your pot: ${dollars(n)}`;
export const PLAY_BORROWED = 'Play with borrowed money';
export const BORROWED_OPENING = 'You have borrowed $20,000. Every move is three times bigger. Fall a third and you are wiped out.';

// Start screen (ruling R28): three plain lines on the still front page, then Start.
// The owner's final words; borrowed money adds BORROWED_OPENING under them.
export const START_LINES: [string, string, string] = [
  'The market is falling. Nobody knows how far.',
  'You have $10,000, and one button.',
  'Press the button to sell if you dare. Get back in cheaper and you win. Wait too long and the market leaves without you.',
];
export const START_LABEL = 'Start';

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

/** The borrowed money switch on the result page once it is on (off, it reads PLAY_BORROWED). */
export const BORROWED_ON = 'Borrowed money on';
export const BORROWED_LABEL = 'Borrowed money';

// Sharing (spec 6.9, 10).
export const COPY_RESULT = 'Copy result';
export const COPIED = 'Copied';

// Play screen (spec 6.2 to 6.6).
export const STATUS_DEFAULT = 'Price: your nerve';
export const STATUS_SLOW = 'Time slowed';
export const STATUS_CASH = 'You are in cash';
export const STATUS_FORWARD = 'Fast forward';
export const STATUS_PAUSED = 'Paused';
export const MYSTERY_LABEL = 'Mystery crash';
export const PAUSE = 'Pause';
export const RESUME = 'Resume';
export const SOUND_ON = 'Sound on';
export const SOUND_OFF = 'Sound off';
export const IN_CASH = 'in cash';
export const LEVEL = 'level';
export const dayLabel = (n: number) => `Day ${n}`;
export const yearLabel = (n: number) => `Year ${n}`;
export const youHadLine = (n: number) => `You had ${dollars(n)} yesterday`;
export const regretMadeLine = (n: number) => `Holding today would have made you ${dollars(n)}`;
export const regretCostLine = (n: number) => `Holding today would have cost you ${dollars(n)}`;
export const upLabel = (n: number) => `up ${dollars(n)}`;
export const downLabel = (n: number) => `down ${dollars(n)}`;
/** Placeholders until the real headlines and commentary arrive (Tasks 7 and 10). */
export const placeholderHeadline = (day: number) => `Headline for day ${day}`;
export const placeholderStandfirst = (day: number) => `Commentary for day ${day}`;
export const chartLabel = (days: number, bal: number, start: number) =>
  `Chart of your balance over ${days} ${days === 1 ? 'day' : 'days'}: ${dollars(bal)} against the ${dollars(start)} you started with`;
export const soldAnnouncement = (n: number) => `Sold for ${dollars(n)}`;
export const boughtAnnouncement = (n: number) => `Bought back with ${dollars(n)}`;

// Play chart labels.
export const STARTED_AT = (n: number) => `Started at ${dollars(n)}`;
export const THE_MARKET = 'The market';
export const SOLD = 'Sold';
export const BOUGHT = 'Bought';

// Result front page (spec 6.6 to 6.8, 6.12).
export const LATE_EDITION = 'Late edition';
export const SCORE_TO_BEAT = 'Score to beat';
export const YOUR_CHALLENGER = 'Your challenger';
export const SOMEONE_WHO_DID_NOTHING = 'Someone who did nothing';
export const PERFECT_TIMING = 'Perfect timing';
export const YOU = 'You';
export const DAILY_CRASH = 'Daily crash';
export const PICK_A_CRASH = 'Pick a crash';
export const YOUR_COLLECTION = 'Your collection';
export const soundLabel = (on: boolean) => (on ? 'Sound on' : 'Sound off');
export const vibrationLabel = (on: boolean) => (on ? 'Vibration on' : 'Vibration off');
/** Caption under the chart, keyed to its "Sold" and "Bought" marks. */
export const tradeNewsLabel = (side: 'sell' | 'buy') => (side === 'sell' ? 'Sold:' : 'Bought:');
export const doubleStakeLine = (lead: number, final: number) =>
  `Keep your ${dollars(lead)} win, or take all ${dollars(final)} into another mystery game. Finish behind and the run is over.`;
export const potResultLine = (pot: number, tonight: number) => {
  const t = Math.round(tonight);
  if (t === 0) return `${potLine(pot)}.`;
  return `${potLine(pot)}. ${t > 0 ? 'Up' : 'Down'} ${dollars(t)} tonight.`;
};
export const challengerLine = (you: number, them: number) => {
  const d = Math.round(you) - Math.round(them);
  if (d > 0) return `You beat your challenger by ${dollars(d)}`;
  if (d < 0) return `Your challenger beat you by ${dollars(d)}`;
  return 'You and your challenger finished level';
};

// Menus: pick a crash and the collection (spec 6.10).
export const MENU_TEXT = {
  pickTitle: 'Pick a crash',
  pickFolio: 'Practice',
  pickStand: 'Practice runs. You know how each one ends, so they do not count towards your pot or your collection.',
  collectionTitle: 'Your collection',
  back: 'Back',
  crash: 'Crash',
  falseAlarm: 'False alarm',
  titlesHeading: 'Verdict titles',
  runsHeading: 'Runs',
  recordHeading: 'Your record',
  noGames: 'No games yet',
  noStreak: 'No streak yet',
  notEarned: 'Not earned yet',
  notPlayed: 'Not played yet',
  keptOnPhone: 'Kept on this phone',
  forVisit: 'For this visit',
  on: 'On',
  off: 'Off',
};
export const bustLine = (n: number) => (n === 1 ? 'Gone bust once' : `Gone bust ${n} times`);
export const runsCountLine = (n: number) => `${n} runs`;
export const playedLine = (n: number, total: number) => `${n} of ${total} played`;
export const titlesEarnedLine = (n: number, total: number) => `${n} of ${total} titles earned`;
export const bestStreakLine = (wins: number, title: string | null) =>
  `Best streak: ${wins} ${wins === 1 ? 'win' : 'wins'} in a row${title ? `, ${title}` : ''}`;

// Result card and share lines (spec 6.8, 6.11, 10).
export const BEAT_ME = 'Beat me';
export const practiceFolio = (crash: string) => `Rematch, ${crash}`;
export const survivedLine = (n: number) => `Survived ${n} crashes in a row`;
export const practiceGo = (ordinal: string, crash: string) => `on my ${ordinal} go at ${crash}`;
export const shareAhead = (lead: number) => `I beat the market by ${dollars(lead)} in a crash I could not see coming. Beat me.`;
export const shareBehind = (lead: number) => `I finished ${dollars(lead)} behind someone who did nothing. Beat me.`;
export const shareAheadPractice = (lead: number, go: string) => `I beat the market by ${dollars(lead)} ${go}. Beat me.`;
export const shareBehindPractice = (lead: number, go: string) => `I finished ${dollars(lead)} behind someone who did nothing ${go}. Beat me.`;

// Share fallback (spec 10).
export const SHARE_DIALOG = 'Save or copy your result';
export const CARD_ALT = 'Your result card';
export const PRESS_TO_SAVE = 'Press and hold to save';
export const COPY_LINK = 'Copy link';
export const LINK_COPIED = 'Link copied';
export const COPY_FAILED = 'Copy failed';
export const CLOSE = 'Close';
