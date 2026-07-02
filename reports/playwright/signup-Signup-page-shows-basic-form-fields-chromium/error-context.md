# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: signup.spec.ts >> Signup page >> shows basic form fields
- Location: tests\e2e\signup.spec.ts:20:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByLabel('Password')
Expected: visible
Error: strict mode violation: getByLabel('Password') resolved to 4 elements:
    1) <input type="password" name="password" id="signup-password" autocomplete="new-password" placeholder="Min. 8 characters" class="w-full rounded-lg border pl-10 pr-10 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60 disabled:bg-gray-50 border-gray-200"/> aka getByRole('textbox', { name: 'Password', exact: true })
    2) <button type="button" tabindex="-1" aria-label="Show password" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">…</button> aka getByRole('button', { name: 'Show password' }).first()
    3) <input type="password" name="confirmPassword" autocomplete="new-password" id="signup-confirm-password" placeholder="Re-enter your password" class="w-full rounded-lg border pl-10 pr-10 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60 disabled:bg-gray-50 border-gray-200"/> aka getByRole('textbox', { name: 'Confirm password' })
    4) <button type="button" tabindex="-1" aria-label="Show password" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">…</button> aka getByRole('button', { name: 'Show password' }).nth(1)

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByLabel('Password')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - link "JobAI" [ref=e5] [cursor=pointer]:
          - /url: /
          - generic [ref=e6]: JobAI
        - heading "Create your free account" [level=1] [ref=e7]
        - paragraph [ref=e8]:
          - text: Already have an account?
          - link "Sign in" [ref=e9] [cursor=pointer]:
            - /url: /auth/login
      - button "Continue with Google" [ref=e10] [cursor=pointer]:
        - img [ref=e11]
        - text: Continue with Google
      - generic [ref=e20]: or sign up with email
      - generic [ref=e21]:
        - generic [ref=e22]:
          - generic [ref=e23]: Full name
          - generic [ref=e24]:
            - img
            - textbox "Full name" [ref=e25]:
              - /placeholder: Jane Smith
        - generic [ref=e26]:
          - generic [ref=e27]: Email address
          - generic [ref=e28]:
            - img
            - textbox "Email address" [ref=e29]:
              - /placeholder: you@example.com
        - generic [ref=e30]:
          - generic [ref=e31]: Password
          - generic [ref=e32]:
            - img
            - textbox "Password" [ref=e33]:
              - /placeholder: Min. 8 characters
            - button "Show password" [ref=e34] [cursor=pointer]:
              - img [ref=e35]
        - generic [ref=e38]:
          - generic [ref=e39]: Confirm password
          - generic [ref=e40]:
            - img
            - textbox "Confirm password" [ref=e41]:
              - /placeholder: Re-enter your password
            - button "Show password" [ref=e42] [cursor=pointer]:
              - img [ref=e43]
        - button "Create account" [ref=e46] [cursor=pointer]
      - paragraph [ref=e47]:
        - text: By signing up you agree to our
        - link "Terms" [ref=e48] [cursor=pointer]:
          - /url: /terms
        - text: and
        - link "Privacy Policy" [ref=e49] [cursor=pointer]:
          - /url: /privacy
        - text: .
  - alert [ref=e50]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Signup page", () => {
  4  |   test("shows validation error when passwords do not match", async ({ page }) => {
  5  |     await page.goto("/auth/signup");
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
> 24 |     await expect(page.getByLabel('Password')).toBeVisible();
     |                                               ^ Error: expect(locator).toBeVisible() failed
  25 |     await expect(page.getByLabel('Confirm password')).toBeVisible();
  26 |   });
  27 | });
  28 | 
```