import { beforeAll, it, expect, vi, afterEach } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { createRequire } from "node:module";
import { importKobo, discover } from "../packages/importers";
import { importKobalt } from "../packages/importers/kobalt";
import { Store } from "../packages/storage";
import { readingLibrary } from "../packages/core";
import { analytics } from "../packages/analytics";
import { findCovers, fetchCover } from "../packages/covers";
let SQL: SqlJsStatic;
beforeAll(async () => {
  const req = createRequire(import.meta.url);
  SQL = await initSqlJs({
    locateFile: () => req.resolve("sql.js/dist/sql-wasm.wasm"),
  });
});
afterEach(() => vi.useRealTimers());
function kobalt() {
  const db = new SQL.Database();
  db.run(
    "CREATE TABLE books(book TEXT,identity TEXT,fingerprint TEXT,title TEXT)",
  );
  db.run(
    "INSERT INTO books VALUES('key','file:///mnt/onboard/Quiet.epub','fingerprint','The Quiet Atlas')",
  );
  db.run(
    "CREATE TABLE entries(book TEXT,kind INTEGER,id TEXT,start TEXT,end TEXT,text TEXT,chapter TEXT,created TEXT,note TEXT)",
  );
  db.run(
    "INSERT INTO entries VALUES('key',1,'h1','/body/1','/body/2','A quiet thought','Chapter 1','2026-01-02T01:00:00Z','我自己的想法'),('key',0,'b1','/body/3','','A bookmark excerpt','Chapter 2','2026-01-03T01:00:00Z','')",
  );
  db.run("CREATE TABLE book_state(identity TEXT,format INTEGER,payload TEXT)");
  db.run("INSERT INTO book_state VALUES(?,?,?)", [
    "file:///mnt/onboard/Quiet.epub",
    1,
    JSON.stringify({
      book: "file:///mnt/onboard/Quiet.epub",
      fingerprint: "fingerprint",
      percent: 42,
      position: "/body/1",
    }),
  ]);
  db.run(
    "CREATE TABLE reading_sessions(id TEXT,book TEXT,identity TEXT,fingerprint TEXT,title TEXT,author TEXT,started INTEGER,observed INTEGER,active_ms INTEGER)",
  );
  db.run(
    "INSERT INTO reading_sessions VALUES('s1','key','file:///mnt/onboard/Quiet.epub','fingerprint','The Quiet Atlas','Alex Morgan',1790000000000,1790000060000,30000)",
  );
  return db;
}
it("keeps previews and catalog metadata separately, while retaining unread downloaded books and history", () => {
  const db = new SQL.Database();
  db.run(
    "CREATE TABLE content(ContentID TEXT,ContentType INT,Title TEXT,Accessibility INT,IsDownloaded TEXT,ReadStatus INT,___PercentRead INT,TimeSpentReading INT,DateLastRead TEXT)",
  );
  db.run(
    "INSERT INTO content VALUES('full',6,'Unread full book',1,'true',0,0,0,NULL),('preview',6,'Store preview',6,'true',2,100,50,NULL),('catalog',6,'Catalog',-1,'false',0,0,0,NULL),('historic',6,'Historical reading',1,'false',2,100,100,NULL),('sideload',16,'Local book',-1,'false',0,0,0,NULL)",
  );
  const p = importKobo(db, "d"),
    store = new Store(SQL);
  store.commit(p);
  expect(store.library("test").books).toHaveLength(5);
  const l = readingLibrary(store.library("test"));
  expect(l.books.map((b) => b.title)).toEqual([
    "Unread full book",
    "Historical reading",
    "Local book",
  ]);
  expect(analytics(l).finished).toBe(1);
  expect(readingLibrary(store.library("test"), true).books).toHaveLength(5);
});
it("reclassifies previously imported store items without losing personal knowledge", () => {
  const store = new Store(SQL),
    p = importKobalt(kobalt(), "d");
  store.commit(p);
  const a = p.annotations[0];
  store.knowledge({
    id: a.id,
    bookId: a.bookId,
    favorite: true,
    tags: ["keep"],
  });
  p.books[0].libraryKind = "preview";
  store.commit(p);
  expect(readingLibrary(store.library("test")).books).toHaveLength(0);
  expect(
    readingLibrary(store.library("test"), true).knowledge[0].favorite,
  ).toBe(true);
});
it("imports Kobalt highlights, bookmark kind, Unicode notes, progress, and millisecond session clocks", () => {
  const p = importKobalt(kobalt(), "d");
  expect(p.books).toHaveLength(1);
  expect(p.annotations).toHaveLength(2);
  expect(p.annotations[0].note).toBe("我自己的想法");
  expect(p.annotations[1].kind).toBe("bookmark");
  expect(p.books[0].progress).toBe(42);
  expect(p.sessions[0].duration).toBe(30);
  expect(p.sessions[0].start).toBe(new Date(1790000000000).toISOString());
  expect(p.books[0].finishedAt).toBeNull();
  const store = new Store(SQL);
  store.commit(p);
  store.commit(p);
  expect(store.library("test").annotations).toHaveLength(2);
  expect(analytics(store.library("test")).highlights).toBe(1);
});
it("diagnoses unsupported Kobalt state formats and invalid sessions", () => {
  const db = kobalt();
  db.run("UPDATE book_state SET format=999");
  db.run("UPDATE reading_sessions SET active_ms=-1");
  const p = importKobalt(db, "d");
  expect(p.diagnostics).toHaveLength(2);
  expect(p.annotations).toHaveLength(2);
});
it("discovers Kobalt SQLite and blocks pending companions", async () => {
  const db = kobalt();
  const p = await discover(
    SQL,
    [{ path: "kobalt.sqlite", bytes: db.export() }],
    "d",
  );
  expect(p.sources).toContain("Kobalt");
  expect(p.annotations).toHaveLength(2);
  const blocked = await discover(
    SQL,
    [
      { path: "kobalt.sqlite", bytes: db.export() },
      { path: "kobalt.sqlite-wal", bytes: new Uint8Array([1]) },
    ],
    "d",
  );
  expect(blocked.books).toHaveLength(0);
  expect(blocked.diagnostics[0]).toContain("companion");
});
it("recovers validated Kobalt rows around a damaged secondary index without changing source bytes", async () => {
  const db = kobalt();
  db.run("CREATE INDEX reading_sessions_book ON reading_sessions(book)");
  const page = Number(
    db.exec(
      "SELECT rootpage FROM sqlite_master WHERE name='reading_sessions_book'",
    )[0].values[0][0],
  );
  const pageSize = Number(db.exec("PRAGMA page_size")[0].values[0][0]);
  const bytes = db.export();
  db.close();
  bytes[(page - 1) * pageSize] = 255;
  const original = bytes.slice();
  const preview = await discover(SQL, [{ path: "kobalt.sqlite", bytes }], "d");
  expect(preview.sources).toContain("Kobalt");
  expect(
    preview.diagnostics.some((d) =>
      d.includes("Kobalt integrity check failed"),
    ),
  ).toBe(true);
  expect(preview.sessions).toHaveLength(1);
  expect(preview.sessions[0].duration).toBe(30);
  expect(preview.annotations).toHaveLength(2);
  expect(bytes).toEqual(original);
  const store = new Store(SQL);
  store.commit(preview);
  store.commit(preview);
  expect(store.library("d").sessions).toHaveLength(1);
});
it("retains readable Kobalt annotations when its session table is damaged", async () => {
  const db = kobalt();
  const page = Number(
    db.exec(
      "SELECT rootpage FROM sqlite_master WHERE name='reading_sessions'",
    )[0].values[0][0],
  );
  const pageSize = Number(db.exec("PRAGMA page_size")[0].values[0][0]);
  const bytes = db.export();
  db.close();
  bytes[(page - 1) * pageSize] = 255;
  const p = await discover(SQL, [{ path: "kobalt.sqlite", bytes }], "d");
  expect(p.sessions).toHaveLength(0);
  expect(p.annotations).toHaveLength(2);
  expect(
    p.diagnostics.some((d) =>
      d.includes("reading_sessions could not be completely read"),
    ),
  ).toBe(true);
});
it("rejects out-of-range session clocks during recovery without losing valid Kobalt sessions", () => {
  const db = kobalt();
  db.run(
    "INSERT INTO reading_sessions(id,book,started,observed,active_ms) VALUES('bad','key',1e30,1e30,1)",
  );
  const p = importKobalt(db, "d", true);
  expect(p.sessions).toHaveLength(1);
  expect(p.sessions[0].duration).toBe(30);
  expect(p.diagnostics.some((d) => d.includes("timestamp range"))).toBe(true);
  db.close();
});
it("uses ISBN cover URLs without transmitting annotations or making a metadata query", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01"));
  const fetcher = vi.fn();
  const c = await findCovers(
    { title: "Synthetic", author: "Author", isbn: "978-0-14-032872-1" },
    fetcher,
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(c[0].imageUrl).toContain("9780140328721");
});
it("limits search results to trusted cover IDs and Open Library page paths", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2031-01-01"));
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          docs: [
            {
              title: "Synthetic",
              author_name: ["Author"],
              cover_i: 123,
              key: "/works/OL123W",
            },
            { title: "Injected", cover_i: 1, key: "https://evil.example" },
          ],
        }),
      ),
  );
  const c = await findCovers({ title: "Synthetic", author: "Author" }, fetcher);
  expect(c).toHaveLength(1);
  const url = fetcher.mock.calls[0][0] as URL;
  expect(url.origin).toBe("https://openlibrary.org");
  expect(url.searchParams.has("annotations")).toBe(false);
});
it("bounds downloads, handles missing covers, and rejects arbitrary hosts", async () => {
  const c = {
    title: "A",
    author: "B",
    imageUrl: "https://covers.openlibrary.org/b/id/123-M.jpg?default=false",
    pageUrl: "https://openlibrary.org/works/OL123W",
  };
  await expect(
    fetchCover(c, async () => new Response("", { status: 404 })),
  ).rejects.toThrow("No cover");
  await expect(
    fetchCover({ ...c, imageUrl: "https://evil.example/image" }),
  ).rejects.toThrow("Unsupported");
  await expect(
    fetchCover(
      c,
      async () =>
        new Response("x", {
          headers: {
            "content-type": "image/jpeg",
            "content-length": "4000001",
          },
        }),
    ),
  ).rejects.toThrow("4 MB");
  expect(
    await fetchCover(
      c,
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/jpeg" },
        }),
    ),
  ).toMatch(/^data:image\/jpeg;base64,/);
});
it("saves external cover attribution, round-trips backup, and preserves it across metadata-only imports", () => {
  const store = new Store(SQL),
    p = importKobalt(kobalt(), "d");
  store.commit(p);
  store.cover({
    bookId: p.books[0].id,
    cover: "data:image/jpeg;base64,AQID",
    pageUrl: "https://openlibrary.org/works/OL123W",
  });
  store.commit(p);
  const backup = store.backup();
  store.clear();
  store.restore(backup);
  expect(store.library("test").books[0].coverSource).toBe("openlibrary");
  expect(store.library("test").books[0].coverAttribution).toContain("OL123W");
});
