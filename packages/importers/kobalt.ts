import type { Database, Statement } from "sql.js";
import { type Book, type Preview, stableId, normalizePath, iso } from "../core";
import { rows } from "./index";
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const number = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
/** Kobalt SQLite schema: entries kind 0=bookmark, 1=highlight; session clocks are milliseconds. */
export function importKobalt(
  db: Database,
  deviceId: string,
  recoverReadableTables = false,
): Preview {
  const p: Preview = {
    books: [],
    annotations: [],
    sessions: [],
    diagnostics: [],
    sources: ["Kobalt"],
    deviceId,
  };
  const read = (table: string): Row[] => {
    if (!recoverReadableTables) return rows(db, table);
    const recovered: Row[] = [];
    let statement: Statement | undefined;
    try {
      if (
        !db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", [
          table,
        ]).length
      )
        return [];
      // A damaged secondary index must not prevent scanning readable table rows.
      statement = db.prepare(
        `SELECT * FROM "${table}" NOT INDEXED LIMIT 100001`,
      );
      while (statement.step()) {
        if (recovered.length >= 100000)
          throw Error("100,000 record recovery limit reached");
        recovered.push(statement.getAsObject());
      }
    } catch {
      p.diagnostics.push(
        `Kobalt recovery: ${table} could not be completely read; ${recovered.length} readable rows were retained for validation.`,
      );
    } finally {
      statement?.free();
    }
    return recovered;
  };
  const byIdentity = new Map<string, Book>(),
    byKey = new Map<string, Book>();
  const ensure = (
    identity: string,
    fingerprint: string,
    title: string,
    author = "Unknown author",
  ) => {
    const sourceId = stableId(identity, fingerprint);
    let b = byIdentity.get(sourceId);
    if (!b) {
      const path = normalizePath(identity);
      b = {
        id: stableId(deviceId, "kobalt", sourceId),
        source: "kobalt",
        sourceId,
        deviceId,
        path,
        title: title || path.split("/").pop() || "Untitled",
        author,
        progress: null,
        status: "unknown",
        lastRead: null,
        finishedAt: null,
        duration: null,
        durationKind: "unavailable",
        collections: [],
        libraryKind: "full",
      };
      byIdentity.set(sourceId, b);
      p.books.push(b);
    } else {
      if (title) b.title = title;
      if (author !== "Unknown author") b.author = author;
    }
    return b;
  };
  for (const r of read("books")) {
    const identity = str(r.identity);
    if (!identity) {
      p.diagnostics.push("Skipped Kobalt book without identity.");
      continue;
    }
    byKey.set(str(r.book), ensure(identity, str(r.fingerprint), str(r.title)));
  }
  for (const r of read("book_state")) {
    try {
      if (Number(r.format) !== 1) throw Error("unsupported book-state format");
      if (typeof r.payload !== "string" || r.payload.length > 16384)
        throw Error("invalid book-state payload");
      const state = JSON.parse(r.payload) as Row;
      if (!state || typeof state !== "object" || Array.isArray(state))
        throw Error("invalid book-state object");
      const identity = str(r.identity);
      if (!identity) throw Error("missing identity");
      const b = ensure(identity, str(state.fingerprint), "");
      if (state.book) b.path = normalizePath(str(state.book));
      const percent = number(state.percent);
      if (percent !== null) b.progress = Math.max(0, Math.min(100, percent));
      b.sourceCompletionMarker =
        typeof state.finished_position === "string" &&
        state.finished_position.length > 0;
      const native = state.nickel_progress as Row | undefined;
      const finished = native?.valid === true && Number(native.status) === 2;
      b.status = finished
        ? "finished"
        : (b.progress ?? 0) > 0 || !!state.position
          ? "reading"
          : b.progress === 0
            ? "unread"
            : "unknown";
    } catch (e) {
      p.diagnostics.push(
        `Kobalt book state: ${e instanceof Error ? e.message : "invalid payload"}`,
      );
    }
  }
  for (const r of read("reading_sessions")) {
    const start = number(r.started),
      observed = number(r.observed),
      ms = number(r.active_ms);
    if (
      start === null ||
      observed === null ||
      ms === null ||
      start < 0 ||
      observed < start ||
      ms < 0 ||
      ms > observed - start + 1000
    ) {
      p.diagnostics.push("Skipped Kobalt session with invalid timing.");
      continue;
    }
    if (!str(r.identity) && !byKey.has(str(r.book))) {
      p.diagnostics.push("Skipped Kobalt session without book identity.");
      continue;
    }
    const started = iso(start / 1000),
      last = iso(observed / 1000),
      ended = iso(Math.max(observed, start + ms) / 1000);
    if (
      !started ||
      !last ||
      !ended ||
      Math.max(observed, start + ms) > 253402300799999
    ) {
      p.diagnostics.push(
        "Skipped Kobalt session with invalid timestamp range.",
      );
      continue;
    }
    const b =
      byKey.get(str(r.book)) ||
      ensure(
        str(r.identity),
        str(r.fingerprint),
        str(r.title),
        str(r.author) || "Unknown author",
      );
    if (r.author) b.author = str(r.author);
    if (r.title) b.title = str(r.title);
    b.duration = (b.duration ?? 0) + ms / 1000;
    b.durationKind = "recorded";
    if (last && (!b.lastRead || last > b.lastRead)) b.lastRead = last;
    if (b.status === "unknown" && ms > 0) b.status = "reading";
    if (ms > 0 && r.id)
      p.sessions.push({
        id: stableId(deviceId, "kobalt", "session", str(r.id)),
        bookId: b.id,
        start: started,
        duration: ms / 1000,
        end: ended,
        kind: "recorded",
      });
  }
  for (const r of read("entries")) {
    const b = byKey.get(str(r.book));
    if (!b) {
      p.diagnostics.push(
        "Skipped Kobalt annotation with missing book metadata.",
      );
      continue;
    }
    const kind = Number(r.kind);
    if (kind !== 0 && kind !== 1) {
      p.diagnostics.push("Unsupported Kobalt annotation kind was skipped.");
      continue;
    }
    const sourceId = stableId(
      str(r.book),
      kind,
      str(r.id) || stableId(str(r.start), str(r.created)),
    );
    p.annotations.push({
      id: stableId(deviceId, "kobalt", sourceId),
      bookId: b.id,
      source: "kobalt",
      sourceId,
      kind: kind === 0 ? "bookmark" : "highlight",
      text: str(r.text),
      note: str(r.note),
      location: [str(r.chapter), str(r.start), str(r.end)]
        .filter(Boolean)
        .join(" · "),
      created: iso(r.created),
      modified: null,
      sourceDeleted: false,
    });
  }
  if (!p.books.length)
    p.diagnostics.push("Kobalt database contains no supported book records.");
  return p;
}
