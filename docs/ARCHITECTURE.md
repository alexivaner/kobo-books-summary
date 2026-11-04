# Kobo Books Summary

Local-only Next.js App Router application. React renders the workspace; a dedicated worker owns SQLite WASM, source parsing, and transactional mutations. There are no API routes, accounts, analytics beacons, or private reading data on the Next server. Open Library requests are explicit, per-book browser actions.

## Persistence

sql.js provides broad SQLite-file compatibility in workers. Committed normalized tables are exported to an OPFS file via atomic synchronous access; IndexedDB is the fallback when OPFS is unavailable. A durable write completes before the UI reports success. Whole-file snapshots deliberately trade large-library scalability for straightforward portable backups. Data survives refresh, device removal, and missing source records. Never use two tabs to edit: a Web Lock enforces one writer. Schema migrations are transactional, versioned via user_version. FTS5 is detected at runtime; a Unicode-aware application search fallback is always available.

Tables: books, editions, devices, snapshots, source_records, attempts, sessions, annotations, knowledge_items, topics, knowledge_links, reflections, review_events, ai_insights. Each entity has an immutable primary key; book-related entities have a book_id foreign key. Source ids are scoped by reader and a user-selected device identity. Uncertain cross-reader identities remain separate; the import review lists exact-title/author candidates but does not merge them. Reading attempts retain snapshot-level progress. Imports upsert by source id; absent annotations are preserved; explicit source deletions are retained with a sourceDeleted flag.

## Import

Directory/file picker → bounded file selection → worker discovery → dynamic-schema SQLite readers / bounded Lua table parser → preview & diagnostics → user commit → transaction → durable persistence → React refresh. No filesystem write handle is ever requested. Nonempty WAL or rollback journal companions block raw SQLite import because sql.js cannot replay them; use the documented read-only Python snapshot helper. The helper copies database and companions to temporary storage, verifies source stability, then uses SQLite backup to produce a consistent standalone file. It never connects SQLite to the mounted original.

KOReader supports statistics book/page_stat_data and legacy page_stat, modern annotation sidecars and older highlight tables. Lua is tokenized and parsed as serialized tables, never executed; expressions, function calls, metatables, and loops are rejected. File size, depth, token count and record count are capped. Page statistics are recorded page-reading intervals, not fabricated reading sessions. Native aggregate TimeSpentReading remains aggregate only. Missing duration/date is null, never an invented zero/date.

Covers: selected local Kobo image assets, EPUB container/OPF embedded cover extraction (bounded zip decompression), then generated typographic covers. Optional Open Library lookup is consent-driven in the book details view; downloaded raster data and attribution remain in private browser storage. Assets stay in browser storage with imported records.

## Extension boundaries

`AIProvider` accepts explicit annotation ids and returns citations; no provider ships. `DesktopSourceProvider` describes future consent-based companion discovery. AI, semantic search, spaced repetition scheduling, social renderers and cloud sync remain future work. No UI implies these are available.

## Scope and limits

Folder selection is permission-based. Hidden directories may be excluded by browser/platform pickers: explicit database selection or the snapshot helper is supported. Keep Kobo in USB storage mode during selection. A 128 MB/database and 8 MB/Lua limit applies; selected EPUBs are capped at 64 MB. Metadata without a source id falls back to stable content/location identity. Cross-device duplicates require manual review, no automatic heuristic merge. Browser storage can be cleared by browser settings; export backups. Full-text fallback scans annotations in memory. Offline shell caching starts after first successful load; production build is required to validate offline use.

Store previews/recommendations and untouched undownloaded catalog records are classified at import and retained separately. A reading view excludes them by default across books, statistics and annotations. The full backup retains original source records and personal knowledge. Kobalt annotations use source-scoped ids including their kind; bookmarks do not count as highlights. Its session clock fields are milliseconds, not Unix seconds.

The production build generates a versioned service worker from its tracked template plus a manifest of all static application assets. Installation precaches the complete shell, WASM and every worker dependency; it does not depend on the browser HTTP cache or the main page observing worker-internal requests. Generated manifest/worker files are excluded from Git and recreated by `pnpm build`.
