import { beforeAll, it, expect, vi } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { createRequire } from "node:module";
import { type Book, type Enrichment } from "../packages/core";
import { readingHistory } from "../packages/core/history";
import { Store } from "../packages/storage";
import {
  matchMetadata,
  lookupBatch,
  pendingBooks,
  downloadMatchedCover,
  ProviderPause,
} from "../packages/enrichment";
let SQL: SqlJsStatic;
beforeAll(async () => {
  const req = createRequire(import.meta.url);
  SQL = await initSqlJs({
    locateFile: () => req.resolve("sql.js/dist/sql-wasm.wasm"),
  });
});
const book = (change: Partial<Book> = {}): Book => ({
  id: "b",
  source: "kobo",
  sourceId: "b",
  deviceId: "d",
  title: "The Quiet Atlas",
  author: "Alex Morgan",
  status: "reading",
  progress: 25,
  lastRead: "2026-11-01T00:00:00.000Z",
  finishedAt: null,
  duration: null,
  durationKind: "unavailable",
  collections: [],
  libraryKind: "full",
  ...change,
});
const doc = {
  key: "/works/OL123W",
  title: "The Quiet Atlas",
  author_name: ["Alex Morgan"],
  cover_i: 123,
  first_publish_year: 2018,
  language: ["eng"],
  subject: ["Attention"],
  publisher: ["Synthetic Press"],
  isbn: ["9780140328721"],
};
const commit = (store: Store, b: Book) =>
  store.commit({
    books: [b],
    annotations: [],
    sessions: [],
    sources: ["Kobo"],
    deviceId: "d",
    diagnostics: [],
  });
it("recognizes a source completion date followed by reading as inferred rereading", () => {
  const h = readingHistory(
    book({ finishedAt: "2025-01-01T00:00:00.000Z", sourceStartCount: 3 }),
  );
  expect(h.everFinished).toBe(true);
  expect(h.completionCountMinimum).toBe(1);
  expect(h.rereadingEvidence).toBe("completion-date-and-progress");
});
it("never treats reading starts as completions or rereads", () => {
  const h = readingHistory(book({ sourceStartCount: 99 }));
  expect(h.everFinished).toBe(false);
  expect(h.rereadingEvidence).toBe("none");
  expect(h.completionCountMinimum).toBe(0);
});
it("retains known completions and observes finished-to-reading transitions across imports", () => {
  const store = new Store(SQL);
  commit(store, book({ status: "finished", progress: 100, finishedAt: null }));
  commit(store, book());
  let b = store.library("test").books[0];
  expect(b.readingHistory?.everFinished).toBe(true);
  expect(b.readingHistory?.completedDates).toEqual([]);
  expect(b.readingHistory?.rereadingEvidence).toBe("observed-status-change");
  commit(store, book());
  b = store.library("test").books[0];
  expect(b.readingHistory?.completionCountMinimum).toBe(1);
  expect(b.readingHistory?.rereadingEvidence).toBe("observed-status-change");
});
it("deduplicates completion dates while retaining multiple recorded finishes", () => {
  const store = new Store(SQL);
  commit(
    store,
    book({ status: "finished", finishedAt: "2025-01-01T00:00:00.000Z" }),
  );
  commit(
    store,
    book({ status: "finished", finishedAt: "2025-01-01T00:00:00.000Z" }),
  );
  commit(store, book());
  commit(
    store,
    book({ status: "finished", finishedAt: "2026-11-02T00:00:00.000Z" }),
  );
  const h = store.library("test").books[0].readingHistory!;
  expect(h.completedDates).toHaveLength(2);
  expect(h.completionCountMinimum).toBe(2);
});
it("retains undated completion markers without inventing timestamps", () => {
  const h = readingHistory(
    book({ source: "kobalt", sourceCompletionMarker: true }),
  );
  expect(h.everFinished).toBe(true);
  expect(h.completedDates).toEqual([]);
  expect(h.rereadingEvidence).toBe("completion-marker-and-progress");
});
it("does not infer rereading from stale reading timestamps before completion", () => {
  const previous = book({
    status: "finished",
    finishedAt: "2026-11-03T00:00:00.000Z",
  });
  const h = readingHistory(
    book({
      finishedAt: previous.finishedAt,
      lastRead: "2025-01-01T00:00:00.000Z",
    }),
    previous,
  );
  expect(h.rereadingEvidence).toBe("none");
});
it("automatically matches only a unique exact title and author, or an exact ISBN", () => {
  expect(matchMetadata(book(), [doc]).status).toBe("matched");
  expect(matchMetadata(book({ author: "Another author" }), [doc]).status).toBe(
    "not-found",
  );
  expect(
    matchMetadata(book(), [doc, { ...doc, key: "/works/OL124W" }]).status,
  ).toBe("needs-review");
  expect(
    matchMetadata(
      book({ title: "Other edition title", isbn: "9780140328721" }),
      [doc],
    ).status,
  ).toBe("matched");
  expect(
    matchMetadata(book(), [
      null,
      {},
      { key: "https://evil.example", title: book().title },
    ] as never[]).status,
  ).toBe("not-found");
});
it("groups duplicate title lookups into one batch request without annotations", async () => {
  const f = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ docs: [doc] })),
  );
  const updates = await lookupBatch(
    [book(), book({ id: "k", source: "kobalt" })],
    undefined,
    f,
  );
  expect(updates).toHaveLength(2);
  expect(f).toHaveBeenCalledTimes(1);
  const u = f.mock.calls[0][0] as URL;
  expect(u.searchParams.get("q")?.match(/title:/g)).toHaveLength(1);
  expect(u.searchParams.has("notes")).toBe(false);
  expect(updates[0].record.metadata?.scope).toBe("work");
});
it("excludes store records, caches completed jobs, resumes pending covers and delays retries", () => {
  const matched = matchMetadata(book(), [doc]);
  expect(
    pendingBooks([
      book({ libraryKind: "preview" }),
      book({ id: "done", enrichment: { ...matched, coverStatus: "cached" } }),
    ]),
  ).toHaveLength(0);
  expect(pendingBooks([book({ enrichment: matched })])).toHaveLength(1);
  const paused: Enrichment = {
    status: "error",
    checkedAt: new Date().toISOString(),
    nextRetryAt: new Date(Date.now() + 60000).toISOString(),
  };
  expect(pendingBooks([book({ enrichment: paused })])).toHaveLength(0);
  expect(
    pendingBooks([book({ enrichment: paused })], Date.now() + 61000),
  ).toHaveLength(1);
});
it("enforces provider pause and batch/response limits", async () => {
  await expect(
    lookupBatch(
      Array.from({ length: 11 }, (_, i) =>
        book({ id: String(i), title: "Title " + i }),
      ),
    ),
  ).rejects.toThrow("10 lookup groups");
  await expect(
    lookupBatch(
      [book()],
      undefined,
      async () => new Response("", { status: 429 }),
    ),
  ).rejects.toBeInstanceOf(ProviderPause);
  await expect(
    lookupBatch(
      [book()],
      undefined,
      async () =>
        new Response("x", { headers: { "content-length": "2000001" } }),
    ),
  ).rejects.toThrow("safe limit");
  await expect(
    downloadMatchedCover(
      matchMetadata(book(), [doc]),
      undefined,
      async () => new Response("", { status: 503 }),
    ),
  ).rejects.toBeInstanceOf(ProviderPause);
});
it("keeps enrichment, reading history and personal data through reimport and backup", () => {
  const store = new Store(SQL);
  const b = book({ finishedAt: "2025-01-01T00:00:00.000Z" });
  commit(store, b);
  store.reflect({
    id: "r",
    bookId: b.id,
    text: "A personal reflection",
    created: new Date().toISOString(),
  });
  store.enrich([
    {
      bookId: b.id,
      record: { ...matchMetadata(b, [doc]), coverStatus: "cached" },
      cover: "data:image/png;base64,AQID",
    },
  ]);
  commit(store, b);
  const saved = store.library("test").books[0];
  expect(saved.title).toBe(b.title);
  expect(saved.progress).toBe(25);
  expect(saved.enrichment?.metadata?.firstPublishedYear).toBe(2018);
  const backup = store.backup();
  store.clear();
  store.restore(backup);
  expect(store.library("test").books[0].readingHistory?.everFinished).toBe(
    true,
  );
  expect(store.library("test").reflections[0].text).toBe(
    "A personal reflection",
  );
});

it("falls back to unique work-level title/author metadata when the edition ISBN is absent", () => {
  const result = matchMetadata(book({ isbn: "9780000000002" }), [doc]);
  expect(result.status).toBe("matched");
  expect(result.metadata?.scope).toBe("work");
  expect(matchMetadata(book({ author: "Morgan, Alex" }), [doc]).status).toBe(
    "matched",
  );
});
it("prefers an exact ISBN match over competing same-title works", () => {
  const result = matchMetadata(book({ isbn: "9780140328721" }), [
    doc,
    { ...doc, key: "/works/OL999W", isbn: ["9780000000002"] },
  ]);
  expect(result.metadata?.pageUrl).toBe("https://openlibrary.org/works/OL123W");
});

it("retains local publisher and language metadata alongside external work metadata", () => {
  const store = new Store(SQL);
  const b = book({
    readerMetadata: {
      source: "kobo",
      publisher: "Local Publisher",
      language: "zh",
      series: "Local Series",
      description: "Reader-provided description",
    },
  });
  commit(store, b);
  store.enrich([{ bookId: b.id, record: matchMetadata(b, [doc]) }]);
  expect(store.library("test").books[0].readerMetadata?.publisher).toBe(
    "Local Publisher",
  );
  expect(
    store.library("test").books[0].enrichment?.metadata?.firstPublishedYear,
  ).toBe(2018);
});
