# Progress

Kept up to date at the end of every task so a new session can carry on. Plan: `docs/superpowers/plans/2026-11-14-dont-press-sell.md`.

## Done
- Task 1 (scaffold): Vite + TS strict + Vitest + Playwright config, self-hosted fonts in `public/fonts/`, `src/engine/types.ts`, `src/content/copy.ts` (all fixed strings), placeholder `src/content/runs.ts` (run ids), docs copied in. GitHub repo exists (`shrivatsakajaria/dont-press-sell`).

## Next
- Wave 1: lanes A to G in parallel.

## Open flags
- Price check 1 (second source) could not run: Stooq now shows a bot challenge; FRED, WSJ and Nasdaq unusable from here. Asked SK to choose: he downloads the Stooq CSV in a browser, or use check 4's published figures, or both. Price files stay unmerged until settled. Checks 2 (integrity), 3 (recount), 5 (look-alike, 6 of 12 = chance) passed; check 4 running.
- SK confirmed Cloudflare works (balloon site visible). Sent him click-by-click Pages hook-up steps (production branch = the claude/ branch, build `npm run build`, output `dist`); waiting for his pages.dev address. Web Analytics switch-on comes after first deploy.

## Rulings (lead agent)
- R1. Run ids are fixed now: crashes `c1929 c1987 c2000 c2007 c2020 c2022`; scares `s1998 s2010 s2011 s2015 s2018` and a sixth, provisionally `s2025` (Feb to Jun 2025 fall). Lane A confirms against the data and may swap the sixth (then updates the manifest). Modules read the pool from `src/content/runs.ts` (`RUNS`, `RUN_IDS`, `runMeta`, `loadRun`), never hard-code it.
- R2. `findEpisode` takes an optional fourth argument `kind: RunKind = 'crash'` because the fall-end rule differs for scares (plan Task 2 step 2) and the plan signature had no way to know.
- R3. Price files `data/runs/<id>.prices.json` hold a `RunData` object exactly. `loadRun(id)` loads them lazily (separate chunks), keeping the main bundle small.
- R4. `marginCalled` lives in `src/engine/verdict.ts` (Lane C owns that file). It fires when the result carries a non-null `wipedAt` (type `BorrowedResult` in `types.ts`). Lane B builds `simulateBorrowed` only.
- R5. `src/content/copy.ts` is written by the lead in Task 1 with every fixed string from the plan. Lanes import from it and never edit it; strings a lane owns (verdict titles, near-miss lines, commentary) live in that lane's module.
- R6. `src/game/rng.ts` is owned by Lane G (Wave 1); Task 4 uses it and does not recreate it.
- R7. Yahoo Finance history download works when the script sends an honest client name in the User-Agent header (it returns 429 with none). No browser impersonation.
- R8. Near miss "Bought back N days after the peak" (spec 8.2) is read as "Bought back N days after the bottom" (buy 1 to 10 trading days after the lowest close), the mirror of the sale line. Cost if wrong: one string and one condition.
- R9. Borrowed-money run with no trades and no wipe-out finishes ahead of the unborrowed holder; its verdict is "Diamond hands" with borrowed copy: "Borrowed three times over and held on" / "Local investor borrows big, holds on, gets away with it". Big Short and Nerves of steel need at least one trade.
- R10. A wiped-out (margin called) run shows no near-miss lines.
- R11. The daily crash follows a fixed 12-day cycle from launch (2026-11-21), so any twelve days in a row cover all twelve runs.
- R12. A scare's "high" is the highest close before its fall (a local peak), not the all-time record (spec 7.2 says "fell 10% to 19% from a high and was back above that high"). This keeps SK's candidates 2010 and 2011, which sit inside the long 2007 to 2013 recovery. Crashes still use the all-time record. Cost if wrong: two scares swap for 1989 and 1990.
- R13. Commentary context: price files carry `high` (the reference high) and `preCloses` (30 closes before day 1); "from the peak" is measured from the real high; `invested` means the position during today's move (held at yesterday's close); `neverSold` gates "still holding" lines; single percentages use normal rounding.
- R16. An ordinary fall step holds at most 700 ms, so slow-motion days (800 ms) always feel slower; runs with short falls finish sooner than 45 s.
- R17. 1929 and 2000 get a 50-second fall (spec allows up to about 60 s in total).
- R19 (provisional, for SK). Anonymised headlines that an expert can place on their own at 75% or more, or at 50% or more early in the fall, are rewritten to be less specific. The expert tester still names every run from all its lines together (95 to 99%); this goes to SK at checkpoint 3 with options.
