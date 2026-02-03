# Critical User Journeys - Required E2E Coverage

These paths MUST have passing E2E tests before any production deploy.

## How to Tag Critical Tests

Add `@critical` to test descriptions:

```typescript
test('@critical: comparison modal shows content', async ({ page }) => {
  // ...
})
```

CI runs only `@critical` tagged tests on PRs. Full suite runs nightly.

---

## Critical Paths Checklist

### Authentication
- [ ] Login flow
- [ ] Logout flow  
- [ ] Session persistence across refresh

### Core Features
- [x] **Marketplace comparison** (`marketplace-comparison.spec.ts`) - Tag: @critical
- [x] **Team comparison** (`team-comparison.spec.ts`) - Tag: @critical
- [ ] Task creation
- [ ] Task completion
- [ ] Dashboard loads

### Data Integrity
- [ ] Form submissions persist
- [ ] Filters work correctly
- [ ] Pagination works

### Payments (when applicable)
- [ ] Checkout flow
- [ ] Subscription status display

---

## Adding New Critical Paths

When a feature causes a production incident:

1. Write E2E test covering the bug
2. Tag it with `@critical`
3. Add to this checklist
4. Update CI to fail on this test

---

## Running Critical Tests Locally

```bash
# Run only critical tests
npm run test:e2e -- --grep="@critical"

# Run all tests
npm run test:e2e
```

---

## Review Schedule

- **Monthly**: Review this list, add any missed critical paths
- **After incidents**: Add test for the failing feature
- **Before major releases**: Run full E2E suite
