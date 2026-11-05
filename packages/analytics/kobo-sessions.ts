import { type Library, stableId, readingLibrary } from "../core";
import { recordedSessions, dayKey } from "./rhythm";

export type KoboSessionEstimate = {
  id: string;
  bookId: string;
  start: string;
  end: string;
  seconds: number;
};
/** Derived elapsed intervals, never measured active reading or persisted sessions.
 * 1020/1021 are reverse-engineered read-start/read-end events. Reject ambiguous
 * sequences and intervals over four hours rather than filling gaps or scaling
 * a book's lifetime counter onto dates.
 */
export function reconstructKoboSessions(library: Library) {
  library = readingLibrary(library);
  const ids = new Set(
    library.books.filter((b) => b.source === "kobo").map((b) => b.id),
  );
  const byBook = new Map<string, Map<number, Set<number>>>();
  let typedEvents = 0,
    skipped = 0;
  for (const record of recordedSessions(library)) {
    if (!ids.has(record.bookId) || record.evidence !== "reader-event") continue;
    const types = (record.koboEventTypes || []).filter(
      (t) => t === 1020 || t === 1021,
    );
    if (!types.length) continue;
    const events = byBook.get(record.bookId) || new Map<number, Set<number>>();
    const stamp = Date.parse(record.start);
    const at = events.get(stamp) || new Set<number>();
    for (const type of types) at.add(type);
    events.set(stamp, at);
    byBook.set(record.bookId, events);
  }
  const sessions: KoboSessionEstimate[] = [];
  for (const [bookId, events] of byBook) {
    let pending: number | null = null,
      ambiguous = false;
    for (const [time, types] of [...events].sort(([a], [b]) => a - b)) {
      typedEvents += types.size;
      if (types.size > 1) {
        skipped += types.size + (pending === null ? 0 : 1);
        pending = null;
        ambiguous = false;
      } else if (types.has(1020)) {
        if (pending !== null) {
          skipped++;
          ambiguous = true;
        }
        pending = time;
      } else {
        const elapsed = pending === null ? 0 : (time - pending) / 1000;
        if (
          pending !== null &&
          !ambiguous &&
          elapsed > 0 &&
          elapsed <= 4 * 3600
        ) {
          sessions.push({
            id: stableId(bookId, "kobo-elapsed", pending, time),
            bookId,
            start: new Date(pending).toISOString(),
            end: new Date(time).toISOString(),
            seconds: elapsed,
          });
        } else skipped += pending === null ? 1 : 2;
        pending = null;
        ambiguous = false;
      }
    }
    if (pending !== null) skipped++;
  }
  const devices = new Map(library.books.map((b) => [b.id, b.deviceId]));
  const byDevice = new Map<string, KoboSessionEstimate[]>();
  for (const s of sessions) {
    const device = devices.get(s.bookId)!;
    byDevice.set(device, [...(byDevice.get(device) || []), s]);
  }
  const accepted: KoboSessionEstimate[] = [];
  for (const deviceSessions of byDevice.values()) {
    let cluster: KoboSessionEstimate[] = [],
      end = -Infinity;
    const flush = () => {
      if (cluster.length === 1) accepted.push(cluster[0]);
      else skipped += cluster.length * 2;
    };
    for (const s of deviceSessions.sort((a, b) =>
      a.start.localeCompare(b.start),
    )) {
      if (Date.parse(s.start) >= end) {
        flush();
        cluster = [];
      }
      cluster.push(s);
      end = Math.max(end, Date.parse(s.end));
    }
    flush();
  }
  return {
    sessions: accepted.sort((a, b) => a.start.localeCompare(b.start)),
    typedEvents,
    skipped,
  };
}
/** Split elapsed estimates at browser-local midnight, including DST boundaries. */
export function koboSessionDays(sessions: KoboSessionEstimate[]) {
  return sessions.flatMap((session) => {
    const parts: (KoboSessionEstimate & { day: string })[] = [];
    let at = Date.parse(session.start);
    const end = Date.parse(session.end);
    while (at < end) {
      const midnight = new Date(at);
      midnight.setHours(24, 0, 0, 0);
      const until = Math.min(end, +midnight);
      if (until <= at) break;
      parts.push({
        ...session,
        start: new Date(at).toISOString(),
        end: new Date(until).toISOString(),
        seconds: (until - at) / 1000,
        day: dayKey(new Date(at).toISOString())!,
      });
      at = until;
    }
    return parts;
  });
}
