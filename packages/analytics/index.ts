import type { Library } from "../core";
import { readingDays, bookTime, combinedTime } from "./rhythm";
import { groupBooks } from "../core/grouping";
import { personalNoteText } from "../knowledge";
export function analytics(library: Library) {
  const active = library.annotations.filter((a) => !a.sourceDeleted);
  const groups = groupBooks(library.books).map((g) => g.book);
  const totalTime = bookTime(library);
  const activity = new Map(
    [...readingDays(library)].map(([day, value]) => [
      day,
      combinedTime({ books: library.books, sessions: value.sessions }).seconds,
    ]),
  );
  return {
    total: groups.length,
    everFinished: groups.filter(
      (b) => b.readingHistory?.everFinished || b.status === "finished",
    ).length,
    rereading: groups.filter(
      (b) =>
        b.readingHistory?.rereadingEvidence &&
        b.readingHistory.rereadingEvidence !== "none",
    ).length,
    finished: groups.filter((b) => b.status === "finished").length,
    reading: groups.filter((b) => b.status === "reading").length,
    highlights: active.filter(
      (a) => a.text && a.kind !== "bookmark" && a.kind !== "note",
    ).length,
    notes: active.filter((a) => !!personalNoteText(a)).length,
    duration: totalTime.seconds,
    durationIsMinimum: totalTime.minimum,
    activity,
  };
}
export const duration = (n: number | null) => {
  if (n === null) return "Unavailable";
  if (n > 0 && n < 60) return `${Math.max(1, Math.round(n))} sec`;
  const minutes = Math.round(n / 60);
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};
