# Money V2 — Red-team findings (production)

**Date:** 2026-04-19 · **Target:** `https://fractionalforge.app` (production, commit `4656f369`) · **Test user:** `claude-test@forgeos.test` (flag ON, Founder role, 8 plan lines + 2 scenarios + 1 active round + 7 pipeline rows + 1 budget row seeded)

Four personas walked the new `/money/*` surface in sequence. Scope: new stuff only (no regression tests on legacy `/cash-burn`, `/investors`, `/fundraise`, `/the-forge`).

## Verdict

**Ship as-is** — zero critical or high-severity findings. Only 3 low-severity items (2 polish, 1 seed-data only).

## Per-persona summary

### Persona 1 — The Bear (bug hunt)
- 20/20 main + drill-in routes render clean h1s, zero Next.js error overlays
- 8/8 invalid-UUID/slug routes gracefully render "X not found" (RLS + server-action guards both fire)
- 4/4 links from Cockpit land live targets
- Keyboard: 41 focusable elements on `/money/plan`, **no skip-link** (a11y polish)

### Persona 2 — The Realist (math + data coherence)
- Cockpit runway + monthly burn tie out to the underlying plan_line_items (manual verification within £5 of `runway.ts` output)
- Plan grid (6 out lines + 2 in lines) matches seeded data exactly
- Raise kanban shows 7 pipeline rows across 8 stages, committed total matches sum of verbal/closed rows

### Persona 3 — The Paranoid Auditor (security + permissions)
- **RLS holds cross-foundry:** `/money/raise/investor/<other-foundry-uuid>` returns "Investor not found" — no leak
- **Zero token/key leaks in HTML payload:** `access_token_encrypted`, `refresh_token_encrypted`, `SUPABASE_SERVICE_ROLE_KEY`, `service_role` all absent from Cockpit page
- Founder-only UI gates work: Grant-exception dialog + Export-CSV button render only for Founder role
- Deep keyword scan: no internal column names or auth keys leak

### Persona 4 — The Impatient Founder (UX friction)
- Three real tasks each completable in ≤ 2 clicks:
  1. "Log a £500 prototype expense" → Cockpit CTA → form (Vendor / Amount / Date / Category) → Submit ✅
  2. "Pass an investor with reason" → card → detail → "Mark as passed" ✅
  3. "Draft this month's investor update" → sidebar → "Create draft" button + dignified empty state ✅
- Empty states across Plan / Pitch / Credits: **zero accusatory copy** (`"you haven't"`, `"no data yet"`, `"haven't started"` all absent)
- Sidebar: "MONEY [V2]" label renders, Credits pill shows live usage

## Findings table

| # | Severity | Persona | Finding | Fix path |
|---|---|---|---|---|
| 1 | Low | Bear | Invalid-UUID error pages (`/money/plan/item/<bad-id>`, `/money/raise/investor/<bad-id>` etc.) render the "Not found" message without an `<h1>`. Breaks heading hierarchy + hurts screen-reader navigation. | Wrap the error fallbacks in an `<h1>` with status-token styling. ~5 lines × 8 pages; small PR. Post-merge follow-up. |
| 2 | Low | Bear | No `<a href="#main">Skip to main content</a>` on the platform layout. Keyboard-only users tab through ~40 sidebar links before reaching page content. | Add a single skip-link to `src/app/(platform)/layout.tsx`. Not Money-specific; repo-wide fix. Post-merge follow-up. |
| 3 | Low | Realist | Seeded Innovate UK grant in `claude-test-foundry` defaults to `probability_pct=100` — makes runway look more optimistic than a real founder would model (typical: 30–50%). | Test-data only. Update seed for any future demo/walkthrough; not a code bug. |

## Not-a-finding (passed checks worth noting)

- Token encryption at rest (`bytea` columns) + absence from HTML payloads — full production verification.
- RLS `foundry_memberships`-scoped (not `foundry_members`) on all 20 Money V2 tables.
- `money_scenarios` correctly namespaced around the legacy `burn_scenarios` collision.
- `ai_credits_ledger.audit_log_id` type matches `audit_log.id` (uuid, not bigint — fixed pre-merge).
- Founder + co_founder + executive role checks coarse-compile cleanly onto the 5-value production enum.

## Fix queue

Given zero critical/high findings and the flag is still OFF for all users except `claude-test@forgeos.test`, nothing blocks merge-already-done status.

- **Findings #1 + #2** — track as two small post-merge PRs (5-10 min each, not Money-exclusive).
- **Finding #3** — update dev seed scripts next time we spin up demo data.

## Evidence appendix

Raw persona-script outputs lived at `/tmp/bear-findings.md`, `/tmp/realist-findings.md`, `/tmp/auditor-findings.md`, `/tmp/founder-findings.md` during the run. Consolidated verdict is this file.

---

Session closed via `agent-browser close --all`. No test rows left behind on production (the one pipeline_state row seeded in `sandbox-c0000000` for the RLS probe was deleted after the auditor's check).
