"use client";
import { useMemo, useState } from "react";
import { type Library } from "../../../packages/core";
import { duration } from "../../../packages/analytics";
import {
  reconstructKoboSessions,
  koboSessionDays,
} from "../../../packages/analytics/kobo-sessions";
import {
  type Period,
  inPeriod,
  periodLabel,
} from "../../../packages/analytics/statistics";
export default function KoboSessionEstimates({
  library,
  period,
  source,
  onOpenBook,
}: {
  library: Library;
  period: Period;
  source: string;
  onOpenBook: (id: string) => void;
}) {
  const [limit, setLimit] = useState(20);
  const result = useMemo(() => reconstructKoboSessions(library), [library]);
  const rows = useMemo(
    () =>
      koboSessionDays(result.sessions).filter((s) => inPeriod(s.start, period)),
    [result, period],
  );
  const books = new Map(library.books.map((b) => [b.id, b]));
  if (
    (source !== "all" && source !== "kobo") ||
    !library.books.some((b) => b.source === "kobo")
  )
    return null;
  const seconds = rows.reduce((n, s) => n + s.seconds, 0);
  return (
    <section
      className="panel kobo-estimates"
      aria-label="Kobo session estimates"
    >
      <div className="section-heading">
        <div>
          <h2>Kobo session estimates</h2>
          <p className="muted">{periodLabel(period)}</p>
        </div>
      </div>
      {!result.typedEvents ? (
        <p>
          Reimport your Kobo folder to reconstruct dated sessions. Earlier
          imports did not retain the start/end event types needed for this view.
        </p>
      ) : (
        <>
          {rows.length ? (
            <div className="estimate-summary">
              <div>
                <strong>≈ {duration(seconds)}</strong>
                <span>Estimated elapsed time</span>
              </div>
              <div>
                <strong>{new Set(rows.map((s) => s.id)).size}</strong>
                <span>Paired sessions</span>
              </div>
              <div>
                <strong>{new Set(rows.map((s) => s.day)).size}</strong>
                <span>Days with paired sessions</span>
              </div>
            </div>
          ) : (
            <p>No usable paired sessions in this period.</p>
          )}
          <p>
            Reconstructed from Kobo reading start/end events. This is elapsed
            session time and may include idle time. It stays separate from
            measured reading time and lifetime book counters.
          </p>
          {rows.length > 0 && (
            <details>
              <summary>View dates, sessions &amp; books</summary>
              <div className="reading-session-list">
                {rows.slice(0, limit).map((s) => (
                  <article className="reading-session" key={s.id + s.day}>
                    <div>
                      <time>
                        {new Date(s.start).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                      <span>
                        {new Date(s.start).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        –{" "}
                        {new Date(s.end).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => onOpenBook(s.bookId)}
                    >
                      {books.get(s.bookId)?.title || "Open book"}
                    </button>
                    <strong>≈ {duration(s.seconds)} elapsed</strong>
                  </article>
                ))}
              </div>
              {limit < rows.length && (
                <button
                  className="secondary"
                  onClick={() => setLimit((n) => n + 20)}
                >
                  Show more sessions
                </button>
              )}
            </details>
          )}
          <p className="muted">
            Unmatched, ambiguous, overlapping and over-four-hour intervals are
            excluded.{" "}
            {result.skipped > 0
              ? `${result.skipped} event endpoints were excluded across the imported Kobo history. `
              : ""}
            Dates use this browser’s time zone; sessions crossing midnight are
            split between dates.
          </p>
        </>
      )}
    </section>
  );
}
