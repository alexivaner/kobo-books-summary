import {
  EnrichmentSchema,
  type Enrichment,
  type Book,
  isReadingBook,
} from "../core";
import { validISBN } from "../core/grouping";
import { fetchCover } from "../covers";
export type Update = { bookId: string; record: Enrichment; cover?: string };
type Doc = {
  key?: unknown;
  title?: unknown;
  author_name?: unknown;
  isbn?: unknown;
  cover_i?: unknown;
  first_publish_year?: unknown;
  language?: unknown;
  publisher?: unknown;
  subject?: unknown;
};
export const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const isbn = (b: Book) => validISBN(b.isbn);
export const MATCHER_VERSION = 2;
export const lookupQueryKey = (b: Book) =>
  JSON.stringify([isbn(b) || "", normalize(b.title), normalize(b.author)]);
const strings = (v: unknown, limit: number, max = 500) =>
  Array.isArray(v)
    ? v
        .filter((s): s is string => typeof s === "string" && s.length <= max)
        .slice(0, limit)
    : [];
export const lookupKey = (b: Book) =>
  isbn(b)
    ? "isbn:" + isbn(b)
    : "title:" + normalize(b.title) + "|" + normalize(b.author);
export function pendingBooks(books: Book[], now = Date.now()) {
  return books.filter(
    (b) =>
      isReadingBook(b) &&
      (!b.enrichment ||
        (b.enrichment.matcherVersion !== MATCHER_VERSION &&
          ["not-found", "needs-review"].includes(b.enrichment.status)) ||
        (!!b.enrichment.queryKey &&
          b.enrichment.queryKey !== lookupQueryKey(b)) ||
        (["not-found", "needs-review"].includes(b.enrichment.status) &&
          now - Date.parse(b.enrichment.checkedAt) > 30 * 86400000) ||
        ((!b.enrichment.nextRetryAt ||
          Date.parse(b.enrichment.nextRetryAt) <= now) &&
          ((b.enrichment.status === "matched" &&
            b.enrichment.coverStatus === "pending" &&
            !b.cover) ||
            b.enrichment.status === "error"))),
  );
}
export function matchMetadata(
  book: Book,
  docs: Doc[],
  at = new Date().toISOString(),
): Enrichment {
  const number = isbn(book);
  const title = normalize(book.title);
  const author = normalize(book.author);
  const validDocs = docs.filter(
    (d) =>
      d &&
      typeof d === "object" &&
      !Array.isArray(d) &&
      typeof d.key === "string" &&
      /^\/(?:works|books)\/OL\d+[WM]$/.test(d.key) &&
      typeof d.title === "string" &&
      d.title.length <= 2000,
  );
  const exactIsbn = number
    ? validDocs.filter((d) =>
        strings(d.isbn, 10000, 30).some(
          (s) => s.replace(/[-\s]/g, "") === number,
        ),
      )
    : [];
  const authorKey = (s: string) => normalize(s).split(" ").sort().join(" ");
  const possible = exactIsbn.length
    ? exactIsbn
    : validDocs.filter(
        (d) =>
          normalize(d.title as string) === title &&
          (author === "unknown author" ||
            strings(d.author_name, 30).some(
              (a) => authorKey(a) === authorKey(book.author),
            )),
      );
  const unique = [...new Map(possible.map((d) => [d.key, d])).values()];
  if (unique.length !== 1)
    return {
      status: unique.length > 1 ? "needs-review" : "not-found",
      checkedAt: at,
      queryKey: lookupQueryKey(book),
      matcherVersion: MATCHER_VERSION,
      message:
        unique.length > 1
          ? "Multiple matching works; review an edition manually."
          : "No confident title/author or ISBN match.",
    };
  const d = unique[0];
  const coverId =
    Number.isSafeInteger(d.cover_i) && Number(d.cover_i) > 0
      ? Number(d.cover_i)
      : undefined;
  const year =
    typeof d.first_publish_year === "number" &&
    Number.isInteger(d.first_publish_year) &&
    d.first_publish_year >= -5000 &&
    d.first_publish_year <= 3000
      ? d.first_publish_year
      : undefined;
  return EnrichmentSchema.parse({
    status: "matched",
    checkedAt: at,
    queryKey: lookupQueryKey(book),
    matcherVersion: MATCHER_VERSION,
    coverStatus: book.cover ? "local" : coverId ? "pending" : "unavailable",
    metadata: {
      provider: "openlibrary",
      scope: "work",
      pageUrl: "https://openlibrary.org" + d.key,
      title: d.title,
      authors: strings(d.author_name, 30),
      firstPublishedYear: year,
      languages: strings(d.language, 20, 100),
      publishers: strings(d.publisher, 10),
      subjects: strings(d.subject, 20),
      coverId,
    },
  });
}
export class ProviderPause extends Error {}
export async function lookupBatch(
  books: Book[],
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Update[]> {
  if (!books.length) return [];
  const groups = [...new Map(books.map((b) => [lookupKey(b), b])).values()];
  if (groups.length > 10) throw Error("At most 10 lookup groups per batch");
  const quote = (s: string) =>
    '"' + s.replaceAll("\\", "\\\\").replaceAll('"', '\\"').slice(0, 500) + '"';
  const clauses = groups.map((b) => {
    const members = books.filter((x) => lookupKey(x) === lookupKey(b));
    const known = members.every((x) => x.author !== "Unknown author");
    const names = [...new Set(members.map((x) => x.author))];
    const titleQuery =
      "title:" +
      quote(b.title) +
      (known
        ? " AND (" + names.map((a) => "author:" + quote(a)).join(" OR ") + ")"
        : "");
    return isbn(b)
      ? "isbn:" + quote(isbn(b)!) + " OR (" + titleQuery + ")"
      : titleQuery;
  });
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", clauses.map((c) => "(" + c + ")").join(" OR "));
  url.searchParams.set(
    "fields",
    "key,title,author_name,isbn,cover_i,first_publish_year,language,publisher,subject",
  );
  url.searchParams.set("limit", "100");
  const response = await fetcher(url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  if ([403, 429, 503].includes(response.status))
    throw new ProviderPause(
      "Open Library requested a pause. Automatic lookup will retry later.",
    );
  if (!response.ok) throw Error("Open Library metadata is unavailable");
  if (Number(response.headers.get("content-length")) > 2_000_000)
    throw Error("Metadata response exceeds safe limit");
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty metadata response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) throw Error("Metadata response exceeds safe limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(data.docs)) throw Error("Unexpected metadata response");
  const at = new Date().toISOString();
  return books.map((b) => ({
    bookId: b.id,
    record: matchMetadata(b, data.docs.slice(0, 100), at),
  }));
}
export async function downloadMatchedCover(
  record: Enrichment,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const m = record.metadata;
  if (!m?.coverId) return undefined;
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  return fetchCover(
    {
      title: m.title,
      author: m.authors.join(", "),
      imageUrl: `https://covers.openlibrary.org/b/id/${m.coverId}-M.jpg?default=false`,
      pageUrl: m.pageUrl,
    },
    async (url, options) => {
      const response = await fetcher(url, {
        ...options,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
          : options?.signal,
      });
      if ([403, 429, 503].includes(response.status))
        throw new ProviderPause("Cover provider requested a pause.");
      return response;
    },
  );
}
