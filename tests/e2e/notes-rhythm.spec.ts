import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
async function openImport(page: import("@playwright/test").Page) {
  await page.goto("/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
}
test("reader notes, standalone notes and reflections have a dedicated readable view", async ({
  page,
}) => {
  const req = createRequire(import.meta.url);
  const SQL = await initSqlJs({
    locateFile: () => req.resolve("sql.js/dist/sql-wasm.wasm"),
  });
  const db = new SQL.Database(
    await readFile(path.resolve("fixtures/generated/KoboReader.sqlite")),
  );
  db.run(
    "INSERT INTO Bookmark VALUES('standalone','file:///mnt/onboard/The Quiet Atlas.epub','','A standalone personal note.',0,'2026-10-02')",
  );
  await openImport(page);
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles({
      name: "KoboReader.sqlite",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(db.export()),
    });
  db.close();
  await page.getByRole("button", { name: "Import into my library" }).click();
  await page
    .getByRole("heading", { name: "The Quiet Atlas", exact: true })
    .click();
  await page
    .getByLabel("Your reflection", { exact: true })
    .fill("A synthetic reflection to keep.");
  await page
    .getByRole("button", { name: "Save reflection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Personal notes", exact: true })
    .click();
  await expect(
    page.getByText("Look closer on the walk home.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("A standalone personal note.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Attention turns ordinary moments into a life.", {
      exact: true,
    }),
  ).toBeHidden();
  expect(
    await page
      .locator(".own-note-text")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(18);
  await page.getByLabel("Search personal notes").fill("standalone");
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.getByLabel("Search personal notes").fill("");
  await page.getByRole("button", { name: /My reflections/ }).click();
  await expect(
    page.getByText("A synthetic reflection to keep.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Personal notes.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /My reflections/ }).click();
  await expect(
    page.getByText("A synthetic reflection to keep.", { exact: true }),
  ).toBeVisible();
});
test("reading rhythm exposes recorded days and sessions with reader provenance", async ({
  page,
}) => {
  await openImport(page);
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(path.resolve("fixtures/generated/kobalt.sqlite"));
  await page.getByRole("button", { name: "Import into my library" }).click();
  await page
    .getByRole("button", { name: "Reading rhythm", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reading rhythm.", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Reading month").selectOption("2026-09");
  const day = page
    .getByRole("button", { name: /2026-09-21 · .* recorded$/ })
    .first();
  await expect(day).toBeVisible();
  await day.click();
  const details = page.getByRole("region", { name: "Selected day reading" });
  await expect(details).toContainText("A Moment of Stillness");
  await expect(details).toContainText("Kobalt");
  await expect(details).toContainText("1 session");
  await page.getByLabel("Rhythm reader").selectOption("kobo");
  await expect(
    page.getByRole("region", { name: "Monthly reading summary" }),
  ).toContainText("Not recorded");
  await page.getByLabel("Rhythm reader").selectOption("kobalt");
  await expect(details).toContainText("A Moment of Stillness");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reading rhythm.", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Reading month").selectOption("2026-09");
  await expect(page.locator(".calendar-days .has-reading")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator("body")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
});
test("native last-read activity does not invent daily durations", async ({
  page,
}) => {
  await openImport(page);
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(path.resolve("fixtures/generated/KoboReader.sqlite"));
  await page.getByRole("button", { name: "Import into my library" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: /Reading time/ }).click();
  await expect(
    page.getByRole("region", { name: "Monthly reading summary" }),
  ).toContainText("Not recorded");
  await expect(page.locator(".calendar-days .has-reading")).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Selected day reading" }),
  ).toContainText("annotation date");
});
