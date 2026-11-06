import { test, expect } from "@playwright/test";
import path from "node:path";
const base = process.env.E2E_BASE_PATH || "";
test("support is visible, delayed only during eligible visible use, and dismissal persists", async ({
  page,
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
  await page.clock.install();
  await page.addInitScript(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () =>
        (window as unknown as { testHidden: boolean }).testHidden
          ? "hidden"
          : "visible",
    });
  });
  await page.goto(base + "/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  const topSupport = page
    .locator("header")
    .getByRole("link", { name: "Support Readmory on Ko-fi", exact: true });
  await expect(topSupport).toBeInViewport();
  await expect(topSupport).toHaveAttribute(
    "href",
    "https://ko-fi.com/hutomoivan",
  );
  await expect(topSupport).toHaveAttribute("rel", "noopener noreferrer");
  const reminder = page.getByRole("complementary", {
    name: "Support Readmory reminder",
    exact: true,
  });
  await page.clock.runFor(300000);
  await expect(reminder).toHaveCount(0);
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(path.resolve("fixtures/generated/KoboReader.sqlite"));
  await page
    .getByRole("button", { name: "Import into my library", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "The Quiet Atlas", exact: true })
    .click();
  await page.clock.runFor(300000);
  await expect(reminder).toHaveCount(0);
  await page.getByRole("button", { name: "Connect Kobo", exact: true }).click();
  await page.clock.runFor(300000);
  await expect(reminder).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reading rhythm", exact: true })
    .click();
  await page.evaluate(() => {
    (window as unknown as { testHidden: boolean }).testHidden = true;
  });
  await page.clock.runFor(300000);
  await expect(reminder).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { testHidden: boolean }).testHidden = false;
  });
  await page.clock.runFor(298000);
  await expect(reminder).toHaveCount(0);
  await page.clock.runFor(2000);
  await expect(reminder).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(topSupport).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("support-reminder-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Dismiss support reminder", exact: true })
    .click();
  await expect(reminder).toHaveCount(0);
  const until = await page.evaluate(() =>
    Number(localStorage.getItem("readmory-support-remind-after")),
  );
  expect(until).toBeGreaterThan(
    await page.evaluate(() => Date.now() + 29 * 86400000),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reading rhythm.", exact: true }),
  ).toBeVisible();
  await page.clock.runFor(360000);
  await expect(reminder).toHaveCount(0);
  expect(external).toEqual([]);
});
