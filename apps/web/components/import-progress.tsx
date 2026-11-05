"use client";
import { useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";
export type ImportTask = {
  stage: "scan" | "read" | "parse" | "covers";
  completed?: number;
  total?: number;
};
const labels = {
  scan: "Finding your files",
  read: "Reading your files",
  parse: "Reading books & notes",
  covers: "Preparing covers",
};
export default function ImportProgress({ task }: { task: ImportTask }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const measured = ["read", "covers"].includes(task.stage) && !!task.total;
  return (
    <section className="import-processing" aria-label="Preparing import">
      <div className="processing-heading">
        <Loader2 size={23} className="spin" aria-hidden="true" />
        <h2 ref={title} tabIndex={-1}>
          Preparing your library
        </h2>
      </div>
      <div className="processing-label" role="status" aria-live="polite">
        <span>{labels[task.stage]}</span>
        <span>
          {measured
            ? `${task.completed || 0} of ${task.total} ${task.stage === "covers" ? "batches" : "files"}`
            : task.stage === "scan" && task.completed
              ? `${task.completed} found`
              : ""}
        </span>
      </div>
      <progress
        className="import-progress-bar"
        aria-label={labels[task.stage]}
        {...(measured ? { max: task.total, value: task.completed || 0 } : {})}
      />
      <ol className="processing-stages" aria-label="Preparation stages">
        {["Files", "Books & notes", "Covers"].map((label, i) => {
          const active =
            task.stage === "parse" ? 1 : task.stage === "covers" ? 2 : 0;
          return (
            <li
              key={label}
              className={i < active ? "done" : i === active ? "active" : ""}
            >
              {i < active ? (
                <Check size={14} />
              ) : (
                <span className="stage-dot" />
              )}
              {label}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
