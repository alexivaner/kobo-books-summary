# Contributing

Use Node.js 24 and pnpm 11. Install with `pnpm install`, generate synthetic fixtures with `pnpm fixtures`, and run `pnpm dev`.

Before submitting changes, run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`. Browser tests use installed Chrome by default; `PLAYWRIGHT_CHANNEL=chromium` uses Playwright's bundled Chromium after `pnpm exec playwright install chromium`. The test configuration starts a production server when one is not already running.

Keep source adapters independent and preserve original record ids. Never execute imported Lua or change the Kobo filesystem. Unknown data stays unknown. Avoid automatic title-based edition merges or destructive removal of records absent from a later import.

Use synthetic fixtures. Do not attach real reading databases, quotes, EPUBs, screenshots, credentials, backups or personal filesystem paths to issues, commits or CI artifacts. Private hardware tests must remain opt-in and write artifacts outside the repository. A fixture should demonstrate the schema/behavior without copying somebody's book content.

Network features must be optional, disclose which metadata leaves the browser, and operate without uploading annotations. Cover requests must respect provider rate limits and attribution. Cover images retain their original rights and are not licensed under this project's MIT license.
