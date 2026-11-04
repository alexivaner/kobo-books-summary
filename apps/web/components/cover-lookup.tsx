"use client";
import { useState } from "react";
import { Search, Download, Loader2 } from "lucide-react";
import type { Book } from "../../../packages/core";
import {
  findCovers,
  fetchCover,
  type CoverCandidate,
} from "../../../packages/covers";
import Modal from "./modal";
export default function CoverLookup({
  book,
  onClose,
  onSave,
}: {
  book: Book;
  onClose: () => void;
  onSave: (cover: string, pageUrl: string) => Promise<boolean>;
}) {
  const [candidates, setCandidates] = useState<CoverCandidate[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal label="cover-title" onClose={onClose}>
      <h2 id="cover-title">Find a cover</h2>
      <p className="muted">
        Only after you choose to search, this browser will contact Open Library.
        It shares this book’s ISBN, or its title and author if no ISBN is
        available. Your annotations and notes stay private.
      </p>
      <div className="cover-query">
        <strong>{book.title}</strong>
        <p>{book.author}</p>
        {book.isbn && <small>ISBN {book.isbn}</small>}
      </div>
      <p className="muted">
        Artwork is supplied by Open Library and may be unavailable or belong to
        another edition. Review the match before saving. A private browser copy
        remains available offline.
      </p>
      {error && (
        <p role="alert" className="banner error">
          {error}
        </p>
      )}
      {candidates === null ? (
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setCandidates(await findCovers(book));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Lookup failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
          Search Open Library
        </button>
      ) : (
        <div className="cover-candidates">
          {!candidates.length && (
            <p className="muted">
              No matching covers found. Your generated or local cover stays
              available.
            </p>
          )}
          {candidates.map((c) => (
            <div key={c.imageUrl}>
              <strong>{c.title}</strong>
              <p className="muted">{c.author}</p>
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const image = await fetchCover(c);
                    if (await onSave(image, c.pageUrl)) onClose();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Unable to load cover",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Download size={15} />
                Use this cover
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="button-row">
        <button className="secondary" onClick={onClose}>
          Close
        </button>
        <a
          className="text-link"
          href="https://openlibrary.org/dev/docs/api/covers"
          target="_blank"
          rel="noreferrer"
        >
          About Open Library covers ↗
        </a>
      </div>
    </Modal>
  );
}
