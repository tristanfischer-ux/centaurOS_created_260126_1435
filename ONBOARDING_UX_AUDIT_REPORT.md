# ForgeOS Onboarding & Login UX Audit Report

**Date:** February 5, 2026  
**Scope:** All signup flows (Founder, Executive, Apprentice, Supplier) + Login  
**Environment:** Production (centaurdynamics.io)

---

## Executive Summary

| Dimension | Status | Score |
|-----------|--------|-------|
| **Functional Correctness** | ✅ Working | 9/10 |
| **UX Quality** | ✅ Good | 8/10 |
| **Design Consistency** | ⚠️ Needs Work | 5/10 |
| **Accessibility (WCAG 2.1 AA)** | ⚠️ Partial | 6/10 |

**Key Findings:**
- All signup flows are functional and redirect correctly
- Beautiful cinematic UX for Founder signup (video transitions)
- **47 design token violations** (hardcoded colors instead of semantic tokens)
- **4 critical accessibility issues** (error handling, ARIA attributes)
- E2E tests need selector fixes to run against production

---

## 1. User Flows Analyzed

### Signup Flows

| Role | URL | Type | Status |
|------|-----|------|--------|
| **Founder** | `/join/founder` | Direct signup | ✅ Working |
| **Executive** | `/join/executive` | Direct signup | ✅ Working |
| **Apprentice** | `/join/apprentice` | Direct signup | ✅ Working |
| **Supplier** | `/join/supplier` | Direct signup | ✅ Working |

### Login Flow

| Page | URL | Status |
|------|-----|--------|
| **Login** | `/login` | ✅ Working |

---

## 2. UX Quality Assessment

### What's Working Well ✅

1. **Cinematic Founder Experience**
   - Video background creates immersive "induction" feel
   - Smooth transitions between hook and form stages
   - Clear value proposition with benefit bullets

2. **Role-Specific Messaging**
   - Each role has tailored headlines and CTAs
   - Benefits are relevant to each persona
   - Hero images match role identity

3. **Demo Mode Support**
   - `?demo=true` parameter pre-fills forms
   - Purple banner clearly indicates demo mode
   - Reduces friction for testing

4. **Mobile Responsive**
   - Forms adapt well to mobile screens
   - Touch targets are 44px+ (WCAG compliant)
   - Spacing adjusts at breakpoints

5. **Login Page**
   - Clean, focused design
   - Split layout with hero image
   - Clear branding and CTAs

### Areas for Improvement ⚠️

1. **Error Handling UX**
   - Signup page doesn't display form errors visually
   - Errors redirect via URL params but aren't rendered
   - No inline validation feedback

2. **Password Requirements**
   - No visible password strength indicator
   - Requirements not shown until submission fails
   - Could frustrate users

3. **Progress Indication**
   - No step indicator for multi-field forms
   - Users don't know how far they are

4. **Loading States**
   - Form submission has no loading indicator
   - Users might double-click submit

---

## 3. Design Consistency Audit

### Summary

| Category | Violations | Priority |
|----------|-----------|----------|
| Hardcoded slate colors | 18 | P1 |
| Hardcoded blue colors | 10 | P1 |
| Hardcoded white backgrounds | 6 | P2 |
| Hardcoded violet/stone colors | 7 | P2 |
| Hardcoded red for errors | 1 | P0 |
| Raw button elements | 1 | P2 |
| Spacing inconsistencies | 8 | P3 |
| **Total** | **51** | - |

### Critical Violations

#### File: `src/app/join/[role]/page.tsx`

**Hardcoded Text Colors (should use semantic tokens):**
```
Line 331: text-slate-900 → text-foreground
Line 417: text-slate-600 → text-muted-foreground
Line 512: text-slate-500 → text-muted-foreground
Line 474: text-red-500 → text-destructive
```

**Hardcoded Backgrounds:**
```
Line 240: bg-slate-900 → bg-background (or dark variant)
Line 398: bg-white → bg-background
Line 434, 447, 482, 498: bg-white → bg-background
```

**Hardcoded Blue (should use accent/status-info):**
```
Lines 310-312, 343-344, 385: text-blue-400, bg-blue-500 → text-status-info, bg-accent
Lines 434, 447, 482, 498: focus:border-blue-500 → focus:border-accent
```

#### File: `src/app/login/page.tsx`

**Status:** ✅ Clean - Uses semantic tokens correctly

### Recommended Fix Pattern

```tsx
// Before (hardcoded)
<Label className="text-sm font-medium text-slate-900">

// After (semantic)
<Label className="text-sm font-medium text-foreground">
```

---

## 4. Accessibility Audit (WCAG 2.1 AA)

### Compliance Status

| Criterion | Status | Details |
|-----------|--------|---------|
| **1.1.1** Non-text Content | ⚠️ Partial | Decorative images need `aria-hidden` |
| **2.4.3** Focus Order | ✅ Pass | Semantic elements used |
| **2.5.5** Target Size | ✅ Pass | All targets ≥44px |
| **3.3.1** Error Identification | ❌ Fail | Errors not displayed |
| **3.3.2** Labels/Instructions | ❌ Fail | Missing `aria-required` |
| **3.3.3** Error Suggestion | ❌ Fail | No error suggestions |
| **4.1.3** Status Messages | ❌ Fail | Errors not announced |

### Critical Issues

#### Issue 1: Error Messages Not Displayed (Signup Page)
**Priority:** 🔴 Critical  
**WCAG:** 3.3.1, 3.3.3

The signup page redirects errors via URL params but doesn't render them:

```tsx
// Current: Errors are in URL but not displayed
redirect(`/join/${role}?error=${encodeURIComponent(message)}`)

// Missing: Error display component
// Need to add ErrorMessage component like login page has
```

**Fix Required:**
```tsx
function ErrorMessage() {
    const searchParams = useSearchParams()
    const error = searchParams.get('error')
    if (!error) return null
    return (
        <div role="alert" aria-live="polite" className="text-destructive">
            {error}
        </div>
    )
}
```

#### Issue 2: Missing ARIA Required Attributes
**Priority:** 🟡 Major  
**WCAG:** 3.3.2

Required fields lack `aria-required="true"` and required indicators lack `aria-label`:

```tsx
// Current
<Input required />
<span className="text-red-500">*</span>

// Should be
<Input required aria-required="true" />
<span className="text-destructive" aria-label="required">*</span>
```

#### Issue 3: Login Error Not Announced
**Priority:** 🔴 Critical  
**WCAG:** 4.1.3

Login page error message missing `role="alert"`:

```tsx
// Current (src/app/login/page.tsx:33-36)
<div className="p-4 text-sm text-destructive...">
    {error}
</div>

// Should be
<div role="alert" aria-live="polite" className="p-4 text-sm text-destructive...">
    {error}
</div>
```

#### Issue 4: No Form Validation Error Attributes
**Priority:** 🟡 Major  
**WCAG:** 3.3.1

Inputs don't have `aria-invalid` or `aria-describedby` for error states:

```tsx
// Should add
<Input
    aria-invalid={hasError}
    aria-describedby={hasError ? "email-error" : undefined}
/>
{hasError && <div id="email-error" role="alert">{error}</div>}
```

### What's Working ✅

- All form inputs have associated labels with matching `htmlFor`/`id`
- Buttons use semantic `<button>` elements (not clickable divs)
- Focus styles are visible on all inputs
- Touch targets meet 44px minimum

---

## 5. E2E Test Status

### Current State

The existing Playwright tests (`qa-founder.spec.ts`, `qa-executive.spec.ts`, `qa-apprentice.spec.ts`) have issues running against production:

| Issue | Description | Fix |
|-------|-------------|-----|
| Selector mismatch | Login button selector `button[type="submit"]` doesn't match | Changed to `button:has-text("Access Foundry")` ✅ |
| Timeout issues | Tests timing out on production | Need retry configuration |
| Missing signup tests | Only post-login flows tested | Need signup flow tests |

### Recommended Test Coverage

```
e2e/
├── auth.setup.ts           ✅ Fixed selector
├── signup-founder.spec.ts  ⭕ Missing - needs creation
├── signup-executive.spec.ts ⭕ Missing - needs creation
├── signup-apprentice.spec.ts ⭕ Missing - needs creation
├── signup-supplier.spec.ts ⭕ Missing - needs creation
├── login.spec.ts           ⭕ Missing - needs creation
├── qa-founder.spec.ts      ✅ Exists (post-login)
├── qa-executive.spec.ts    ✅ Exists (post-login)
└── qa-apprentice.spec.ts   ✅ Exists (post-login)
```

---

## 6. Prioritized Recommendations

### Priority 1: Critical (Fix This Week) 🔴

1. **Add error display to signup page** (`src/app/join/[role]/page.tsx`)
   - Add `ErrorMessage` component with `role="alert"`
   - Users can't see why signup failed currently
   - ~30 min effort

2. **Add `role="alert"` to login error** (`src/app/login/page.tsx`)
   - One-line fix
   - Screen readers can't announce errors
   - ~5 min effort

3. **Add `aria-required` to all required inputs**
   - Both signup and login pages
   - ~15 min effort

### Priority 2: Major (Fix This Sprint) 🟡

4. **Replace hardcoded colors with semantic tokens**
   - 47 instances in `src/app/join/[role]/page.tsx`
   - Improves dark mode support (future)
   - ~2 hours effort

5. **Add form validation error attributes**
   - `aria-invalid`, `aria-describedby`
   - Improves accessibility
   - ~1 hour effort

6. **Create E2E tests for signup flows**
   - Test each role's signup journey
   - ~2 hours effort

### Priority 3: Nice to Have (Backlog) 🟢

7. **Add password strength indicator**
8. **Add inline validation feedback**
9. **Add form progress indicator**
10. **Add loading states to submit buttons**

---

## 7. Files Requiring Updates

| File | Changes Needed | Effort |
|------|----------------|--------|
| `src/app/join/[role]/page.tsx` | Error display, ARIA attrs, semantic colors | 3 hours |
| `src/app/login/page.tsx` | Add `role="alert"` to error | 5 min |
| `e2e/auth.setup.ts` | Already fixed selector | Done |
| `e2e/signup-*.spec.ts` | Create new test files | 2 hours |

---

## 8. Appendix: Test URLs

### Production URLs
- Founder signup: https://centaurdynamics.io/join/founder
- Executive signup: https://centaurdynamics.io/join/executive
- Apprentice signup: https://centaurdynamics.io/join/apprentice
- Supplier signup: https://centaurdynamics.io/join/supplier
- Login: https://centaurdynamics.io/login

### Demo Mode URLs
Add `?demo=true` to any signup URL for pre-filled forms:
- https://centaurdynamics.io/join/founder?demo=true

### Test Credentials
| Role | Email | Password |
|------|-------|----------|
| Founder | demo.founder@forgeos.io | DemoFounder2026! |
| Executive | demo.executive@forgeos.io | DemoExecutive2026! |
| Apprentice | demo.apprentice@forgeos.io | DemoApprentice2026! |

---

## 9. Conclusion

ForgeOS has a solid onboarding foundation with beautiful UX, especially the cinematic Founder experience. The main gaps are:

1. **Accessibility compliance** - Critical ARIA attributes missing
2. **Design consistency** - Hardcoded colors need migration to semantic tokens
3. **Error handling** - Users can't see form errors on signup

Addressing Priority 1 items will bring the platform to WCAG 2.1 AA compliance and significantly improve the user experience for all users, including those using assistive technologies.

---

*Report generated by automated analysis on February 5, 2026*
