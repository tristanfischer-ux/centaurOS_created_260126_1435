import type { SpecialistId } from "@/lib/agents/specialists-config"

/**
 * Seed brainstorming prompts surfaced at the top of the /agents page.
 * Click → opens a team meeting with the topic pre-filled and the
 * suggested specialists pre-selected as participants.
 *
 * Kept as static data for V1 — once we see which prompts get clicked the
 * most, these can be reordered or made dynamic from the user's context.
 */

export type IdeaCategory = "Strategy" | "Finance" | "Operations" | "Hiring" | "Go-to-market"

export type IdeaPrompt = {
    id: string
    category: IdeaCategory
    question: string
    subtitle: string
    specialistIds: SpecialistId[]
}

export const IDEA_PROMPTS: IdeaPrompt[] = [
    {
        id: "raise-vs-profit",
        category: "Finance",
        question: "Should we raise more money or get to profitability faster?",
        subtitle: "Map the tradeoffs against runway and valuation dynamics.",
        specialistIds: ["finance-lead", "strategist"],
    },
    {
        id: "pricing",
        category: "Go-to-market",
        question: "How should we price our first product?",
        subtitle: "Pull numbers, positioning, and willingness-to-pay into one view.",
        specialistIds: ["finance-lead", "product-lead", "sales-lead"],
    },
    {
        id: "next-hire",
        category: "Hiring",
        question: "Where should we focus hiring next?",
        subtitle: "Pressure-test the org chart against the next six months of work.",
        specialistIds: ["hiring-team", "vp-engineering", "chief-of-staff"],
    },
    {
        id: "investor-story",
        category: "Finance",
        question: "How do I tell our story to investors?",
        subtitle: "Sharpen the narrative before the next round of meetings.",
        specialistIds: ["fundraising-advisor", "strategist"],
    },
    {
        id: "biggest-risk",
        category: "Strategy",
        question: "What's our biggest risk right now?",
        subtitle: "Surface the thing most likely to kill the business in the next 90 days.",
        specialistIds: ["strategist", "legal-counsel"],
    },
    {
        id: "mfg-partner",
        category: "Operations",
        question: "How do we pick our first manufacturing partner?",
        subtitle: "Compare capability, cost, and relationship risk on one page.",
        specialistIds: ["vp-manufacturing", "vp-supply-chain"],
    },
    {
        id: "build-vs-partner",
        category: "Strategy",
        question: "Should we build in-house or partner?",
        subtitle: "Scope, control, and time-to-market in one conversation.",
        specialistIds: ["cto", "vp-engineering"],
    },
    {
        id: "positioning",
        category: "Go-to-market",
        question: "What's our positioning against competitors?",
        subtitle: "Differentiate before marketing spend starts.",
        specialistIds: ["strategist", "growth-marketer"],
    },
]
