import { type Library, type Session, stableId } from "../core";
import { groupBooks } from "../core/grouping";
export function dayKey(value: string): string | null {
  const d = new Date(value);
  if (
    !Number.isFinite(d.getTime()) ||
    d.getFullYear() < 1900 ||
    d.getFullYear() > 9999
  )
    return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const isTimed = (s: Session) =>
  !["reader-event", "last-read", "annotation"].includes(s.evidence || "") &&
  s.duration > 0;
export function recordedSessions(
  library: Pick<Library, "sessions"> & Partial<Pick<Library, "annotations">>,
): Session[] {
  const annotationDates: Session[] = (library.annotations || [])
    .filter((a) => a.created && dayKey(a.created))
    .map((a) => ({
      id: stableId(a.bookId, "annotation-created", a.id, a.created!),
      bookId: a.bookId,
      start: a.created!,
      duration: 0,
      kind: "recorded",
      evidence: "annotation",
    }));
  return [
    ...new Map(
      [...library.sessions, ...annotationDates]
        .filter(
          (s) =>
            !!dayKey(s.start) &&
            Number.isFinite(s.duration) &&
            s.duration >= 0 &&
            (isTimed(s) ||
              ["reader-event", "last-read", "annotation"].includes(
                s.evidence || "",
              )),
        )
        .map((s) => [s.id, s]),
    ).values(),
  ];
}
export function readingDays(
  library: Pick<Library, "sessions"> & Partial<Pick<Library, "annotations">>,
) {
  const days = new Map<string, { seconds: number; sessions: Session[] }>();
  for (const s of recordedSessions(library)) {
    const key = dayKey(s.start)!,
      day = days.get(key) || { seconds: 0, sessions: [] };
    if (isTimed(s)) day.seconds += s.duration;
    day.sessions.push(s);
    days.set(key, day);
  }
  return days;
}
/** A lower bound: retain each reader's full records, but overlapping readers do
 * not manufacture a larger total. Non-overlapping timed windows can be added;
 * for overlapping windows take the largest active-time counter in that cluster.
 */
export function combinedTime(library: Pick<Library, "books" | "sessions">) {
  const member = new Map(
    groupBooks(library.books).flatMap((g) =>
      g.members.map((b) => [b.id, g.book.id] as const),
    ),
  );
  const byBook = new Map<string, Session[]>();
  for (const s of recordedSessions(library).filter(isTimed)) {
    const key = member.get(s.bookId) || s.bookId;
    byBook.set(key, [...(byBook.get(key) || []), s]);
  }
  let seconds = 0,
    overlaps = false;
  for (const sessions of byBook.values()) {
    const ordered = sessions
      .map((s) => ({
        s,
        start: Date.parse(s.start),
        end: Math.max(
          Date.parse(s.start) + s.duration * 1000,
          Date.parse(s.end || s.start),
        ),
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    let end = -Infinity,
      active = 0;
    for (const item of ordered) {
      if (item.start < end) {
        overlaps = true;
        end = Math.max(end, item.end);
        active = Math.max(active, item.s.duration);
      } else {
        seconds += active;
        end = item.end;
        active = item.s.duration;
      }
    }
    seconds += active;
  }
  return { seconds, overlaps };
}
export function bookTime(library: Pick<Library, "books" | "sessions">) {
  let seconds = 0,
    known = false,
    minimum = false;
  const sessions = recordedSessions(library).filter(isTimed);
  for (const group of groupBooks(library.books)) {
    const ids = new Set(group.members.map((b) => b.id));
    const counters = group.members
      .map((b) => b.duration)
      .filter((n): n is number => n !== null && Number.isFinite(n) && n >= 0);
    const timed = combinedTime({
      books: group.members,
      sessions: sessions.filter((s) => ids.has(s.bookId)),
    });
    if (!counters.length && !timed.seconds) continue;
    known = true;
    seconds += Math.max(0, ...counters, timed.seconds);
    minimum ||=
      timed.overlaps ||
      new Set(
        group.members.filter((b) => b.duration !== null).map((b) => b.source),
      ).size > 1;
  }
  return { seconds: known ? seconds : null, minimum };
}
