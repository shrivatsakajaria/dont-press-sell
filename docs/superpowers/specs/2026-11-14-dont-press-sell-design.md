# Don't Press Sell: design

Status: draft for SK's approval. Written 13 November 2026, updated after the builder check.
Owner: SK (Still Signal). SK is not technical: when he has to do something himself, explain it click by click, in plain British English.

Read these first, in this order:

1. `docs/reference/00_shared_rules.md` (rules for all five weekend builds)
2. `docs/reference/03_dont_press_sell.md` (the original brief; this document replaces it wherever they differ)
3. This document
4. The mock-up canvas "Don't Press Sell: three looks" (https://claude.ai/artifact/AhkGS1FNbDhdAJU58PSGBA), page "The blend": six phone screens that show the approved look and mechanics. The other page, "Five looks", holds rejected directions and is there for context only. The HTML source of the six approved screens is copied into `docs/reference/mockups/`.

---

## 1. What this is, in one paragraph

A single web page that works as a one-button game. You are given $10,000 in the US stock market just before a real historical crash. The days run by themselves, about 120 seconds per run, and the screen is a newspaper front page whose headline changes with the news and whose paper turns red as you lose money. One button sells everything; the same button buys back. Selling alone never wins: every run plays on, in a fast-forward, until the market is back at its old high, so the only way to beat someone who did nothing is to buy back in cheaper than you sold. At the end the paper prints a front page about you, compares you with someone who did nothing and with perfect timing, and offers a rematch, a link that dares a friend to beat you, or the chance to stake a winning result on the next crash. It is made to be screen-recorded and posted on LinkedIn and X, and to be replayed.

## 2. Why, and what success looks like

- It is a Still Signal builder post: built with AI, said openly, shared on LinkedIn, X and other platforms.
- SK's goal in his words: an application that gets clicks, that is addictive in the way Vampire Survivors is, and that "should give the same rush as gambling". Variety and replay matter as much as the first run.
- Success is people finishing a run, playing again at once, and posting or sending their result. The post needs one striking screenshot (the red front page), a 10 to 20 second recording that reads instantly, and a result card people want to share.
- A second, blind test with 24 simulated players, given only a neutral walk-through of one game, scored it 7.5 out of 10 for rush, 6.5 for wanting another go and 6.2 for wanting to share. All 24 stayed past five seconds and all 24 would replay at once. At the red moment 12 sold and 12 held. Their confusions (the double-or-nothing wording, a percentage score, what "buy back" means, whether the money is real) are fixed in this version.
- The same ten players from the first test then tried the version with the live counter, the pot, the reveal, the ladder and borrowed money: rush 7.1, another go 6.6, share 5.6. Wanting another go rose; the adviser scored it 5, 2 and 1 and pulled the averages down. Five sold at the red moment and all five watched the counter climb; the five who held saw nothing new, which is why 6.4 gives holders a regret line.
- A first test with ten simulated players (a trader, an adviser, a designer, a finance director, a novice, a game designer, a portfolio manager, a student, a retiree, a marketer) shaped the design. Everyone would tap and finish one run. Replay and sharing were the weak points, and sections 6 and 8 exist to fix them.

## 3. Goals, non-goals, anti-goals

Goals
- Works on a phone first. The Start screen is on screen within about 2 seconds; the days run when the player presses Start (6.1).
- A game lasts about 120 seconds, and the next one starts only when the player chooses it. Every game opens on a Start screen (6.1).
- Every run is a real bet: the player cannot tell a crash from a false alarm, holding is a draw, selling and staying out always loses, and winning takes two well-timed presses.
- Every figure and every dated headline is correct, because finance people will check.
- Costs £0 to run, with no sign-ups, no ads, no server and no personal data.

Non-goals for this version
- Selling part of your holding (all in or all out only).
- A UK or FTSE mode.
- A shared leaderboard at launch. It is the first update after launch (section 16).
- A classroom mode (R49).
- More than the twelve launch runs in section 7.2. The rest follow in weekly batches, which also gives SK follow-up posts.

Anti-goals (would make it a failure even if it technically works)
- Looking like a default AI-made site, a trading dashboard or a casino. No dark-and-orange template, no fruit-machine or bet-slip styling, no purple gradients, no glow or shadow behind text, no Inter or Fraunces, no emoji.
- A run where the right move is obvious. If "always hold" or "sell on day one and walk away" reliably wins, the game is dead after two runs.
- A wrong date, a wrong figure or a headline copied from a newspaper.
- Anything that nags: no streak lights, no countdown to the next daily crash.

## 4. Constraints

From the shared rules, binding unless listed as an exception below: free data, non-commercial, no logins, no personal data, mobile first, fast, British spelling, short plain words on screen, data shipped as files with no live calls, GitHub plus Cloudflare Pages hosting.

Exceptions SK made for this build
- Currency is US dollars, not pounds.
- The market is called "the US stock market" on screen. The name "S&P 500" does not appear anywhere in the app.
- The shared rule "credit every data source in the footer" is set aside for this build. The footer carries "US stock market · Not financial advice" during play and "US stock market · A Still Signal build" on result screens.
- The look does not follow the Still Signal design system. SK approved the front-page look in section 9 instead.

As with Let Go of a Balloon, the Wiz Digital standards file (React, Node, Express, Azure SQL, Docker) does not apply: this is a static site with no backend.

## 5. Approaches considered

### 5.1 Pace
1. Tap once per trading day (the original brief). A 2008 run is 600 to 850 taps and several minutes; most people would quit.
2. Chosen: the days run by themselves and slow sharply on the biggest days. The player's only job is the button.
3. Tap through the first weeks, then auto-run. More complex with no gain.

### 5.2 Prices
1. Chosen by SK: real S&P 500 daily closing values, downloaded once and saved in the project. The famous daily moves match what people find when they search.
2. The Kenneth French data library (whole US market, dividends included). Cleaner to use but its daily figures differ slightly from the numbers people know. Rejected by SK.
3. FRED: only the last ten years, so 2008 is missing. Rejected.

### 5.3 How it is built
1. Chosen: one static page with a hand-drawn chart, all data in files.
2. A standard app framework with an off-the-shelf chart library: slower first paint and a generic dashboard look.
3. A game engine: heavy to load inside in-app browsers, more than a one-button game needs.

### 5.4 The look
Five directions were mocked up and tested with the ten simulated players: Tape (dark Still Signal), Front page (newspaper), Red screen (full red flood), Fruit machine, Bet slip. The front-page result card won clearly (6 of 10 would post it). The players who wanted a rush picked the red screen. The two casino looks were liked least and read as gambling adverts. Chosen: a blend, the front page that turns red (section 9).

### 5.5 The voice
1. Full WallStreetBets slang everywhere. Half the testers winced or did not understand it.
2. Chosen by SK: slang verdict titles with a plain line underneath, news lines kept straight, commentary that is funny in plain English.
3. A switch between the two. Not needed.

---

## 6. The game, step by step

### 6.1 Arriving
- Every game opens on a Start screen before the days run: the new mystery game, a rematch and double or nothing as well (R45). The masthead reads "Don't Press Sell". Under it, SK's exact text: "The market is falling. Nobody knows how far." / "You have $10,000, and one button." / "Press the button to sell if you dare. Get back in cheaper and you win. Wait too long and the market leaves without you." Then a "Start" button. The words "play money" do not appear (R49). Games after the first show a short version of the same screen (for example the first line and the button).
- The first game a player ever plays is always a real crash, chosen at random from 1987, 2007 to 2009, 2020 and 2022 (R46). After that the mystery pick follows 7.2. A challenge link still opens its own run.
- Days begin to run when the player presses Start. Once they run, the line under the headline is the normal commentary (8.5).
- Sound and vibration are on by default (SK's decision). Phones block both until the first tap, so they start from the player's first tap anywhere. A small sound switch sits in the footer line of the play screen from the first run.
- Arriving from a challenge link opens that exact run instead (6.7).

### 6.2 The play screen
See mock-ups 1, 2, 3 and 5. Top to bottom:
- Masthead "Don't Press Sell" between a thick rule and a hairline.
- A folio line with the run label ("Mystery crash", "2008" or "Rematch") and "Day 143". The status item appears only for "You are in cash" when out and "Fast forward" in the fast-forward. There is no "Price: your nerve" and no "Time slowed" (R39).
- The headline: the day's news line, large serif, at most three lines. A real headline stays on screen at most 8 seconds; after that the paper prints a plain price-action headline that is true for that day's move, until the next real headline (R36, 8.4).
- One line of commentary under it. It does not change every day (R37, 8.5).
- The chart: the market price, one unbroken line growing left to right, with a dotted line at the start price. "Sold" and "Bought" dots sit on the line, and while the player is in cash a faint flat "sold-at level" marks the latest sale price. Money is never drawn as a line: it is shown only as numbers. No price scale and no dates in mystery runs. The line moves smoothly between days (R42).
- The balance, very large, with "up $340" or "down $3,588" beside it.
- The button.
- One small line under the button.

### 6.3 The button
- While holding it reads "Sell for $6,412": the exact amount the player would walk away with today.
- While in cash it reads "Buy back $N cheaper", "Buy back $N dearer" or "Buy back at the same price" (R38). N = round(cash x (1 - today's close / close on the day of the most recent sale)); a positive result is cheaper. The button turns green and pulses when it is cheaper. This is the one number shown while in cash; there is no "Holding today would have..." line. The figure rolls like a counter, and a tone rises in pitch as it climbs. Buying back locks it in; if the market bounces first it can collapse in a day. This is the most exciting stretch of the game and should feel like it.
- A press acts at once, with no confirmation. It trades at the closing value of the day on screen, which is the amount the button shows.
- Sold and bought moments (R41): the day clock holds for 0.5 seconds on each press, with a short stamp: "Sold at $9,750", or "Bought back $1,120 cheaper" / "Bought back $1,120 dearer". A cheap buy-back reads as a win.
- The player can trade as often as they like. There are no fees and cash earns nothing.

### 6.4 The big days
- On the largest falls and rises the tempo eases down, gradually and never in a jump, to about one day per second; the headline grows, the phone buzzes and, on falls, the whole paper turns full red with cream text (mock-up 2). The folio shows no status for it.
- On a big fall the small line under the button reads "You had $6,411 yesterday".
- On other days while holding, once the balance is at least $500 below its highest point in the run, the small line under the button reads "Selling at the top would have saved you $2,600". The figure is the highest balance so far minus today's balance. It gives a player who holds something to watch and regret, as the live counter does for a player who sold.
- Between big days the paper's colour follows the loss: pink when level or ahead, deepening through salmon as the loss grows.

### 6.5 In cash
- The paper drains to a cool grey (mock-up 3). The chart line stays the market price, unbroken, and a faint flat sold-at level marks where the player sold. There is no dashed line and no player money line.
- The first time a player ever sells, the line under the headline reads "You are out. To win, buy back in for less than you sold." It is shown once per phone (and every time if storage is unavailable).
- There is no regret line under the balance. The only figure that moves is the one on the button (6.3).

### 6.6 The fast-forward and the end of a run
- Once the fall is over (7.3), time speeds up sharply. The folio status reads "Fast forward" and the months and years fly past in 7 to 8 seconds while the line climbs back to the old high. In a mystery run the counter shows "Year 3", never a date.
- The button stays live throughout. A player in cash sees the paper stay grey and the market line climb past the faint sold-at level, and has those few seconds to buy back or stay out. This is the "recovery they missed" moment from the original brief, shown as it happens.
- The run ends on the day the market closes back above its old high.
- **The reveal.** The front page prints with the name of the crash covered by the words "Tap to see what that was", a big moment of its own. On the tap, or after 4 seconds, the name appears and the score counts up dollar by dollar with a rising tone for a win, or down with a low thud for a loss, over about 1.5 seconds. With reduced motion it appears at once.

The front page then reprints about the player (mock-ups 4 and 6):
- Folio: run label, "Late edition", and the reveal: "That was 2008".
- A headline about the player, chosen from the verdict (section 8.3).
- The verdict title in bold with a plain line after it.
- The full chart: the market price line with "Sold" and "Bought" dots and the faint sold-at level. No money line. In a mystery run the real headlines for the days the player traded are shown here: "You sold the day Lehman Brothers failed."
- A three-row table: You, Someone who did nothing, Perfect timing.
- The score: "$2,300 behind someone who did nothing" or "$1,640 ahead of someone who did nothing" (the words "the holder" are never shown to the player), followed by one plain line: "Perfect timing made $23,000. You finished with $15,400." No percentage is shown.
- Near-miss lines where they apply (section 8.2).
- Actions: "Rematch this crash" (main), "Challenge a friend", and a text link "Play a new mystery crash".
- **After a win** the screen shows "Wins in a row" large (6.8) and the "Double or nothing" block (6.8) on the same screen. **After a loss** it shows "Best winning streak: N", hidden if N is 0, and no "Double or nothing".
- **One screen.** The whole result screen, buttons included, fits one 390 x 660 screen with no scrolling (R44). The builder trims spacing, not content, to make it fit; near-miss lines may be limited to the strongest one or two.
- **No countdown.** The next game never starts by itself: there is no auto-start countdown (R44). The next game starts only when the player taps "Rematch", "Play a new mystery crash" or "Double or nothing", and it opens on a Start screen (6.1).
- There is no pot line on the result screen: the pot is hidden (6.12).
- A small row of quiet text links at the foot: "Pick a crash", "Your collection", and the sound and vibration switches. There is no link to the daily crash (6.9).

### 6.7 Rematch and challenge
- **Rematch:** the same crash from the same start day, opening on a Start screen. The chart is the market price line as usual; the player's previous go is not drawn (no dashed line). On the day they sold last time the line under the headline reads "This is the day you sold last time." The score to beat is shown as a number, "Score to beat: $7,150". The crash is no longer a mystery, so real headlines show.
- **Challenge a friend:** produces a link and a card. The link carries the crash, the start day, the challenger's final balance and the days they traded. Whoever opens it plays that exact run, still as a mystery, with "Score to beat: $7,150" showing. At the end the page says who won and shows both scores as numbers. No names are used: the other player is "your challenger".
- Everything needed is inside the link. There is no server.

### 6.8 Double or nothing
- Shown only when the player finishes ahead of the holder, under the heading "Double or nothing", on the result screen itself and never on another page (R44). After a loss it is not shown.
- The stake is spelled out in one line: "Keep your $1,640 win, or take all $15,400 into another mystery game. Finish behind and the run is over."
- The "Double or nothing" button carries the whole balance into a new mystery crash. The holder in that run starts from the same carried amount. Finish ahead again and the choice returns; finish level or behind and the streak ends.
- "Bank $1,640" ends the streak and records it.
- **Wins in a row.** After a win the result screen shows "Wins in a row" as a large number. The rungs stay at 1, 2, 3, 5 and 8 wins, and the title of the highest rung reached sits beside the number: Beginner's luck, Hot hand, Shark, Whale, Untouchable. The five-rung ladder drawing is gone from the result screen, replaced by the large number and the title (R44, R49: "Hot hand" and "Wins in a row" stay). Reaching the eighth prints a special black-bordered front page: "Local investor retires to private island". After a loss the screen shows "Best winning streak: N" instead (6.6).
- The card for a streak says "Survived 3 crashes in a row". The best streak is kept on the phone.

### 6.9 Daily crash (Phase 2, hidden)
- **Phase 2.** The daily crash is not in the launch version (R47). Every link, button and mention of it is hidden in the app and on the result screen; the code stays. The description below is kept for phase 2.
- One run per calendar day, picked from the pool by the date, so everyone gets the same one. It is numbered ("Daily crash 12") from the launch date.
- It is a mystery run with a fixed start day. It can be replayed as a rematch, but only the first result counts as the day's result.
- A "Copy result" button gives a short text result to paste into a chat, in the spirit of a daily word game: the daily number, the verdict, the score, a one-line sketch of the player's balance made of block characters (no emoji), and the link. For example: "Don't Press Sell, daily crash 12. Paper hands. $2,300 behind someone who did nothing." The result never names the crash.
- A plain count of days played in a row appears on the daily result and in the copied text once it reaches two: "4 days in a row". Missing a day starts it again at one. There are no streak lights and no countdown.

### 6.10 Pick a crash, and the collection
- "Pick a crash" lists the launch crashes by name. A picked run shows real headlines with real names from the first day.
- "Your collection" shows which runs the player has finished ("6 of 12 played") and which verdict titles they have earned. It is a quiet list, stored on the phone. False alarms appear in it only after the player has met them.

### 6.11 Which runs count
- Blind runs are mystery runs, the first play of a daily crash (phase 2), and a challenge played from a link. Only blind runs earn verdict titles for the collection, and only mystery runs can start or continue a "double or nothing" streak.
- Rematches and picked crashes are practice: the player already knows what happens. They show a result and a card, but the card names the crash ("Rematch, 2008") and uses the line "I beat the market by $1,640 on my second go at 2008. Beat me." They never trigger "Double or nothing".

### 6.12 The pot (hidden)
- The pot is kept in the code but hidden: it is not shown on the play screen or the result screen (R40). The rules below stay as the code's behaviour for a later version.
- Every player has one pot that follows them from game to game. It starts at $10,000. At launch it is not shown anywhere.
- After each blind run (6.11) the pot changes by the player's score: dollars ahead of the holder are added, dollars behind are taken away. A double-or-nothing run is settled once, when it ends. Practice runs never touch the pot.
- When the pot is shown again, the result will also say how the visit is going: "Up $1,640 tonight" or "Down $2,300 tonight", counted from when the page was opened.
- If the pot reaches zero the player is bust: the front page reads "Local investor loses the lot", the bust is counted, and the pot starts again at $10,000.
- The pot is a running total only. It never changes what anyone starts a game with (7.1), so results, cards, challenges and the daily crash stay comparable between players.
- Stored on the phone. Without storage it lasts for the visit.

### 6.13 Borrowed money
- A harder mode that unlocks after the player's first win in a blind run. A switch on the result screen and in the foot links turns it on: "Play with borrowed money". The folio's run label reads "Borrowed money".
- The player puts in $10,000 and borrows $20,000, so every move in the market is three times bigger for them. One plain line explains it at the start: "You have borrowed $20,000. Every move is three times bigger. Fall a third and you are wiped out."
- While invested, the player's balance is three times their stake's share of the market, minus the loan. If it reaches zero they are wiped out and the run ends at once with the front page "Local investor gets margin called". The pot loses the $10,000.
- Selling repays the loan and leaves the balance in cash. Buying back borrows twice the balance again. There is no interest on the loan.
- The holder in this mode is someone who put in $10,000 without borrowing. The score is the player's final balance minus the holder's.
- It turns the game round: in a false alarm, holding now pays three times over; in a real crash, holding wipes the player out, so getting out in time is what matters. The player still cannot tell which they are in.
- Mystery runs only. It counts towards the pot. It is never used for the daily crash, challenges or double or nothing.

---

## 7. Rules, runs and numbers

### 7.1 Money
- Start: $10,000, fully invested. No currency conversion. No dividends, fees or interest.
- Balance while invested follows the closing value day by day. Balance in cash does not change.
- **The holder:** $10,000 (or the carried amount in a streak) invested on day 1 and never touched.
- **Perfect timing:** the best result possible with one sale and one buy-back in the run: sell at the close that gives the largest fall to a later close, and buy back at that later close.
- **Score:** the player's final balance minus the holder's. Holding throughout scores exactly zero.
- **Share of perfect:** (player minus holder) divided by (perfect timing minus holder). The holder is 0 and perfect timing is 1. It is used only inside the game, to choose the verdict; it is never shown as a percentage. The player sees the two dollar figures instead (6.6).
- **Equal starts.** In every game the player, the holder and perfect timing all start from the same amount: $10,000, or the carried amount in a double-or-nothing run. The size of a player's pot never changes anyone's starting amount (SK's rule).
- All dollar amounts are shown as whole dollars with thousands separators and tabular figures.

### 7.2 The launch pool: twelve runs
Six crashes:
1. 1929 (the Wall Street Crash and the slide to 1932)
2. 1987 (Black Monday)
3. 2000 to 2002 (the dot-com crash)
4. 2007 to 2009 (the financial crisis)
5. 2020 (Covid)
6. 2022 (the inflation and interest-rate fall)

Six false alarms: real episodes where the market fell 10% to 19% from a high and was back above that high within about a year. Candidates to confirm against the data: 1998, 2010, 2011, 2015 to 2016, late 2018, and one more of the builder's choosing. They punish anyone who sells and does not get back in quickly.

In mystery mode and in the daily crash (phase 2), half of all runs are false alarms. This is what makes selling a real bet. At the reveal a false alarm is named plainly: "That was the autumn 2018 wobble. It was back in four months."

### 7.3 The window of each run
- **Start: the first rumblings.** Every run begins on the first day the market closes about 7% below its previous high. Nobody gets to sell at the top, and a crash and a false alarm look the same on day one. Day 1's balance is $10,000 at that day's close.
- **End: full recovery.** Every run ends on the first day the market closes back above that previous high. The holder therefore always finishes about 7% up, and a player who sells and never buys back always finishes behind.
- **Two phases.** The fall is played at readable speed: from day 1 until the market has clearly turned (the builder sets the rule, for example a 20% rise from the lowest close, or two-thirds of the way back for a false alarm). Everything after that is the fast-forward of 6.6.
- Mystery runs of the same episode always start on the same day, because the start is defined by the data. Variety comes from the pool and from not knowing which kind of run it is.

### 7.4 Tempo
- One screen step is one trading day (R35). The base tempo follows the fear: faster as daily swings get larger, slower in calm stretches. Speeds change gradually, with no abrupt jumps between slow days and fast days. Quiet days while the player is in cash run a little quicker.
- The first red, slow-motion moment must arrive within about 10 seconds of the player pressing Start, so nobody sits watching. Because runs start at the first rumblings this is usually natural; where it is not, the opening days run faster.
- Budget: about 120 seconds for a whole game (R35), most of it the fall and 7 to 8 seconds for the fast-forward. SK will judge both on his phone early in the build and may change them.
- Slow-motion days: the 8 to 10 largest daily moves in the fall, counting any day with a major event line. Each is one day, and the pace eases into it and out of it gradually. There is no slow motion during the fast-forward.
- The screen never changes more than about eight times a second, so the amount on the button can always be read and pressed. One step is always one trading day, except in the two longest falls (1929 and 2000 to 2002), where quiet stretches may cover several days; every big day is always shown as its own step. A trade always happens at the close of the day on screen.
- Long falls (1929, 2000 to 2002) may run up to about 60 seconds in total.
- Smoothness (R43): there are no stutters or random pauses. Measure frame times at 4x CPU slowdown before and after any change to timing.
- Reduced-motion setting: no screen jolt, no spinning digits, colour changes cross-fade slowly.

### 7.5 Stored on the phone
Collection, best streak, daily results (phase 2), last run per crash (for the rematch line), sound and vibration choices, the count of daily crashes played in a row, the pot, the number of busts, the highest ladder rung reached, whether borrowed money is unlocked, and the player's own record, shown in the collection in plain words: "9 games, 3 wins, sold too early 4 times". Storage may be missing or blocked: everything must still play without it.

---

## 8. Hooks and words

### 8.1 Why people play again
Each of these is in the build because it tested well or SK asked for it.
- The button shows the live amount: every day is an offer.
- Regret in both directions: the red loss while holding, the market leaving without you while in cash.
- Mystery and reveal: the player does not know which crash, or whether it is a crash at all.
- Near misses at the end.
- Rematch against your own score: chosen by 8 of the 10 testers.
- A score someone else can beat, sent as a link.
- Double or nothing, with "Wins in a row" and its titles always in view after a win.
- The live counter while in cash: a win that grows by the day and can vanish in one.
- One pot that carries every win and loss, and the urge to win it back (hidden at launch, R40).
- For players who hold: a running figure for what selling at the top would have saved.
- A plain count of daily crashes played in a row (phase 2).
- The reveal: a tap, then the score counting up or down.
- The sold and bought moment: a half-second hold and a stamp, and a green pulsing buy-back button when it is cheaper.
- Borrowed money: the chance of losing everything.
- Feel: spinning digits, slow motion, buzz, sound.

### 8.2 Near-miss lines
Worked out from the run, shown only when true:
- "Sold 3 days before the bottom" (sold within 10 trading days of the lowest close)
- "Bought back 2 days after the peak"
- "In cash for the best day of the run"
- "Held through the worst day of the run" (only if the player was invested on that day, R49)
- "62 days in cash"
- "One trade from perfect: perfect timing finished with $17,900"

### 8.3 Verdicts
A slang title, a plain line, and a front-page headline about the player. First match wins, top to bottom.

| Condition | Title | Plain line | Front-page headline |
| --- | --- | --- | --- |
| Wiped out in borrowed-money mode | Margin called | Borrowed three times over and lost the lot | Local investor gets margin called |
| 50% or more of the perfect run | Big Short energy | Out before the fall and back in near the low | Local investor dodges the worst of the crash |
| Finished ahead of the holder | Nerves of steel | Traded, and still came out in front | Local investor beats the market, tells everyone |
| Never sold | Diamond hands | Did nothing at all | Local investor does absolutely nothing, finishes level |
| Sold in a false alarm | Shaken out | Sold a dip that was back in months | Local investor flees a crash that never came |
| Sold within 10 days of the low, bought back higher | Paper hands | Sold near the low, then bought back higher | Local investor sells three days before the bottom |
| Sold and never bought back | Cash gang | Sold, and watched the whole recovery from the sidelines | Local investor still waiting for the right moment |
| Five or more trades | Overtrader | In and out, and behind for it | Local investor trades nine times, loses to a houseplant |
| Anything else behind the holder | Bagholder | Held most of the way down, then blinked | Local investor blinks at the wrong moment |

Numbers inside headlines ("three days", "nine times") come from the run.

### 8.4 News lines
- Written by us. Never copied from a newspaper.
- Each event line is stored with: the date, the plain line with real names ("Lehman Brothers files for bankruptcy"), an anonymised line for mystery runs ("A 158-year-old bank files for bankruptcy"), and a link to an official or primary source. For 2007 to 2009 the St. Louis Fed's financial crisis timeline (305 dated events with source documents) is the starting point. For other crashes: central bank and government announcements, official statistics releases, WHO statements. Wikipedia may be used to find events, never as the source of wording.
- Every date is checked against two sources. An event that happened at a weekend or after the close appears on the next trading day, worded to say so ("Over the weekend, ...").
- Anonymised lines must not give the year away. Avoid any figure a market-history fan could look up: write "the worst day in a generation", never "the worst day in 21 years" (a tester named 2008 from that line alone).
- Anonymised lines use everyday words that someone with no finance background understands: "A big bank stops customers taking their money out", never "freezes three of its funds".
- Volume per major crash: about 30 to 40 event lines, of which the 8 to 10 biggest are the slow-motion headlines. False alarms need about 10 each, with 3 to 5 big ones.
- A real headline stays on screen at most 8 seconds (R36). Once it has been up 8 seconds the paper prints a plain price-action headline for that day, true to the day's move and never repeated in a game, until the next real headline. Each such line is worked out from the prices.

### 8.5 Commentary
- The line under the headline on ordinary days is worked out from the prices, so it cannot be wrong: "Down seven days in a row. This is fine." "Dip bought. Dip kept dipping." "Green day. Do not get used to it." "Down 40% from the peak. Still holding?" "The best day in 75 years. You watched it from the sidelines."
- Plain English that is funny. Light slang is fine; no slurs, no emoji, no exclamation marks.
- Aim for a bank of about 60 templates so repeats are rare. No line repeats within a game.
- Pacing (R37): the line does not change every day. A new line appears only on a slow (big or red) day, on a sale or a buy, or once the current line has been up for at least 4 seconds. Because the prices are known in advance, a line is shown only if it stays true on every day it will be on screen, and it never contradicts the headline above it. No filler lines.
- Truth (R49): wording says "You finished with $N", never "You made".

---

## 9. The look: a front page that bleeds

Approved by SK from the six mock-ups on the canvas page "The blend". The mock-up HTML in `docs/reference/mockups/` is the reference for sizes and spacing. Use the impeccable skill (its craft floor and detector) for every interface pass and the unslop skill to audit the result. The values below already reflect one pass of each.

- **Idea:** the game is a newspaper. The headline is the news, the paper is the mood, and the result is a front page about you.
- **Colour:**
  - Paper, calm: `#f3e2d0`. Ink: `#1c1a17`. Secondary text: `#4a443c`. Red ink: `#a3201a`.
  - Paper, losing: blends from the calm pink towards `#efc3b2` as the loss grows to about 30%. Secondary text on it: `#4a2f28`.
  - Paper, worst days: full red `#b3142a` with all text in cream `#fbeee2` (dark ink on red fails contrast). The button turns cream with `#8f0f22` text.
  - Paper, in cash: cool grey `#ebe4d6`, secondary text `#4a463c`, the faint sold-at level `#6b6558`.
  - Green appears only on the buy-back button when buying back is cheaper (R38), with text that keeps at least 4.5:1 contrast. Everywhere else gains are shown in ink and losses in red ink.
- **Type:** Newsreader for the masthead, headlines, figures and standfirst; Libre Franklin (500 and 700) for labels, the folio line, table rows and buttons. Both are open-licence fonts: self-host them as subsets, with no Google Fonts request. Sentence case everywhere. No italics.
  - Masthead 30px/700. Folio 14px/500. Headline 40 to 44px/700, and 56px/800 on worst days. Standfirst 18px. Balance 72px/700 with tabular lining figures. Button label 24px/700 on play screens, 16px/700 on result screens. Footer 14px. No text on screen is smaller than 14px (R48).
- **Layout:** every tap target is at least 44px high and wide (R48). 24px page margin, every gap on a 4px grid, square corners, rules instead of boxes: a 4px rule above the masthead, hairlines elsewhere. The chart sits between two hairlines with 8px of air. Design for a visible area of about 390 x 660 inside in-app browsers: use `100dvh`, safe-area padding, and keep the button clear of the bottom 40px.
- **Chart:** the market price as one unbroken 2.5px ink line (R42), a dotted start line, a filled dot for today, and "Sold" and "Bought" dots on the line (a red dot and a hollow dot). While in cash, a faint flat line marks the sold-at level. No dashed lines, no player money line, no regret line. No grid, no axis, no price scale. On worst days the line is cream with a darker red fill beneath.
- **Motion:** one easing curve, `cubic-bezier(0.22,1,0.36,1)`. Balance digits roll. The headline changes with a quick press-in on slow-motion days only. The paper colour cross-fades. A short jolt on worst days. Nothing loops.
- **Sound:** on by default from the player's first tap, with a switch on the play screen. A rising tone or quickening tick through the fast-forward. A soft tick per day that speeds up with the tempo, a low thud on worst days, a till ring on a sale. Small files, shipped with the site.
- **Vibration:** a short buzz on worst days and on a trade, where the phone allows it. A switch turns it off.
- **Accessibility:** real buttons; visible focus rings; text contrast at least 4.5:1 in every paper state; colour is never the only signal (the headline size changes too); a pause control; a polite status region announces big days, trades and the result; the chart has a text label that updates.
- **Banned:** boxes or cards around content, glow or shadow behind text, gradients, emoji, uppercase tracked labels, labels perched above headings, casino imagery, green and red traffic-light colouring (the one green button in 9 is the exception), spinners.

## 10. Sharing

- **The result card:** a 4:5 image (1080 x 1350) made in the browser: the result front page (market price line with Sold and Bought dots, no money line), with "Beat me" and the site address at the foot. The shared card hides the crash: where the page says "That was 2008" the card says "Can you guess which crash this was?", and any dated headline is left off. A challenged friend must be able to play blind. A streak card adds "Survived 3 crashes in a row".
- **Share:** the system share sheet with the image and a pre-filled line where the phone supports it. Otherwise the card is shown full screen with "Press and hold to save", next to "Copy link". This fallback matters in the in-app browsers of LinkedIn, X and others, where saving and sharing files often fail.
- **Pre-filled lines:** "I finished $2,300 behind someone who did nothing. Beat me." / "I beat the market by $1,640 in a crash I could not see coming. Beat me."
- **The address:** cards and links use whatever address the site is being served from at that moment, read by the page itself, so nothing is hard-coded. The site launches on its free Cloudflare Pages address, which keeps working if SK adds his own address later.
- **Link preview:** a static 1200 x 627 image of the red front page with a title and description (Open Graph and X card tags).

## 11. Data

- **Source:** S&P 500 daily closing values from Yahoo Finance's free history (symbol `^GSPC`, from late 1927), fetched once by a small script and saved in the project as one small file per run (dates and closes from day 1 to full recovery; the 1929 file runs to 1954 and is still only a few thousand rows). The page makes no live calls.
- **Check:** compare a sample of well-known days against a second free source (for example Stooq) and against the figures quoted in the headlines file before anything ships. A mismatch stops the build.
- **Before 1957** the series is the index's 90-stock predecessor. Nothing on screen names the index, so no claim is made, but the 1929 run should be sanity-checked against published figures for the 1929 to 1932 fall.
- **Headlines file:** one file per run with the fields in 8.4. A test checks that every event date is a trading day in that run's price file.

## 12. How it should be built

- A static site with no backend. A build tool such as Vite is fine. Plain TypeScript or JavaScript; the chart drawn on a canvas or as SVG by hand. No chart library, no game engine, no UI framework needed.
- Keep the game rules (balance, holder, perfect timing, verdicts, near misses, tempo, seeded picks, link encoding) as pure functions with tests written first. These are where a wrong number would be public.
- Seeded randomness everywhere, so a link or a date always reproduces the same run.
- Use the superpowers skills for planning, test-driven development and review; impeccable and unslop for the interface.
- Performance: first paint under 2 seconds on a mid-range phone over 4G; total page weight small enough that this is easy (fonts subset, data files a few kilobytes each). Measure frame times at 4x CPU slowdown (R43).
- Prove the data first (shared rules): before building the game, show SK a real downloaded run (for example 2008) as a plain chart with five famous days and their daily moves, checked against a second source.
- Testing: because there are no outside calls, an early version can be shown to SK as a Claude artifact link on his phone. From the first deploy onwards use Cloudflare Pages preview links.
- Deploy: GitHub plus Cloudflare Pages. SK has a GitHub account; check whether his Cloudflare account was created during the balloon build, and if not, walk him through it click by click.

## 13. Suggested build order

1. Data proof: download, check, and show SK one run as a plain chart.
2. The game rules as tested functions, with all twelve runs' price files. Include a test that plays three lazy strategies across the whole pool (never sell; sell on day 1 and never buy back; sell on day 1 and buy back at the lowest close) and confirms the first always scores zero, the second always loses, and the third always wins.
3. The play screen with auto-run, the button, paper colours, tempo, slow motion and the fast-forward ending, using one crash and one false alarm. Show SK on his phone and settle the length of the fast-forward with him before going further.
4. The end screen, verdicts, near misses and the reveal.
5. Rematch, challenge links, double or nothing, pick a crash, collection and the player's own record. The daily crash is phase 2 and hidden.
6. Headlines and commentary for all twelve runs, with sources, and the date tests.
7. Result card, sharing and the link preview.
8. Sound, vibration, accessibility, reduced motion, polish passes with impeccable and unslop.
9. Deploy, then hand back to SK: the live link, three phone-sized screenshots, a plan for a 10 to 20 second screen recording, and three hook ideas for the post.
10. After launch: further crashes in weekly batches.

## 14. Left to the builder

- The exact tempo curve, within 7.4, and how days are sampled during the fast-forward.
- The thresholds for paper colour steps and for which days count as "worst days".
- The link format for challenges.
- Which six false alarms make the launch pool, and the exact rule for when the fall ends and the fast-forward begins.
- Wording of commentary templates and any strings not fixed here, in the same voice.
- The sound design, within section 9.

## 15. Decisions

Made by SK
- Days run by themselves (pace B).
- Real S&P 500 data; on screen it is "the US stock market"; dollars.
- US only.
- All in or all out for this version.
- Mystery crash is the main mode, with named crashes as picks.
- Voice B: slang titles, plain lines.
- The blended front-page look.
- No "the holder was back to $10,000 by..." line at the reveal.
- The credit-every-source rule is set aside for this build.
- Sharing must work across platforms, not only LinkedIn.
- Sound on by default.
- Runs start at the first rumblings, and the result is also scored against perfect timing (both SK's ideas).
- Every run plays to full recovery with a fast-forward ending, approved on the basis that he tests it early and it can be shortened.
- After the blind test: a plain opening line that says the money is play money; a coaching line on the first sale; "Double or nothing" as the name; dollar figures in place of a percentage; the first red moment within about 10 seconds; everyday words in mystery headlines; the shared card hides the crash; a short text result for the daily crash; the player's own record kept on the phone.
- No "check the facts" page of dates and sources in the app. The sources still live in the headlines file for our own checking.
- A leaderboard is the first update after launch, on a free database only (section 16).
- After the casino-design review: the live counter while in cash; one pot that follows the player; a game of about 45 seconds with the next one starting by itself; the tap-to-reveal ending with a counting score; the double-or-nothing ladder; and borrowed-money mode in this build.
- The player, the holder and perfect timing always start a game with the same amount, whatever the size of the pot.
- After the second persona test: "Tap to stop" beside the countdown; the ladder labelled "Wins in a row"; the score worded against "someone who did nothing"; a regret line for players who hold; a plain count of daily crashes played in a row.

Made by Claude during planning (SK can overrule)
- Masthead reads "Don't Press Sell"; "Daily crash" is the name of the daily mode.
- Launch with twelve runs (six crashes, six false alarms) and add the rest weekly. Half of mystery and daily runs are false alarms.
- The daily crash stays but with no streak lights or countdown, because 7 of 10 testers disliked them.
- Perfect timing means the best single sale and buy-back.
- A "double or nothing" streak ends when the player finishes level with or behind the holder.
- Challenge links use no names.
- No green: gains in ink, losses in red.
- Only blind runs earn titles and streaks; rematches and picked crashes are practice (6.11).
- At most eight screen steps a second; quiet stretches may skip days; long crashes may run to 60 seconds.
- Cards and links use the address the site is served from.
- The pot changes by dollars ahead of or behind the holder, in blind runs only; reaching zero is a bust and it restarts at $10,000.
- The countdown to the next game is 10 seconds and any touch stops it.
- Ladder rungs at 1, 2, 3, 5 and 8 wins, with the titles in 6.8.
- Borrowed money is three times, with a fixed loan, no interest, and a holder who did not borrow.

Round 2 (after the 20-person video panel and SK's review): rulings R35-R50 in docs/progress.md.

## 16. Later

**Phase 2: the daily crash, then a daily-crash leaderboard.** The daily crash (6.9) is hidden at launch (R47). When it returns, the first update after it is a leaderboard. Nickname only, no accounts, no personal data. Firebase's free plan, which stops at its limit instead of charging; nothing that can ever bill SK. It ranks the first play of each day's daily crash by dollars ahead of the holder. Build the launch version so this slots in: the daily result is already a small, fixed record (day number, final balance, trade days). Walk SK through creating the Firebase project click by click when the time comes.

Also later: partial selling; a UK mode; more crashes; a "second chance" token that undoes one sale; a "panic meter".
