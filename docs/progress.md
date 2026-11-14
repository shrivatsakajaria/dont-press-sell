# Progress

Kept up to date at the end of every task so a new session can carry on. Plan: `docs/superpowers/plans/2026-11-14-dont-press-sell.md`.

## Done
- Task 1 (scaffold): Vite + TS strict + Vitest + Playwright config, self-hosted fonts in `public/fonts/`, `src/engine/types.ts`, `src/content/copy.ts` (all fixed strings), placeholder `src/content/runs.ts` (run ids), docs copied in. GitHub repo exists (`shrivatsakajaria/dont-press-sell`).

## Next
- Wave 1: lanes A to G in parallel.

## Open flags
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
