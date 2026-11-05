"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  BookOpen,
  LayoutDashboard,
  Library as LibraryIcon,
  Lightbulb,
  Usb,
  Settings,
  Search,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Check,
  ShieldCheck,
  Sun,
  Moon,
  Download,
  Upload,
  Quote,
  Heart,
  X,
  ChevronRight,
  Clock,
  StickyNote,
  AlertCircle,
  Loader2,
  Menu,
  Tag,
  Link as LinkIcon,
} from "lucide-react";
import {
  type Book,
  type Annotation,
  type Library,
  type Preview,
  emptyLibrary,
  readingLibrary,
  isReadingBook,
  normalizePath,
} from "../../../packages/core";
import { analytics, duration } from "../../../packages/analytics";
import {
  searchAnnotations,
  mergeCandidates,
} from "../../../packages/knowledge";
import { markdown } from "../../../packages/export";
import { call, initialize, download, readFiles } from "../lib/client";
import Activity from "./activity";
import Modal from "./modal";
import CoverLookup from "./cover-lookup";
import AutomaticEnrichment from "./automatic-enrichment";
import { BookHistory, EnrichedMetadata } from "./book-history";
import { readingHistoryLabel } from "../../../packages/core/history";
import type { Update } from "../../../packages/enrichment";
import { SUPPORT_URL } from "../lib/links";
import { groupBooks } from "../../../packages/core/grouping";
const nav = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "library", label: "My library", icon: LibraryIcon },
  { id: "knowledge", label: "Knowledge library", icon: Lightbulb },
  { id: "import", label: "Connect Kobo", icon: Usb },
  { id: "settings", label: "Settings", icon: Settings },
] as const;
type Page = (typeof nav)[number]["id"];
const date = (s: string | null) =>
  s
    ? new Date(s).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not recorded";
function Cover({ book, large = false }: { book: Book; large?: boolean }) {
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const hue = [...book.title].reduce((n, c) => n + c.charCodeAt(0), 0) % 6;
  return (
    <div className={`cover cover-${hue} ${large ? "large" : ""}`}>
      {book.cover && book.cover !== failedCover ? (
        <img
          src={book.cover}
          alt={`${book.title} cover`}
          onError={() => setFailedCover(book.cover || null)}
        />
      ) : (
        <>
          <div className="cover-rule" />
          <small>{book.author}</small>
          <strong>{book.title}</strong>
          <div className="cover-art">
            <span />
            <span />
            <span />
          </div>
          <BookOpen size={16} />
        </>
      )}
    </div>
  );
}
function Empty({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BookOpen size={28} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="primary" onClick={onAction}>
          {action}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
export default function Workspace() {
  const [storedData, setData] = useState<Library>(emptyLibrary),
    [includeStore, setIncludeStore] = useState(false),
    [autoEnrichment, setAutoEnrichment] = useState(false),
    [coverTarget, setCoverTarget] = useState<Book | null>(null),
    [page, setPage] = useState<Page>("dashboard"),
    [bookId, setBookId] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [source, setSource] = useState("all"),
    [sort, setSort] = useState("recent"),
    [tag, setTag] = useState("all"),
    [favorites, setFavorites] = useState(false),
    [includeArchived, setIncludeArchived] = useState(false),
    [theme, setTheme] = useState("light"),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState("Opening your local library…"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [device, setDevice] = useState("My Kobo"),
    [reflection, setReflection] = useState(""),
    [tagEdit, setTagEdit] = useState<{ id: string; value: string } | null>(
      null,
    ),
    [confirm, setConfirm] = useState<"clear" | "restore" | null>(null),
    [restore, setRestore] = useState<unknown>(null),
    [mobile, setMobile] = useState(false),
    [knowledgeLimit, setKnowledgeLimit] = useState(40),
    [libraryLimit, setLibraryLimit] = useState(48),
    [storageEstimate, setStorageEstimate] = useState("Checking…");
  const [combineTarget, setCombineTarget] = useState("");
  const sourceData = useMemo(
    () => readingLibrary(storedData, includeStore),
    [storedData, includeStore],
  );
  const groups = useMemo(
    () => groupBooks(sourceData.books),
    [sourceData.books],
  );
  const data = useMemo(
    () => ({ ...sourceData, books: groups.map((g) => g.book) }),
    [sourceData, groups],
  );
  const membersFor = useCallback(
    (id: string) =>
      groups.find((g) => g.members.some((b) => b.id === id))?.members || [],
    [groups],
  );
  const saveEnrichment = useCallback(
    async (updates: Update[]) => {
      const groups = groupBooks(storedData.books);
      const expanded = updates.flatMap((u) =>
        (
          groups.find((g) => g.members.some((b) => b.id === u.bookId))
            ?.members || []
        ).map((b) => ({ ...u, bookId: b.id })),
      );
      // The store limits mutations to 100 records. Keep large libraries bounded.
      for (let i = 0; i < expanded.length; i += 100)
        setData(await call<Library>("enrich", expanded.slice(i, i + 100)));
    },
    [storedData.books],
  );
  const fileRef = useRef<HTMLInputElement>(null),
    folderRef = useRef<HTMLInputElement>(null),
    restoreRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    initialize<Library>()
      .then((d) => {
        setData(d);
        setReady(true);
        setBusy("");
      })
      .catch((e) => {
        setError(e.message);
        setBusy("");
      });
    setIncludeStore(localStorage.getItem("kobo-include-store") === "true");
    setAutoEnrichment(localStorage.getItem("kobo-auto-enrichment") === "true");
    const saved = localStorage.getItem("kobo-theme") || "light";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .then(async () => {
          const registration = await navigator.serviceWorker.ready;
          const urls = [
            ...new Set([
              ...performance.getEntriesByType("resource").map((r) => r.name),
              ...Array.from(document.scripts).map((s) => s.src),
            ]),
          ].filter((u) => {
            try {
              const url = new URL(u);
              return (
                url.origin === location.origin &&
                url.pathname.startsWith("/_next/static/")
              );
            } catch {
              return false;
            }
          });
          registration.active?.postMessage({ type: "CACHE_URLS", urls });
        })
        .catch(() => {});
    navigator.storage
      ?.estimate()
      .then((e) =>
        setStorageEstimate(
          `${((e.usage || 0) / 1024 / 1024).toFixed(1)} MB used · ${Math.round((e.quota || 0) / 1024 / 1024)} MB available`,
        ),
      );
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const pop = () => {
      const hash = location.hash.slice(1);
      if (nav.some((n) => n.id === hash)) {
        setPage(hash as Page);
        setBookId(null);
      }
    };
    pop();
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page, bookId]);
  function navigate(p: Page) {
    setPage(p);
    setBookId(null);
    setQuery("");
    setStatus("all");
    setSource("all");
    setMobile(false);
    history.pushState(null, "", "#" + p);
  }
  function openBook(id: string) {
    setBookId(id);
    setQuery("");
    setSource("all");
    setTag("all");
    setFavorites(false);
    setReflection("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const stats = useMemo(() => analytics(data), [data]);
  const activeGroup = groups.find((g) =>
    g.members.some((b) => b.id === bookId),
  );
  const activeBook = activeGroup?.book;
  const activeIds = new Set(activeGroup?.members.map((b) => b.id) || []);
  const knowledgeMap = new Map(data.knowledge.map((k) => [k.id, k]));
  const filteredBooks = useMemo(
    () =>
      data.books
        .filter(
          (b) =>
            (status === "all" ||
              b.status === status ||
              (status === "ever-finished" && b.readingHistory?.everFinished) ||
              (status === "rereading" &&
                b.readingHistory?.rereadingEvidence &&
                b.readingHistory.rereadingEvidence !== "none")) &&
            (source === "all" ||
              membersFor(b.id).some((m) => m.source === source)) &&
            `${b.title} ${b.author} ${b.collections.join(" ")} ${b.enrichment?.metadata?.authors.join(" ") || ""} ${b.enrichment?.metadata?.subjects.join(" ") || ""}`
              .normalize("NFKC")
              .toLocaleLowerCase()
              .includes(query.normalize("NFKC").toLocaleLowerCase()),
        )
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title)
            : sort === "progress"
              ? (b.progress ?? -1) - (a.progress ?? -1)
              : (b.lastRead || "").localeCompare(a.lastRead || ""),
        ),
    [data.books, status, source, query, sort, membersFor],
  );
  const annotations = searchAnnotations(
    data.annotations.filter(
      (a) =>
        (includeArchived || !a.sourceDeleted) &&
        (!activeBook || activeIds.has(a.bookId)) &&
        (source === "all" || a.source === source) &&
        (!favorites || knowledgeMap.get(a.id)?.favorite) &&
        (tag === "all" || knowledgeMap.get(a.id)?.tags.includes(tag)),
    ),
    data.books,
    query,
  ).sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  const tags = [...new Set(data.knowledge.flatMap((k) => k.tags))];
  async function mutate(
    type: string,
    payload?: unknown,
    message = "Saved locally",
  ) {
    setBusy("Saving to your local library…");
    setError("");
    try {
      setData(await call<Library>(type, payload));
      setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
      return false;
    } finally {
      setBusy("");
    }
  }
  async function selectFiles(files: { path: string; file: File }[]) {
    setBusy("Discovering reading sources…");
    setError("");
    setPreview(null);
    try {
      const metadata = files.filter((f) =>
        /(?:KoboReader\.sqlite(?:-wal|-shm|-journal)?|statistics\.sqlite3(?:-wal|-shm|-journal)?|kobalt\.sqlite(?:-wal|-shm|-journal)?|metadata\.[\w]+\.lua)$/i.test(
          f.path,
        ),
      );
      const input = await readFiles(metadata, setBusy);
      let found = await call<Preview>(
        "preview",
        { files: input, deviceId: device.trim() },
        setBusy,
      );
      const assets = files.filter((f) =>
        /\.(?:epub|parsed|jpg|jpeg|png)$/i.test(f.path),
      );
      const selected: { path: string; file: File }[] = [];
      let bytes = 0,
        skipped = 0;
      for (const b of found.books) {
        const image =
          b.imageId &&
          assets.find(
            (f) =>
              f.path.includes(b.imageId!) &&
              /\.(?:parsed|jpg|jpeg|png)$/i.test(f.path),
          );
        const asset =
          image ||
          assets.find(
            (f) =>
              b.path &&
              normalizePath(f.path).endsWith(b.path) &&
              /\.epub$/i.test(f.path),
          );
        if (!asset || selected.includes(asset)) continue;
        if (
          asset.file.size > 64_000_000 ||
          bytes + asset.file.size > 128_000_000
        ) {
          skipped++;
          continue;
        }
        bytes += asset.file.size;
        selected.push(asset);
      }
      if (selected.length) {
        setBusy("Extracting local cover artwork…");
        found = await call<Preview>("covers", {
          preview: found,
          files: await readFiles(selected, setBusy),
        });
      }
      if (skipped)
        found.diagnostics.push(
          `${skipped} cover sources skipped to keep import memory bounded. Generated covers will be used.`,
        );
      setPreview(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy("");
    }
  }
  async function pickFolder() {
    type Handle = {
      kind: "file" | "directory";
      name: string;
      getFile: () => Promise<File>;
      values: () => AsyncIterable<Handle>;
    };
    const picker = (
      window as unknown as { showDirectoryPicker?: () => Promise<Handle> }
    ).showDirectoryPicker;
    if (!picker) {
      folderRef.current?.click();
      return;
    }
    try {
      const root = await picker();
      const files: { path: string; file: File }[] = [];
      async function walk(dir: Handle, path: string, depth = 0) {
        if (depth > 40) throw Error("Folder nesting exceeds the safe limit.");
        for await (const h of dir.values()) {
          const next = path + "/" + h.name;
          if (h.kind === "directory") {
            if (
              ![".Trash", ".Trashes", ".Spotlight-V100", ".fseventsd"].includes(
                h.name,
              )
            )
              await walk(h, next, depth + 1);
          } else if (
            /(?:KoboReader\.sqlite(?:-wal|-shm|-journal)?|statistics\.sqlite3(?:-wal|-shm|-journal)?|kobalt\.sqlite(?:-wal|-shm|-journal)?|metadata\.[\w]+\.lua|\.epub|\.parsed|\.(?:jpg|jpeg|png))$/i.test(
              next,
            )
          ) {
            files.push({ path: next, file: await h.getFile() });
            if (files.length > 15000)
              throw Error(
                "Folder has too many files. Select source files instead.",
              );
          }
        }
      }
      setBusy("Scanning selected folder…");
      await walk(root, "");
      await selectFiles(files);
    } catch (e) {
      setBusy("");
      if (e instanceof Error && e.name !== "AbortError") setError(e.message);
    }
  }
  async function exportBackup() {
    try {
      const b = await call("backup");
      download(
        `kobo-library-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(b, null, 2),
      );
      setNotice("Backup downloaded. Keep it somewhere safe.");
    } catch (e) {
      setError(String(e));
    }
  }
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("kobo-theme", next);
  }
  function annotationCard(a: Annotation) {
    const book = sourceData.books.find((b) => b.id === a.bookId),
      k = knowledgeMap.get(a.id);
    return (
      <article className="annotation" key={a.id}>
        <div className="annotation-top">
          <span className="eyebrow">
            <Quote size={14} />
            {a.kind === "bookmark" ? "KOBALT BOOKMARK" : a.source.toUpperCase()}
            {a.sourceDeleted ? " · ARCHIVED" : ""}
          </span>
          <button
            className={`icon-button ${k?.favorite ? "favorited" : ""}`}
            aria-label={
              k?.favorite ? "Remove from favorites" : "Save to favorites"
            }
            onClick={() =>
              mutate("knowledge", {
                id: a.id,
                bookId: a.bookId,
                favorite: !k?.favorite,
                tags: k?.tags || [],
              })
            }
          >
            <Heart size={17} fill={k?.favorite ? "currentColor" : "none"} />
          </button>
        </div>
        {a.text && <blockquote>{a.text}</blockquote>}
        {a.note && (
          <div className="personal-note">
            <StickyNote size={14} />
            <div>
              <small>YOUR NOTE</small>
              <p>{a.note}</p>
            </div>
          </div>
        )}
        <div className="annotation-footer">
          <button className="text-link" onClick={() => openBook(a.bookId)}>
            {book?.title || "Book"}
            <ArrowUpRight size={13} />
          </button>
          <span>{date(a.created)}</span>
        </div>
        {a.location && (
          <details className="location">
            <summary>Original location</summary>
            <p>{a.location}</p>
          </details>
        )}
        <div className="tag-row">
          {k?.tags.map((t) => (
            <button
              className="pill"
              key={t}
              onClick={() => {
                navigate("knowledge");
                setTag(t);
              }}
            >
              {t}
            </button>
          ))}
          <button
            className="text-link muted"
            onClick={() =>
              setTagEdit({ id: a.id, value: k?.tags.join(", ") || "" })
            }
          >
            <Plus size={12} /> Add topics
          </button>
        </div>
      </article>
    );
  }
  function bookCard(b: Book) {
    return (
      <button className="book-card" key={b.id} onClick={() => openBook(b.id)}>
        <Cover book={b} />
        <div className="book-meta">
          <div className="book-meta-top">
            <span className="source">
              {[
                ...new Set(
                  membersFor(b.id).map((m) =>
                    m.source === "koreader"
                      ? "KOReader"
                      : m.source === "kobalt"
                        ? "Kobalt"
                        : "Kobo",
                  ),
                ),
              ].join(" · ")}
            </span>
            {b.status === "finished" && <Check size={13} />}
          </div>
          <h3>{b.title}</h3>
          <p>{b.author}</p>
          <div className="progress">
            <span style={{ width: `${b.progress ?? 0}%` }} />
          </div>
          <div className="book-progress">
            <span>
              {b.readingHistory?.rereadingEvidence &&
              b.readingHistory.rereadingEvidence !== "none"
                ? readingHistoryLabel(b)
                : b.status === "unread"
                  ? "Not started"
                  : b.status === "finished"
                    ? "Finished"
                    : b.status === "unknown"
                      ? "Status not recorded"
                      : "In progress"}
            </span>
            <span>
              {b.progress === null ? "—" : Math.round(b.progress) + "%"}
            </span>
          </div>
        </div>
      </button>
    );
  }
  const disabled = !ready || !!busy;
  const candidates = preview
    ? mergeCandidates([
        ...data.books.filter((b) => !preview.books.some((p) => p.id === b.id)),
        ...preview.books,
      ])
    : [];
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <button className="brand" onClick={() => navigate("dashboard")}>
          <span className="brand-mark">
            <BookOpen size={23} />
          </span>
          <span>
            Kobo<span className="brand-sub">BOOKS SUMMARY</span>
          </span>
        </button>
        <div className="workspace-label">YOUR READING SPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-label={label}
              aria-current={page === id && !activeBook ? "page" : undefined}
              className={
                page === id && !activeBook ? "nav-item active" : "nav-item"
              }
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              {label}
              {id === "library" && data.books.length > 0 && (
                <span className="nav-count">{data.books.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="/welcome/">
            About this project ↗
          </a>
          <a
            className="nav-item"
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Heart size={17} /> Support Development ↗
          </a>
          <div className="privacy-card">
            <span className="privacy-icon">
              <ShieldCheck size={19} />
            </span>
            <strong>A little space. Just yours.</strong>
            <p>
              Your books and ideas stay on this device. Always in your hands.
            </p>
            <span className="local-dot">Local-first & private</span>
          </div>
          <div className="sidebar-foot">
            <span className="avatar">Y</span>
            <div>
              <strong>Your personal library</strong>
              <small>No account needed</small>
            </div>
            <button
              aria-label="Toggle color theme"
              className="icon-button"
              onClick={toggleTheme}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open menu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>My workspace</span>
            <ChevronRight size={13} />
            <strong>
              {activeBook
                ? "Book details"
                : nav.find((n) => n.id === page)?.label}
            </strong>
          </div>
          <div className="top-actions">
            <span className="local-dot">Stored on this device</span>
            <button
              className="icon-button"
              aria-label="Open settings"
              onClick={() => navigate("settings")}
            >
              <Settings size={18} />
            </button>
          </div>
        </header>
        <main id="main-content">
          {ready && (
            <AutomaticEnrichment
              books={storedData.books}
              enabled={autoEnrichment}
              onToggle={(v) => {
                setAutoEnrichment(v);
                localStorage.setItem("kobo-auto-enrichment", String(v));
              }}
              onSave={saveEnrichment}
              compact={page !== "settings"}
              onManage={() => navigate("settings")}
            />
          )}
          {includeStore && (
            <div className="banner">
              Store records are included in this view and its statistics.{" "}
              <button
                className="text-link"
                onClick={() => {
                  setIncludeStore(false);
                  localStorage.setItem("kobo-include-store", "false");
                }}
              >
                Hide store records
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="banner error">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {busy && (
            <div className="banner" role="status">
              <Loader2 size={16} className="spin" />
              {busy}
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <Check size={16} />
              {notice}
            </div>
          )}
          {activeBook ? (
            <>
              <button
                className="text-link back"
                onClick={() => setBookId(null)}
              >
                ← Back to{" "}
                {page === "dashboard"
                  ? "overview"
                  : page === "knowledge"
                    ? "knowledge library"
                    : "library"}
              </button>
              <section className="book-detail-hero">
                <Cover book={activeBook} large />
                <div>
                  <span className="eyebrow">
                    {activeBook.source} · {activeBook.status}
                  </span>
                  <h1>{activeBook.title}</h1>
                  <p className="subtitle">{activeBook.author}</p>
                  <div className="detail-facts">
                    <span>
                      <BookOpen size={15} />
                      {activeBook.progress === null
                        ? "Progress not recorded"
                        : Math.round(activeBook.progress) + "% read"}
                    </span>
                    <span>
                      <Clock size={15} />
                      {duration(activeBook.duration)}
                      {activeBook.durationKind === "recorded"
                        ? " recorded"
                        : ""}
                    </span>
                    <span>
                      <Quote size={15} />
                      {
                        data.annotations.filter((a) => activeIds.has(a.bookId))
                          .length
                      }{" "}
                      annotations
                    </span>
                  </div>
                  <p className="muted">
                    Last read: {date(activeBook.lastRead)} · Finished:{" "}
                    {date(activeBook.finishedAt)}
                  </p>
                  {activeBook.collections.length > 0 && (
                    <p>Collections: {activeBook.collections.join(", ")}</p>
                  )}
                  <div className="button-row">
                    <button
                      className="secondary"
                      disabled={disabled}
                      onClick={() => setCoverTarget(activeBook)}
                    >
                      <Search size={16} />
                      Find cover
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        download(
                          `${activeBook.title.replaceAll("/", "-")}.md`,
                          markdown(
                            activeBook,
                            data.annotations.filter((a) =>
                              activeIds.has(a.bookId),
                            ),
                            data.reflections.filter((r) =>
                              activeIds.has(r.bookId),
                            ),
                          ),
                          "text/markdown",
                        )
                      }
                    >
                      <Download size={16} />
                      Export Markdown
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        download(
                          "book.json",
                          JSON.stringify(
                            {
                              book: activeBook,
                              annotations: data.annotations.filter((a) =>
                                activeIds.has(a.bookId),
                              ),
                              reflections: data.reflections.filter((r) =>
                                activeIds.has(r.bookId),
                              ),
                            },
                            null,
                            2,
                          ),
                        )
                      }
                    >
                      Export JSON
                    </button>
                  </div>
                </div>
              </section>
              <section className="panel" aria-label="Reader sources">
                <h2>Reader sources</h2>
                <p className="muted">
                  One shelf entry; original progress, history and annotations
                  remain separate. The card uses the latest dated source.
                  Reading times can overlap.
                </p>
                {activeGroup?.members.map((b) => (
                  <div className="history-row" key={b.id}>
                    <div>
                      <strong>
                        {b.source} · {b.title}
                      </strong>
                      <p>
                        {b.progress === null
                          ? "Progress unavailable"
                          : Math.round(b.progress) + "%"}{" "}
                        · {b.status} · Last read: {date(b.lastRead)}
                      </p>
                      <BookHistory book={b} />
                    </div>
                  </div>
                ))}
                {(activeGroup?.members.length || 0) > 1 && (
                  <button
                    className="secondary"
                    onClick={() =>
                      mutate(
                        "group",
                        { ids: [...activeIds], split: true },
                        "Sources separated; all original records retained.",
                      )
                    }
                  >
                    Keep sources separate
                  </button>
                )}
                <label>
                  Combine with another shelf entry
                  <select
                    aria-label="Combine with another shelf entry"
                    value={combineTarget}
                    onChange={(e) => setCombineTarget(e.target.value)}
                  >
                    <option value="">Choose the same book / edition…</option>
                    {data.books
                      .filter((b) => !activeIds.has(b.id))
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title} · {b.author} · {b.source}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="muted">
                  Confirm the same edition and language before combining. You
                  can separate sources again.
                </p>
                <button
                  className="secondary"
                  disabled={!combineTarget || disabled}
                  onClick={() => {
                    mutate(
                      "group",
                      {
                        ids: [
                          ...activeIds,
                          ...membersFor(combineTarget).map((b) => b.id),
                        ],
                      },
                      "Combined shelf entries; source data preserved.",
                    );
                    setCombineTarget("");
                  }}
                >
                  Combine selected book
                </button>
              </section>
              {activeBook.coverSource === "openlibrary" && (
                <p className="muted">
                  Cover via{" "}
                  <a
                    href={activeBook.coverAttribution}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Library ↗
                  </a>{" "}
                  · cached on this device
                </p>
              )}
              <div className="detail-columns">
                <section>
                  <div className="section-heading">
                    <h2>Highlights & notes</h2>
                    <span className="counter">{annotations.length}</span>
                  </div>
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search book annotations"
                      placeholder="Search within this book…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <div className="annotation-list">
                    {annotations.length ? (
                      annotations.map(annotationCard)
                    ) : (
                      <Empty
                        title="A story still unfolding"
                        text="Highlights and notes from this book will appear here after import."
                      />
                    )}
                  </div>
                </section>
                <aside>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>My reflections</h2>
                      <StickyNote size={17} />
                    </div>
                    <p className="muted">Make the ideas your own.</p>
                    <label className="sr-only" htmlFor="reflection">
                      Your reflection
                    </label>
                    <textarea
                      id="reflection"
                      placeholder="What will you take away from this book?"
                      value={reflection}
                      onChange={(e) => setReflection(e.target.value)}
                      maxLength={20000}
                    />
                    <button
                      className="primary"
                      disabled={disabled || !reflection.trim()}
                      onClick={async () => {
                        if (
                          await mutate("reflection", {
                            id: crypto.randomUUID(),
                            bookId: activeBook.id,
                            text: reflection.trim(),
                            created: new Date().toISOString(),
                          })
                        )
                          setReflection("");
                      }}
                    >
                      <Plus size={15} />
                      Save reflection
                    </button>
                    {data.reflections
                      .filter((r) => activeIds.has(r.bookId))
                      .map((r) => (
                        <div className="reflection" key={r.id}>
                          <p>{r.text}</p>
                          <small>{date(r.created)}</small>
                        </div>
                      ))}
                  </section>
                  {(activeGroup?.members.length || 0) === 1 && (
                    <BookHistory book={activeBook} />
                  )}
                  <EnrichedMetadata book={activeBook} />
                  <section className="panel timeline">
                    <h2>Reading timeline</h2>
                    {activeBook.lastRead && (
                      <div>
                        <span className="timeline-dot" />
                        <p>
                          Last recorded reading
                          <small>{date(activeBook.lastRead)}</small>
                        </p>
                      </div>
                    )}
                    {activeBook.finishedAt && (
                      <div>
                        <span className="timeline-dot" />
                        <p>
                          Recorded completion
                          <small>{date(activeBook.finishedAt)}</small>
                        </p>
                      </div>
                    )}
                    {!activeBook.lastRead &&
                      !activeBook.finishedAt &&
                      !data.sessions.some((s) => activeIds.has(s.bookId)) && (
                        <p className="muted">
                          No dated reading activity is available for this
                          source.
                        </p>
                      )}
                    {data.sessions
                      .filter((s) => activeIds.has(s.bookId))
                      .slice(-5)
                      .map((s) => (
                        <div key={s.id}>
                          <span className="timeline-dot" />
                          <p>
                            {duration(s.duration)} recorded interval
                            <small>{date(s.start)}</small>
                          </p>
                        </div>
                      ))}
                  </section>
                </aside>
              </div>
            </>
          ) : (
            <>
              {page === "dashboard" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        A HOME FOR YOUR READING LIFE
                      </div>
                      <h1>
                        Your reading, remembered<span className="green">.</span>
                      </h1>
                      <p className="subtitle">
                        Keep the books. Collect the ideas. Make them yours.
                      </p>
                    </div>
                    <button
                      className="primary"
                      onClick={() => navigate("import")}
                    >
                      <Usb size={17} />
                      Connect Kobo
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <section className="hero-banner">
                    <div>
                      <span className="eyebrow">BETWEEN THE LINES</span>
                      <h2>
                        Good books end.
                        <br />
                        Their ideas stay with you.
                      </h2>
                      <p>
                        A private home for everything you underline,
                        <br className="desktop-break" /> wonder about, and want
                        to remember.
                      </p>
                      <button
                        className="text-link"
                        onClick={() =>
                          navigate(
                            data.annotations.length ? "knowledge" : "import",
                          )
                        }
                      >
                        {data.annotations.length
                          ? "Rediscover your ideas"
                          : "Bring your library home"}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="art-circle" />
                      <div className="art-book art-book-one">
                        <span>
                          THE ART OF
                          <br />
                          <b>
                            PAYING
                            <br />
                            ATTENTION
                          </b>
                        </span>
                        <small>A READER’S COMPANION</small>
                      </div>
                      <div className="art-book art-book-two">
                        <span>
                          small
                          <br />
                          <b>wonders</b>
                        </span>
                        <div className="art-leaf" />
                      </div>
                      <div className="sparkle">✳</div>
                    </div>
                  </section>
                  <section
                    className="stat-grid"
                    aria-label="Reading statistics"
                  >
                    {[
                      {
                        label: "Books in your library",
                        value: stats.total,
                        icon: BookOpen,
                        detail: `${stats.everFinished} finished before · ${stats.rereading} rereading`,
                      },
                      {
                        label: "Highlights collected",
                        value: stats.highlights,
                        icon: Quote,
                        detail: "Ideas worth coming back to",
                      },
                      {
                        label: "Personal notes",
                        value: stats.notes,
                        icon: StickyNote,
                        detail: "A little of your own perspective",
                      },
                      {
                        label: "Reading time",
                        value: duration(stats.duration),
                        icon: Clock,
                        detail:
                          stats.duration === null
                            ? "Import recorded statistics to begin"
                            : "Recorded totals · sources may overlap",
                      },
                    ].map(({ label, value, icon: Icon, detail }) => (
                      <div className="stat-card" key={label}>
                        <div>
                          <span>{label}</span>
                          <Icon size={17} />
                        </div>
                        <strong>{value}</strong>
                        <small>{detail}</small>
                      </div>
                    ))}
                  </section>
                  <section className="dashboard-columns">
                    <div>
                      <div className="section-heading">
                        <div>
                          <h2>On your reading table</h2>
                          <p>One chapter closer to a new perspective.</p>
                        </div>
                        <button
                          className="text-link"
                          onClick={() => navigate("library")}
                        >
                          View library
                          <ArrowRight size={14} />
                        </button>
                      </div>
                      {data.books.length ? (
                        <div className="book-grid dashboard-books">
                          {[...data.books]
                            .sort(
                              (a, b) =>
                                Number(b.status === "reading") -
                                  Number(a.status === "reading") ||
                                (b.lastRead || "").localeCompare(
                                  a.lastRead || "",
                                ),
                            )
                            .slice(0, 4)
                            .map(bookCard)}
                        </div>
                      ) : (
                        <Empty
                          title="Your next chapter starts here"
                          text="Connect your Kobo to bring your books, highlights, and notes into one quiet space."
                          action="Import your first books"
                          onAction={() => navigate("import")}
                        />
                      )}
                    </div>
                    <aside className="panel activity-panel">
                      <div className="section-heading">
                        <h2>A reading rhythm</h2>
                        <span className="pill">6 months</span>
                      </div>
                      <p className="muted">Small moments add up.</p>
                      <Activity entries={[...stats.activity]} />
                      <div className="activity-caption">
                        <span>
                          {stats.activity.size} days with recorded activity
                        </span>
                        <span className="heat-legend">
                          Less <i />
                          <i />
                          <i /> More
                        </span>
                      </div>
                      <div className="divider" />
                      <div className="section-heading">
                        <h3>Last connection</h3>
                        <Usb size={16} />
                      </div>
                      {data.snapshots.length ? (
                        <>
                          <strong>{data.snapshots.at(-1)?.deviceId}</strong>
                          <p className="muted">
                            {date(data.snapshots.at(-1)!.at)} ·{" "}
                            {data.snapshots.at(-1)?.books} source records
                            discovered
                          </p>
                        </>
                      ) : (
                        <p className="muted">Your Kobo hasn’t visited yet.</p>
                      )}
                      <button
                        className="text-link"
                        onClick={() => navigate("import")}
                      >
                        Import & sync
                        <ArrowRight size={14} />
                      </button>
                    </aside>
                  </section>
                  <section>
                    <div className="section-heading">
                      <div>
                        <h2>Ideas to come back to</h2>
                        <p>A few words can open a whole new world.</p>
                      </div>
                      <button
                        className="text-link"
                        onClick={() => navigate("knowledge")}
                      >
                        All your knowledge
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    {data.annotations.some((a) => !a.sourceDeleted) ? (
                      <div className="annotation-grid">
                        {data.annotations
                          .filter((a) => !a.sourceDeleted)
                          .slice(-3)
                          .reverse()
                          .map(annotationCard)}
                      </div>
                    ) : (
                      <div className="quiet-empty">
                        <Quote size={23} />
                        <p>
                          Your highlights will find a home here.
                          <span>
                            Import your annotations to start collecting
                            connections.
                          </span>
                        </p>
                      </div>
                    )}
                  </section>
                  {data.books.some(
                    (b) =>
                      b.readingHistory?.everFinished || b.status === "finished",
                  ) && (
                    <section>
                      <div className="section-heading">
                        <h2>Finished at least once</h2>
                      </div>
                      <div className="book-grid">
                        {data.books
                          .filter(
                            (b) =>
                              b.readingHistory?.everFinished ||
                              b.status === "finished",
                          )
                          .sort((a, b) =>
                            (b.finishedAt || "").localeCompare(
                              a.finishedAt || "",
                            ),
                          )
                          .slice(0, 4)
                          .map(bookCard)}
                      </div>
                    </section>
                  )}
                </>
              )}
              {page === "library" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">YOUR PERSONAL BOOKSHELF</span>
                      <h1>
                        My library<span className="green">.</span>
                      </h1>
                      <p className="subtitle">
                        Every book is a place you’ve been.
                      </p>
                    </div>
                    <button
                      className="primary"
                      onClick={() => navigate("import")}
                    >
                      <Plus size={16} />
                      Import books
                    </button>
                  </div>
                  <div className="toolbar">
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="Search books"
                        placeholder="Search titles, authors, collections…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Reading status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">All books</option>
                      <option value="reading">Currently reading</option>
                      <option value="finished">Finished</option>
                      <option value="unread">Not started</option>
                      <option value="unknown">Status not recorded</option>
                      <option value="ever-finished">Ever finished</option>
                      <option value="rereading">Rereading</option>
                    </select>
                    <select
                      aria-label="Reader source"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                    >
                      <option value="all">All sources</option>
                      <option value="kobo">Kobo</option>
                      <option value="koreader">KOReader</option>
                      <option value="kobalt">Kobalt</option>
                    </select>
                    <select
                      aria-label="Sort books"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recent">Recently read</option>
                      <option value="title">Title A–Z</option>
                      <option value="progress">Progress</option>
                    </select>
                  </div>
                  <label className="check-label scope-control">
                    <input
                      type="checkbox"
                      checked={includeStore}
                      onChange={(e) => {
                        setIncludeStore(e.target.checked);
                        localStorage.setItem(
                          "kobo-include-store",
                          String(e.target.checked),
                        );
                      }}
                    />
                    Include store previews & catalog records (
                    {storedData.books.filter((b) => !isReadingBook(b)).length})
                  </label>
                  <div className="results-label">
                    {filteredBooks.length} books · safely kept, even after they
                    leave your Kobo
                  </div>
                  {filteredBooks.length ? (
                    <>
                      <div className="book-grid library-books">
                        {filteredBooks.slice(0, libraryLimit).map(bookCard)}
                      </div>
                      {filteredBooks.length > libraryLimit && (
                        <button
                          className="secondary load-more"
                          onClick={() => setLibraryLimit((l) => l + 48)}
                        >
                          Show more books
                        </button>
                      )}
                    </>
                  ) : (
                    <Empty
                      title={
                        data.books.length
                          ? "No books match your search"
                          : "A bookshelf of your own"
                      }
                      text={
                        data.books.length
                          ? "Try another title, author, or filter."
                          : "Your library stays with you, even when your Kobo is disconnected."
                      }
                      action={
                        data.books.length ? undefined : "Connect your Kobo"
                      }
                      onAction={() => navigate("import")}
                    />
                  )}
                </>
              )}
              {page === "knowledge" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">THE IDEAS YOU KEEP</span>
                      <h1>
                        Knowledge library<span className="green">.</span>
                      </h1>
                      <p className="subtitle">
                        From a passing thought to a lasting connection.
                      </p>
                    </div>
                    <span className="count-badge">
                      <Lightbulb size={17} />
                      {data.annotations.length} collected ideas
                    </span>
                  </div>
                  <div className="toolbar">
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="Search knowledge"
                        placeholder="Search highlights, notes, books, and authors…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <button
                      className={
                        favorites ? "filter-button selected" : "filter-button"
                      }
                      onClick={() => setFavorites(!favorites)}
                    >
                      <Heart size={15} />
                      Favorites
                    </button>
                    <select
                      aria-label="Filter by topic"
                      value={tag}
                      onChange={(e) => setTag(e.target.value)}
                    >
                      <option value="all">All topics</option>
                      {tags.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={includeArchived}
                        onChange={(e) => setIncludeArchived(e.target.checked)}
                      />
                      Include archived
                    </label>
                  </div>
                  <div className="results-label">
                    {annotations.length} ideas · original quotations and your
                    notes, kept separately
                  </div>
                  {annotations.length ? (
                    <>
                      <div className="annotation-grid knowledge-grid">
                        {annotations
                          .slice(0, knowledgeLimit)
                          .map(annotationCard)}
                      </div>
                      {annotations.length > knowledgeLimit && (
                        <button
                          className="secondary load-more"
                          onClick={() => setKnowledgeLimit((l) => l + 40)}
                        >
                          Show more ideas
                        </button>
                      )}
                    </>
                  ) : (
                    <Empty
                      title="Make room for a good idea"
                      text={
                        data.annotations.length
                          ? "No ideas match these filters."
                          : "Import your Kobo highlights and notes. Save favorites and connect ideas with shared topics."
                      }
                      action={
                        data.annotations.length
                          ? undefined
                          : "Import annotations"
                      }
                      onAction={() => navigate("import")}
                    />
                  )}
                  <section className="panel connections">
                    <div className="section-heading">
                      <h2>
                        <LinkIcon size={18} />
                        Connections across books
                      </h2>
                    </div>
                    <p className="muted">
                      Shared topics create a path between your books. Add the
                      same topic to highlights from different books.
                    </p>
                    {tags
                      .filter(
                        (t) =>
                          new Set(
                            data.knowledge
                              .filter((k) => k.tags.includes(t))
                              .map((k) => k.bookId),
                          ).size > 1,
                      )
                      .map((t) => (
                        <div key={t} className="connection">
                          <span className="pill">{t}</span>
                          {[
                            ...new Set(
                              data.knowledge
                                .filter((k) => k.tags.includes(t))
                                .map((k) => k.bookId),
                            ),
                          ].map((id) => (
                            <button
                              className="text-link"
                              key={id}
                              onClick={() => openBook(id)}
                            >
                              {data.books.find((b) => b.id === id)?.title}
                              <ArrowUpRight size={12} />
                            </button>
                          ))}
                        </div>
                      ))}
                  </section>
                  {data.reflections.length > 0 && (
                    <section>
                      <div className="section-heading">
                        <h2>Your reflections</h2>
                      </div>
                      <div className="annotation-grid">
                        {data.reflections
                          .filter(
                            (r) =>
                              !query ||
                              r.text
                                .toLocaleLowerCase()
                                .includes(query.toLocaleLowerCase()),
                          )
                          .map((r) => (
                            <article className="annotation" key={r.id}>
                              <span className="eyebrow">YOUR REFLECTION</span>
                              <p className="reflection-text">{r.text}</p>
                              <button
                                className="text-link"
                                onClick={() => openBook(r.bookId)}
                              >
                                {
                                  data.books.find((b) => b.id === r.bookId)
                                    ?.title
                                }
                                <ArrowUpRight size={13} />
                              </button>
                            </article>
                          ))}
                      </div>
                    </section>
                  )}
                </>
              )}
              {page === "import" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">BRING YOUR READING HOME</span>
                      <h1>
                        Connect your Kobo<span className="green">.</span>
                      </h1>
                      <p className="subtitle">
                        A simple connection. A whole library of possibilities.
                      </p>
                    </div>
                    <span className="count-badge">
                      <ShieldCheck size={16} />
                      100% local import
                    </span>
                  </div>
                  <div className="import-layout">
                    <section>
                      <div className="panel connect-panel">
                        <div className="connect-illustration">
                          <div className="ereader">
                            <BookOpen size={34} />
                            <div />
                            <div />
                            <span>YOUR NEXT CHAPTER</span>
                          </div>
                          <div className="usb-line" />
                          <Usb size={26} />
                        </div>
                        <h2>Meet your library again.</h2>
                        <p>
                          Connect your Kobo with USB, then tap{" "}
                          <strong>Connect</strong> on its screen.
                          <br />
                          Select the mounted Kobo folder to discover your
                          reading data.
                        </p>
                        <label className="field-label" htmlFor="device">
                          Device identity{" "}
                          <span>Reuse this name for incremental imports.</span>
                        </label>
                        <input
                          id="device"
                          className="text-input"
                          value={device}
                          maxLength={100}
                          onChange={(e) => {
                            setDevice(e.target.value);
                            setPreview(null);
                          }}
                        />
                        <div className="button-row">
                          <button
                            className="primary"
                            disabled={disabled || !device.trim()}
                            onClick={pickFolder}
                          >
                            <Usb size={17} />
                            Select Kobo folder
                          </button>
                          <button
                            className="secondary"
                            disabled={disabled || !device.trim()}
                            onClick={() => fileRef.current?.click()}
                          >
                            <Upload size={16} />
                            Select source files
                          </button>
                        </div>
                        <button
                          className="text-link"
                          disabled={disabled}
                          onClick={() => folderRef.current?.click()}
                        >
                          Use standard folder picker
                        </button>
                        <small className="muted">
                          Read-only access. No files on your Kobo are changed.
                        </small>
                        <input
                          className="sr-only"
                          type="file"
                          ref={folderRef}
                          aria-label="Select Kobo directory"
                          {...({
                            webkitdirectory: "",
                            directory: "",
                          } as object)}
                          multiple
                          onChange={(e) => {
                            selectFiles(
                              Array.from(e.target.files || []).map((f) => ({
                                path: f.webkitRelativePath || f.name,
                                file: f,
                              })),
                            );
                            e.target.value = "";
                          }}
                        />
                        <input
                          className="sr-only"
                          type="file"
                          ref={fileRef}
                          aria-label="Select Kobo source files"
                          multiple
                          onChange={(e) => {
                            selectFiles(
                              Array.from(e.target.files || []).map((f) => ({
                                path: f.name,
                                file: f,
                              })),
                            );
                            e.target.value = "";
                          }}
                        />
                      </div>
                      {preview && (
                        <section
                          className="panel preview"
                          aria-label="Import preview"
                        >
                          <div className="section-heading">
                            <h2>Your import preview</h2>
                            <span className="pill">Ready to review</span>
                          </div>
                          <p className="muted">
                            {preview.sources.join(" + ") ||
                              "No supported sources"}{" "}
                            · {preview.deviceId}
                          </p>
                          <div className="preview-counts">
                            <div>
                              <strong>
                                {preview.books.filter(isReadingBook).length}
                              </strong>
                              <span>reading-library records</span>
                            </div>
                            <div>
                              <strong>{preview.annotations.length}</strong>
                              <span>annotations</span>
                            </div>
                            <div>
                              <strong>{preview.sessions.length}</strong>
                              <span>recorded intervals</span>
                            </div>
                          </div>
                          <p className="muted">
                            {
                              preview.books.filter((b) =>
                                data.books.some((x) => x.id === b.id),
                              ).length
                            }{" "}
                            existing books will update. Absent books and
                            annotations stay in your library.
                          </p>
                          {preview.diagnostics.length > 0 && (
                            <div className="diagnostics">
                              <strong>Import diagnostics</strong>
                              {preview.diagnostics.map((d, i) => (
                                <p key={i}>
                                  <AlertCircle size={14} />
                                  {d}
                                </p>
                              ))}
                            </div>
                          )}
                          {candidates.length > 0 && (
                            <details>
                              <summary>
                                Possible duplicate editions · kept separate
                              </summary>
                              {candidates.slice(0, 10).map((g, i) => (
                                <p key={i}>
                                  {g[0].title} ·{" "}
                                  {g.map((b) => b.source).join(", ")}
                                </p>
                              ))}
                              <p>
                                Matching titles do not prove identical editions.
                                Source records remain separate for review.
                              </p>
                            </details>
                          )}
                          <p className="muted">
                            {
                              preview.books.filter((b) => !isReadingBook(b))
                                .length
                            }{" "}
                            store previews/catalog records will be kept
                            separately and excluded from your shelf and
                            statistics by default.
                          </p>
                          <div className="preview-books">
                            {preview.books
                              .filter(isReadingBook)
                              .slice(0, 8)
                              .map((b) => (
                                <div key={b.id}>
                                  <BookOpen size={15} />
                                  <span>
                                    {b.title}
                                    <small>{b.author}</small>
                                  </span>
                                  <span className="source">{b.source}</span>
                                </div>
                              ))}
                          </div>
                          <div className="button-row">
                            <button
                              className="primary"
                              disabled={disabled || !preview.books.length}
                              onClick={async () => {
                                setBusy("Committing your import…");
                                try {
                                  setData(
                                    await call<Library>("commit", preview),
                                  );
                                  setPreview(null);
                                  setNotice(
                                    "Your reading library is safely stored on this device.",
                                  );
                                  navigate("library");
                                } catch (e) {
                                  setError(
                                    e instanceof Error ? e.message : String(e),
                                  );
                                } finally {
                                  setBusy("");
                                }
                              }}
                            >
                              <Check size={16} />
                              Import into my library
                            </button>
                            <button
                              className="secondary"
                              disabled={disabled}
                              onClick={() => setPreview(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </section>
                      )}
                    </section>
                    <aside>
                      <section className="panel import-help">
                        <span className="eyebrow">A QUICK GUIDE</span>
                        <h2>Three little steps.</h2>
                        {[
                          [
                            "01",
                            "Plug in & connect",
                            "Connect by USB and enable storage mode on your Kobo.",
                          ],
                          [
                            "02",
                            "Choose your source",
                            "Select the mounted folder, or choose individual databases and sidecars.",
                          ],
                          [
                            "03",
                            "Review & bring it home",
                            "Preview your data, confirm, and disconnect when you’re ready.",
                          ],
                        ].map(([n, t, p]) => (
                          <div className="step" key={n}>
                            <span>{n}</span>
                            <div>
                              <h3>{t}</h3>
                              <p>{p}</p>
                            </div>
                          </div>
                        ))}
                        <div className="divider" />
                        <strong>Native Kobo + KOReader + Kobalt</strong>
                        <p className="muted">
                          KoboReader.sqlite · statistics.sqlite3 · kobalt.sqlite
                          · metadata.*.lua
                        </p>
                        <details>
                          <summary>Can’t see hidden folders?</summary>
                          <p>
                            Press Cmd + Shift + . in the macOS picker. Open
                            .kobo for the native database, or
                            .adds/koreader/settings for statistics. Select
                            sidecars separately if needed.
                          </p>
                          <p>
                            For a database with WAL/journal files, use the
                            included snapshot helper described in the README.
                            Keep companion files selected so the app can detect
                            them.
                          </p>
                        </details>
                      </section>
                    </aside>
                  </div>
                  <section className="panel history">
                    <div className="section-heading">
                      <h2>Import history</h2>
                      <span className="counter">{data.snapshots.length}</span>
                    </div>
                    {data.snapshots.length ? (
                      data.snapshots
                        .slice()
                        .reverse()
                        .map((s) => (
                          <div className="history-row" key={s.id}>
                            <span className="history-icon">
                              <Check size={17} />
                            </span>
                            <div>
                              <strong>{s.deviceId}</strong>
                              <small>
                                {date(s.at)} · {s.books} books · {s.annotations}{" "}
                                annotations
                              </small>
                              {s.diagnostics.length > 0 && (
                                <details>
                                  <summary>
                                    {s.diagnostics.length} diagnostics
                                  </summary>
                                  {s.diagnostics.map((d, i) => (
                                    <p key={i}>{d}</p>
                                  ))}
                                </details>
                              )}
                            </div>
                            <span className="pill">Saved locally</span>
                          </div>
                        ))
                    ) : (
                      <p className="muted">
                        Your first connection is the start of something good.
                      </p>
                    )}
                  </section>
                </>
              )}
              {page === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">MAKE YOURSELF AT HOME</span>
                      <h1>
                        Settings<span className="green">.</span>
                      </h1>
                      <p className="subtitle">
                        Your library. Your device. Your choices.
                      </p>
                    </div>
                  </div>
                  <div className="settings-grid">
                    <section className="panel">
                      <h2>Appearance</h2>
                      <p className="muted">
                        A comfortable space, day or night.
                      </p>
                      <div className="setting-row">
                        <span>
                          {theme === "light" ? "Light mode" : "Dark mode"}
                        </span>
                        <button className="secondary" onClick={toggleTheme}>
                          {theme === "light" ? (
                            <Moon size={16} />
                          ) : (
                            <Sun size={16} />
                          )}
                          Switch to {theme === "light" ? "dark" : "light"}
                        </button>
                      </div>
                    </section>
                    <section className="panel">
                      <h2>Local database</h2>
                      <p className="muted">{data.storage}</p>
                      <dl className="database-info">
                        <div>
                          <dt>Schema version</dt>
                          <dd>1</dd>
                        </div>
                        <div>
                          <dt>Library</dt>
                          <dd>
                            {data.books.length} books ·{" "}
                            {data.annotations.length} annotations
                          </dd>
                        </div>
                        <div>
                          <dt>Search</dt>
                          <dd>
                            {data.fts
                              ? "FTS5 available · Unicode UI search"
                              : "Unicode full-text fallback"}
                          </dd>
                        </div>
                        <div>
                          <dt>Browser storage</dt>
                          <dd>{storageEstimate}</dd>
                        </div>
                      </dl>
                      <button
                        className="secondary"
                        onClick={async () => {
                          const granted = await navigator.storage?.persist();
                          setNotice(
                            granted
                              ? "Persistent storage granted by browser."
                              : "Browser did not grant persistent storage. Keep regular backups.",
                          );
                        }}
                      >
                        Request persistent storage
                      </button>
                    </section>
                    <section className="panel">
                      <h2>Backup & restore</h2>
                      <p className="muted">
                        A portable copy of your books, annotations, topics, and
                        reflections.
                      </p>
                      <div className="button-row">
                        <button
                          className="primary"
                          disabled={disabled}
                          onClick={exportBackup}
                        >
                          <Download size={16} />
                          Download backup
                        </button>
                        <button
                          className="secondary"
                          disabled={disabled}
                          onClick={() => restoreRef.current?.click()}
                        >
                          <Upload size={16} />
                          Restore backup
                        </button>
                      </div>
                      <div className="storage-warning">
                        <AlertCircle size={17} />
                        <p>
                          Clearing browser data can erase this library. Back up
                          regularly. Restoring replaces the current library
                          after confirmation.
                        </p>
                      </div>
                      <input
                        className="sr-only"
                        type="file"
                        ref={restoreRef}
                        accept="application/json,.json"
                        aria-label="Restore library backup"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;
                          try {
                            if (f.size > 250_000_000)
                              throw Error("Backup exceeds 250 MB limit");
                            const raw = JSON.parse(await f.text());
                            setRestore(raw);
                            setConfirm("restore");
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : "Invalid backup",
                            );
                          }
                        }}
                      />
                    </section>
                    <section className="panel">
                      <h2>Privacy, by design</h2>
                      <div className="privacy-list">
                        <p>
                          <ShieldCheck size={17} />
                          No accounts, analytics, or annotation uploads.
                        </p>
                        <p>
                          <BookOpen size={17} />
                          Covers use local files first, with optional Open
                          Library lookup.
                        </p>
                        <p>
                          <Usb size={17} />
                          Your Kobo filesystem is never modified.
                        </p>
                      </div>
                      <p className="muted">
                        AI and cloud sync are future extensions. Manual cover
                        lookup and enabled automatic enrichment share book
                        metadata with Open Library. Quotes and notes stay
                        private.
                      </p>
                    </section>
                    <section className="panel danger-panel">
                      <h2>Clear local library</h2>
                      <p className="muted">
                        Remove all imported and personal data from this browser.
                        Your Kobo stays untouched.
                      </p>
                      <button
                        className="danger"
                        disabled={disabled}
                        onClick={() => setConfirm("clear")}
                      >
                        Clear library…
                      </button>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <BookOpen size={14} /> Kobo Books Summary
            </span>
            <span>For the life between the pages.</span>
            <span>
              <ShieldCheck size={13} />
              Private by nature.
            </span>
          </footer>
        </main>
      </div>
      {coverTarget && (
        <CoverLookup
          book={coverTarget}
          onClose={() => setCoverTarget(null)}
          onSave={(cover, pageUrl) =>
            mutate(
              "cover",
              { bookId: coverTarget.id, cover, pageUrl },
              "Cover saved locally.",
            )
          }
        />
      )}
      {tagEdit && (
        <Modal label="topic-title" onClose={() => setTagEdit(null)}>
          <h2 id="topic-title">Give this idea a home</h2>
          <p className="muted">
            Separate topics with commas. Shared topics connect ideas across
            books.
          </p>
          <input
            autoFocus
            aria-label="Topics separated by commas"
            className="text-input"
            value={tagEdit.value}
            maxLength={500}
            onChange={(e) => setTagEdit({ ...tagEdit, value: e.target.value })}
          />
          <div className="button-row">
            <button
              className="primary"
              disabled={disabled}
              onClick={async () => {
                const a = data.annotations.find((a) => a.id === tagEdit.id)!;
                await mutate("knowledge", {
                  id: a.id,
                  bookId: a.bookId,
                  favorite: knowledgeMap.get(a.id)?.favorite || false,
                  tags: [
                    ...new Set(
                      tagEdit.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    ),
                  ].slice(0, 20),
                });
                setTagEdit(null);
              }}
            >
              <Tag size={15} />
              Save topics
            </button>
            <button className="secondary" onClick={() => setTagEdit(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          label="confirm-title"
          alert
          onClose={() => {
            setConfirm(null);
            setRestore(null);
          }}
        >
          <h2 id="confirm-title">
            {confirm === "clear"
              ? "Clear your local library?"
              : "Replace your library with this backup?"}
          </h2>
          <p className="muted">
            {confirm === "clear"
              ? "This removes books, notes, reflections, and import history from this browser. Download a backup first if you want to keep them."
              : "The backup is validated before replacement. Existing data is preserved if validation or saving fails."}
          </p>
          <div className="button-row">
            <button
              className="danger"
              disabled={disabled}
              onClick={async () => {
                await mutate(
                  confirm === "clear" ? "clear" : "restore",
                  restore,
                  confirm === "clear"
                    ? "Local library cleared."
                    : "Backup restored.",
                );
                setConfirm(null);
                setRestore(null);
              }}
            >
              {confirm === "clear" ? "Clear everything" : "Restore & replace"}
            </button>
            <button
              className="secondary"
              onClick={() => {
                setConfirm(null);
                setRestore(null);
              }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
