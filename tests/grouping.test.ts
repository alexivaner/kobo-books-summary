import { it, expect, beforeAll } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { createRequire } from "node:module";
import { type Book } from "../packages/core";
import { groupBooks, validISBN } from "../packages/core/grouping";
import { Store } from "../packages/storage";
import {
  matchMetadata,
  pendingBooks,
  MATCHER_VERSION,
  lookupQueryKey,
} from "../packages/enrichment";
let SQL: SqlJsStatic;
beforeAll(async () => {
  const req = createRequire(import.meta.url);
  SQL = await initSqlJs({
    locateFile: () => req.resolve("sql.js/dist/sql-wasm.wasm"),
  });
});
const book = (o: Partial<Book> = {}): Book => ({
  id: "a",
  sourceId: "a",
  source: "kobo",
  deviceId: "d",
  title: "The Quiet Atlas",
  author: "Alex Morgan",
  status: "reading",
  progress: 55,
  lastRead: "2026-11-01T00:00:00.000Z",
  finishedAt: null,
  duration: null,
  durationKind: "unavailable",
  collections: [],
  ...o,
});
it("groups the same onboard file across readers, preserving individual progress and selecting latest", () => {
  const books = [
    book({ path: "file:///mnt/onboard/Quiet.epub" }),
    book({
      id: "b",
      source: "kobalt",
      path: "Quiet.epub",
      progress: 70,
      lastRead: "2026-11-02T00:00:00.000Z",
    }),
    book({ id: "c", source: "koreader", path: "Quiet.epub", progress: 61 }),
  ];
  const g = groupBooks(books);
  expect(g).toHaveLength(1);
  expect(g[0].members.map((b) => b.progress)).toEqual([55, 70, 61]);
  expect(g[0].book.progress).toBe(70);
  expect(books[0].progress).toBe(55);
});
it("does not combine title-only matches, conflicting editions, languages or paths on different devices", () => {
  expect(groupBooks([book(), book({ id: "b" })])).toHaveLength(2);
  expect(
    groupBooks([
      book({ path: "a.epub" }),
      book({ id: "b", path: "a.epub", deviceId: "other" }),
    ]),
  ).toHaveLength(2);
  expect(
    groupBooks([
      book({ path: "a.epub", isbn: "9780140328721" }),
      book({ id: "b", path: "a.epub", isbn: "9780439554930" }),
    ]),
  ).toHaveLength(2);
  expect(
    groupBooks([
      book({
        isbn: "9780140328721",
        readerMetadata: { source: "kobo", language: "eng" },
      }),
      book({
        id: "b",
        isbn: "9780140328721",
        readerMetadata: { source: "kobo", language: "fra" },
      }),
    ]),
  ).toHaveLength(2);
  expect(validISBN("9780140328722")).toBeUndefined();
  expect(validISBN("978-0-14-032872-1")).toBe("9780140328721");
});
it("manual grouping and splitting survive reimport and backup restore without changing source ids", () => {
  const s = new Store(SQL);
  const input = {
    books: [book({ path: "a.epub" }), book({ id: "b", path: "b.epub" })],
    annotations: [
      {
        id: "note-a",
        bookId: "a",
        source: "kobo" as const,
        sourceId: "note-a",
        text: "Synthetic quote",
        note: "Private synthetic note",
        location: "1",
        created: null,
        modified: null,
        sourceDeleted: false,
      },
    ],
    sessions: [],
    sources: ["Kobo"],
    deviceId: "d",
    diagnostics: [],
  };
  s.commit(input);
  s.group({ ids: ["a", "b"] });
  s.commit(input);
  expect(groupBooks(s.library("test").books)).toHaveLength(1);
  const copy = new Store(SQL);
  copy.restore(s.backup());
  expect(groupBooks(copy.library("test").books)).toHaveLength(1);
  expect(copy.library("test").annotations[0].bookId).toBe("a");
  expect(copy.library("test").annotations[0].note).toBe(
    "Private synthetic note",
  );
  copy.group({ ids: ["a", "b"], split: true });
  expect(groupBooks(copy.library("test").books)).toHaveLength(2);
  expect(copy.library("test").books.map((b) => b.id)).toEqual(["a", "b"]);
});
it("invalidates cached misses after matcher upgrades and source metadata changes, while respecting backoff", () => {
  const b = book();
  const miss = matchMetadata(b, []);
  expect(pendingBooks([book({ enrichment: miss })])).toHaveLength(0);
  expect(
    pendingBooks([
      book({ enrichment: { ...miss, matcherVersion: MATCHER_VERSION - 1 } }),
    ]),
  ).toHaveLength(1);
  expect(
    pendingBooks([book({ title: "New title", enrichment: miss })]),
  ).toHaveLength(1);
  const s = new Store(SQL);
  const commit = (b: Book) =>
    s.commit({
      books: [b],
      annotations: [],
      sessions: [],
      sources: ["Kobo"],
      deviceId: "d",
      diagnostics: [],
    });
  commit(b);
  s.enrich([{ bookId: b.id, record: miss }]);
  commit(book({ title: "New title" }));
  expect(s.library("test").books[0].enrichment).toBeUndefined();
  expect(
    pendingBooks([
      book({
        enrichment: {
          status: "error",
          checkedAt: new Date().toISOString(),
          nextRetryAt: new Date(Date.now() + 60000).toISOString(),
          queryKey: lookupQueryKey(b),
        },
      }),
    ]),
  ).toHaveLength(0);
});
