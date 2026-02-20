/**
 * @file sweep-prompts.ts
 *
 * @description Background sweep prompts for each specialist. These define
 * what each specialist autonomously looks for when analyzing company data
 * in the background. Prompts produce structured JSON insights, not
 * conversational responses.
 *
 * Each prompt instructs the specialist to:
 * 1. Analyze specific aspects of the business context
 * 2. Identify actionable findings
 * 3. Classify urgency (critical / important / informational)
 * 4. Suggest specific next steps
 *
 * @related
 * - Specialist definitions: src/app/(platform)/agents/specialists-data.ts
 * - Sweep orchestrator: src/lib/agents/sweep-orchestrator.ts
 */

import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"

// ─── Sweep Prompt Registry ──────────────────────────────────────────

const SWEEP_PROMPTS: Partial<Record<SpecialistId, string>> = {
  /**
   * Cal (Chief of Staff) — Priority stack-ranking, overdue alerts, blind spots
   *
   * Highest daily value: runs most frequently to keep the founder focused.
   */
  'chief-of-staff': `
BACKGROUND SWEEP: Chief of Staff Analysis

Your job is to be the founder's strategic right hand. Scan the business context and identify:

1. **Priority Stack-Rank**: Are the right things getting attention? Flag if high-impact objectives are stalling while low-priority tasks consume effort.

2. **Overdue Task Alerts**: Identify tasks past their due date. Assess impact — is this a minor slip or a cascading blocker?

3. **Decision Gaps**: Are there open questions or stalled decisions that are blocking multiple workstreams?

4. **Blind Spots**: What is NOT being tracked that should be? Missing objectives for key areas? No tasks for announced priorities?

5. **Attention Allocation**: Based on the tasks and objectives, is the team's effort aligned with the stated strategy?

Focus on the 2-3 most important findings. Don't flag minor issues — only things that would make you pull the founder aside and say "you need to know this."

Urgency guide:
- critical: Overdue tasks blocking other work, or major strategic misalignment
- important: Stalling objectives, attention gaps, or upcoming deadlines at risk
- informational: Optimization opportunities, pattern observations
`,

  /**
   * Finn (Finance) — Cash flow, burn rate, budget variance, KPI anomalies
   *
   * Second highest daily value: financial health is existential.
   */
  'finance-lead': `
BACKGROUND SWEEP: Financial Analysis

Your job is to be the financial early warning system. Analyze the business context for:

1. **Runway & Burn Rate**: Based on available data (team size, stage, funding status), flag any indicators that suggest cash runway concerns.

2. **Growth vs. Spend Alignment**: Is the company's spending (team size, activity level) aligned with its stage and revenue?

3. **KPI Anomalies**: Look for mismatches — high activity but no progress on revenue objectives, or rapid team growth without proportional output.

4. **Budget Planning Gaps**: Are there objectives or plans that imply spending without corresponding budget awareness?

5. **Financial Milestones**: Flag upcoming fundraising windows, budget review dates, or quarter-end activities that need preparation.

Be conservative in your analysis. Use ranges, not false precision. Always flag assumptions.

Urgency guide:
- critical: Potential runway crisis, burn rate exceeding reasonable bounds for stage
- important: Budget misalignment, missing financial planning for announced initiatives
- informational: Optimization opportunities, benchmarking observations
`,

  /**
   * Sage (Strategy) — Competitive landscape, OKR health, strategic drift
   */
  'strategist': `
BACKGROUND SWEEP: Strategic Analysis

Your job is to ensure the company's strategy stays sharp. Analyze:

1. **OKR Health Check**: Are objectives well-defined? Do they have measurable key results? Are any objectives stalling without clear blockers?

2. **Strategic Coherence**: Do the active objectives and tasks form a coherent strategy, or are they scattered across too many initiatives?

3. **Focus Assessment**: For the company's stage, are they focused on the right number of priorities? (Early stage should have 1-3 strategic bets, not 10.)

4. **Missing Strategic Pillars**: Based on the company's purpose, sector, and stage — are there obvious strategic gaps? (e.g., a B2B company with no sales objectives)

5. **Momentum Signals**: Is progress accelerating, decelerating, or stalling? What does the completion pattern suggest?

Be opinionated. Give the 2-3 things that actually matter, not a comprehensive report.

Urgency guide:
- critical: Fundamental strategic misalignment or existential risk
- important: Strategic drift, focus dilution, missing key initiatives
- informational: Optimization opportunities, strategic observations
`,

  /**
   * Priya (Product) — Roadmap health, blocked tasks, prioritization
   */
  'product-lead': `
BACKGROUND SWEEP: Product Development Analysis

Your job is to ensure the product roadmap stays healthy. Analyze:

1. **Roadmap Health**: Are product-related objectives making progress? Are there feature initiatives that have stalled?

2. **Blocked Task Detection**: Identify tasks that appear stuck — no progress, no updates, or dependencies that aren't being resolved.

3. **Prioritization Audit**: Are the highest-priority product tasks actually getting worked on first? Flag inversions.

4. **Scope Creep Signals**: Are objectives growing in scope without corresponding timeline adjustments?

5. **Ship Velocity**: Based on task completion patterns, is the team shipping at a healthy pace for their stage?

Focus on what needs to ship next and what's blocking it.

Urgency guide:
- critical: Major product initiative blocked with no clear resolution path
- important: Prioritization inversions, stalled features, scope creep
- informational: Velocity observations, process improvement suggestions
`,

  /**
   * Mia (Marketing) — Content gaps, campaign timing, messaging consistency
   */
  'growth-marketer': `
BACKGROUND SWEEP: Marketing Analysis

Your job is to ensure marketing momentum. Analyze:

1. **Marketing Activity Level**: Is the company actively marketing? Flag if there are product/sales objectives but no corresponding marketing activities.

2. **Content & Messaging Gaps**: Based on the company's purpose and audience, are there obvious marketing gaps?

3. **Launch Readiness**: If product objectives are nearing completion, is marketing prepared for launches?

4. **Brand Consistency**: Does the company's stated purpose/mission suggest a clear brand voice that should be documented?

5. **Growth Opportunities**: Based on the company stage and business model, what marketing channel should they prioritize?

Think in funnels. Connect marketing activities to pipeline outcomes.

Urgency guide:
- critical: Product launching with no marketing preparation
- important: Missing marketing strategy for key initiatives, brand gaps
- informational: Channel suggestions, content ideas, timing optimizations
`,

  /**
   * Sal (Sales) — Pipeline health, outreach timing, deal risk
   */
  'sales-lead': `
BACKGROUND SWEEP: Sales Analysis

Your job is to keep the revenue engine running. Analyze:

1. **Pipeline Health**: Are there sales-related objectives? Is the company tracking revenue metrics?

2. **Outreach Gaps**: If the company has a B2B model, are there active sales/outreach activities?

3. **Revenue Alignment**: Is the sales approach aligned with the company's stage and business model?

4. **Customer Focus**: Are there customer success or retention activities alongside acquisition?

5. **Sales Process Maturity**: Based on the team size and stage, does the company need to formalize their sales process?

Everything connects to revenue. Be specific about numbers and timelines.

Urgency guide:
- critical: Revenue targets at risk, no active pipeline for revenue-dependent company
- important: Sales process gaps, missing outreach for B2B company
- informational: Process improvement suggestions, competitive observations
`,

  /**
   * Fiona (Fundraising) — Investor readiness, narrative freshness
   */
  'fundraising-advisor': `
BACKGROUND SWEEP: Fundraising Readiness Analysis

Your job is to ensure the company is always investor-ready. Analyze:

1. **Fundraising Status**: Is the company actively raising? If seeking funding, is there a clear fundraising strategy?

2. **Investor Narrative**: Based on the company's progress, purpose, and metrics — how compelling is their story right now?

3. **Financial Readiness**: Are the financial foundations in place for investor conversations (unit economics awareness, burn clarity)?

4. **Milestone Tracking**: What milestones should be hit before the next raise? Are they on track?

5. **Market Timing**: Based on the sector and stage, is this a good time to be raising?

Better to hear weaknesses from you than from the investor who passes.

Urgency guide:
- critical: Active raise with critical narrative gaps or financial red flags
- important: Upcoming fundraising window without preparation, stale pitch materials
- informational: Narrative suggestions, milestone observations
`,

  /**
   * Harper (HR) — Team health, hiring gaps, onboarding
   */
  'hiring-team': `
BACKGROUND SWEEP: People & Team Analysis

Your job is to ensure the team is healthy and growing wisely. Analyze:

1. **Team Composition**: Based on the company's objectives and stage, does the team have the right roles?

2. **Hiring Gaps**: Are there objectives that imply skills the current team doesn't have?

3. **Team Health Signals**: Is the workload distributed reasonably? Are there signs of overwork (too many tasks per person)?

4. **Onboarding Status**: If new members have been added recently, are there onboarding activities?

5. **Culture Foundations**: For the company's size, are there documented culture/values that scale beyond the founding team?

The first 10 hires define the company's DNA. Make them count.

Urgency guide:
- critical: Critical skill gap blocking key objectives, team health crisis signals
- important: Missing hires for announced initiatives, onboarding gaps
- informational: Team structure suggestions, culture observations
`,

  /**
   * Fang (VP Manufacturing) — Process bottlenecks, capacity, operations
   */
  'vp-manufacturing': `
BACKGROUND SWEEP: Operations & Manufacturing Analysis

Your job is to make the machine run. Analyze:

1. **Operational Bottlenecks**: Based on task patterns, where is work getting stuck? What's the single biggest throughput constraint?

2. **Process Maturity**: For the company's stage, are there missing operational foundations (SOPs, quality checks, delivery tracking)?

3. **Capacity Assessment**: Is the team's capacity aligned with the number of active objectives and tasks?

4. **Delivery Health**: Are tasks being completed on time? What's the overdue rate? Is it improving or worsening?

5. **Efficiency Opportunities**: Are there obvious process improvements that would unlock disproportionate output?

Trace problems back to the bottleneck. There's always one.

Urgency guide:
- critical: Major delivery bottleneck affecting multiple objectives
- important: Process gaps causing repeated failures, capacity misalignment
- informational: Efficiency improvements, process maturity suggestions
`,

  /**
   * Max (CTO) — Architecture decisions, tech debt, build-vs-buy, security posture
   */
  'cto': `
BACKGROUND SWEEP: Technology & Architecture Analysis

Your job is to ensure the technical foundations are sound. Analyze:

1. **Architecture Alignment**: Is the current technology approach the simplest solution that solves the problem? Flag over-engineering for scale that doesn't exist yet, or under-investment that's creating fragility.

2. **Build vs. Buy Signals**: Are there objectives or tasks where the team is building something that could be bought or borrowed? Flag wasted engineering effort on non-core problems.

3. **Tech Debt Awareness**: Based on task patterns and blockers, is accumulated technical debt slowing the team down? Is anyone tracking it, or is it invisible?

4. **Security Posture**: For the company's stage and sector, are there obvious security foundations missing (auth, data protection, access controls)?

5. **Stack Fitness**: Is the technology stack appropriate for the company's stage and team size? Flag over-complexity or missing foundations.

Delete before you optimize. The best part is no part.

Urgency guide:
- critical: Architecture blocking delivery, security vulnerability, core system fragility
- important: Tech debt slowing velocity, build-vs-buy misallocation, missing security basics
- informational: Stack optimization opportunities, architecture simplification ideas
`,

  /**
   * Jian (VP Engineering) — Delivery velocity, team capacity, process health
   */
  'vp-engineering': `
BACKGROUND SWEEP: Engineering Velocity Analysis

Your job is to keep the engineering machine shipping. Analyze:

1. **Delivery Velocity**: Are tasks being completed at a healthy rate for the team size? Is velocity improving, flat, or declining based on completion patterns?

2. **Blocked Work Detection**: Identify engineering tasks that appear stuck — no progress, long lead times, or unresolved dependencies. What's the single biggest throughput constraint?

3. **Team Capacity vs. Commitments**: Is the engineering workload realistic for the team size? Flag if active tasks per person suggest overload or underutilization.

4. **Process Maturity**: For the company's stage, are there missing engineering foundations (deployment pipeline, code review process, testing, monitoring)?

5. **Sprint Health**: Are engineering objectives breaking down into shippable increments, or are they large, monolithic chunks that increase delivery risk?

If it takes more than 2 weeks, it needs to be broken smaller.

Urgency guide:
- critical: Engineering throughput collapsed, critical path blocked, no deployment capability
- important: Velocity declining, team overloaded, missing CI/CD or testing foundations
- informational: Process improvement suggestions, velocity optimization opportunities
`,

  /**
   * Chase (VP Supply Chain) — Supplier risk, procurement gaps, logistics health
   */
  'vp-supply-chain': `
BACKGROUND SWEEP: Supply Chain & Procurement Analysis

Your job is to make sure the supply chain never breaks. Analyze:

1. **Supplier Concentration Risk**: Based on manufacturing or product objectives, is the company dependent on single sources for critical components? Flag anything without a backup.

2. **Procurement Readiness**: Are there production or product objectives that imply material needs without corresponding procurement activities? Flag gaps between what's planned and what's sourced.

3. **Lead Time Awareness**: For the company's stage and timeline, are lead times being tracked? Flag objectives with aggressive timelines that haven't accounted for supplier lead times.

4. **Logistics & Inventory**: If the company is shipping physical products, are there logistics foundations in place (fulfillment, warehousing, shipping)?

5. **Cost Optimization**: Based on volume and stage, are there obvious procurement savings from consolidating vendors, negotiating volume discounts, or switching suppliers?

Nobody notices supply chain until it breaks. My job is to make sure it never breaks.

Urgency guide:
- critical: Single-source dependency on critical component, procurement gap blocking production timeline
- important: Missing backup suppliers, lead times not tracked for upcoming milestones
- informational: Cost optimization opportunities, vendor consolidation suggestions
`,

  /**
   * Leo (Legal) — Compliance, contract reminders, regulatory flags
   */
  'legal-counsel': `
BACKGROUND SWEEP: Legal & Compliance Analysis

Your job is to catch legal issues before they become expensive. Analyze:

1. **Compliance Basics**: For the company's sector and stage, are there obvious legal foundations that should be in place?

2. **IP Awareness**: Is the company building products or content that should be protected? Are there IP strategy gaps?

3. **Employment Foundations**: Based on team size, does the company need employment agreements, contractor agreements, or other HR legal documents?

4. **Regulatory Landscape**: Based on the sector, are there regulatory requirements the company should be tracking?

5. **Risk Triage**: What's the single biggest legal risk this company is likely ignoring right now?

Not every legal question needs a lawyer today — but some absolutely do. Triage clearly.

Urgency guide:
- critical: Active legal risk that could result in liability, missing foundational agreements
- important: Compliance gaps, IP exposure, missing key legal documents
- informational: Best practice suggestions, regulatory awareness items
`,
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Gets the background sweep prompt for a specialist.
 *
 * @param specialistId - The specialist ID to get the prompt for
 * @returns The sweep prompt string, or a generic fallback
 */
export function getBackgroundSweepPrompt(specialistId: string): string {
  return SWEEP_PROMPTS[specialistId as SpecialistId] ?? `
BACKGROUND SWEEP: General Analysis

Analyze the business context and identify any noteworthy findings:
1. What's going well that should be acknowledged?
2. What risks or issues need attention?
3. What opportunities are being missed?
4. What actions would you recommend?

Focus on the 2-3 most impactful findings only.
`
}

/**
 * Gets all specialist IDs that have background sweep prompts.
 *
 * @returns Array of specialist IDs with sweep capabilities
 */
export function getSweepCapableSpecialists(): string[] {
  return Object.keys(SWEEP_PROMPTS)
}
