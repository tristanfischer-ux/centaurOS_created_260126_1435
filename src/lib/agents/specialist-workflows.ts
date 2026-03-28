/**
 * @file specialist-workflows.ts
 *
 * @description Defines executable workflows that specialists can perform.
 * When a user says "Draft it for me" or "Run the numbers", the specialist
 * doesn't just advise -- they produce a deliverable.
 *
 * Each workflow has:
 * - A trigger phrase (how the user invokes it)
 * - A specialist who owns it
 * - A prompt template that produces the deliverable
 * - An output format (document, table, list, etc.)
 *
 * @related
 * - Specialists: src/app/(platform)/agents/specialists-data.ts
 * - Execute route: src/app/api/agents/execute/route.ts
 * - Deliverables: src/actions/agent-artifacts.ts
 */

import type { SpecialistId } from "@/lib/agents/specialists-config"

// ─── Types ──────────────────────────────────────────────────────────

/** Output format for a workflow deliverable */
export type WorkflowOutputFormat =
    | "document"
    | "table"
    | "list"
    | "analysis"
    | "email"
    | "plan"

/** Defines an executable workflow owned by a specialist */
export interface SpecialistWorkflow {
    /** Unique workflow identifier */
    id: string
    /** Display name shown to the user */
    name: string
    /** Brief description of what this workflow produces */
    description: string
    /** The specialist who owns this workflow */
    specialistId: SpecialistId
    /** Trigger phrases that invoke this workflow */
    triggers: string[]
    /** The prompt template ({{context}} is replaced with conversation context) */
    promptTemplate: string
    /** Expected output format */
    outputFormat: WorkflowOutputFormat
    /** Whether to auto-save to deliverables */
    autoSave: boolean
    /** Icon name from lucide-react */
    icon: string
}

// ─── Workflow Definitions ───────────────────────────────────────────

export const SPECIALIST_WORKFLOWS: SpecialistWorkflow[] = [
    // ── Strategy (Sage) ──────────────────────────────────────────
    // NOTE: More specific workflows MUST come before generic ones.
    // detectWorkflowTrigger() returns the first match, so "full strategic analysis"
    // must precede "competitive analysis" to prevent shadowing.
    {
        id: "full-strategic-analysis",
        name: "Full Strategic Analysis",
        description: "Produces a comprehensive market and competitive strategic analysis (market sizing, landscape, SWOT, moat, risks, executive brief)",
        specialistId: "strategist",
        triggers: [
            "run strategic analysis",
            "full market analysis",
            "full strategic analysis",
            "analyze my market",
            "McKinsey analysis",
            "strategic deep dive",
            "competitive market analysis",
        ],
        promptTemplate: `You are Sage, the strategist. Use your direct, opinionated voice. Based on our conversation and the company context you have, produce a complete strategic market analysis in one document. Be specific and actionable. Label what is [ASSUMPTION] vs. [FACT] where it matters; flag where real data would strengthen the analysis.

Structure your response as follows:

## 1. Market Overview & Sizing
- TAM, SAM, SOM with logic and data sources (or [ASSUMPTION] where estimated).
- Market growth rate and key dynamics.
- Ground this in the company's actual product, geography, and segments from context.

## 2. Competitive Landscape
- Top 5 competitors: positioning, strengths, weaknesses, pricing, go-to-market.
- Comparison matrix (table).
- Suggested positioning map axes (e.g., price vs. features) and where the company fits.
- Only include competitor details from context or widely known public information; note where validated competitive intelligence would help.

## 3. SWOT + TOWS Matrix
- Strengths, Weaknesses, Opportunities, Threats — each ranked by impact; be honest about weaknesses.
- Strategic actions: SO (strengths → opportunities), WO (weaknesses → opportunities), ST (strengths → threats), WT (weaknesses → threats).
- Top 3 priority actions with owners and timelines.

## 4. Competitive Moat Assessment
- Score the company on Helmer's 7 Powers (Scale Economies, Network Effects, Counter-Positioning, Switching Costs, Brand, Cornered Resource, Process Power): None / Weak / Moderate / Strong, with evidence.
- Which 1–2 moats to build in the next 12–18 months and how.

## 5. Strategic Opportunities & Risks
- 3 go-to-market or strategic plays to pursue.
- Top 5 risks with likelihood, impact, and mitigation.
- White space or gaps in the market the company could capture.

## 6. Executive Brief & Recommended Actions
- McKinsey-style pyramid: lead with the answer, then support with evidence (2–3 paragraphs max).
- 3 priority actions with owners and timelines, ready for board or investor presentation.

**Data integrity:** Do not fabricate competitor metrics or market share. Mark assumptions clearly. Say when "real data would strengthen this" where applicable.

**PROPOSED_ACTIONS:** At the end of your response, you MUST include a PROPOSED_ACTIONS block so the founder can one-click create objectives or tasks from your top recommendations. Use the exact format:
<!-- PROPOSED_ACTIONS
[
  { "type": "objective", "title": "...", "description": "...", "strategicGoalTitle": "Existing or new strategic goal name", "estimatedWeeks": 8 },
  { "type": "task", "title": "...", "description": "...", "objectiveTitle": "Parent objective name", "estimatedWeeks": 2 }
]
-->
Include 2–4 actions (objectives and/or tasks) that correspond to your top strategic recommendations. Every objective must have "strategicGoalTitle" — use an existing strategic goal name, or propose a NEW strategic goal title if none of the existing ones fit. The system will auto-create new strategic goals. Every task must have "objectiveTitle" matching an existing objective. If no suitable parent exists, include an objective (with strategicGoalTitle) in the same block before any tasks that depend on it. Include "estimatedWeeks" (1–12) on every item so work is scheduled across the timeline, not bunched together. Don't force-fit objectives into poorly-matching goals — propose a new strategic goal when your recommendation opens a genuinely new strategic direction.

Context from our conversation and company:
{{context}}`,
        outputFormat: "document",
        autoSave: true,
        icon: "Telescope",
    },
    {
        id: "draft-strategic-plan",
        name: "Draft Strategic Plan",
        description: "Produces a full strategic plan document based on your conversation",
        specialistId: "strategist",
        triggers: [
            "draft the plan",
            "write the strategy",
            "draft strategic plan",
            "create a strategy document",
        ],
        promptTemplate: `Based on our conversation, produce a complete strategic plan document. Structure it as:

## Executive Summary
One paragraph capturing the core strategy.

## Strategic Priorities (Top 3)
For each priority:
- What: Clear description
- Why: Strategic rationale
- How: Key initiatives
- Success metric: How we'll know it's working
- Timeline: When we expect results

## Key Assumptions
What must be true for this strategy to work.

## Risks & Mitigations
Top 3 risks and how to address them.

## Next Steps (This Week)
3-5 concrete actions that start immediately.

Context from our conversation:
{{context}}

Write this as a polished, ready-to-share document. Be specific and actionable.`,
        outputFormat: "document",
        autoSave: true,
        icon: "FileText",
    },
    {
        id: "competitive-analysis",
        name: "Competitive Analysis",
        description: "Produces a structured competitive landscape analysis",
        specialistId: "strategist",
        triggers: [
            "analyze competitors",
            "competitive analysis",
            "competitive landscape",
            "map the competition",
            "deep dive on competitors",
            "who are our competitors",
        ],
        promptTemplate: `Based on our conversation, produce a competitive analysis document.

## Market Overview
Brief description of the market and key dynamics.

## Competitor Matrix
| Competitor | Positioning | Strengths | Weaknesses | Threat Level |
|---|---|---|---|---|
(Fill in based on what we discussed)

## Our Differentiation
What makes us different and why it matters.

## Competitive Risks
Where we're vulnerable and what to do about it.

## Strategic Recommendations
3 specific moves to strengthen our competitive position.

Context from our conversation:
{{context}}`,
        outputFormat: "document",
        autoSave: true,
        icon: "Target",
    },
    // ── Finance (Finn) ───────────────────────────────────────────
    {
        id: "financial-model",
        name: "Run the Numbers",
        description: "Produces a financial scenario analysis with tables",
        specialistId: "finance-lead",
        triggers: [
            "run the numbers",
            "financial model",
            "model the scenarios",
            "build a forecast",
        ],
        promptTemplate: `Based on our conversation, produce a financial analysis.

## Current Financial Position
Key metrics: revenue, burn rate, runway, growth rate.

## Scenario Analysis
| Scenario | Revenue (6mo) | Burn Rate | Runway | Key Assumption |
|---|---|---|---|---|
| Conservative | | | | |
| Base Case | | | | |
| Optimistic | | | | |

## Unit Economics
| Metric | Current | Target | Gap |
|---|---|---|---|
| CAC | | | |
| LTV | | | |
| LTV:CAC | | | |
| Payback Period | | | |

## Sensitivity Analysis
What happens if key assumptions change by +/- 20%.

## Recommendations
3 specific financial actions to take this month.

Context from our conversation:
{{context}}

Use ranges where data is uncertain. Label all assumptions explicitly.`,
        outputFormat: "analysis",
        autoSave: true,
        icon: "Calculator",
    },
    {
        id: "budget-template",
        name: "Create Budget",
        description: "Produces a structured budget template",
        specialistId: "finance-lead",
        triggers: ["create a budget", "budget template", "build the budget"],
        promptTemplate: `Based on our conversation, produce a budget template.

## Monthly Budget Overview
| Category | Monthly Budget | Notes |
|---|---|---|
| People (salaries, contractors) | | |
| Technology (hosting, tools, licenses) | | |
| Marketing (ads, content, events) | | |
| Operations (office, insurance, legal) | | |
| R&D (prototyping, testing) | | |
| **Total** | | |

## Budget Allocation by Priority
Show how spending aligns with strategic priorities.

## Cost Optimization Opportunities
Where we can save without sacrificing growth.

## Cash Flow Projection (Next 6 Months)
Monthly in/out with running balance.

Context from our conversation:
{{context}}`,
        outputFormat: "table",
        autoSave: true,
        icon: "PiggyBank",
    },

    // ── Product (Priya) ──────────────────────────────────────────
    {
        id: "write-prd",
        name: "Write PRD",
        description: "Produces a product requirements document",
        specialistId: "product-lead",
        triggers: [
            "write the prd",
            "create a prd",
            "product requirements",
            "write requirements",
        ],
        promptTemplate: `Based on our conversation, produce a Product Requirements Document.

## Problem Statement
What problem are we solving and for whom?

## User Stories
For each key user story:
- As a [user type], I want to [action] so that [benefit]
- Acceptance criteria (specific, testable)

## Requirements
### Must-Have (P0)
- [ ] Requirement with clear acceptance criteria

### Should-Have (P1)
- [ ] Requirement with clear acceptance criteria

### Nice-to-Have (P2)
- [ ] Requirement with clear acceptance criteria

## Scope - What's NOT Included
Explicit list of what we're cutting and why.

## Success Metrics
How we'll know this worked.

## Technical Considerations
Any constraints or dependencies engineering should know about.

## Timeline
Estimated phases and milestones.

Context from our conversation:
{{context}}`,
        outputFormat: "document",
        autoSave: true,
        icon: "ClipboardList",
    },

    // ── Sales (Sal) ──────────────────────────────────────────────
    {
        id: "outreach-sequence",
        name: "Write Outreach Sequence",
        description: "Produces copy-paste-ready cold outreach emails",
        specialistId: "sales-lead",
        triggers: [
            "write the outreach",
            "create outreach sequence",
            "draft the emails",
            "cold email sequence",
        ],
        promptTemplate: `Based on our conversation, produce a 3-email cold outreach sequence.

## Email 1: Initial Outreach
**Subject line:** [Compelling, personalized]
**Body:** [Short, value-focused, ends with soft CTA]

## Email 2: Follow-up (Day 3)
**Subject line:** [Reference to Email 1]
**Body:** [Add new value angle, social proof, stronger CTA]

## Email 3: Break-up (Day 7)
**Subject line:** [Creates urgency without being pushy]
**Body:** [Final value prop, clear CTA, graceful close]

## Personalization Guide
How to customize each email for different prospect types.

## Expected Metrics
| Metric | Target |
|---|---|
| Open Rate | |
| Reply Rate | |
| Meeting Book Rate | |

## Objection Handlers
Top 3 likely objections and how to respond.

Context from our conversation:
{{context}}

Make these copy-paste ready. Real language, not corporate speak.`,
        outputFormat: "document",
        autoSave: true,
        icon: "Mail",
    },

    // ── Marketing (Mia) ─────────────────────────────────────────
    {
        id: "content-calendar",
        name: "Create Content Calendar",
        description: "Produces a structured content calendar with topics and channels",
        specialistId: "growth-marketer",
        triggers: [
            "create content calendar",
            "content plan",
            "content strategy",
            "plan the content",
        ],
        promptTemplate: `Based on our conversation, produce a 4-week content calendar.

## Content Strategy Summary
What we're trying to achieve and who we're targeting.

## Week-by-Week Calendar
| Week | Day | Channel | Content Type | Topic | CTA | Owner |
|---|---|---|---|---|---|---|
| 1 | Mon | | | | | |
| 1 | Wed | | | | | |
| 1 | Fri | | | | | |
(Continue for 4 weeks)

## Content Themes
3 recurring themes that tie everything together.

## Distribution Strategy
How each piece gets amplified beyond the initial post.

## Measurement Plan
| Metric | Baseline | Target | How to Measure |
|---|---|---|---|

Context from our conversation:
{{context}}`,
        outputFormat: "table",
        autoSave: true,
        icon: "Calendar",
    },

    // ── HR (Harper) ──────────────────────────────────────────────
    {
        id: "job-description",
        name: "Write Job Description",
        description: "Produces a compelling job description with scorecard",
        specialistId: "hiring-team",
        triggers: [
            "write the job description",
            "create job posting",
            "draft the jd",
            "job description",
        ],
        promptTemplate: `Based on our conversation, produce a job description and interview scorecard.

## Job Description

### [Role Title]
**Location:** [Remote/Hybrid/Office]
**Type:** [Full-time/Part-time/Contract]

### About the Role
[2-3 paragraphs: what the role does, why it matters, what success looks like]

### What You'll Do
- [Specific responsibility with impact]
(5-7 items)

### What You Bring
**Must-Have:**
- [Specific, measurable requirement]

**Nice-to-Have:**
- [Differentiating skill]

### What We Offer
- [Compelling benefit]

---

## Interview Scorecard

| Dimension | Weight | 1 (Below) | 3 (Meets) | 5 (Exceeds) |
|---|---|---|---|---|
| [Technical Skill] | | | | |
| [Culture Fit] | | | | |
| [Communication] | | | | |
| [Problem Solving] | | | | |

## 90-Day Success Criteria
What does success look like in the first 90 days?

Context from our conversation:
{{context}}`,
        outputFormat: "document",
        autoSave: true,
        icon: "UserPlus",
    },

    // ── Legal (Leo) ──────────────────────────────────────────────
    {
        id: "contract-review",
        name: "Review Contract",
        description: "Produces a structured contract review with risk flags",
        specialistId: "legal-counsel",
        triggers: [
            "review the contract",
            "contract review",
            "check this agreement",
            "review this document",
        ],
        promptTemplate: `Based on our conversation, produce a contract review.

## Contract Summary
What this agreement covers in plain language.

## Key Terms
| Term | What It Says | What It Means | Risk Level |
|---|---|---|---|
(Extract key clauses)

## Risk Flags
### 🔴 High Risk (Address Before Signing)
- [Issue and recommendation]

### 🟡 Medium Risk (Negotiate If Possible)
- [Issue and recommendation]

### 🟢 Acceptable
- [Clause and why it's fine]

## Missing Protections
What SHOULD be in this contract but isn't.

## Negotiation Recommendations
Top 3 changes to request, in order of importance.

## Disclaimer
This is general guidance, not legal advice. Consult a qualified attorney before signing.

Context from our conversation:
{{context}}`,
        outputFormat: "document",
        autoSave: true,
        icon: "Scale",
    },

    // ── Chief of Staff (Cal) ─────────────────────────────────────
    {
        id: "meeting-prep",
        name: "Prepare Meeting Brief",
        description: "Produces a meeting preparation document",
        specialistId: "chief-of-staff",
        triggers: [
            "prep the meeting",
            "meeting prep",
            "prepare for the meeting",
            "meeting brief",
        ],
        promptTemplate: `Based on our conversation, produce a meeting preparation brief.

## Meeting Brief

### Context
What this meeting is about and why it matters.

### Your Objectives
What you want to achieve in this meeting (max 3).

### Key Points to Make
Structured talking points with supporting data.

### Anticipated Questions
| Likely Question | Recommended Response |
|---|---|
(Top 5 questions)

### Decision Points
What decisions need to be made in this meeting.

### Red Lines
What you should NOT agree to and why.

### Follow-Up Actions
What should happen after this meeting.

Context from our conversation:
{{context}}`,
        outputFormat: "document",
        autoSave: true,
        icon: "ClipboardCheck",
    },

    // ── Manufacturing (Fang) ─────────────────────────────────────
    {
        id: "supplier-comparison",
        name: "Compare Suppliers",
        description: "Produces a structured supplier comparison matrix",
        specialistId: "vp-manufacturing",
        triggers: [
            "compare suppliers",
            "supplier comparison",
            "find factories",
            "compare manufacturers",
        ],
        promptTemplate: `Based on our conversation, produce a supplier comparison.

## Requirements Summary
What we need manufactured, volumes, and timeline.

## Supplier Comparison Matrix
| Criteria | Supplier A | Supplier B | Supplier C |
|---|---|---|---|
| Location | | | |
| Capability Match | | | |
| Lead Time | | | |
| MOQ | | | |
| Unit Cost (est.) | | | |
| Quality Certs | | | |
| Communication | | | |
| Risk Level | | | |

## Recommendation
Which supplier to proceed with and why.

## Risk Mitigation
Backup plan if primary supplier fails.

## Next Steps
1. [Action with timeline]

Context from our conversation:
{{context}}`,
        outputFormat: "table",
        autoSave: true,
        icon: "Factory",
    },

    // ── CTO (Max) ────────────────────────────────────────────────
    {
        id: "tech-stack-assessment",
        name: "Tech Stack Assessment",
        description: "Produces a structured technology stack evaluation with build-vs-buy analysis",
        specialistId: "cto",
        triggers: [
            "assess the stack",
            "tech stack review",
            "technology assessment",
            "evaluate our stack",
            "build or buy",
        ],
        promptTemplate: `Based on our conversation, produce a technology stack assessment.

## Current Stack Overview
Inventory of current technologies, frameworks, and infrastructure.

## Architecture Assessment
| Layer | Current Choice | Fit (1-5) | Risk | Notes |
|---|---|---|---|---|
| Frontend | | | | |
| Backend | | | | |
| Database | | | | |
| Infrastructure | | | | |
| CI/CD | | | | |
| Monitoring | | | | |

## Build vs. Buy Analysis
For each major capability:
| Capability | Build Cost | Buy Cost | Recommendation | Reasoning |
|---|---|---|---|---|

## Technical Debt Inventory
| Item | Severity | Effort to Fix | Business Impact if Ignored |
|---|---|---|---|

## Scalability Assessment
Where the current architecture breaks at 10x, 100x scale.

## Recommended Architecture Changes
Top 3 changes with effort estimates and migration paths.

## 90-Day Technical Roadmap
Week-by-week priorities for the engineering team.

Context from our conversation:
{{context}}

Be specific about trade-offs. Every recommendation should include effort estimate and risk.`,
        outputFormat: "document",
        autoSave: true,
        icon: "Server",
    },
    {
        id: "system-design",
        name: "System Design Document",
        description: "Produces a system design document for a new feature or service",
        specialistId: "cto",
        triggers: [
            "design the system",
            "system design",
            "architecture design",
            "design doc",
            "technical design",
        ],
        promptTemplate: `Based on our conversation, produce a system design document.

## Problem Statement
What we're building and why.

## Requirements
### Functional Requirements
- [ ] Requirement with clear acceptance criteria

### Non-Functional Requirements
- Performance: [target metrics]
- Scalability: [target scale]
- Reliability: [target uptime]
- Security: [key constraints]

## Proposed Architecture
High-level system components and how they interact.

## Data Model
Key entities, relationships, and storage choices.

## API Design
Key endpoints or interfaces with request/response shapes.

## Trade-offs Considered
| Option | Pros | Cons | Why Chosen/Rejected |
|---|---|---|---|

## Implementation Plan
| Phase | Scope | Effort | Dependencies |
|---|---|---|---|

## Risks & Mitigations
Top 3 technical risks and how to address them.

## Open Questions
What needs to be resolved before building.

Context from our conversation:
{{context}}

Write this as a document an engineering team can execute against.`,
        outputFormat: "document",
        autoSave: true,
        icon: "GitBranch",
    },

    // ── VP Engineering (Jian) ──────────────────────────────────────
    {
        id: "sprint-plan",
        name: "Sprint Plan",
        description: "Produces a structured sprint plan with priorities, assignments, and velocity targets",
        specialistId: "vp-engineering",
        triggers: [
            "plan the sprint",
            "sprint plan",
            "sprint planning",
            "plan this week",
            "weekly plan",
        ],
        promptTemplate: `Based on our conversation, produce a sprint plan.

## Sprint Goal
One sentence: what does shipping this sprint unlock?

## Sprint Backlog
| Priority | Task | Estimate | Assignee | Dependencies | Done Definition |
|---|---|---|---|---|---|
| P0 | | | | | |
| P0 | | | | | |
| P1 | | | | | |
| P1 | | | | | |
| P2 | | | | | |

## Capacity Planning
| Team Member | Available Hours | Allocated | Buffer |
|---|---|---|---|

## Risks & Blockers
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|

## Definition of Done (Sprint)
Checklist that must pass before sprint is considered complete.

## Velocity Target
Story points or tasks targeted vs. last sprint's actual.

## Ceremonies Schedule
- Standup: [time]
- Mid-sprint check: [date]
- Sprint review: [date]
- Retro: [date]

Context from our conversation:
{{context}}

Be realistic about capacity. It's better to under-promise and over-deliver.`,
        outputFormat: "document",
        autoSave: true,
        icon: "Kanban",
    },
    {
        id: "hiring-roadmap",
        name: "Engineering Hiring Roadmap",
        description: "Produces a structured engineering hiring plan with roles, timelines, and comp ranges",
        specialistId: "vp-engineering",
        triggers: [
            "hiring roadmap",
            "engineering hiring plan",
            "who should we hire",
            "build the team",
            "hiring plan",
        ],
        promptTemplate: `Based on our conversation, produce an engineering hiring roadmap.

## Current Team Assessment
| Role | Current | Needed | Gap | Urgency |
|---|---|---|---|---|

## Hiring Priority Order
For each role (in priority order):
### Role: [Title]
- **Why now:** Business impact if unfilled
- **Seniority:** Junior / Mid / Senior / Staff
- **Key skills:** Must-have and nice-to-have
- **Comp range:** Based on market + stage
- **Timeline:** When to start sourcing, target start date
- **Interview focus:** What to test for

## Team Structure (Target)
How the team should look in 6 months.

## Sourcing Strategy
| Channel | Expected Volume | Quality | Cost |
|---|---|---|---|
| Referrals | | | |
| LinkedIn | | | |
| Job boards | | | |
| Recruiters | | | |

## Budget Impact
Monthly burn increase per hire. Total cost to reach target team.

## Onboarding Plan
First 30/60/90 days for each role.

Context from our conversation:
{{context}}

Be specific about comp ranges and timelines. Founders need real numbers.`,
        outputFormat: "document",
        autoSave: true,
        icon: "Users",
    },

    // ── VP Supply Chain (Chase) ────────────────────────────────────
    {
        id: "supply-chain-map",
        name: "Map Supply Chain",
        description: "Produces a structured supply chain map with risk assessment and optimization opportunities",
        specialistId: "vp-supply-chain",
        triggers: [
            "map the supply chain",
            "supply chain analysis",
            "supply chain map",
            "logistics plan",
            "procurement strategy",
        ],
        promptTemplate: `Based on our conversation, produce a supply chain analysis.

## Supply Chain Overview
End-to-end flow from raw materials to customer delivery.

## Supplier Tier Map
| Tier | Component | Supplier | Location | Lead Time | Alt Source? |
|---|---|---|---|---|---|
| Tier 1 | | | | | |
| Tier 2 | | | | | |
| Tier 3 | | | | | |

## Cost Breakdown
| Category | Current Cost | % of COGS | Optimization Target |
|---|---|---|---|
| Raw materials | | | |
| Manufacturing | | | |
| Logistics | | | |
| Warehousing | | | |
| Customs/duties | | | |

## Risk Assessment
| Risk | Probability | Impact | Mitigation | Cost of Mitigation |
|---|---|---|---|---|
| Single-source dependency | | | | |
| Geopolitical exposure | | | | |
| Lead time variability | | | | |
| Quality inconsistency | | | | |

## Inventory Strategy
| SKU Category | Current Approach | Recommended | Days of Supply Target |
|---|---|---|---|

## Optimization Opportunities
Top 3 cost reduction or resilience improvements with ROI estimates.

## 90-Day Action Plan
Concrete steps to improve the supply chain this quarter.

Context from our conversation:
{{context}}

Ground everything in real lead times and costs where available. Flag assumptions.`,
        outputFormat: "document",
        autoSave: true,
        icon: "Truck",
    },
    {
        id: "sourcing-brief",
        name: "Sourcing Brief",
        description: "Produces a structured sourcing requirements document for finding new suppliers",
        specialistId: "vp-supply-chain",
        triggers: [
            "find suppliers",
            "sourcing brief",
            "supplier search",
            "source this",
            "find a manufacturer",
        ],
        promptTemplate: `Based on our conversation, produce a sourcing requirements brief.

## Component/Product Description
What we need manufactured or sourced, with specifications.

## Requirements
### Technical Specifications
| Parameter | Requirement | Tolerance |
|---|---|---|

### Volume Requirements
| Timeline | Volume | Ramp Schedule |
|---|---|---|

### Quality Requirements
- Certifications needed (ISO, CE, UL, etc.)
- Inspection/testing requirements
- Defect rate tolerance

## Supplier Criteria
| Criterion | Must-Have | Nice-to-Have | Weight |
|---|---|---|---|
| Location | | | |
| MOQ | | | |
| Lead time | | | |
| Payment terms | | | |
| Certifications | | | |
| Tooling capability | | | |

## Budget Parameters
Target unit cost at volume, tooling budget, NRE budget.

## Evaluation Scorecard
How to rate and compare supplier responses.

## RFQ Template
Key questions to include in the request for quotation.

Context from our conversation:
{{context}}

Make this ready to send to potential suppliers with minimal editing.`,
        outputFormat: "document",
        autoSave: true,
        icon: "Search",
    },

    // ── Fundraising (Fiona) ──────────────────────────────────────
    {
        id: "pitch-narrative",
        name: "Draft Pitch Narrative",
        description: "Produces a compelling investor pitch narrative",
        specialistId: "fundraising-advisor",
        triggers: [
            "draft the pitch",
            "write the pitch",
            "pitch narrative",
            "investor story",
        ],
        promptTemplate: `Based on our conversation, produce a pitch narrative.

## The Hook (First 90 Seconds)
The opening that makes investors lean in.

## The Problem
What's broken and why it matters now.

## The Solution
What we've built and why it's different.

## The Market
How big is the opportunity (TAM/SAM/SOM).

## Traction
What we've achieved so far (metrics, milestones).

## Business Model
How we make money and unit economics.

## The Team
Why this team wins.

## The Ask
What we're raising and what we'll do with it.

## Why Now
Why this company needs to exist today.

## Tough Questions & Answers
| Question | Answer |
|---|---|
(Top 5 investor questions)

Context from our conversation:
{{context}}

Write this as a compelling narrative, not a list. Make investors feel the opportunity.`,
        outputFormat: "document",
        autoSave: true,
        icon: "Presentation",
    },
]

// ─── Workflow Detection ─────────────────────────────────────────────

/**
 * Detects if a user message triggers a specialist workflow.
 *
 * @description Scans the user's message for trigger phrases that match
 * workflows owned by the current specialist. Returns the first matching
 * workflow, or null if no match is found.
 *
 * @param message - The user's message to scan for triggers
 * @param specialistId - The current specialist ID to scope workflow matching
 * @returns The matching workflow, or null if no match
 */
export function detectWorkflowTrigger(
    message: string,
    specialistId: SpecialistId,
): SpecialistWorkflow | null {
    const normalized = message.toLowerCase().trim()

    // Only match workflows for the current specialist
    const specialistWorkflows = SPECIALIST_WORKFLOWS.filter(
        (w) => w.specialistId === specialistId,
    )

    for (const workflow of specialistWorkflows) {
        for (const trigger of workflow.triggers) {
            if (normalized.includes(trigger.toLowerCase())) {
                return workflow
            }
        }
    }

    return null
}

/**
 * Gets all available workflows for a specialist.
 *
 * @description Returns the complete list of workflows that a given
 * specialist can execute. Used to populate the workflow menu in the UI
 * and to inform the specialist's system prompt about its capabilities.
 *
 * @param specialistId - The specialist ID to look up
 * @returns Array of workflows available for this specialist
 */
export function getSpecialistWorkflows(
    specialistId: SpecialistId,
): SpecialistWorkflow[] {
    return SPECIALIST_WORKFLOWS.filter((w) => w.specialistId === specialistId)
}

/**
 * Builds the workflow execution prompt by injecting conversation context.
 *
 * @description Takes a workflow's prompt template and replaces the
 * {{context}} placeholder with the actual conversation context. This
 * produces the final prompt that gets sent to the AI provider.
 *
 * @param workflow - The workflow to execute
 * @param conversationContext - Recent conversation context to inject
 * @returns The complete prompt ready for execution
 */
export function buildWorkflowPrompt(
    workflow: SpecialistWorkflow,
    conversationContext: string,
): string {
    return workflow.promptTemplate.replace("{{context}}", conversationContext)
}
