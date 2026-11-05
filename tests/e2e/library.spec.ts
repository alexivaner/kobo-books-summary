import { test, expect } from "@playwright/test";
import path from "node:path";
const fixture = path.resolve("fixtures/generated/KoboReader.sqlite");
async function importFixture(page: import("@playwright/test").Page) {
  await page
    .getByRole("button", { name: "Connect Kobo", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(fixture);
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import into my library" }).click();
  await expect(
    page.getByRole("heading", { name: "My library." }),
  ).toBeVisible();
}
test("real SQLite file preview, import, repeat sync, knowledge, reflection, backup, restore, offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await importFixture(page);
  await expect(
    page.getByRole("heading", { name: "The Quiet Atlas", exact: true }),
  ).toBeVisible();
  await importFixture(page);
  await expect(
    page.getByRole("heading", { name: "The Quiet Atlas", exact: true }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The Quiet Atlas", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "The Quiet Atlas", exact: true })
    .click();
  await page
    .getByLabel("Your reflection", { exact: true })
    .fill("A personal thought to keep.");
  await page
    .getByRole("button", { name: "Save reflection", exact: true })
    .click();
  await expect(
    page.getByText("A personal thought to keep.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save to favorites", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove from favorites", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add topics", exact: true }).click();
  await page.getByLabel("Topics separated by commas").fill("attention, 日常");
  await page.getByRole("button", { name: "Save topics" }).click();
  await page
    .getByRole("button", { name: "Knowledge library", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search knowledge" })
    .fill("walk home");
  await expect(
    page.getByText("Attention turns ordinary moments into a life.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();
  await page.getByRole("button", { name: "Clear library…" }).click();
  await page
    .getByRole("button", { name: "Clear everything", exact: true })
    .click();
  await expect(
    page.getByText("Local library cleared.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Restore library backup", { exact: true })
    .setInputFiles(backupPath!);
  await page.getByRole("button", { name: "Restore & replace" }).click();
  await expect(
    page.getByText("Backup restored.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My library", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The Quiet Atlas", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The Quiet Atlas", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Knowledge library", exact: true })
    .click();
  await expect(
    page.getByText("A personal thought to keep.", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile layout, navigation and dark theme", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("button", { name: "Connect Kobo", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Connect your Kobo." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Switch to dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("one writer lock protects data in a second tab", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  const second = await context.newPage();
  await second.goto("/");
  await expect(
    second.getByRole("alert").filter({ hasText: "open in another tab" }),
  ).toContainText("open in another tab");
  await second.close();
});

test("KOReader file import supports multilingual annotation search", async ({
  page,
}) => {
  await page.goto("/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(path.resolve("fixtures/generated/metadata.epub.lua"));
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("KOReader sidecars");
  await page.getByRole("button", { name: "Import into my library" }).click();
  await page
    .getByRole("button", { name: "Knowledge library", exact: true })
    .click();
  await page.getByLabel("Search knowledge").fill("記住");
  await expect(
    page.getByText("每一天都有值得記住的事。", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Notice something new.", { exact: true }),
  ).toBeVisible();
});

test("synthetic desktop overview preview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await importFixture(page);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({ path: "docs/preview.png", fullPage: true });
});

test("directory fallback discovers native and KOReader files", async ({
  page,
}) => {
  await page.goto("/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await page.getByRole("button", { name: "My Kobo is connected" }).click();
  const folderChooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Use standard folder picker", exact: true })
    .click();
  await (await folderChooser).setFiles(path.resolve("fixtures/generated"));
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("Kobalt");
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("KOReader sidecars");
});

test("private real-device snapshot import persists offline", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.KOBO_PRIVATE_FIXTURES,
    "Opt-in private hardware validation",
  );
  await page.goto("/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await page
    .getByLabel("Select Kobo directory", { exact: true })
    .setInputFiles(process.env.KOBO_PRIVATE_FIXTURES!);
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("KOReader sidecars");
  await page.getByRole("button", { name: "Import into my library" }).click();
  await expect(
    page.getByRole("heading", { name: "My library." }),
  ).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/kobo-books-summary-library.png",
    fullPage: false,
  });
  const total = await page.locator(".results-label").innerText();
  expect(parseInt(total)).toBeGreaterThan(0);
  expect(parseInt(total)).toBeLessThan(500);
  await page
    .getByRole("button", { name: "Knowledge library", exact: true })
    .click();
  const annotations = await page.locator(".results-label").innerText();
  expect(parseInt(annotations)).toBeGreaterThan(0);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".results-label")).toHaveText(annotations);
});

test("store previews and catalog entries are hidden by default and can be inspected separately", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await importFixture(page);
  await expect(
    page.getByRole("heading", { name: "Synthetic Store Preview", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel(/Include store previews & catalog records/).check();
  await expect(
    page.getByRole("heading", { name: "Synthetic Store Preview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Synthetic Catalog Item", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel(/Include store previews & catalog records/),
  ).toBeChecked();
  await page.getByLabel(/Include store previews & catalog records/).uncheck();
  await expect(
    page.getByRole("heading", { name: "Synthetic Store Preview", exact: true }),
  ).toHaveCount(0);
});

test("Kobalt highlights, notes and bookmarks appear with correct provenance", async ({
  page,
}) => {
  await page.goto("/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(path.resolve("fixtures/generated/kobalt.sqlite"));
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("Kobalt");
  await page.getByRole("button", { name: "Import into my library" }).click();
  await page.getByLabel("Reader source").selectOption("kobalt");
  await page
    .getByRole("heading", { name: "A Moment of Stillness", exact: true })
    .click();
  await expect(
    page.getByText("Kobalt personal note.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("KOBALT BOOKMARK", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("A place to return.", { exact: true }),
  ).toBeVisible();
});

test("Open Library lookup is explicit and chosen cover persists offline", async ({
  page,
  context,
}) => {
  let requests = 0;
  await page.route("https://openlibrary.org/search.json?**", async (route) => {
    requests++;
    await route.fulfill({
      json: {
        docs: [
          {
            title: "The Quiet Atlas",
            author_name: ["Alex Morgan"],
            key: "/works/OL123W",
            cover_i: 123,
          },
        ],
      },
    });
  });
  await page.route("https://covers.openlibrary.org/**", async (route) => {
    requests++;
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwzXb9DwAD4wH1Tj84LgAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
  });
  await page.goto("/");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await importFixture(page);
  await page
    .getByRole("heading", { name: "The Quiet Atlas", exact: true })
    .click();
  await page.getByRole("button", { name: "Find cover", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your annotations and notes stay private",
  );
  expect(requests).toBe(0);
  await page
    .getByRole("button", { name: "Search Open Library", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use this cover", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await page
    .getByRole("button", { name: "Use this cover", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open Library ↗", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("img", { name: "The Quiet Atlas cover", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
});

test("automatic enrichment batches the reading shelf, persists metadata and caches covers", async ({
  page,
  context,
}) => {
  let queries = 0,
    images = 0;
  await page.route("https://openlibrary.org/search.json?**", async (route) => {
    queries++;
    const u = new URL(route.request().url());
    expect(u.searchParams.get("q")).not.toContain("Synthetic Store Preview");
    expect(u.searchParams.get("q")).not.toContain("Synthetic Catalog Item");
    await route.fulfill({
      json: {
        docs: [
          {
            key: "/works/OL123W",
            title: "The Quiet Atlas",
            author_name: ["Alex Morgan"],
            cover_i: 123,
            first_publish_year: 2018,
            language: ["eng"],
            subject: ["Attention"],
          },
          {
            key: "/works/OL124W",
            title: "Small Observations",
            author_name: ["Robin Lane"],
            cover_i: 124,
            first_publish_year: 2020,
          },
        ],
      },
    });
  });
  await page.route("https://covers.openlibrary.org/**", async (route) => {
    images++;
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwzXb9DwAD4wH1Tj84LgAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
  });
  await page.goto("/");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await importFixture(page);
  expect(queries).toBe(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Enable automatic covers and metadata", { exact: true })
    .check();
  await expect(
    page.getByText("2 cached/local covers", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(queries).toBe(2);
  expect(images).toBe(2);
  await page.reload();
  await expect(
    page.getByText("2 metadata matches", { exact: true }),
  ).toBeVisible();
  expect(queries).toBe(2);
  await page.getByRole("button", { name: "My library", exact: true }).click();
  await page
    .getByRole("heading", { name: "The Quiet Atlas", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Additional book metadata" }),
  ).toContainText("2018");
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("img", { name: "The Quiet Atlas cover", exact: true }),
  ).toBeVisible();
  expect(queries).toBe(2);
});
