import { expect, test } from "@playwright/test";

test.describe("marketing / root page", () => {
  test("loads and shows the real VELOCITY landing content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "VELOCITY" })).toBeVisible();
  });
});
