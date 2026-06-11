import { expect, test } from "@playwright/test";

test("loads demo deck through Pocket Audio Core", async ({ page }) => {
  const consoleMessages = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/apps/pocket-dj/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".logo").first()).toHaveText("Pocket DJ");

  await page.getByRole("button", { name: "Load Demo" }).click();
  await expect(page.locator("#statusText")).toContainText("Demo deck loaded");

  const audioCoreCard = page.locator(".meta-card", { hasText: "Audio Core" });
  await expect(audioCoreCard).toContainText("0.1.0-scaffold");
  await expect(audioCoreCard).toContainText(/events|ready/);
  await expect(audioCoreCard).not.toContainText(/legacy audio active/i);

  expect(pageErrors, "page runtime errors").toEqual([]);
  expect(consoleMessages, "console warnings/errors").toEqual([]);
});
