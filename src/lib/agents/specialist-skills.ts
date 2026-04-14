/**
 * @file specialist-skills.ts
 *
 * @description Defines user-facing skills for each specialist. Skills are a discovery
 * layer on top of the existing workflow system — each skill references a workflow
 * by ID and adds presentation metadata (icon, output type, estimated time).
 */

import type { SpecialistId } from "@/lib/agents/specialists-config"

export type SkillOutputType =
    | "document"       // Markdown → PDF/DOCX
    | "presentation"   // PPTX
    | "spreadsheet"    // Table-heavy, CSV export
    | "email"          // Email draft
    | "checklist"      // Actionable checklist

export interface SpecialistSkill {
    id: string
    name: string
    description: string
    specialistId: SpecialistId
    icon: string          // Lucide icon name
    outputType: SkillOutputType
    workflowId: string    // References SPECIALIST_WORKFLOWS
    estimatedTime: string // "~30 seconds", "~2 minutes"
    triggerPhrase?: string // Optional custom trigger; defaults to "Create a {name} ..."
}

export const SPECIALIST_SKILLS: SpecialistSkill[] = [
    // Sage (Strategy)
    { id: "strategic-plan", name: "Strategic Plan", description: "Full strategic analysis with market sizing, SWOT, and executive brief", specialistId: "strategist", icon: "Target", outputType: "document", workflowId: "full-strategic-analysis", estimatedTime: "~2 min" },
    { id: "board-pack", name: "Board Pack", description: "Investor-ready board update with KPIs, progress, and next steps", specialistId: "strategist", icon: "FileText", outputType: "presentation", workflowId: "draft-strategic-plan", estimatedTime: "~2 min" },
    { id: "okr-framework", name: "OKR Framework", description: "Objectives and key results aligned to your strategic pillars", specialistId: "strategist", icon: "ListChecks", outputType: "document", workflowId: "okr-framework", estimatedTime: "~1 min" },

    // Max (CTO)
    { id: "tech-architecture", name: "Tech Architecture", description: "System architecture with component diagram and technology choices", specialistId: "cto", icon: "Cpu", outputType: "document", workflowId: "tech-stack-assessment", estimatedTime: "~2 min" },
    { id: "build-vs-buy", name: "Build vs Buy", description: "Decision framework for make, buy, or partner on key components", specialistId: "cto", icon: "GitBranch", outputType: "document", workflowId: "build-vs-buy", estimatedTime: "~1 min" },
    { id: "tech-roadmap", name: "Tech Roadmap", description: "Phased technology plan with dependencies and milestones", specialistId: "cto", icon: "Map", outputType: "document", workflowId: "system-design", estimatedTime: "~2 min" },

    // Jian (VP Engineering)
    { id: "sprint-plan", name: "Sprint Plan", description: "2-week sprint with prioritised tasks, owners, and acceptance criteria", specialistId: "vp-engineering", icon: "LayoutGrid", outputType: "document", workflowId: "sprint-plan", estimatedTime: "~1 min" },
    { id: "tech-debt-audit", name: "Tech Debt Audit", description: "Identify and prioritise technical debt with effort estimates", specialistId: "vp-engineering", icon: "AlertTriangle", outputType: "checklist", workflowId: "tech-debt-audit", estimatedTime: "~1 min" },
    { id: "system-design-doc", name: "System Design", description: "Detailed system design with data flows and API contracts", specialistId: "vp-engineering", icon: "Workflow", outputType: "document", workflowId: "system-design", estimatedTime: "~2 min" },

    // Fang (VP Manufacturing)
    { id: "dfm-report", name: "DFM Report", description: "Design for manufacturing analysis with recommendations", specialistId: "vp-manufacturing", icon: "Factory", outputType: "document", workflowId: "supplier-comparison", estimatedTime: "~2 min" },
    { id: "production-timeline", name: "Production Timeline", description: "Phase-by-phase production plan from prototype to volume", specialistId: "vp-manufacturing", icon: "GanttChart", outputType: "document", workflowId: "production-timeline", estimatedTime: "~1 min" },
    { id: "supplier-comparison", name: "Supplier Comparison", description: "Side-by-side comparison of matched manufacturers", specialistId: "vp-manufacturing", icon: "Scale", outputType: "spreadsheet", workflowId: "supplier-comparison", estimatedTime: "~1 min" },

    // Chase (VP Supply Chain)
    { id: "supplier-shortlist", name: "Supplier Shortlist", description: "Top 10 suppliers matched by capability, quality, and location", specialistId: "vp-supply-chain", icon: "ClipboardList", outputType: "spreadsheet", workflowId: "supply-chain-map", estimatedTime: "~1 min" },
    { id: "rfq-pack", name: "RFQ Pack", description: "Complete request-for-quote package with specs and requirements", specialistId: "vp-supply-chain", icon: "Send", outputType: "document", workflowId: "sourcing-brief", estimatedTime: "~2 min" },
    { id: "supply-chain-risk", name: "Supply Chain Risk", description: "Risk assessment with single-source dependencies and mitigations", specialistId: "vp-supply-chain", icon: "ShieldAlert", outputType: "document", workflowId: "supply-chain-risk", estimatedTime: "~1 min" },

    // Priya (Product)
    { id: "product-requirements", name: "Product Requirements", description: "Product requirements document with user stories and acceptance criteria", specialistId: "product-lead", icon: "FileText", outputType: "document", workflowId: "write-prd", estimatedTime: "~2 min" },
    { id: "feature-prioritisation", name: "Feature Prioritisation", description: "RICE-scored feature backlog with recommendations", specialistId: "product-lead", icon: "ListOrdered", outputType: "spreadsheet", workflowId: "feature-prioritisation", estimatedTime: "~1 min" },
    { id: "user-research-plan", name: "Research Plan", description: "User research plan with interview scripts and hypotheses", specialistId: "product-lead", icon: "Users", outputType: "document", workflowId: "user-research-plan", estimatedTime: "~1 min" },

    // Mia (Marketing)
    { id: "go-to-market", name: "Go-To-Market Plan", description: "Launch strategy with channels, messaging, and timeline", specialistId: "growth-marketer", icon: "Rocket", outputType: "document", workflowId: "content-calendar", estimatedTime: "~2 min" },
    { id: "content-calendar", name: "Content Calendar", description: "12-week content plan with topics, formats, and channels", specialistId: "growth-marketer", icon: "Calendar", outputType: "spreadsheet", workflowId: "content-calendar-plan", estimatedTime: "~1 min" },
    { id: "competitive-analysis-mkt", name: "Competitive Analysis", description: "Competitor positioning, messaging gaps, and differentiation strategy", specialistId: "growth-marketer", icon: "Search", outputType: "document", workflowId: "competitive-analysis", estimatedTime: "~2 min" },

    // Sal (Sales)
    { id: "outreach-sequence", name: "Outreach Sequence", description: "Multi-touch email sequence with personalisation templates", specialistId: "sales-lead", icon: "Mail", outputType: "email", workflowId: "outreach-sequence", estimatedTime: "~1 min" },
    { id: "pipeline-report", name: "Pipeline Report", description: "Sales pipeline health check with conversion analysis", specialistId: "sales-lead", icon: "BarChart3", outputType: "document", workflowId: "pipeline-report", estimatedTime: "~1 min" },
    { id: "pricing-strategy", name: "Pricing Strategy", description: "Pricing model analysis with competitor benchmarks and margin targets", specialistId: "sales-lead", icon: "DollarSign", outputType: "document", workflowId: "pricing-strategy", estimatedTime: "~2 min" },

    // Cal (Chief of Staff)
    { id: "weekly-update", name: "Weekly Update", description: "Executive summary of progress, blockers, and priorities", specialistId: "chief-of-staff", icon: "FileText", outputType: "document", workflowId: "meeting-prep", estimatedTime: "~1 min" },
    { id: "meeting-brief", name: "Meeting Brief", description: "Pre-read brief with context, agenda, and decision points", specialistId: "chief-of-staff", icon: "BookOpen", outputType: "document", workflowId: "meeting-brief", estimatedTime: "~1 min" },
    { id: "decision-log", name: "Decision Log", description: "Structured record of key decisions with context and owners", specialistId: "chief-of-staff", icon: "ScrollText", outputType: "document", workflowId: "decision-log", estimatedTime: "~1 min" },

    // Finn (Finance)
    { id: "financial-model", name: "Financial Model", description: "Revenue projections, unit economics, and scenario analysis", specialistId: "finance-lead", icon: "Calculator", outputType: "spreadsheet", workflowId: "financial-model", estimatedTime: "~2 min" },
    { id: "cash-burn-report", name: "Cash Burn Report", description: "Runway analysis with monthly burn rate and raise timing", specialistId: "finance-lead", icon: "TrendingDown", outputType: "document", workflowId: "cash-burn-report", estimatedTime: "~1 min" },
    { id: "unit-economics", name: "Unit Economics", description: "Per-unit cost breakdown with margins at different volumes", specialistId: "finance-lead", icon: "Coins", outputType: "spreadsheet", workflowId: "unit-economics", estimatedTime: "~1 min" },

    // Fiona (Fundraising)
    { id: "pitch-deck", name: "Pitch Deck", description: "Investor pitch narrative with key slides and talking points", specialistId: "fundraising-advisor", icon: "Presentation", outputType: "presentation", workflowId: "pitch-narrative", estimatedTime: "~2 min" },
    { id: "investor-shortlist", name: "Investor Shortlist", description: "Top 20 matched investors with fit scores and intro strategy", specialistId: "fundraising-advisor", icon: "UserSearch", outputType: "spreadsheet", workflowId: "investor-shortlist", estimatedTime: "~1 min" },
    { id: "investor-update", name: "Investor Update", description: "Monthly investor email with metrics, wins, and asks", specialistId: "fundraising-advisor", icon: "Mail", outputType: "email", workflowId: "investor-update-email", estimatedTime: "~1 min" },

    // Harper (People)
    { id: "hiring-plan", name: "Hiring Plan", description: "Prioritised hiring roadmap with roles, timing, and budget", specialistId: "hiring-team", icon: "Users", outputType: "document", workflowId: "hiring-roadmap", estimatedTime: "~1 min" },
    { id: "job-descriptions", name: "Job Descriptions", description: "Role-specific JDs with requirements and culture fit criteria", specialistId: "hiring-team", icon: "FileText", outputType: "document", workflowId: "job-description", estimatedTime: "~1 min" },
    { id: "org-chart", name: "Org Chart", description: "Current and planned team structure with reporting lines", specialistId: "hiring-team", icon: "Network", outputType: "document", workflowId: "org-chart", estimatedTime: "~1 min" },

    // Leo (Legal)
    { id: "ip-audit", name: "IP Audit", description: "Intellectual property inventory with protection recommendations", specialistId: "legal-counsel", icon: "Shield", outputType: "checklist", workflowId: "contract-review", estimatedTime: "~1 min" },
    { id: "nda-template", name: "NDA Template", description: "Non-disclosure agreement tailored to your industry and stage", specialistId: "legal-counsel", icon: "Lock", outputType: "document", workflowId: "nda-template", estimatedTime: "~1 min" },
    { id: "compliance-review", name: "Compliance Review", description: "Regulatory compliance checklist for your product and market", specialistId: "legal-counsel", icon: "CheckSquare", outputType: "checklist", workflowId: "compliance-review", estimatedTime: "~1 min" },
]

export function getSkillsForSpecialist(specialistId: SpecialistId): SpecialistSkill[] {
    return SPECIALIST_SKILLS.filter(s => s.specialistId === specialistId)
}

export function getSkillById(skillId: string): SpecialistSkill | undefined {
    return SPECIALIST_SKILLS.find(s => s.id === skillId)
}
