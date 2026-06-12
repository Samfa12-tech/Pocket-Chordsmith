import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const consoleMessages = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/apps/chordsmith-web/");
  await page.waitForLoadState("networkidle");

  expect(pageErrors, "page runtime errors").toEqual([]);
  expect(
    consoleMessages.filter((message) => !message.includes("AudioContext")),
    "console warnings/errors",
  ).toEqual([]);
});

test("loads the main app controls", async ({ page }) => {
  await expect(page).toHaveURL(/pocket_chordsmith_v68_core_bridge\.html/);
  await expect(page.getByRole("heading", { name: "Pocket Chordsmith" })).toBeVisible();
  await expect(page.getByText("Pocket Audio Core bridge build")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play", exact: true }).first()).toBeVisible();
  await expect(page.locator("#progressionSlots .slot")).toHaveCount(4);
});

test("demo button loads the bundled starter song", async ({ page }) => {
  await page.getByRole("button", { name: "Demo" }).click();
  await expect(page.locator("#statusText")).toContainText("Loaded Pocket Chordsmith v68 demo");
  await expect(page.locator("#progressionSlots .slot").first()).toContainText(/C|Am|F|G/);
});

test("settings modal opens import and handoff tools", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.locator("#settingsModal")).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByRole("button", { name: "Export Compact JSON" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send to DJ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send to Pocket DAW" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Push to Godot" })).toBeVisible();
  await expect(page.locator("#pocketAudioCoreStatus")).toContainText("Pocket Audio Core");
});
