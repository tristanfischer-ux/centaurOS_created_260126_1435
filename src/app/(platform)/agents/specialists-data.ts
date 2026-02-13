/**
 * @file specialists-data.ts — Defines the 9-specialist roster for the Specialists landing page.
 *
 * @description Each specialist maps to one or more PromptCategory from the prompt library.
 * The roster is organized into 3 rows that tell the founder's journey:
 *   Row 1 (KNOW): Strategist, Product Lead, Chief of Staff
 *   Row 2 (GROW): Growth Marketer, Sales Lead, Fundraising Advisor
 *   Row 3 (RUN):  Finance Lead, People & Culture, Legal Counsel
 *
 * @related
 * - Prompt library: src/app/(platform)/agents/lib/prompt-library.ts
 * - Agent types: src/app/(platform)/agents/lib/agent-types.ts
 * - Specialist card: src/app/(platform)/agents/specialist-card.tsx
 * - Specialists landing: src/app/(platform)/agents/specialists-landing.tsx
 */

import type { PromptCategory } from "./lib/agent-types"

// ─── Row Definitions ─────────────────────────────────────────────────────────

export type SpecialistRow = "know" | "grow" | "run"

export interface RowMeta {
    id: SpecialistRow
    label: string
    subtitle: string
    accentColor: string
}

export const SPECIALIST_ROWS: RowMeta[] = [
    {
        id: "know",
        label: "KNOW",
        subtitle: "Understand before you build",
        accentColor: "bg-electric-blue",
    },
    {
        id: "grow",
        label: "GROW",
        subtitle: "Revenue and reach",
        accentColor: "bg-international-orange",
    },
    {
        id: "run",
        label: "RUN",
        subtitle: "Don't crash",
        accentColor: "bg-status-success",
    },
]

// ─── Specialist Definitions ──────────────────────────────────────────────────

export interface Specialist {
    /** Unique identifier */
    id: string
    /** Display name (e.g., "Strategist") */
    name: string
    /** First-person tagline that gives the specialist personality */
    tagline: string
    /** Longer description of what this specialist does */
    description: string
    /** Which row this specialist belongs to */
    row: SpecialistRow
    /** Which prompt categories this specialist covers */
    categories: PromptCategory[]
    /** Lucide icon name for avatar fallback */
    icon: string
    /** Key capabilities shown on the card (human-readable) */
    highlights: string[]
}

export const SPECIALISTS: Specialist[] = [
    // ─── Row 1: KNOW — Understand before you build ───────────────────────
    {
        id: "strategist",
        name: "Strategist",
        tagline: "I see the big picture so you can focus on what matters.",
        description:
            "Market research, competitive analysis, business model design, go-to-market strategy, market sizing, and scenario planning. The person who turns messy ideas into clear, actionable plans.",
        row: "know",
        categories: ["startup-strategy", "strategy", "data-analytics"],
        icon: "Compass",
        highlights: [
            "Market research & sizing",
            "Competitive analysis",
            "Go-to-market strategy",
            "Business model design",
            "OKRs & planning",
        ],
    },
    {
        id: "product-lead",
        name: "Product Lead",
        tagline: "I turn your vision into something engineers can build.",
        description:
            "PRDs, user stories, roadmaps, feature prioritization, technical specs, and user personas. Translates what you want into what your team can actually deliver.",
        row: "know",
        categories: ["product"],
        icon: "Package",
        highlights: [
            "Product requirements",
            "User stories",
            "Feature prioritization",
            "Roadmaps",
            "Technical specs",
        ],
    },
    {
        id: "chief-of-staff",
        name: "Chief of Staff",
        tagline: "I keep the wheels turning while you change the world.",
        description:
            "Meeting prep, decision frameworks, priority management, weekly synthesis, communication drafts, and blind spot scanning. Your right hand who makes sure nothing falls through the cracks.",
        row: "know",
        categories: ["chief-of-staff"],
        icon: "Crown",
        highlights: [
            "Meeting prep & briefs",
            "Decision frameworks",
            "Priority management",
            "Weekly summaries",
            "Communication drafts",
        ],
    },

    // ─── Row 2: GROW — Revenue and reach ─────────────────────────────────
    {
        id: "growth-marketer",
        name: "Growth Marketer",
        tagline: "I make sure the right people know your name.",
        description:
            "Content calendars, SEO strategy, email campaigns, social media, brand voice, landing page copy, ad copy, and PR. Fills the top of your funnel and builds your brand.",
        row: "grow",
        categories: ["marketing", "creative"],
        icon: "Megaphone",
        highlights: [
            "Content & SEO strategy",
            "Email campaigns",
            "Brand & messaging",
            "Social media",
            "Landing page copy",
        ],
    },
    {
        id: "sales-lead",
        name: "Sales Lead",
        tagline: "Every great product needs someone who can close. That's me.",
        description:
            "Cold outreach, proposals, pricing strategy, objection handling, pipeline management, battle cards, and demo scripts. Turns conversations into revenue.",
        row: "grow",
        categories: ["sales", "customer-success"],
        icon: "Handshake",
        highlights: [
            "Outreach sequences",
            "Proposals & pricing",
            "Objection handling",
            "Pipeline strategy",
            "Customer retention",
        ],
    },
    {
        id: "fundraising-advisor",
        name: "Fundraising Advisor",
        tagline: "Investors don't fund decks. They fund stories. Let me help tell yours.",
        description:
            "Pitch decks, financial projections, investor targeting, cap table management, term sheet analysis, due diligence prep, and investor updates. Gets you funded.",
        row: "grow",
        categories: ["fundraising"],
        icon: "TrendingUp",
        highlights: [
            "Pitch deck narrative",
            "Financial projections",
            "Investor targeting",
            "Due diligence prep",
            "Term sheet analysis",
        ],
    },

    // ─── Row 3: RUN — Don't crash ───────────────────────────────────────
    {
        id: "finance-lead",
        name: "Finance Lead",
        tagline: "I run the numbers so you can run the business.",
        description:
            "Cash flow forecasts, budgets, unit economics, financial models, expense analysis, KPI dashboards, and burn rate tracking. The person who tells you how much runway you have left.",
        row: "run",
        categories: ["finance"],
        icon: "Calculator",
        highlights: [
            "Cash flow & burn rate",
            "Budgets & forecasts",
            "Unit economics",
            "Financial models",
            "KPI dashboards",
        ],
    },
    {
        id: "people-culture",
        name: "People & Culture",
        tagline: "Great companies are built by great teams. Let's build yours.",
        description:
            "Job descriptions, interview guides, onboarding checklists, culture playbooks, compensation benchmarking, and performance reviews. Builds the team that replaces the specialists.",
        row: "run",
        categories: ["hr"],
        icon: "Users",
        highlights: [
            "Job descriptions",
            "Interview guides",
            "Onboarding plans",
            "Culture playbooks",
            "Compensation benchmarks",
        ],
    },
    {
        id: "legal-counsel",
        name: "Legal Counsel",
        tagline: "I protect what you're building so you can focus on building it.",
        description:
            "Contract reviews, terms of service, privacy policies, IP protection, NDAs, compliance checklists, and regulatory assessment. The expensive stuff you keep putting off.",
        row: "run",
        categories: ["legal"],
        icon: "Scale",
        highlights: [
            "Contract reviews",
            "Terms & privacy",
            "IP protection",
            "Compliance checklists",
            "NDA summaries",
        ],
    },
]

/**
 * Get all specialists for a given row.
 */
export function getSpecialistsByRow(row: SpecialistRow): Specialist[] {
    return SPECIALISTS.filter((s) => s.row === row)
}

/**
 * Get a specialist by ID.
 */
export function getSpecialistById(id: string): Specialist | undefined {
    return SPECIALISTS.find((s) => s.id === id)
}

/**
 * Get all prompt categories that a specialist covers.
 */
export function getSpecialistCategories(specialistId: string): PromptCategory[] {
    const specialist = getSpecialistById(specialistId)
    return specialist?.categories ?? []
}
