# Analytics: what is counted and how to read it

The site uses Umami Cloud (free Hobby plan: one site, 100,000 events a month, no cookies). The script only counts on dontpresssell.com and www.dontpresssell.com; the preview, tests and your own laptop are never counted. Nothing that identifies a person is sent: no names, no IDs, no cookies. The few counts the game keeps on the phone (how many games, the day of the first game, whether the question has been asked) leave the phone only as rough groups such as "3-5".

Each game sends about four events (start, end, what they did next, sometimes a share), plus Umami's own page view. At 15,000 to 20,000 games a month that stays inside the free plan.

## The two headline numbers

1. **Games per visitor.** Events page: the count of `game_start` for the period, divided by **Visitors** on the Overview for the same period. Above 1 means people play again.
2. **Shares per 100 players.** The count of `share` events where `via` is `native`, `card` or `copy` (the share went out), divided by the number of visitors who started a game, times 100. The number of visitors who started a game is a Goal (see "Goals" below) on the event `game_start`. `via` = `fallback` means the save-or-copy box was shown because the phone could not share; it is not counted as a share unless they then pressed Copy link, which sends a second `share` with `via` = `copy`.

## Every event

Every event carries the shared context:

| Property | Values | Meaning |
|---|---|---|
| `g` | 1, 2, 3 ... | Which game of this visit (counted from when the page was opened). |
| `gt` | 1, 2, 3-5, 6-10, 11+ | Games ever started on this phone, this one included. |
| `dsf` | 0, 1, 2-7, 8+ | Days since the first game on this phone. 0 is the first day. |
| `entry` | new, rematch, double, challenge, picked | How the game began: a new mystery crash (including the first one), Rematch this crash, Double or nothing, a challenge link from a friend, or chosen from Pick a crash. |
| `kind` | crash, scare | A real crash or a false alarm. |
| `run` | c1929, c1987, c2000, c2007, c2020, c2022, s1998, s2011, s2014, s2018, s2024, s2025 | Which run. c2007 is 2008, and so on. |
| `inapp` | linkedin, x, facebook, instagram, whatsapp, other-inapp, none | The app whose built-in browser the page is open in, read from the browser's description of itself. none is an ordinary browser. |
| `snd` | on, off | Whether the sound was on. |

The events:

| Event | When | Extra properties |
|---|---|---|
| `game_start` | The player presses Start. | `ms_to_start` (first game of a visit only): time from opening the page to pressing Start: <3s, 3-10s, 10-30s, 30-60s, 60s+. |
| `game_end` | The result page appears. | `outcome`: win, draw, loss, or bust (wiped out with borrowed money). `lead`: dollars ahead of or behind someone who did nothing, in groups: -2000 or less, -1999 to -500, -499 to -1, 0, 1 to 499, 500 to 1999, 2000 or more. `sec`: seconds of play (pauses and time away left out): <30, 30-59, 60-89, 90-119, 120-179, 180+. `trades`: number of sells and buys. `first_sell`: never, before_red, on_red, after_red (the first sale, against the first red day, when the page floods red). `first_sell_pct`: how far through the game the first sale came, in tens (0, 10 ... 100); absent when they never sold. `cash_pct`: share of play time spent in cash, in tens. `double`: true for a double-or-nothing game. |
| `result_action` | The first thing they do on the result page (once per game). | `action`: rematch, new (Play a new mystery crash), double (Double or nothing), keep (Keep my win), challenge (Challenge a friend), pick (Pick a crash), collection (Your collection), reveal_only (tapped "Tap to see what that was" and then left the page), left (left the page without doing anything). `result_sec`: seconds on the result page before that: <5, 5-14, 15-29, 30-59, 60+. `revealed`: true when they tapped "Tap to see what that was" (the name also shows by itself after 4 seconds; that does not count). |
| `share` | Challenge a friend finished, or the fallback box was shown. | `via`: native (the phone's share sheet, link and text), card (the share sheet with the picture), fallback (the save-or-copy box was shown instead), copy (Copy link pressed in that box). |
| `game_quit` | The page went to the background or was closed during a game (not on the result page). Once per game. | `phase`: start_screen (never pressed Start), before_red (still invested, no red day yet), holding (still invested after a red day), in_cash, fast_forward (the years after the fall). `pct`: how far through the game, in tens. `sold`: whether they had sold at all. A player who switches app and comes back is counted here too; if they then finish, a `game_end` follows. |
| `load_error` | A run's data did not load. | `run` and `inapp` only. |
| `feedback` | The answer to "Play again tomorrow?", asked once, on the result page after the third finished game on a phone. | `answer`: yes or no. |

## Reading it in Umami Cloud

Menu names below are taken from Umami's own documentation (docs.umami.is, November 2026). Log in at cloud.umami.is and open the website "Don't Press Sell". The date range picker sits at the top right of every page.

### Visitors and visit duration
1. Open the website. The first page (the dashboard, often called Overview) shows **Visitors**, **Visits**, **Views**, **Bounce rate** and **Visit duration** for the chosen dates.
2. Umami's definitions: Visitors is the number of unique sessions (a visitor is recognised, without cookies, from a hash of the address, the browser and a salt that changes every month); a visit is a stretch of activity within that; Visit duration is the total time on the site divided by the number of visits.

### Events
1. Open **Events** in the website's menu. The chart and the list show how many times each event was sent: `game_start`, `game_end` and so on.
2. Click the **Properties** tab on the Events page to see each property and a breakdown of its values (for example `game_end` → `outcome`).

### One property, then another (game_end by outcome, then result_action)
1. Events → **Properties** → choose `game_end` and the property `outcome`: the split of wins, draws, losses and busts.
2. To see what winners did next: open the filter panel on the Events page, use its **Event properties** tab, and pick `result_action` with `action`; to narrow it to one group of players, add a second filter such as `entry` = new or `gt` = 1. Umami filters by a property of the same event, so "outcome then next move" is read by comparing the `result_action` split for the period with the `game_end` split; the two events share `g`, `run` and `entry`, so a filter on `run` or `g` lines them up.
3. **Breakdown** (under the reports) splits visitors and visits by the page fields Umami collects (path, browser, country and so on): "Step 1: Choose your field(s)", "Step 2: Choose your filter(s)", "Step 3: Run insight". Its documentation does not list event properties among the fields, so use the Properties tab for those.

### Funnel (page view → game_start → game_end → result_action → share)
1. Open **Funnel** and click **Add funnel**. Give it a name and set the **Window** (the most minutes allowed between two steps; 30 is a good start) and click **Save**.
2. Under "Choose your steps" click **Add** for each step:
   1. **Viewed page**: `/`
   2. **Triggered event**: `game_start`
   3. **Triggered event**: `game_end`
   4. **Triggered event**: `result_action`
   5. **Triggered event**: `share`
3. Click **Run insight**.
4. A funnel step is an event name; the documentation does not offer a property condition on a step, so "result_action rematch or new" cannot be a step of its own. Read that split from Events → Properties → `result_action` → `action` for the same dates.

### Retention
1. Open **Retention**: "Step 1: Choose a date (month and year)", "Step 2: Run insight".
2. Rows are the people who first came on each day; columns are Day 1, Day 2 ...; each cell is the share of them who came back that day.
3. Umami recognises a returning visitor from a hash whose salt changes every month, so returns across a month boundary are not joined up. The game's own `dsf` (days since first play) and `gt` (games ever) are kept on the phone and so do cross months: Events → Properties → `game_start` → `dsf` shows how many games come from people on their first day, second day, first week or later.

### Goals (players, for "shares per 100 players")
1. Open **Goals** and click **Add goal**, fill in the name, click **Save**, then under "Choose your action" pick **Triggered event** and type `game_start`.
2. Run it: the result is the number of visitors who started at least one game.

### Filter by run
1. On the Events page open the filter panel, choose the **Event properties** tab, pick the property `run` and a value such as `c2007`.
2. Every count on the page (and in Properties) is then for that run only. The same works for `kind` (crash or scare), `inapp` (which app's browser) and `entry`.

## How it is built (for the next developer)
- `index.html` loads `https://cloud.umami.is/script.js` with `defer`, `data-website-id` and `data-domains`. With data-domains set, the tracker stays silent on any other host.
- `src/analytics/` holds the events (`analytics.ts`) and the groups (`buckets.ts`). `track` waits in a short queue until `window.umami` exists, does nothing when it is blocked, and never throws.
- Umami's tracker sends each event with `fetch(..., { keepalive: true })`, so the exit events sent on `visibilitychange` (hidden) or `pagehide` survive the page closing; no beacon of our own is needed.
- The end-to-end tests block cloud.umami.is on every page (`e2e/fixtures.ts`); `e2e/analytics.spec.ts` replaces the script with a stub that records the calls.
