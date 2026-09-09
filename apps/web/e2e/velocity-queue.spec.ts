import { expect, test } from "@playwright/test";

test.describe("velocity swipe queue", () => {
  test("renders the real app shell with Velocity marked as the active nav item", async ({ page }) => {
    await page.goto("/velocity");
    const velocityLink = page.getByRole("link", { name: "Velocity" });
    await expect(velocityLink).toBeVisible();
    await expect(velocityLink).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Calendar" })).not.toHaveAttribute("aria-current", "page");
  });
});
