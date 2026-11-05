import { test, expect } from "@playwright/test";
import path from "node:path";
const base = process.env.E2E_BASE_PATH || "";
test("subpath deployment initializes SQLite, persists an import and opens offline", async ({
  page,
  context,
}) => {
  test.skip(!base, "Only used for subpath deployment builds");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/welcome/");
  await page.getByRole("link", { name: "Open App" }).click();
  await expect(page).toHaveURL(new RegExp(base + "/$"));
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await page
    .getByRole("button", { name: "Connect Kobo", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(path.resolve("fixtures/generated/KoboReader.sqlite"));
  await page.getByRole("button", { name: "Import into my library" }).click();
  await expect(
    page.getByRole("heading", { name: "The Quiet Atlas", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText("OPFS · SQLite WASM", { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "My library", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The Quiet Atlas", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
