import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
const base = process.env.E2E_BASE_PATH || "";
test("a damaged Kobalt index recovers validated sessions with an explicit warning and survives offline", async ({
  page,
  context,
}) => {
  const req = createRequire(import.meta.url),
    SQL = await initSqlJs({
      locateFile: () => req.resolve("sql.js/dist/sql-wasm.wasm"),
    });
  const db = new SQL.Database(
    await readFile(path.resolve("fixtures/generated/kobalt.sqlite")),
  );
  db.run("CREATE INDEX recovery_test_index ON reading_sessions(book)");
  const root = Number(
    db.exec(
      "SELECT rootpage FROM sqlite_master WHERE name='recovery_test_index'",
    )[0].values[0][0],
  );
  const size = Number(db.exec("PRAGMA page_size")[0].values[0][0]);
  const bytes = db.export();
  db.close();
  bytes[(root - 1) * size] = 255;
  await page.goto(base + "/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles({
      name: "kobalt.sqlite",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(bytes),
    });
  await expect(
    page.getByText(
      "Some reader files could not be fully verified. Review the details before saving.",
    ),
  ).toBeVisible();
  await page.getByText(/Review import details/).click();
  await expect(page.locator(".diagnostics")).toContainText(
    "Readable table rows were recovered and validated",
  );
  await page
    .getByRole("button", { name: "Import into my library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reading rhythm", exact: true })
    .click();
  await page.getByLabel("Reading month").selectOption("2026-09");
  const monthly = page.getByRole("region", { name: "Monthly reading summary" });
  await expect(monthly).toContainText("30 sec");
  await expect(
    page.getByRole("region", { name: "Selected day reading" }),
  ).toContainText("A Moment of Stillness");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel("Reading month").selectOption("2026-09");
  await expect(monthly).toContainText("30 sec");
});
