import type { Database, SqlJsStatic } from "sql.js";
import {
  BookSchema,
  EnrichmentSchema,
  type Enrichment,
  AnnotationSchema,
  SessionSchema,
  SnapshotSchema,
  BackupSchema,
  type Preview,
  type Book,
  type Library,
  type Knowledge,
  type Reflection,
  type Session,
  mergeSourceSession,
} from "../core";
import { lookupQueryKey } from "../enrichment";
import { readingHistory, type Attempt } from "../core/history";
export const tables = [
  "books",
  "editions",
  "devices",
  "snapshots",
  "source_records",
  "attempts",
  "sessions",
  "annotations",
  "knowledge_items",
  "topics",
  "knowledge_links",
  "reflections",
  "review_events",
  "ai_insights",
] as const;
export function migrate(db: Database) {
  const version = Number(db.exec("PRAGMA user_version")[0]?.values[0][0] || 0);
  if (version > 1) throw Error("This database requires a newer app version.");
  db.run("PRAGMA foreign_keys=ON");
  if (version === 0) {
    db.run("BEGIN");
    try {
      for (const t of tables)
        db.run(
          `CREATE TABLE ${t}(id TEXT PRIMARY KEY,book_id TEXT ${t !== "books" ? "REFERENCES books(id)" : ""},data TEXT NOT NULL CHECK(json_valid(data)))`,
        );
      db.run("PRAGMA user_version=1");
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
  }
}
export class Store {
  db: Database;
  fts = false;
  constructor(
    public SQL: SqlJsStatic,
    bytes?: Uint8Array,
  ) {
    this.db = new SQL.Database(bytes);
    migrate(this.db);
    try {
      this.db.run(
        "CREATE VIRTUAL TABLE IF NOT EXISTS annotation_search USING fts5(id UNINDEXED,text,note)",
      );
      this.fts = true;
    } catch {
      /* sql.js build may omit FTS5; UI uses Unicode substring search. */
    }
  }
  all<T>(table: string): T[] {
    return (this.db.exec(`SELECT data FROM ${table}`)[0]?.values || []).map(
      (r) => JSON.parse(String(r[0])) as T,
    );
  }
  put<T extends { id: string; bookId?: string }>(table: string, value: T) {
    this.db.run(
      `INSERT INTO ${table}(id,book_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET book_id=excluded.book_id,data=excluded.data`,
      [value.id, value.bookId || null, JSON.stringify(value)],
    );
  }
  transaction(fn: () => void) {
    this.db.run("BEGIN");
    try {
      fn();
      this.db.run("COMMIT");
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
  }
  commit(input: Preview) {
    const books = input.books.map((b) => BookSchema.parse(b)),
      annotations = input.annotations.map((a) => AnnotationSchema.parse(a)),
      sessions = input.sessions.map((s) => SessionSchema.parse(s));
    if (!books.length) throw Error("No valid books to import.");
    const id = crypto.randomUUID(),
      at = new Date().toISOString();
    this.transaction(() => {
      this.put("devices", { id: input.deviceId, ...{ label: input.deviceId } });
      const existing = new Map(this.all<Book>("books").map((x) => [x.id, x]));
      const histories = new Map<string, Attempt[]>();
      for (const a of this.all<Attempt>("attempts"))
        histories.set(a.bookId, [...(histories.get(a.bookId) || []), a]);
      for (const b of books) {
        const old = existing.get(b.id);
        const saved =
          b.metadataRecovered && old
            ? { ...old, metadataRecovered: true }
            : {
                ...b,
                groupOverride: old?.groupOverride,
                duration:
                  b.duration === null
                    ? (old?.duration ?? null)
                    : Math.max(b.duration, old?.duration ?? 0),
                durationKind:
                  b.duration === null && old?.duration != null
                    ? old.durationKind
                    : b.durationKind,
                enrichment:
                  old && lookupQueryKey(old) === lookupQueryKey(b)
                    ? old.enrichment
                    : undefined,
                cover: b.cover || old?.cover,
                coverSource: b.cover ? undefined : old?.coverSource,
                coverAttribution: b.cover ? undefined : old?.coverAttribution,
              };
        saved.readingHistory = readingHistory(
          saved,
          old,
          histories.get(b.id) || [],
        );
        this.put("books", saved);
        this.put("editions", {
          id: b.id,
          bookId: b.id,
          ...{
            sourceId: b.sourceId,
            source: b.source,
            path: saved.path,
            isbn: saved.isbn,
          },
        });
        this.put("source_records", {
          id: b.id,
          bookId: b.id,
          ...{ source: b.source, originalId: b.sourceId, snapshotId: id },
        });
        this.put("attempts", {
          id: JSON.stringify([id, b.id]),
          bookId: b.id,
          ...{
            snapshotId: id,
            progress: b.progress,
            status: b.status,
            lastRead: b.lastRead,
            finishedAt: b.finishedAt,
          },
        });
      }
      for (const a of annotations) {
        this.put("annotations", { ...a, snapshotId: id });
        if (this.fts) {
          this.db.run("DELETE FROM annotation_search WHERE id=?", [a.id]);
          this.db.run(
            "INSERT INTO annotation_search(id,text,note) VALUES(?,?,?)",
            [a.id, a.text, a.note],
          );
        }
      }
      const existingSessions = new Map(
        this.all<Session>("sessions").map((s) => [s.id, s]),
      );
      for (const s of sessions) {
        const merged = mergeSourceSession(existingSessions.get(s.id), s);
        this.put("sessions", merged);
        existingSessions.set(s.id, merged);
      }
      this.put("snapshots", {
        id,
        ...{
          at,
          deviceId: input.deviceId,
          books: books.length,
          annotations: annotations.length,
          diagnostics: input.diagnostics,
        },
      });
    });
  }
  library(storage: string): Library {
    const histories = new Map<string, Attempt[]>();
    for (const a of this.all<Attempt>("attempts"))
      histories.set(a.bookId, [...(histories.get(a.bookId) || []), a]);
    return {
      books: this.all<Book>("books").map((b) => ({
        ...b,
        readingHistory:
          b.readingHistory ||
          readingHistory(b, undefined, histories.get(b.id) || []),
      })),
      annotations: this.all("annotations"),
      sessions: this.all("sessions"),
      snapshots: this.all("snapshots"),
      knowledge: this.all("knowledge_items"),
      reflections: this.all("reflections"),
      storage,
      fts: this.fts,
    };
  }
  knowledge(item: Knowledge) {
    if (!this.all<{ id: string }>("annotations").some((x) => x.id === item.id))
      throw Error("Annotation no longer exists.");
    this.transaction(() => {
      this.put("knowledge_items", item);
      for (const tag of item.tags)
        this.put("topics", { id: tag, ...{ name: tag } });
    });
  }
  reflect(r: Reflection) {
    if (!r.text.trim() || r.text.length > 20000)
      throw Error("Reflection must have 1–20,000 characters.");
    this.put("reflections", r);
  }
  backup() {
    return {
      format: "kobo-books-summary" as const,
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      tables: Object.fromEntries(
        tables.map((t) => [
          t,
          (
            this.db.exec(`SELECT id,book_id,data FROM ${t}`)[0]?.values || []
          ).map((r) => ({
            id: String(r[0]),
            book_id: r[1] === null ? null : String(r[1]),
            data: String(r[2]),
          })),
        ]),
      ),
    };
  }
  restore(raw: unknown) {
    const backup = BackupSchema.parse(raw);
    if (
      tables.some((t) => !backup.tables[t]) ||
      Object.keys(backup.tables).some(
        (t) => !tables.includes(t as (typeof tables)[number]),
      )
    )
      throw Error("Backup table list is invalid.");
    let count = 0;
    for (const [t, records] of Object.entries(backup.tables))
      for (const row of records) {
        if (++count > 500000 || row.data.length > 10_000_000)
          throw Error("Backup exceeds limits.");
        const data = JSON.parse(row.data);
        if (
          !data ||
          data.id !== row.id ||
          (data.bookId || null) !== row.book_id
        )
          throw Error("Backup identity mismatch.");
        if (t === "books") BookSchema.parse(data);
        if (t === "annotations") AnnotationSchema.parse(data);
        if (t === "sessions") SessionSchema.parse(data);
        if (t === "snapshots") SnapshotSchema.parse(data);
        if (
          t === "knowledge_items" &&
          (!Array.isArray(data.tags) ||
            data.tags.some((v: unknown) => typeof v !== "string") ||
            typeof data.favorite !== "boolean")
        )
          throw Error("Invalid knowledge item");
        if (
          t === "reflections" &&
          (typeof data.text !== "string" || typeof data.created !== "string")
        )
          throw Error("Invalid reflection");
      }
    this.transaction(() => {
      for (const t of [...tables].reverse()) this.db.run(`DELETE FROM ${t}`);
      for (const t of tables)
        for (const r of backup.tables[t])
          this.db.run(`INSERT INTO ${t}(id,book_id,data) VALUES(?,?,?)`, [
            r.id,
            r.book_id,
            r.data,
          ]);
      if (this.fts) {
        this.db.run("DELETE FROM annotation_search");
        for (const a of this.all<{ id: string; text: string; note: string }>(
          "annotations",
        ))
          this.db.run("INSERT INTO annotation_search VALUES(?,?,?)", [
            a.id,
            a.text,
            a.note,
          ]);
      }
    });
  }
  enrich(updates: { bookId: string; record: Enrichment; cover?: string }[]) {
    if (updates.length > 100) throw Error("Enrichment batch exceeds limit");
    const books = new Map(this.all<Book>("books").map((b) => [b.id, b]));
    this.transaction(() => {
      for (const u of updates) {
        const b = books.get(u.bookId);
        if (!b) throw Error("Book no longer exists");
        const record = EnrichmentSchema.parse(u.record);
        const saved = BookSchema.parse({
          ...b,
          enrichment: record,
          ...(u.cover && !b.cover
            ? {
                cover: u.cover,
                coverSource: "openlibrary",
                coverAttribution: record.metadata?.pageUrl,
              }
            : {}),
        });
        this.put("books", saved);
      }
    });
  }
  group(input: { ids: string[]; split?: boolean }) {
    if (
      !Array.isArray(input.ids) ||
      input.ids.length < 1 ||
      input.ids.length > 100
    )
      throw Error("Invalid book selection");
    const books = this.all<Book>("books");
    const selected = books.filter((b) => input.ids.includes(b.id));
    if (selected.length !== new Set(input.ids).size)
      throw Error("Book no longer exists");
    const key = "manual:" + crypto.randomUUID();
    this.transaction(() => {
      for (const b of selected)
        this.put("books", {
          ...b,
          groupOverride: input.split ? "separate:" + b.id : key,
        });
    });
  }
  cover(input: { bookId: string; cover: string; pageUrl: string }) {
    const book = this.all<Book>("books").find((b) => b.id === input.bookId);
    if (!book) throw Error("Book no longer exists.");
    this.put(
      "books",
      BookSchema.parse({
        ...book,
        cover: input.cover,
        coverSource: "openlibrary",
        coverAttribution: input.pageUrl,
      }),
    );
  }
  clear() {
    this.transaction(() => {
      for (const t of [...tables].reverse()) this.db.run(`DELETE FROM ${t}`);
      if (this.fts) this.db.run("DELETE FROM annotation_search");
    });
  }
  bytes() {
    return this.db.export();
  }
}
