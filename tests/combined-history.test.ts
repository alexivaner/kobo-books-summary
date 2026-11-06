import { beforeAll, it, expect } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { createRequire } from "node:module";
import { qtMap } from "./helpers/qt";
import { readQtMap } from "../packages/importers/qt";
import { importKobo, discover } from "../packages/importers";
import { importKobalt } from "../packages/importers/kobalt";
import { emptyLibrary, type Book, type Session } from "../packages/core";
import {
  combinedTime,
  bookTime,
  readingDays,
} from "../packages/analytics/rhythm";
import { duration } from "../packages/analytics";
import { Store } from "../packages/storage";
let SQL: SqlJsStatic;
beforeAll(async () => {
  const req = createRequire(import.meta.url);
  SQL = await initSqlJs({
    locateFile: () => req.resolve("sql.js/dist/sql-wasm.wasm"),
  });
});
const book = (id: string, source: Book["source"] = "kobo"): Book => ({
  id,
  source,
  sourceId: id,
  deviceId: "test",
  path: "same.epub",
  title: "Synthetic book",
  author: "Synthetic author",
  status: "reading",
  progress: 50,
  lastRead: null,
  finishedAt: null,
  duration: 500,
  durationKind: "recorded",
  collections: [],
});
const session = (
  id: string,
  bookId: string,
  start: string,
  duration: number,
): Session => ({ id, bookId, start, duration, kind: "recorded" });
function native() {
  const db = new SQL.Database();
  db.run(
    "CREATE TABLE content(ContentID TEXT, ContentType INT, Title TEXT, TimeSpentReading INT, DateLastRead TEXT)",
  );
  db.run(
    "INSERT INTO content VALUES('file:///mnt/onboard/same.epub',6,'Synthetic book',100,'2026-03-12T10:00:00')",
  );
  db.run("CREATE TABLE Event(EventType INT,ContentID TEXT,ExtraData TEXT)");
  const data = qtMap({
    eventTimestamps: [
      Date.parse("2026-09-15T10:00:00Z") / 1000,
      Date.parse("2026-10-21T12:00:00Z") / 1000,
    ],
    ExtraDataReadingSeconds: 500,
    ExtraDataReadingSessions: 2,
    GA4: { book_type: "EPUB" },
    StartPercentage: null,
  });
  for (const type of [3, 46])
    db.run("INSERT INTO Event VALUES(?,?,CAST(? AS TEXT))", [
      type,
      "file:///mnt/onboard/same.epub",
      data,
    ]);
  db.run(
    "CREATE TABLE AnalyticsEvents(Id TEXT,Type TEXT,Timestamp TEXT,Attributes TEXT,Metrics TEXT)",
  );
  db.run("INSERT INTO AnalyticsEvents VALUES(?,?,?,?,?)", [
    "a",
    "LeaveContent",
    "2026-10-21T12:01:00",
    JSON.stringify({ volumeid: "file:///mnt/onboard/same.epub" }),
    JSON.stringify({ SecondsRead: 60 }),
  ]);
  return db;
}
it("reads bounded Qt maps and nested fields from binary TEXT, rejecting truncated and unsupported payloads", () => {
  const data = qtMap({
    eventTimestamps: [1790000000],
    nested: { counter: 300 },
    nullable: null,
    binary: new Uint8Array([0, 255]),
    text: "Synthetic",
  });
  expect(readQtMap(data).nested).toEqual({ counter: 300 });
  expect(() => readQtMap(data.slice(0, -1))).toThrow();
  expect(() => readQtMap(new Uint8Array(2_000_001))).toThrow();
  const invalid = Buffer.from(qtMap({ value: 1 }));
  invalid.writeUInt32BE(999, 4 + 4 + "value".length * 2);
  expect(() => readQtMap(invalid)).toThrow(/Unsupported/);
});
it("recovers native historical activity and measured analytics without assigning aggregate counters to dates", () => {
  const db = native(),
    p = importKobo(db, "test");
  expect(p.books[0].duration).toBe(500); // max of copied native counters, not 500+500+100
  expect(
    p.sessions.find((s) => s.evidence === "reader-event")?.koboEventTypes,
  ).toEqual([3, 46]);
  expect(p.sessions.filter((s) => s.evidence === "reader-event")).toHaveLength(
    2,
  );
  expect(p.sessions.find((s) => s.evidence === "last-read")?.start).toBe(
    "2026-03-12T10:00:00.000Z",
  );
  const measured = p.sessions.find((s) => s.evidence === "session")!;
  expect(measured.duration).toBe(60);
  expect(measured.startEstimated).toBe(true);
  expect(measured.start).toBe("2026-10-21T12:00:00.000Z");
  expect([...readingDays(p).values()].reduce((n, d) => n + d.seconds, 0)).toBe(
    60,
  );
  const store = new Store(SQL);
  store.commit(p);
  store.commit(p);
  expect(store.library("test").sessions).toHaveLength(p.sessions.length);
  const backup = store.backup(),
    restored = new Store(SQL);
  restored.restore(backup);
  expect(restored.library("test").sessions).toEqual(
    store.library("test").sessions,
  );
  db.close();
});
it("merges repeated native snapshots and preserves counters when the next source snapshot is sparse", async () => {
  const db = native(),
    bytes = db.export();
  const p = await discover(
    SQL,
    [
      { path: ".kobo/KoboReader.sqlite", bytes },
      { path: "backup/KoboReader.sqlite", bytes },
    ],
    "test",
  );
  expect(p.books).toHaveLength(1);
  expect(p.sessions).toHaveLength(4);
  const store = new Store(SQL);
  store.commit(p);
  store.commit({
    ...p,
    books: p.books.map((b) => ({ ...b, duration: null })),
    sessions: p.sessions.map((s) => ({
      ...s,
      duration: s.duration > 0 ? 10 : 0,
      koboEventTypes: s.koboEventTypes?.slice(0, 1),
    })),
  });
  expect(
    store.library("test").sessions.find((s) => s.evidence === "session")
      ?.duration,
  ).toBe(60);
  expect(
    store.library("test").sessions.find((s) => s.evidence === "reader-event")
      ?.koboEventTypes,
  ).toEqual([3, 46]);
  expect(store.library("test").books[0].duration).toBe(500);
  db.close();
});
it("counts overlapping matched-book sessions conservatively while retaining all source records", () => {
  const books = [book("a"), book("b", "kobalt"), book("c", "koreader")];
  const sessions = [
    session("a", "a", "2026-10-01T10:00:00Z", 600),
    session("b", "b", "2026-10-01T10:00:00Z", 590),
    session("c", "c", "2026-10-01T11:00:00Z", 300),
  ];
  expect(combinedTime({ books, sessions })).toEqual({
    seconds: 900,
    overlaps: true,
  });
  expect(bookTime({ books, sessions })).toEqual({
    seconds: 900,
    minimum: true,
  });
  expect(sessions).toHaveLength(3);
  expect(duration(9)).toBe("9 sec");
  expect(duration(7199)).toBe("2h 0m");
});
it("accepts sub-second Kobalt counter drift while rejecting genuinely invalid intervals", () => {
  const db = new SQL.Database();
  db.run(
    "CREATE TABLE books(book TEXT,identity TEXT,fingerprint TEXT,title TEXT)",
  );
  db.run("INSERT INTO books VALUES('b','same.epub','hash','Synthetic book')");
  db.run(
    "CREATE TABLE reading_sessions(id TEXT,book TEXT,started INT,observed INT,active_ms INT)",
  );
  db.run(
    "INSERT INTO reading_sessions VALUES('small','b',1790000000000,1790000002000,2013),('bad','b',1790000000000,1790000002000,9999)",
  );
  const p = importKobalt(db, "test");
  expect(p.sessions).toHaveLength(1);
  expect(p.sessions[0].duration).toBe(2.013);
  expect(p.sessions[0].end).toBe(new Date(1790000002013).toISOString());
  expect(p.diagnostics).toHaveLength(1);
  db.close();
});
it("links KOReader statistics to a unique sidecar path by the reader checksum, preserving identities", async () => {
  const hash = "a".repeat(32),
    db = new SQL.Database();
  db.run(
    "CREATE TABLE book(id INT,title TEXT,authors TEXT,md5 TEXT,total_read_time INT)",
  );
  db.run("INSERT INTO book VALUES(1,?,?,?,10)", [
    "Synthetic book",
    "Synthetic author",
    hash,
  ]);
  const lua = new TextEncoder().encode(
    `return {doc_path="/mnt/onboard/same.epub",partial_md5_checksum="${hash}",doc_props={title="Synthetic book",authors="Synthetic author"}}`,
  );
  const p = await discover(
    SQL,
    [
      { path: "statistics.sqlite3", bytes: db.export() },
      { path: "same.sdr/metadata.epub.lua", bytes: lua },
    ],
    "test",
  );
  expect(p.books).toHaveLength(2);
  expect(new Set(p.books.map((b) => b.id)).size).toBe(2);
  expect(p.books.every((b) => b.path === "same.epub")).toBe(true);
  expect(bookTime({ ...p, sessions: [] })).toEqual({
    seconds: 10,
    minimum: false,
  });
  db.close();
});
