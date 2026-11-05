import { test, expect } from "@playwright/test";
import path from "node:path";
test("guided connection explains files and advances to review before saving", async ({
  page,
}, testInfo) => {
  await page.goto("/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Connect your Kobo." }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Import progress").locator('[aria-current="step"]'),
  ).toContainText("Connect");
  await page.screenshot({
    path: testInfo.outputPath("kobo-guide-connect.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "My Kobo is connected" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your files." }),
  ).toBeVisible();
  await page
    .getByText("Choosing individual files? Here’s where to find them.", {
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Kobalt", exact: true }).click();
  await expect(page.locator(".file-location")).toHaveText(
    ".adds/kobalt/kobalt.sqlite",
  );
  await page.getByRole("button", { name: "Windows", exact: true }).click();
  await expect(
    page.getByText("View → Show → Hidden items", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("kobo-guide-files.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Mac", exact: true }).click();
  await expect(
    page.getByText("Folders starting with a dot are hidden.", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(path.resolve("fixtures/generated/KoboReader.sqlite"));
  await expect(
    page.getByLabel("Import progress").locator('[aria-current="step"]'),
  ).toContainText("Review & save");
  await expect(
    page.getByRole("heading", {
      name: "Ready to import",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import into my library" }).click();
  await expect(
    page.getByRole("heading", { name: "The Quiet Atlas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Library saved. You can eject your Kobo.", { exact: true }),
  ).toBeVisible();
});
test("compact source cards and guided imports fit a dark mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("kobo-theme", "dark"));
  await page.goto("/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await page.getByRole("button", { name: "My Kobo is connected" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your files." }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(path.resolve("fixtures/generated/KoboReader.sqlite"));
  await page.getByRole("button", { name: "Import into my library" }).click();
  await page
    .getByRole("heading", { name: "The Quiet Atlas", exact: true })
    .click();
  await expect(page.locator(".reader-source-card")).toHaveCount(1);
  await expect(page.locator(".source-record")).not.toHaveAttribute("open", "");
  await expect(
    page.getByLabel("Combine with another shelf entry"),
  ).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("file selection shows measured progress and comfortably sized controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      await new Promise<void>((resolve) => {
        (window as unknown as { resumeFileRead: () => void }).resumeFileRead =
          resolve;
      });
      return original.call(this);
    };
  });
  await page.goto("/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await page.getByRole("button", { name: "My Kobo is connected" }).click();
  for (const name of ["Select Kobo folder", "Select source files"]) {
    const b = page.getByRole("button", { name, exact: true });
    const box = await b.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page
    .getByLabel("Select Kobo source files", { exact: true })
    .setInputFiles(path.resolve("fixtures/generated/KoboReader.sqlite"));
  const bar = page.getByRole("progressbar", {
    name: "Reading your files",
    exact: true,
  });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("max", "1");
  await expect(
    page.getByRole("region", { name: "Preparing import" }),
  ).toContainText("0 of 1 files");
  await page.evaluate(() =>
    (window as unknown as { resumeFileRead: () => void }).resumeFileRead(),
  );
  await expect(
    page.getByRole("heading", { name: "Ready to import", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Preparing import" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Import into my library" }),
  ).toBeEnabled();
});
