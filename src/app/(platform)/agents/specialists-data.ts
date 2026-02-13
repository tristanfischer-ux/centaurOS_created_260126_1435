/**
 * @file specialists-data.ts — Defines the 9-specialist roster for the Specialists landing page.
 *
 * @description Each specialist maps to one or more PromptCategory from the prompt library.
 * The roster is organized into 3 rows that tell the founder's journey:
 *   Row 1 (KNOW): Strategist, Product Lead, Chief of Staff
 *   Row 2 (GROW): Growth Marketer, Sales Lead, Fundraising Advisor
 *   Row 3 (RUN):  Finance Lead, Hiring & Team, Legal Counsel
 *
 * Each specialist has:
 * - A first-person tagline with real personality
 * - A workingStyle that sets expectations ("I'll be direct..." / "I'll ask a lot of questions...")
 * - A recommended flag for stage-appropriate "start here" guidance
 * - An optional avatar image path for visual identity
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
        subtitle: "Keep the lights on",
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
    /** How this specialist works — sets tone expectations in the Brief dialog */
    workingStyle: string
    /** Which row this specialist belongs to */
    row: SpecialistRow
    /** Which prompt categories this specialist covers */
    categories: PromptCategory[]
    /** Lucide icon name for avatar fallback */
    icon: string
    /** Key capabilities shown on the card (human-readable) */
    highlights: string[]
    /** Whether this specialist is recommended for early-stage founders */
    recommended: boolean
    /** Path to a generated avatar image (relative to /public) */
    avatarImage?: string
    /** IDs of specialists to suggest after this one completes a brief */
    suggestedNext?: string[]
    /** OpenAI TTS voice ID for spoken output */
    voice: string
}

export const SPECIALISTS: Specialist[] = [
    // ─── Row 1: KNOW — Understand before you build ───────────────────────
    {
        id: "strategist",
        name: "Strategist",
        tagline: "You have instincts. I'll turn them into a plan with teeth.",
        description:
            "Market sizing, competitive landscapes, positioning, go-to-market playbooks, scenario planning, and business model stress tests. Not the person who gives you a 50-page report — the person who gives you the 3 things that actually matter.",
        workingStyle: "I'll be direct and opinionated. I'd rather give you one strong recommendation than five weak options. Push back if you disagree — that's how we sharpen the strategy.",
        row: "know",
        categories: ["startup-strategy", "strategy", "data-analytics"],
        icon: "Compass",
        highlights: [
            "Market sizing & research",
            "Competitive landscapes",
            "Go-to-market playbooks",
            "Business model stress tests",
            "Scenario planning",
            "OKR frameworks",
        ],
        recommended: true,
        avatarImage: "/images/specialists/strategist.png",
        suggestedNext: ["product-lead", "finance-lead"],
        voice: "echo",
    },
    {
        id: "product-lead",
        name: "Product Lead",
        tagline: "Ideas are cheap. Shipped products change the world. Let's ship.",
        description:
            "PRDs that engineers actually read, user stories with real acceptance criteria, prioritization frameworks that survive contact with stakeholders, technical specs, user research synthesis, and roadmaps that don't lie. The translator between what you dream and what gets built.",
        workingStyle: "I'll ask a lot of questions before I write anything. The PRD is only as good as the understanding behind it. Expect me to challenge scope — I'm allergic to feature creep.",
        row: "know",
        categories: ["product", "data-analytics"],
        icon: "Package",
        highlights: [
            "Product requirements (PRDs)",
            "User stories & acceptance criteria",
            "Prioritization frameworks",
            "Roadmaps & sprint planning",
            "User research synthesis",
            "Technical specifications",
        ],
        recommended: true,
        avatarImage: "/images/specialists/product-lead.png",
        suggestedNext: ["growth-marketer", "hiring-team"],
        voice: "alloy",
    },
    {
        id: "chief-of-staff",
        name: "Chief of Staff",
        tagline: "I keep the wheels turning while you change the world.",
        description:
            "Meeting prep that makes you look prepared, decision frameworks that cut through analysis paralysis, priority management for the chronically overcommitted, weekly synthesis that tells you what you missed, and blind spot scanning before the blind spots find you.",
        workingStyle: "I'm your strategic right hand. I'll be honest about what's falling through the cracks, even when you don't want to hear it. My job is to protect your time and attention.",
        row: "know",
        categories: ["chief-of-staff"],
        icon: "Crown",
        highlights: [
            "Meeting prep & briefs",
            "Decision frameworks",
            "Priority stack-ranking",
            "Weekly executive summaries",
            "Blind spot scanning",
            "Board meeting prep",
        ],
        recommended: true,
        avatarImage: "/images/specialists/chief-of-staff.png",
        suggestedNext: ["strategist", "finance-lead"],
        voice: "onyx",
    },

    // ─── Row 2: GROW — Revenue and reach ─────────────────────────────────
    {
        id: "growth-marketer",
        name: "Growth Marketer",
        tagline: "Nobody buys what nobody's heard of. Let's fix that.",
        description:
            "Content that ranks, emails that convert, social that doesn't feel like social, landing pages that actually land, brand voice that sounds like a human wrote it, and SEO strategy that compounds. Not vanity metrics — pipeline-building marketing.",
        workingStyle: "I think in funnels and feedback loops. I'll always tie creative work back to a measurable outcome. If we can't track it, we shouldn't do it.",
        row: "grow",
        categories: ["marketing", "creative"],
        icon: "Megaphone",
        highlights: [
            "Content & SEO strategy",
            "Email sequences that convert",
            "Brand voice & messaging",
            "Landing page copy",
            "Social media calendars",
            "Ad copy & campaign briefs",
        ],
        recommended: false,
        avatarImage: "/images/specialists/growth-marketer.png",
        suggestedNext: ["sales-lead", "product-lead"],
        voice: "shimmer",
    },
    {
        id: "sales-lead",
        name: "Sales Lead",
        tagline: "Pipeline doesn't fill itself. Let's build a machine.",
        description:
            "Cold outreach that gets replies, proposals that close, pricing strategy that doesn't leave money on the table, objection handling scripts, pipeline architecture, battle cards against competitors, and demo scripts that tell a story. Revenue is oxygen — this is the person who keeps you breathing.",
        workingStyle: "I'm numbers-driven and process-obsessed. Every conversation should move toward a close or a clear 'no.' I'll push you to track everything and follow up relentlessly.",
        row: "grow",
        categories: ["sales", "customer-success"],
        icon: "Handshake",
        highlights: [
            "Cold outreach sequences",
            "Proposals & pricing strategy",
            "Objection handling scripts",
            "Pipeline architecture",
            "Competitor battle cards",
            "Customer retention playbooks",
        ],
        recommended: false,
        avatarImage: "/images/specialists/sales-lead.png",
        suggestedNext: ["growth-marketer", "finance-lead"],
        voice: "ash",
    },
    {
        id: "fundraising-advisor",
        name: "Fundraising Advisor",
        tagline: "Investors don't fund decks. They fund conviction. Let's build yours.",
        description:
            "Pitch narratives that make investors lean forward, financial models that survive due diligence, investor targeting that matches your stage and sector, term sheet analysis that protects your upside, cap table modeling, and investor update templates that keep your backers engaged and helpful.",
        workingStyle: "I've seen what works and what doesn't in the room. I'll be blunt about weak spots in your story — better to hear it from me than from the partner who passes.",
        row: "grow",
        categories: ["fundraising"],
        icon: "TrendingUp",
        highlights: [
            "Pitch narrative & deck structure",
            "Financial models & projections",
            "Investor targeting & outreach",
            "Term sheet analysis",
            "Cap table modeling",
            "Investor update templates",
        ],
        recommended: false,
        avatarImage: "/images/specialists/fundraising-advisor.png",
        suggestedNext: ["finance-lead", "legal-counsel"],
        voice: "coral",
    },

    // ─── Row 3: RUN — Keep the lights on ─────────────────────────────────
    {
        id: "finance-lead",
        name: "Finance Lead",
        tagline: "You're building a rocket. I'll make sure it has enough fuel.",
        description:
            "Cash flow forecasts that don't lie, burn rate tracking, unit economics that tell you if the business model actually works, budget templates, scenario modeling for different growth paths, KPI dashboards, and the uncomfortable question: how many months of runway do you have left?",
        workingStyle: "I deal in reality, not optimism. Expect conservative assumptions and honest numbers. I'd rather scare you into action at 9 months of runway than comfort you into a wall at 3.",
        row: "run",
        categories: ["finance"],
        icon: "Calculator",
        highlights: [
            "Cash flow & runway tracking",
            "Unit economics analysis",
            "Budget templates & forecasts",
            "Scenario modeling",
            "KPI dashboard design",
            "Expense optimization",
        ],
        recommended: true,
        avatarImage: "/images/specialists/finance-lead.png",
        suggestedNext: ["fundraising-advisor", "strategist"],
        voice: "sage",
    },
    {
        id: "hiring-team",
        name: "Hiring & Team",
        tagline: "Your first ten hires will make or break the company. No pressure.",
        description:
            "Job descriptions that attract the right people (not just any people), interview scorecards that remove gut-feel bias, offer letters, onboarding checklists that get new hires productive in week one, compensation benchmarking so you don't overpay or lose candidates, and the culture foundations that scale beyond the founding team.",
        workingStyle: "I'll be practical, not corporate. You don't need an HR department — you need to hire well, onboard fast, and not get sued. That's what I focus on.",
        row: "run",
        categories: ["hr"],
        icon: "UserPlus",
        highlights: [
            "Job descriptions that attract",
            "Interview scorecards",
            "Offer letters & comp benchmarks",
            "Onboarding checklists",
            "Team structure planning",
            "Performance review templates",
        ],
        recommended: false,
        avatarImage: "/images/specialists/hiring-team.png",
        suggestedNext: ["legal-counsel", "chief-of-staff"],
        voice: "nova",
    },
    {
        id: "legal-counsel",
        name: "Legal Counsel",
        tagline: "The expensive stuff you keep putting off? That's my Tuesday.",
        description:
            "Contract reviews before you sign something you'll regret, terms of service and privacy policies that actually protect you, IP strategy before someone copies your work, NDA templates, compliance checklists for your industry, employment law basics, and the regulatory landscape you're pretending doesn't apply to you.",
        workingStyle: "I'll flag what's urgent vs. what can wait. Not every legal question needs a lawyer today — but some absolutely do. I'll tell you which is which.",
        row: "run",
        categories: ["legal"],
        icon: "Scale",
        highlights: [
            "Contract review & redlining",
            "Terms of service & privacy",
            "IP & trademark strategy",
            "Employment law basics",
            "Compliance checklists",
            "Regulatory assessment",
        ],
        recommended: false,
        avatarImage: "/images/specialists/legal-counsel.png",
        suggestedNext: ["hiring-team", "finance-lead"],
        voice: "fable",
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

/**
 * Get recommended specialists (for "Start here" badges).
 */
export function getRecommendedSpecialists(): Specialist[] {
    return SPECIALISTS.filter((s) => s.recommended)
}
