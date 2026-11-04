# Synthetic fixtures

Run `pnpm fixtures` to generate native Kobo and Kobalt SQLite databases plus a KOReader sidecar under `generated/`. The native fixture includes full books, an explicit store preview, and an untouched catalog entry to test scope filtering. The Kobalt fixture includes a highlight with a personal note, a bookmark and a millisecond reading session.

All names and quotations are synthetic and authored for testing. Generated SQLite files are ignored by Git and recreated from the tracked script. Unit tests also create databases and EPUB archives in memory to exercise schema variations. Never add private databases, exported libraries, copyrighted EPUBs or real annotations here.
