import { type Library, readingLibrary } from "../core";
import { groupBooks } from "../core/grouping";
import { recordedSessions, isTimed, dayKey, combineIntervals } from "./rhythm";
import { reconstructKoboSessions, koboSessionDays } from "./kobo-sessions";
export type TimelineEntry = {
  id: string;
  bookId: string;
  start: string;
  end?: string;
  duration: number;
  estimated: boolean;
  startEstimated?: boolean;
};
/** View model only. Measured windows take precedence over reconstructed elapsed
 * windows for the same grouped book. No estimates are persisted as measurements.
 */
export function readingTimeline(input: Library, source = "all") {
  const shelf = readingLibrary(input);
  const books = shelf.books.filter(
    (b) => source === "all" || b.source === source,
  );
  const ids = new Set(books.map((b) => b.id));
  const canonical = new Map(
    groupBooks(books).flatMap((g) =>
      g.members.map((b) => [b.id, g.book.id] as const),
    ),
  );
  const activity = recordedSessions(shelf).filter((s) => ids.has(s.bookId));
  const measured = activity.filter(isTimed);
  const entries: TimelineEntry[] = measured.map((s) => ({
    ...s,
    estimated: false,
  }));
  const reconstruction = reconstructKoboSessions({ ...shelf, books });
  for (const estimate of reconstruction.sessions) {
    let windows: [number, number][] = [
      [Date.parse(estimate.start), Date.parse(estimate.end)],
    ];
    for (const s of measured) {
      if (canonical.get(s.bookId) !== canonical.get(estimate.bookId)) continue;
      const a = Date.parse(s.start),
        b = Math.max(a + s.duration * 1000, Date.parse(s.end || s.start));
      windows = windows.flatMap(([start, end]): [number, number][] =>
        b <= start || a >= end
          ? [[start, end]]
          : [
              ...(a > start ? [[start, a] as [number, number]] : []),
              ...(b < end ? [[b, end] as [number, number]] : []),
            ],
      );
    }
    for (const [start, end] of windows) {
      for (const part of koboSessionDays([
        {
          ...estimate,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          seconds: (end - start) / 1000,
        },
      ])) {
        entries.push({
          id: estimate.id,
          bookId: estimate.bookId,
          start: part.start,
          end: part.end,
          duration: part.seconds,
          estimated: true,
        });
      }
    }
  }
  entries.sort((a, b) => a.start.localeCompare(b.start));
  const days = new Map<
    string,
    {
      activity: typeof activity;
      entries: TimelineEntry[];
      seconds: number | null;
      estimated: boolean;
    }
  >();
  for (const s of activity) {
    const key = dayKey(s.start)!;
    const day = days.get(key) || {
      activity: [],
      entries: [],
      seconds: null,
      estimated: false,
    };
    day.activity.push(s);
    days.set(key, day);
  }
  for (const s of entries) {
    const key = dayKey(s.start)!;
    const day = days.get(key) || {
      activity: [],
      entries: [],
      seconds: null,
      estimated: false,
    };
    day.entries.push(s);
    day.estimated ||= s.estimated;
    days.set(key, day);
  }
  for (const day of days.values())
    if (day.entries.length)
      day.seconds = combineIntervals(books, day.entries).seconds;
  return { books, activity, entries, days, reconstruction };
}
