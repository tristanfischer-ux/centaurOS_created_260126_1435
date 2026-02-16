/**
 * @file cost-model.ts — Cost projection model for PersonaPlex voice minutes.
 *
 * @description Provides cost estimation and projection utilities for PersonaPlex
 * voice call usage. Used for billing calculations, budget forecasting, and
 * deciding when to transition from hosted API to self-hosted infrastructure.
 *
 * Pricing (PersonaPlex hosted API as of Feb 2026):
 * - $0.08 per minute of voice conversation
 * - Pay-as-you-go, no minimum commitment
 * - Billed per-second (rounded up to nearest second)
 *
 * Self-hosted alternative:
 * - A100 GPU: ~$2.50/hr = $0.042/min at full utilization
 * - H100 GPU: ~$3.50/hr = $0.058/min at full utilization
 * - Break-even: ~500 minutes/day hosted vs self-hosted A100
 *
 * @related
 * - Types: src/lib/personaplex/types.ts
 * - Billing: src/lib/billing/plans.ts
 */

// ─── Pricing Constants ──────────────────────────────────────────────────────

/** PersonaPlex hosted API cost per minute (USD) */
export const PERSONAPLEX_COST_PER_MINUTE = 0.08

/** Self-hosted A100 cost per hour (USD) */
export const SELF_HOSTED_A100_COST_PER_HOUR = 2.50

/** Self-hosted H100 cost per hour (USD) */
export const SELF_HOSTED_H100_COST_PER_HOUR = 3.50

/** Minutes per day where self-hosting becomes cheaper than hosted API */
export const SELF_HOST_BREAKEVEN_MINUTES_PER_DAY = Math.ceil(
    (SELF_HOSTED_A100_COST_PER_HOUR * 24) / PERSONAPLEX_COST_PER_MINUTE
)
// = ceil(60 / 0.08) = 750 minutes/day for 24/7 GPU vs hosted

// ─── Cost Estimation ────────────────────────────────────────────────────────

/**
 * Calculate the cost of a voice session.
 *
 * @param durationSeconds - Duration of the session in seconds
 * @returns Cost in USD
 */
export function calculateSessionCost(durationSeconds: number): number {
    const minutes = Math.ceil(durationSeconds / 60)
    return minutes * PERSONAPLEX_COST_PER_MINUTE
}

/**
 * Project monthly costs based on usage patterns.
 *
 * @param params - Usage parameters
 * @returns Detailed cost projection
 */
export function projectMonthlyCost(params: {
    /** Number of active foundries (organizations) */
    activeFoundries: number
    /** Average voice calls per foundry per month */
    callsPerFoundryPerMonth: number
    /** Average call duration in minutes */
    avgCallDurationMinutes: number
}): MonthlyProjection {
    const { activeFoundries, callsPerFoundryPerMonth, avgCallDurationMinutes } = params

    const totalCalls = activeFoundries * callsPerFoundryPerMonth
    const totalMinutes = totalCalls * avgCallDurationMinutes
    const hostedCost = totalMinutes * PERSONAPLEX_COST_PER_MINUTE

    const minutesPerDay = totalMinutes / 30

    // Self-hosted costs (24/7 GPU reservation)
    const a100MonthlyCost = SELF_HOSTED_A100_COST_PER_HOUR * 24 * 30
    const h100MonthlyCost = SELF_HOSTED_H100_COST_PER_HOUR * 24 * 30

    // Determine recommendation
    let recommendation: "hosted" | "self-hosted-a100" | "self-hosted-h100"
    let recommendedCost: number

    if (hostedCost < a100MonthlyCost) {
        recommendation = "hosted"
        recommendedCost = hostedCost
    } else if (hostedCost < h100MonthlyCost) {
        recommendation = "self-hosted-a100"
        recommendedCost = a100MonthlyCost
    } else {
        recommendation = "self-hosted-a100"
        recommendedCost = a100MonthlyCost
    }

    return {
        totalCalls,
        totalMinutes,
        minutesPerDay,
        hosted: {
            monthlyCost: hostedCost,
            costPerCall: hostedCost / Math.max(totalCalls, 1),
            costPerFoundry: hostedCost / Math.max(activeFoundries, 1),
        },
        selfHostedA100: {
            monthlyCost: a100MonthlyCost,
            costPerCall: a100MonthlyCost / Math.max(totalCalls, 1),
            costPerFoundry: a100MonthlyCost / Math.max(activeFoundries, 1),
        },
        selfHostedH100: {
            monthlyCost: h100MonthlyCost,
            costPerCall: h100MonthlyCost / Math.max(totalCalls, 1),
            costPerFoundry: h100MonthlyCost / Math.max(activeFoundries, 1),
        },
        recommendation,
        recommendedMonthlyCost: recommendedCost,
        savings: hostedCost - recommendedCost,
    }
}

// ─── Scenario Analysis ──────────────────────────────────────────────────────

/**
 * Pre-built scenarios for different growth stages.
 *
 * Used for planning and investor conversations about infrastructure costs.
 */
export const GROWTH_SCENARIOS = {
    /**
     * Early stage: 10 foundries, light usage
     * ~$16/month — trivial cost, hosted API is perfect
     */
    early: {
        label: "Early Stage (10 foundries)",
        params: {
            activeFoundries: 10,
            callsPerFoundryPerMonth: 10,
            avgCallDurationMinutes: 2,
        },
    },
    /**
     * Growth stage: 100 foundries, moderate usage
     * ~$160/month — still easily hosted API territory
     */
    growth: {
        label: "Growth Stage (100 foundries)",
        params: {
            activeFoundries: 100,
            callsPerFoundryPerMonth: 10,
            avgCallDurationMinutes: 2,
        },
    },
    /**
     * Scale stage: 1,000 foundries, regular usage
     * ~$4,800/month — approaching self-hosting consideration
     */
    scale: {
        label: "Scale Stage (1,000 foundries)",
        params: {
            activeFoundries: 1000,
            callsPerFoundryPerMonth: 20,
            avgCallDurationMinutes: 3,
        },
    },
    /**
     * Enterprise stage: 5,000 foundries, heavy usage
     * ~$48,000/month hosted vs ~$1,800/month self-hosted
     * Clear self-hosting territory
     */
    enterprise: {
        label: "Enterprise Stage (5,000 foundries)",
        params: {
            activeFoundries: 5000,
            callsPerFoundryPerMonth: 30,
            avgCallDurationMinutes: 4,
        },
    },
} satisfies Record<string, { label: string; params: Parameters<typeof projectMonthlyCost>[0] }>

/**
 * Run all growth scenarios and return projections.
 */
export function runAllScenarios(): Array<{
    scenario: string
    label: string
    projection: MonthlyProjection
}> {
    return Object.entries(GROWTH_SCENARIOS).map(([key, scenario]) => ({
        scenario: key,
        label: scenario.label,
        projection: projectMonthlyCost(scenario.params),
    }))
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CostBreakdown {
    /** Total monthly cost in USD */
    monthlyCost: number
    /** Cost per call in USD */
    costPerCall: number
    /** Cost per foundry per month in USD */
    costPerFoundry: number
}

export interface MonthlyProjection {
    /** Total voice calls across all foundries */
    totalCalls: number
    /** Total voice minutes across all foundries */
    totalMinutes: number
    /** Average minutes per day */
    minutesPerDay: number
    /** Hosted API cost breakdown */
    hosted: CostBreakdown
    /** Self-hosted A100 cost breakdown */
    selfHostedA100: CostBreakdown
    /** Self-hosted H100 cost breakdown */
    selfHostedH100: CostBreakdown
    /** Recommended infrastructure option */
    recommendation: "hosted" | "self-hosted-a100" | "self-hosted-h100"
    /** Cost of the recommended option */
    recommendedMonthlyCost: number
    /** Monthly savings vs hosted API (0 if hosted is recommended) */
    savings: number
}
