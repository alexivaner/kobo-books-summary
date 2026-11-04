import type { Annotation, Book } from "../core";
export function searchAnnotations(
  annotations: Annotation[],
  books: Book[],
  query: string,
) {
  const q = query.normalize("NFKC").toLocaleLowerCase().trim();
  const map = new Map(books.map((b) => [b.id, b]));
  return annotations.filter(
    (a) =>
      !q ||
      [
        a.text,
        a.note,
        a.location,
        map.get(a.bookId)?.title,
        map.get(a.bookId)?.author,
      ]
        .join(" ")
        .normalize("NFKC")
        .toLocaleLowerCase()
        .includes(q),
  );
}
export function mergeCandidates(books: Book[]) {
  const groups = new Map<string, Book[]>();
  for (const b of books) {
    const key = [b.title, b.author]
      .join("|")
      .normalize("NFKC")
      .toLocaleLowerCase();
    groups.set(key, [...(groups.get(key) || []), b]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
