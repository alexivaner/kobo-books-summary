import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const fixture = path.resolve("fixtures/generated/KoboReader.sqlite");
async function importFile(page: import("@playwright/test").Page) {
  await page
    .getByRole("button", { name: "Connect Kobo", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(fixture);
  await page.getByRole("button", { name: "Import into my library" }).click();
  await expect(
    page.getByRole("heading", { name: "The Quiet Atlas", exact: true }),
  ).toBeVisible();
}
test("manual combine and split preserve annotations and latest progress across reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await importFile(page);
  await page
    .getByRole("heading", { name: "The Quiet Atlas", exact: true })
    .click();
  await page.getByText("Manage book matches", { exact: true }).click();
  await page
    .getByLabel("Combine with another shelf entry")
    .selectOption({ label: "Small Observations · Robin Lane · kobo" });
  await page
    .getByRole("button", { name: "Combine selected book", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Reader sources" }),
  ).toContainText("Small Observations");
  if (
    (await page.locator(".book-match-settings").getAttribute("open")) !== null
  )
    await page.getByText("Manage book matches", { exact: true }).click();
  await page
    .locator(".reader-sources")
    .screenshot({ path: "/private/tmp/kobo-reader-sources.png" });
  await page.getByRole("button", { name: "My library", exact: true }).click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.locator(".book-card").click();
  await page.getByText("Manage book matches", { exact: true }).click();
  await page.getByRole("button", { name: "Keep sources separate" }).click();
  await page.getByRole("button", { name: "My library", exact: true }).click();
  await expect(page.locator(".book-card")).toHaveCount(2);
});
test("SQLite OPFS survives a browser process restart without network upload", async () => {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), "kobo-browser-persistence-"),
  );
  const options = {
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  };
  let context:
    Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    context = await chromium.launchPersistentContext(dir, options);
    const page = await context.newPage();
    const external: string[] = [];
    context.on("request", (req) => {
      if (!new URL(req.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
        external.push(req.url());
    });
    await page.goto(
      (process.env.TEST_BASE_URL || "http://127.0.0.1:3000") + "/",
    );
    await expect(page.getByText("Opening your local library…")).toBeHidden();
    await importFile(page);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(
      page.getByText("OPFS · SQLite WASM", { exact: true }),
    ).toBeVisible();
    expect(external).toEqual([]);
    await context.close();
    context = undefined;
    context = await chromium.launchPersistentContext(dir, options);
    const reopened = await context.newPage();
    await reopened.goto(
      (process.env.TEST_BASE_URL || "http://127.0.0.1:3000") + "/#library",
    );
    await expect(
      reopened.getByRole("heading", { name: "The Quiet Atlas", exact: true }),
    ).toBeVisible();
  } finally {
    await context?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("welcome page and optional support link work on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/welcome/");
  await expect(
    page.getByRole("heading", { name: "Your reading, remembered." }),
  ).toBeVisible();
  const support = page.getByRole("link", { name: "Support Development" });
  await expect(support).toHaveAttribute("href", "https://ko-fi.com/hutomoivan");
  await expect(support).toHaveAttribute("rel", "noopener noreferrer");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Open App" }).click();
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
});

test("failed automatic cover downloads can be retried without repeating metadata lookup", async ({
  page,
}) => {
  let queries = 0,
    images = 0;
  await page.route("https://openlibrary.org/search.json?**", async (route) => {
    queries++;
    await route.fulfill({
      json: {
        docs: [
          {
            key: "/works/OL123W",
            title: "The Quiet Atlas",
            author_name: ["Alex Morgan"],
            cover_i: 123,
          },
        ],
      },
    });
  });
  await page.route("https://covers.openlibrary.org/**", async (route) => {
    images++;
    await route.fulfill(
      images === 1
        ? { status: 404 }
        : {
            contentType: "image/png",
            body: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwzXb9DwAD4wH1Tj84LgAAAABJRU5ErkJggg==",
              "base64",
            ),
          },
    );
  });
  await page.goto("/");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await importFile(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Enable automatic covers and metadata", { exact: true })
    .check();
  const retry = page.getByRole("button", { name: "Retry unresolved matches" });
  await expect(retry).toBeVisible({ timeout: 20000 });
  expect(images).toBe(1);
  expect(queries).toBe(2);
  await retry.click();
  await expect(
    page.getByText("1 cached/local covers", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(images).toBe(2);
  // The unmatched second title is searched again; the already matched cover uses its cached metadata.
  expect(queries).toBe(3);
});
