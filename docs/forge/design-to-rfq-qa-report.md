# Forge Design → RFQ QA Report

## Scope

Validation of the end-to-end Design → Drawings → RFQ flow, including:

- RFQ payload generation quality gates
- readiness/scorecard regressions
- benchmark scenarios
- CAD Lab login + landing journey smoke coverage
- auth setup reliability for Playwright persona storage states

## Automated Validation Executed

### 1) Core RFQ/quality regression suite

```bash
npm run test:forge-rfq
```

Result: **PASS**  
Coverage includes:

- `cad-lab-rfq-golden-benchmarks.test.ts`
- `cad-lab-rfq.test.ts`
- `cad-lab-quality-scorecard.test.ts`
- `cad-lab-readiness.test.ts`
- `cad-lab-procurement-utils.test.ts`

### 2) CAD Lab visual smoke (Playwright)

```bash
npm run test:e2e -- e2e/cad-lab-visual-check.spec.ts --project=chromium
```

Result: **PASS**

Validated:

- login flow with current CTA text
- navigation to `/the-forge/cad-lab`
- landing hero + quick-start visibility
- design input field + model selector presence

### 3) Auth storage setup flow (Playwright)

```bash
npm run test:e2e -- e2e/auth.setup.ts --project=auth-setup
```

Result: **PASS**

Validated:

- executive/founder/apprentice/supplier auth state generation
- resilient submit selectors (`Enter the Forge`/legacy text)
- supplier redirect handling for both supplier portal and platform landing routes

## Notes

- During auth flows, environment logs repeatedly report:
  - `Failed to fetch user profile: infinite recursion detected in policy for relation "profiles"`
- Despite those logs, auth setup and CAD Lab smoke tests complete successfully in this environment.

## Current QA Status

- RFQ and scorecard regression gates: ✅
- Benchmark suite gates (5 scenarios): ✅
- Cad Lab landing/login smoke path: ✅
- Playwright auth setup robustness: ✅
