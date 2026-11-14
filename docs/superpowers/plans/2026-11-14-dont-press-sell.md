# Don't Press Sell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy "Don't Press Sell", a one-button, one-minute phone web game in which the player holds or sells $10,000 of play money through a real historical market fall, then shares a newspaper front page about how they did.

**Architecture:** A static site with no backend. Game rules are pure, tested TypeScript functions; a schedule turns each run's daily prices into timed screen steps; a small DOM and canvas layer draws the front page; all state lives in the browser or inside share links. Price and headline data are prepared once by scripts and shipped as files.

**Tech Stack:** Node 20+, Vite, TypeScript (strict), Vitest, Playwright (phone-size checks), `tsx` for scripts. No runtime dependencies, no UI framework, no chart library. Web Audio for sound. GitHub plus Cloudflare Pages. Cloudflare Web Analytics.

**Spec:** `docs/superpowers/specs/2026-11-14-dont-press-sell-design.md` (the design document; a copy of the Project doc `dont-press-sell/design.md`). Section numbers below (for example "spec 7.3") refer to it. Read it in full before Task 1. Also read `docs/reference/00_shared_rules.md` and `docs/reference/03_dont_press_sell.md`, and open the six mock-ups in `docs/reference/mockups/`.

**The owner:** SK is not technical. Whenever he must do something himself, give click-by-click steps in plain British English and wait. He checks progress on his phone at the four checkpoints marked **SK checkpoint**.

## Global Constraints

- The strings "S&P" and "S&P 500" never appear in the built site. `grep -ri "S&P" dist/` must print nothing.
- Currency is US dollars, whole dollars, thousands separators, tabular figures: `$10,340`.
- British spelling in every on-screen string. Sentence case. No emoji, no exclamation marks, no italics.
- No network request at runtime except the Cloudflare Web Analytics beacon. No Google Fonts request: Newsreader and Libre Franklin (500, 700) are self-hosted subsets in `public/fonts/`.
- Colours, type sizes, layout and banned patterns are exactly those in spec section 9.
- Footer text: `US stock market · Not financial advice` on play screens, `US stock market · A Still Signal build` on result screens.
- Fixed copy, verbatim: opening line `You have $10,000 of play money in the stock market. Hold your nerve or bail.`; first-sale line `You are out. To win, buy back in for less than you sold.`; button labels `Sell for $N`, `Buy back now: $N ahead` and `Buy back now: $N behind`; `Tap to see what that was`; `Next mystery crash in N. Tap to stop.`; `Wins in a row`; `Selling at the top would have saved you $N`; `N days in a row`; `$N behind someone who did nothing` and `$N ahead of someone who did nothing`; `Your pot: $N`; `Play with borrowed money`; `You have borrowed $20,000. Every move is three times bigger. Fall a third and you are wiped out.`; `Double or nothing`; `Bank $N`; `Rematch this crash`; `Challenge a friend`; `Play a new mystery crash`; `Can you guess which crash this was?`; `Perfect timing made $N. You made $N.`
- Text contrast at least 4.5:1 in every paper state. Touch targets at least 44px. The main button stays clear of the bottom 40px of a 390 x 660 viewport.
- Budgets: first paint under 2 s on a mid-range phone over 4G; JavaScript under 60 KB gzipped; first load under 300 KB including fonts.
- Everything must work with `localStorage` missing or throwing.
- Every commit leaves `npm test` and `npm run build` passing.
- **Addition to the spec (sombre days):** some headlines report deaths, attacks or disasters (for example September 2001, and the pandemic in 2020). Those rows are marked `sombre`. On a sombre day and the step after it the commentary line is neutral: no jokes and no slang. The headline itself is plain and respectful.
- `docs/progress.md` is updated at the end of every task (done, next, open flags) so a new session can pick the work up.

## Review Focus

1. **Storage blocked** (private mode, in-app browsers): the game plays normally, the first-sale line shows on every first sale, nothing throws. Test in Task 8.
2. **A broken or tampered challenge link:** the page opens a fresh mystery run with no error text. Test in Task 9.
3. **Fast or mistimed presses** (double taps, a tap as the step changes, a tap on the last frame): at most one trade per screen step, always at the close shown on the button, and the final result stays consistent. Test in Task 4.
4. **The tab goes to the background mid-run** (phone locks, app switch): the run pauses and resumes from the same step; time does not jump and sound stops. Test in Task 4.
5. **Share, vibration or audio unavailable or refused:** the fallback appears and there is no unhandled promise rejection. Tests in Tasks 11 and 12.

## File Structure

```
index.html
src/main.ts                 boot and mode routing
src/engine/types.ts         RunData, Headline, Trade, RunResult, VerdictId
src/engine/simulate.ts      balance, holder, lead, share of perfect
src/engine/perfect.ts       best single sale and buy-back
src/engine/verdict.ts       verdict choice and its three strings
src/engine/nearmiss.ts      near-miss lines
src/game/rng.ts             seeded random numbers and string hashing
src/game/schedule.ts        prices and headlines -> timed screen steps
src/game/session.ts         the running game: steps, trades, pause
src/game/picker.ts          mystery pick and daily pick
src/game/streak.ts          double or nothing and its ladder
src/game/pot.ts             the pot that follows the player
src/engine/borrowed.ts      borrowed-money rules
src/content/runs.ts         manifest of the 12 runs (generated)
src/content/commentary.ts   price-driven commentary templates
src/content/copy.ts         every fixed string
src/ui/paper.ts             paper state -> colours
src/ui/chart.ts             canvas chart
src/ui/screen.ts            play screen
src/ui/endscreen.ts         result front page
src/ui/menus.ts             pick a crash, collection, record
src/ui/a11y.ts              live region, pause control
src/fx/sound.ts             Web Audio sounds
src/fx/haptics.ts           vibration
src/share/link.ts           challenge link encode and decode
src/share/card.ts           1080 x 1350 result card on a canvas
src/share/share.ts          share sheet and fallbacks
src/share/dailytext.ts      pasteable daily result
src/store/store.ts          safe storage wrapper
src/store/record.ts         collection, record, last runs, settings
data/raw/gspc-daily.csv     full daily history, committed once
data/runs/<id>.prices.json  one per run
data/runs/<id>.headlines.csv one per run, the human-readable source of truth
scripts/fetch-prices.ts     one-off download
scripts/build-runs.ts       cut windows, write prices and manifest
scripts/check-prices.ts     second-source comparison
scripts/check-headlines.ts  headline rules
scripts/data-proof.ts       plain chart page for SK
tests/                      mirrors src/
e2e/                        Playwright phone-size checks
```

## Running order: what runs in parallel

The fifteen tasks are numbered for reference, not for order. Run them in the waves below. Inside a wave, dispatch every lane at the same moment, each to its own subagent in its own git worktree (superpowers:dispatching-parallel-agents and superpowers:using-git-worktrees). Lanes in one wave own different files, so they cannot collide. Only the lead agent edits `src/main.ts`, `index.html` and `src/content/copy.ts`, and it does so when it merges a wave. Each lane still gets its own fresh reviewer before it is merged.

Never sit waiting for SK. A checkpoint blocks only the thing it names; every other lane carries on.

**Wave 0, alone:** Task 1. It creates `src/engine/types.ts` with the shared types below, so every lane agrees on names from the start.

**Wave 1, seven lanes at once (none needs real prices):**
- Lane A: Task 2 steps 1 to 4 (prices), then its five checks in parallel (step 5).
- Lane B: Task 3 steps 1 to 3 (the rule book, on synthetic prices) and Task 15 steps 1 and 2 (borrowed-money rules).
- Lane C: Task 6 steps 1 to 3 and the `nearMisses` function (verdict logic only).
- Lane D: Task 7 steps 1 to 3 (commentary logic and its two reviewers).
- Lane E: Task 9 steps 1 and 2 (link code) and Task 8 steps 1 to 3 (store, picker, record, streak logic).
- Lane F: Task 12 steps 1 and 2 (sound, vibration) and Task 11 steps 1 and 2 (daily text, share fallback).
- Lane G: `src/game/rng.ts`, Task 5 step 1 (`paperFor`) and Task 10 steps 1 and 2 (the headline checker, on fixtures).

**Wave 2, starts the moment Lane A's price files are merged:**
- Lane H: Task 10 steps 3 to 6 (headlines). Twelve run pipelines at once, one per run. This is the longest job and it keeps running beside Waves 2 and 3.
- Lane I: Task 4 (clock and running game), then Task 3 steps 4 and 5 (lazy test and strategy bots).
- SK checkpoint 1 is sent. Nothing waits for his reply.

**Wave 3, starts when Lane I is merged; four lanes at once:**
- Lane J: Task 5 steps 2 to 6 (play screen). SK checkpoint 2 follows; it blocks only the fast-forward length constant.
- Lane K: Task 6 steps 4 and 5 (end screen), built against one fixed sample result.
- Lane L: Task 11 step 3 (result card), built against the same sample.
- Lane M: Task 8 menus (pick a crash, collection, record screens).

**Wave 4, integration by the lead agent, in this order because each touches `src/main.ts`:** Task 8 steps 4 and 5; Task 15 steps 3 and 4; Task 9 steps 3 and 4; Task 7 step 4; Task 10 step 5; Task 11 steps 4 and 5; Task 12 steps 3 and 4.

**Wave 5:** Task 13, with its reviewers dispatched in parallel, then Task 14. (Task 15, borrowed money, is numbered last but is built in Waves 1 and 4 as shown above.)

Shared types (Task 1 creates them in `src/engine/types.ts`; every task uses these exact names):

```ts
type RunKind = 'crash' | 'scare';
interface RunData { id: string; kind: RunKind; pickName: string; revealLine: string;
  dates: string[]; closes: number[]; lowIndex: number; fallEndIndex: number; }
interface Headline { dayIndex: number; real: string; anon: string; big: boolean; sombre: boolean; }
interface Trade { dayIndex: number; side: 'sell' | 'buy'; }
interface RunResult { final: number; holderFinal: number; perfectFinal: number;
  lead: number; share: number; balances: number[]; daysInCash: number; trades: Trade[]; }
type VerdictId = 'marginCalled' | 'bigShort' | 'nerves' | 'diamond' | 'shakenOut' | 'paper' | 'cashGang' | 'overtrader' | 'bagholder';
```

---

### Task 1: Project, pipeline and reference files

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`, `tests/smoke.test.ts`, `docs/reference/*`, `docs/superpowers/specs/2026-11-14-dont-press-sell-design.md`, `docs/superpowers/plans/2026-11-14-dont-press-sell.md`, `README.md`.

**Interfaces:** Produces `npm test`, `npm run build`, `npm run dev`, `npm run e2e`.

- [ ] **Step 1:** Ask SK, click by click, to create a new public GitHub repository named `dont-press-sell`, and confirm his Cloudflare account from the balloon build still signs in. Wait for both.
- [ ] **Step 2:** Scaffold Vite with TypeScript strict and Vitest. `index.html` shows only the masthead "Don't Press Sell" on paper `#f3e2d0` in the self-hosted Newsreader.
- [ ] **Step 3:** Write `tests/smoke.test.ts`: `expect(1 + 1).toBe(2)`. Run `npm test`; expect 1 passed.
- [ ] **Step 4:** Copy the design document, this plan, the two reference briefs and the six mock-up HTML files into `docs/`. Create `src/engine/types.ts` with the shared types exactly as written above, and `docs/progress.md`.
- [ ] **Step 5:** Commit and push. Walk SK through connecting the repository to Cloudflare Pages (build command `npm run build`, output `dist`) and switching on Web Analytics for the Pages project. Check the current Cloudflare screens before writing his steps.
- [ ] **Step 6:** Verify: the preview address shows the masthead on a phone; `grep -ri "S&P" dist/` prints nothing.

### Task 2: Price data and the data proof

**Files:** Create `scripts/fetch-prices.ts`, `scripts/build-runs.ts`, `scripts/check-prices.ts`, `scripts/data-proof.ts`, `scripts/lib/episode.ts`, `tests/scripts/episode.test.ts`, `data/raw/gspc-daily.csv`, `data/runs/*.prices.json`, `src/content/runs.ts`.

**Interfaces:** Produces `findEpisode(dates: string[], closes: number[], highDate: string): { startIndex: number; lowIndex: number; fallEndIndex: number; endIndex: number }` and the `RunData` files.

- [ ] **Step 1: Failing test** for `findEpisode` on a synthetic series `[100, 96, 92.9, 80, 60, 72, 90, 100.5]` with the high at index 0: expect `startIndex 2` (first close at or below 93), `lowIndex 4`, `fallEndIndex 5` (first close at or above low x 1.20), `endIndex 7` (first close above 100).
- [ ] **Step 2:** Implement `findEpisode`. Rules from spec 7.3: start = first close at least 7% below the high; end = first later close above the high; fall end for a crash = first close at least 20% above the lowest close; for a scare = first close at or above `low + (high - low) * 2 / 3`.
- [ ] **Step 3:** `fetch-prices.ts` downloads the full daily close history for `^GSPC` from Yahoo Finance's free history and writes `data/raw/gspc-daily.csv` (`date,close`). Check how the download works today before coding it; if it is blocked, stop and tell SK rather than switching source.
- [ ] **Step 4:** `build-runs.ts` holds the table of twelve runs (id, kind, pick name, reveal line, the date of the high) and writes one `prices.json` per run plus the manifest. Crashes: 1929, 1987, 2000, 2007, 2020, 2022. Scares: confirm each candidate in spec 7.2 falls 10% to 19% and regains its high within about a year; choose the sixth.
- [ ] **Step 5: Five independent checks, dispatched in parallel.** Each goes to a separate subagent that has not seen the others' work. All five must pass before the price files are merged.
  - **Second source.** `check-prices.ts` compares at least 20 well-known dates against a second free source and fails on any difference above 0.05%. Expect "20 of 20 match".
  - **Integrity.** Scan the raw file for duplicate dates, dates out of order, weekend dates, gaps longer than five calendar days, and any daily move above 25%. Count trading days per year and explain every year outside 245 to 260 (for example Saturday trading in early decades). Report each oddity with its date.
  - **Independent recount.** Without reading `scripts/lib/episode.ts`, write separate code that finds each run's high, start day, lowest day and recovery day from the raw file. Its twelve answers must equal `build-runs.ts`'s output exactly.
  - **Published figures.** For each of the six crashes, compare the peak date, the low date and the peak-to-low fall with figures from named published sources. For at least 30 famous single days across the runs, compare the daily move with a published figure. Take every comparison value from a source found now, never from memory. Explain or fix any difference above 0.1 percentage points.
  - **Look-alike test.** Draw the first ten seconds of each run as an unlabelled chart. A subagent sorts the twelve into crashes and scares. If it gets more than 9 right, the openings give the game away: report to SK with options before going on.
- [ ] **Step 6:** `data-proof.ts` writes a single plain HTML page: the 2007 run as a line chart with five famous days labelled with their daily moves.
- [ ] **Step 7:** Commit. **SK checkpoint 1:** send him the data-proof page and the list of twelve runs with each one's fall and recovery time, in plain words.

### Task 3: The rule book

**Files:** Create `src/engine/simulate.ts`, `src/engine/perfect.ts`, `tests/engine/simulate.test.ts`, `tests/engine/perfect.test.ts`, `tests/engine/lazy.test.ts`.

**Interfaces:** Produces
`simulate(closes: number[], trades: Trade[], start?: number): RunResult` (start defaults to 10000) and
`perfectTiming(closes: number[], start?: number): { final: number; sellIndex: number; buyIndex: number }`, and
`leadAt(closes: number[], trades: Trade[], dayIndex: number, start?: number): number` (the player's balance minus the holder's at that day's close).

- [ ] **Step 1: Failing tests** with `closes = [100, 90, 80, 100, 107.5]`:

```ts
expect(simulate(closes, []).final).toBeCloseTo(10750);
expect(simulate(closes, []).lead).toBe(0);
expect(simulate(closes, [{ dayIndex: 1, side: 'sell' }]).final).toBeCloseTo(9000);
const r = simulate(closes, [{ dayIndex: 1, side: 'sell' }, { dayIndex: 2, side: 'buy' }]);
expect(r.final).toBeCloseTo(12093.75);
expect(r.share).toBeCloseTo(0.5);
expect(r.daysInCash).toBe(1);
expect(perfectTiming(closes)).toEqual({ final: 13437.5, sellIndex: 0, buyIndex: 2 });
// live counter: sold at index 1 for 9000; at index 2 the holder's shares are worth 8000
expect(leadAt(closes, [{ dayIndex: 1, side: 'sell' }], 2)).toBeCloseTo(1000);
expect(leadAt(closes, [{ dayIndex: 1, side: 'sell' }], 3)).toBeCloseTo(-1000);
```

Also: a second sell while in cash, or a buy while invested, is ignored; trades are applied in day order.
- [ ] **Step 2:** Run; expect failures for missing functions.
- [ ] **Step 3:** Implement both. `perfectTiming` is one pass: track the highest close so far and the best ratio of that to the current close; `final = start * last / first * bestRatio`. When `perfectFinal` equals `holderFinal`, `share` is 0.
- [ ] **Step 4: Lazy-strategy test** over all twelve real runs (spec section 13): never selling gives `lead === 0`; selling on day 1 and never buying back gives `lead < 0`; selling on day 1 and buying at `lowIndex` gives `lead > 0`.
- [ ] **Step 5: Strategy bots** (`tests/engine/bots.test.ts`, run in Wave 2 once the schedule exists). Play these simple strategies over all twelve runs through the real schedule: never sell; sell at the first slow step and never return; sell at the first slow step and buy back at the next slow rising day; sell when 15% down and buy back 30% below the sale; press at random (1,000 seeded games). Print a table of wins per strategy. Fail if any strategy other than a lucky random game wins more than 8 of 12: that would be a strategy a player can learn in an evening.
- [ ] **Step 6:** Run all; expect pass. Commit.

### Task 4: The clock and the running game

**Files:** Create `src/game/rng.ts`, `src/game/schedule.ts`, `src/game/session.ts`, tests for each.

**Interfaces:** Produces
`mulberry32(seed: number): () => number`, `hashString(s: string): number`;
`interface Step { dayIndex: number; holdMs: number; phase: 'fall' | 'forward'; slow: boolean }`;
`buildSchedule(run: RunData, headlines: Headline[]): Step[]`;
`createSession(run: RunData, steps: Step[], opts: { start: number; onStep(s: SessionView): void; onEnd(r: RunResult): void }): { press(): void; pause(): void; resume(): void; view(): SessionView }`;
`interface SessionView { stepIndex: number; dayIndex: number; balance: number; invested: boolean; marketBalance: number; peakBalance: number; leadNow: number; phase: 'fall' | 'forward'; slow: boolean }`.

- [ ] **Step 1: Failing schedule tests**, run against every real run: `dayIndex` strictly increases and the last step is the last day; no `holdMs` under 125; every slow step is 800 ms and belongs to the fall; slow steps are the days with a `big` headline plus the largest daily moves up to 10 in total; the first slow step begins within 10,000 ms; the forward phase totals 7,000 to 8,000 ms; the whole run totals 40,000 to 60,000 ms, and within 43,000 to 48,000 ms for every run except 1929 and 2000.
- [ ] **Step 2:** Implement `buildSchedule`: hold times in the fall shrink as the recent daily swing grows; quiet stretches merge several days into one step to respect the 125 ms floor and the time budget; the forward phase samples days evenly to fit its budget. Keep the fall budget and the forward budget as two named constants (SK may change both after checkpoint 2).
- [ ] **Step 3: Failing session tests** with fake timers: two presses inside one step make one trade; a press records the step's `dayIndex`; `pause()` then 60 s then `resume()` continues from the same step; a press on the final step is honoured and `onEnd` fires once with a result equal to `simulate(closes, trades)`.
- [ ] **Step 4:** Implement `createSession`. Bind `pause` and `resume` to `visibilitychange`.
- [ ] **Step 5:** Run all; expect pass. Commit.

### Task 5: The play screen

**Files:** Create `src/content/copy.ts`, `src/ui/paper.ts`, `src/ui/chart.ts`, `src/ui/screen.ts`, `tests/ui/paper.test.ts`, `e2e/play.spec.ts`; modify `src/main.ts`, `index.html`.

**Interfaces:** Produces
`paperFor(s: { lossFrac: number; inCash: boolean; worstDay: boolean }): { bg: string; ink: string; secondary: string; accent: string; buttonBg: string; buttonInk: string }`;
`mountScreen(root: HTMLElement): { render(v: ScreenModel): void }`;
`interface ScreenModel { runLabel: string; dayLabel: string; status: string; headline: string; standfirst: string; big: boolean; balance: number; delta: number; buttonLabel: string; underButton: string; regret: string | null; paper: ReturnType<typeof paperFor>; chart: ChartModel }`.

- [ ] **Step 1: Failing paper tests** with the spec's exact values: level and invested gives bg `#f3e2d0`, ink `#1c1a17`; `lossFrac 0.3` gives bg `#efc3b2`, secondary `#4a2f28`; `worstDay` gives bg `#b3142a`, ink `#fbeee2`, buttonBg `#fbeee2`, buttonInk `#8f0f22`; `inCash` gives bg `#ebe4d6`, secondary `#4a463c`. Between 0 and 0.3 the background interpolates.
- [ ] **Step 2:** Implement `paperFor`, then the screen and chart from mock-ups 1, 2, 3 and 5 and spec 6.2 to 6.6. Use temporary placeholder headlines ("Headline for day N") and one fixed standfirst; real words arrive in Tasks 7 and 10. Wire one crash and one scare, chosen by a `?run=` parameter for testing.
- [ ] **Step 3:** Include: the opening line for the first few steps; the first-sale line; "You had $N yesterday" under the button on worst days; the regret line while in cash; the "Fast forward" status and "Year N" counter; rolling balance digits; a pause control; on other days while holding, "Selling at the top would have saved you $N" under the button once `peakBalance - balance` is 500 or more (spec 6.4); the live counter on the button while in cash, taken from `leadNow`, with digits that roll (its rising tone arrives with Task 12).
- [ ] **Step 4: Playwright checks** at 390 x 844 and 390 x 660: the button text matches `/^Sell for \$[\d,]+$/`; no horizontal scroll; the button's bottom edge is at least 40px above the viewport bottom; after one tap the button matches `/^Buy back now: \$[\d,]+ (ahead|behind)$/` and the first-sale line is visible; screenshots saved to `e2e/shots/`.
- [ ] **Step 5:** Read `anthropic-skills:impeccable` (its craft floor) before the first UI edit and run its detector on the built page; fix every finding.
- [ ] **Step 6:** Commit and deploy a preview. **SK checkpoint 2:** he plays one crash and one scare on his phone. Ask him only: does the ending feel too long, too short or right? Set the forward budget from his answer.

### Task 6: Verdicts, near misses and the end screen

**Files:** Create `src/engine/verdict.ts`, `src/engine/nearmiss.ts`, `src/ui/endscreen.ts`, tests for both engine files, `e2e/end.spec.ts`.

**Interfaces:** Produces
`verdictFor(result: RunResult, run: RunData): VerdictId`;
`verdictCopy(id: VerdictId, result: RunResult, run: RunData): { title: string; line: string; headline: string }`;
`nearMisses(result: RunResult, run: RunData): string[]`;
`mountEndScreen(root, model): void`.

- [ ] **Step 1: Failing table test**, one small fixture per row of spec 8.3 in its order: `share >= 0.5` gives `bigShort`; `lead > 0` gives `nerves`; no trades gives `diamond`; a sale in a scare with `lead <= 0` gives `shakenOut`; a sale within 10 trading days of `lowIndex` followed by a buy at a higher close gives `paper`; a sale with no later buy gives `cashGang`; five or more trades gives `overtrader`; otherwise `bagholder`.
- [ ] **Step 2:** Implement, with the titles, lines and headlines exactly as in spec 8.3. Numbers inside headlines come from the run and are spelled as words up to twelve.
- [ ] **Step 3: Failing near-miss tests** for each line in spec 8.2, each asserting the line appears only when true.
- [ ] **Step 4:** Implement `nearMisses`, then the end screen from mock-ups 4 and 6 and spec 6.6: folio with the reveal, headline, verdict, full chart with "Sold" and "Bought" marks, the three-row table, the lead line ("$N behind someone who did nothing" or "$N ahead of someone who did nothing"; never the words "the holder"), "Perfect timing made $N. You made $N.", near misses, the three actions and the quiet foot links. Add the reveal of spec 6.6: the crash name is covered by "Tap to see what that was" until a tap or 4 seconds, then the lead counts up or down over about 1.5 seconds (instantly with reduced motion).
- [ ] **Step 5:** Playwright: finishing a run with no taps shows "Local investor does absolutely nothing, finishes level"; the crash name is hidden before the tap and shown after it, and shown without a tap after 4 seconds. Commit.

### Task 7: Commentary

**Files:** Create `src/content/commentary.ts`, `tests/content/commentary.test.ts`.

**Interfaces:** Produces `commentaryFor(ctx: { closes: number[]; dayIndex: number; invested: boolean; balance: number; start: number; sombre: boolean; rng: () => number }): string`.

- [ ] **Step 1: Failing tests:** seven falling closes in a row yields a line containing "seven days in a row"; a fall of 40% or more from day 1 can yield "Down 40% from the peak. Still holding?"; while not invested on the best day so far the line mentions the sidelines; no line contains a digit-year, an emoji or an exclamation mark; over 500 random contexts no two consecutive days repeat a line; with `sombre: true` in the context every line comes from the neutral set (a fixed list of about eight plain lines such as "Markets fall again.").
- [ ] **Step 2:** Implement about 60 templates in the voice of spec 8.5, each guarded by a condition computed from the prices, so no line can be false.
- [ ] **Step 3:** Two reviewers in parallel on the template list: a copy editor (`design:ux-copy`: voice, plain words, British spelling, nothing that reads as advice) and a truth checker who tries to find a price series that makes any template false. Fix what they find.
- [ ] **Step 4:** Wire into the play screen in place of the fixed standfirst. Run all; commit.

### Task 8: Modes, memory and double or nothing

**Files:** Create `src/store/store.ts`, `src/store/record.ts`, `src/game/picker.ts`, `src/game/streak.ts`, `src/ui/menus.ts`, tests for each; modify `src/main.ts`, `src/ui/endscreen.ts`.

**Interfaces:** Produces
`load<T>(key: string, fallback: T): T`, `save(key: string, value: unknown): boolean`;
`pickMystery(rng: () => number, recent: string[]): string`;
`dailyPick(utcDate: string): { number: number; runId: string }` with launch date as a named constant;
`recordRun(mode: Mode, runId: string, result: RunResult, verdict: VerdictId): void`, `getRecord(): { games: number; wins: number; soldTooEarly: number; played: string[]; titles: VerdictId[]; bestStreak: number }`;
`type Mode = 'mystery' | 'daily' | 'picked' | 'rematch' | 'challenge'`;
`applyToPot(mode: Mode, lead: number): { pot: number; tonight: number; bust: boolean }` and `getPot(): { pot: number; tonight: number; busts: number }` in `src/game/pot.ts`;
`ladder(wins: number): { rungs: number[]; reached: number; next: number | null; title: string | null }`;
`dailyStreak(utcDate: string): number` in `src/store/record.ts` (records a daily crash played on that date and returns the count of days in a row).

- [ ] **Step 1: Failing tests.** Store: with `localStorage` replaced by an object whose methods throw, `load` returns the fallback and `save` returns false without throwing. Picker: over 10,000 seeded picks, scares are 48% to 52%, and no run is picked three times running. Daily: the same UTC date always gives the same run; any twelve consecutive days cover all twelve runs; the number is 1 on the launch date. Record: only `mystery`, a first `daily` and `challenge` add titles; `rematch` and `picked` do not.
- [ ] **Step 2:** Implement store, picker and record.
- [ ] **Step 3: Failing pot tests** per spec 6.12: a new player's pot is 10000; a `mystery` run with `lead 1640` makes it 11640 and `tonight` 1640; a `rematch` or `picked` run leaves it unchanged; a lead that takes it to zero or below returns `bust: true`, adds one to `busts` and resets the pot to 10000; with storage blocked the pot still accumulates for the visit. **Failing ladder tests:** rungs are `[1, 2, 3, 5, 8]`; `ladder(0)` has `next 1` and no title; `ladder(3)` has `reached 3`, `next 5`, title `Shark`; `ladder(8)` has `next null`, title `Untouchable`. **Failing daily-count tests** per spec 6.9: `dailyStreak` on three consecutive UTC dates returns 1, 2, 3; a second call on the same date returns the same number; after a missed day it returns 1; the line "N days in a row" is shown only from 2. **Failing streak tests** per spec 6.8: offered only when `lead > 0` in a `mystery` run; "Double or nothing" starts the next mystery run with `start` equal to the previous `final`; `lead <= 0` ends the streak; "Bank" ends it and records `bestStreak`.
- [ ] **Step 4:** Implement the daily crash (spec 6.9: a blind run labelled "Daily crash N"; replays are rematches and only the first result is stored as the day's result; the "N days in a row" count on the result and in the copied text from two days; no streak lights, no countdown), the streak, the rematch (previous run's `balances` drawn as the dashed line, "This is the day you sold last time.", "Score to beat: $N", real headlines), pick a crash, the collection and the record line ("9 games, 3 wins, sold too early 4 times"), the pot line on the play footer and the result ("Your pot: $12,300. Down $2,300 tonight."), the bust front page, the ladder inside the "Double or nothing" block under the label "Wins in a row", and the countdown to the next game ("Next mystery crash in 10. Tap to stop.", mystery runs only, stopped by any touch).
- [ ] **Step 5:** Playwright with storage disabled: a full run completes, the first-sale line shows, no console errors. Run all; commit.

### Task 9: Challenge links

**Files:** Create `src/share/link.ts`, `tests/share/link.test.ts`; modify `src/main.ts`, `src/ui/endscreen.ts`.

**Interfaces:** Produces
`encodeChallenge(c: { runId: string; final: number; trades: Trade[] }): string` (the text after `#c=`);
`decodeChallenge(s: string): { runId: string; final: number; trades: Trade[] } | null`.

- [ ] **Step 1: Failing tests:** a round trip returns the same object; six trades encode to 60 characters or fewer; `decodeChallenge('')`, `'garbage'`, a truncated code, an unknown run and a code with out-of-range days all return `null`.
- [ ] **Step 2:** Implement: a version byte, the run's index, the final balance and the trade days packed into bytes, then base64url. Only letters, digits, `-` and `_`.
- [ ] **Step 3:** Wire up: opening `#c=<code>` starts that run blind with "Score to beat: $N"; the end screen draws both lines and names the winner, calling the other player "your challenger"; a `null` decode silently starts a normal mystery run.
- [ ] **Step 4:** Playwright: open a valid link and a broken link; assert the first shows "Score to beat" and the second shows the normal opening line with no error. Commit.

### Task 10: Headlines for all twelve runs

**Files:** Create `data/runs/<id>.headlines.csv` (twelve), `scripts/check-headlines.ts`, `tests/scripts/check-headlines.test.ts`, `docs/review/headlines-for-sk.md`; modify `scripts/build-runs.ts` to emit `Headline[]` per run.

**Interfaces:** CSV columns: `date,real,anon,big,sombre,source_url,second_source_url,note`. Produces the `Headline[]` consumed by `buildSchedule` and the screens.

- [ ] **Step 1: Failing checker tests** on small fixture files. The checker must fail a file when: a date is not a trading day in that run; `anon` contains a four-digit year, any capitalised name that appears in `real`, or the pattern `in \d+ years`; either line is over 56 characters; `anon` contains a word from the jargon list (`funds`, `liquidity`, `equities`, `tranche`, `basis points`, `yield`); a source column is empty; a crash has fewer than 8 or more than 10 `big` rows, or a scare fewer than 3 or more than 5; a row dated after `fallEndIndex` is marked `big`.
- [ ] **Step 2:** Implement the checker.
- [ ] **Step 3: Write.** For each run, one writer subagent builds the rows from primary sources (spec 8.4): 30 to 40 for a crash, about 10 for a scare, each `real` line in our own words and each `anon` line in everyday words that do not give the year away. Weekend or after-hours events go on the next trading day and say so. All twelve runs are written at the same time.
- [ ] **Step 4: Seven separate reviews per run.** Each reviewer is a different subagent with one job and sees only what its job needs. Reviews 1 to 6 run in parallel; review 7 follows.
  1. **Fact checker.** Sees only `date` and `real`. Confirms the event and its date from a source it finds itself, different from the writer's, and records it in `second_source_url`. It is never shown the writer's sources.
  2. **Market matcher.** Compares each line with that day's actual price move from the run's price file: a line that says shares fell on a day they rose, or claims "the worst day in a generation" when the data says otherwise, is flagged.
  3. **Originality and style editor.** Checks our voice, plain words, British spelling and length, and searches for each `real` line to make sure it is not a published headline word for word. It may change wording only, never a fact or a date.
  4. **Spoiler tester.** Sees the `anon` lines one at a time with no other context and tries to name the year or the event. Any single line it can place is rewritten. It then reads all of that run's `anon` lines in order and reports how sure it is; that figure goes in the hand-back to SK.
  5. **Novice reader.** Plays someone with no finance knowledge and flags every `anon` line it does not fully understand.
  6. **Sensitivity reader.** Marks `sombre` on any line about deaths, attacks, disasters or a pandemic, and checks those lines are plain and respectful.
  7. **Adjudicator (the lead agent).** Resolves every flag. Any row whose wording changed goes back through reviews 1 and 2 only.
  After all twelve runs pass, one **consistency editor** reads the twelve files together for a single voice and for repeated phrasing across runs.
- [ ] **Step 5:** Run the checker on all twelve; expect pass. Wire real headlines into picked and rematch runs and anonymised ones into blind runs; show the real line for each traded day on the end screen ("You sold the day Lehman Brothers failed.").
- [ ] **Step 6:** Write `docs/review/headlines-for-sk.md`: the single biggest headline of each run (twelve lines, real and anonymised side by side) plus every row a reviewer flagged and the adjudicator could not settle, and the spoiler tester's confidence for each run. Commit. **SK checkpoint 3:** he reads only that page. He does not read the other rows or the commentary.

### Task 11: The result card and sharing

**Files:** Create `src/share/card.ts`, `src/share/share.ts`, `src/share/dailytext.ts`, tests for `share.ts` and `dailytext.ts`, `public/og.png`; modify `index.html`, `src/ui/endscreen.ts`.

**Interfaces:** Produces
`drawCard(canvas: HTMLCanvasElement, m: CardModel): void` at 1080 x 1350;
`shareResult(m: CardModel): Promise<'shared' | 'fallback'>`;
`dailyText(n: number, verdictTitle: string, lead: number, balances: number[], url: string, daysInRow: number): string`.

- [ ] **Step 1: Failing tests.** `dailyText(12, 'Paper hands', -2300, balances, url, 4)` starts with `Don't Press Sell, daily crash 12. Paper hands. $2,300 behind someone who did nothing.`, contains `4 days in a row` (and no such line when `daysInRow` is 1), contains a sketch line of 12 block characters drawn from `▁▂▃▄▅▆▇█`, ends with the url, and names no crash. `shareResult` with `navigator.share` undefined resolves `'fallback'`; with `navigator.share` rejecting it resolves `'fallback'` and nothing is left unhandled.
- [ ] **Step 2:** Implement `dailyText` and `shareResult`. The fallback shows the card full screen with "Press and hold to save" and a "Copy link" button.
- [ ] **Step 3:** Implement `drawCard` from mock-ups 4 and 6: the result front page with "Beat me" and the page's own address at the foot. On a card the reveal is replaced by "Can you guess which crash this was?" and no dated headline appears. A streak card adds "Survived N crashes in a row". Practice runs name the crash (spec 6.11).
- [ ] **Step 4:** Add Open Graph and X card tags and a 1200 x 627 image of the red front page.
- [ ] **Step 5:** Playwright: tap "Challenge a friend" with sharing unavailable; assert the fallback and the hidden crash name. Commit.

### Task 12: Sound, vibration and accessibility

**Files:** Create `src/fx/sound.ts`, `src/fx/haptics.ts`, `src/ui/a11y.ts`, tests for each; modify `src/ui/screen.ts`.

**Interfaces:** Produces `createSfx(): { unlock(): void; tick(rate: number): void; thud(): void; till(): void; rise(progress: number): void; counter(level: number): void; payout(up: boolean): void; setMuted(m: boolean): void }` (`counter` is the rising tone of the live counter while in cash; `payout` accompanies the counting score at the reveal); `buzz(pattern: number | number[]): void`; `announce(text: string): void`.

- [ ] **Step 1: Failing tests:** with `AudioContext` undefined every `Sfx` method is a no-op that does not throw; with `navigator.vibrate` undefined `buzz` does not throw; `announce` writes to one polite live region and is called for big days, trades and the result only.
- [ ] **Step 2:** Implement sounds with oscillators and noise bursts, no audio files. Sound and vibration are on by default and start at the first tap; a switch on the play screen mutes; the choice is stored.
- [ ] **Step 3:** Reduced motion (`prefers-reduced-motion`): no jolt, no rolling digits, slow colour cross-fades. Visible focus rings. The chart has a text label that updates.
- [ ] **Step 4:** Run `design:accessibility-review` on the play and end screens; fix every failure. Commit.

### Task 15: Borrowed-money mode

**Files:** Create `src/engine/borrowed.ts`, `tests/engine/borrowed.test.ts`, `e2e/borrowed.spec.ts`; modify `src/game/session.ts`, `src/engine/verdict.ts`, `src/ui/endscreen.ts`, `src/ui/menus.ts`, `src/store/record.ts`.

**Interfaces:** Produces `simulateBorrowed(closes: number[], trades: Trade[], start?: number): RunResult & { wipedAt: number | null }`. Rules from spec 6.13: the loan is twice the balance at each entry; while invested, balance = 3 x balance at entry x (close / entry close) - loan; a balance at or below zero is a wipe-out on that day and the run ends there; selling repays the loan; the holder puts in `start` without borrowing.

- [ ] **Step 1: Failing tests** with `closes = [100, 90, 80, 100, 107.5]` and start 10000: holding throughout gives a balance of 7000 at index 1 and 4000 at index 2, a `final` of 12250 and `wipedAt null`; the holder's final is 10750, so `lead` is 1500. With `closes = [100, 90, 66, 100]`, holding is wiped out: `wipedAt 2`, `final 0`. Selling at index 1 (balance 7000) and never buying back gives `final 7000`. Selling at index 1 and buying at index 2 with `closes = [100, 90, 80, 100]` gives `final` 7000 x 3 x 100 / 80 - 14000 = 12250.
- [ ] **Step 2:** Implement `simulateBorrowed`. Add the `marginCalled` verdict ("Margin called", "Borrowed three times over and lost the lot", "Local investor gets margin called") ahead of every other row.
- [ ] **Step 3:** Wire it in after Task 8's modes: the mode unlocks after the first blind win and the unlock is stored; a "Play with borrowed money" switch appears on the result screen and in the foot links; the folio label reads "Borrowed money"; the opening line is the fixed copy above; a wipe-out ends the run at once on the wipe-out front page and takes $10,000 from the pot; mystery runs only; never offered inside a double-or-nothing run, a daily crash or a challenge.
- [ ] **Step 4:** Playwright: with the unlock flag set, start a borrowed run on a known crash with no taps and assert the wipe-out front page; on a known scare with no taps assert a lead above zero. Run all; commit.

### Task 13: Polish and budgets

**Files:** Modify UI files as findings require; create `e2e/budget.spec.ts`.

- [ ] **Step 1:** Run `anthropic-skills:unslop` as an audit of the play and end screens against spec section 9; fix what it lists.
- [ ] **Step 2:** Run the impeccable detector and its polish pass; fix what it lists.
- [ ] **Step 3:** Budget test: built JavaScript under 60 KB gzipped; first load under 300 KB; the only cross-origin request is the analytics beacon; `grep -ri "S&P" dist/` prints nothing.
- [ ] **Step 4:** Play all twelve runs at 390 x 660 and 390 x 844 in Playwright with screenshots at the opening, the first red moment, in cash, the fast-forward and the end; look at every screenshot and fix what is wrong.
- [ ] **Step 5:** Repeat step 4's twelve runs with the processor slowed four times, to stand in for an older phone; the game must still keep time and the button must still respond.
- [ ] **Step 6:** Use `superpowers:requesting-code-review` for a whole-branch review. Steps 1, 2, 3, 5 and 6 are independent: dispatch them in parallel and fix findings afterwards in one pass. Commit fixes.
- [ ] **Step 7: SK checkpoint 4.** Send the preview link with a five-minute checklist in plain words: open the link from inside LinkedIn, X, WhatsApp and Instagram on his own phone (and a second phone of the other kind if he can borrow one); in each, play one game, turn the sound off and on, and try "Challenge a friend". He reports anything that looks or behaves wrongly.

### Task 14: Launch and hand-back

- [ ] **Step 1:** Use `superpowers:verification-before-completion`: run the full test suite, the build, the checkers and the Playwright suite; paste the passing output into the hand-back.
- [ ] **Step 2:** Deploy to production on Cloudflare Pages. Open the live address on a phone and play one run to the end.
- [ ] **Step 3:** Hand back to SK: the live link; three phone-sized screenshots (the red front page, a losing result card, a winning result with "Double or nothing" and its ladder); a shot-by-shot plan for a 10 to 20 second screen recording; three hook ideas for the post; and where to see visitor numbers in Cloudflare, click by click.

---

## After launch (not part of this plan)

A daily-crash leaderboard and anonymous play counts (games played, share who sold on the red day, shares) on Firebase's free plan; further crashes in weekly batches. See spec section 16.
