/**
 * @file tier-aware-models.ts — Tier-aware model selection for Council / brainstorming dispatch.
 *
 * @description Provides `getEffectiveModelTier`, a thin override layer that sits between
 * the per-specialist `modelTier` configuration and the `getPrimaryTargetForTier` resolver.
 *
 * The rule is intentionally simple:
 *
 *   free / anonymous → always 'haiku' regardless of specialist or Council tier
 *   starter_v2 and above → pass through to the specialist's natural modelTier
 *
 * Scope: Council and brainstorming dispatch ONLY (where the founder sees the
 * answer in real time and cost is directly proportional to response volume).
 * Investor-match and supplier-match generation are intentionally NOT covered —
 * those pre-cache outputs per founder context and must run on the canonical
 * benchmark-validated mappings so the cache stays high quality.
 *
 * VOICE FLOOR: Free / anonymous tier benchmarked composite must clear >= 4.0
 * before public release. Confirm via
 *   experiments/autoagent-strategy-specialist/benchmark/runner_multi.py
 *   --tier=free
 * against representative founder prompts.
 * As of 2026-04-25, NOT yet benchmarked at the cheap-tier level — this module
 * lands the implementation; benchmarking is a required separate task before the
 * free tier is opened to the public.
 *
 * @related
 * - failover.ts                  — ModelTier type + getPrimaryTargetForTier
 * - council.ts                   — CouncilTier type
 * - plans.ts                     — SubscriptionTier type
 * - team-meeting-dialog.tsx      — primary consumer (executeSpecialist)
 *
 * @audit Created 2026-04-25 per RED-TEAM-PIVOT-PLAN.md Tier −1 step 4 + 5b.
 */

import type { ModelTier } from "@/lib/agents/failover"
import type { SubscriptionTier } from "@/lib/billing/plans"
import type { CouncilTier } from "@/lib/agents/council"

// ─── Free-tier model class ────────────────────────────────────────────────────

/**
 * The cheap-class model tier applied to every specialist when the user is on
 * the free or anonymous tier. Haiku is the primary target in its FALLBACK_CHAIN;
 * the chain falls back through Sonnet → DeepSeek → Gemini → MiniMax so the
 * session degrades gracefully on provider outages.
 *
 * This constant is the single source of truth for "what does a free-tier user
 * get?" — change it here and the override propagates automatically to every
 * Council dispatch.
 */
const FREE_TIER_MODEL: ModelTier = "haiku"

// ─── Tier rank helper (mirrors TIER_RANK in council.ts canAccessCouncilTier) ──

/**
 * Numeric rank for each subscription tier. Higher = more access.
 * 'anonymous' is treated identically to 'free' (rank 0).
 *
 * Legacy tiers (seed, starter) are ranked above free so existing subscribers
 * continue to receive the canonical per-specialist models.
 */
const TIER_RANK: Record<string, number> = {
    anonymous:    0,
    free:         0,
    seed:         1, // legacy
    starter:      1, // legacy
    starter_v2:   2,
    professional: 3,
    enterprise:   4,
}

// ─── Core override function ───────────────────────────────────────────────────

/**
 * Returns the effective `ModelTier` for a specialist dispatch, applying the
 * free / anonymous override rule when appropriate.
 *
 * @param specialistModelTier  - The specialist's natural `modelTier` from specialists-config.ts
 * @param subscriptionTier     - The authenticated user's subscription tier (or 'free' / 'anonymous')
 * @param councilTier          - Optional: the Council tier selected by the user (for future
 *                               per-Council capping — Quick / Full / Deep / Strategy). Currently
 *                               unused beyond being available for future extension. The free /
 *                               anonymous override already ensures cheap-class models regardless
 *                               of Council tier.
 * @returns                    The `ModelTier` that should be passed to `getPrimaryTargetForTier`.
 *
 * @example
 * // Free user on a 4-specialist Full Council — all four resolve to haiku
 * getEffectiveModelTier("claude", "free", "full") // → "haiku"
 *
 * // Paid user on Full Council — natural tier preserved
 * getEffectiveModelTier("claude", "starter_v2", "full") // → "claude"
 *
 * // Anonymous (not logged in) user on Quick Council
 * getEffectiveModelTier("haiku", "anonymous", "quick") // → "haiku" (already cheap, no change)
 */
export function getEffectiveModelTier(
    specialistModelTier: ModelTier,
    subscriptionTier: SubscriptionTier | "anonymous",
    councilTier?: CouncilTier,
): ModelTier {
    const rank = TIER_RANK[subscriptionTier] ?? 0

    // Free / anonymous: always route to the cheap-class model tier.
    // The specialist's personality, prompts, and routing are unchanged —
    // only the model behind them changes.
    if (rank === 0) {
        return FREE_TIER_MODEL
    }

    // Paid tiers (starter_v2, professional, enterprise) and legacy tiers
    // (seed, starter): pass through to the specialist's natural modelTier.
    // Benchmark-validated per-specialist mappings are preserved exactly.
    // The councilTier param is available here for future Quick-Council capping
    // if needed (e.g. cap 'quick' to gpt-mini even on paid tiers for latency).
    void councilTier // available for future extension — no-op today

    return specialistModelTier
}
