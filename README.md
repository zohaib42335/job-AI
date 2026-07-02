# JobAI

[![CI](https://github.com/<your-org>/<your-repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/<your-org>/<your-repo>/actions/workflows/ci.yml)

A beginner-friendly Next.js project with a complete CI/CD test pipeline.

## What’s included

- GitHub Actions workflow for CI
- JavaScript unit test with Vitest
- Postman / Newman API test
- Playwright UI test
- test report artifact upload
- simple `/api/health` endpoint for health checks

## Getting started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> If you use GitHub Actions, replace `<your-org>/<your-repo>` in the badge URL above with your repository path.

## Test commands

- `npm run test:unit` — run unit tests with Vitest
- `npm run test:api` — run Newman API tests against `/api/health`
- `npm run test:e2e` — run Playwright UI tests
- `npm test` — run unit, API, and UI tests sequentially

## CI/CD pipeline

The GitHub Actions workflow is located at `.github/workflows/ci.yml`.

It runs on push and pull requests to `main` and `master`, then:

1. checks out the repository
2. installs dependencies with `npm ci`
3. builds the app
4. starts the Next.js server
5. runs unit tests
6. runs Newman API tests
7. runs Playwright UI tests
8. uploads test reports as artifacts

## Test files

- `vitest.config.ts`
- `playwright.config.ts`
- `postman/jobai-api.collection.json`
- `tests/unit/health.test.ts`
- `tests/e2e/login.spec.ts`

## Notes

- Playwright is configured to run headless in CI.
- Test reports are generated under `reports/`.
