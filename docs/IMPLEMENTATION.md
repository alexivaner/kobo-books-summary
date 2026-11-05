# Implementation and verification

This is an early local-first release, prepared as an MIT-licensed project. GitHub publication is private until the maintainer chooses a public release. No hosted production service or donation provider is configured.

## Delivered

Next.js App Router, React/TypeScript, Tailwind/PostCSS, Lucide and ECharts form the UI. A dedicated worker owns sql.js, import parsing, schema-v1 SQLite entity tables and transaction commits. OPFS atomically replaces exported snapshots; IndexedDB is the persistence fallback. The UI reports mutation success only after a durable save, and restores its prior database if persistence fails. A Web Lock prevents concurrent writers in two tabs.

The dashboard, bookshelf, details, knowledge library, topics/favorites, personal reflections, portable backup/restore, per-book exports, light/dark themes and offline production shell are functional. FTS5 is detected and maintained if supported; the UI has a Unicode-normalized substring search fallback.

### Source behavior

- Kobo classifies `Accessibility=6` as a preview and `4` as a recommendation, following calibre's established Kobo adapter. Undownloaded, non-sideloaded, unread entries with no progress, recorded duration, last-read date or annotations are catalog-only. Full downloaded unread books and historical reading stay on the shelf. Classification is conservative when fields are missing.
- All source records are preserved, but previews/recommendations/catalog records are excluded from the reading view and statistics by default. An explicit toggle reveals them. Reimport updates old rows with classification without erasing personal knowledge.
- Kobalt's `books`, `entries`, `book_state` and `reading_sessions` tables are supported. Kind 0 is a bookmark; kind 1 is a highlight. Notes are preserved separately. State format 1 is supported. Session `started`/`observed`/`active_ms` are milliseconds. A completed session never implies a completed book. Formats that cannot be interpreted produce diagnostics.
- KOReader book/page statistics, modern sidecars and supported legacy highlights are parsed. Lua is data-only: calls, expressions, unsafe keys, excessive nesting and oversized files are rejected. Unsupported legacy note structures are diagnosed.
- Stable source ids prevent duplication on reimport. Missing records are retained; explicit native hidden annotations are archived. Orphan annotations create metadata placeholders; earlier known metadata is preserved when available.

### Covers

Local Kobo assets and selected unencrypted EPUB covers are preferred. Corrupt/missing images fall back to generated artwork. Open Library lookup is explicit and per book. An ISBN is used when possible; otherwise the title/author is searched and the user selects a candidate. Only Open Library API/image hosts are allowed. Requests omit credentials/referrers; responses and downloads are bounded. Chosen images and attribution are stored privately as raster data URLs for offline use. No server proxy or bulk metadata harvesting exists.

## Verification

Current local verification: type checking, ESLint and the production build pass. All 54 synthetic unit/integration tests pass; enabling private hardware validation gives 55 passing tests. All 11 Chrome browser tests pass with private hardware validation enabled (the hardware case is skipped by default). Coverage includes automatic grouped enrichment, cached/resumable work, local covers, metadata provenance, offline persistence, source filtering, notes/reflections, portable restore and the writer lock. The macOS launcher passes a shell syntax check; its system browser/Terminal handoff is user-driven.

A connected Kobo Clara Colour was inspected using safe temporary snapshots. Its native Kobo, KOReader and Kobalt databases and supported sidecars were exercised in private opt-in tests. No private source files, book content, screenshots or reading statistics are included in this repository. Device source databases were never opened by SQLite directly or modified. Schema/version fixtures remain synthetic.

The Open Library example ISBN endpoint was checked with a public example and returned HTTP 200 with browser CORS support. Automated cover tests intercept synthetic provider responses; no real user's metadata is transmitted by the test suite.

## Limits

- Chrome is locally browser-tested; CI uses Chromium. Safari, Firefox, Edge, iOS permissions and private-browsing persistence need separate verification. File/directory-input flows are tested; the native directory-picker permission dialog was not automated.
- Real-device validation used standalone databases. WAL/rollback companion detection is synthetic-tested; live-writer recovery needs broader hardware validation. Individual-file selection cannot detect unselected companion files.
- Limits: 128 MB/database; 8 MB/Lua file; 100,000 rows/source table; 15,000 relevant files; 500 MB/read batch; 128 MB/cover-source selection; 4 MB/provider image. Whole-file SQLite persistence has memory/write costs for large libraries.
- Kobalt's legacy standalone JSON annotation files and unknown future database/state formats are not claimed compatible. Unsupported state rows are diagnosed while usable annotations are retained. Reopening a publication with a changed fingerprint can produce a separate source edition.
- Source records retain reader provenance. Exact source identity is supported; interactive edition merging/unmerging and a general cross-reader work resolver are future features. Independent source duration totals may overlap.
- Reading timelines use recorded timestamps/intervals. No completed-book dates, reading sessions or calibrated statistics are inferred from absent data.
- Storage is origin/profile-specific and is not encrypted with an app-specific password. Browser deletion can erase it. Persistent-storage requests do not replace backups.
- Open Library coverage, CORS availability and rate limits are external constraints. Downloaded cover rights are separate from the code license; the app does not publicly rehost a cover corpus.
- TypeScript 6 and ESLint 9 are pinned for compatibility with current Next lint plugins. ESLint 9 carries an upstream deprecation notice; major upgrades require validating the full lint dependency graph.

## Future release work

Broader firmware/browser fixtures; explicit edition merge review; streaming imports/search indexing; local or opt-in AI with annotation citations; optional desktop discovery; spaced repetition; social exports; public deployment verification; and a maintainer-approved donation destination. Do not introduce required accounts, annotation uploads or payment gates for the local core.

## Primary references

- [calibre Kobo adapter](https://github.com/kovidgoyal/calibre/blob/master/src/calibre/devices/kobo/driver.py)
- [Kobalt storage contract](https://github.com/nicoverbruggen/kobalt/blob/main/doc/storage.md)
- [Kobalt annotation database](https://github.com/nicoverbruggen/kobalt/blob/main/src/storage/annotation_database.cpp)
- [KOReader statistics](https://github.com/koreader/koreader/blob/master/plugins/statistics.koplugin/main.lua)
- [Open Library Covers API](https://openlibrary.org/dev/docs/api/covers)
- [sql.js](https://sql.js.org/)

## Automatic enrichment and history update

The reading shelf can be enriched automatically after enabling the setting in that browser. The queue requests one deduplicated ISBN/title-author group per request to avoid ranking starvation, and cover IDs share downloads within a run. Source fields are preserved. Results include query identity and matcher version; metadata changes invalidate old results and misses expire after 30 days. Manual retry includes unavailable covers; pending covers resume without another metadata query. Provider errors/rate limiting stop requests and persist a fifteen-minute backoff. A one-minute browser timer resumes eligible work while enabled. Turning the setting off cancels pending network operations. This is a client-side queue, not a scheduled cloud task.

Native last-finished/last-started dates and start counts are imported. Kobalt finished-position markers are retained as undated evidence. Reading history preserves unique source completion dates and finished-state transitions across snapshots, without claiming exact lifetime reads from source starts. History and enrichment are optional validated book payload fields, so existing schema-v1 backups remain readable.

The macOS launcher starts the app without requiring a remembered terminal command. Browser-profile storage remains isolated; migrating from the Codex preview to another browser requires a one-time portable backup/restore.

Automatic matching prefers an exact ISBN, then a unique exact title plus normalized author name at work level when the edition ISBN is absent from the catalog. Queries include title/author alternatives and constrain known authors to reduce unrelated results. Native publisher, language, series and available descriptions are imported as local reader metadata, separately from the optional remote enrichment. Cover fallback diagnostics are accepted in private hardware validation and remain visible to the user.


## Public beta preparation — 2026-11-05

Static Next.js export is assembled in root `out`, including the post-build service worker, manifest, WASM and Cloudflare headers. A welcome page and optional Ko-fi links complement the existing root workspace. The storage worker does not require SharedArrayBuffer.

The shelf groups verified same-file and ISBN records, with reversible manual grouping/splitting stored as optional source-book fields. Original annotations, source ids, sessions and history remain intact. Main-card progress comes from the latest dated source; per-reader values remain visible. Times are not combined across group members.

Local validation: production export, TypeScript, ESLint, synthetic unit regressions and browser regressions, including an OPFS library retained across a complete browser-process restart. Open Library browser tests use deterministic mock responses; provider availability and catalog coverage remain external limitations. Physical-device validation is opt-in and separate from these synthetic checks.


Public hosting verification — 2026-11-05: GitHub Actions run 41951451005 passed root regressions, a prefixed artifact build, the prefixed SQLite/import/offline smoke test, and Pages deployment. Two additional tests passed against https://alexivaner.github.io/kobo-books-summary/: a synthetic import into OPFS/SQLite with offline reopening, and desktop/mobile welcome/app navigation without page errors. Live provider catalog coverage and physical device behavior are separate from these synthetic browser checks.
