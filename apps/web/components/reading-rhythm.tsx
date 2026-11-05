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
import { dayKey, recordedSessions } from "../../../packages/analytics/rhythm";
import { groupBooks } from "../../../packages/core/grouping";
const calendarTime = (seconds: number) => {
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
  const seconds = inMonth.reduce((n, s) => n + s.duration, 0),
    countBooks = new Set(
      inMonth.map((s) => books.get(s.bookId)?.book.id || s.bookId),
    ).size;
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1),
    offset = (first.getDay() + 6) % 7,
    count = new Date(y, m, 0).getDate();
  const selectedSessions = (days.get(selected) || [])
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
            "Recorded time",
            inMonth.length ? duration(seconds) : "Not recorded",
          ],
          ["Active days", days.size],
          ["Sessions", inMonth.length],
          ["Books", countBooks],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>
      {multiple && (
        <p className="rhythm-evidence">
          Reader records can overlap. Filter by reader to inspect separate
          totals.
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
                total = records.reduce((n, s) => n + s.duration, 0);
              return (
                <button
                  key={day}
                  aria-label={`${day} · ${records.length ? duration(total) + " recorded" : "No recorded sessions"}`}
                  aria-pressed={selected === day}
                  className={`${records.length ? "has-reading" : ""} ${selected === day ? "selected" : ""}`}
                  onClick={() => setSelected(day)}
                >
                  <span>{i + 1}</span>
                  {records.length ? (
                    <small>{calendarTime(total)}</small>
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
            Choose a day to see its sessions. Dates use this browser’s time
            zone.
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
          {selectedSessions.length ? (
            <>
              <p className="day-total">
                {duration(selectedSessions.reduce((n, s) => n + s.duration, 0))}{" "}
                recorded · {selectedSessions.length}{" "}
                {selectedSessions.length === 1 ? "session" : "sessions"}
              </p>
              <div className="reading-session-list">
                {selectedSessions.map((s) => {
                  const record = books.get(s.bookId);
                  return (
                    <article key={s.id} className="reading-session">
                      <div>
                        <span>{record ? names[record.source] : "Reader"}</span>
                        <time>
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
            </>
          ) : (
            <p className="rhythm-no-record">
              No sessions were recorded for this day. This doesn’t mean you
              didn’t read.
            </p>
          )}
        </section>
      </div>
      {!valid.length && (
        <section className="panel rhythm-help">
          <h2>No dated sessions yet</h2>
          <p>
            Kobo book totals do not provide a day-by-day history. Import
            KOReader statistics or Kobalt reading sessions to fill this
            calendar. Your book totals remain available in Overview.
          </p>
          <button className="secondary" onClick={onImport}>
            Import reading history
          </button>
        </section>
      )}
    </>
  );
}
