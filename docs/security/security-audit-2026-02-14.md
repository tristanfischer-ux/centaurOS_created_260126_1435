# Comprehensive Security Audit — 2026-02-14

## Scope

This audit reviewed the application security posture across:

- API routes (`src/app/api/**/route.ts`)
- Server actions (`src/actions/**`, `src/app/actions/**`)
- Authentication and middleware controls
- Supabase policy and migration history
- Dependency and CI security posture

## Methodology

1. Static source inspection and route inventory.
2. Targeted pattern analysis for auth, authorization, secret checks, and rate limiting.
3. Dependency vulnerability scan (`npm audit --omit=dev --json`).
4. Security regression tests for confirmed high-risk misconfigurations.

## Findings Summary

| Severity | Count | Status |
| --- | ---: | --- |
| Critical | 1 | Open |
| High | 3 | 2 fixed, 1 open |
| Medium | 6 | 2 fixed, 4 open |
| Low | 3 | Open |

---

## Fixed During This Audit

### 1) Rate-limit window unit mismatch across API routes (High)

**Issue:** Multiple endpoints passed second-based values (`60`, `900`, `3600`) to a rate limiter that expects milliseconds.  
**Impact:** Effective rate-limiting windows were much shorter than intended, weakening abuse/cost controls.

**Fix implemented:** Updated route-level `rateLimit(..., { window })` values to millisecond-based windows (`* 1000`) across:

- `src/app/api/team/compare/route.ts`
- `src/app/api/marketplace/compare/route.ts`
- `src/app/api/marketplace/ai-search/route.ts`
- `src/app/api/marketplace/talent-match/route.ts`
- `src/app/api/marketplace/forge-match/route.ts`
- `src/app/api/voice-to-task/route.ts`
- `src/app/api/rfq/voice/route.ts`
- `src/app/api/rfq/upload/route.ts`
- `src/app/api/settings/telegram/generate-code/route.ts`
- `src/app/api/agents/stt/route.ts`
- `src/app/api/agents/execute/route.ts`
- `src/app/api/agents/tts/route.ts`
- `src/app/api/agents/council/route.ts`
- `src/app/api/agents/avatar-session/route.ts`

---

### 2) Broken rate-limit call and IP extraction in message upload endpoint (High)

**Issue:** `/api/messages/upload` called:

- `getClientIP(request)` instead of `getClientIP(request.headers)`
- `rateLimit()` using outdated positional arguments instead of current signature

**Impact:** Potential runtime failures and ineffective upload throttling.

**Fix implemented (`src/app/api/messages/upload/route.ts`):**

- Switched to `getClientIP(request.headers)`
- Updated to:
  - `rateLimit('upload', \`message-upload:${user.id}:${ip}\`, { limit: 10, window: 60 * 1000 })`

---

### 3) Cron endpoint fail-open when secret is missing (High)

**Issue:** `/api/cron/morning-brief` only enforced auth when `CRON_SECRET` was present.  
**Impact:** Endpoint could become unintentionally accessible during misconfiguration.

**Fix implemented (`src/app/api/cron/morning-brief/route.ts`):**

- Added fail-closed guard:
  - If `CRON_SECRET` is missing → return `503`
  - If auth header mismatches → return `401`

---

### 4) Next.js high-severity dependency vulnerability (High)

**Issue:** Application was on `next@16.1.4` with known high severity advisories.  
**Fix implemented:** Upgraded to `next@16.1.6` and `eslint-config-next@16.1.6`.

**Current `npm audit --omit=dev` status:**  
- High: **0**  
- Moderate: 5  
- Low: 1

---

## Security Regression Coverage Added

Added: `src/lib/security/__tests__/rate-limit-regression.test.ts`

The test suite enforces:

1. No second-based raw `window` literals (`60`, `900`, `3600`) in API `rateLimit` calls.
2. Correct `getClientIP(request.headers)` and `rateLimit('upload', ...)` signature for message uploads.
3. Fail-closed behavior marker for missing `CRON_SECRET` in morning brief cron route.

---

## Open Findings (Not Yet Remediated)

### Critical

1. **Profiles RLS emergency disable present in migration history**
   - Historical migration `supabase/migrations/20260204260000_emergency_disable_profiles_rls.sql` disables RLS on `public.profiles`.
   - Remediation migration added in this audit:
     - `supabase/migrations/20260214120000_restore_profiles_rls_with_membership_guard.sql`
   - New migration restores profile RLS with:
     - `can_access_profile(uuid)` SECURITY DEFINER helper to avoid recursion
     - shared-foundry profile visibility only
     - self-only insert/update policies
   - Deployment status: **pending Supabase project authentication in this environment**.

### High / Medium

2. **Public message storage buckets**
   - `message-attachments` and `message-files` were created with `public = true`.
   - Risk: attachment URL leakage and unauthorized access if links are shared.
   - Required follow-up: private buckets + signed URL strategy.

3. **Security audit events not durably persisted**
   - `src/lib/security/audit-log.ts` is largely console-based with TODO for production sink.
   - Risk: limited forensic traceability.

4. **CI hardening gaps**
   - `continue-on-error: true` for key checks in some workflows.
   - `next.config.ts` has `typescript.ignoreBuildErrors = true`.
   - Risk: insecure or broken builds shipping.

5. **Potential SSRF sink in daily report webhook delivery**
   - `src/app/api/cron/reports/daily/route.ts` sends requests to persisted webhook URLs.
   - Required follow-up: strict URL validation/allowlist and egress controls.

6. **Residual moderate/low dependency vulnerabilities**
   - Mostly transitive through Excalidraw/Mermaid dependency chain.
   - Follow-up required with compatibility testing.

---

## Recommended Remediation Order

1. Re-enable `profiles` RLS with safe policies and backfill policy tests. *(Critical)*
2. Migrate message storage buckets to private + signed URL access flow. *(High)*
3. Add persistent security event sink (table/log platform) and retention policy. *(High)*
4. Harden CI gates (`continue-on-error` removal for security/type checks). *(Medium)*
5. Add SSRF protections for outbound webhook URLs. *(Medium)*
6. Resolve remaining moderate dependency vulnerabilities with targeted package upgrades. *(Medium)*

---

## Verification Evidence (This Audit Run)

- `npm test -- rate-limit-regression.test.ts` → **pass**
- `npm audit --omit=dev --json` → **high vulnerabilities reduced to 0**

> Note: repository-wide `tsc --noEmit` currently fails due numerous pre-existing unrelated typing issues outside this audit's change set.
