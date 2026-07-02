# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.ts >> Login page >> is accessible and shows form fields
- Location: tests\e2e\login.spec.ts:4:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: Test timeout of 30000ms exceeded.
Call log:
  - navigating to "http://127.0.0.1:3000/auth/login", waiting until "load"

```

# Page snapshot

```yaml
- img [ref=e3]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Login page", () => {
  4  |   test("is accessible and shows form fields", async ({ page }) => {
> 5  |     await page.goto("/auth/login");
     |                ^ Error: page.goto: Test timeout of 30000ms exceeded.
  6  | 
  7  |     await expect(page.getByRole("heading", { name: /sign in to your account/i })).toBeVisible();
  8  |     await expect(page.getByLabel("Email address")).toBeVisible();
  9  |     await expect(page.getByLabel("Password")).toBeVisible();
  10 |   });
  11 | 
  12 |   test("shows client-side validation errors on empty submit", async ({ page }) => {
  13 |     await page.goto("/auth/login");
  14 |     await page.click("#btn-email-login");
  15 | 
  16 |     await expect(page.locator("text=Please enter a valid email address")).toBeVisible();
  17 |     await expect(page.locator("text=Password must be at least 6 characters")).toBeVisible();
  18 |   });
  19 | 
  20 |   test("toggles password visibility", async ({ page }) => {
  21 |     await page.goto("/auth/login");
  22 |     await page.fill('#login-password', 'Secret1');
  23 |     const toggle = page.getByRole('button', { name: /show password|hide password/i });
  24 |     await expect(toggle).toBeVisible();
  25 |     // click to toggle
  26 |     await toggle.click();
  27 |     await expect(page.locator('#login-password')).toHaveAttribute('type', 'text');
  28 |     await toggle.click();
  29 |     await expect(page.locator('#login-password')).toHaveAttribute('type', 'password');
  30 |   });
  31 | });
  32 | 
```