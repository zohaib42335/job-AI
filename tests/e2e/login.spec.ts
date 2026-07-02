import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("is accessible and shows form fields", async ({ page }) => {
    await page.goto("/auth/login");

    await expect(page.getByRole("heading", { name: /sign in to your account/i })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("shows client-side validation errors on empty submit", async ({ page }) => {
    await page.goto("/auth/login");
    await page.click("#btn-email-login");

    await expect(page.locator("text=Please enter a valid email address")).toBeVisible();
    await expect(page.locator("text=Password must be at least 6 characters")).toBeVisible();
  });

  test("toggles password visibility", async ({ page }) => {
    await page.goto("/auth/login");
    await page.fill('#login-password', 'Secret1');
    const toggle = page.getByRole('button', { name: /show password|hide password/i });
    await expect(toggle).toBeVisible();
    // click to toggle
    await toggle.click();
    await expect(page.locator('#login-password')).toHaveAttribute('type', 'text');
    await toggle.click();
    await expect(page.locator('#login-password')).toHaveAttribute('type', 'password');
  });
});
