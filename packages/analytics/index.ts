import type { Library } from "../core";
import { readingDays } from "./rhythm";
import { personalNoteText } from "../knowledge";
export function analytics(library: Library) {
  const active = library.annotations.filter((a) => !a.sourceDeleted);
  const durations = library.books
    .map((b) => b.duration)
    .filter((d): d is number => d !== null);
  const activity = new Map(
    [...readingDays(library)].map(([day, value]) => [day, value.seconds]),
  );
  return {
    total: library.books.length,
    everFinished: library.books.filter(
      (b) => b.readingHistory?.everFinished || b.status === "finished",
    ).length,
    rereading: library.books.filter(
      (b) =>
        b.readingHistory?.rereadingEvidence &&
        b.readingHistory.rereadingEvidence !== "none",
    ).length,
    finished: library.books.filter((b) => b.status === "finished").length,
    reading: library.books.filter((b) => b.status === "reading").length,
    highlights: active.filter(
      (a) => a.text && a.kind !== "bookmark" && a.kind !== "note",
    ).length,
    notes: active.filter((a) => !!personalNoteText(a)).length,
    duration: durations.length ? durations.reduce((a, b) => a + b, 0) : null,
    activity,
  };
}
export const duration = (n: number | null) =>
  n === null
    ? "Unavailable"
    : n < 3600
      ? `${Math.round(n / 60)} min`
      : `${Math.floor(n / 3600)}h ${Math.round((n % 3600) / 60)}m`;
