"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Download,
  Share2,
  X,
  BookOpen,
  ChartColumn,
  Loader2,
} from "lucide-react";
import { type Library, type Book, isReadingBook } from "../../../packages/core";
import { duration } from "../../../packages/analytics";
import {
  readingStatistics,
  rankBooks,
  periodLabel,
  type Period,
} from "../../../packages/analytics/statistics";
import { groupBooks } from "../../../packages/core/grouping";
import { createShareCard } from "../lib/share-card";
import Modal from "./modal";
const readers = { kobo: "Kobo", kobalt: "Kobalt", koreader: "KOReader" };
function Thumbnail({ book }: { book: Book }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="stats-cover">
      {book.cover && book.cover !== failed ? (
        <img
          src={book.cover}
          alt={`${book.title} cover`}
          onError={() => setFailed(book.cover || null)}
        />
      ) : (
        <span>
          <BookOpen size={21} />
          <strong>{book.title}</strong>
        </span>
      )}
    </span>
  );
}
export default function ReadingStatistics({
  library,
  onOpenBook,
  onRhythm,
}: {
  library: Library;
  onOpenBook: (id: string) => void;
  onRhythm: () => void;
}) {
  const [period, setPeriod] = useState<Period>({ year: null, month: null }),
    [source, setSource] = useState("all"),
    [by, setBy] = useState<"days" | "time">("days"),
    [limit, setLimit] = useState(10);
  const allStats = useMemo(
    () => readingStatistics(library, { year: null, month: null }, source),
    [library, source],
  );
  const stats = useMemo(
    () =>
      period.year === null
        ? allStats
        : readingStatistics(library, period, source),
    [allStats, library, period, source],
  );
  const yearOptions = [
    ...new Set([
      ...allStats.years,
      ...(period.year === null ? [] : [period.year]),
    ]),
  ].sort((a, b) => b - a);
  const ranked = useMemo(() => rankBooks(stats.rows, by), [stats.rows, by]);
  const year = period.year ?? stats.years[0] ?? new Date().getFullYear();
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        readingStatistics(library, { year, month: i + 1 }, source),
      ),
    [library, year, source],
  );
  const yearly = useMemo(
    () =>
      allStats.years.map((year) =>
        readingStatistics(library, { year, month: null }, source),
      ),
    [library, allStats.years, source],
  );
  const max = Math.max(
    1,
    ...months.map((s) => (s.incompleteTime ? 0 : s.seconds || 0)),
  );
  const [preview, setPreview] = useState(false),
    [showBooks, setShowBooks] = useState(true),
    [url, setUrl] = useState(""),
    [blob, setBlob] = useState<Blob | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const owned = useRef("");
  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    setBusy(true);
    setError("");
    setBlob(null);
    createShareCard(stats, ranked, { showBooks, by })
      .then((b) => {
        if (cancelled) return;
        if (owned.current) URL.revokeObjectURL(owned.current);
        owned.current = URL.createObjectURL(b);
        setUrl(owned.current);
        setBlob(b);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Unable to create card.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preview, stats, ranked, showBooks, by]);
  useEffect(
    () => () => {
      if (owned.current) URL.revokeObjectURL(owned.current);
    },
    [],
  );
  const filename = `readmory-${period.year ?? "all-time"}${period.month ? "-" + String(period.month).padStart(2, "0") : ""}.png`;
  const download = () => {
    if (!blob || !url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };
  const share = async () => {
    if (!blob) return;
    const file = new File([blob], filename, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] }))
        await navigator.share({
          files: [file],
          title: `My reading · ${periodLabel(period)}`,
        });
      else download();
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setError("Sharing is unavailable here. Use Download PNG instead.");
    }
  };
  const select = (p: Period) => {
    setPeriod(p);
    setLimit(10);
  };
  const ongoing = groupBooks(
    library.books.filter(
      (b) => isReadingBook(b) && (source === "all" || b.source === source),
    ),
  )
    .map((g) => g.book)
    .filter((b) => b.status === "reading")
    .sort((a, b) => (b.lastRead || "").localeCompare(a.lastRead || ""))
    .slice(0, 3);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Reading statistics<span className="green">.</span>
          </h1>
          <p className="subtitle">
            Your reading life, in a little more detail.
          </p>
        </div>
        <button
          className="primary"
          disabled={!stats.books && !stats.activeDays}
          onClick={() => {
            setUrl("");
            setBlob(null);
            setBusy(true);
            setPreview(true);
          }}
        >
          <Share2 size={19} />
          Create share card
        </button>
      </div>
      <div className="statistics-filters">
        <label>
          Year
          <select
            aria-label="Statistics year"
            value={period.year ?? "all"}
            onChange={(e) =>
              select({
                year: e.target.value === "all" ? null : Number(e.target.value),
                month: null,
              })
            }
          >
            <option value="all">All time</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          Month
          <select
            aria-label="Statistics month"
            disabled={period.year === null}
            value={period.month ?? "all"}
            onChange={(e) =>
              select({
                ...period,
                month: e.target.value === "all" ? null : Number(e.target.value),
              })
            }
          >
            <option value="all">Whole year</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {new Date(2026, i, 15).toLocaleDateString(undefined, {
                  month: "long",
                })}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reader
          <select
            aria-label="Statistics reader"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setLimit(10);
            }}
          >
            <option value="all">All readers</option>
            {Object.entries(readers).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button className="text-link" onClick={onRhythm}>
          Explore daily activity
          <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="section-heading">
        <h2>{periodLabel(period)}</h2>
        <span className="pill">
          {source === "all"
            ? "All readers"
            : readers[source as keyof typeof readers]}
        </span>
      </div>
      <section
        className="rhythm-summary"
        aria-label="Reading statistics summary"
      >
        {[
          [
            period.year === null
              ? "Recorded book time"
              : period.month === null
                ? "Yearly reading time"
                : "Monthly reading time",
            stats.seconds === null
              ? "Not recorded"
              : stats.incompleteTime
                ? "Incomplete"
                : `${stats.minimum ? "At least " : ""}${duration(stats.seconds)}`,
            stats.incompleteTime && stats.seconds !== null
              ? `${duration(stats.seconds)} in imported timed sessions`
              : "",
          ],
          ["Active days", stats.activeDays],
          ["Books explored", stats.books],
          ["Recorded finishes", stats.finished],
        ].map(([label, value, detail]) => (
          <div className="panel" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            {detail && <small className="time-coverage-detail">{detail}</small>}
          </div>
        ))}
      </section>
      {stats.incompleteTime && (
        <aside className="panel" aria-label="Incomplete time history">
          <strong>Incomplete time history</strong>
          <p>
            Some reading activity has no timed session record. Lifetime book
            totals cannot be assigned to this
            {period.month === null ? " year" : " month"}.
          </p>
          <p>
            Lifetime totals remain available under All time and on each book.
          </p>
        </aside>
      )}
      <p className="statistics-evidence">
        {period.year === null
          ? "All-time totals include undated book counters. Year and month views use dated sessions only."
          : "Dated sessions provide the time shown here. Reader events and annotation dates count toward active days, with no invented hours."}{" "}
        {stats.minimum
          ? "Overlapping records use a conservative minimum. "
          : ""}
        Finishes without a known date appear in all-time totals.
      </p>
      <section
        className="panel statistics-months"
        aria-label="Monthly reading breakdown"
      >
        <div className="section-heading">
          <h2>{year} by month</h2>
          <ChartColumn size={23} />
        </div>
        <div className="month-bars">
          {months.map((m, i) => (
            <button
              className={
                period.year === year && period.month === i + 1 ? "selected" : ""
              }
              key={i}
              aria-label={`${new Date(year, i, 15).toLocaleDateString(undefined, { month: "long", year: "numeric" })}: ${m.incompleteTime ? "incomplete time history, " : ""}${m.seconds === null ? "duration unavailable" : duration(m.seconds) + " in timed sessions"}, ${m.activeDays} active days`}
              onClick={() => select({ year, month: i + 1 })}
            >
              <span className="month-bar-track">
                <span
                  style={{
                    height: m.incompleteTime
                      ? "12%"
                      : m.seconds
                        ? `${Math.max(8, (m.seconds / max) * 100)}%`
                        : m.activeDays
                          ? "12%"
                          : "0%",
                  }}
                  className={
                    m.seconds === null || m.incompleteTime ? "date-only" : ""
                  }
                />
              </span>
              <strong>
                {new Date(year, i, 15).toLocaleDateString(undefined, {
                  month: "short",
                })}
              </strong>
              <small>
                {m.seconds === null
                  ? m.activeDays
                    ? "Read"
                    : "—"
                  : m.incompleteTime
                    ? "Partial"
                    : duration(m.seconds)}
              </small>
            </button>
          ))}
        </div>
        <p className="muted">
          Choose a month to explore it. Read means activity is recorded but its
          duration is unavailable. Partial means timed records cover only part
          of the activity.
        </p>
      </section>
      {yearly.length > 0 && (
        <details className="panel statistics-years">
          <summary>Compare years</summary>
          <div className="year-comparison">
            {yearly.map((y) => (
              <button
                key={y.period.year}
                onClick={() => select({ year: y.period.year, month: null })}
              >
                <strong>{y.period.year}</strong>
                <span>
                  {y.seconds === null
                    ? "Time not recorded"
                    : y.incompleteTime
                      ? `${duration(y.seconds)} in timed sessions · incomplete`
                      : `${y.minimum ? "At least " : ""}${duration(y.seconds)}`}
                </span>
                <span>
                  {y.activeDays} active days · {y.books} books
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        </details>
      )}
      <section className="statistics-ranking" aria-label="Most read books">
        <div className="section-heading">
          <h2>The books you return to</h2>
          <label>
            Rank by
            <select
              aria-label="Rank books by"
              value={by}
              onChange={(e) => setBy(e.target.value as "days" | "time")}
            >
              <option value="days">Active reading days</option>
              <option value="time">Recorded time</option>
            </select>
          </label>
        </div>
        <p className="muted">
          Active days include reader events and dated annotations. Multiple
          events on one date count as one day.
        </p>
        {ranked.length ? (
          <div className="statistics-book-list">
            {ranked.slice(0, limit).map((row, i) => (
              <button
                className="statistics-book"
                key={row.book.id}
                onClick={() => onOpenBook(row.book.id)}
              >
                <span className="book-rank">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Thumbnail book={row.book} />
                <span className="statistics-book-title">
                  <strong>{row.book.title}</strong>
                  <span>{row.book.author}</span>
                </span>
                <span className="statistics-book-values">
                  <strong>
                    {by === "days"
                      ? row.days
                        ? `${row.days} ${row.days === 1 ? "day" : "days"}`
                        : "Dates unavailable"
                      : row.seconds === null
                        ? "Time unavailable"
                        : `${row.minimum ? "≥ " : ""}${duration(row.seconds)}`}
                  </strong>
                  <span>
                    {by === "days"
                      ? row.seconds === null
                        ? "Time unavailable"
                        : `${duration(row.seconds)} ${period.year === null ? "lifetime" : "in dated sessions"}`
                      : row.days
                        ? `${row.days} active days`
                        : "Dates unavailable"}
                  </span>
                  {period.year !== null && row.unallocatedSeconds > 0 && (
                    <span>
                      Lifetime: {duration(row.lifetimeSeconds!)} · date split
                      unavailable
                    </span>
                  )}
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <div className="empty">
            <BookOpen size={28} />
            <h3>No recorded reading for this period</h3>
            <p>Try another year or import more reading history.</p>
          </div>
        )}
        {ranked.length > limit && (
          <button
            className="secondary load-more"
            onClick={() => setLimit((n) => n + 10)}
          >
            Show more books
          </button>
        )}
      </section>
      {ongoing.length > 0 && (
        <section className="panel statistics-continue">
          <h2>Continue reading</h2>
          <p className="muted">Your current books, across all dates.</p>
          <div>
            {ongoing.map((b) => (
              <button
                key={b.id}
                className="text-link"
                onClick={() => onOpenBook(b.id)}
              >
                <BookOpen size={18} />
                {b.title}
                <span>
                  {b.progress === null
                    ? "In progress"
                    : `${Math.round(b.progress)}%`}
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        </section>
      )}
      {preview && (
        <Modal label="share-card-title" onClose={() => setPreview(false)}>
          <div className="section-heading">
            <h2 id="share-card-title">Your reading, ready to share</h2>
            <button
              className="icon-button"
              aria-label="Close share card"
              onClick={() => setPreview(false)}
            >
              <X />
            </button>
          </div>
          <p className="muted">
            Generated on your device. Only the statistics and books shown here
            are included; your notes and highlights stay private.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={showBooks}
              onChange={(e) => setShowBooks(e.target.checked)}
            />
            Include book covers and titles
          </label>
          <p className="results-label">
            {periodLabel(period)} · Ranked by{" "}
            {by === "days" ? "active reading days" : "recorded time"}
          </p>
          {busy ? (
            <p role="status">
              <Loader2 className="spin" size={19} /> Creating your card…
            </p>
          ) : (
            url && (
              <img
                className="share-card-preview"
                src={url}
                alt={`Share card for ${periodLabel(period)}: ${stats.seconds === null ? "time unavailable" : duration(stats.seconds)}, ${stats.activeDays} active days, ${stats.books} books`}
              />
            )
          )}{" "}
          {error && <p role="alert">{error}</p>}
          <div className="button-row">
            <button
              className="primary"
              disabled={busy || !blob}
              onClick={download}
            >
              <Download size={18} />
              Download PNG
            </button>
            <button
              className="secondary"
              disabled={busy || !blob}
              onClick={share}
            >
              <Share2 size={18} />
              Share image
            </button>
          </div>
          <p className="muted">
            Share image opens your device’s sharing options when supported, or
            downloads the PNG. Nothing is posted automatically.
          </p>
        </Modal>
      )}
    </>
  );
}
