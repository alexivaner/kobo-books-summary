"use client";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  BookOpen,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";
import type { Library } from "../../../packages/core";
import { duration } from "../../../packages/analytics";
import {
  dayKey,
  recordedSessions,
  isTimed,
  combinedTime,
  bookTime,
} from "../../../packages/analytics/rhythm";
import { groupBooks } from "../../../packages/core/grouping";
import { readingStatistics } from "../../../packages/analytics/statistics";
const calendarTime = (seconds: number) => {
  if (seconds > 0 && seconds < 60) return "<1m";
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h${minutes % 60 || ""}`;
};
const names = { kobo: "Kobo", koreader: "KOReader", kobalt: "Kobalt" };
export default function ReadingRhythm({
  library,
  onOpenBook,
  onImport,
}: {
  library: Library;
  onOpenBook: (id: string) => void;
  onImport: () => void;
}) {
  const valid = useMemo(() => recordedSessions(library), [library]);
  const latest =
    valid
      .map((s) => dayKey(s.start)!)
      .sort()
      .at(-1) || dayKey(new Date().toISOString())!;
  const [month, setMonth] = useState(latest.slice(0, 7)),
    [selected, setSelected] = useState(latest),
    [source, setSource] = useState("all");
  const books = new Map(
    groupBooks(library.books).flatMap((g) =>
      g.members.map((b) => [b.id, { book: g.book, source: b.source }] as const),
    ),
  );
  const sessions = valid.filter(
    (s) => source === "all" || books.get(s.bookId)?.source === source,
  );
  const inMonth = sessions.filter((s) => dayKey(s.start)!.startsWith(month));
  const days = new Map<string, typeof sessions>();
  for (const s of inMonth) {
    const key = dayKey(s.start)!;
    days.set(key, [...(days.get(key) || []), s]);
  }
  const timed = inMonth.filter(isTimed);
  const allTime = bookTime(library);
  const countBooks = new Set(
    inMonth.map((s) => books.get(s.bookId)?.book.id || s.bookId),
  ).size;
  const [y, m] = month.split("-").map(Number);
  const stats = readingStatistics(library, { year: y, month: m }, source);
  const lifetimeSeconds = stats.rows.some((r) => r.lifetimeSeconds !== null)
    ? stats.rows.reduce((n, r) => n + (r.lifetimeSeconds || 0), 0)
    : null;
  const first = new Date(y, m - 1, 1),
    offset = (first.getDay() + 6) % 7,
    count = new Date(y, m, 0).getDate();
  const selectedRecords = days.get(selected) || [];
  const selectedActivity = new Map<string, typeof selectedRecords>();
  for (const r of selectedRecords.filter((r) => !isTimed(r))) {
    const record = books.get(r.bookId);
    const id = `${record?.source || "reader"}|${record?.book.id || r.bookId}`;
    selectedActivity.set(id, [...(selectedActivity.get(id) || []), r]);
  }
  const selectedTime = combinedTime({
    books: library.books,
    sessions: selectedRecords,
  });
  const selectedSessions = selectedRecords
    .filter(isTimed)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const selectMonth = (value: string) => {
    if (
      !/^\d{4}-\d{2}$/.test(value) ||
      Number(value.slice(5)) < 1 ||
      Number(value.slice(5)) > 12 ||
      Number(value.slice(0, 4)) < 1900
    )
      return;
    setMonth(value);
    setSelected(value + "-01");
  };
  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    selectMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  };
  const multiple =
    new Set(inMonth.map((s) => books.get(s.bookId)?.source)).size > 1;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Reading rhythm<span className="green">.</span>
          </h1>
          <p className="subtitle">
            Explore your recorded reading, one day at a time.
          </p>
        </div>
        <CalendarDays size={28} />
      </div>
      <div className="rhythm-toolbar">
        <div className="month-picker">
          <button
            className="icon-button"
            aria-label="Previous month"
            onClick={() => shift(-1)}
          >
            <ChevronLeft />
          </button>
          <label>
            Month
            <input
              type="month"
              aria-label="Reading month"
              value={month}
              onChange={(e) => selectMonth(e.target.value)}
            />
          </label>
          <button
            className="icon-button"
            aria-label="Next month"
            onClick={() => shift(1)}
          >
            <ChevronRight />
          </button>
        </div>
        <label>
          Reader
          <select
            aria-label="Rhythm reader"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="all">All readers</option>
            {Object.entries(names).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="rhythm-summary" aria-label="Monthly reading summary">
        {[
          [
            "Monthly reading time",
            stats.seconds === null
              ? "Not recorded"
              : stats.incompleteTime
                ? "Incomplete"
                : `${stats.minimum ? "At least " : ""}${duration(stats.seconds)}`,
            `${timed.length ? duration(stats.seconds!) : "No time"} in ${timed.length} imported timed ${timed.length === 1 ? "session" : "sessions"}`,
          ],
          ["Active days", days.size],
          [
            "Book totals · all time",
            lifetimeSeconds === null
              ? "Not recorded"
              : duration(lifetimeSeconds),
            "For books active this month",
          ],
          ["Books", countBooks],
        ].map(([label, value, detail]) => (
          <div className="panel" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            {detail && <small className="time-coverage-detail">{detail}</small>}
          </div>
        ))}
      </section>
      {stats.incompleteTime && (
        <p
          className="rhythm-evidence"
          role="note"
          aria-label="Monthly time coverage"
        >
          Your monthly total is unavailable because some reading activity has no
          timed session record. Book totals include hours from all dates and
          cannot be divided into days or months.
        </p>
      )}
      {multiple && (
        <p className="rhythm-evidence">
          Overlapping records for the same book use the largest recorded
          duration. Filter by reader to inspect original records.
        </p>
      )}
      <div className="rhythm-layout">
        <section
          className="panel rhythm-calendar"
          aria-label="Reading calendar"
        >
          <h2>
            {first.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <div className="calendar-weekdays" aria-hidden="true">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-days">
            {Array.from({ length: offset }, (_, i) => (
              <span key={"blank" + i} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const day = month + "-" + String(i + 1).padStart(2, "0"),
                records = days.get(day) || [],
                total = combinedTime({
                  books: library.books,
                  sessions: records,
                }).seconds;
              return (
                <button
                  key={day}
                  aria-label={`${day} · ${records.length ? (total > 0 ? duration(total) + " recorded" : "Reading activity recorded") : "No recorded sessions"}`}
                  aria-pressed={selected === day}
                  className={`${records.length ? "has-reading" : ""} ${selected === day ? "selected" : ""}`}
                  onClick={() => setSelected(day)}
                >
                  <span>{i + 1}</span>
                  {records.length ? (
                    <small>{total > 0 ? calendarTime(total) : "Read"}</small>
                  ) : (
                    <span className="calendar-no-record" aria-hidden="true">
                      ·
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="calendar-caption">
            Read marks dated activity without a measured duration. Dates use
            this browser’s time zone.
          </p>
        </section>
        <section className="panel rhythm-day" aria-label="Selected day reading">
          <div className="section-heading">
            <h2>
              {new Date(selected + "T12:00:00").toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
              })}
            </h2>
            <Clock size={20} />
          </div>
          {selectedRecords.length ? (
            <>
              <p className="day-total">
                {selectedSessions.length
                  ? `${selectedTime.overlaps ? "At least " : ""}${duration(selectedTime.seconds)} recorded · ${selectedSessions.length} ${selectedSessions.length === 1 ? "session" : "sessions"}`
                  : "Reading activity recorded · duration unavailable"}
              </p>
              <div className="reading-session-list">
                {selectedSessions.map((s) => {
                  const record = books.get(s.bookId);
                  return (
                    <article key={s.id} className="reading-session">
                      <div>
                        <span>{record ? names[record.source] : "Reader"}</span>
                        <time>
                          {s.startEstimated ? "≈ " : ""}
                          {new Date(s.start).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <button
                        className="text-link"
                        onClick={() => onOpenBook(s.bookId)}
                      >
                        <BookOpen size={17} />
                        {record?.book.title || "Open book"}
                        <ArrowUpRight size={16} />
                      </button>
                      <strong>{duration(s.duration)}</strong>
                    </article>
                  );
                })}
              </div>
              {[...selectedActivity].map(([id, records]) => {
                const record = books.get(records[0].bookId);
                const events = records.filter(
                  (r) => r.evidence === "reader-event",
                ).length;
                const annotations = records.filter(
                  (r) => r.evidence === "annotation",
                ).length;
                const source = record ? names[record.source] : "Reader";
                return (
                  <article className="reading-session" key={id}>
                    <div>
                      <span>
                        {source} ·{" "}
                        {[
                          events ? `${events} reader events` : "",
                          annotations
                            ? `${annotations} annotation ${annotations === 1 ? "date" : "dates"}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Last-read timestamp"}
                      </span>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => onOpenBook(records[0].bookId)}
                    >
                      <BookOpen size={17} />
                      {record?.book.title || "Open book"}
                      <ArrowUpRight size={16} />
                    </button>
                    <p className="muted">
                      Activity is recorded for this date; its active duration is
                      unavailable.
                    </p>
                  </article>
                );
              })}
            </>
          ) : (
            <p className="rhythm-no-record">
              No sessions were recorded for this day. This doesn’t mean you
              didn’t read.
            </p>
          )}
        </section>
      </div>
      <section
        className="panel rhythm-coverage"
        aria-label="Reader history coverage"
      >
        <div className="section-heading">
          <h2>History from every reader</h2>
        </div>
        <div className="reader-history-grid">
          {Object.entries(names).map(([id, name]) => {
            const sourceBooks = library.books.filter((b) => b.source === id);
            const ids = new Set(sourceBooks.map((b) => b.id));
            const records = valid.filter((r) => ids.has(r.bookId));
            const dates = records.map((r) => dayKey(r.start)!).sort();
            const totals = bookTime({ books: sourceBooks, sessions: records });
            return (
              <div key={id}>
                <h3>{name}</h3>
                <p>
                  {dates.length
                    ? `${dates[0]} → ${dates.at(-1)}`
                    : "No dated activity imported"}
                </p>
                <p>
                  {records.filter(isTimed).length} timed sessions ·{" "}
                  {new Set(dates).size} active days
                </p>
                <strong>
                  {totals.seconds === null
                    ? "Book time unavailable"
                    : `${duration(totals.seconds)} in book totals`}
                </strong>
              </div>
            );
          })}
        </div>
        <p className="rhythm-evidence">
          All-time book totals:{" "}
          {allTime.seconds === null
            ? "unavailable"
            : `${allTime.minimum ? "at least " : ""}${duration(allTime.seconds)}`}
          . These totals are kept separate from monthly time. Kobo event history
          and annotation/last-read dates can be partial; missing dates do not
          mean you did not read. Approximate session start times use ≈.
        </p>
      </section>
      {!valid.length && (
        <section className="panel rhythm-help">
          <h2>No dated sessions yet</h2>
          <p>
            Import your Kobo folder to combine native Kobo activity, KOReader
            statistics and Kobalt sessions. Book totals without dated evidence
            cannot fill a daily calendar.
          </p>
          <button className="secondary" onClick={onImport}>
            Import reading history
          </button>
        </section>
      )}
    </>
  );
}
