import type { Database, SqlJsStatic } from "sql.js";
import {
  type Book,
  type Annotation,
  type Preview,
  iso,
  stableId,
  normalizePath,
} from "../core";
import { importKoboHistory, koboDate } from "./kobo-history";
import { isResourceFork } from "./cover-plan";
import { importKobalt } from "./kobalt";
import { parseLua } from "./lua";
import { unzipSync, strFromU8 } from "fflate";
export type InputFile = { path: string; bytes: Uint8Array };
type Row = Record<string, unknown>;
export function rows(db: Database, table: string): Row[] {
  if (
    !db.exec(
      "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name=?",
      [table],
    ).length
  )
    return [];
  const q = db.exec(
    'SELECT * FROM "' + table.replaceAll('"', '""') + '" LIMIT 100001',
  )[0];
  if (!q) return [];
  if (q.values.length > 100000)
    throw Error(`${table} exceeds 100,000 record limit`);
  return q.values.map((v) =>
    Object.fromEntries(q.columns.map((c, i) => [c, v[i]])),
  );
}
const s = (x: unknown) => (x == null ? "" : String(x));
const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const truth = (x: unknown) =>
  x === true || x === 1 || x === "1" || String(x).toLowerCase() === "true";
const nullableDuration = (v: unknown) =>
  v !== undefined && v !== null && Number.isFinite(Number(v)) && Number(v) >= 0
    ? Number(v)
    : null;
const object = (x: unknown): Row =>
  x !== null && typeof x === "object" ? (x as Row) : {};
function base(
  source: "kobo" | "koreader" | "kobalt",
  sourceId: string,
  deviceId: string,
): Book {
  return {
    id: stableId(deviceId, source, sourceId),
    source,
    sourceId,
    deviceId,
    title: "Untitled",
    author: "Unknown author",
    progress: null,
    status: "unknown",
    lastRead: null,
    finishedAt: null,
    duration: null,
    durationKind: "unavailable",
    collections: [],
  };
}
export function importKobo(db: Database, deviceId: string): Preview {
  const p: Preview = {
    books: [],
    annotations: [],
    sessions: [],
    diagnostics: [],
    sources: ["Kobo"],
    deviceId,
  };
  const content = rows(db, "content");
  if (!content.length)
    p.diagnostics.push("Kobo content table is absent or empty.");
  const shelves = rows(db, "ShelfContent").filter((r) => !truth(r._IsDeleted));
  for (const r of content) {
    if (
      r.ContentType !== undefined
        ? ![6, 16].includes(num(r.ContentType))
        : !!r.BookID
    )
      continue;
    const sid = s(r.ContentID);
    if (!sid) {
      p.diagnostics.push("Skipped Kobo book without ContentID.");
      continue;
    }
    const duration = nullableDuration(r.TimeSpentReading);
    const progress = Math.min(100, Math.max(0, num(r.___PercentRead)));
    p.books.push({
      ...base("kobo", sid, deviceId),
      title: s(r.Title || r.BookTitle) || "Untitled",
      author: s(r.Attribution) || "Unknown author",
      libraryKind:
        num(r.Accessibility) === 6
          ? "preview"
          : num(r.Accessibility) === 4
            ? "recommendation"
            : num(r.ContentType) !== 16 &&
                r.IsDownloaded != null &&
                !truth(r.IsDownloaded) &&
                !sid.startsWith("file:") &&
                !koboDate(r.DateLastRead) &&
                num(r.ReadStatus) === 0 &&
                progress === 0 &&
                !(duration && duration > 0)
              ? "catalog"
              : "full",
      path: normalizePath(sid),
      isbn: s(r.ISBN),
      imageId: s(r.ImageId),
      progress:
        num(r.ReadStatus) === 2
          ? 100
          : r.___PercentRead == null
            ? null
            : progress,
      status:
        num(r.ReadStatus) === 2
          ? "finished"
          : num(r.ReadStatus) === 1 || progress > 0
            ? "reading"
            : r.ReadStatus == null && r.___PercentRead == null
              ? "unknown"
              : "unread",
      lastRead: koboDate(r.DateLastRead),
      finishedAt: koboDate(r.LastTimeFinishedReading),
      readerMetadata: {
        source: "kobo",
        publisher: s(r.Publisher).slice(0, 1000) || undefined,
        language: s(r.Language).slice(0, 100) || undefined,
        series: s(r.Series).slice(0, 2000) || undefined,
        seriesNumber: s(r.SeriesNumber).slice(0, 100) || undefined,
        description:
          truth(r.IsDownloaded) || num(r.ReadStatus) > 0
            ? s(r.Description)
                .replace(/<[^>]*>/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/\s+/g, " ")
                .slice(0, 20000) || undefined
            : undefined,
      },
      lastStartedAt: koboDate(r.LastTimeStartedReading),
      sourceStartCount:
        r.TimesStartedReading == null
          ? undefined
          : Math.max(0, Math.floor(num(r.TimesStartedReading))),
      duration,
      durationKind: duration === null ? "unavailable" : "recorded",
      collections: shelves
        .filter((v) => s(v.ContentId) === sid)
        .map((v) => s(v.ShelfName)),
    });
  }
  const bookMap = new Map(p.books.map((b) => [b.sourceId, b]));
  let recovered = 0;
  let unlinked = 0;
  for (const r of rows(db, "Bookmark")) {
    const text = s(r.Text),
      note = s(r.Annotation);
    if (!text && !note) continue;
    const volume = s(r.VolumeID);
    let book = bookMap.get(volume);
    if (!book) {
      if (!volume) {
        unlinked++;
        continue;
      }
      let title = normalizePath(volume).split("/").pop() || "Unavailable book";
      try {
        title = decodeURIComponent(title).replace(
          /\.(kepub\.)?(epub|pdf)$/i,
          "",
        );
      } catch {
        /* Keep original identifier. */
      }
      book = {
        ...base("kobo", volume, deviceId),
        metadataRecovered: true,
        title,
        path: normalizePath(volume),
      };
      bookMap.set(volume, book);
      p.books.push(book);
      recovered++;
    }
    const sid =
      s(r.BookmarkID || r.UUID) ||
      stableId(
        r.ContentID as string,
        text,
        note,
        s(r.StartContainerPath),
        num(r.StartOffset),
      );
    if (book.libraryKind === "catalog") book.libraryKind = "full";
    p.annotations.push({
      id: stableId(deviceId, "kobo", sid),
      bookId: book.id,
      source: "kobo",
      sourceId: sid,
      kind: text ? "highlight" : "note",
      text,
      note,
      location: [
        s(r.ContentID),
        s(r.StartContainerPath),
        r.StartOffset != null ? String(r.StartOffset) : "",
      ]
        .filter(Boolean)
        .join(" · "),
      created: iso(r.DateCreated),
      modified: iso(r.DateModified),
      sourceDeleted: truth(r.Hidden),
    });
  }
  if (recovered)
    p.diagnostics.push(
      `Recovered ${recovered} book placeholders from annotations whose book metadata is no longer available. Their annotations are preserved.`,
    );
  if (unlinked)
    p.diagnostics.push(
      `${unlinked} annotations have no book identifier and could not be linked.`,
    );
  importKoboHistory(db, p);
  return p;
}
export function importStats(db: Database, deviceId: string): Preview {
  const p: Preview = {
    books: [],
    annotations: [],
    sessions: [],
    diagnostics: [],
    sources: ["KOReader statistics"],
    deviceId,
  };
  const stat = rows(db, "page_stat_data");
  const intervals = stat.length ? stat : rows(db, "page_stat");
  for (const r of rows(db, "book")) {
    const sid = "stats:" + s(r.md5 || r.id);
    const duration = nullableDuration(r.total_read_time);
    const book = {
      ...base("koreader", sid, deviceId),
      koreaderPartialMd5: /^[a-f0-9]{32}$/i.test(s(r.md5))
        ? s(r.md5).toLowerCase()
        : undefined,
      title: s(r.title) || "Untitled",
      author: s(r.authors) || "Unknown author",
      lastRead: iso(r.last_open),
      duration,
      durationKind:
        duration === null ? ("unavailable" as const) : ("recorded" as const),
      status:
        duration && duration > 0 ? ("reading" as const) : ("unknown" as const),
    };
    p.books.push(book);
    for (const x of intervals.filter((x) => s(x.id_book) === s(r.id))) {
      const start = iso(x.start_time);
      if (!start || num(x.duration) <= 0) continue;
      p.sessions.push({
        id: stableId(book.id, start, num(x.page)),
        bookId: book.id,
        start,
        duration: num(x.duration),
        end: new Date(Date.parse(start) + num(x.duration) * 1000).toISOString(),
        kind: "recorded",
        page: num(x.page),
      });
    }
  }
  if (!p.books.length)
    p.diagnostics.push("KOReader book table is absent or empty.");
  return p;
}
export function importSidecar(
  text: string,
  path: string,
  deviceId: string,
): Preview {
  const data = object(parseLua(text)),
    props = object(data.doc_props),
    summary = object(data.summary);
  if (!data.doc_path && !path.includes(".sdr/"))
    throw Error(
      "Sidecar has no doc_path. Select its containing .sdr directory to preserve book identity.",
    );
  const inferred = path.replace(
    /\.sdr\/metadata\.([\w]+)\.lua$/,
    (_match, ext: string) =>
      path.slice(0, path.indexOf(".sdr/")).endsWith("." + ext) ? "" : "." + ext,
  );
  const sourcePath = normalizePath(s(data.doc_path) || inferred);
  const sid = sourcePath;
  const book = {
    ...base("koreader", sid, deviceId),
    path: sourcePath,
    koreaderPartialMd5: /^[a-f0-9]{32}$/i.test(s(data.partial_md5_checksum))
      ? s(data.partial_md5_checksum).toLowerCase()
      : undefined,
    title: s(props.title) || sourcePath.split("/").pop() || "Untitled",
    author: s(props.authors) || "Unknown author",
    progress:
      data.percent_finished == null
        ? null
        : Math.min(100, Math.max(0, num(data.percent_finished) * 100)),
    status:
      summary.status === "complete"
        ? ("finished" as const)
        : num(data.percent_finished) > 0
          ? ("reading" as const)
          : data.percent_finished == null
            ? ("unknown" as const)
            : ("unread" as const),
  };
  const p: Preview = {
    books: [book],
    annotations: [],
    sessions: [],
    diagnostics: [],
    sources: ["KOReader sidecars"],
    deviceId,
  };
  const add = (r: Row, key: string) => {
    const text = s(r.text),
      note = s(r.note || r.notes);
    if (!text && !note) return;
    const coordinate = r.pos0 || r.page || r.pageno;
    const loc =
      typeof coordinate === "object"
        ? JSON.stringify(coordinate)
        : s(coordinate);
    const sid =
      s(r.id) ||
      stableId(loc, s(r.pos1), s(r.datetime) || key, loc ? "" : text);
    p.annotations.push({
      id: stableId(deviceId, "koreader", sourcePath, sid),
      bookId: book.id,
      source: "koreader",
      sourceId: sid,
      text,
      note,
      location: [s(r.chapter), loc].filter(Boolean).join(" · "),
      created: iso(r.datetime),
      modified: iso(r.datetime_updated),
      sourceDeleted: false,
    });
  };
  if (data.annotations) {
    for (const [k, v] of Object.entries(object(data.annotations)))
      add(object(v), k);
  } else if (data.highlight) {
    for (const [page, list] of Object.entries(object(data.highlight)))
      for (const [k, v] of Object.entries(object(list)))
        add({ ...object(v), page }, k);
    if (data.notes)
      p.diagnostics.push(
        "Legacy KOReader notes may require manual review; original highlight text is preserved.",
      );
  }
  return p;
}
function imageData(bytes: Uint8Array, mime: string) {
  if (!bytes.length) throw Error("Empty cover asset");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}
function epubCover(bytes: Uint8Array): string | undefined {
  let total = 0;
  const zip = unzipSync(bytes, {
    filter: (f) => {
      total += f.originalSize;
      if (total > 80_000_000 || f.originalSize > 8_000_000)
        throw Error("EPUB exceeds safe decompression limit");
      return /\.(xml|opf|jpe?g|png|webp)$/i.test(f.name);
    },
  });
  const container = zip["META-INF/container.xml"];
  if (!container) return;
  const opfPath = strFromU8(container).match(
    /full-path\s*=\s*["']([^"']+)/,
  )?.[1];
  if (!opfPath || !zip[opfPath]) return;
  const opf = strFromU8(zip[opfPath]);
  const coverId = opf.match(
    /<meta\b(?=[^>]*name=["']cover["'])(?=[^>]*content=["']([^"']+))[^>]*>/i,
  )?.[1];
  const items = opf.match(/<item\b[^>]*>/gi) || [];
  const tag =
    items.find((x) => /properties=["'][^"']*cover-image/.test(x)) ||
    items.find((x) => coverId && x.match(/\bid=["']([^"']+)/)?.[1] === coverId);
  const href = tag?.match(/href=["']([^"']+)/)?.[1];
  if (!href) return;
  const parts = (opfPath.slice(0, opfPath.lastIndexOf("/") + 1) + href).split(
    "/",
  );
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") resolved.pop();
    else if (part !== ".") resolved.push(part);
  }
  const image = zip[decodeURIComponent(resolved.join("/"))];
  if (image)
    return imageData(
      image,
      /\.png$/i.test(href)
        ? "image/png"
        : /\.webp$/i.test(href)
          ? "image/webp"
          : "image/jpeg",
    );
}
export async function discover(
  SQL: SqlJsStatic,
  files: InputFile[],
  deviceId: string,
  onProgress?: (s: string) => void,
): Promise<Preview> {
  if (!deviceId.trim() || deviceId.length > 100)
    throw Error("Enter a device name of 1–100 characters.");
  if (files.length > 15000)
    throw Error(
      "Selection exceeds 15,000 files. Select databases and sidecars separately.",
    );
  const p: Preview = {
    books: [],
    annotations: [],
    sessions: [],
    diagnostics: [],
    sources: [],
    deviceId,
  };
  for (const f of files) {
    const path = f.path.replaceAll("\\", "/");
    let part: Preview | undefined;
    try {
      if (
        /(?:KoboReader\.sqlite|statistics\.sqlite3|kobalt\.sqlite)$/i.test(path)
      ) {
        if (f.bytes.length > 128_000_000)
          throw Error("Database exceeds 128 MB limit");
        if (
          files.some(
            (x) =>
              (x.path === f.path + "-wal" || x.path === f.path + "-journal") &&
              x.bytes.length > 0,
          )
        )
          throw Error(
            "Pending SQLite companion file detected. Use scripts/snapshot-device.py for a consistent snapshot.",
          );
        onProgress?.("Reading " + path.split("/").pop());
        const db = new SQL.Database(f.bytes);
        try {
          if (db.exec("PRAGMA quick_check")[0]?.values[0]?.[0] !== "ok")
            throw Error("SQLite integrity check failed");
          part = /KoboReader/i.test(path)
            ? importKobo(db, deviceId)
            : /kobalt\.sqlite$/i.test(path)
              ? importKobalt(db, deviceId)
              : importStats(db, deviceId);
        } finally {
          db.close();
        }
      } else if (/metadata\.[\w]+\.lua$/i.test(path)) {
        onProgress?.("Parsing KOReader metadata");
        part = importSidecar(
          new TextDecoder("utf-8", { fatal: true }).decode(f.bytes),
          path,
          deviceId,
        );
      }
      if (part) {
        p.books.push(...part.books);
        p.annotations.push(...part.annotations);
        p.sessions.push(...part.sessions);
        p.diagnostics.push(...part.diagnostics);
        p.sources.push(...part.sources);
      }
    } catch (e) {
      p.diagnostics.push(
        `${path.split("/").slice(-2).join("/")}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  // KOReader statistics and sidecars share the partial-file MD5. Resolve only
  // a unique same-device path, retaining both source ids and all annotations.
  const checksumPaths = new Map<string, Set<string>>();
  for (const book of p.books)
    if (book.source === "koreader" && book.koreaderPartialMd5 && book.path) {
      const paths =
        checksumPaths.get(book.koreaderPartialMd5) || new Set<string>();
      paths.add(book.path);
      checksumPaths.set(book.koreaderPartialMd5, paths);
    }
  for (const book of p.books)
    if (book.source === "koreader" && !book.path && book.koreaderPartialMd5) {
      const paths = checksumPaths.get(book.koreaderPartialMd5);
      if (paths?.size === 1) book.path = [...paths][0];
    }
  attachCovers(p, files);
  const mergedBooks = new Map<string, Book>();
  for (const book of p.books) {
    const old = mergedBooks.get(book.id);
    if (!old) {
      mergedBooks.set(book.id, book);
      continue;
    }
    const latest = (book.lastRead || "") >= (old.lastRead || "") ? book : old;
    const totals = [old.duration, book.duration].filter(
      (v): v is number => v !== null,
    );
    mergedBooks.set(book.id, {
      ...latest,
      cover: latest.cover || old.cover || book.cover,
      duration: totals.length ? Math.max(...totals) : null,
    });
  }
  p.books = [...mergedBooks.values()];
  p.sessions = [...new Map(p.sessions.map((s) => [s.id, s])).values()];
  p.annotations = [...new Map(p.annotations.map((a) => [a.id, a])).values()];
  p.sources = [...new Set(p.sources)];
  if (!p.sources.length)
    p.diagnostics.push(
      "No supported sources found. Select KoboReader.sqlite, statistics.sqlite3, kobalt.sqlite, or metadata.*.lua. Hidden folders may need explicit file selection.",
    );
  return p;
}

export function attachCovers(p: Preview, files: InputFile[]): Preview {
  files = files.filter((f) => !isResourceFork(f.path));
  for (const b of p.books) {
    if (b.cover) continue;
    try {
      const image =
        b.imageId &&
        files.find(
          (f) =>
            f.path.includes(b.imageId!) &&
            /\.(?:parsed|jpe?g|png)$/i.test(f.path),
        );
      if (image && image.bytes.length < 4_000_000)
        b.cover = imageData(image.bytes, "image/jpeg");
      else {
        const epub = files.find(
          (f) =>
            b.path &&
            normalizePath(f.path).endsWith(b.path) &&
            /\.epub$/i.test(f.path),
        );
        if (epub) b.cover = epubCover(epub.bytes);
      }
    } catch {
      p.diagnostics.push(
        `Cover unavailable for ${b.title}; using a generated cover.`,
      );
    }
  }
  const localCovers = new Map<string, string>();
  const coverPath = (path: string) =>
    normalizePath(path).replace(/^\.kobo\/kepub\//, "");
  for (const b of p.books)
    if (b.cover && b.path) localCovers.set(coverPath(b.path), b.cover);
  for (const b of p.books)
    if (!b.cover && b.path) b.cover = localCovers.get(coverPath(b.path));
  return p;
}
