import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
const base = process.env.E2E_BASE_PATH || "";
test("statistics filter measured time and generate a private cover share card offline", async ({
  page,
  context,
}, testInfo) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r
        .url()
        .startsWith(
          new URL(process.env.TEST_BASE_URL || "http://127.0.0.1:3000").origin +
            "/",
        )
    )
      external.push(r.url());
  });
  await page.goto(base + "/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  const req = createRequire(import.meta.url),
    SQL = await initSqlJs({
      locateFile: () => req.resolve("sql.js/dist/sql-wasm.wasm"),
    });
  const native = new SQL.Database(
    await readFile(path.resolve("fixtures/generated/KoboReader.sqlite")),
  );
  native.run(
    "UPDATE Bookmark SET DateCreated='2026-02-18T12:00:00Z' WHERE BookmarkID='q1'",
  );
  const nativeBytes = Buffer.from(native.export());
  native.close();
  const cover = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 440;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#2F4A3C";
    c.fillRect(0, 0, 300, 440);
    c.strokeStyle = "#A9CC8A";
    c.strokeRect(22, 22, 256, 396);
    c.fillStyle = "#F7F3E9";
    c.font = "16px sans-serif";
    c.fillText("ALEX MORGAN", 38, 77);
    c.font = "38px Georgia";
    c.fillText("The Quiet", 38, 170);
    c.fillText("Atlas", 38, 220);
    c.strokeStyle = "#A9CC8A";
    c.beginPath();
    c.arc(150, 330, 45, 0, Math.PI * 2);
    c.stroke();
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles([
      {
        name: "KoboReader.sqlite",
        mimeType: "application/octet-stream",
        buffer: nativeBytes,
      },
      {
        name: "kobalt.sqlite",
        mimeType: "application/octet-stream",
        buffer: await readFile(
          path.resolve("fixtures/generated/kobalt.sqlite"),
        ),
      },
      {
        name: "atlas-N3_LIBRARY_FULL.parsed",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(cover, "base64"),
      },
    ]);
  await page
    .getByRole("button", { name: "Import into my library", exact: true })
    .click();
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  const summary = page.getByRole("region", {
    name: "Reading statistics summary",
  });
  await expect(summary).toContainText("1h 41m");
  await page.getByLabel("Statistics year").selectOption("2026");
  await expect(summary).toContainText("30 sec");
  await expect(page.getByLabel("Incomplete time history")).toContainText(
    "The 30 sec above comes only from imported dated sessions.",
  );
  await page.getByLabel("Statistics month").selectOption("2");
  await expect(summary).toContainText("Not recorded");
  await expect(
    page.getByRole("region", { name: "Most read books" }),
  ).toContainText("The Quiet Atlas");
  await page.getByLabel("Statistics month").selectOption("10");
  await expect(summary).toContainText("Not recorded");
  await expect(page.getByLabel("Incomplete time history")).toContainText(
    "cannot be assigned to this month",
  );
  await expect(
    page.getByRole("region", { name: "Most read books" }),
  ).toContainText("date split unavailable");
  await expect(
    page.getByRole("region", { name: "Most read books" }),
  ).toContainText("The Quiet Atlas");
  await page.getByLabel("Statistics reader").selectOption("kobalt");
  await expect(summary).toContainText("Not recorded");
  await page.getByLabel("Statistics reader").selectOption("all");
  await page.getByLabel("Statistics year").selectOption("all");
  await page.getByLabel("Rank books by").selectOption("time");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reading statistics.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create share card", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: /Share card/ })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Download PNG", exact: true }).click(),
  ]);
  const file = testInfo.outputPath("reading-share-card.png");
  await download.saveAs(file);
  const bytes = await readFile(file);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);
  expect(download.suggestedFilename()).toBe("readmory-all-time.png");
  await expect(dialog).not.toContainText("Look closer on the walk home.");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "canShare", {
      value: () => false,
      configurable: true,
    }),
  );
  const [fallback] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Share image", exact: true }).click(),
  ]);
  expect(fallback.suggestedFilename()).toBe("readmory-all-time.png");
  await dialog.getByLabel("Include book covers and titles").uncheck();
  await expect(
    dialog.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled();
  const [redacted] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Download PNG", exact: true }).click(),
  ]);
  await redacted.saveAs(testInfo.outputPath("reading-share-card-no-books.png"));
  await dialog
    .getByRole("button", { name: "Close share card", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reading statistics.", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: testInfo.outputPath("statistics-mobile.png"),
    fullPage: true,
  });
  expect(external).toEqual([]);
});
