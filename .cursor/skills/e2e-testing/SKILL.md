---
name: e2e-testing
description: Run and write Playwright E2E tests for CentaurOS, interpret test results, and fix failing tests. Use when testing features end-to-end, writing integration tests, running Playwright tests, or when the user mentions E2E, Playwright, integration tests, testing, or test suite. CRITICAL - Always run functional tests before deploying any changes.
role: |
  You are a QA engineer obsessed with test coverage and reliability.
  You write tests that catch real bugs, not tests that just pass.
  You use role-based locators (getByRole, getByLabel) over fragile CSS selectors.
  You think about edge cases, error states, and what could break in production.
---

# E2E Testing Skill

This skill covers running, writing, and debugging Playwright E2E tests for CentaurOS.

## CI Integration

**E2E tests now block the CI pipeline.** Tests tagged `@critical` run automatically on every push to `main`/`develop`:

```yaml
# .github/workflows/docker-build.yml
- name: Run E2E Tests (Critical Paths)
  run: npm run test:e2e -- --project=chromium --grep="@critical"
```

**Tagging critical tests:**
```typescript
// Tests that should run in CI should include @critical in the name
test('should load dashboard @critical', async ({ page }) => {
  // ...
});
```

If E2E tests fail in CI, the deployment is blocked. Fix the failing tests before merging.

## Running Tests

### Basic Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode (visual debugging)
npm run test:e2e:ui

# Run with debug mode (step through)
npm run test:e2e:debug

# Run specific test file
npx playwright test e2e/dashboard.spec.ts

# Run tests matching pattern
npx playwright test -g "should load dashboard"

# Run in headed mode (see browser)
npx playwright test --headed

# Run specific project (browser)
npx playwright test --project=chromium
npx playwright test --project="Mobile Chrome"
```

### View Test Results

```bash
# Open last test report
npx playwright show-report

# Generate and view report
npx playwright test --reporter=html && npx playwright show-report
```

## Test Configuration

CentaurOS Playwright config (`playwright.config.ts`):

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

## Writing Tests

### Basic Test Structure

```typescript
// e2e/feature.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup for each test
    await page.goto('/feature');
  });

  test('should display feature heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Feature' })).toBeVisible();
  });

  test('should handle user interaction', async ({ page }) => {
    await page.getByRole('button', { name: 'Action' }).click();
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

### Using Fixtures

CentaurOS has custom fixtures in `e2e/fixtures.ts`:

```typescript
// e2e/fixtures.ts
import { test as base } from '@playwright/test';

export const test = base.extend<{
  authenticatedPage: Page;
}>({
  authenticatedPage: async ({ page }, use) => {
    // Login before test
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    await use(page);
  },
});

export { expect } from '@playwright/test';
```

**Using fixtures:**
```typescript
import { test, expect } from './fixtures';

test('authenticated test', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/protected');
  await expect(authenticatedPage.getByText('Welcome')).toBeVisible();
});
```

### Test Patterns for CentaurOS

**Pattern: Test Page Load**
```typescript
test('dashboard should load correctly', async ({ page }) => {
  await page.goto('/dashboard');
  
  // Wait for page to be ready
  await expect(page).toHaveTitle(/Dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  
  // Check key elements exist
  await expect(page.getByTestId('tasks-widget')).toBeVisible();
  await expect(page.getByTestId('objectives-widget')).toBeVisible();
});
```

**Pattern: Test Form Submission**
```typescript
test('should create new task', async ({ page }) => {
  await page.goto('/tasks/new');
  
  // Fill form
  await page.getByLabel('Title').fill('Test Task');
  await page.getByLabel('Description').fill('Test description');
  await page.getByRole('combobox', { name: 'Priority' }).selectOption('high');
  
  // Submit
  await page.getByRole('button', { name: 'Create Task' }).click();
  
  // Verify success
  await expect(page.getByText('Task created successfully')).toBeVisible();
  await expect(page).toHaveURL(/\/tasks\/[a-z0-9-]+/);
});
```

**Pattern: Test Navigation**
```typescript
test('should navigate via sidebar', async ({ page }) => {
  await page.goto('/dashboard');
  
  // Click sidebar link
  await page.getByRole('link', { name: 'Tasks' }).click();
  
  // Verify navigation
  await expect(page).toHaveURL('/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
});
```

**Pattern: Test API Response**
```typescript
test('should load data from API', async ({ page }) => {
  // Intercept API call
  await page.route('**/api/tasks', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify([{ id: '1', title: 'Mock Task' }]),
    });
  });
  
  await page.goto('/tasks');
  
  // Verify mocked data shows
  await expect(page.getByText('Mock Task')).toBeVisible();
});
```

**Pattern: Test Error Handling**
```typescript
test('should show error state', async ({ page }) => {
  // Force API error
  await page.route('**/api/data', (route) =>
    route.fulfill({ status: 500, body: 'Server error' })
  );
  
  await page.goto('/data');
  
  await expect(page.getByText('Error loading data')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});
```

## Locator Best Practices

**Preferred locators (in order):**

1. **Role + Name** (most robust)
   ```typescript
   page.getByRole('button', { name: 'Submit' })
   page.getByRole('link', { name: 'Home' })
   page.getByRole('heading', { name: 'Dashboard' })
   ```

2. **Label text** (for form inputs)
   ```typescript
   page.getByLabel('Email')
   page.getByPlaceholder('Enter email')
   ```

3. **Test ID** (for complex elements)
   ```typescript
   page.getByTestId('task-card-123')
   ```

4. **Text content** (for unique text)
   ```typescript
   page.getByText('Welcome back')
   ```

**Avoid:**
- CSS selectors: `page.locator('.btn-primary')`
- XPath: `page.locator('//div[@class="..."'])`

## Debugging Failed Tests

### View Trace

When tests fail, Playwright saves traces:

```bash
# Open trace viewer
npx playwright show-trace test-results/test-name/trace.zip
```

### Debug Mode

```bash
# Step through test
npx playwright test --debug e2e/failing.spec.ts

# Add pause in test code
await page.pause(); // Opens inspector
```

### Screenshots

```typescript
// Take screenshot during test
await page.screenshot({ path: 'debug.png' });

// Full page screenshot
await page.screenshot({ path: 'full.png', fullPage: true });
```

### Console Logs

```typescript
// Listen to console
page.on('console', msg => console.log('PAGE LOG:', msg.text()));

// Listen to errors
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
```

## Common Test Failures

### Test Times Out

```
Test timeout of 30000ms exceeded
```

**Solutions:**
```typescript
// 1. Increase timeout for specific test
test('slow test', async ({ page }) => {
  test.setTimeout(60000);
  // ...
});

// 2. Wait for specific element instead of time
await page.waitForSelector('[data-loaded="true"]');

// 3. Wait for network idle
await page.goto('/page', { waitUntil: 'networkidle' });
```

### Element Not Found

```
locator.click: Target closed
```

**Solutions:**
```typescript
// 1. Wait for element
await page.waitForSelector('button');

// 2. Use expect with timeout
await expect(page.getByRole('button')).toBeVisible({ timeout: 10000 });

// 3. Check if element is in viewport
await page.getByRole('button').scrollIntoViewIfNeeded();
```

### Flaky Tests

**Prevention strategies:**
```typescript
// 1. Wait for animations
await page.getByRole('dialog').waitFor({ state: 'visible' });

// 2. Wait for network
await page.waitForLoadState('networkidle');

// 3. Use strict mode
await page.getByRole('button', { name: 'Submit' }).click(); // Fails if multiple matches

// 4. Add retries in config
retries: 2,
```

## Test Organization

### File Structure

```
e2e/
├── fixtures.ts           # Custom fixtures
├── dashboard.spec.ts     # Dashboard tests
├── marketplace.spec.ts   # Marketplace tests
├── navigation.spec.ts    # Navigation tests
├── accessibility.spec.ts # A11y tests
└── health.spec.ts        # Health checks
```

### Naming Conventions

```typescript
// Group related tests
test.describe('Feature Name', () => {
  test.describe('Sub-feature', () => {
    test('should do specific thing', async ({ page }) => {});
  });
});

// Use descriptive names
test('should show error when submitting empty form', async ({ page }) => {});
test('should redirect to dashboard after login', async ({ page }) => {});
```

## Quick Commands

```bash
# Run all tests
npm run test:e2e

# Run only CI-critical tests (matches what CI runs)
npm run test:e2e -- --project=chromium --grep="@critical"

# Run single file
npx playwright test e2e/dashboard.spec.ts

# Run with pattern
npx playwright test -g "login"

# Debug mode
npx playwright test --debug

# Show report
npx playwright show-report

# Update snapshots
npx playwright test --update-snapshots

# List tests without running
npx playwright test --list
```

## See Also

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [references/test-patterns.md](references/test-patterns.md) - Additional test patterns

---

## When to Use This Skill

Use this skill when:

1. **Testing user workflows** - End-to-end verification of feature functionality
2. **Writing new E2E tests** - Adding test coverage for features
3. **Debugging failing tests** - Investigating why tests fail
4. **Verifying bug fixes** - Regression testing after fixes
5. **Pre-deployment validation** - Running full test suite before releases

## When NOT to Use

| Situation | Use Instead |
|-----------|-------------|
| Unit testing utility functions | [code-quality](../code-quality/SKILL.md) (unit testing section) |
| Investigating specific bugs | [bug-fix-workflow](../bug-fix-workflow/SKILL.md) |
| Code quality checks | [code-quality](../code-quality/SKILL.md) |
| Security testing | [security-review](../security-review/SKILL.md) |
| Accessibility testing | [accessibility-remediation](../accessibility-remediation/SKILL.md) |

## Quick Reference

| Task | Command |
|------|---------|
| **Run all E2E tests** | `npm run test:e2e` |
| **Run with UI debugger** | `npm run test:e2e:ui` |
| **Run single file** | `npx playwright test e2e/filename.spec.ts` |
| **Run by test name** | `npx playwright test -g "test name pattern"` |
| **Run headed (visible browser)** | `npx playwright test --headed` |
| **Debug mode (step through)** | `npx playwright test --debug` |
| **View last report** | `npx playwright show-report` |
| **View trace** | `npx playwright show-trace test-results/test-name/trace.zip` |
| **Update snapshots** | `npx playwright test --update-snapshots` |
| **List tests (no run)** | `npx playwright test --list` |

## Troubleshooting

### Issue: Tests time out waiting for element

**Cause:** Element not rendered, wrong selector, or slow page load

**Fix:**
1. Use more specific locators: `page.getByRole('button', { name: 'Submit' })`
2. Increase timeout: `await expect(element).toBeVisible({ timeout: 10000 })`
3. Wait for network: `await page.goto('/page', { waitUntil: 'networkidle' })`
4. Debug with: `npx playwright test --debug`

### Issue: Tests pass locally but fail in CI

**Cause:** Timing differences, missing test data, or environment config

**Fix:**
1. Add retries in config: `retries: process.env.CI ? 2 : 0`
2. Use explicit waits instead of timing assumptions
3. Ensure test data is seeded in CI environment
4. Check for timezone/locale-dependent assertions
5. Review CI logs and test artifacts (screenshots, traces)

### Issue: "strict mode violation" - multiple elements matched

**Cause:** Selector matches more than one element

**Fix:**
```typescript
// Instead of generic selector
await page.getByText('Submit').click() // Might match multiple

// Use more specific
await page.getByRole('button', { name: 'Submit' }).click()
// Or scope to container
await page.getByTestId('form').getByRole('button', { name: 'Submit' }).click()
```

## Evaluation (Before Completing)

Before marking test work complete, verify:

- [ ] **Tests pass?** Do all tests pass locally with `npm run test:e2e`?
- [ ] **Meaningful assertions?** Do tests verify actual behavior, not just "page loaded"?
- [ ] **Role-based locators?** Are you using `getByRole`, `getByLabel` instead of CSS selectors?
- [ ] **Error states tested?** Do tests cover what happens when things fail?
- [ ] **No flakiness?** Do tests pass consistently (run 3x to verify)?
- [ ] **Mobile tested?** Did you run with `--project="Mobile Chrome"`?
- [ ] **Report reviewed?** Did you check `npx playwright show-report` for failures?

## Related Skills

- [bug-fix-workflow](../bug-fix-workflow/SKILL.md) - Debug issues found by E2E tests
- [code-quality](../code-quality/SKILL.md) - Unit testing and code quality checks
- [feature-implementation-guide](../feature-implementation-guide/SKILL.md) - Add tests as part of feature implementation
- [accessibility-remediation](../accessibility-remediation/SKILL.md) - Write accessibility-focused tests
