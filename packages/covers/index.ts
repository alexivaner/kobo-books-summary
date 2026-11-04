import type { Book } from "../core";
export type CoverCandidate = {
  title: string;
  author: string;
  imageUrl: string;
  pageUrl: string;
};
const requestOptions = {
  credentials: "omit" as const,
  referrerPolicy: "no-referrer" as const,
};
let nextRequestAt = 0;
export async function findCovers(
  book: Pick<Book, "isbn" | "title" | "author">,
  fetcher: typeof fetch = fetch,
): Promise<CoverCandidate[]> {
  if (Date.now() < nextRequestAt)
    throw Error("Please wait a few seconds between cover lookups.");
  nextRequestAt = Date.now() + 4000;
  const isbn = book.isbn?.replace(/[-\s]/g, "");
  if (isbn && /^(?:\d{9}[\dXx]|\d{13})$/.test(isbn))
    return [
      {
        title: book.title,
        author: book.author,
        imageUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,
        pageUrl: `https://openlibrary.org/isbn/${isbn}`,
      },
    ];
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", book.title);
  if (book.author !== "Unknown author")
    url.searchParams.set("author", book.author);
  url.searchParams.set("limit", "5");
  url.searchParams.set("fields", "key,title,author_name,cover_i");
  const response = await fetcher(url, {
    ...requestOptions,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error(
      response.status === 429 || response.status === 403
        ? "Open Library rate limit reached. Try later."
        : "Open Library search is unavailable.",
    );
  const body = await response.text();
  if (body.length > 1_000_000)
    throw Error("Cover search response exceeds safe limit");
  const data = JSON.parse(body);
  if (!Array.isArray(data.docs))
    throw Error("Unexpected Open Library response");
  return data.docs
    .slice(0, 5)
    .filter(
      (d: Record<string, unknown>) =>
        typeof d.title === "string" &&
        Number.isSafeInteger(d.cover_i) &&
        Number(d.cover_i) > 0 &&
        typeof d.key === "string" &&
        /^\/(?:works|books)\/OL\d+[WM]$/.test(d.key),
    )
    .map(
      (d: {
        title: string;
        key: string;
        cover_i: number;
        author_name?: unknown[];
      }) => ({
        title: d.title,
        author: Array.isArray(d.author_name)
          ? d.author_name.filter((x) => typeof x === "string").join(", ")
          : "Unknown author",
        imageUrl: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg?default=false`,
        pageUrl: "https://openlibrary.org" + d.key,
      }),
    );
}
export async function fetchCover(
  candidate: CoverCandidate,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (
    !/^https:\/\/covers\.openlibrary\.org\/b\/(?:isbn\/(?:\d{9}[\dXx]|\d{13})|id\/\d+)-M\.jpg\?default=false$/.test(
      candidate.imageUrl,
    )
  )
    throw Error("Unsupported cover URL");
  const response = await fetcher(candidate.imageUrl, {
    ...requestOptions,
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404)
    throw Error("No cover is available for this edition.");
  if (!response.ok)
    throw Error("Cover provider is unavailable or rate limited.");
  const mime = response.headers.get("content-type")?.split(";")[0];
  if (!mime || !["image/jpeg", "image/png", "image/webp"].includes(mime))
    throw Error("Provider returned an unsupported image");
  if (Number(response.headers.get("content-length")) > 4_000_000)
    throw Error("Cover exceeds 4 MB limit");
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty cover response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4_000_000) throw Error("Cover exceeds 4 MB limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  if (!size) throw Error("Empty cover response");
  let binary = "";
  for (const c of chunks)
    for (let i = 0; i < c.length; i += 8192)
      binary += String.fromCharCode(...c.subarray(i, i + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}
