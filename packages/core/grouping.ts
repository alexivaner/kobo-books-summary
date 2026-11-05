import { normalizePath, type Book } from "./index";
export function validISBN(raw?: string): string | undefined {
  const s = raw?.replace(/[-\s]/g, "").toUpperCase();
  if (!s) return;
  if (
    /^\d{13}$/.test(s) &&
    [...s].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0
  )
    return s;
  if (
    /^\d{9}[\dX]$/.test(s) &&
    [...s].reduce((n, c, i) => n + (c === "X" ? 10 : Number(c)) * (10 - i), 0) %
      11 ===
      0
  )
    return s;
}
export type BookGroup = { book: Book; members: Book[] };
export function groupBooks(books: Book[]): BookGroup[] {
  const groups: Book[][] = [];
  const same = (a: Book, b: Book) => {
    if (a.groupOverride || b.groupOverride)
      return !!a.groupOverride && a.groupOverride === b.groupOverride;
    const al = a.readerMetadata?.language,
      bl = b.readerMetadata?.language;
    if (al && bl && al !== bl) return false;
    const ai = validISBN(a.isbn),
      bi = validISBN(b.isbn);
    if (ai && bi) return ai === bi;
    const path = (b: Book) =>
      normalizePath(b.path || b.sourceId).replace(/^\.kobo\/kepub\//, "");
    const ap = path(a),
      bp = path(b);
    return (
      a.deviceId === b.deviceId &&
      !!ap &&
      ap === bp &&
      (/\.(?:epub|kepub|pdf)$/i.test(ap) || /^[a-f0-9-]{36}$/i.test(ap))
    );
  };
  for (const book of books) {
    // Every member must agree: do not bridge conflicting editions through a sparse record.
    const group = groups.find((g) => g.every((b) => same(book, b)));
    if (group) group.push(book);
    else groups.push([book]);
  }
  return groups.map((members) => {
    const ordered = [...members].sort(
      (a, b) =>
        (b.lastRead || "").localeCompare(a.lastRead || "") ||
        a.id.localeCompare(b.id),
    );
    const latest = ordered[0],
      cover = ordered.find((b) => b.cover),
      author = ordered.find((b) => b.author !== "Unknown author"),
      enriched = ordered.find((b) => b.enrichment?.status === "matched");
    return {
      members,
      book: {
        ...latest,
        author: author?.author || latest.author,
        cover: cover?.cover,
        coverSource: cover?.coverSource,
        coverAttribution: cover?.coverAttribution,
        enrichment: enriched?.enrichment || latest.enrichment,
        readingHistory: members.some((b) => b.readingHistory?.everFinished)
          ? {
              everFinished: true,
              completedDates: [
                ...new Set(
                  members.flatMap(
                    (b) => b.readingHistory?.completedDates || [],
                  ),
                ),
              ].sort(),
              completionCountMinimum: Math.max(
                ...members.map(
                  (b) => b.readingHistory?.completionCountMinimum || 0,
                ),
              ),
              rereadingEvidence:
                latest.readingHistory?.rereadingEvidence || "none",
            }
          : latest.readingHistory,
        collections: [...new Set(members.flatMap((b) => b.collections))],
      },
    };
  });
}
