# Testing Rules - Post-Mortem 2026-02-02

## Incident Summary

**Date**: February 2, 2026  
**Issue**: Marketplace comparison modal opened but showed no content  
**Blamed Change**: CSS hover state update (`hover:bg-accent/10` → `hover:bg-muted`)  
**Actual Cause**: Pre-existing bug where component returns `null` when items filtered out  
**Root Cause**: Insufficient functional testing before deployment

## What Happened

1. Testing audit fixed critical security and UI issues
2. One fix changed a CSS hover state in comparison modal
3. Build, lint, and TypeScript checks all passed
4. Changes were deployed to production
5. User reported comparison modal was broken
6. Investigation revealed: CSS change didn't cause break, but pre-existing bug wasn't caught

## Why It Happened

### The Assumption
"It's just a CSS change, build/lint passing means it's safe to deploy"

### The Reality
- Build/lint passing only means code compiles and follows style rules
- It doesn't mean features actually work
- Even simple changes can expose pre-existing bugs
- Without functional testing, bugs slip through

### The Pre-Existing Bug
```typescript
// In ComparisonModal component
if (deduplicatedItems.length === 0) {
    return null  // ← Bug: Dialog wrapper still renders!
}

// Results in:
<Dialog open={true}>
  {/* null - no content */}
</Dialog>
```

## What Should Have Happened

### Before Deployment Checklist
- [x] TypeScript compilation passes
- [x] Linter passes  
- [x] Build succeeds
- [ ] **Functional test: Open comparison modal** ← MISSED
- [ ] **Verify modal shows content** ← MISSED
- [ ] **Test with different item types** ← MISSED
- [ ] **Check browser console for errors** ← MISSED

## The Fix

### Immediate Fix
1. Show error dialog instead of empty modal when items filtered out
2. Add comprehensive logging to debug why items are filtered
3. Provide helpful error message to users

### Long-term Prevention
1. Created mandatory testing rule (`.cursor/rules/testing-before-deployment.mdc`)
2. Created E2E tests (`e2e/marketplace-comparison.spec.ts`)
3. Updated E2E testing skill with critical reminder
4. Documented this incident for future reference

## New Mandatory Testing Process

### For Every Deployment

**1. Code-Level Checks** (Baseline)
```bash
✓ TypeScript compilation
✓ Linter  
✓ Build
```

**2. Functional Testing** (NEW REQUIREMENT)
```bash
✓ Test affected features in browser
✓ Test happy path
✓ Test edge cases
✓ Test error cases
✓ Check console for errors
✓ Test in light/dark mode (if UI)
✓ Test on mobile viewport (if UI)
```

**3. Regression Testing**
```bash
✓ Test related features
✓ Test integration points
✓ Verify no unintended side effects
```

## Testing Examples by Change Type

### CSS/Style Changes
```
Change: Update button hover color
Required Tests:
- Click button (still works)
- Hover button (color correct)
- Button disabled state (works)
- Button in different contexts (works)
- Light/dark mode (both work)
```

### Component Logic Changes
```
Change: Update validation in comparison modal
Required Tests:
- Select items (works)
- Open comparison (modal shows content)
- Compare different item types (all work)
- Edge case: Select duplicate items (handled)
- Edge case: Select removed items (error shown)
```

### Server Action Changes
```
Change: Add authorization check
Required Tests:
- Action as owner (succeeds)
- Action as team member (succeeds)
- Action from different foundry (blocked)
- Action without auth (blocked)
- Verify audit logging works
```

### API Route Changes
```
Change: Add rate limiting
Required Tests:
- Normal request (succeeds)
- Rapid requests (rate limited)
- After cooldown (works again)
- Error response format (correct)
- Security checks (enforced)
```

## The Golden Rule

**If you touch it, you test it. Every time. No exceptions.**

### Cost Analysis

**Cost of Skipping Testing**:
- Broken production feature: 30-60 minutes
- User frustration: Immeasurable
- Debugging time: 30-60 minutes  
- Fixing and redeploying: 30-60 minutes
- **Total: 1.5-3 hours + damaged trust**

**Cost of Testing**:
- Manual functional test: 5-10 minutes per feature
- **Total: 5-10 minutes**

The math is simple: Always test.

## Accountability

### When Things Break

1. **Don't Blame**: Focus on process, not person
2. **Root Cause**: Why wasn't it caught in testing?
3. **Prevention**: Update testing procedures
4. **Document**: Add to this file for future reference

### Before Every Deployment

**Ask Yourself:**
- [ ] Have I tested ALL affected features manually?
- [ ] Have I tested error cases and edge cases?
- [ ] Have I checked the browser console?
- [ ] Am I confident this won't break production?

**If you can't check all boxes: DON'T DEPLOY**

## Future Improvements

### Short Term
1. ✅ Create testing rule document
2. ✅ Add E2E tests for critical paths
3. ✅ Update deployment skills with testing requirements
4. ⏳ Run E2E tests in CI/CD pipeline

### Medium Term
1. ⏳ Add pre-push git hook reminder
2. ⏳ Create testing checklist in PR template
3. ⏳ Add more E2E tests for critical features
4. ⏳ Set up visual regression testing

### Long Term
1. ⏳ Automated E2E tests for all critical paths
2. ⏳ Integration tests for all server actions  
3. ⏳ Component tests for all UI components
4. ⏳ 80%+ code coverage requirement

## References

- Testing Rule: `.cursor/rules/testing-before-deployment.mdc`
- E2E Test: `e2e/marketplace-comparison.spec.ts`
- E2E Skill: `.cursor/skills/e2e-testing/SKILL.md`
- Fix Commit: `fix: comparison modal empty state and add comprehensive testing guardrails`

## Summary

This incident was a wake-up call that **passing builds don't mean working features**. The solution isn't perfect testing (impossible), but **sufficient testing** to catch obvious breaks before they hit production.

Going forward: Test it before you ship it. Every single time.

---

*"The best time to find a bug is before you deploy it. The second best time is now."*
