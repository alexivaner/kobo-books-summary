# Cloudflare deployment

The application is a Next.js static export. There are no API routes, server-side reading-data storage, mandatory accounts or required runtime secrets. `pnpm build` exports `apps/web/out`, generates current offline assets there, then copies the complete artifact to repository-root `out`.

## Cloudflare Pages with GitHub

1. Connect the `alexivaner/readmory` repository to a Cloudflare Pages project using Cloudflare's GitHub integration.
2. Root directory: repository root. Build: `pnpm build`. Build output: `out`. Production branch: `main`.
3. Use Node.js 24 and the `pnpm@11.25.0` version in package.json. Set `NODE_VERSION=24` if needed. No application environment variables are required. Dependency installation must run the asset postinstall script to copy sql-wasm.wasm.
4. Enable preview deployments for feature branches / pull requests. Require passing GitHub Checks before merging to main. Preview URLs have separate browser storage. A private repository does not make deployed URLs private; configure Cloudflare Access if needed.
5. Add a custom domain through Pages → Custom domains, follow its current DNS instructions, and wait for HTTPS activation. Pick the final origin before importing a real library.

Cloudflare's built-in Git integration is the recommended automatic deployment route. Connecting it requires the owner's Cloudflare account; publishing through the Sites connector does not automatically create a GitHub-connected Pages project in that account.

## Available Sites hosting

The `.openai/hosting.json` manifest declares this project's Sites identity and static `out` directory. Sites publishing uses its authenticated source/version/deployment tools. The public GitHub repository remains the contribution source. Its CI checks do not themselves deploy to Sites.

## Storage, WASM and security headers

`apps/web/public/_headers` is copied into the final artifact. It permits same-origin worker/WASM loading and optional requests to Open Library, blocks framing and disables referrer disclosure. Local `pnpm start` serves the same CSP. Verify headers on the actual host: support for `_headers` varies by host.

The storage worker uses single-threaded sql.js and full-snapshot OPFS writes through `createWritable`, with IndexedDB fallback. It does not use a shared-memory SQLite VFS, pthreads or SharedArrayBuffer, so COOP/COEP cross-origin isolation is not required. Do not add `require-corp` without testing external lookup and cover behavior. HTTPS (or loopback for local development) is required for secure browser APIs.

## Verify and release

Run `pnpm fixtures`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`. Test the exported app, not a Next.js development server. Verify imports, repeated imports, grouping/splitting, notes, backup/restore, offline reload, WASM initialization, and a browser-process restart with a retained test profile. Only synthetic fixtures belong in automated checks and public screenshots.

After deployment verify `/`, `/welcome/`, `/sw.js`, `/offline-assets.json`, and `/vendor/sql-wasm.wasm`. Check desktop/mobile layouts, optional metadata requests, console errors, response CSP and offline operation. Local checks do not prove hosted browser behavior.

## Data migration and rollback

The app stays at `/`, preserving existing same-origin bookmarks. Hash navigation requires no server rewrites. Source records are not deleted when grouping changes, and grouping overrides are included in the existing version-1 portable backup. Old backups without overrides remain valid.

Before switching domains, download a backup in the old origin/profile and restore it explicitly in the new origin/profile. Browser storage is never copied by deployment. Keep backups before upgrades; service-worker updates retain recent app-shell caches but do not back up the database.

For Pages, roll back to a prior successful deployment in its dashboard. For Sites, deploy the prior saved version. Avoid versions that cannot read the current database or backup fields. Test recovery on a copy before replacing a real library.

## Troubleshooting

- Missing worker/WASM: check postinstall, exported paths, MIME types, CSP and HTTPS.
- Old offline shell: inspect service-worker update status and reload after update. Never clear site data to troubleshoot without a backup.
- Another tab owns the library: close that tab and reload; the Web Lock prevents concurrent writers.
- Metadata missing: check lookup consent, status/backoff, ISBN/edition coverage and manual Find cover. No provider can guarantee every cover.
- Library appears empty on another URL/browser: restore a backup; origins and profiles are intentionally isolated.


## GitHub Pages public hosting

The GitHub Actions workflow also supports publishing to GitHub Pages without a separate hosting token. Enable Pages with build type `workflow`. Main pushes run the root-path regression suite, build again with `NEXT_PUBLIC_BASE_PATH=/readmory`, test the prefixed worker/WASM/offline paths, and deploy the artifact using GitHub-managed OIDC permissions. Pull requests run checks without deploying.

The expected URL is `https://alexivaner.github.io/readmory/`. GitHub Pages does not apply Cloudflare `_headers`; do not claim the Cloudflare response-header policy is active there. Parsing, persistence, consent controls and explicit no-referrer API fetches remain in the client. Cloudflare builds leave `NEXT_PUBLIC_BASE_PATH` unset and use root `out` as before. Sites remains an optional hosting route; its publishing credential handoff was blocked during the initial public-release session, so no Sites publication should be inferred from the hosting manifest.


## Readmory address migration

The canonical repository is `alexivaner/readmory`, with GitHub Pages at `https://alexivaner.github.io/readmory/`. The former `/kobo-books-summary/` and `/kobo-books-summary/welcome/` addresses are handled by redirect pages in `alexivaner/alexivaner.github.io`, retaining query strings and hash navigation. The old repository name is not reused, preserving GitHub's repository redirect.

The host remains `alexivaner.github.io`. Keep the existing OPFS filename, IndexedDB name, local-storage keys, write lock and backup format unchanged so existing libraries remain available in the same browser/profile. The old service worker uses network-first navigation and can receive the redirect without clearing site data. Migration verification imports a synthetic library at the former path, follows the redirect in the same context, then checks library persistence and offline reopening at `/readmory/`.
