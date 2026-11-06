# Project account and privacy

This is Ivan's personal open-source project, owned by `alexivaner`.

- Use only `alexivaner` for this project's GitHub operations. Do not use a company account or change global Git/GitHub settings.
- Set and verify repository-local Git identity before committing: `Ivan Surya Hutomo`, `57290644+alexivaner@users.noreply.github.com`.
- The repository-local credential helper selects the personal account. For `gh` operations, obtain the `alexivaner` token in subprocess memory and pass it as `GH_TOKEN`; never print or write the token. Verify the authenticated API user's login is `alexivaner` before mutations.
- Keep real Kobo databases, books, annotations, backups and screenshots out of source control and public artifacts. Use synthetic fixtures in committed tests.
- Preserve existing browser storage, backups and source identifiers when changing the interface.

# Verification

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and relevant Playwright regressions. Use an isolated browser profile for tests. Leave the user's existing development server and browser library intact. Deployment is GitHub Pages from `main`, with `/readmory` as its production base path.
