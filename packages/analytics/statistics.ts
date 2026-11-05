import { type Library, type Book, readingLibrary } from "../core";
import { groupBooks } from "../core/grouping";
import {
  recordedSessions,
  dayKey,
  isTimed,
  combinedTime,
  bookTime,
} from "./rhythm";
export type Period = { year: number | null; month: number | null };
export type BookStatistic = {
  book: Book;
  seconds: number | null;
  minimum: boolean;
  days: number;
  sessions: number;
  finished: boolean;
  lifetimeSeconds: number | null;
  unallocatedSeconds: number;
};
export function inPeriod(value: string, period: Period) {
  const key = dayKey(value);
  if (!key) return false;
  return (
    (period.year === null || Number(key.slice(0, 4)) === period.year) &&
    (period.month === null || Number(key.slice(5, 7)) === period.month)
  );
}
export function readingStatistics(
  input: Library,
  period: Period,
  source = "all",
) {
  const shelf = readingLibrary(input);
  const books = shelf.books.filter(
      (b) => source === "all" || b.source === source,
    ),
    ids = new Set(books.map((b) => b.id));
  const all = recordedSessions(shelf).filter((s) => ids.has(s.bookId));
  const records = all.filter((s) => inPeriod(s.start, period)),
    timed = records.filter(isTimed);
  const groups = groupBooks(books),
    rows: BookStatistic[] = [];
  const completionDates = (b: Book) => [
    ...(b.readingHistory?.completedDates || []),
    ...(b.finishedAt ? [b.finishedAt] : []),
  ];
  for (const group of groups) {
    const members = new Set(group.members.map((b) => b.id)),
      events = records.filter((s) => members.has(s.bookId));
    const time =
      period.year === null
        ? bookTime({ books: group.members, sessions: events })
        : (() => {
            const v = combinedTime({ books: group.members, sessions: events });
            return {
              seconds: events.some(isTimed) ? v.seconds : null,
              minimum: v.overlaps,
            };
          })();
    const lifetime = bookTime({
      books: group.members,
      sessions: all.filter((s) => members.has(s.bookId)),
    });
    const dated = combinedTime({
      books: group.members,
      sessions: all.filter((s) => members.has(s.bookId)),
    });
    const finished =
      period.year === null
        ? group.members.some(
            (b) =>
              b.readingHistory?.everFinished ||
              b.status === "finished" ||
              completionDates(b).length > 0,
          )
        : group.members.some((b) =>
            completionDates(b).some((d) => inPeriod(d, period)),
          );
    if (events.length || (time.seconds ?? 0) > 0 || finished)
      rows.push({
        book: group.book,
        seconds: time.seconds,
        minimum: time.minimum,
        days: new Set(events.map((s) => dayKey(s.start))).size,
        sessions: events.filter(isTimed).length,
        finished,
        lifetimeSeconds: lifetime.seconds,
        // A lifetime counter cannot be allocated using event/annotation dates.
        unallocatedSeconds: Math.max(
          0,
          (lifetime.seconds ?? 0) - dated.seconds,
        ),
      });
  }
  const time =
    period.year === null
      ? bookTime({ books, sessions: all })
      : (() => {
          const v = combinedTime({ books, sessions: records });
          return {
            seconds: timed.length ? v.seconds : null,
            minimum: v.overlaps,
          };
        })();
  const years = [
    ...new Set([
      ...all.map((s) => Number(dayKey(s.start)!.slice(0, 4))),
      ...books.flatMap((b) =>
        completionDates(b)
          .map((d) => dayKey(d))
          .filter((k): k is string => !!k)
          .map((k) => Number(k.slice(0, 4))),
      ),
    ]),
  ].sort((a, b) => b - a);
  return {
    period,
    source,
    seconds: time.seconds,
    minimum: time.minimum,
    activeDays: new Set(records.map((s) => dayKey(s.start))).size,
    books: rows.length,
    finished: rows.filter((r) => r.finished).length,
    sessions: timed.length,
    undatedBooks: rows.filter((r) => r.seconds === null).length,
    unallocatedSeconds: rows.reduce((n, r) => n + r.unallocatedSeconds, 0),
    rows,
    years,
  };
}
export function periodLabel(period: Period) {
  if (period.year === null) return "All-time reading";
  return period.month === null
    ? String(period.year)
    : new Date(period.year, period.month - 1, 15).toLocaleDateString(
        undefined,
        { month: "long", year: "numeric" },
      );
}
export type ReadingStatistics = ReturnType<typeof readingStatistics>;
export function rankBooks(rows: BookStatistic[], by: "days" | "time") {
  return [...rows].sort((a, b) =>
    by === "time"
      ? (b.seconds ?? -1) - (a.seconds ?? -1) ||
        b.days - a.days ||
        a.book.title.localeCompare(b.book.title)
      : b.days - a.days ||
        (b.seconds ?? -1) - (a.seconds ?? -1) ||
        a.book.title.localeCompare(b.book.title),
  );
}
