import { beforeAll, describe, it, expect } from "vitest";
import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";
import { createRequire } from "node:module";
import {
  importKobo,
  importStats,
  importSidecar,
  discover,
} from "../packages/importers";
import { parseLua } from "../packages/importers/lua";
import { Store, migrate } from "../packages/storage";
import { searchAnnotations } from "../packages/knowledge";
import { analytics } from "../packages/analytics";
let SQL: SqlJsStatic;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  SQL = await initSqlJs({
    locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
  });
});
function native(minimal = false): Database {
  const db = new SQL.Database();
  db.run(
    minimal
      ? "CREATE TABLE content(ContentID TEXT,Title TEXT)"
      : "CREATE TABLE content(ContentID TEXT,ContentType TEXT,Title TEXT,Attribution TEXT,ReadStatus INT,___PercentRead REAL,TimeSpentReading INT,DateLastRead TEXT)",
  );
  if (minimal) db.run("INSERT INTO content VALUES('one','書籍 📚')");
  else
    db.run(
      "INSERT INTO content VALUES('one','6','書籍 📚','作者',1,42,3600,NULL),('chapter','9','Chapter','作者',0,0,0,NULL)",
    );
  db.run(
    "CREATE TABLE Bookmark(BookmarkID TEXT,VolumeID TEXT,Text TEXT,Annotation TEXT,Hidden TEXT,DateCreated TEXT)",
  );
  db.run(
    "INSERT INTO Bookmark VALUES('quote-1','one','一個想法','自己的筆記','false','2026-01-03'),('hidden','one','Archived','','true',NULL)",
  );
  return db;
}
const lua =
  'return { ["doc_path"] = "/mnt/onboard/Books/example.epub", ["doc_props"] = { ["title"] = "A thoughtful book", ["authors"] = "Reader" }, ["percent_finished"] = 0.25, ["annotations"] = { [1] = { ["text"] = "An idea", ["note"] = "My view", ["pos0"] = "/body/1", ["datetime"] = "2026-01-02 14:00:00" } } }';
describe("Kobo schema compatibility", () => {
  it("normalizes top-level books, notes, dates, and string booleans", () => {
    const p = importKobo(native(), "device");
    expect(p.books).toHaveLength(1);
    expect(p.books[0].progress).toBe(42);
    expect(p.books[0].lastRead).toBeNull();
    expect(p.annotations[0].text).toBe("一個想法");
    expect(p.annotations[0].note).toBe("自己的筆記");
    expect(p.annotations[0].sourceDeleted).toBe(false);
    expect(p.annotations[1].sourceDeleted).toBe(true);
  });
  it("handles missing optional columns", () => {
    const p = importKobo(native(true), "device");
    expect(p.books[0].duration).toBeNull();
    expect(p.books[0].title).toBe("書籍 📚");
  });
  it("reports absent tables", () => {
    expect(
      importKobo(new SQL.Database(), "d").diagnostics.length,
    ).toBeGreaterThan(0);
  });
});
it("preserves orphan annotations with explicit unknown book metadata", () => {
  const db = native();
  db.run(
    "INSERT INTO Bookmark VALUES('lost','file:///mnt/onboard/Removed.epub','Keep this idea','','false',NULL)",
  );
  const p = importKobo(db, "d");
  expect(p.books).toHaveLength(2);
  expect(p.books[1].title).toBe("Removed");
  expect(p.books[1].progress).toBeNull();
  expect(p.books[1].status).toBe("unknown");
  expect(p.annotations).toHaveLength(3);
});
describe("Lua safety", () => {
  it("parses tables, comments, strings, numbers and long strings", () => {
    const r = parseLua(
      '-- comment\nreturn {foo="a\\n", [3] = [=[long text]=], bar={true,false,nil,1.2e2}}',
    ) as Record<string, unknown>;
    expect(r.foo).toBe("a\n");
    expect(r["3"]).toBe("long text");
  });
  it.each([
    'return os.execute("bad")',
    "return {x=function() end}",
    'return {} print("bad")',
    'return { ["__proto__"] = {} }',
    "return " + "{".repeat(60) + "}".repeat(60),
    "return {x=1+2}",
  ])("rejects unsupported code: %s", (input) =>
    expect(() => parseLua(input)).toThrow(),
  );
  it("extracts notes separately and stable identities", () => {
    const p = importSidecar(lua, "example.sdr/metadata.epub.lua", "d");
    expect(p.books[0].path).toBe("Books/example.epub");
    expect(p.books[0].progress).toBe(25);
    expect(p.annotations[0].note).toBe("My view");
    expect(
      importSidecar(lua, "example.sdr/metadata.epub.lua", "d").annotations[0]
        .id,
    ).toBe(p.annotations[0].id);
  });
  it("enforces input size", () =>
    expect(() => parseLua("x".repeat(8_000_001))).toThrow());
});
describe("KOReader statistics", () => {
  it("preserves recorded page intervals and unavailable progress", () => {
    const db = new SQL.Database();
    db.run(
      "CREATE TABLE book(id INT,title TEXT,authors TEXT,total_read_time INT,last_open INT,md5 TEXT)",
    );
    db.run("INSERT INTO book VALUES(1,'Time','A',120,1700000000,'abc')");
    db.run(
      "CREATE TABLE page_stat_data(id_book INT,page INT,start_time INT,duration INT)",
    );
    db.run("INSERT INTO page_stat_data VALUES(1,3,1700000000,120)");
    const p = importStats(db, "d");
    expect(p.sessions).toHaveLength(1);
    expect(p.books[0].finishedAt).toBeNull();
    expect(p.books[0].progress).toBeNull();
    expect(p.books[0].duration).toBe(120);
  });
});
describe("discovery boundaries", () => {
  it("reports corruption and continues other sources", async () => {
    const p = await discover(
      SQL,
      [
        { path: "KoboReader.sqlite", bytes: new Uint8Array([1, 2, 3]) },
        { path: "metadata.epub.lua", bytes: new TextEncoder().encode(lua) },
      ],
      "d",
    );
    expect(p.diagnostics).toHaveLength(1);
    expect(p.books).toHaveLength(1);
  });
  it("blocks uncheckpointed WAL and rollback journals", async () => {
    for (const suffix of ["-wal", "-journal"]) {
      const p = await discover(
        SQL,
        [
          { path: "KoboReader.sqlite", bytes: native().export() },
          { path: "KoboReader.sqlite" + suffix, bytes: new Uint8Array([1]) },
        ],
        "d",
      );
      expect(p.books).toHaveLength(0);
      expect(p.diagnostics[0]).toContain("companion");
    }
  });
  it("diagnoses no sources", async () =>
    expect((await discover(SQL, [], "d")).diagnostics).not.toHaveLength(0));
});
describe("transactional local library", () => {
  it("imports repeatedly without duplicate books/annotations; updates notes", () => {
    const store = new Store(SQL);
    const p = importKobo(native(), "d");
    store.commit(p);
    p.annotations[0].note = "Updated";
    store.commit(p);
    const data = store.library("test");
    expect(data.books).toHaveLength(1);
    expect(data.annotations).toHaveLength(2);
    expect(data.annotations[0].note).toBe("Updated");
    expect(data.snapshots).toHaveLength(2);
    expect(data.annotations[0].snapshotId).toBeDefined();
  });
  it("retains removed books and annotations", () => {
    const store = new Store(SQL),
      p = importKobo(native(), "d");
    store.commit(p);
    p.annotations = [];
    store.commit(p);
    expect(store.library("test").annotations).toHaveLength(2);
    expect(store.library("test").books).toHaveLength(1);
  });
  it("keeps uncertain editions and device identities separate", () => {
    const store = new Store(SQL);
    store.commit(importKobo(native(), "one"));
    store.commit(importKobo(native(), "two"));
    store.commit(importSidecar(lua, "metadata.epub.lua", "one"));
    expect(store.library("test").books).toHaveLength(3);
  });
  it("persists exported SQLite, schema and metadata across reopen", () => {
    const store = new Store(SQL);
    store.commit(importKobo(native(), "d"));
    const next = new Store(SQL, store.bytes());
    expect(next.library("test").books).toHaveLength(1);
    expect(next.db.exec("PRAGMA user_version")[0].values[0][0]).toBe(1);
    migrate(next.db);
    expect(next.library("test").annotations).toHaveLength(2);
  });
  it("round-trips backups and personal knowledge", () => {
    const store = new Store(SQL);
    store.commit(importKobo(native(), "d"));
    const a = store.library("test").annotations[0];
    store.knowledge({
      id: a.id,
      bookId: a.bookId,
      favorite: true,
      tags: ["life"],
    });
    store.reflect({
      id: "r",
      bookId: a.bookId,
      text: "My reflection",
      created: "2026-01-01",
    });
    const backup = store.backup();
    store.clear();
    expect(store.library("test").books).toHaveLength(0);
    store.restore(backup);
    expect(store.library("test").knowledge[0].tags).toEqual(["life"]);
    expect(store.library("test").reflections[0].text).toBe("My reflection");
  });
  it("rejects malformed backups without data loss", () => {
    const store = new Store(SQL);
    store.commit(importKobo(native(), "d"));
    const b = store.backup();
    b.tables.books[0].data = "{}";
    expect(() => store.restore(b)).toThrow();
    expect(store.library("test").books).toHaveLength(1);
    expect(() => store.restore({ format: "wrong" })).toThrow();
  });
  it("rolls back restore on broken foreign keys", () => {
    const store = new Store(SQL);
    store.commit(importKobo(native(), "d"));
    const backup = store.backup();
    backup.tables.annotations[0].book_id = "missing";
    const a = JSON.parse(backup.tables.annotations[0].data);
    a.bookId = "missing";
    backup.tables.annotations[0].data = JSON.stringify(a);
    expect(() => store.restore(backup)).toThrow();
    expect(store.library("test").annotations).toHaveLength(2);
  });
  it("does Unicode search and truthful statistics", () => {
    const store = new Store(SQL);
    store.commit(importKobo(native(), "d"));
    const l = store.library("test");
    expect(searchAnnotations(l.annotations, l.books, "自己的")).toHaveLength(1);
    expect(analytics(l).notes).toBe(1);
    expect(analytics(l).activity.size).toBe(1);
    expect([...analytics(l).activity.values()]).toEqual([0]);
    expect(analytics(l).duration).toBe(3600);
  });
  it("rejects future schema versions", () => {
    const db = new SQL.Database();
    db.run("PRAGMA user_version=99");
    expect(() => migrate(db)).toThrow("newer");
  });
});

it("updates a KOReader annotation at the same location without duplication", () => {
  const store = new Store(SQL);
  store.commit(importSidecar(lua, "book.sdr/metadata.epub.lua", "d"));
  store.commit(
    importSidecar(
      lua
        .replace("An idea", "An edited idea")
        .replace("My view", "My updated view"),
      "book.sdr/metadata.epub.lua",
      "d",
    ),
  );
  const l = store.library("test");
  expect(l.annotations).toHaveLength(1);
  expect(l.annotations[0].note).toBe("My updated view");
});

it("extracts an EPUB cover from selected local bytes without network access", async () => {
  const { zipSync, strToU8 } = await import("fflate");
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG+0AAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const epub = zipSync({
    "META-INF/container.xml": strToU8(
      '<container><rootfile full-path="OEBPS/content.opf"/></container>',
    ),
    "OEBPS/content.opf": strToU8(
      '<package><manifest><item id="cover" properties="cover-image" href="cover.png"/></manifest></package>',
    ),
    "OEBPS/cover.png": png,
  });
  const db = native();
  db.run(
    "UPDATE content SET ContentID='file:///mnt/onboard/Book.epub' WHERE ContentID='one'",
  );
  db.run("UPDATE Bookmark SET VolumeID='file:///mnt/onboard/Book.epub'");
  const p = await discover(
    SQL,
    [
      { path: "KoboReader.sqlite", bytes: db.export() },
      { path: "Book.epub", bytes: epub },
    ],
    "d",
  );
  expect(p.books[0].cover).toMatch(/^data:image\/png;base64,/);
  expect(p.diagnostics).toEqual([]);
});

it("rejects backup covers that would request an external service", () => {
  const store = new Store(SQL);
  store.commit(importKobo(native(), "d"));
  const backup = store.backup();
  const b = JSON.parse(backup.tables.books[0].data);
  b.cover = "https://example.com/track";
  backup.tables.books[0].data = JSON.stringify(b);
  expect(() => store.restore(backup)).toThrow();
  expect(store.library("test").books).toHaveLength(1);
});

it("keeps known book metadata when later imports only have orphan annotations", () => {
  const store = new Store(SQL);
  const db = native();
  store.commit(importKobo(db, "d"));
  db.run("DELETE FROM content");
  store.commit(importKobo(db, "d"));
  const b = store.library("test").books[0];
  expect(b.title).toBe("書籍 📚");
  expect(b.author).toBe("作者");
  expect(b.progress).toBe(42);
  expect(b.duration).toBe(3600);
  expect(b.metadataRecovered).toBe(true);
});

it("does not block a valid import when a selected local cover is empty", async () => {
  const db = native();
  db.run("ALTER TABLE content ADD COLUMN ImageId TEXT");
  db.run("UPDATE content SET ImageId='empty-cover'");
  const p = await discover(
    SQL,
    [
      { path: "KoboReader.sqlite", bytes: db.export() },
      { path: ".kobo/images/empty-cover.parsed", bytes: new Uint8Array() },
    ],
    "d",
  );
  expect(p.books[0].cover).toBeUndefined();
  expect(p.diagnostics[0]).toContain("Cover unavailable");
  const store = new Store(SQL);
  store.commit(p);
  expect(store.library("test").books).toHaveLength(1);
});
