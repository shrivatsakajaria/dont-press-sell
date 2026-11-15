// Every fixed on-screen string (plan, Global Constraints). Verbatim.
// Only the lead agent edits this file.

const usd = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Whole dollars with thousands separators, no sign: 10340 -> "$10,340". */
export function dollars(n: number): string {
  return '$' + usd.format(Math.round(Math.abs(n)));
}

export const MASTHEAD = "Don't Press Sell";
export const FIRST_SALE_LINE = 'You are out. To win, buy back in for less than you sold.';
export const sellLabel = (n: number) => `Sell for ${dollars(n)}`;
// Round 2, lane C (R38, R41); round 3, lane S (R63: "more expensive", never "dearer"): the buy-back button names one number, the saving against the latest
// sale's close (positive is cheaper, 0 is the same price); the press stamps.
const cheaperWords = (n: number) =>
  Math.round(n) === 0 ? 'at the same price' : `${dollars(n)} ${n > 0 ? 'cheaper' : 'more expensive'}`;
export const buyBackLabel = (saving: number) => `Buy back ${cheaperWords(saving)}`;
export const soldStamp = (n: number) => `Sold at ${dollars(n)}`;
export const boughtStamp = (saving: number) => `Bought back ${cheaperWords(saving)}`;
/** Round 3, lane S (R61): in the final hold, in place of the greyed-out button, until the result arrives. */
export const GAME_OVER = 'Game over';
export const TAP_TO_REVEAL ='Tap to see what that was';
export const nextMysteryLine = (n: number) => `Next mystery crash in ${n}. Tap to stop.`;
export const WINS_IN_A_ROW = 'Wins in a row';
export const sellingAtTopLine = (n: number) => `Selling at the top would have saved you ${dollars(n)}`;
export const daysInRowLine = (n: number) => `${n} days in a row`;
/** A finish that rounds to $0 (R32): never "$0 ahead" or "beat the market by $0". */
export const LEVEL_LINE = 'Level with someone who did nothing';
/** The ahead/behind words for any amount, $0 included (the count-up passes through it). */
export const aheadBehindLine = (lead: number, behind: boolean) =>
  behind ? `${dollars(lead)} behind someone who did nothing` : `${dollars(lead)} ahead of someone who did nothing`;
export const leadLine = (lead: number) => (Math.round(lead) === 0 ? LEVEL_LINE : aheadBehindLine(lead, lead < 0));
// Time out of the market (result page, near-miss list), in plain words (R28).
const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n: number, unit: string, digits = n > 10) => `${digits ? n : SMALL[n]} ${unit}${n === 1 ? '' : 's'}`;
const YEAR = 365.25;
const MONTH = YEAR / 12;
/**
 * A number of calendar days as "three years and five months", "two weeks and three days" or "one day":
 * the two largest units, always rounded down (a 365-day year counts as a year). Words up to ten; a
 * pair with a number over ten is all digits ("24 years and 10 months").
 */
export function timeWords(days: number): string {
  const d = Math.max(0, Math.floor(days));
  const years = Math.floor((d + 1) / YEAR);
  let rest = d - Math.round(years * YEAR);
  const months = Math.max(0, Math.floor((rest + 1) / MONTH));
  rest = Math.max(0, rest - Math.round(months * MONTH));
  // At most three weeks after a month ("two months and four weeks" reads wrong); rounding down stays true.
  const weeks = Math.min(months ? 3 : 4, Math.floor(rest / 7));
  const left = rest % 7;
  // Words or digits, never both in one line: a number over ten puts the pair in digits ("24 years and 10 months").
  const pair = (a: number, ua: string, b: number, ub: string) => {
    const digits = a > 10 || b > 10;
    return b ? `${count(a, ua, digits)} and ${count(b, ub, digits)}` : count(a, ua, digits);
  };
  if (years) return pair(years, 'year', months, 'month');
  if (months) return pair(months, 'month', weeks, 'week');
  if (weeks) return pair(weeks, 'week', left, 'day');
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
/** Round 3, lane S (R62): SK's fourth line, after his three, on the full Start screen only. */
export const START_DRAW_LINE = "Do nothing and it's a draw.";
export const START_LABEL = 'Start';

export const DOUBLE_OR_NOTHING = 'Double or nothing';
// Round 2 fix, lane FD (R58): the button that banks a win names what it does, with no figure (the pot is hidden).
export const KEEP_MY_WIN = 'Keep my win';
export const REMATCH = 'Rematch this crash';
export const CHALLENGE = 'Challenge a friend';
export const NEW_MYSTERY = 'Play a new mystery crash';
export const CARD_GUESS = 'Can you guess which crash this was?';
// Round 2 fix, lane FD (R58): the result prints the two halves apart, so "You finished with $N." is never trimmed.
export const perfectTimingPart = (perfect: number) => `Perfect timing made ${dollars(perfect)}.`;
export const finishedLine = (you: number) => `You finished with ${dollars(you)}.`;
export const perfectLine = (perfect: number, you: number) => `${perfectTimingPart(perfect)} ${finishedLine(you)}`;

// Round 2, lane D (R44, R45, R49): the result screen's streak lines and the short start screen.
/** After a win, large: "Wins in a row: 2". */
export const winsInRowLine = (n: number) => `${WINS_IN_A_ROW}: ${n}`;
/** After a loss, when there has been a streak: "Best winning streak: 3". */
export const bestWinningStreakLine = (n: number) => `Best winning streak: ${n}`;
/** The short start screen of a double-or-nothing game. */
export const doubleStartLine = (start: number) => `Double or nothing. You start with ${dollars(start)}.`;

export const FOOTER_PLAY = 'US stock market · Not financial advice';
export const FOOTER_RESULT = 'US stock market · A Still Signal build';

/** The play headline before a run's first news line (always true: every run trades below its old high until the last day). */
export const BEFORE_NEWS = 'Shares are down from their recent high';

// Rematch and challenge (spec 6.7).
export const scoreToBeatLine = (n: number) => `Score to beat: ${dollars(n)}`;

// Round 2 fix lane FA (R51, R52, R53): lines under the headline that the narrator shows at a press and
// in a rematch. No opening line any more (the Start screen says it). Each stays true for as long as it
// can be on screen: a sale line while the player stays in cash, a buy line for good (it is about the
// price paid), the rematch line for good (it names the day, as the folio shows it: index + 1).
export const soldLastTimeLine = (dayIndex: number) => `Last time, you sold on day ${dayIndex + 1}.`;
/** At a sale (after this phone's first, which shows FIRST_SALE_LINE); `cash` is the balance now in cash. */
export const soldLines = (cash: number): string[] => [
  `You sold. Your ${dollars(cash)} is in cash now.`,
  `Out of the market, with ${dollars(cash)} in cash.`,
  `${dollars(cash)} in cash. Prices can move without you now.`,
];
/** At a buy back; `saving` as on the button (R38): positive is cheaper than the latest sale. */
export const boughtLines = (saving: number): string[] => {
  const how = Math.round(saving) > 0 ? 'at a lower price than' : Math.round(saving) < 0 ? 'at a higher price than' : 'at the same price as';
  const short = Math.round(saving) > 0 ? 'for less than' : Math.round(saving) < 0 ? 'for more than' : 'at the price';
  return [
    `You bought back in ${how} you sold.`,
    `Back in the market, ${short} you sold.`,
    `In again, ${how} you sold.`,
  ];
};

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
// Round 2, lane B (R42): the chart is the market price only.
/** The faint level at the latest sale close while in cash. */
export const SOLD_AT = 'Sold at';
const pctWord = (f: number) => `${Math.round(Math.abs(f) * 100)}%`;
/** Text alternative for the play chart: the market's move since day 1 and, in cash, today's price against the sale. */
export const marketChartLabel = (days: number, change: number, vsSale: number | null) =>
  `Chart of the market price over ${days} ${days === 1 ? 'day' : 'days'}: ` +
  (Math.round(change * 100) === 0 ? 'level with day 1' : `${change > 0 ? 'up' : 'down'} ${pctWord(change)} since day 1`) +
  (vsSale === null
    ? '.'
    : Math.round(vsSale * 100) === 0
      ? '. Today\'s price is about where you sold.'
      : `. Today's price is ${pctWord(vsSale)} ${vsSale < 0 ? 'below' : 'above'} where you sold.`);

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
  pickStand: 'Practice runs. You know how each one ends, so they do not count towards your record or your collection.',
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
  vibration: 'Vibration',
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
export const SHARE_LEVEL = `${LEVEL_LINE} in a crash I could not see coming. Beat me.`;
export const shareLevelPractice = (go: string) => `${LEVEL_LINE} ${go}. Beat me.`;

// Share fallback (spec 10).
export const SHARE_DIALOG = 'Save or copy your result';
export const CARD_ALT = 'Your result card';
export const PRESS_TO_SAVE = 'Press and hold to save';
export const COPY_LINK = 'Copy link';
export const LINK_COPIED = 'Link copied';
export const COPY_FAILED = 'Copy failed';
export const CLOSE = 'Close';

// A run whose data did not load (I6).
export const LOAD_FAILED = 'This run did not load. Tap to try again.';
