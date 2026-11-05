import { it, expect } from "vitest";
import { emptyLibrary, type Book, type Session } from "../packages/core";
import {
  reconstructKoboSessions,
  koboSessionDays,
} from "../packages/analytics/kobo-sessions";
import { bookTime } from "../packages/analytics/rhythm";
const book: Book = {
  id: "b",
  source: "kobo",
  sourceId: "b",
  deviceId: "test",
  title: "Synthetic book",
  author: "Synthetic author",
  progress: 0,
  status: "reading",
  lastRead: null,
  finishedAt: null,
  duration: 3600,
  durationKind: "recorded",
  collections: [],
};
const event = (id: string, start: string, ...types: number[]): Session => ({
  id,
  bookId: "b",
  start,
  duration: 0,
  kind: "recorded",
  evidence: "reader-event",
  koboEventTypes: types,
});
it("reconstructs deduplicated paired events without changing measured time or lifetime totals", () => {
  const a = event("a", "2026-10-01T10:00:00Z", 1020),
    b = event("b", "2026-10-01T10:30:00Z", 1021);
  const library = {
    ...emptyLibrary,
    books: [book],
    sessions: [a, b, a, { ...b, id: "copy" }],
  };
  const result = reconstructKoboSessions(library);
  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0].seconds).toBe(1800);
  expect(result.skipped).toBe(0);
  expect(bookTime(library).seconds).toBe(3600);
  expect(library.sessions.every((s) => s.duration === 0)).toBe(true);
});
it("rejects missing, repeated, simultaneous and overlong endpoints, without guessing", () => {
  const sessions = [
    event("a", "2026-10-01T10:00:00Z", 1021),
    event("b", "2026-10-01T11:00:00Z", 1020),
    event("c", "2026-10-01T11:01:00Z", 1020),
    event("d", "2026-10-01T11:30:00Z", 1021),
    event("e", "2026-10-01T12:00:00Z", 1020, 1021),
    event("f", "2026-10-02T10:00:00Z", 1020),
    event("g", "2026-10-02T15:00:00Z", 1021),
    event("h", "2026-10-03T10:00:00Z", 1020),
  ];
  const result = reconstructKoboSessions({
    ...emptyLibrary,
    books: [book],
    sessions,
  });
  expect(result.sessions).toEqual([]);
  expect(result.skipped).toBeGreaterThan(0);
  expect(
    reconstructKoboSessions({
      ...emptyLibrary,
      books: [{ ...book, source: "kobalt" }],
      sessions,
    }).typedEvents,
  ).toBe(0);
});
it("splits cross-midnight elapsed time by local date and conserves duration", () => {
  const start = new Date(2026, 9, 1, 23, 45).toISOString(),
    end = new Date(2026, 9, 2, 0, 15).toISOString();
  const result = reconstructKoboSessions({
    ...emptyLibrary,
    books: [book],
    sessions: [event("a", start, 1020), event("b", end, 1021)],
  });
  const days = koboSessionDays(result.sessions);
  expect(days.map((d) => [d.day, d.seconds])).toEqual([
    ["2026-10-01", 900],
    ["2026-10-02", 900],
  ]);
});
it("excludes overlapping book intervals on one device while allowing separate devices", () => {
  const other = { ...book, id: "other", sourceId: "other" };
  const sessions = [
    event("a", "2026-10-01T10:00:00Z", 1020),
    event("b", "2026-10-01T10:30:00Z", 1021),
    { ...event("c", "2026-10-01T10:10:00Z", 1020), bookId: "other" },
    { ...event("d", "2026-10-01T10:20:00Z", 1021), bookId: "other" },
  ];
  expect(
    reconstructKoboSessions({ ...emptyLibrary, books: [book, other], sessions })
      .sessions,
  ).toHaveLength(0);
  expect(
    reconstructKoboSessions({
      ...emptyLibrary,
      books: [book, { ...other, deviceId: "second-device" }],
      sessions,
    }).sessions,
  ).toHaveLength(2);
});
