import type { Database } from "sql.js";
import { type Book, type Preview, stableId } from "../core";
import { readQtMap } from "./qt";
/** Native Kobo timestamps without a zone are UTC, not the importing browser's zone. */
export function koboDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const s = value.trim(),
    d = new Date(
      /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(s)
        ? s.replace(" ", "T") + "Z"
        : s,
    );
  return Number.isFinite(+d) &&
    d.getUTCFullYear() >= 1900 &&
    d.getUTCFullYear() <= 9999
    ? d.toISOString()
    : null;
}
export function importKoboHistory(db: Database, p: Preview) {
  const books = new Map(p.books.map((b) => [b.sourceId, b]));
  const seen = new Set<string>();
  let unsupported = 0,
    malformed = 0;
  const activity = (
    book: Book,
    start: string,
    evidence: "reader-event" | "last-read",
  ) => {
    const id = stableId(book.id, "kobo-activity", start);
    if (seen.has(id)) return;
    seen.add(id);
    p.sessions.push({
      id,
      bookId: book.id,
      start,
      duration: 0,
      kind: "recorded",
      evidence,
    });
  };
  const table = db.exec(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='Event'",
  ).length;
  if (table) {
    try {
      const query =
        db.exec(
          "SELECT EventType,ContentID,CAST(ExtraData AS BLOB) FROM Event WHERE EventType IN (3,46,1020,1021) LIMIT 100001",
        )[0]?.values || [];
      if (query.length > 100000) throw Error("Kobo event count exceeds limit");
      for (const [type, sid, raw] of query) {
        const book = books.get(String(sid));
        if (!book || !(raw instanceof Uint8Array)) continue;
        try {
          const data = readQtMap(raw);
          const seconds = data.ExtraDataReadingSeconds;
          if (
            (Number(type) === 46 || Number(type) === 3) &&
            typeof seconds === "number" &&
            Number.isFinite(seconds) &&
            seconds >= 0
          ) {
            book.duration = Math.max(book.duration ?? 0, seconds);
            book.durationKind = "recorded";
          }
          const timestamps = data.eventTimestamps;
          if (Array.isArray(timestamps))
            for (const stamp of timestamps) {
              if (
                typeof stamp !== "number" ||
                !Number.isFinite(stamp) ||
                stamp <= 0
              )
                continue;
              const date = new Date(stamp * 1000);
              if (
                Number.isFinite(+date) &&
                date.getUTCFullYear() >= 1900 &&
                date.getUTCFullYear() <= 9999
              )
                activity(book, date.toISOString(), "reader-event");
            }
        } catch {
          unsupported++;
        }
      }
    } catch {
      p.diagnostics.push(
        "Native Kobo Event history could not be decoded; book totals and other readers remain available.",
      );
    }
  }
  for (const book of books.values())
    if (book.lastRead) {
      activity(book, book.lastRead, "last-read");
    }
  // Analytics has measured SecondsRead; opening/closing timestamps alone never create active minutes.
  const measured = new Map<string, number>();
  let analytics: Record<string, unknown>[] = [];
  if (
    db.exec(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='AnalyticsEvents'",
    ).length
  ) {
    try {
      const result = db.exec(
        "SELECT Id,Type,Timestamp,Attributes,Metrics FROM AnalyticsEvents WHERE Type='LeaveContent' LIMIT 100001",
      )[0];
      if ((result?.values.length || 0) > 100000) throw Error();
      analytics = (result?.values || []).map((values) =>
        Object.fromEntries(result.columns.map((key, i) => [key, values[i]])),
      );
    } catch {
      p.diagnostics.push(
        "Native Kobo analytics could not be read; binary event history and book totals were preserved.",
      );
    }
  }
  for (const row of analytics) {
    if (row.Type !== "LeaveContent") continue;
    try {
      if (
        typeof row.Attributes !== "string" ||
        typeof row.Metrics !== "string" ||
        row.Attributes.length > 100_000 ||
        row.Metrics.length > 100_000
      )
        throw Error();
      const attrs = JSON.parse(row.Attributes),
        metrics = JSON.parse(row.Metrics);
      const seconds = metrics?.SecondsRead,
        end = koboDate(row.Timestamp);
      if (
        !attrs ||
        typeof attrs !== "object" ||
        Array.isArray(attrs) ||
        typeof attrs.volumeid !== "string" ||
        !end ||
        typeof seconds !== "number" ||
        !Number.isFinite(seconds) ||
        seconds <= 0 ||
        seconds > 7 * 86400 ||
        !row.Id
      )
        throw Error();
      const book = books.get(attrs.volumeid);
      if (!book) continue;
      const start = new Date(Date.parse(end) - seconds * 1000).toISOString();
      const id = stableId(book.id, "kobo-analytics", String(row.Id));
      if (seen.has(id)) continue;
      seen.add(id);
      p.sessions.push({
        id,
        bookId: book.id,
        start,
        end,
        duration: seconds,
        kind: "recorded",
        evidence: "session",
        startEstimated: true,
      });
      measured.set(book.id, (measured.get(book.id) || 0) + seconds);
    } catch {
      malformed++;
    }
  }
  for (const book of books.values())
    if (measured.has(book.id)) {
      book.duration = Math.max(book.duration ?? 0, measured.get(book.id)!);
      book.durationKind = "recorded";
    }
  if (unsupported)
    p.diagnostics.push(
      `${unsupported} unsupported native Kobo event payloads were skipped; other history was preserved.`,
    );
  if (malformed)
    p.diagnostics.push(
      `${malformed} native Kobo analytics rows lacked usable book identity, time or duration.`,
    );
}
