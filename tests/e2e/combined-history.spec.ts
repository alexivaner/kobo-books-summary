import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import { qtMap } from "../helpers/qt";
const base = process.env.E2E_BASE_PATH || "";
test("one calendar combines native Kobo history, Kobalt sessions and KOReader intervals", async ({
  page,
  context,
}, testInfo) => {
  const req = createRequire(import.meta.url),
    SQL = await initSqlJs({
      locateFile: () => req.resolve("sql.js/dist/sql-wasm.wasm"),
    });
  const native = new SQL.Database(
    await readFile(path.resolve("fixtures/generated/KoboReader.sqlite")),
  );
  native.run("CREATE TABLE Event(EventType INT,ContentID TEXT,ExtraData TEXT)");
  native.run("INSERT INTO Event VALUES(46,?,CAST(? AS TEXT))", [
    "file:///mnt/onboard/The Quiet Atlas.epub",
    qtMap({
      eventTimestamps: [Date.parse("2026-03-15T12:00:00Z") / 1000],
      ExtraDataReadingSeconds: 7200,
    }),
  ]);
  for (const [type, date] of [
    [1020, "2026-09-21T10:00:00Z"],
    [1021, "2026-09-21T10:30:00Z"],
  ] as const)
    native.run("INSERT INTO Event VALUES(?,?,CAST(? AS TEXT))", [
      type,
      "file:///mnt/onboard/The Quiet Atlas.epub",
      qtMap({ eventTimestamps: [Date.parse(date) / 1000] }),
    ]);
  native.run(
    "UPDATE Bookmark SET DateCreated='2026-08-14T12:00:00Z' WHERE BookmarkID='q1'",
  );
  const stats = new SQL.Database();
  stats.run(
    "CREATE TABLE book(id INT,title TEXT,authors TEXT,md5 TEXT,total_read_time INT,last_open INT)",
  );
  stats.run(
    "INSERT INTO book VALUES(1,'Synthetic KOReader book','Synthetic author','hash',9,1790000000)",
  );
  stats.run(
    "CREATE TABLE page_stat_data(id_book INT,page INT,start_time INT,duration INT)",
  );
  stats.run("INSERT INTO page_stat_data VALUES(1,1,1790000000,9)");
  const files = [
    {
      name: "KoboReader.sqlite",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(native.export()),
    },
    {
      name: "statistics.sqlite3",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(stats.export()),
    },
    {
      name: "kobalt.sqlite",
      mimeType: "application/octet-stream",
      buffer: await readFile(path.resolve("fixtures/generated/kobalt.sqlite")),
    },
  ];
  native.close();
  stats.close();
  await page.goto(base + "/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(files);
  await page
    .getByRole("button", { name: "Import into my library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reading rhythm", exact: true })
    .click();
  const coverage = page.getByRole("region", {
    name: "Reader history coverage",
  });
  await expect(coverage).toContainText("Kobo");
  await expect(coverage).toContainText("Kobalt");
  await expect(coverage).toContainText("KOReader");
  await page.getByLabel("Reading month").fill("2026-03");
  await page
    .getByRole("button", {
      name: "2026-03-15 · Reading activity recorded",
      exact: true,
    })
    .click();
  const selected = page.getByRole("region", { name: "Selected day reading" });
  await expect(selected).toContainText("The Quiet Atlas");
  await expect(selected).toContainText("duration unavailable");
  await expect(
    page.getByRole("region", { name: "Monthly reading summary" }),
  ).toContainText("Not recorded");
  await page.getByLabel("Reading month").fill("2026-09");
  await page.getByRole("button", { name: /2026-09-21 · .* estimated/ }).click();
  await expect(selected).toContainText("Kobalt");
  await expect(selected).toContainText("KOReader");
  await selected
    .getByText(/view times/)
    .first()
    .click();
  await expect(selected).toContainText("9 sec");
  const monthly = page.getByRole("region", { name: "Monthly reading summary" });
  await expect(monthly).toContainText("Monthly reading time");
  await expect(monthly).toContainText("≈ 31 min");
  await expect(
    page.getByRole("region", { name: "Kobo session estimates" }),
  ).toHaveCount(0);
  await page.getByLabel("Reading month").fill("2026-10");
  await page
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await expect(page.getByLabel("Reading month")).toHaveValue("2026-09");
  await expect(selected).toContainText("September 21");
  await page
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await expect(page.getByLabel("Reading month")).toHaveValue("2026-08");
  await expect(selected).toContainText("August 14");
  await expect(monthly).toContainText("Not recorded");
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await page.getByLabel("Rhythm reader").selectOption("kobo");
  await expect(
    page.getByRole("region", { name: "Monthly reading summary" }),
  ).toContainText("≈ 30 min");
  await page.getByLabel("Rhythm reader").selectOption("all");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(coverage).toBeVisible();
  await page.getByLabel("Reading month").fill("2026-09");
  await page.getByRole("button", { name: /2026-09-21 · .* estimated/ }).click();
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    page.getByRole("region", { name: "Reading calendar" }),
  ).toBeInViewport();
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
    path: testInfo.outputPath("combined-history-mobile.png"),
    fullPage: true,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(coverage).toContainText("2026-03-15");
  await page.getByLabel("Reading month").fill("2026-09");
  await expect(monthly).toContainText("≈ 31 min");
  await page.getByRole("button", {name:"Open menu",exact:true}).click();
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  await page.getByLabel("Statistics year").selectOption("2026");
  await page.getByLabel("Statistics month").selectOption("9");
  await expect(
    page.getByRole("region", { name: "Reading statistics summary" }),
  ).toContainText("≈ 31 min");
  await page
    .getByRole("button", { name: "Create share card", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: /Share card/ })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Download PNG", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("readmory-2026-09.png");
  await download.saveAs(testInfo.outputPath("estimated-month.png"));
});
