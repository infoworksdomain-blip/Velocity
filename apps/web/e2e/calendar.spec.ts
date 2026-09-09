import { expect, test } from "@playwright/test";

/**
 * The real "Publish now" button (CLAUDE.md's own "clickable demo path"
 * for STEP 12) is rendered per calendar slot, so it only appears once
 * real slot data has loaded from a live database — not verifiable in this
 * sandbox (see playwright.config.ts's doc comment). What's real and
 * checked here is everything that doesn't depend on that data: the app
 * shell, and the view-mode toggle's real client-side state.
 */
test.describe("calendar", () => {
  test("renders the real app shell with Calendar marked as the active nav item", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
  });

  test("switching view mode tabs updates real client-side selection state", async ({ page }) => {
    await page.goto("/calendar");
    const monthTab = page.getByRole("tab", { name: "month" });
    const weekTab = page.getByRole("tab", { name: "week" });
    await expect(monthTab).toHaveAttribute("aria-selected", "true");

    await weekTab.click();
    await expect(weekTab).toHaveAttribute("aria-selected", "true");
    await expect(monthTab).toHaveAttribute("aria-selected", "false");
  });
});
