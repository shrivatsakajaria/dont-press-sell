# 03 · Don't Press Sell

**Live through a market crash one day at a time. Hold or sell?**

Read `00_shared_rules.md` first.

## The idea

You start with £10,000 in the stock market and pick a crash: 2008, Covid in 2020, or 2022.

- Each tap moves one trading day forward. The chart grows, your balance changes, and a one-line headline says what was happening that day.
- You can press **Sell** at any time, and buy back later.
- At the end you see what you finished with, compared with someone who simply held, and what panicking cost you.

## Why people will click

- It is finance, a game and a lesson in one.
- Markets are jumpy right now, so it is timely.
- The score is easy to share: "I sold at the bottom and ended £2,300 behind someone who held."

## What the visitor does

1. Picks a crash. A "mystery crash" option hides the dates so people can't cheat.
2. Taps **Next day**, or holds the button to fast-forward.
3. Sells or buys back whenever they like.
4. Sees the end screen:
   - their result compared with holding;
   - the market's lowest point;
   - how many days they spent out of the market;
   - a one-line verdict.
5. Shares the result card.

## The wow moment

Watching the balance fall day after day and feeling the urge to sell. Then the end screen shows the recovery they missed.

## Data (all free)

- **Daily closing prices:** the S&P 500 and FTSE 100 for each crash, plus one to two years afterwards to show the recovery.
- **Possible sources:** Stooq daily downloads; FRED (St Louis Fed) for some indices; Robert Shiller's free long-run data as a monthly backup.
- **First step:** confirm a source that is free and allows this kind of use. Save the prices as a file in the project, so the page makes no live calls.
- **Headlines:** write our own short one-liners for key days, for example "Lehman Brothers files for bankruptcy". Do not copy newspaper headlines word for word.

## How it's built

- One page, with all the data in files. No login.
- Optional, later: a leaderboard using nicknames only, on Firebase's free plan.

## Nice extras (later)

- Add the dot-com crash.
- A "panic meter" showing how long you sat in cash.
- A UK mode using the FTSE 100, and a US mode using the S&P 500.

## Watch-outs

- Add a small line: "Not financial advice. Real past markets, for learning."
- Say whether it uses a price index or includes dividends. Keep it simple and state it.
- Dates and figures must be exactly right, because finance people will check.

## Done means

- [ ] All three crashes are playable start to finish on a phone.
- [ ] The headlines are accurate, with dates checked.
- [ ] The end screen and the shareable result card work.
- [ ] Credits and the disclaimer are in the footer.

## The post angle

"I gave myself £10,000 and lived through 2008 one day at a time. I sold on day __."
