import type { Book } from "../../../packages/core";
import {
  readingHistory,
  readingHistoryLabel,
} from "../../../packages/core/history";
const date = (s: string) =>
  new Date(s).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
export function BookHistory({
  book,
  compact = false,
}: {
  book: Book;
  compact?: boolean;
}) {
  const h = book.readingHistory || readingHistory(book);
  return (
    <section
      className={
        compact ? "history-panel compact-history" : "panel history-panel"
      }
      aria-label="Book completion and rereading history"
    >
      {!compact && <h2>Reading history</h2>}
      <strong>{readingHistoryLabel(book)}</strong>
      <dl className="database-info">
        <div>
          <dt>Ever finished</dt>
          <dd>
            {h.everFinished
              ? "Yes · recorded by reader/import history"
              : "No completion recorded"}
          </dd>
        </div>
        {h.everFinished && (
          <div>
            <dt>Recorded completions</dt>
            <dd>At least {h.completionCountMinimum}</dd>
          </div>
        )}
        {book.lastStartedAt && (
          <div>
            <dt>Last reading start</dt>
            <dd>{date(book.lastStartedAt)}</dd>
          </div>
        )}
      </dl>
      {h.completedDates.map((d) => (
        <p className="muted" key={d}>
          Recorded completion: {date(d)}
        </p>
      ))}
      {h.everFinished && !h.completedDates.length && (
        <p className="muted">
          Completion is recorded, but its date is unavailable.
        </p>
      )}
      {h.rereadingEvidence !== "none" && (
        <p className="muted">
          {h.rereadingEvidence === "observed-status-change"
            ? "A finished → reading state change was observed across imports."
            : "Rereading is inferred from a previous completion date/marker and the current reading state."}{" "}
          This does not establish an exact lifetime reread count.
        </p>
      )}
      {book.sourceStartCount !== undefined && (
        <p className="muted">
          Reader start counter: {book.sourceStartCount}. Starts/opens are not
          counted as rereads.
        </p>
      )}
    </section>
  );
}
export function EnrichedMetadata({ book }: { book: Book }) {
  const e = book.enrichment;
  const r = book.readerMetadata;
  if (!e && !r) return null;
  const m = e?.metadata;
  return (
    <section
      className="panel metadata-panel"
      aria-label="Additional book metadata"
    >
      <h2>Book metadata</h2>
      {r && (
        <>
          <span className="eyebrow">
            FROM YOUR {r.source.toUpperCase()} RECORD
          </span>
          <dl className="database-info">
            {r.publisher && (
              <div>
                <dt>Publisher</dt>
                <dd>{r.publisher}</dd>
              </div>
            )}
            {r.language && (
              <div>
                <dt>Language</dt>
                <dd>{r.language}</dd>
              </div>
            )}
            {r.series && (
              <div>
                <dt>Series</dt>
                <dd>
                  {r.series}
                  {r.seriesNumber ? " · " + r.seriesNumber : ""}
                </dd>
              </div>
            )}
            {book.isbn && (
              <div>
                <dt>ISBN</dt>
                <dd>{book.isbn}</dd>
              </div>
            )}
          </dl>
          {r.description && (
            <details className="muted">
              <summary>Book description</summary>
              <p>{r.description}</p>
            </details>
          )}
          <div className="divider" />
        </>
      )}
      {m ? (
        <>
          <span className="eyebrow">OPEN LIBRARY · WORK-LEVEL METADATA</span>
          <dl className="database-info">
            <div>
              <dt>Catalog title</dt>
              <dd>{m.title}</dd>
            </div>
            <div>
              <dt>Authors</dt>
              <dd>{m.authors.join(", ") || "Unavailable"}</dd>
            </div>
            {m.firstPublishedYear !== undefined && (
              <div>
                <dt>First publication</dt>
                <dd>{m.firstPublishedYear} (work)</dd>
              </div>
            )}
            <div>
              <dt>Languages</dt>
              <dd>{m.languages.join(", ") || "Unavailable"}</dd>
            </div>
            {m.publishers.length > 0 && (
              <div>
                <dt>Catalog publishers</dt>
                <dd>{m.publishers.join(", ")}</dd>
              </div>
            )}
          </dl>
          {m.subjects.length > 0 && (
            <div className="tag-row">
              {m.subjects.map((s) => (
                <span className="pill" key={s}>
                  {s}
                </span>
              ))}
            </div>
          )}
          <p className="muted">
            These catalog fields supplement the reader’s original metadata. They
            may describe another edition.
          </p>
          <a
            href={m.pageUrl}
            className="text-link"
            target="_blank"
            rel="noreferrer"
          >
            Source: Open Library ↗
          </a>
        </>
      ) : (
        <p className="muted">
          {e?.status === "needs-review"
            ? "Multiple editions need review."
            : e?.status === "not-found"
              ? "No confident metadata match was found."
              : e?.message ||
                "Optional Open Library enrichment has not found a match yet."}
        </p>
      )}
    </section>
  );
}
