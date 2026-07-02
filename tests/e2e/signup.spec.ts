import { test, expect } from "@playwright/test";

test.describe("Signup page", () => {
  test("shows validation error when passwords do not match", async ({ page }) => {
    await page.goto("/auth/signup");

    await expect(page.getByRole("heading", { name: /create your free account/i })).toBeVisible();

    await page.fill("#signup-fullname", "Test User");
    const email = `test+${Date.now()}@example.com`;
    await page.fill("#signup-email", email);
    await page.fill("#signup-password", "Password1!");
    await page.fill("#signup-confirm-password", "Password2!");

    await page.click("#btn-email-signup");

    await expect(page.locator("text=Passwords do not match")).toBeVisible();
  });

  test("shows basic form fields", async ({ page }) => {
    await page.goto("/auth/signup");
    await expect(page.getByLabel('Full name')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel('Confirm password')).toBeVisible();
  });
});
