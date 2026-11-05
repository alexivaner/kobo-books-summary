"use client";
import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderOpen,
  ShieldCheck,
} from "lucide-react";
import ImportProgress, { type ImportTask } from "./import-progress";
const files = {
  kobo: {
    name: "Kobo",
    path: ".kobo/KoboReader.sqlite",
    help: "Your Kobo library, reading progress and native highlights.",
  },
  koreader: {
    name: "KOReader",
    path: ".adds/koreader/settings/statistics.sqlite3",
    help: "Reading statistics. Also select metadata files inside each book’s .sdr folder to include highlights and notes.",
  },
  kobalt: {
    name: "Kobalt",
    path: ".adds/kobalt/kobalt.sqlite",
    help: "Kobalt highlights, bookmarks and available reading history.",
  },
};
export default function ImportGuide({
  children,
  hasPreview,
  task,
}: {
  children: ReactNode;
  hasPreview: boolean;
  task: ImportTask | null;
}) {
  const [step, setStep] = useState(0),
    [os, setOs] = useState("mac"),
    [reader, setReader] = useState<keyof typeof files>("kobo");
  const active = hasPreview ? 2 : task ? 1 : step;
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [active]);
  return (
    <div className="import-guide">
      <ol className="import-stepper" aria-label="Import progress">
        {["Connect", "Choose files", "Review & save"].map((label, i) => (
          <li
            key={label}
            aria-current={i === active ? "step" : undefined}
            className={i < active ? "complete" : i === active ? "current" : ""}
          >
            <span>
              {i < active ? (
                <Check size={15} />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </span>
            {label}
          </li>
        ))}
      </ol>
      {task ? (
        <ImportProgress task={task} />
      ) : active === 0 ? (
        <>
          <h2 ref={heading} tabIndex={-1}>
            Connect your Kobo.
          </h2>
          <ol className="connection-checklist">
            <li>
              <span>1</span>
              <div>
                <strong>Plug in your Kobo</strong>
                <p>Use a data-capable USB cable.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Tap Connect on your Kobo</strong>
                <p>Wait for its USB connection screen.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Find KOBOeReader on your computer</strong>
                <p>
                  Look in Finder on Mac, This PC on Windows, or your file
                  manager on Linux.
                </p>
              </div>
            </li>
          </ol>
          <button className="primary guide-next" onClick={() => setStep(1)}>
            My Kobo is connected <ArrowRight size={16} />
          </button>
          <details className="guide-help">
            <summary>My Kobo doesn’t appear</summary>
            <p>
              Unlock your Kobo, reconnect the cable, and tap Connect on its
              screen. Try another USB port or a data-capable cable. You can also
              continue with saved source files from an earlier snapshot.
            </p>
            <button className="text-link" onClick={() => setStep(1)}>
              I have source files already <ArrowRight size={14} />
            </button>
          </details>
        </>
      ) : active === 1 ? (
        <>
          <div className="guide-step-title">
            <span className="guide-icon">
              <FolderOpen size={25} />
            </span>
            <div>
              <h2 ref={heading} tabIndex={-1}>
                Choose your files.
              </h2>
            </div>
          </div>
          <p className="guide-intro">
            Select the <strong>KOBOeReader</strong> drive, or choose individual
            files.
          </p>
          <div className="guide-picker">{children}</div>
          <details className="guide-help">
            <summary>
              Choosing individual files? Here’s where to find them.
            </summary>
            <div className="guide-tabs" aria-label="Reader file instructions">
              {Object.entries(files).map(([key, f]) => (
                <button
                  className={reader === key ? "selected" : ""}
                  aria-pressed={reader === key}
                  key={key}
                  onClick={() => setReader(key as keyof typeof files)}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <p>Inside KOBOeReader, find:</p>
            <code className="file-location">{files[reader].path}</code>
            <p>{files[reader].help}</p>
            <div className="guide-tabs" aria-label="Computer instructions">
              {[
                ["mac", "Mac"],
                ["windows", "Windows"],
                ["linux", "Linux"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={os === id ? "selected" : ""}
                  aria-pressed={os === id}
                  onClick={() => setOs(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p>
              {os === "mac" ? (
                <>
                  Folders starting with a dot are hidden. In the file picker,
                  press <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>.</kbd> to reveal
                  them.
                </>
              ) : os === "windows" ? (
                <>
                  Turn on <strong>View → Show → Hidden items</strong> in File
                  Explorer to find folders such as .kobo and .adds.
                </>
              ) : (
                <>
                  Press <kbd>Ctrl</kbd> + <kbd>H</kbd> in most file managers to
                  show hidden folders.
                </>
              )}
            </p>
            <p>You can select files from more than one reader.</p>
          </details>
          <button className="text-link guide-back" onClick={() => setStep(0)}>
            <ArrowLeft size={14} />
            Connection instructions
          </button>
        </>
      ) : null}
      <div className="guide-privacy" hidden={hasPreview || !!task}>
        <ShieldCheck size={16} />
        <span>Your files stay in this browser.</span>
      </div>
    </div>
  );
}
