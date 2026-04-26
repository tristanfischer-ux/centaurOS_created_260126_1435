/**
 * @file council.ts — Council tier definitions and specialist set logic.
 *
 * @description Defines the four Council tiers (Quick, Full, Deep, Strategy)
 * and the deterministic specialist selection logic per tier. The tier abstraction
 * hides model selection from the user — they pick "Full Council", not
 * "Sonnet + Opus + Haiku + host".
 *
 * The latency staircase works because each tier selects specialists whose
 * `modelTier` maps to different expected response times:
 *
 *   fast tiers  (haiku, gpt-mini):      ~2s
 *   mid tiers   (sonnet, deepseek, google): ~8s
 *   deep tiers  (claude, qwen-235b):    ~18s
 *   reasoning   (deepseek-v4-pro):      ~30s
 *
 * The opener is ALWAYS the fastest specialist in the selected set, regardless
 * of topic. Topic-relevant specialists fill the remaining slots.
 *
 * @related
 * - team-meeting-dialog.tsx — consumes CouncilTier + getCouncilSpecialists
 * - failover.ts             — modelTier → provider resolution
 * - specialists-config.ts   — SPECIALISTS roster + modelTier field
 */

import { SPECIALISTS } from "@/lib/agents/specialists-config"
import type { Specialist } from "@/lib/agents/specialists-config"
import type { SubscriptionTier } from "@/lib/billing/plans"

// ─── Council Tier ─────────────────────────────────────────────────────────────

/**
 * The four Council depths. Each tier maps to a price tier and a specialist count.
 *
 *   quick    → Free      → 2 specialists (fast + fast/mid)
 *   full     → Starter   → 4 specialists (fast + mid + deep + host-close)
 *   deep     → Pro       → 5 specialists (fast + mid + deep + reasoning + host-close)
 *   strategy → Enterprise→ 5 specialists + foundry RAG (roadmap)
 */
export type CouncilTier = "quick" | "full" | "deep" | "strategy"

// ─── Static latency weights per modelTier ────────────────────────────────────

/**
 * Expected-latency ordering for dispatch staggering.
 * Lower = faster = dispatched first.
 *
 * The values are relative weights — only the sort order matters, not the
 * absolute numbers. The 500ms inter-dispatch stagger in the dialog prevents
 * the slowest models from all starting at once.
 *
 * INTERNAL NOTE: provider names must never appear in user-visible copy.
 * These weights are used only for dispatch ordering inside the dialog.
 */
export const MODEL_TIER_LATENCY_WEIGHT: Record<string, number> = {
    haiku:            1,
    "gpt-mini":       1,
    sonnet:           2,
    deepseek:         3,
    google:           3,
    qwen:             3,
    minimax:          3,
    "qwen-235b":      4,
    claude:           4,
    "deepseek-v4-pro": 5,
    "qwen-local":     3,
}

// ─── Per-position prompt labels ───────────────────────────────────────────────

/**
 * Maps the dispatch position index (0-based) to the opening label phrase
 * the specialist will use. These match the `buildMeetingPrompt` round-based
 * logic in team-meeting-dialog.tsx.
 *
 * Position 0 → opener  → "Quick take"
 * Position 1 → reactor → "On reflection"
 * Position 2+ → deep   → "Thinking about this further"
 */
export type CouncilPosition = "opener" | "reactor" | "deep" | "host-close"

/**
 * The short pill label shown in the streaming UI above each response card.
 * These mirror the bold phrases from the prompt templates.
 */
export const COUNCIL_POSITION_LABELS: Record<CouncilPosition, string> = {
    opener:       "Quick take",
    reactor:      "On reflection",
    deep:         "Thinking about this further",
    "host-close": "Council split",
}

/**
 * Maps a dispatch index within a tier to its CouncilPosition.
 * Host-close is always the last specialist when 4+ are selected.
 */
export function getCouncilPosition(
    index: number,
    totalCount: number,
): CouncilPosition {
    if (index === 0) return "opener"
    if (index === 1) return "reactor"
    if (index === totalCount - 1 && totalCount >= 4) return "host-close"
    return "deep"
}

// ─── Topic classification ─────────────────────────────────────────────────────

/**
 * Broad topic classes inferred from the user's topic string. Used to select
 * the right mid-tier and deep-tier specialists for Full/Deep/Strategy.
 *
 * The classification is best-effort and fuzzy — the Fast opener is always
 * fixed regardless of topic, so classification only affects slots 1+.
 */
export type TopicClass =
    | "fundraising"
    | "product"
    | "go-to-market"
    | "finance"
    | "operations"
    | "hiring"
    | "legal"
    | "strategy"
    | "general"

/**
 * Infer a TopicClass from the meeting topic string.
 */
export function classifyTopic(topic: string): TopicClass {
    const lower = topic.toLowerCase()

    if (/raise|investor|series|pitch|deck|valuation|vc|angel|capital|fund|fundrais/.test(lower)) {
        return "fundraising"
    }
    if (/product|feature|roadmap|mvp|ux|user research|priorit/.test(lower)) {
        return "product"
    }
    if (/market|gtm|go-to-market|brand|content|seo|ads|funnel|campaign|growth|acquisition/.test(lower)) {
        return "go-to-market"
    }
    if (/finance|budget|runway|burn|unit economics|revenue|cost|cash|kpi|profit/.test(lower)) {
        return "finance"
    }
    if (/hiring|recruit|talent|team|compensation|equity|culture|headcount|hr|people/.test(lower)) {
        return "hiring"
    }
    if (/legal|contract|compliance|ip|intellectual property|liability|regulation|privacy/.test(lower)) {
        return "legal"
    }
    if (/operat|process|supply|manufactur|logistics|vendor|supplier|inventory/.test(lower)) {
        return "operations"
    }
    if (/strateg|competitive|market|positioning|pivot|vision|mission|okr/.test(lower)) {
        return "strategy"
    }
    return "general"
}

// ─── Topic-relevant specialist sets (mid/deep slots) ─────────────────────────

/**
 * For each TopicClass, the ordered list of specialist IDs preferred for
 * mid-tier (slot 1) and deep-tier (slot 2+) positions.
 *
 * The opener (slot 0) is ALWAYS the fastest specialist (haiku/gpt-mini tier)
 * regardless of topic — see getCouncilSpecialists(). These tables only
 * apply to slots 1 and beyond.
 *
 * Specialists are listed in preference order for that topic. The selector
 * picks the first N that exist in the SPECIALISTS roster.
 */
const TOPIC_SPECIALIST_PREFERENCE: Record<TopicClass, string[]> = {
    fundraising:  ["fundraising-advisor", "finance-lead", "strategist", "legal-counsel", "chief-of-staff"],
    product:      ["product-lead", "cto", "growth-marketer", "strategist", "chief-of-staff"],
    "go-to-market": ["growth-marketer", "sales-lead", "strategist", "product-lead", "chief-of-staff"],
    finance:      ["finance-lead", "fundraising-advisor", "strategist", "chief-of-staff", "legal-counsel"],
    hiring:       ["hiring-team", "chief-of-staff", "strategist", "legal-counsel", "finance-lead"],
    legal:        ["legal-counsel", "strategist", "chief-of-staff", "finance-lead", "fundraising-advisor"],
    operations:   ["vp-supply-chain", "vp-manufacturing", "cto", "strategist", "chief-of-staff"],
    strategy:     ["strategist", "finance-lead", "fundraising-advisor", "chief-of-staff", "product-lead"],
    general:      ["strategist", "product-lead", "finance-lead", "chief-of-staff", "growth-marketer"],
}

// ─── Fast-opener candidates ───────────────────────────────────────────────────

/**
 * IDs of specialists on the fastest model tiers (haiku, gpt-mini).
 * One of these is ALWAYS used as the opener regardless of topic —
 * their job is a quick decisive take that the slower voices build on.
 *
 * Ordered by preference: growth-marketer (Mia, haiku) first, then
 * sales-lead (Sal, gpt-mini) as backup.
 */
const FAST_OPENER_IDS = ["growth-marketer", "sales-lead"]

// ─── Host-close specialist ────────────────────────────────────────────────────

/**
 * The host-close specialist for Full/Deep/Strategy councils.
 * Chief of Staff (Cal) acts as the synthesis voice — natural fit for
 * "Council split" summarisation at the end.
 * Falls back to strategist if cal is already in the topic set.
 */
const HOST_CLOSE_ID = "chief-of-staff"
const HOST_CLOSE_FALLBACK_ID = "strategist"

// ─── Council specialist sets ──────────────────────────────────────────────────

/**
 * Select the specialist set for a given Council tier and topic.
 *
 * Returns specialists in LATENCY-ASCENDING dispatch order (fastest first).
 * The caller (team-meeting-dialog.tsx) fires them in this order with a
 * 500ms stagger so the slowest models don't all start at the same time.
 *
 * @param tier       - Which Council the user selected
 * @param topicClass - Inferred topic class (from classifyTopic)
 * @returns          Ordered array of Specialist objects; empty if tier === "strategy"
 *                   (Strategy is roadmap-only and rendered as "coming soon").
 */
export function getCouncilSpecialists(
    tier: CouncilTier,
    topicClass: TopicClass,
): Specialist[] {
    const specialistMap = new Map(SPECIALISTS.map((s) => [s.id as string, s]))

    // Helper: look up a specialist by ID (returns undefined if not found)
    const byId = (id: string): Specialist | undefined => specialistMap.get(id)

    // Helper: sort a list of specialists by expected latency (ascending)
    const sortByLatency = (specs: Specialist[]): Specialist[] =>
        [...specs].sort(
            (a, b) =>
                (MODEL_TIER_LATENCY_WEIGHT[a.modelTier] ?? 3) -
                (MODEL_TIER_LATENCY_WEIGHT[b.modelTier] ?? 3)
        )

    // The fast opener — always Mia (haiku) or Sal (gpt-mini)
    const fastOpener = FAST_OPENER_IDS.map(byId).find(Boolean) as Specialist | undefined

    // Topic-relevant specialists excluding the fast opener
    const topicPrefs = TOPIC_SPECIALIST_PREFERENCE[topicClass]
    const topicSpecialists = topicPrefs
        .map(byId)
        .filter((s): s is Specialist => !!s && s.id !== fastOpener?.id)

    // Host-close specialist — last voice; excluded from topic slots
    const hostCloseId =
        topicSpecialists.some((s) => s.id === HOST_CLOSE_ID)
            ? HOST_CLOSE_FALLBACK_ID
            : HOST_CLOSE_ID
    const hostClose = byId(hostCloseId)

    switch (tier) {
        case "quick": {
            // 2 specialists: fast opener + next fastest topic specialist
            if (!fastOpener) return []
            // For Quick we want TWO fast voices — pick the next fastest from
            // topic prefs or fall back to sales-lead as second
            const secondFast =
                topicSpecialists[0] ?? byId(FAST_OPENER_IDS[1]) ?? topicSpecialists[1]
            const set = [fastOpener, secondFast].filter(Boolean) as Specialist[]
            // Quick Council uses only fast tiers; override to fastest two
            return sortByLatency(set)
        }

        case "full": {
            // 4 specialists: fast opener + 2 topic specialists + host-close
            if (!fastOpener) return []
            const topicSlots = topicSpecialists
                .filter((s) => s.id !== hostCloseId)
                .slice(0, 2)
            const set = [fastOpener, ...topicSlots, hostClose].filter(Boolean) as Specialist[]
            return sortByLatency(set)
        }

        case "deep": {
            // 5 specialists: fast opener + 2 topic specialists + 1 deep/reasoning + host-close
            if (!fastOpener) return []
            // Pick up to 2 topic slots (excluding host-close)
            const topicSlots = topicSpecialists
                .filter((s) => s.id !== hostCloseId)
                .slice(0, 2)
            // One additional reasoning/deep specialist not already in the set
            const usedIds = new Set([fastOpener.id, ...topicSlots.map((s) => s.id), hostCloseId])
            const deepSlot = SPECIALISTS.find(
                (s) =>
                    !usedIds.has(s.id) &&
                    (s.modelTier === "deepseek-v4-pro" || s.modelTier === "claude" || s.modelTier === "qwen-235b")
            )
            const set = [fastOpener, ...topicSlots, deepSlot, hostClose].filter(Boolean) as Specialist[]
            return sortByLatency(set)
        }

        case "strategy": {
            // Strategy Council = same as Deep but with foundry RAG.
            // RAG plumbing is not yet built — return empty so the caller
            // renders the "coming soon" state instead of attempting to run.
            return []
        }

        default:
            return []
    }
}

// ─── Tier metadata ────────────────────────────────────────────────────────────

export interface CouncilTierMeta {
    tier: CouncilTier
    label: string
    description: string
    specialistCount: string
    latencyDescription: string
    requiredSubscriptionTier: SubscriptionTier | null
    pricingHint: string
    isComingSoon?: boolean
}

/**
 * Static metadata for each Council tier.
 * Used to render the tier picker UI in the setup phase.
 */
export const COUNCIL_TIER_META: CouncilTierMeta[] = [
    {
        tier: "quick",
        label: "Quick Council",
        description: "2 specialists",
        specialistCount: "2",
        latencyDescription: "First voice in ~2 seconds",
        requiredSubscriptionTier: null, // Free
        pricingHint: "Free",
    },
    {
        tier: "full",
        label: "Full Council",
        description: "4 specialists",
        specialistCount: "4",
        latencyDescription: "Depth grows over 20 seconds",
        requiredSubscriptionTier: "starter_v2",
        pricingHint: "Starter, £20/month",
    },
    {
        tier: "deep",
        label: "Deep Council",
        description: "5 specialists",
        specialistCount: "5",
        latencyDescription: "Reasoning visible at 30 seconds",
        requiredSubscriptionTier: "professional",
        pricingHint: "Pro, £149/month",
    },
    {
        tier: "strategy",
        label: "Strategy Council",
        description: "5 specialists + your data",
        specialistCount: "5 + foundry data",
        latencyDescription: "Tuned to your foundry",
        requiredSubscriptionTier: "enterprise",
        pricingHint: "Enterprise",
        isComingSoon: true,
    },
]

// ─── Tier access check ────────────────────────────────────────────────────────

/**
 * Check whether a user's subscription tier grants access to a Council tier.
 *
 * @param userTier     - The user's current subscription tier
 * @param councilTier  - The Council tier they are trying to use
 * @returns true if the user can access the requested Council tier
 */
export function canAccessCouncilTier(
    userTier: SubscriptionTier | undefined,
    councilTier: CouncilTier,
): boolean {
    const meta = COUNCIL_TIER_META.find((m) => m.tier === councilTier)
    if (!meta) return false
    if (meta.requiredSubscriptionTier === null) return true // Free tier

    const TIER_RANK: Record<SubscriptionTier, number> = {
        free:         0,
        seed:         1, // legacy
        starter:      1, // legacy
        starter_v2:   2,
        professional: 3,
        enterprise:   4,
    }

    const userRank = TIER_RANK[userTier ?? "free"] ?? 0
    const requiredRank = TIER_RANK[meta.requiredSubscriptionTier] ?? 99
    return userRank >= requiredRank
}

// ─── Upgrade modal copy ───────────────────────────────────────────────────────

/**
 * Returns the upgrade modal body copy for a Council tier the user cannot access.
 * Follows the voice rules: lead with the option, never the failure.
 * British spelling. No em dashes.
 */
export function getCouncilUpgradeCopy(councilTier: CouncilTier): {
    headline: string
    body: string
    planName: string
    pricingHint: string
} {
    switch (councilTier) {
        case "full":
            return {
                headline: "Full Council",
                body: "Full Council sends 4 specialists into the room, with depth that builds over 20 seconds. Starter, £20 a month, includes 10 brainstorming sessions and 100 investor leads with a drafted email for each match.",
                planName: "Starter",
                pricingHint: "£20/month, cancel any time",
            }
        case "deep":
            return {
                headline: "Deep Council",
                body: "Deep Council adds a reasoning specialist whose thinking arrives at 30 seconds, after the faster voices have already set the frame. Pro, £149 a month, includes unlimited brainstorming and unlimited investor leads.",
                planName: "Pro",
                pricingHint: "£149/month, cancel any time",
            }
        case "strategy":
            return {
                headline: "Strategy Council",
                body: "Strategy Council runs the same staircase as Deep Council, but wired to your foundry data. Every specialist sees your company context before they speak. Enterprise pricing, bespoke onboarding.",
                planName: "Enterprise",
                pricingHint: "Enterprise, talk to us",
            }
        default:
            return {
                headline: "Upgrade required",
                body: "Upgrade your plan to access this Council tier.",
                planName: "Upgrade",
                pricingHint: "",
            }
    }
}
