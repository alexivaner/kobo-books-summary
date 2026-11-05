"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  type Book,
  type Enrichment,
  isReadingBook,
} from "../../../packages/core";
import {
  pendingBooks,
  lookupBatch,
  lookupKey,
  downloadMatchedCover,
  ProviderPause,
  type Update,
  MATCHER_VERSION,
  lookupQueryKey,
} from "../../../packages/enrichment";
import { groupBooks } from "../../../packages/core/grouping";
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const cancel = () => {
      clearTimeout(t);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const t = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
export default function AutomaticEnrichment({
  books: sourceBooks,
  enabled,
  onToggle,
  onSave,
  compact = false,
  onManage,
}: {
  compact?: boolean;
  onManage?: () => void;
  books: Book[];
  enabled: boolean;
  onToggle: (v: boolean) => void;
  onSave: (updates: Update[]) => Promise<void>;
}) {
  const books = useMemo(
    () => groupBooks(sourceBooks.filter(isReadingBook)).map((g) => g.book),
    [sourceBooks],
  );
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, [enabled]);
  const [running, setRunning] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    controller = useRef<AbortController | null>(null);
  const reading = books.filter(isReadingBook),
    matched = reading.filter((b) => b.enrichment?.status === "matched").length,
    review = reading.filter(
      (b) => b.enrichment?.status === "needs-review",
    ).length,
    missing = reading.filter(
      (b) => b.enrichment?.status === "not-found",
    ).length;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (
      !enabled ||
      running ||
      controller.current ||
      !navigator.onLine ||
      Number(localStorage.getItem("kobo-enrichment-backoff") || 0) > Date.now()
    )
      return;
    const work = pendingBooks(books);
    if (!work.length) return;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setError("");
    async function run() {
      const latestRecords = new Map(work.map((b) => [b.id, b.enrichment]));
      const save = async (updates: Update[]) => {
        await onSave(updates);
        for (const u of updates) latestRecords.set(u.bookId, u.record);
      };
      let lastRequest = 0;
      const requestSlot = async () => {
        const remaining = 4000 - (Date.now() - lastRequest);
        if (remaining > 0) await wait(remaining, abort.signal);
        abort.signal.throwIfAborted();
        lastRequest = Date.now();
      };
      try {
        const known = work.filter(
            (b) => b.enrichment?.status === "matched" && b.enrichment.metadata,
          ),
          unknown = work.filter((b) => !known.includes(b));
        const groups = [
          ...new Map(unknown.map((b) => [lookupKey(b), true])).keys(),
        ];
        const coverWork: { book: Book; record: Enrichment }[] = known.map(
          (book) => ({ book, record: book.enrichment! }),
        );
        for (let i = 0; i < groups.length; i += 1) {
          const keys = new Set(groups.slice(i, i + 1));
          const batch = unknown.filter((b) => keys.has(lookupKey(b)));
          setMessage(
            `Looking up metadata · ${Math.min(i + 1, groups.length)} of ${groups.length} grouped titles`,
          );
          await requestSlot();
          const updates = await lookupBatch(batch, abort.signal);
          abort.signal.throwIfAborted();
          await save(updates);
          for (const update of updates) {
            const book = batch.find((b) => b.id === update.bookId)!;
            if (
              update.record.status === "matched" &&
              update.record.coverStatus === "pending"
            )
              coverWork.push({ book, record: update.record });
          }
        }
        const cached = new Map<number, string>();
        let processed = 0;
        for (const { book, record } of coverWork) {
          abort.signal.throwIfAborted();
          setMessage(`Caching covers · ${++processed} of ${coverWork.length}`);
          let cover: string | undefined;
          try {
            const id = record.metadata?.coverId;
            if (id && cached.has(id)) cover = cached.get(id);
            else {
              await requestSlot();
              cover = await downloadMatchedCover(record, abort.signal);
              if (id && cover) cached.set(id, cover);
            }
            await save([
              {
                bookId: book.id,
                record: {
                  ...record,
                  coverStatus: cover ? "cached" : "unavailable",
                },
                cover,
              },
            ]);
          } catch (e) {
            if (e instanceof ProviderPause || abort.signal.aborted) throw e;
            await save([
              {
                bookId: book.id,
                record: {
                  ...record,
                  coverStatus: "unavailable",
                  message: e instanceof Error ? e.message : "Cover unavailable",
                },
              },
            ]);
          }
        }
        setMessage(
          "Automatic lookup finished. Uncertain and unavailable matches remain labeled.",
        );
      } catch (e) {
        if (!abort.signal.aborted) {
          const text =
            e instanceof Error ? e.message : "Automatic lookup failed";
          setError(text);
          const next = Date.now() + 15 * 60 * 1000;
          localStorage.setItem("kobo-enrichment-backoff", String(next));
          const retry = new Date(next).toISOString();
          const unresolved = work.filter((b) => {
            const r = latestRecords.get(b.id);
            return (
              !r ||
              r.status === "error" ||
              (r.status === "matched" && r.coverStatus === "pending")
            );
          });
          await onSave(
            unresolved.map((b) => {
              const r = latestRecords.get(b.id);
              return {
                bookId: b.id,
                record: {
                  ...(r || {}),
                  status: r?.status === "matched" ? "matched" : "error",
                  checkedAt: new Date().toISOString(),
                  nextRetryAt: retry,
                  message: text.slice(0, 500),
                },
              };
            }),
          ).catch(() => {});
        }
      } finally {
        controller.current = null;
        setRunning(false);
      }
    }
    void run();
  }, [enabled, books, onSave, running, tick]);
  if (compact) {
    if (!enabled) return null;
    return (
      <div
        className="banner auto-status"
        aria-label="Automatic enrichment status"
      >
        <span>
          {running ? <Loader2 className="spin" size={14} /> : null}{" "}
          {running
            ? message
            : `${matched} metadata matches · ${reading.filter((b) => !!b.cover).length} covers · ${review + missing} unresolved`}
          {error ? " · Lookup paused" : ""}
        </span>
        <button className="text-link" onClick={onManage}>
          Manage automatic lookup
        </button>
      </div>
    );
  }
  return (
    <section
      className="panel enrichment-panel"
      aria-label="Automatic cover and metadata lookup"
    >
      <div className="section-heading">
        <h2>Automatic covers & metadata</h2>
        <label className="check-label">
          <input
            aria-label="Enable automatic covers and metadata"
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              if (!e.target.checked) controller.current?.abort();
              else localStorage.removeItem("kobo-enrichment-backoff");
              onToggle(e.target.checked);
            }}
          />
          Enabled
        </label>
      </div>
      <p className="muted">
        When enabled, this browser sends reading-library titles/authors or ISBNs
        to Open Library in grouped requests. Store previews are excluded.
        Quotes, notes and reflections stay private. Confident matches are saved
        automatically; source metadata stays intact.
      </p>
      <div className="enrichment-stats">
        <span>{matched} metadata matches</span>
        <span>
          {reading.filter((b) => !!b.cover).length} cached/local covers
        </span>
        <span>{review} need review</span>
        <span>{missing} unavailable</span>
      </div>
      {message && (
        <p className="muted" role="status">
          {running && <Loader2 className="spin" size={13} />} {message}
        </p>
      )}
      {error && (
        <p className="muted" role="alert">
          {error} Retry is delayed to respect the provider.
        </p>
      )}
      {!running &&
        enabled &&
        review +
          missing +
          reading.filter(
            (b) =>
              b.enrichment?.status === "error" ||
              (b.enrichment?.status === "matched" && !b.cover),
          ).length >
          0 && (
          <button
            className="secondary"
            onClick={() =>
              onSave(
                reading
                  .filter(
                    (b) =>
                      b.enrichment &&
                      (b.enrichment.status !== "matched" || !b.cover),
                  )
                  .map((b) => ({
                    bookId: b.id,
                    record: {
                      ...b.enrichment!,
                      status:
                        b.enrichment?.status === "matched"
                          ? "matched"
                          : "error",
                      coverStatus: b.enrichment?.metadata?.coverId
                        ? "pending"
                        : "unavailable",
                      matcherVersion: MATCHER_VERSION,
                      queryKey: lookupQueryKey(b),
                      nextRetryAt: new Date().toISOString(),
                    },
                  })),
              ).catch((e) => setError(String(e)))
            }
          >
            <RefreshCw size={14} />
            Retry unresolved matches
          </button>
        )}
      <p className="muted">
        Work-level metadata can differ from your edition.{" "}
        <a href="https://openlibrary.org" target="_blank" rel="noreferrer">
          Open Library ↗
        </a>
      </p>
    </section>
  );
}
