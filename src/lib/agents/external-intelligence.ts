/**
 * @file external-intelligence.ts
 *
 * @description Defines external intelligence capabilities for specialists.
 * Each specialist can monitor external signals relevant to their domain
 * and surface them proactively.
 *
 * This is the framework — actual data fetching happens via sweep prompts
 * that instruct the AI to analyze provided context and generate insights
 * about external factors.
 *
 * @related
 * - Sweep orchestrator: src/lib/agents/sweep-orchestrator.ts
 * - Sweep prompts: src/lib/agents/sweep-prompts.ts
 * - Proactive outreach: src/lib/telegram/proactive-outreach.ts
 */

import type { SpecialistId } from '@/lib/agents/specialists-config'

// ─── Types ──────────────────────────────────────────────────────────

export interface IntelligenceSource {
    /** Unique identifier */
    id: string
    /** Display name */
    name: string
    /** What this source monitors */
    description: string
    /** Which specialist owns this intelligence */
    specialistId: SpecialistId
    /** The prompt template for analyzing this intelligence */
    analysisPrompt: string
    /** How often to check (in hours) */
    frequencyHours: number
    /** Priority level for surfacing */
    priority: 'high' | 'medium' | 'low'
}

export interface IntelligenceReport {
    /** Which intelligence source generated this report */
    sourceId: string
    /** Which specialist owns this report */
    specialistId: SpecialistId
    /** Human-readable title */
    title: string
    /** Brief summary of findings */
    summary: string
    /** Business implications of the findings */
    implications: string[]
    /** Specific actions the founder should consider */
    recommendedActions: string[]
    /** How urgently this needs attention */
    urgency: 'immediate' | 'this_week' | 'monitor'
    /** ISO timestamp of when the report was generated */
    generatedAt: string
}

// ─── Intelligence Source Definitions ────────────────────────────────

export const INTELLIGENCE_SOURCES: IntelligenceSource[] = [
    // ── Strategy (Sage) ──────────────────────────────────────────
    {
        id: 'market-trends',
        name: 'Market Trends Monitor',
        description: 'Analyzes market dynamics, emerging trends, and competitive shifts',
        specialistId: 'strategist',
        analysisPrompt: `Based on the company context provided, analyze the current market landscape:

1. **Market Dynamics**: What's changing in this company's market? Any shifts in customer behavior, technology, or regulation?
2. **Competitive Moves**: Based on the competitive landscape described, what moves should the company anticipate?
3. **Emerging Opportunities**: Are there adjacent markets or underserved segments worth exploring?
4. **Threats**: What external threats should the founder be aware of?

Provide specific, actionable intelligence — not generic observations. If you don't have enough context to be specific, say so.

Format as a brief intelligence report (300 words max).`,
        frequencyHours: 168, // Weekly
        priority: 'medium',
    },
    {
        id: 'strategic-risks',
        name: 'Strategic Risk Scanner',
        description: 'Identifies strategic risks based on company trajectory and market position',
        specialistId: 'strategist',
        analysisPrompt: `Based on the company context, identify the top 3 strategic risks:

For each risk:
- **Risk**: What could go wrong
- **Likelihood**: High/Medium/Low
- **Impact**: What happens if it materializes
- **Early Warning Signs**: What to watch for
- **Mitigation**: What to do about it now

Be specific to THIS company. Generic risks like "competition" are not useful.

Format as a concise risk brief (250 words max).`,
        frequencyHours: 168, // Weekly
        priority: 'high',
    },

    // ── Finance (Finn) ───────────────────────────────────────────
    {
        id: 'financial-health',
        name: 'Financial Health Check',
        description: 'Monitors financial metrics and flags concerning trends',
        specialistId: 'finance-lead',
        analysisPrompt: `Based on the company's financial context, provide a health check:

1. **Runway Status**: Based on current burn rate and revenue, how many months of runway remain?
2. **Trend Analysis**: Are key metrics (revenue, burn, margins) trending in the right direction?
3. **Unit Economics**: Are unit economics improving or deteriorating?
4. **Cash Flow Concerns**: Any upcoming cash flow crunches to prepare for?
5. **Action Items**: What financial actions should be taken this week?

Be specific with numbers where possible. Flag assumptions.

Format as a financial health brief (250 words max).`,
        frequencyHours: 168, // Weekly
        priority: 'high',
    },
    {
        id: 'fundraising-market',
        name: 'Fundraising Climate',
        description: 'Monitors fundraising market conditions and investor sentiment',
        specialistId: 'fundraising-advisor',
        analysisPrompt: `Based on the company context and stage, assess the fundraising climate:

1. **Market Conditions**: Is this a good time to raise for a company at this stage?
2. **Investor Appetite**: What are investors looking for in this sector?
3. **Valuation Benchmarks**: What valuations are companies at this stage getting?
4. **Timing Recommendation**: Should the company be raising now, preparing, or waiting?
5. **Preparation Checklist**: What should be ready before approaching investors?

Be honest about market conditions. Don't sugarcoat.

Format as a fundraising climate brief (250 words max).`,
        frequencyHours: 336, // Bi-weekly
        priority: 'medium',
    },

    // ── Product (Priya) ──────────────────────────────────────────
    {
        id: 'product-signals',
        name: 'Product Signal Detector',
        description: 'Identifies product opportunities and risks from user behavior patterns',
        specialistId: 'product-lead',
        analysisPrompt: `Based on the company's product context, identify key signals:

1. **Feature Gaps**: Based on objectives and tasks, what product capabilities are missing?
2. **User Pain Points**: What patterns suggest user frustration or unmet needs?
3. **Scope Creep Risk**: Are there signs of building too much too fast?
4. **Competitive Differentiation**: Is the product staying differentiated?
5. **Simplification Opportunities**: What could be removed or simplified?

Focus on actionable product insights, not generic advice.

Format as a product signal brief (250 words max).`,
        frequencyHours: 168, // Weekly
        priority: 'medium',
    },

    // ── Sales (Sal) ──────────────────────────────────────────────
    {
        id: 'pipeline-health',
        name: 'Pipeline Health Monitor',
        description: 'Monitors sales pipeline health and identifies revenue risks',
        specialistId: 'sales-lead',
        analysisPrompt: `Based on the company's sales context, assess pipeline health:

1. **Pipeline Coverage**: Is there enough pipeline to hit revenue targets?
2. **Conversion Trends**: Are conversion rates improving or declining?
3. **Deal Velocity**: How fast are deals moving through the pipeline?
4. **Revenue Risk**: What deals are at risk and why?
5. **Outreach Effectiveness**: Is outreach generating enough qualified leads?

Provide specific numbers where possible. Flag the ONE thing that needs attention most.

Format as a pipeline health brief (200 words max).`,
        frequencyHours: 168, // Weekly
        priority: 'high',
    },

    // ── Manufacturing (Fang) ─────────────────────────────────────
    {
        id: 'production-monitor',
        name: 'Production Monitor',
        description: 'Monitors production status and identifies manufacturing risks',
        specialistId: 'vp-manufacturing',
        analysisPrompt: `Based on the company's manufacturing context, assess production status:

1. **Production Status**: Are we on track for current production targets?
2. **Quality Metrics**: Any quality concerns or yield issues?
3. **Bottlenecks**: What's the current production bottleneck?
4. **Supplier Risks**: Any supplier-related risks to flag?
5. **Scale Readiness**: How ready are we to scale production if demand increases?

Be specific about what needs attention NOW vs what can wait.

Format as a production status brief (200 words max).`,
        frequencyHours: 168, // Weekly
        priority: 'medium',
    },

    // ── Legal (Leo) ──────────────────────────────────────────────
    {
        id: 'compliance-scanner',
        name: 'Compliance Scanner',
        description: 'Monitors regulatory compliance and legal exposure',
        specialistId: 'legal-counsel',
        analysisPrompt: `Based on the company context, scan for legal and compliance concerns:

1. **Regulatory Exposure**: Are there regulations the company should be aware of?
2. **Contract Risks**: Any contract-related risks based on current activities?
3. **IP Considerations**: Should the company be protecting any intellectual property?
4. **Employment Law**: Any employment-related legal considerations?
5. **Upcoming Deadlines**: Any legal deadlines or renewals to be aware of?

Triage: what's urgent, what's important, what can wait.

Format as a compliance brief (200 words max).`,
        frequencyHours: 336, // Bi-weekly
        priority: 'medium',
    },

    // ── People (Harper) ──────────────────────────────────────────
    {
        id: 'team-health',
        name: 'Team Health Monitor',
        description: 'Monitors team dynamics, capacity, and hiring needs',
        specialistId: 'hiring-team',
        analysisPrompt: `Based on the company's team context, assess team health:

1. **Capacity**: Is the team at capacity? Over-stretched? Under-utilized?
2. **Hiring Gaps**: What roles need to be filled based on current objectives?
3. **Culture Signals**: Any signs of culture issues or team friction?
4. **Onboarding**: Are new team members being set up for success?
5. **Retention Risk**: Any signs of potential attrition?

Be practical. Focus on what the founder can act on this week.

Format as a team health brief (200 words max).`,
        frequencyHours: 168, // Weekly
        priority: 'medium',
    },

    // ── Chief of Staff (Cal) ─────────────────────────────────────
    {
        id: 'cross-functional-alignment',
        name: 'Cross-Functional Alignment Check',
        description: 'Identifies misalignment between teams and priorities',
        specialistId: 'chief-of-staff',
        analysisPrompt: `Based on the company context, check for cross-functional alignment:

1. **Priority Alignment**: Are all teams working toward the same top priorities?
2. **Communication Gaps**: Are there teams or functions that seem disconnected?
3. **Decision Bottlenecks**: Are any decisions stuck waiting for input?
4. **Resource Conflicts**: Are teams competing for the same resources?
5. **Coordination Opportunities**: Where could better coordination accelerate progress?

Focus on the ONE thing that would have the biggest impact if fixed.

Format as an alignment brief (200 words max).`,
        frequencyHours: 168, // Weekly
        priority: 'high',
    },
]

// ─── Intelligence Functions ─────────────────────────────────────────

/**
 * Gets intelligence sources for a specific specialist.
 *
 * @description Filters the global intelligence sources to return only
 * those owned by the given specialist.
 *
 * @param specialistId - The specialist ID to filter by
 * @returns Array of intelligence sources owned by this specialist
 */
export function getSpecialistIntelligenceSources(
    specialistId: SpecialistId,
): IntelligenceSource[] {
    return INTELLIGENCE_SOURCES.filter(s => s.specialistId === specialistId)
}

/**
 * Gets all intelligence sources that are due for a check.
 *
 * @description Compares each source's frequency against its last run time
 * to determine which sources need to be checked. Sources that have never
 * been run are always considered due.
 *
 * @param lastRunTimes - Map of source ID to last run ISO timestamp
 * @returns Array of sources that need to be checked
 */
export function getDueIntelligenceSources(
    lastRunTimes: Record<string, string>,
): IntelligenceSource[] {
    const now = Date.now()

    return INTELLIGENCE_SOURCES.filter(source => {
        const lastRun = lastRunTimes[source.id]
        if (!lastRun) return true // Never run before

        const lastRunTime = new Date(lastRun).getTime()
        const intervalMs = source.frequencyHours * 60 * 60 * 1000
        return now - lastRunTime >= intervalMs
    })
}

/**
 * Gets high-priority intelligence sources that should be checked more frequently.
 *
 * @description Returns only sources marked as high priority. These are
 * candidates for more frequent monitoring or immediate attention during sweeps.
 *
 * @returns Array of high-priority intelligence sources
 */
export function getHighPriorityIntelligenceSources(): IntelligenceSource[] {
    return INTELLIGENCE_SOURCES.filter(s => s.priority === 'high')
}

/**
 * Compiles intelligence context for injection into a specialist's prompt.
 *
 * @description Takes recent intelligence reports and formats them into a
 * prompt block that gives the specialist awareness of external factors
 * when chatting with the founder. Only includes reports relevant to the
 * specified specialist, capped at 3 most recent.
 *
 * @param reports - Recent intelligence reports to compile from
 * @param specialistId - The current specialist to filter reports for
 * @returns Formatted prompt block, or empty string if no relevant reports
 */
export function compileIntelligencePrompt(
    reports: IntelligenceReport[],
    specialistId: SpecialistId,
): string {
    // Filter to reports relevant to this specialist
    const relevant = reports.filter(r => r.specialistId === specialistId)
    if (relevant.length === 0) return ''

    const lines: string[] = [
        '## External Intelligence (from your recent monitoring)',
        'Reference these insights when relevant to the conversation:',
        '',
    ]

    for (const report of relevant.slice(0, 3)) {
        lines.push(`### ${report.title}`)
        lines.push(report.summary)
        if (report.recommendedActions.length > 0) {
            lines.push('Recommended actions:')
            for (const action of report.recommendedActions) {
                lines.push(`- ${action}`)
            }
        }
        lines.push('')
    }

    return lines.join('\n')
}
