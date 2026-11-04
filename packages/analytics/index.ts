import type { Library } from "../core";
export function analytics(library: Library) {
  const active = library.annotations.filter((a) => !a.sourceDeleted);
  const durations = library.books
    .map((b) => b.duration)
    .filter((d): d is number => d !== null);
  const activity = new Map<string, number>();
  for (const s of library.sessions) {
    const day = s.start.slice(0, 10);
    activity.set(day, (activity.get(day) || 0) + s.duration);
  }
  return {
    total: library.books.length,
    finished: library.books.filter((b) => b.status === "finished").length,
    reading: library.books.filter((b) => b.status === "reading").length,
    highlights: active.filter((a) => a.text && a.kind !== "bookmark").length,
    notes: active.filter((a) => a.note).length,
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
