import type { SpecialistId } from "@/lib/agents/specialists-config"

/**
 * Seed brainstorming prompts surfaced at the top of the /agents page.
 * Click → opens a team meeting with the topic pre-filled and the
 * suggested specialists pre-selected as participants.
 *
 * Kept as static data for V1 — once we see which prompts get clicked the
 * most, these can be reordered or made dynamic from the user's context.
 */

export type IdeaCategory = "Strategy" | "Finance" | "Operations" | "Hiring" | "Go-to-market" | "Intelligence"

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
    // Intelligence-embedded hardware prompts (added 2026-04-25 per the
    // homepage thesis: cheap intelligence makes every commodity hardware
    // product re-imaginable). Each forces the founder to think about the
    // smart-version opportunity in their category.
    {
        id: "smart-version",
        category: "Intelligence",
        question: "What's the smart version of my product?",
        subtitle: "Find the intelligence layer your competitors haven't added yet.",
        specialistIds: ["cto", "product-lead", "strategist"],
    },
    {
        id: "intelligence-economics",
        category: "Intelligence",
        question: "How would intelligence change the unit economics of my category?",
        subtitle: "Move from one-time hardware sale to recurring data + service revenue.",
        specialistIds: ["finance-lead", "strategist", "growth-marketer"],
    },
    {
        id: "sensor-or-edge",
        category: "Intelligence",
        question: "Where does intelligence belong in my BOM — at the chip, the edge, or the cloud?",
        subtitle: "Trade-off latency, cost, privacy, and connectivity in one decision.",
        specialistIds: ["cto", "vp-engineering", "vp-manufacturing"],
    },
    {
        id: "tenx-with-intelligence",
        category: "Intelligence",
        question: "What sensors or learning loop would make my product 10× better?",
        subtitle: "Identify the data the product creates and the value that compounds from it.",
        specialistIds: ["cto", "product-lead", "vp-engineering"],
    },
]
