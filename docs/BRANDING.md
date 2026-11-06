# Readmory identity

The public product is Readmory, with the tagline “Your reading, remembered.” The supplied identity board defines forest green `#1B2B22`, deep green `#2F4A3C`, sage `#A9CC8A`, cream `#F7F3E9`, warm gray `#D2CCC1` and charcoal `#2B2B2B`.

The interface uses an editorial serif for headings/wordmark and the operating system’s sans-serif stack for controls and body text. No specific font family or font license was supplied, so the app uses local system fonts without third-party font requests.

The small book/bookmark mark is a responsive SVG interpretation of the supplied primary symbol. The R/book artwork in `apps/web/public/brand/readmory-r-icon.png` is copied unchanged from the owner-supplied Forest Green R Book Icon asset. CSS frames it for interface use; the original file is retained. The identity board and alternate source artwork remain outside the repository.

The GitHub repository is `alexivaner/readmory` and the public app is `https://alexivaner.github.io/readmory/`. Internal SQLite/IndexedDB, local-storage keys, source identifiers and backup format keep the existing `kobo-books-summary` identity for compatibility. The URL path change stays on the same origin and does not move or reset a library. New backup downloads use a Readmory filename; the established backup format remains readable. Brand assets are precached with content-based versioning for offline use.
