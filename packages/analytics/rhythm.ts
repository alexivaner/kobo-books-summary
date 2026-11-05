import type { Library, Session } from "../core";
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
export function recordedSessions(
  library: Pick<Library, "sessions">,
): Session[] {
  return [
    ...new Map(
      library.sessions
        .filter(
          (s) =>
            !!dayKey(s.start) && Number.isFinite(s.duration) && s.duration > 0,
        )
        .map((s) => [s.id, s]),
    ).values(),
  ];
}
export function readingDays(library: Pick<Library, "sessions">) {
  const days = new Map<string, { seconds: number; sessions: Session[] }>();
  for (const s of recordedSessions(library)) {
    const key = dayKey(s.start)!;
    const day = days.get(key) || { seconds: 0, sessions: [] };
    day.seconds += s.duration;
    day.sessions.push(s);
    days.set(key, day);
  }
  return days;
}
