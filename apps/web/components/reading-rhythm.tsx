"use client";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  ArrowUpRight,
} from "lucide-react";
import type { Library } from "../../../packages/core";
import { duration } from "../../../packages/analytics";
import {
  dayKey,
  recordedSessions,
  isTimed,
  bookTime,
  combineIntervals,
} from "../../../packages/analytics/rhythm";
import { readingTimeline } from "../../../packages/analytics/timeline";
import { groupBooks } from "../../../packages/core/grouping";
const names = { kobo: "Kobo", koreader: "KOReader", kobalt: "Kobalt" };
const calendarTime = (seconds: number) => {
  if (seconds < 60) return "<1m";
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h${minutes % 60 || ""}`;
};
export default function ReadingRhythm({
  library,
  onOpenBook,
  onImport,
}: {
  library: Library;
  onOpenBook: (id: string) => void;
  onImport: () => void;
}) {
  const [source, setSource] = useState("all");
  const timeline = useMemo(
    () => readingTimeline(library, source),
    [library, source],
  );
  const available = [...timeline.days.keys()].sort();
  const latest = available.at(-1) || dayKey(new Date().toISOString())!;
  const [month, setMonth] = useState(latest.slice(0, 7)),
    [selected, setSelected] = useState(latest);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1),
    offset = (first.getDay() + 6) % 7,
    count = new Date(y, m, 0).getDate();
  const monthDays = available.filter((d) => d.startsWith(month));
  const monthEntries = timeline.entries.filter((s) =>
    dayKey(s.start)!.startsWith(month),
  );
  const monthTime = combineIntervals(timeline.books, monthEntries);
  const estimated = monthEntries.some((s) => s.estimated);
  const groups = groupBooks(timeline.books);
  const books = new Map(
    groups.flatMap((g) =>
      g.members.map((b) => [b.id, { book: g.book, source: b.source }] as const),
    ),
  );
  const monthBooks = new Set(
    monthDays.flatMap((d) =>
      [...timeline.days.get(d)!.activity, ...timeline.days.get(d)!.entries].map(
        (s) => books.get(s.bookId)?.book.id || s.bookId,
      ),
    ),
  );
  const day = timeline.days.get(selected);
  const selectedEntries = day?.entries || [];
  const dayBooks = new Map<
    string,
    {
      ids: string[];
      title: string;
      entries: typeof selectedEntries;
      activity: NonNullable<typeof day>["activity"];
    }
  >();
  for (const row of [...(day?.activity || []), ...selectedEntries]) {
    const book = books.get(row.bookId)?.book;
    const id = book?.id || row.bookId;
    if (!dayBooks.has(id))
      dayBooks.set(id, {
        ids: [],
        title: book?.title || "Open book",
        entries: [],
        activity: [],
      });
    const item = dayBooks.get(id)!;
    if (!item.ids.includes(row.bookId)) item.ids.push(row.bookId);
  }
  for (const item of dayBooks.values()) {
    item.entries = selectedEntries.filter((s) => item.ids.includes(s.bookId));
    item.activity = (day?.activity || []).filter((s) =>
      item.ids.includes(s.bookId),
    );
  }
  const selectMonth = (value: string) => {
    if (
      !/^\d{4}-\d{2}$/.test(value) ||
      Number(value.slice(5)) < 1 ||
      Number(value.slice(5)) > 12 ||
      Number(value.slice(0, 4)) < 1900
    )
      return;
    setMonth(value);
    setSelected(available.find((d) => d.startsWith(value)) || value + "-01");
  };
  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    selectMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  };
  const valid = useMemo(() => recordedSessions(library), [library]);
  const timeLabel = (seconds: number | null, approx: boolean) =>
    seconds === null
      ? "Not recorded"
      : `${approx ? "≈ " : ""}${duration(seconds)}`;
  return (
    <div className="rhythm-page">
      <div className="page-heading">
        <div>
          <h1>
            Reading rhythm<span className="green">.</span>
          </h1>
        </div>
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
          <section
            className="rhythm-metrics"
            aria-label="Monthly reading summary"
          >
            <div>
              <span>Monthly reading time</span>
              <strong>
                {timeLabel(
                  monthEntries.length ? monthTime.seconds : null,
                  estimated,
                )}
              </strong>
            </div>
            <div>
              <span>Active days</span>
              <strong>{monthDays.length}</strong>
            </div>
            <div>
              <span>Books</span>
              <strong>{monthBooks.size}</strong>
            </div>
          </section>
          <p className="calendar-caption">
            {estimated ? "≈ Includes estimates. " : ""}Select a date for
            details. Read means duration is unavailable.
          </p>
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
              const date = month + "-" + String(i + 1).padStart(2, "0"),
                record = timeline.days.get(date);
              return (
                <button
                  key={date}
                  aria-label={`${date} · ${record ? (record.seconds === null ? "Reading activity recorded" : `${timeLabel(record.seconds, record.estimated)} ${record.estimated ? "estimated" : "recorded"}`) : "No recorded sessions"}`}
                  aria-pressed={selected === date}
                  className={`${record ? "has-reading" : ""} ${selected === date ? "selected" : ""}`}
                  onClick={() => setSelected(date)}
                >
                  <span>{i + 1}</span>
                  {record ? (
                    <small>
                      {record.seconds === null
                        ? "Read"
                        : `${record.estimated ? "≈" : ""}${calendarTime(record.seconds)}`}
                    </small>
                  ) : (
                    <span className="calendar-no-record" aria-hidden="true">
                      ·
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {!monthDays.length && (
            <p className="muted">
              No activity imported for this month.
              {available.length > 0
                ? ` Available history: ${available[0]} to ${available.at(-1)}.`
                : ""}
            </p>
          )}
        </section>
        <section className="panel rhythm-day" aria-label="Selected day reading">
          <h2>
            {new Date(selected + "T12:00:00").toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
            })}
          </h2>
          {day ? (
            <>
              <p className="day-total">
                {day.seconds === null
                  ? "Reading activity recorded · duration unavailable"
                  : `${timeLabel(day.seconds, day.estimated)}${day.estimated ? " · includes estimated elapsed time" : " recorded"} · ${new Set(selectedEntries.map((s) => s.id)).size} ${new Set(selectedEntries.map((s) => s.id)).size === 1 ? "session" : "sessions"}`}
              </p>
              {[...dayBooks].map(([id, item]) => {
                const total = combineIntervals(timeline.books, item.entries),
                  approx = item.entries.some((s) => s.estimated);
                const readers = [
                  ...new Set(
                    item.ids
                      .map((id) => books.get(id)?.source)
                      .filter((s) => !!s),
                  ),
                ]
                  .map((s) => names[s!])
                  .join(" · ");
                return (
                  <article className="reading-session" key={id}>
                    <div>
                      <span>{readers}</span>
                      {item.entries.length > 0 && (
                        <strong>{timeLabel(total.seconds, approx)}</strong>
                      )}
                    </div>
                    <button
                      className="text-link"
                      onClick={() => onOpenBook(item.ids[0])}
                    >
                      <BookOpen size={17} />
                      {item.title}
                      <ArrowUpRight size={16} />
                    </button>
                    {item.entries.length > 0 ? (
                      <details>
                        <summary>
                          {new Set(item.entries.map((s) => s.id)).size}{" "}
                          {new Set(item.entries.map((s) => s.id)).size === 1
                            ? "session"
                            : "sessions"}{" "}
                          · view times
                        </summary>
                        {item.entries.map((s) => (
                          <div
                            className="session-time-row"
                            key={s.id + s.start}
                          >
                            <time>
                              {s.startEstimated ? "≈ " : ""}
                              {new Date(s.start).toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {s.end
                                ? ` – ${new Date(s.end).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                                : ""}
                            </time>
                            <span>
                              {timeLabel(s.duration, s.estimated)} ·{" "}
                              {s.estimated ? "estimated" : "measured"}
                            </span>
                          </div>
                        ))}
                      </details>
                    ) : (
                      <p className="muted">
                        Duration unavailable ·{" "}
                        {
                          item.activity.filter(
                            (s) => s.evidence === "annotation",
                          ).length
                        }{" "}
                        annotation dates ·{" "}
                        {
                          item.activity.filter(
                            (s) => s.evidence === "reader-event",
                          ).length
                        }{" "}
                        reader events
                      </p>
                    )}
                  </article>
                );
              })}
            </>
          ) : (
            <p className="rhythm-no-record">
              No activity imported for this date.
            </p>
          )}
        </section>
      </div>
      <section
        className="panel rhythm-coverage"
        aria-label="Reader history coverage"
      >
        <details>
          <summary>History &amp; data coverage</summary>
          <div className="reader-history-grid">
            {Object.entries(names).map(([id, name]) => {
              const sourceBooks = library.books.filter((b) => b.source === id),
                ids = new Set(sourceBooks.map((b) => b.id)),
                records = valid.filter((s) => ids.has(s.bookId)),
                dates = records.map((s) => dayKey(s.start)!).sort(),
                totals = bookTime({ books: sourceBooks, sessions: records });
              return (
                <div key={id}>
                  <h3>{name}</h3>
                  <p>
                    {dates.length
                      ? `${dates[0]} → ${dates.at(-1)}`
                      : "No dated activity imported"}
                  </p>
                  <p>
                    {records.filter(isTimed).length} measured sessions ·{" "}
                    {new Set(dates).size} active days
                  </p>
                  <strong>
                    {totals.seconds === null
                      ? "Book time unavailable"
                      : `${duration(totals.seconds)} in lifetime book totals`}
                  </strong>
                </div>
              );
            })}
          </div>
          <p className="muted">
            Monthly time combines measured sessions with reconstructed Kobo
            intervals. Measured time takes priority for overlapping records of
            the same book. ≈ marks elapsed estimates, which may include idle
            time. Untimed activity adds active days, never invented hours.
            Lifetime book counters are not allocated to dates.
          </p>
          {timeline.reconstruction.typedEvents === 0 &&
            library.books.some((b) => b.source === "kobo") && (
              <p>
                Reimport your Kobo folder to include reconstructed sessions from
                start/end events.
              </p>
            )}
        </details>
      </section>
      {!available.length && (
        <button className="secondary" onClick={onImport}>
          Import reading history
        </button>
      )}
    </div>
  );
}
