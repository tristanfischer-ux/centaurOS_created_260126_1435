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
- `forge-route-consistency.test.ts`
- `profiles-rls-migration.test.ts`
- `release-config-consistency.test.ts`
- `release-docs-consistency.test.ts`
- `release-packet-consistency.test.ts`
- `telemetry-event-contract-consistency.test.ts`
- `forge-project-list.test.tsx`
- `MobileNav.test.tsx`
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

### 4) Forge entrypoint clarity smoke (Playwright)

```bash
npm run test:e2e -- e2e/forge-entrypoint.spec.ts --project=chromium
```

Result: **PASS**

Validated:

- `/the-forge` surfaces **Design-to-RFQ Lab** as the recommended path
- direct CTA to `/the-forge/cad-lab` is visible
- recommended CTA click navigates into `/the-forge/cad-lab`
- legacy concept CTA points to `/the-forge/new` and click navigates there
- recommendation remains visible even when legacy project list enters error state

### 5) Forge navigation link smoke (Playwright)

```bash
npm run test:e2e -- e2e/forge-navigation-link.spec.ts --project=chromium
```

Result: **PASS**

Validated:

- sidebar **The Forge** nav item routes to `/the-forge`
- Plan section Forge spotlight routes to `/the-forge`
- Workshop section Forge spotlight routes to `/the-forge`
- each Forge discovery link is click-tested to land on `/the-forge`
- mobile **More** menu routes The Forge to `/the-forge`
- mobile **More** menu routes Settings to `/settings`
- canonical entrypoint consistently exposes Design-to-RFQ recommendation card

### 6) Full release verification bundle

```bash
npm run verify:forge-rfq-release
```

Result: **PASS**

Validated:

- full RFQ/unit regression cluster passes in one command
- full E2E smoke chain passes (auth setup + Cad Lab visual + Forge entrypoint + Forge navigation)

## Notes

- The Next.js image-quality warning during login hero rendering was removed by explicitly allowing quality `90` in `next.config.ts` (`images.qualities: [75, 90]`).
- Sentry Next.js deprecation warnings were removed by migrating to the current config keys (`webpack.treeshake.removeDebugLogging` and `webpack.automaticVercelMonitors`) in `next.config.ts`.
- Running `npx supabase db push` from this workspace currently requires a Supabase access token (`SUPABASE_ACCESS_TOKEN`) not present in runtime env. Apply the migration via authenticated deployment runner/dashboard if CLI auth is unavailable.
- During auth flows, some environments may log:
  - `Failed to fetch user profile: infinite recursion detected in policy for relation "profiles"`
- A dedicated migration now exists to harden profiles RLS and remove recursive policy paths:
  - `20260215120000_stabilize_profiles_rls_no_recursion.sql`
- This migration should be applied before alpha rollout to eliminate the noisy profile recursion failure mode.

## Current QA Status

- RFQ and scorecard regression gates: ✅
- Benchmark suite gates (5 scenarios): ✅
- Cad Lab landing/login smoke path: ✅
- Playwright auth setup robustness: ✅
- Forge entrypoint clarity check: ✅
- Forge navigation route check: ✅
