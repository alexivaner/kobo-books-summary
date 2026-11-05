import { test, expect } from "@playwright/test";
const base = process.env.E2E_BASE_PATH || "";
test("Readmory identity and supplied artwork remain available offline", async ({
  page,
  context,
}) => {
  await page.goto(base + "/welcome/");
  await expect(page).toHaveTitle("Readmory · Your reading, remembered");
  await expect(page.locator(".readmory-brand")).toHaveText("Readmory");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    base + "/brand/favicon.svg",
  );
  const artwork = page.locator(".welcome-brand-art img");
  await expect(artwork).toBeVisible();
  await expect
    .poll(() =>
      artwork.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await page.getByRole("link", { name: "Open App" }).click();
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await expect(page.locator(".sidebar .readmory-brand")).toHaveText("Readmory");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  const available = await page.evaluate(async (base) => {
    const urls = ["/brand/favicon.svg", "/brand/readmory-r-icon.png"];
    return Promise.all(
      urls.map(async (p) => (await fetch(base + p, { cache: "no-store" })).ok),
    );
  }, base);
  expect(available).toEqual([true, true]);
  await page.goto(base + "/welcome/");
  await expect(page.locator(".readmory-brand")).toHaveText("Readmory");
  await expect(page.locator(".welcome-brand-art img")).toBeVisible();
});
test("Readmory dark theme and mobile branding stay within the viewport", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("kobo-theme", "dark"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/#import");
  await expect(page.getByText("Opening your local library…")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".mobile-brand")).toHaveText("Readmory");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.locator(".sidebar .readmory-brand")).toBeVisible();
  const bounds = await page.locator(".sidebar .readmory-brand").boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page
    .getByRole("button", { name: "Connect Kobo", exact: true })
    .first()
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto(base + "/welcome/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".welcome-brand-art img")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
