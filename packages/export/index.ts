import type { Annotation, Book, Reflection } from "../core";
export function markdown(
  book: Book,
  annotations: Annotation[],
  reflections: Reflection[],
) {
  return (
    `# ${book.title}\n\n${book.author}\n\nSource: ${book.source}\n\n` +
    annotations
      .map(
        (a) =>
          `${a.text
            .split("\n")
            .map((l) => "> " + l)
            .join(
              "\n",
            )}\n\n${a.note ? "**Personal note**\n\n" + a.note + "\n\n" : ""}${a.location ? "Location: " + a.location + "\n\n" : ""}${a.sourceDeleted ? "Archived source annotation\n\n" : ""}`,
      )
      .join("---\n\n") +
    "## My reflections\n\n" +
    reflections.map((r) => r.text).join("\n\n---\n\n")
  );
}
