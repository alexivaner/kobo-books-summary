# Combining reading history

Readmory keeps Kobo, Kobalt and KOReader source records and shows them together in Reading rhythm. Grouped books preserve their source identities, notes and sessions. Source filters show each reader independently.

| Evidence | Imported from | Calendar behavior |
| --- | --- | --- |
| Native Kobo dated events | `Event.ExtraData` timestamp arrays, decoded from Qt binary maps | Reading activity, with no invented active duration |
| Dated annotations/bookmarks | Imported creation timestamps across readers | Annotation-date activity, with no invented duration |
| Native Kobo last-read date | `content.DateLastRead` | Last-read evidence, with unknown daily duration |
| Native Kobo measured sessions | `AnalyticsEvents.LeaveContent`, `Metrics.SecondsRead` | Recorded active time; start derived from end minus measured time and marked approximate |
| Native Kobo book counters | `TimeSpentReading`, `ExtraDataReadingSeconds` | Maximum known counter per book, kept out of daily time allocation |
| Kobalt sessions | `reading_sessions.started`, `observed`, `active_ms` | Recorded active duration and observed window; up to 1,000 ms of counter drift is accepted |
| KOReader intervals | `page_stat_data`, or legacy `page_stat` | Recorded page intervals, with second-level durations |

`Read` in the calendar means dated activity exists but its duration is unknown. Annotation creation dates also contribute to active days and are labeled separately from reader events; note and highlight text is never used in time calculations. This preserves earlier reading evidence even when older session logs are absent. Nine seconds stays nine seconds, rather than being rounded to zero minutes. Dates use the importing browser's time zone; timed sessions are assigned to their start date. Native timestamps without an explicit zone are interpreted as UTC. Unknown intervals are never filled with reading minutes.

## Matching and combining

Matching uses existing verified file paths/ISBNs or reversible manual grouping. KOReader statistics have a checksum identity; when that checksum matches sidecars with one unique same-device path, Readmory links the path while retaining all original ids. Title similarity alone does not merge unrelated books.

Duplicate session ids are counted once. Overlapping windows for the same matched book form clusters; each cluster contributes its largest recorded active duration. Separate windows add normally. This is a conservative lower bound, not a claim to know where active seconds fall within an idle-containing window. Original sessions remain visible, including their source and duration.

For all-time book totals, Readmory takes the largest known source counter or conservative dated-session total per matched book. It does not add an undated Kobo total to Kobalt/KOReader time that could already be represented in it. Multiple-reader/overlap results are labeled **At least**. The reader coverage panel exposes original source totals and available date ranges.

## Retention and limits

Reimports preserve source ids, dated records and known counters. A sparse later import does not erase an earlier known total. Repeated database snapshots are deduplicated. Backups include the optional evidence fields and remain compatible with schema-v1 exports.

Native analytics can be pruned during reader synchronization. Importing regularly preserves records already captured by Readmory, but cannot reconstruct unrecorded or deleted sessions. Native binary events and last-read dates are partial evidence, not a complete daily log. A firmware-reset diagnosis requires comparison with a pre-update database.

Store previews remain outside the default reading shelf and history; the existing store-record toggle includes them for inspection. Device files are read only. Readmory does not install database triggers, modify the Kobo, or upload private reading records.

## Verification and format references

Synthetic tests cover binary TEXT decoding, malformed payloads, copied-counter deduplication, measured native sessions, checksum linking, overlap handling, repeated imports, backup restoration, clock drift, mobile views and offline storage. Private connected-device validation stays outside the repository.

Primary implementation references: [KOReader statistics](https://github.com/koreader/koreader/blob/master/plugins/statistics.koplugin/main.lua), [Kobo analytics session fields](https://github.com/mfdaves/kobo-db-tools/blob/master/src/parser.rs), and [Kobo analytics retention and SecondsRead](https://github.com/sanderboom/kobo-sync#how-reading-time-is-calculated). The Qt subset decoder is an independent implementation, checked against synthetic fixtures and the connected device; unsupported variant types produce diagnostics rather than guessed values.

## Statistics and share cards

Statistics offers all-time, year, month and reader filters. All-time time keeps the conservative book-counter total. Year/month time combines measured sessions with reconstructed Kobo intervals and marks totals containing elapsed estimates with **≈**. Reading rhythm uses the same timeline in its calendar and date details. Measured windows take precedence: overlapping portions of a reconstructed interval for the same grouped book are removed, so they cannot double-count the measured session. Source filters apply before combining.

The calendar is the first main panel. Changing months selects the first active date in the destination month; activity-only months remain navigable and show `Read` with unavailable duration. Lifetime counters are never allocated to days. Date details group sessions by book and expose original clock intervals and measured/estimated labels. Routine reader coverage is collapsed below the calendar.

Unknown durations remain unknown. Period totals are the usable imported evidence, not a guarantee of exhaustive tracking. Dated completions belong to their recorded period; undated finished states count only in all-time finishes.

## Reconstructed Kobo session estimates

Reconstructed intervals feed the unified Statistics, monthly calendar and date details; there is no separate estimate panel. A fresh import preserves the original reader activity IDs and adds event-type metadata. Derived pairs use reverse-engineered read-start (1020) and read-end (1021) events; see [kobo-readstat's event definitions](https://github.com/timchurchard/kobo-readstat/blob/main/pkg/kobo-db.go). Missing, repeated, simultaneous, overlapping same-device and over-four-hour intervals are rejected. These limits are conservative product choices, not Kobo guarantees. Dates split at local midnight, accounting for daylight saving boundaries.

The resulting durations are **elapsed session estimates**, which may contain idle time. They never replace measured active seconds, inflate lifetime counters or allocate aggregate hours. Period share cards use the same combined total with an approximation mark and an explicit estimated-time caption. Clicking a calendar date shows its books, clock intervals and durations. Older imports need reimporting to retain the necessary event types; existing books, annotations, source identifiers and backups are preserved.

Share cards are generated locally on a 1080 × 1350 canvas using cached covers and selected statistics. They show the period, reader scope, recorded time, activity-day/book/finish counts and up to three top books. Users can omit covers and titles. Only those displayed fields are included; quotes, notes and reflections never enter the image. Download works offline; native sharing is invoked only by an explicit click, with PNG download as the unsupported-browser fallback. Nothing is published automatically.

## Import review

The save and cancel actions appear beside the review heading, before counts or diagnostic content. Detailed diagnostics, duplicate candidates and book lists are inside a closed review disclosure. Import history is collapsed separately. A brief visible warning remains when database integrity or companion-file problems cause a source to be skipped; collapsing details must not silently conceal source failures. Existing records absent from an import remain preserved.
