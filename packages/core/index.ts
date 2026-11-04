import { z } from "zod";
export const Source = z.enum(["kobo", "koreader", "kobalt"]);
export const BookSchema = z.object({
  id: z.string(),
  source: Source,
  sourceId: z.string(),
  title: z.string(),
  author: z.string(),
  path: z.string().optional(),
  isbn: z.string().optional(),
  imageId: z.string().optional(),
  metadataRecovered: z.boolean().optional(),
  libraryKind: z
    .enum(["full", "preview", "recommendation", "catalog"])
    .optional(),
  coverSource: z.literal("openlibrary").optional(),
  coverAttribution: z
    .string()
    .regex(
      /^https:\/\/openlibrary\.org\/(?:isbn\/[0-9Xx-]+|(?:works|books)\/OL\d+[WM])$/,
    )
    .optional(),
  cover: z
    .string()
    .max(8_000_000)
    .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  progress: z.number().min(0).max(100).nullable(),
  status: z.enum(["unread", "reading", "finished", "unknown"]),
  lastRead: z.string().nullable(),
  finishedAt: z.string().nullable(),
  duration: z.number().nonnegative().nullable(),
  durationKind: z.enum(["recorded", "estimated", "unavailable"]),
  collections: z.array(z.string()),
  deviceId: z.string(),
});
export type Book = z.infer<typeof BookSchema>;
export const AnnotationSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  source: Source,
  sourceId: z.string(),
  text: z.string(),
  note: z.string(),
  location: z.string(),
  created: z.string().nullable(),
  modified: z.string().nullable(),
  sourceDeleted: z.boolean(),
  snapshotId: z.string().optional(),
  kind: z.enum(["highlight", "note", "bookmark"]).optional(),
});
export type Annotation = z.infer<typeof AnnotationSchema>;
export const SessionSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  start: z.string(),
  duration: z.number().nonnegative(),
  kind: z.literal("recorded"),
  page: z.number().optional(),
});
export type Session = z.infer<typeof SessionSchema>;
export const SnapshotSchema = z.object({
  id: z.string(),
  at: z.string(),
  deviceId: z.string(),
  books: z.number(),
  annotations: z.number(),
  diagnostics: z.array(z.string()),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Preview = {
  books: Book[];
  annotations: Annotation[];
  sessions: Session[];
  diagnostics: string[];
  sources: string[];
  deviceId: string;
};
export type Knowledge = {
  id: string;
  bookId: string;
  favorite: boolean;
  tags: string[];
};
export type Reflection = {
  id: string;
  bookId: string;
  annotationId?: string;
  text: string;
  created: string;
};
export type Library = {
  books: Book[];
  annotations: Annotation[];
  sessions: Session[];
  snapshots: Snapshot[];
  knowledge: Knowledge[];
  reflections: Reflection[];
  storage: string;
  fts: boolean;
};
export const emptyLibrary: Library = {
  books: [],
  annotations: [],
  sessions: [],
  snapshots: [],
  knowledge: [],
  reflections: [],
  storage: "Opening…",
  fts: false,
};
export const stableId = (...parts: (string | number)[]) =>
  JSON.stringify(parts);
export const normalizePath = (s: string) =>
  s
    .replace(/^file:\/\/\/(?:mnt\/onboard\/)?|^\/mnt\/onboard\//, "")
    .replace(/\\/g, "/");
export function iso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(typeof v === "number" ? v * 1000 : String(v));
  return Number.isNaN(+d) ? null : d.toISOString();
}
export interface AIProvider {
  summarize(input: {
    annotationIds: string[];
    consent: boolean;
  }): Promise<{ text: string; citations: string[] }>;
}
export interface DesktopSourceProvider {
  discoverWithConsent(): Promise<{ deviceId: string; label: string }[]>;
}
export const BackupSchema = z.object({
  format: z.literal("kobo-books-summary"),
  version: z.literal(1),
  exportedAt: z.string(),
  tables: z.record(
    z.string(),
    z.array(
      z.object({
        id: z.string(),
        book_id: z.string().nullable(),
        data: z.string(),
      }),
    ),
  ),
});

/** Retain store records for recovery; keep them out of the reading experience by default. */
export const isReadingBook = (book: Book) =>
  !book.libraryKind || book.libraryKind === "full";
export function readingLibrary(
  library: Library,
  includeStore = false,
): Library {
  if (includeStore) return library;
  const books = library.books.filter(isReadingBook),
    ids = new Set(books.map((b) => b.id));
  return {
    ...library,
    books,
    annotations: library.annotations.filter((a) => ids.has(a.bookId)),
    sessions: library.sessions.filter((s) => ids.has(s.bookId)),
    knowledge: library.knowledge.filter((k) => ids.has(k.bookId)),
    reflections: library.reflections.filter((r) => ids.has(r.bookId)),
  };
}
