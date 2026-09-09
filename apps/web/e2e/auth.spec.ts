import { expect, test } from "@playwright/test";

/**
 * Post-STEP-22 audit remediation: this app had no login/signup page at
 * all before that unit — these prove the real pages it added actually
 * render and navigate, and that client-side (HTML5) validation blocks an
 * empty submit before any network call. Full authenticated flows (submit
 * -> real session -> dashboard) need a live database — see
 * playwright.config.ts's own doc comment for why that's out of reach
 * here.
 */
test.describe("login page", () => {
  test("renders a real email/password form and a link to signup", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  test("navigates to /signup via the real link", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("navigates to /forgot-password via the real link", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test("blocks an empty submit client-side and never leaves the page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Log in" }).click();
    // Real HTML5 required-field validation stops the form submitting at
    // all — no fetch, no navigation. Still on /login proves it.
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("signup page", () => {
  test("renders a real name/email/password form and a link back to login", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByPlaceholder("Name (optional)")).toBeVisible();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("Password (min. 8 characters)")).toBeVisible();
    await page.getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("forgot-password page", () => {
  test("renders a real email form", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
  });
});

test.describe("reset-password page", () => {
  test("shows a real error when no token is present in the URL", async ({ page }) => {
    await page.goto("/reset-password");
    // Next.js itself renders a hidden route-announcer div with role="alert"
    // for accessibility (confirmed by a real run: getByRole("alert") alone
    // matched two elements) — scope to this page's own alert by text.
    await expect(page.getByText("missing its token")).toBeVisible();
  });

  test("renders the real new-password form when a token is present", async ({ page }) => {
    await page.goto("/reset-password?token=some-token-value");
    await expect(page.getByPlaceholder("New password (min. 8 characters)")).toBeVisible();
  });
});
