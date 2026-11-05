import type { Book, ReadingHistory } from "./index";
export type Attempt = {
  bookId: string;
  status: Book["status"];
  finishedAt: string | null;
  lastRead: string | null;
  progress: number | null;
};
/** A source's completion statement is evidence; an import observation is never a fabricated finish date. */
export function readingHistory(
  book: Book,
  previous?: Book,
  attempts: Attempt[] = [],
): ReadingHistory {
  const valid = (x: unknown): x is string =>
    typeof x === "string" && !Number.isNaN(Date.parse(x));
  const completedDates = [
    ...new Set(
      [
        ...(previous?.readingHistory?.completedDates || []),
        ...(book.readingHistory?.completedDates || []),
        previous?.finishedAt,
        book.finishedAt,
        ...attempts.map((a) => a.finishedAt),
      ].filter(valid),
    ),
  ].sort();
  let runs = 0,
    last: Book["status"] = "unknown";
  for (const a of attempts) {
    if (a.status === "finished" && last !== "finished") runs++;
    last = a.status;
  }
  if (!attempts.length && previous) {
    last = previous.status;
    if (last === "finished") runs = 1;
  }
  if (book.status === "finished" && last !== "finished") runs++;
  const everFinished =
    completedDates.length > 0 ||
    book.status === "finished" ||
    previous?.status === "finished" ||
    !!book.sourceCompletionMarker ||
    !!previous?.readingHistory?.everFinished ||
    runs > 0;
  const completionCountMinimum = Math.max(
    completedDates.length,
    runs,
    previous?.readingHistory?.completionCountMinimum || 0,
    everFinished ? 1 : 0,
  );
  const oldFinished =
    attempts.some((a) => a.status === "finished") ||
    previous?.status === "finished";
  const latest = completedDates.at(-1);
  const laterReading =
    !!latest &&
    [book.lastRead, book.lastStartedAt].some((t) => valid(t) && t > latest);
  let rereadingEvidence: ReadingHistory["rereadingEvidence"] = "none";
  if (
    book.status === "reading" &&
    (book.progress === null || book.progress < 100)
  ) {
    if (oldFinished && (!latest || laterReading))
      rereadingEvidence = "observed-status-change";
    else if (laterReading) rereadingEvidence = "completion-date-and-progress";
    else if (book.sourceCompletionMarker && (book.progress ?? 0) > 0)
      rereadingEvidence = "completion-marker-and-progress";
    else if (
      previous?.readingHistory?.rereadingEvidence &&
      previous.readingHistory.rereadingEvidence !== "none"
    )
      rereadingEvidence = previous.readingHistory.rereadingEvidence;
  }
  return {
    everFinished,
    completedDates,
    completionCountMinimum,
    rereadingEvidence,
  };
}
export function readingHistoryLabel(book: Book) {
  const h = book.readingHistory || readingHistory(book);
  if (h.rereadingEvidence === "observed-status-change")
    return "Rereading · observed status change";
  if (h.rereadingEvidence !== "none") return "Rereading · inferred";
  if (h.everFinished) return "Previously finished";
  return "No completion recorded";
}
