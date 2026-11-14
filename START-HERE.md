# Don't Press Sell: start here

You are building "Don't Press Sell", the third of SK's Still Signal weekend builds. All the thinking is done: the idea was planned in full, tested with simulated players, and written up. Your job is to build it exactly as planned, fast, and to bring SK in only at the points the plan names.

## Read first, in this order

Everything you need is in this folder, already laid out as it should sit in the repository. Copy the whole folder's contents into the root of the new repository before you do anything else. Do not look for a Claude Project: you may not have access to one, and you do not need it.

1. `docs/reference/00_shared_rules.md`: rules for all the weekend builds.
2. `docs/reference/03_dont_press_sell.md`: the original brief. It is background only; the design document replaces it wherever they differ.
3. `docs/superpowers/specs/2026-11-14-dont-press-sell-design.md`: the design document. This is the truth about what the game is.
4. `docs/superpowers/plans/2026-11-14-dont-press-sell.md`: the build plan. This is the truth about how and in what order to build it.
5. `PRODUCT.md`: the product brief for the impeccable skill. It stays at the repository root.
6. `docs/reference/mockups/`: six HTML screens that show the approved look. They are source files from a design canvas: read the sizes, colours and spacing from their inline styles. They still open in a browser at phone width; ignore the missing `support.js` script and the Google Fonts link (the build self-hosts its fonts).

Task 1 step 4 of the plan (copying these documents into `docs/`) is therefore already done; create only `src/engine/types.ts` and `docs/progress.md` in that step. Where the design or the plan mentions a "Project doc" or a canvas link, use the files in this folder.

Where they disagree, the order of authority is: the plan's Global Constraints, then the design document, then the mock-ups. The mock-ups are right about layout, colour, type and spacing. Their words are samples and a few are out of date: their headlines use finance jargon and one gives the year away, they do not show the opening line or the first-sale line, and mock-up 3 shows an old label on the button ("Buy back with $5,610") where the game now shows the live counter ("Buy back now: $2,600 ahead"). They also do not show the pot line, the tap-to-reveal ending, the ladder, the countdown to the next game, the regret line for players who hold, the count of days in a row or the borrowed-money switch: lay those out in the same style. Take every word from the design document and the plan.

## How to work

- Start with superpowers:using-superpowers, then follow the plan with superpowers:subagent-driven-development.
- Follow the plan's section "Running order: what runs in parallel". Dispatch every lane in a wave at the same moment, each in its own git worktree (superpowers:dispatching-parallel-agents, superpowers:using-git-worktrees). Do not run lanes one after another when the plan says they are parallel.
- Write tests first (superpowers:test-driven-development). Before saying anything is done, prove it (superpowers:verification-before-completion). Use superpowers:systematic-debugging when something breaks.
- For every screen: read anthropic-skills:impeccable (its craft floor) before the first interface edit and run its detector; use anthropic-skills:unslop to audit; use design:accessibility-review and design:ux-copy where the plan names them.
- Run every review the plan lists for the price data and the headlines, with a separate subagent for each review. Do not merge reviews into one agent and do not let a reviewer see what the plan says it must not see.
- Keep `docs/progress.md` up to date so a later session can carry on.

## Working with SK

- SK is not technical. Write to him in short, plain British English. When he must do something himself, give numbered, click-by-click steps and wait for him to say it is done.
- Never sit waiting for him otherwise. A checkpoint blocks only the thing it names.
- He looks at four things: one real crash as a plain chart; a rough playable game, where he tells you whether the ending is too long, too short or right; one page of headlines; and the full game on a private link, with a five-minute checklist.
- He has a GitHub account. He believes his Cloudflare account is set up from the balloon build: check with him at the start. The new repository is public and called `dont-press-sell`.

## Decisions that are closed

Do not reopen anything in section 15 of the design document. In particular: real S&P 500 daily closes as the data, shown on screen only as "the US stock market"; dollars; all in or all out; mystery as the main mode with half of all runs being false alarms; every run starts at the first rumblings and plays to full recovery with a fast-forward; the front-page look; sound on by default; a game of about 45 seconds; the live counter while in cash; the pot; the tap-to-reveal ending; the double-or-nothing ladder; borrowed-money mode in this build (Task 15); the player, the holder and perfect timing always starting a game with the same amount; no in-app page of sources; the leaderboard is the first update after launch, not part of this build.

## When to stop and ask

Stop the affected lane, keep the others going, and tell SK plainly with two or three options if:
- the price download is blocked or the data fails any of its five checks;
- the look-alike test shows that crashes and false alarms can be told apart in the first ten seconds;
- a strategy bot wins more than 8 of 12 games;
- any step would cost money, need an account he does not have, or store personal data.

## Finish

The build is finished when Task 14 of the plan is done: the game is live, and SK has the live link, three phone-sized screenshots, a plan for a 10 to 20 second screen recording, three hook ideas for the post, and click-by-click directions to his visitor numbers.

Begin with Task 1.
