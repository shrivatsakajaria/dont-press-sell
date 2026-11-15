# Don't Press Sell

A one-button, one-minute phone web game: hold or sell $10,000 of play money through a real historical fall in the US stock market, then get a newspaper front page about how you did.

Static site (Vite + TypeScript), no backend, no runtime dependencies. Built with AI as a Still Signal weekend build.

- `npm run dev`: local server
- `npm test`: unit tests (Vitest)
- `npm run build`: production build into `dist/`
- `npm run e2e`: phone-size checks (Playwright)

Link previews: `og:image`, `twitter:image` and `og:url` must be absolute, so the build writes the site address into `index.html` (every `%SITE_URL%`). It uses `SITE_URL` if set (for example `SITE_URL=https://example.com npm run build`), else `CF_PAGES_URL`, which Cloudflare Pages sets on every build. With neither, the URLs stay relative.

Design: `docs/superpowers/specs/2026-11-14-dont-press-sell-design.md`. Plan: `docs/superpowers/plans/2026-11-14-dont-press-sell.md`. Progress: `docs/progress.md`.

Fonts: Newsreader and Libre Franklin, SIL Open Font License (see `public/fonts/`).
