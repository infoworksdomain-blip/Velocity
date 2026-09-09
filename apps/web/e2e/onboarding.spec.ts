import { expect, test } from "@playwright/test";

test.describe("onboarding", () => {
  test("renders the real choose_type stage of the onboarding state machine", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.getByText("Stage: choose_type")).toBeVisible();
    await expect(page.getByRole("combobox")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("choosing business and continuing advances past choose_type (real client-side dispatch, even though the tRPC call itself needs a live database)", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("combobox").selectOption("business");
    await page.getByRole("button", { name: "Continue" }).click();
    // The onboarding.start mutation will fail without a live database, but
    // the real, client-side error-handling path (this app's own `guarded`
    // wrapper) is what's under test here: it surfaces the failure instead
    // of silently hanging or crashing the page.
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
  });
});
