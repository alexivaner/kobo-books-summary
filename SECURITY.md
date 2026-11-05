# Security and privacy

Please report vulnerabilities privately to the maintainer through an appropriate private GitHub channel. Do not publish a real user's reading database, highlights or credentials in an issue.

Reading data is processed in a worker and persisted inside the browser origin/profile. It is not encrypted with an application-specific password. Browser data deletion can erase it, so keep portable backups. The application has no account system, telemetry, annotation upload endpoint or mandatory remote database.

Open Library lookup is manual by default and disclosed before use. Enabling automatic enrichment authorizes grouped reading-library metadata requests, with conservative matching, bounded responses, local caching and provider backoff. Only the selected book's ISBN or title/author is sent to the provider. Responses are bounded, validated, and cached privately on the device. Store previews/catalog records are excluded from automatic lookup; no unbounded cover corpus harvesting is implemented.

Source files are untrusted. SQLite integrity checks, bounded Lua parsing without execution, validated import records and backups, transactional commits, one-writer locking, and a restrictive content security policy reduce risk. Limits and browser-specific verification are documented in `docs/IMPLEMENTATION.md`.
