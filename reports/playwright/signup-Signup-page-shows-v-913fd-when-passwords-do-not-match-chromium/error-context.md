# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: signup.spec.ts >> Signup page >> shows validation error when passwords do not match
- Location: tests\e2e\signup.spec.ts:4:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: Test timeout of 30000ms exceeded.
Call log:
  - navigating to "http://127.0.0.1:3000/auth/signup", waiting until "load"

```

# Page snapshot

```yaml
- img [ref=e3]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Signup page", () => {
  4  |   test("shows validation error when passwords do not match", async ({ page }) => {
> 5  |     await page.goto("/auth/signup");
     |                ^ Error: page.goto: Test timeout of 30000ms exceeded.
  6  | 
  7  |     await expect(page.getByRole("heading", { name: /create your free account/i })).toBeVisible();
  8  | 
  9  |     await page.fill("#signup-fullname", "Test User");
  10 |     const email = `test+${Date.now()}@example.com`;
  11 |     await page.fill("#signup-email", email);
  12 |     await page.fill("#signup-password", "Password1!");
  13 |     await page.fill("#signup-confirm-password", "Password2!");
  14 | 
  15 |     await page.click("#btn-email-signup");
  16 | 
  17 |     await expect(page.locator("text=Passwords do not match")).toBeVisible();
  18 |   });
  19 | 
  20 |   test("shows basic form fields", async ({ page }) => {
  21 |     await page.goto("/auth/signup");
  22 |     await expect(page.getByLabel('Full name')).toBeVisible();
  23 |     await expect(page.getByLabel('Email address')).toBeVisible();
  24 |     await expect(page.getByLabel('Password')).toBeVisible();
  25 |     await expect(page.getByLabel('Confirm password')).toBeVisible();
  26 |   });
  27 | });
  28 | 
```