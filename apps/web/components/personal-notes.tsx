"use client";
import { useState } from "react";
import { StickyNote, Search, BookOpen, ArrowUpRight } from "lucide-react";
import type { Library } from "../../../packages/core";
import { personalNoteText } from "../../../packages/knowledge";
import { groupBooks } from "../../../packages/core/grouping";
const names = { kobo: "Kobo", koreader: "KOReader", kobalt: "Kobalt" };
export default function PersonalNotes({
  library,
  onOpenBook,
}: {
  library: Library;
  onOpenBook: (id: string) => void;
}) {
  const [mode, setMode] = useState<"reader" | "reflections">(() =>
      library.annotations.some((a) => personalNoteText(a)) ||
      !library.reflections.length
        ? "reader"
        : "reflections",
    ),
    [query, setQuery] = useState(""),
    [source, setSource] = useState("all"),
    [archived, setArchived] = useState(false),
    [limit, setLimit] = useState(30);
  const groups = groupBooks(library.books);
  const books = new Map(
    groups.flatMap((g) => g.members.map((b) => [b.id, g.book] as const)),
  );
  const readerNotes = library.annotations.filter(
    (a) => !!personalNoteText(a) && (archived || !a.sourceDeleted),
  );
  const match = (text: string, id: string) =>
    [text, books.get(id)?.title, books.get(id)?.author]
      .join(" ")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .includes(query.normalize("NFKC").toLocaleLowerCase().trim());
  const notes = readerNotes
    .filter(
      (a) =>
        (source === "all" || a.source === source) &&
        match(personalNoteText(a) + " " + a.text, a.bookId),
    )
    .sort((a, b) =>
      (b.modified || b.created || "").localeCompare(
        a.modified || a.created || "",
      ),
    );
  const reflections = library.reflections
    .filter((r) => match(r.text, r.bookId))
    .sort((a, b) => b.created.localeCompare(a.created));
  const count = mode === "reader" ? notes.length : reflections.length;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Personal notes<span className="green">.</span>
          </h1>
          <p className="subtitle">Your own words, kept together.</p>
        </div>
        <StickyNote size={28} />
      </div>
      <div className="view-switch" aria-label="Note type">
        <button
          aria-pressed={mode === "reader"}
          onClick={() => {
            setMode("reader");
            setLimit(30);
          }}
        >
          Reader notes <span>{readerNotes.length}</span>
        </button>
        <button
          aria-pressed={mode === "reflections"}
          onClick={() => {
            setMode("reflections");
            setLimit(30);
          }}
        >
          My reflections <span>{library.reflections.length}</span>
        </button>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={20} />
          <input
            aria-label="Search personal notes"
            placeholder="Search your words, books, or authors…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(30);
            }}
          />
        </label>
        {mode === "reader" && (
          <>
            <select
              aria-label="Notes reader"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setLimit(30);
              }}
            >
              <option value="all">All readers</option>
              {Object.entries(names).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <label className="check-label">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              Include archived
            </label>
          </>
        )}
      </div>
      <p className="results-label">
        {count} {count === 1 ? "note" : "notes"}
      </p>
      {count ? (
        <div className="personal-notes-grid">
          {mode === "reader"
            ? notes.slice(0, limit).map((a) => (
                <article className="annotation note-card" key={a.id}>
                  <div className="note-card-meta">
                    <span>
                      <StickyNote size={17} />
                      {names[a.source]}
                      {a.sourceDeleted ? " · Archived" : ""}
                    </span>
                    <time>
                      {a.created
                        ? new Date(a.created).toLocaleDateString()
                        : "Date not recorded"}
                    </time>
                  </div>
                  <p className="own-note-text">{personalNoteText(a)}</p>
                  {a.text &&
                    a.kind !== "note" &&
                    a.text.trim() !== personalNoteText(a) && (
                      <details className="note-context">
                        <summary>
                          {a.kind === "bookmark"
                            ? "Bookmark passage"
                            : "Highlighted passage"}
                        </summary>
                        <blockquote>{a.text}</blockquote>
                      </details>
                    )}
                  <button
                    className="text-link note-book-link"
                    onClick={() => onOpenBook(a.bookId)}
                  >
                    <BookOpen size={17} />
                    {books.get(a.bookId)?.title || "Open book"}
                    <ArrowUpRight size={16} />
                  </button>
                </article>
              ))
            : reflections.slice(0, limit).map((r) => (
                <article className="annotation note-card" key={r.id}>
                  <div className="note-card-meta">
                    <span>
                      <StickyNote size={17} />
                      Your reflection
                    </span>
                    <time>{new Date(r.created).toLocaleDateString()}</time>
                  </div>
                  <p className="own-note-text">{r.text}</p>
                  <button
                    className="text-link note-book-link"
                    onClick={() => onOpenBook(r.bookId)}
                  >
                    <BookOpen size={17} />
                    {books.get(r.bookId)?.title || "Open book"}
                    <ArrowUpRight size={16} />
                  </button>
                </article>
              ))}
        </div>
      ) : (
        <div className="empty">
          <StickyNote size={30} />
          <h2>
            {query
              ? "No matching notes"
              : mode === "reader"
                ? "Your notes will appear here"
                : "A place for your own thoughts"}
          </h2>
          <p>
            {mode === "reader"
              ? "Import notes from your reader. Highlights with an attached personal note appear here too."
              : "Open a book and save a reflection to keep it here."}
          </p>
        </div>
      )}
      {count > limit && (
        <button
          className="secondary load-more"
          onClick={() => setLimit((n) => n + 30)}
        >
          Show more notes
        </button>
      )}
    </>
  );
}
