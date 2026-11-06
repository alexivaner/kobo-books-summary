import { it, expect } from "vitest";
import { emptyLibrary, type Book, type Session } from "../packages/core";
import { readingTimeline } from "../packages/analytics/timeline";
import { readingStatistics } from "../packages/analytics/statistics";
const book: Book = {
  id: "native",
  source: "kobo",
  sourceId: "native",
  deviceId: "test",
  path: "same.epub",
  title: "Synthetic book",
  author: "Synthetic author",
  progress: 10,
  status: "reading",
  lastRead: null,
  finishedAt: null,
  duration: 3600,
  durationKind: "recorded",
  collections: [],
};
const event = (id: string, start: string, type: number): Session => ({
  id,
  bookId: book.id,
  start,
  duration: 0,
  kind: "recorded",
  evidence: "reader-event",
  koboEventTypes: [type],
});
const base = {
  ...emptyLibrary,
  books: [
    book,
    { ...book, id: "other", sourceId: "other", source: "koreader" as const },
  ],
  sessions: [
    event("open", "2026-09-21T10:00:00Z", 1020),
    event("close", "2026-09-21T10:30:00Z", 1021),
    {
      id: "measured",
      bookId: "other",
      start: "2026-09-21T10:10:00Z",
      end: "2026-09-21T10:20:00Z",
      duration: 600,
      kind: "recorded" as const,
    },
  ],
};
it("unifies measured and reconstructed time without counting the same grouped book twice", () => {
  const timeline = readingTimeline(base);
  expect(timeline.days.values().next().value?.seconds).toBe(1800);
  expect(
    timeline.entries
      .filter((s) => s.estimated)
      .reduce((n, s) => n + s.duration, 0),
  ).toBe(1200);
  const stats = readingStatistics(base, { year: 2026, month: 9 });
  expect(stats.seconds).toBe(1800);
  expect(stats.estimated).toBe(true);
  expect(stats.measuredSeconds).toBe(600);
  expect(readingStatistics(base, { year: null, month: null }).seconds).toBe(
    3600,
  );
  expect(
    readingTimeline(base, "koreader").entries.every((s) => !s.estimated),
  ).toBe(true);
  expect(
    readingStatistics(base, { year: 2026, month: 9 }, "kobo").seconds,
  ).toBe(1800);
});
it("keeps activity-only earlier months navigable without inventing hours", () => {
  const library = {
    ...base,
    sessions: [
      ...base.sessions,
      {
        id: "august",
        bookId: book.id,
        start: "2026-08-14T12:00:00Z",
        duration: 0,
        kind: "recorded" as const,
        evidence: "annotation" as const,
      },
    ],
  };
  const timeline = readingTimeline(library);
  expect(timeline.days.get("2026-08-14")?.seconds).toBeNull();
  const stats = readingStatistics(library, { year: 2026, month: 8 });
  expect(stats.activeDays).toBe(1);
  expect(stats.seconds).toBeNull();
});
it("assigns cross-month reconstruction to both local calendar dates", () => {
  const a = new Date(2026, 8, 30, 23, 50).toISOString(),
    b = new Date(2026, 9, 1, 0, 10).toISOString();
  const library = {
    ...emptyLibrary,
    books: [book],
    sessions: [event("a", a, 1020), event("b", b, 1021)],
  };
  expect(readingStatistics(library, { year: 2026, month: 9 }).seconds).toBe(
    600,
  );
  expect(readingStatistics(library, { year: 2026, month: 10 }).seconds).toBe(
    600,
  );
  expect(readingTimeline(library).days.size).toBe(2);
});
