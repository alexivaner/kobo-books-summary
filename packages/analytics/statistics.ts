import { type Library, type Book, readingLibrary } from "../core";
import { groupBooks } from "../core/grouping";
import {
  recordedSessions,
  dayKey,
  isTimed,
  combinedTime,
  bookTime,
  combineIntervals,
} from "./rhythm";
import { readingTimeline } from "./timeline";
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
  estimated: boolean;
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
  const timeline = readingTimeline(shelf, source);
  const books = shelf.books.filter(
      (b) => source === "all" || b.source === source,
    ),
    ids = new Set(books.map((b) => b.id));
  const all = recordedSessions(shelf).filter((s) => ids.has(s.bookId));
  const records = all.filter((s) => inPeriod(s.start, period)),
    timed = records.filter(isTimed);
  const entries = timeline.entries.filter((s) => inPeriod(s.start, period));
  const groups = groupBooks(books),
    rows: BookStatistic[] = [];
  const canonical = new Map(
    groups.flatMap((g) => g.members.map((b) => [b.id, g.book.id] as const)),
  );
  const activityKey = (s: (typeof records)[number]) =>
    `${canonical.get(s.bookId)}|${dayKey(s.start)}`;
  const timedDays = new Set(
    entries.map((s) => `${canonical.get(s.bookId)}|${dayKey(s.start)}`),
  );
  const completionDates = (b: Book) => [
    ...(b.readingHistory?.completedDates || []),
    ...(b.finishedAt ? [b.finishedAt] : []),
  ];
  for (const group of groups) {
    const members = new Set(group.members.map((b) => b.id)),
      events = records.filter((s) => members.has(s.bookId));
    const intervals = entries.filter((s) => members.has(s.bookId));
    const time =
      period.year === null
        ? bookTime({ books: group.members, sessions: events })
        : (() => {
            const v = combineIntervals(group.members, intervals);
            return {
              seconds: intervals.length ? v.seconds : null,
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
    if (
      events.length ||
      intervals.length ||
      (time.seconds ?? 0) > 0 ||
      finished
    )
      rows.push({
        book: group.book,
        seconds: time.seconds,
        minimum: time.minimum,
        days: new Set([...events, ...intervals].map((s) => dayKey(s.start)))
          .size,
        sessions: new Set(intervals.map((s) => s.id)).size,
        finished,
        lifetimeSeconds: lifetime.seconds,
        // A lifetime counter cannot be allocated using event/annotation dates.
        unallocatedSeconds: Math.max(
          0,
          (lifetime.seconds ?? 0) - dated.seconds,
        ),
        estimated: period.year !== null && intervals.some((s) => s.estimated),
      });
  }
  const time =
    period.year === null
      ? bookTime({ books, sessions: all })
      : (() => {
          const v = combineIntervals(books, entries);
          return {
            seconds: entries.length ? v.seconds : null,
            minimum: v.overlaps,
          };
        })();
  const years = [
    ...new Set([
      ...all.map((s) => Number(dayKey(s.start)!.slice(0, 4))),
      ...timeline.entries.map((s) => Number(dayKey(s.start)!.slice(0, 4))),
      ...books.flatMap((b) =>
        completionDates(b)
          .map((d) => dayKey(d))
          .filter((k): k is string => !!k)
          .map((k) => Number(k.slice(0, 4))),
      ),
    ]),
  ].sort((a, b) => b - a);
  const unallocatedSeconds = rows.reduce((n, r) => n + r.unallocatedSeconds, 0);
  const incompleteTime =
    period.year !== null &&
    (unallocatedSeconds > 0 ||
      records.some((s) => !isTimed(s) && !timedDays.has(activityKey(s))));
  return {
    period,
    source,
    seconds: time.seconds,
    minimum: time.minimum,
    activeDays: new Set([...records, ...entries].map((s) => dayKey(s.start)))
      .size,
    books: rows.length,
    finished: rows.filter((r) => r.finished).length,
    sessions: new Set(entries.map((s) => s.id)).size,
    estimated: period.year !== null && entries.some((s) => s.estimated),
    measuredSeconds: timed.length
      ? combinedTime({ books, sessions: timed }).seconds
      : null,
    undatedBooks: rows.filter((r) => r.seconds === null).length,
    unallocatedSeconds,
    incompleteTime,
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
