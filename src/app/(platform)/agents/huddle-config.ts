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

import { Lightbulb, Cpu, Scale, TrendingUp } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { SpecialistId } from "./specialists-data"

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

// DECISION: Four huddles covering the natural business domains a founder
// engages with. Cal sits in all of them as the operational glue — ensuring
// cross-huddle alignment, tracking follow-ups, and doing the post-meeting
// summarization.
export const HUDDLES: HuddleConfig[] = [
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
