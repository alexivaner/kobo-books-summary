import { it, expect } from "vitest";
import { coverBatches } from "../packages/importers/cover-plan";
import { attachCovers } from "../packages/importers";
import type { Book, Preview } from "../packages/core";
const book = (id: string, changes: Partial<Book> = {}): Book => ({
  id,
  source: "kobo",
  sourceId: id,
  deviceId: "test",
  title: id,
  author: "Synthetic author",
  path: id + ".epub",
  imageId: id,
  progress: 0,
  status: "unread",
  lastRead: null,
  finishedAt: null,
  duration: null,
  durationKind: "unavailable",
  collections: [],
  ...changes,
});
const asset = (path: string, size: number) => ({ path, file: { size } });
it("plans small reading-shelf images before archives, without spending memory on store previews or resource forks", () => {
  const books = [
    book("store", { libraryKind: "preview" }),
    book("one"),
    book("two"),
  ];
  const image = asset(".kobo-images/one-N3_LIBRARY_FULL.parsed", 20_000);
  expect(
    coverBatches(
      books,
      [
        asset(".kobo-images/._one.parsed", 4096),
        asset(".kobo-images/one-N3_LIBRARY_GRID.parsed", 500),
        asset("store.parsed", 30_000),
        image,
        asset("one.epub", 60_000_000),
      ],
      "images",
    ),
  ).toEqual([[image]]);
});
it("covers a library larger than the previous 128 MB total cap in bounded archive batches", () => {
  const books = [book("one"), book("two"), book("three")];
  const files = books.map((b) => asset(b.path!, 60_000_000));
  const batches = coverBatches(books, files, "epubs");
  expect(batches).toHaveLength(3);
  expect(batches.flat()).toHaveLength(3);
  expect(
    batches.every(
      (batch) => batch.reduce((n, f) => n + f.file.size, 0) <= 64_000_000,
    ),
  ).toBe(true);
  expect(
    coverBatches(
      books.map((b) => ({ ...b, cover: "data:image/jpeg;base64,YQ==" })),
      files,
      "epubs",
    ),
  ).toEqual([]);
});
it("keeps covers from earlier batches and skips macOS metadata when attaching artwork", () => {
  const preview: Preview = {
    books: [book("one"), book("two")],
    annotations: [],
    sessions: [],
    diagnostics: [],
    sources: ["Kobo"],
    deviceId: "test",
  };
  attachCovers(preview, [
    { path: "one.parsed", bytes: new Uint8Array([255, 216, 255, 217]) },
  ]);
  const first = preview.books[0].cover;
  attachCovers(preview, [
    { path: "._two.parsed", bytes: new Uint8Array([1, 2]) },
    { path: "two.parsed", bytes: new Uint8Array([255, 216, 255, 217]) },
  ]);
  expect(preview.books[0].cover).toBe(first);
  expect(preview.books[1].cover).toBe(first);
});
