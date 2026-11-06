import { BookOpen, ShieldCheck, Quote, Library } from "lucide-react";
import { Brand, BrandArtwork } from "../../components/brand";
import { appPath } from "../../lib/paths";
import { SUPPORT_URL, GITHUB_URL } from "../../lib/links";
export default function Welcome() {
  return (
    <main className="welcome">
      <nav>
        <a href={appPath("/")} className="brand">
          <Brand />
        </a>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          View on GitHub ↗
        </a>
      </nav>
      <section className="welcome-hero">
        <div className="welcome-hero-copy">
          <h1>
            Your reading,
            <br />
            remembered.
          </h1>
          <p>
            Your books, highlights, and ideas. One quiet place to make them
            yours.
          </p>
          <div className="actions">
            <a className="primary" href={appPath("/")}>
              Open App →
            </a>
            <a
              className="secondary"
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </div>
          <small>Free and open-source. No account required.</small>
        </div>
        <BrandArtwork className="welcome-brand-art" />
      </section>
      <section className="welcome-features">
        {[
          [
            BookOpen,
            "One reading home",
            "Import Kobo, KOReader and Kobalt. Keep books together with every reader’s progress preserved.",
          ],
          [
            Quote,
            "Keep the good parts",
            "Explore highlights, personal notes, topics and reflections in your knowledge library.",
          ],
          [
            Library,
            "See your reading life",
            "Browse your bookshelf, recorded activity, completion history and reading statistics.",
          ],
          [
            ShieldCheck,
            "Private by design",
            "Files are parsed in your browser. Your library stays on your device, with portable backups.",
          ],
        ].map(([Icon, title, text]) => (
          <article className="panel" key={String(title)}>
            {typeof Icon !== "string" && <Icon size={24} />}
            <h2>{String(title)}</h2>
            <p>{String(text)}</p>
          </article>
        ))}
      </section>
      <section
        className="welcome-import"
        aria-labelledby="welcome-import-title"
      >
        <span className="eyebrow">FROM YOUR READER TO YOUR READING SPACE</span>
        <h2 id="welcome-import-title">A few minutes. A library to keep.</h2>
        <ol>
          {[
            [
              "01",
              "Connect your Kobo",
              "Plug it into your computer with USB and tap Connect on its screen.",
            ],
            [
              "02",
              "Choose your reading data",
              "Our guide helps you find the Kobo folder, or the files for your reader.",
            ],
            [
              "03",
              "Make yourself at home",
              "Review and save, then disconnect. Your library stays in this browser.",
            ],
          ].map(([n, title, text]) => (
            <li key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        <a className="primary" href={appPath("/#import")}>
          Start guided import →
        </a>
      </section>
      <footer>
        <p>
          Browser storage can be cleared. Back up your library regularly.
          Optional Open Library lookups share book identifiers only after you
          enable them.
        </p>
        <a
          className="primary"
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Support Readmory on Ko-fi ↗
        </a>
        <p>
          Support this free and open-source project. Donations never unlock or
          restrict features.
        </p>
        <a
          href="https://github.com/alexivaner/kobo-books-summary/blob/main/PRIVACY.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy details
        </a>
      </footer>
    </main>
  );
}
