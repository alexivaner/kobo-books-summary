/** Opt-in hardware validation; private fixtures stay outside the repository. */
import { it, expect } from "vitest";
import initSqlJs from "sql.js";
import { createRequire } from "node:module";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { discover } from "../packages/importers";
import { readingLibrary } from "../packages/core";
import { Store } from "../packages/storage";
import { readingStatistics } from "../packages/analytics/statistics";
import { readingTimeline } from "../packages/analytics/timeline";
import {
  reconstructKoboSessions,
  koboSessionDays,
} from "../packages/analytics/kobo-sessions";
it.skipIf(!process.env.KOBO_PRIVATE_FIXTURES)(
  "imports real device snapshots without exposing annotation content",
  async () => {
    const root = process.env.KOBO_PRIVATE_FIXTURES!;
    const files: { path: string; bytes: Uint8Array }[] = [];
    async function walk(dir: string) {
      for (const f of await readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) await walk(p);
        else
          files.push({
            path: path.relative(root, p),
            bytes: new Uint8Array(await readFile(p)),
          });
      }
    }
    await walk(root);
    const require = createRequire(import.meta.url);
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const preview = await discover(SQL, files, "Clara Colour validation");
    expect(
      preview.diagnostics.every((d) =>
        /Recovered .*book placeholders|Cover unavailable for|Kobalt integrity check failed|Kobalt recovery:/.test(
          d,
        ),
      ),
    ).toBe(true);
    expect(preview.books.length).toBeGreaterThan(0);
    expect(preview.sources).toContain("Kobo");
    expect(preview.sources).toContain("KOReader statistics");
    expect(preview.sources).toContain("KOReader sidecars");
    const store = new Store(SQL);
    store.commit(preview);
    const first = store.library("test");
    store.commit(preview);
    const next = new Store(SQL, store.bytes()).library("test");
    expect(next.books.length).toBe(first.books.length);
    expect(next.annotations.length).toBe(first.annotations.length);
    const reconstructed = reconstructKoboSessions(next);
    const months = [
      ...new Set(
        [...readingTimeline(next).days.keys()].map((d) => d.slice(0, 7)),
      ),
    ].sort();
    await writeFile(
      "/private/tmp/kobo-validation-summary.json",
      JSON.stringify({
        books: next.books.length,
        readingBooks: readingLibrary(next).books.length,
        storeRecords: next.books.length - readingLibrary(next).books.length,
        kobaltBooks: next.books.filter((b) => b.source === "kobalt").length,
        kobaltAnnotations: next.annotations.filter((a) => a.source === "kobalt")
          .length,
        annotations: next.annotations.length,
        recordedIntervals: next.sessions.length,
        unifiedMonths: Object.fromEntries(
          months.map((month) => {
            const [year, m] = month.split("-").map(Number);
            const stats = readingStatistics(next, { year, month: m });
            return [
              month,
              {
                seconds: stats.seconds,
                estimated: stats.estimated,
                activeDays: stats.activeDays,
              },
            ];
          }),
        ),
        reconstructedKoboSessions: reconstructed.sessions.length,
        reconstructedKoboElapsedSeconds: reconstructed.sessions.reduce(
          (n, s) => n + s.seconds,
          0,
        ),
        reconstructedKoboByMonth: Object.fromEntries(
          [
            ...new Set(
              koboSessionDays(reconstructed.sessions).map((s) =>
                s.day.slice(0, 7),
              ),
            ),
          ].map((month) => [
            month,
            koboSessionDays(reconstructed.sessions)
              .filter((s) => s.day.startsWith(month))
              .reduce((n, s) => n + s.seconds, 0),
          ]),
        ),
        sources: preview.sources,
        diagnostics: preview.diagnostics.length,
      }),
    );
  },
);
