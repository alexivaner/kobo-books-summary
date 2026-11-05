import { isReadingBook, normalizePath, type Book } from "../core";
export type CoverAsset = { path: string; file: { size: number } };
export const isResourceFork = (path: string) =>
  path
    .replaceAll("\\", "/")
    .split("/")
    .some((part) => part.startsWith("._"));
/** Images first; archive batches bound peak memory without capping a whole library. */
export function coverBatches<T extends CoverAsset>(
  books: Book[],
  files: T[],
  kind: "images" | "epubs",
): T[][] {
  const imageRank = (path: string) =>
    /N3_LIBRARY_FULL\.parsed$/i.test(path)
      ? 0
      : /N3_FULL\.parsed$/i.test(path)
        ? 1
        : 2;
  const assets = files
    .filter(
      (f) =>
        !isResourceFork(f.path) &&
        f.file.size > 0 &&
        (kind === "images"
          ? /\.(?:parsed|jpe?g|png)$/i.test(f.path) && f.file.size <= 4_000_000
          : /\.epub$/i.test(f.path) && f.file.size <= 64_000_000),
    )
    .sort(
      (a, b) =>
        (kind === "images" ? imageRank(a.path) - imageRank(b.path) : 0) ||
        a.file.size - b.file.size ||
        a.path.localeCompare(b.path),
    );
  const selected = new Set<T>();
  for (const book of books.filter((b) => isReadingBook(b) && !b.cover)) {
    const asset = assets.find((f) =>
      kind === "images"
        ? book.imageId && f.path.includes(book.imageId)
        : book.path && normalizePath(f.path).endsWith(book.path),
    );
    if (asset) selected.add(asset);
  }
  const batches: T[][] = [];
  const limit = kind === "images" ? 16_000_000 : 64_000_000;
  let batch: T[] = [],
    bytes = 0;
  for (const asset of selected) {
    if (batch.length && bytes + asset.file.size > limit) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(asset);
    bytes += asset.file.size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
