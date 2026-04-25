/**
 * @file huddle-config.ts
 *
 * @description Defines the four pre-configured team huddles that replace the
 * specialist card grid. Each huddle has a lead, team members, and Cal (Chief
 * of Staff) always attends as the meeting coordinator and wrap-up summarizer.
 *
 * INTENT: Users don't want to hand-pick specialists for every meeting. These
 * huddles mirror natural business rhythms — strategy, technology, legal/finance,
 * and deep finance — and surface proactive discussion topics so the user can
 * jump straight into productive conversations.
 *
 * @related
 * - specialists-data.ts — Specialist definitions
 * - huddle-card.tsx — Card component that renders each huddle
 * - specialists-landing.tsx — Landing page that hosts the huddle grid
 * - sweep-prompts.ts — Background sweep that generates discussion topics
 */

import { Lightbulb, Cpu, Scale, TrendingUp, Rocket, RefreshCw, Truck, Target, UserPlus, Search, Sparkles } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { SpecialistId } from "@/lib/agents/specialists-config"

export interface HuddleConfig {
    /** Unique identifier for URL params and storage */
    id: string
    /** Display name shown on the card */
    name: string
    /** Short description of what this huddle covers */
    description: string
    /** The specialist who leads the discussion */
    leadId: SpecialistId
    /** Other specialist team members (Cal is always added automatically) */
    memberIds: SpecialistId[]
    /** Cal attends every huddle as coordinator */
    chiefOfStaffId: SpecialistId
    /** Specialist IDs whose insights map to this huddle's topic pool */
    insightSpecialistIds: SpecialistId[]
    /** Lucide icon for the card header */
    icon: LucideIcon
    /** Semantic color class for the accent */
    accentColor: string
}

// DECISION: Eleven huddles. Product Ideation leads the list because the
// killer-product loop starts here — Sage/Priya/Fang/Fiona invent a new
// product candidate, and the meeting outputs feed directly into The Forge
// (build it) AND the Investors search (test investor appetite). Every
// other huddle is downstream of having a product to build.
//
// The next four are evergreen rhythms (strategy, tech, legal/finance,
// finance deep dive). The remaining six are situational — founders jump
// into them at specific inflection points. Cal sits in all of them as the
// operational glue.
export const HUDDLES: HuddleConfig[] = [
    {
        id: "product-ideation",
        name: "Product Ideation Huddle",
        description:
            "Dream up new products that would survive contact with manufacturing AND investors. Cheap intelligence makes most physical products re-imaginable — what's the smart version?",
        leadId: "strategist",
        memberIds: ["product-lead", "vp-manufacturing", "fundraising-advisor"],
        chiefOfStaffId: "chief-of-staff",
        insightSpecialistIds: ["strategist", "product-lead", "vp-manufacturing", "fundraising-advisor"],
        icon: Sparkles,
        accentColor: "text-international-orange",
    },
    {
        id: "strategy",
        name: "Strategy Huddle",
        description: "Market positioning, go-to-market, and growth planning",
        leadId: "strategist",
        memberIds: ["growth-marketer", "sales-lead"],
        chiefOfStaffId: "chief-of-staff",
        insightSpecialistIds: ["strategist", "growth-marketer", "sales-lead"],
        icon: Lightbulb,
        accentColor: "text-chart-5",
    },
    {
        id: "technology",
        name: "Technology Huddle",
        description: "Architecture, engineering velocity, product, and operations",
        leadId: "cto",
        memberIds: ["vp-engineering", "vp-manufacturing", "vp-supply-chain", "product-lead"],
        chiefOfStaffId: "chief-of-staff",
        insightSpecialistIds: ["cto", "vp-engineering", "vp-manufacturing", "vp-supply-chain", "product-lead"],
        icon: Cpu,
        accentColor: "text-chart-2",
    },
    {
        id: "legal-finance",
        name: "Legal & Finance Huddle",
        description: "Compliance, contracts, budgets, and people operations",
        leadId: "legal-counsel",
        memberIds: ["finance-lead", "hiring-team"],
        chiefOfStaffId: "chief-of-staff",
        insightSpecialistIds: ["legal-counsel", "finance-lead", "hiring-team"],
        icon: Scale,
        accentColor: "text-chart-1",
    },
    {
        id: "finance-deep-dive",
        name: "Finance Deep Dive",
        description: "Runway, fundraising readiness, and financial modeling",
        leadId: "finance-lead",
        memberIds: ["fundraising-advisor"],
        chiefOfStaffId: "chief-of-staff",
        insightSpecialistIds: ["finance-lead", "fundraising-advisor"],
        icon: TrendingUp,
        accentColor: "text-chart-4",
    },
    // ─── Situational huddles ────────────────────────────────────────
    {
        id: "go-to-market",
        name: "Go-to-Market Launch",
        description: "Launch strategy, channel selection, pricing, and early traction",
        leadId: "strategist",
        memberIds: ["growth-marketer", "sales-lead", "fundraising-advisor"],
        chiefOfStaffId: "chief-of-staff",
        insightSpecialistIds: ["strategist", "growth-marketer", "sales-lead", "fundraising-advisor"],
        icon: Rocket,
        accentColor: "text-success",
    },
    {
        id: "product-pivot",
        name: "Product Pivot",
        description: "Stress-test assumptions, explore new directions, assess feasibility",
        leadId: "strategist",
        memberIds: ["cto", "product-lead", "finance-lead"],
        chiefOfStaffId: "chief-of-staff",
        insightSpecialistIds: ["strategist", "cto", "product-lead", "finance-lead"],
        icon: RefreshCw,
        accentColor: "text-warning",
    },
    {
        id: "supply-chain",
        name: "Supply Chain & Sourcing",
        description: "Supplier selection, MOQ negotiation, lead times, and logistics",
        leadId: "vp-supply-chain",
        memberIds: ["vp-manufacturing", "cto"],
        chiefOfStaffId: "chief-of-staff",
        insightSpecialistIds: ["vp-supply-chain", "vp-manufacturing", "cto"],
        icon: Truck,
        accentColor: "text-info",
    },
    {
        id: "fundraise-war-room",
        name: "Fundraise War Room",
        description: "Pitch prep, term sheets, cap table, and investor targeting",
        leadId: "fundraising-advisor",
        memberIds: ["finance-lead", "strategist", "legal-counsel"],
        chiefOfStaffId: "chief-of-staff",
        insightSpecialistIds: ["fundraising-advisor", "finance-lead", "strategist", "legal-counsel"],
        icon: Target,
        accentColor: "text-international-orange",
    },
    {
        id: "hiring-sprint",
        name: "Hiring Sprint",
        description: "Role definition, compensation, compliance, and talent pipeline",
        leadId: "hiring-team",
        memberIds: ["strategist", "legal-counsel"],
        chiefOfStaffId: "chief-of-staff",
        insightSpecialistIds: ["hiring-team", "strategist", "legal-counsel"],
        icon: UserPlus,
        accentColor: "text-chart-3",
    },
    {
        id: "customer-discovery",
        name: "Customer Discovery",
        description: "User research, problem validation, landing pages, and early feedback",
        leadId: "product-lead",
        memberIds: ["growth-marketer", "sales-lead"],
        chiefOfStaffId: "chief-of-staff",
        insightSpecialistIds: ["product-lead", "growth-marketer", "sales-lead"],
        icon: Search,
        accentColor: "text-chart-2",
    },
]

/**
 * Returns all specialist IDs for a huddle (lead + members + Cal).
 */
export function getHuddleParticipantIds(huddle: HuddleConfig): SpecialistId[] {
    const ids = new Set<SpecialistId>([
        huddle.leadId,
        ...huddle.memberIds,
        huddle.chiefOfStaffId,
    ])
    return Array.from(ids)
}

/**
 * Finds a huddle config by ID.
 */
export function getHuddleById(huddleId: string): HuddleConfig | undefined {
    return HUDDLES.find((h) => h.id === huddleId)
}
