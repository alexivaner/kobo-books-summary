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

Current local verification: type checking, ESLint and the production build pass. All 40 synthetic unit/integration tests pass; enabling private hardware validation gives 41 passing tests. All 10 Chrome browser tests pass with private hardware validation enabled (the hardware case is skipped by default). Browser tests cover native/KOReader/Kobalt import, repeated imports, reload/offline persistence, bookmarks vs highlights, multilingual notes, knowledge/favorites/topics/reflections, backup/clear/restore, scope filtering, explicit cover requests and offline cover caching, responsive layout/themes, and the second-tab writer lock.

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
