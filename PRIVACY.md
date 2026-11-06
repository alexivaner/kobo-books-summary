# Privacy

Readmory parses selected Kobo, KOReader and Kobalt files in your browser. Imported databases, annotations, reading history, notes and reflections are not uploaded to this project's server. There is no account, application cloud database, analytics tracker or payment backend.

Your library is saved in browser storage using SQLite WASM with OPFS, or IndexedDB when OPFS is unavailable. The same browser profile and website origin are required to reopen it. Clearing site data, private browsing, storage eviction or device loss can remove it. Download portable backups regularly and protect them: they contain your private reading information. Switching domains or profiles requires explicit backup/restore; the application does not transfer data automatically.

Optional Open Library cover/metadata lookup sends book titles/authors or ISBNs directly to openlibrary.org and downloads images from covers.openlibrary.org, which can redirect to Internet Archive image storage at archive.org and us.archive.org. It is off by default. Enabling automatic lookup also includes future reading-library imports; store previews are excluded. Highlights, notes and reflections are not included. Results are cached locally. Disabling lookup stops future automatic requests; it cannot recall requests already received by the provider. See [Open Library's privacy policy](https://openlibrary.org/privacy).

The website hosting provider receives normal web requests, including IP address and technical request information, when serving the app. This is distinct from uploading your reading library. GitHub and Ko-fi receive visits only when you follow their links; no embedded donation widget is used. Their own privacy policies apply.

The repository contains synthetic examples only. Do not attach a real database, exported backup or private screenshot to public issues. See SECURITY.md for reporting a vulnerability.

The optional support reminder stores only its next-eligible timestamp in this browser under `readmory-support-remind-after`. It counts visible eligible use in session memory, appears at most once every 30 days, and sends no reading data or usage telemetry to Ko-fi. Support links open Ko-fi only when clicked.
