import { it, expect } from "vitest";
import {
  emptyLibrary,
  type Book,
  type Library,
  type Session,
} from "../packages/core";
import { readingStatistics, rankBooks } from "../packages/analytics/statistics";
const book = (
  id: string,
  source: Book["source"],
  path = id + ".epub",
): Book => ({
  id,
  source,
  sourceId: id,
  deviceId: "test",
  path,
  title: id,
  author: "Synthetic author",
  progress: 20,
  status: "reading",
  lastRead: null,
  finishedAt: null,
  duration: null,
  durationKind: "unavailable",
  collections: [],
});
const session = (
  id: string,
  bookId: string,
  start: string,
  duration: number,
): Session => ({ id, bookId, start, duration, kind: "recorded" });
function fixture(): Library {
  const native = {
    ...book("a", "kobo", "same.epub"),
    duration: 7200,
    durationKind: "recorded" as const,
    status: "finished" as const,
  };
  const kobalt = {
    ...book("k", "kobalt", "same.epub"),
    duration: 600,
    durationKind: "recorded" as const,
  };
  const other = {
    ...book("b", "koreader"),
    duration: 300,
    durationKind: "recorded" as const,
    finishedAt: "2025-12-31T12:00:00Z",
  };
  const preview = {
    ...book("preview", "kobo"),
    libraryKind: "preview" as const,
    duration: 9999999,
  };
  const timed = session("s", "k", "2026-10-10T12:00:00Z", 600);
  return {
    ...emptyLibrary,
    books: [native, kobalt, other, preview],
    sessions: [
      timed,
      timed,
      {
        ...session("date", "a", "2026-10-11T12:00:00Z", 0),
        evidence: "reader-event",
      },
      session("old", "b", "2025-12-31T12:00:00Z", 300),
      session("preview", "preview", "2026-10-12T12:00:00Z", 9999),
    ],
  };
}
it("keeps undated book totals out of annual and monthly hours, while counting native activity days", () => {
  const library = fixture(),
    all = readingStatistics(library, { year: null, month: null });
  expect(all.seconds).toBe(7500);
  expect(all.minimum).toBe(true);
  expect(all.books).toBe(2);
  expect(all.activeDays).toBe(3);
  const year = readingStatistics(library, { year: 2026, month: null });
  expect(year.seconds).toBe(600);
  expect(year.unallocatedSeconds).toBe(6600);
  expect(year.rows[0].lifetimeSeconds).toBe(7200);
  expect(year.sessions).toBe(1);
  expect(year.activeDays).toBe(2);
  expect(year.books).toBe(1);
  expect(
    readingStatistics(library, { year: 2026, month: 9 }).seconds,
  ).toBeNull();
  const native = readingStatistics(library, { year: 2026, month: 10 }, "kobo");
  expect(native.seconds).toBeNull();
  expect(native.unallocatedSeconds).toBe(7200);
  expect(native.activeDays).toBe(1);
  expect(year.years).toEqual([2026, 2025]);
});
it("counts only dated completions inside a period and preserves undated finishes in all-time totals", () => {
  const lib = fixture();
  expect(readingStatistics(lib, { year: null, month: null }).finished).toBe(2);
  expect(readingStatistics(lib, { year: 2026, month: null }).finished).toBe(0);
  expect(readingStatistics(lib, { year: 2025, month: 12 }).finished).toBe(1);
});
it("keeps a lifetime book counter separate from another book's short monthly session", () => {
  const library: Library = {
    ...emptyLibrary,
    books: [
      {
        ...book("long-book", "kobo"),
        duration: 53959,
        durationKind: "recorded",
      },
      book("guide", "koreader"),
    ],
    sessions: [
      {
        ...session("activity", "long-book", "2026-10-20T12:00:00Z", 0),
        evidence: "reader-event",
      },
      session("short", "guide", "2026-10-29T12:00:00Z", 9),
    ],
  };
  const october = readingStatistics(library, { year: 2026, month: 10 });
  expect(october.seconds).toBe(9);
  expect(october.incompleteTime).toBe(true);
  expect(october.unallocatedSeconds).toBe(53959);
  const long = october.rows.find((r) => r.book.id === "long-book")!;
  expect(long.seconds).toBeNull();
  expect(long.lifetimeSeconds).toBe(53959);
  expect(readingStatistics(library, { year: null, month: null }).seconds).toBe(
    53968,
  );
});
it("marks activity-only book days as incomplete even without a lifetime counter", () => {
  const library: Library = {
    ...emptyLibrary,
    books: [book("one", "kobalt")],
    sessions: [
      session("timed", "one", "2026-10-01T12:00:00Z", 3600),
      {
        ...session("activity", "one", "2026-10-02T12:00:00Z", 0),
        evidence: "annotation",
      },
    ],
  };
  expect(
    readingStatistics(library, { year: 2026, month: 10 }).incompleteTime,
  ).toBe(true);
  library.sessions.pop();
  expect(
    readingStatistics(library, { year: 2026, month: 10 }).incompleteTime,
  ).toBe(false);
});
it("ranks frequency by distinct reading days rather than page-event volume", () => {
  const lib = fixture();
  lib.sessions.push(
    ...Array.from({ length: 20 }, (_, i) => ({
      ...session("p" + i, "b", "2025-12-31T12:00:00Z", 0),
      evidence: "reader-event" as const,
    })),
  );
  const rows = readingStatistics(lib, { year: null, month: null }).rows;
  expect(rankBooks(rows, "days")[0].book.title).toBe("a");
  expect(rankBooks(rows, "days")[0].days).toBe(2);
  expect(rankBooks(rows, "time")[0].seconds).toBe(7200);
  expect(rows).toHaveLength(2);
});
it("does not inflate same-book time with overlapping reader sessions", () => {
  const lib = fixture();
  lib.sessions.push(session("overlap", "a", "2026-10-10T12:00:00Z", 590));
  const result = readingStatistics(lib, { year: 2026, month: 10 });
  expect(result.seconds).toBe(600);
  expect(result.minimum).toBe(true);
  expect(result.sessions).toBe(2);
});
it("recovers pre-session annotation dates as activity without inventing reading hours", () => {
  const lib = fixture();
  lib.annotations = [
    {
      id: "old-note",
      bookId: "a",
      source: "kobo",
      sourceId: "old-note",
      text: "A synthetic earlier passage",
      note: "Synthetic personal note",
      location: "1",
      created: "2026-02-18T12:00:00Z",
      modified: null,
      sourceDeleted: false,
    },
  ];
  const feb = readingStatistics(lib, { year: 2026, month: 2 });
  expect(feb.activeDays).toBe(1);
  expect(feb.seconds).toBeNull();
  expect(feb.sessions).toBe(0);
  expect(feb.books).toBe(1);
  expect(feb.rows[0].days).toBe(1);
});
