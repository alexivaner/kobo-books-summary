"use client";
import { useState } from "react";
import { BookOpen, Link, Unlink } from "lucide-react";
import type { Book } from "../../../packages/core";
import { readingHistory } from "../../../packages/core/history";
import { BookHistory } from "./book-history";
const names = { kobo: "Kobo", kobalt: "Kobalt", koreader: "KOReader" };
const date = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not recorded";
export default function ReaderSources({
  members,
  books,
  disabled,
  onCombine,
  onSeparate,
}: {
  members: Book[];
  books: Book[];
  disabled: boolean;
  onCombine: (id: string) => void;
  onSeparate: () => void;
}) {
  const [target, setTarget] = useState("");
  const ids = new Set(members.map((b) => b.id));
  return (
    <section className="panel reader-sources" aria-label="Reader sources">
      <div className="source-heading">
        <div>
          <span className="eyebrow">ONE BOOK, EVERY READER</span>
          <h2>Reader sources</h2>
        </div>
        <span className="pill">
          {members.length} {members.length === 1 ? "source" : "sources"}
        </span>
      </div>
      <p className="source-explainer">
        Your shelf shows the latest recorded progress.
      </p>
      <div className="reader-source-grid">
        {members.map((b) => {
          const h = b.readingHistory || readingHistory(b);
          return (
            <article className="reader-source-card" key={b.id}>
              <header>
                <span className="source-reader">
                  <BookOpen size={16} />
                  {names[b.source]}
                </span>
                <span className={`source-state ${b.status}`}>
                  {b.status === "finished"
                    ? "Finished"
                    : b.status === "reading"
                      ? "In progress"
                      : b.status === "unread"
                        ? "Not started"
                        : "Status unavailable"}
                </span>
              </header>
              <div className="source-progress">
                <strong>
                  {b.progress === null ? "—" : `${Math.round(b.progress)}%`}
                </strong>
                <span>
                  {b.progress === null ? "Progress not recorded" : "read"}
                </span>
              </div>
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${b.progress ?? 0}%` }} />
              </div>
              <dl className="source-facts">
                <div>
                  <dt>Last read</dt>
                  <dd>{date(b.lastRead)}</dd>
                </div>
                <div>
                  <dt>Completion</dt>
                  <dd>
                    {h.everFinished ? "Previously finished" : "Not recorded"}
                  </dd>
                </div>
              </dl>
              <details className="source-record">
                <summary>History & original record</summary>
                <p className="original-book-title">{b.title}</p>
                <BookHistory book={b} compact />
              </details>
            </article>
          );
        })}
      </div>
      <details className="book-match-settings">
        <summary>
          <Link size={15} />
          Manage book matches
        </summary>
        <p>
          Combine copies of the same edition and language into one shelf entry.
          You can separate them again; original notes and progress are kept.
        </p>
        <div className="book-match-controls">
          <label htmlFor="combine-book">
            Combine with another shelf entry
            <select
              id="combine-book"
              aria-label="Combine with another shelf entry"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose the same book / edition…</option>
              {books
                .filter((b) => !ids.has(b.id))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} · {b.author} · {b.source}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="secondary"
            disabled={!target || disabled}
            onClick={() => {
              onCombine(target);
              setTarget("");
            }}
          >
            <Link size={15} />
            Combine selected book
          </button>
        </div>
        {members.length > 1 && (
          <button
            className="text-link separate-sources"
            disabled={disabled}
            onClick={onSeparate}
          >
            <Unlink size={14} />
            Keep sources separate
          </button>
        )}
      </details>
    </section>
  );
}
