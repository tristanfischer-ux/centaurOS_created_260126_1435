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
| High | 5 | 5 fixed (pending migration deploy) |
| Medium | 20 | 18 fixed, 2 open |
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
- Replaced invalid `supabase` singleton import with `createAdminClient()` instantiation
  inside the handler so the cron query path executes with a valid service-role client.
- Removed internal database/error details from HTTP responses while preserving server logs.

---

### 4) Next.js high-severity dependency vulnerability (High)

**Issue:** Application was on `next@16.1.4` with known high severity advisories.  
**Fix implemented:** Upgraded to `next@16.1.6` and `eslint-config-next@16.1.6`.

**Current `npm audit --omit=dev` status:**  
- High: **0**  
- Moderate: 5  
- Low: 1

---

### 5) Message file attachment exposure via public bucket URLs (High)

**Issue:** Message uploads used public URLs and a bucket configured for public access.  
**Impact:** File URLs could be shared or replayed outside intended conversation participants.

**Fix implemented:**

- `src/app/api/messages/upload/route.ts`
  - now requires `conversationId`
  - validates caller is a participant in that conversation
  - stores objects under `messages/{conversationId}/{filename}` in `message-files`
  - returns storage path + short-lived signed URL (no `getPublicUrl`)
- Added signed URL relay endpoint:
  - `src/app/api/messages/file-url/route.ts`
  - validates conversation membership before issuing URL
- `src/components/messaging/ConversationThread.tsx` now sends attachment `path` in message payload.
- `src/components/messaging/MessageBubble.tsx` now resolves signed URLs for storage-path attachments.
- Added shared parsing utility for canonical attachment references:
  - `src/lib/security/message-file-reference.ts`
  - normalizes both current storage paths and legacy Supabase public/signed URLs.
- Migration added:
  - `supabase/migrations/20260214123000_secure_message_files_bucket.sql`
  - sets `message-files` bucket `public = false`.
  - `supabase/migrations/20260214130000_secure_message_attachments_bucket.sql`
  - sets legacy `message-attachments` bucket `public = false`.
  - `supabase/migrations/20260214134000_tighten_legacy_message_attachment_policies.sql`
  - removes legacy foundry-wide storage policies and enforces conversation-participant checks.

---

### 6) Slack webhook SSRF risk in cron report delivery (Medium)

**Issue:** Cron route posted to persisted `slack_webhook_url` without strict destination validation.  
**Impact:** Potential SSRF via attacker-controlled outbound URL.

**Fix implemented:**

- Added strict validator in `src/lib/security/url-validation.ts`:
  - `isValidSlackWebhookUrl(...)`
  - enforces HTTPS + Slack webhook domains + `/services/` path.
- `src/actions/reports.ts` validates webhook URL before persistence.
- `src/app/api/cron/reports/daily/route.ts` validates again before fetch and uses:
  - `redirect: 'error'`
  - 10s timeout via `AbortController`.
- Added tests:
  - `src/lib/security/__tests__/url-validation.test.ts`
  - regression assertion in `rate-limit-regression.test.ts`.

---

### 7) Security audit events lacked durable persistence (Medium)

**Issue:** Security events were console-only despite existing audit-table support in migrations.  
**Impact:** Forensic visibility risk due to non-durable logs.

**Fix implemented (`src/lib/security/audit-log.ts`):**

- Integrated persistence using service-role client + `insert_security_audit_log` RPC.
- Preserved non-blocking behavior (auth flows do not fail if logging backend errors).
- Added unit tests:
  - `src/lib/security/__tests__/audit-log.test.ts`.

---

### 8) CI security audit was non-blocking (Medium)

**Issue:** Docker CI workflow allowed security audit failures via `continue-on-error: true`.  
**Fix implemented (`.github/workflows/docker-build.yml`):**

- Security audit now runs as a gate:
  - `npm audit --omit=dev --audit-level=low`
  - no `continue-on-error`.

---

### 9) Missing security-focused type gate in CI (Medium)

**Issue:** Global `typecheck` remains non-blocking due known repository-wide legacy errors, which weakens confidence for security-sensitive paths.  
**Fix implemented:**

- Added focused security TypeScript project:
  - `tsconfig.security.json`
- Added script:
  - `npm run typecheck:security`
- Added blocking CI step in `.github/workflows/docker-build.yml`:
  - `Security Type Check`

This introduces a hard gate for key security surfaces while broader type debt is addressed separately.

---

### 10) Council internal execution route could be env-rerouted (Medium)

**Issue:** Specialist council debate execution previously built internal API URL from
environment variables (`NEXT_PUBLIC_BASE_URL` / `VERCEL_URL`) while forwarding user cookies.  
**Impact:** Misconfigured env could route authenticated internal calls to an external host.

**Fix implemented (`src/app/api/agents/council/route.ts`):**

- Internal execution URL now derives from `request.nextUrl.origin`.
- Removed environment-based base URL selection for the delegated execution call.
- Matching server action hardening in `src/actions/run-specialist-council.ts`:
  - resolves host/protocol from request headers with validation
  - removes env-based URL routing for cookie-forwarded council API call.
- Added regression guard in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 11) QA callback metadata endpoint exposed unauthenticated readiness details (Medium)

**Issue:** `GET /api/admin/qa-tests/callback` returned readiness metadata without secret validation.  
**Impact:** Unauthenticated callers could confirm callback endpoint presence and liveness.

**Fix implemented (`src/app/api/admin/qa-tests/callback/route.ts`):**

- Added shared `verifyQaCallbackSecret(...)` guard.
- Applied guard to both `POST` and `GET` handlers.
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 12) Multiple cron routes allowed secretless execution in development mode (Medium)

**Issue:** Several cron routes accepted requests without `CRON_SECRET` outside production.  
**Impact:** Inconsistent authorization posture and elevated accidental exposure risk in
non-production environments.

**Fix implemented:**

- Updated cron routes to fail closed (503) when `CRON_SECRET` is missing:
  - `src/app/api/cron/reports/daily/route.ts`
  - `src/app/api/cron/weekly-synthesis/route.ts`
  - `src/app/api/cron/agent-sweep/route.ts`
  - `src/app/api/cron/telegram-briefings/route.ts`
- Unauthorized requests now consistently return 401 when secret mismatch.
- Added regression assertion covering all four routes in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 13) Some OpenAI-backed routes did not fail closed on missing API key (Medium)

**Issue:** Several AI routes instantiated OpenAI clients with build-time placeholder keys
but lacked explicit runtime guardrails for missing `OPENAI_API_KEY`.  
**Impact:** Misconfigured environments could produce ambiguous failures instead of explicit
service-unavailable behavior.

**Fix implemented:**

- Added explicit fail-closed checks (503) in:
  - `src/app/api/marketplace/ai-search/route.ts`
  - `src/app/api/marketplace/talent-match/route.ts`
  - `src/app/api/marketplace/forge-match/route.ts`
  - `src/app/api/rfq/voice/route.ts`
- Removed dummy/placeholder OpenAI key fallbacks and switched to lazy
  `getOpenAIClient()` initialization in:
  - `src/app/api/marketplace/ai-search/route.ts`
  - `src/app/api/marketplace/talent-match/route.ts`
  - `src/app/api/marketplace/forge-match/route.ts`
  - `src/app/api/rfq/voice/route.ts`
  - `src/app/api/agents/stt/route.ts`
  - `src/app/api/voice-to-task/route.ts`
  - `src/app/api/marketplace/compare/route.ts`
  - `src/app/api/team/compare/route.ts`
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 14) Residual transitive dependency vulnerabilities in Excalidraw/Mermaid chain (Medium)

**Issue:** Remaining moderate vulnerabilities were concentrated in transitive dependencies
(`mermaid`, `dompurify`, `nanoid`) under the Excalidraw integration path.  
**Impact:** Dependency risk remained non-zero despite high-severity gates.

**Fix implemented:**

- Added targeted dependency overrides in `package.json` for vulnerable transitive packages:
  - `@excalidraw/mermaid-to-excalidraw` → `mermaid@10.9.4`, `nanoid@5.0.9`
  - `@excalidraw/excalidraw` → `nanoid@3.3.8`
  - global `dompurify@3.2.4`
- Reinstalled lockfile to enforce resolved tree.
- Verified production audit now reports zero vulnerabilities.

---

### 15) Sweep trigger webhook auth allowed secretless execution in development mode (Medium)

**Issue:** `/api/agents/sweep-trigger` allowed requests when no webhook secret was configured outside production.  
**Impact:** Inconsistent webhook authorization posture and avoidable accidental exposure risk.

**Fix implemented (`src/app/api/agents/sweep-trigger/route.ts`):**

- `verifyWebhookAuth(...)` now fail-closes with 503 when no `WEBHOOK_SECRET`/`CRON_SECRET` is configured.
- Unauthorized requests continue to return 401 on secret mismatch.
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 16) Telegram webhook status endpoint exposed unauthenticated liveness metadata (Medium)

**Issue:** `GET /api/bot/telegram` returned service status without webhook-secret validation.  
**Impact:** Unauthenticated callers could enumerate webhook endpoint liveness and behavior.

**Fix implemented (`src/app/api/bot/telegram/route.ts`):**

- `verifyWebhookSecret(...)` now fail-closes with 503 when `TELEGRAM_WEBHOOK_SECRET` is missing.
- Applied secret validation to both `POST` and `GET` handlers.
- Added bearer fallback auth path for operational checks.
- Removed internal error-detail echo in objective creation failure responses.
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 17) Cron/sweep endpoints returned raw internal error details (Medium)

**Issue:** Several secret-protected cron/webhook endpoints echoed internal exception messages
directly in JSON error responses.  
**Impact:** Increased information disclosure risk for authorized-but-untrusted callers and logs aggregation.

**Fix implemented:**

- Replaced raw error-message responses with generic failure strings in:
  - `src/app/api/cron/reports/daily/route.ts`
  - `src/app/api/cron/weekly-synthesis/route.ts`
  - `src/app/api/cron/agent-sweep/route.ts`
  - `src/app/api/cron/telegram-briefings/route.ts`
  - `src/app/api/agents/sweep-trigger/route.ts`
- Preserved structured server-side logging of internal error messages.
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 18) Agent objective/task actions lacked authenticated foundry scoping (Medium)

**Issue:** `src/actions/agent-objectives.ts` used an invalid Supabase singleton import and
did not enforce authenticated foundry membership before create/update operations.  
**Impact:** Risk of runtime failures plus weak tenant-boundary enforcement for agent objective/task writes.

**Fix implemented:**

- Replaced dynamic `.supabase` import pattern with authenticated `createClient()` usage.
- Added explicit auth guard helper (`getAuthenticatedClient`) returning unauthorized failures.
- Added foundry membership guard (`ensureFoundryMembership`) before agent objective/task creation.
- Preserved retry behavior while routing all writes through authenticated client context.
- Expanded `typecheck:security` scope to include:
  - `src/actions/agent-objectives.ts`
  - `src/lib/agents/permission-guard.ts`
  - `src/lib/agents/collaboration-hub.ts`
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 19) Server actions and Telegram AI processor used placeholder OpenAI key fallbacks (Medium)

**Issue:** Several server-side AI entry points initialized OpenAI clients with
placeholder fallback keys at module scope.  
**Impact:** Misconfigured environments could attempt upstream AI calls with invalid
credentials instead of consistently failing closed.

**Fix implemented:**

- Replaced placeholder fallback initialization with lazy `getOpenAIClient()`
  guards in:
  - `src/actions/strategic-planner.ts`
  - `src/actions/smart-goals.ts`
  - `src/actions/generate-advisory-answer.ts`
  - `src/actions/assess-coverage.ts`
  - `src/actions/analyze.ts`
  - `src/app/actions/analyze-business-plan.ts`
  - `src/lib/telegram/ai-processor.ts`
- Added explicit fail-closed behavior when `OPENAI_API_KEY` is unavailable.
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 20) Billing test activation endpoint could be enabled by partial Stripe misconfiguration (Medium)

**Issue:** `POST /api/billing/test-activate` relied only on absence of
`STRIPE_PRICE_STARTER_MONTHLY` to permit test subscription activation.  
**Impact:** Environments with incomplete Stripe configuration could expose a
self-service subscription escalation path.

**Fix implemented (`src/app/api/billing/test-activate/route.ts`):**

- Added `verifyTestBillingAccess(...)` fail-closed guard requiring:
  - `ALLOW_TEST_BILLING_ACTIVATION === 'true'` (explicit opt-in)
  - `TEST_BILLING_SECRET` to be configured
  - `Authorization: Bearer <TEST_BILLING_SECRET>` on each request
- Retained existing guard that disables endpoint when real Stripe prices are configured.
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 21) CAD module generation endpoint lacked abuse throttling for expensive workloads (Medium)

**Issue:** `POST /api/cad-lab/generate-module` performed long-running AI + CAD
generation without endpoint-level throttling.  
**Impact:** Authenticated abuse could drive disproportionate AI/Modal cost and
resource contention.

**Fix implemented (`src/app/api/cad-lab/generate-module/route.ts`):**

- Added per-user rate limiting:
  - key: `cad-lab-module:${user.id}`
  - limit: `30`
  - window: `60 * 60 * 1000` (1 hour)
- Added explicit `429` response on limit exhaustion.
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 22) QA test trigger endpoint lacked abuse throttling and used env-derived callback base URL (Medium)

**Issue:** `POST /api/admin/qa-tests` allowed repeated workflow dispatches without
trigger throttling and built callback URLs from environment-derived base URLs.  
**Impact:** Increased GitHub Actions abuse/cost risk and potential callback misrouting under env misconfiguration.

**Fix implemented (`src/app/api/admin/qa-tests/route.ts`):**

- Added per-admin trigger throttling:
  - key: `qa-tests-trigger:${user.id}`
  - limit: `10`
  - window: `60 * 60 * 1000` (1 hour)
- Derived callback URL from `request.nextUrl.origin` instead of environment base URL.
- Added fail-closed `QA_CALLBACK_SECRET` configuration guard before dispatch.
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 23) CAD batch status polling endpoint lacked request throttling (Medium)

**Issue:** `GET /api/cad-lab/generate-batch` exposed a frequent polling path
without endpoint-level throttling.  
**Impact:** Authenticated polling abuse could increase database load and degrade
CAD-lab responsiveness.

**Fix implemented (`src/app/api/cad-lab/generate-batch/route.ts`):**

- Added per-user polling throttle:
  - key: `cad-lab-batch-status:${user.id}`
  - limit: `120`
  - window: `60 * 1000` (1 minute)
- Added explicit `429` response when exceeded.
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

### 24) Development auto-login endpoint lacked explicit enablement and shared-secret protection (Medium)

**Issue:** `GET /api/dev-login` was gated by `NODE_ENV !== 'production'` but did not
require explicit feature enablement, shared-secret authorization, or request throttling.  
**Impact:** Misconfigured deployments and shared preview/test environments had elevated
risk of unauthorized test-session creation.

**Fix implemented (`src/app/api/dev-login/route.ts`):**

- Added explicit opt-in requirement:
  - `ALLOW_DEV_LOGIN === 'true'`
- Added shared-secret auth requirement:
  - configured `DEV_LOGIN_SECRET`
  - `Authorization: Bearer <DEV_LOGIN_SECRET>`
- Added IP-based endpoint throttling:
  - key: `dev-login:${ip}`
  - limit: `20`
  - window: `60 * 1000` (1 minute)
- Removed detailed login-failure payload fields from response.
- Added regression assertion in:
  - `src/lib/security/__tests__/rate-limit-regression.test.ts`.

---

## Security Regression Coverage Added

Added:

- `src/lib/security/__tests__/rate-limit-regression.test.ts`
- `src/lib/security/__tests__/message-file-reference.test.ts`

The test suite enforces:

1. No second-based raw `window` literals (`60`, `900`, `3600`) in API `rateLimit` calls.
2. Correct `getClientIP(request.headers)` and `rateLimit('upload', ...)` signature for message uploads.
3. Conversation-scoped attachment path handling and no public URL generation in message upload route.
4. Fail-closed behavior markers for cron authorization paths (`CRON_SECRET` required).
5. Slack webhook validation guard in daily report cron route.
6. Canonical normalization support for legacy/current attachment references.
7. QA callback secret enforcement across both POST and GET handlers.
8. Internal council routing no longer uses env-driven URLs for cookie-forwarded calls.
9. OpenAI-key fail-closed guards for AI marketplace/RFQ routes.
10. Sweep-trigger webhook secret fail-closed enforcement.
11. Telegram webhook secret fail-closed enforcement and GET endpoint protection.
12. Cron/sweep APIs no longer expose raw internal exception messages in responses.

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

2. **Global TypeScript gate still non-blocking**
   - `next.config.ts` retains `typescript.ignoreBuildErrors = true`.
   - Type-check workflow step also remains non-blocking due broad pre-existing type debt.
   - Mitigation shipped: focused `typecheck:security` gate is now blocking in CI.
   - Required follow-up: staged type debt reduction and eventual full typecheck hard fail.

---

## Recommended Remediation Order

1. Deploy the `profiles` RLS restoration migration and verify on linked Supabase project. *(Critical)*
2. Deploy bucket/policy-hardening migrations and verify attachment access across current + legacy messages. *(High)*
3. Harden remaining CI/type gates after reducing pre-existing type errors. *(Medium)*

---

## Verification Evidence (This Audit Run)

- `npm test -- audit-log.test.ts rate-limit-regression.test.ts message-file-reference.test.ts url-validation.test.ts` → **pass**
- `npm run typecheck:security` → **pass**
- `npm audit --omit=dev --json` → **0 vulnerabilities (low/moderate/high/critical)**

> Note: repository-wide `tsc --noEmit` currently fails due numerous pre-existing unrelated typing issues outside this audit's change set.
