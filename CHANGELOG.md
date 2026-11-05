# Changelog

## 0.1.0 — Public beta

- Year/month reading statistics, book rankings and locally generated PNG share cards with cached covers and privacy controls. Earlier annotation dates now appear as activity evidence without inventing hours.

- Unified native Kobo event history, measured analytics sessions, Kobalt and KOReader activity. Added reader coverage, evidence labels, conservative overlap handling, second-level durations, checksum-based KOReader linking and tolerance for sub-second Kobalt clock drift.

- Fixed whole-folder USB cover imports: cached shelf images are processed before EPUBs in bounded batches, instead of exhausting a shared 128 MB allowance. Added cover counts and measured batch progress.

- Dedicated personal notes and reflections view, searchable with reader provenance and passage context.
- Detailed monthly reading calendar with per-day sessions and reader filters; source totals never invent daily history.
- Larger typography and responsive controls throughout the workspace.

- Readmory identity: forest/sage/cream themes, editorial typography, book/bookmark mark, owner-supplied R artwork, and offline brand assets. Existing vaults, backups and URLs remain compatible.

- Local imports for Kobo, KOReader and Kobalt, with previews separated from the reading shelf.
- Guided USB import with platform-specific file help; compact reader comparison cards with expandable history and book-match controls.
- Bookshelf, annotations, knowledge topics, reflections, activity and portable backups.
- Completion history with explicit limits on inferred rereading evidence.
- Combined shelf cards for verified file/ISBN matches; reversible manual combination and source-specific progress/history.
- Optional Open Library metadata/covers with bounded caching, retry controls and provider backoff.
- Static hosting, offline shell, welcome page and optional Ko-fi support.

This beta preserves reader-specific records. Exact lifetime reread counts and fully reconciled reading-time totals are unavailable when sources do not provide that evidence.
