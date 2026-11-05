import { it, expect } from "vitest";
import { analytics } from "../packages/analytics";
import { personalNoteText } from "../packages/knowledge";
import {
  readingDays,
  recordedSessions,
  dayKey,
} from "../packages/analytics/rhythm";
import { emptyLibrary, type Annotation, type Session } from "../packages/core";
const note = (change: Partial<Annotation> = {}): Annotation => ({
  id: "a",
  bookId: "b",
  source: "kobo",
  sourceId: "a",
  text: "A highlighted passage",
  note: "My own thought",
  location: "1",
  created: null,
  modified: null,
  sourceDeleted: false,
  ...change,
});
it("keeps personal notes distinct from quotations and recognizes standalone notes", () => {
  expect(personalNoteText(note())).toBe("My own thought");
  const counts = analytics({
    ...emptyLibrary,
    annotations: [note({ kind: "note", note: "", text: "Standalone thought" })],
  });
  expect(counts.notes).toBe(1);
  expect(counts.highlights).toBe(0);
  expect(
    personalNoteText(
      note({ note: "", kind: "note", text: "Standalone thought" }),
    ),
  ).toBe("Standalone thought");
  expect(personalNoteText(note({ note: "  ", kind: "highlight" }))).toBe("");
});
it("uses valid recorded sessions, without turning book totals into dated activity", () => {
  const s: Session = {
    id: "s",
    bookId: "b",
    start: "2026-09-21T12:00:00Z",
    duration: 600,
    kind: "recorded",
  };
  const library = {
    ...emptyLibrary,
    sessions: [
      s,
      s,
      { ...s, id: "zero", duration: 0 },
      { ...s, id: "bad", start: "unknown" },
      { ...s, id: "other", duration: 300 },
    ],
  };
  expect(recordedSessions(library)).toHaveLength(2);
  const days = readingDays(library);
  expect(days.size).toBe(1);
  expect(days.get(dayKey(s.start)!)?.seconds).toBe(900);
  expect(readingDays(emptyLibrary).size).toBe(0);
  expect(dayKey("invalid")).toBeNull();
});
