import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
const base = process.env.E2E_BASE_PATH || "";
test("USB cached artwork is counted before import and stays visible offline", async ({
  page,
  context,
}) => {
  await page.goto(base + "/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles([
      {
        name: "KoboReader.sqlite",
        mimeType: "application/octet-stream",
        buffer: await readFile(
          path.resolve("fixtures/generated/KoboReader.sqlite"),
        ),
      },
      {
        name: "atlas-N3_LIBRARY_FULL.parsed",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      },
    ]);
  await page.getByText(/Review import details/).click();
  await expect(
    page.getByText(/1 of 2 reading-library records have local covers/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import into my library", exact: true })
    .click();
  const cover = page.getByRole("img", {
    name: "The Quiet Atlas cover",
    exact: true,
  });
  await expect(cover).toBeVisible();
  await expect
    .poll(() =>
      cover.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
    )
    .toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(cover).toBeVisible();
  await expect
    .poll(() =>
      cover.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
    )
    .toBe(true);
});
