/**
 * @file section-registry.ts — Section definitions for sidebar navigation
 *
 * @description Defines the five navigation sections (Me, Plan, Finance, Workshop, Marketplace)
 * and maps features from the feature registry into their respective sections.
 * Used by the sidebar "New" badge system to detect unseen features per section,
 * and by the section intro pages for visual metadata (hero images, accents, connections).
 *
 * @related
 * - Feature registry: src/lib/features/registry.ts
 * - Sidebar: src/components/Sidebar.tsx
 * - New badge hook: src/hooks/useSectionNewBadge.ts
 * - Section intro page: src/components/sidebar/SectionIntroPage.tsx
 */

import type { LucideIcon } from "lucide-react"
import {
    UserCircle,
    Bell,
    Waypoints,
    Target,
    CheckSquare,
    Flame,
    Users,
    UsersRound,
    UserSearch,
    GraduationCap,
    BookOpen,
    Store,
    ShoppingBag,
    PoundSterling,
    Map,
    FileText,
} from "lucide-react"

// ─── Section Definitions ────────────────────────────────────────────────────

export type SectionId = "me" | "plan" | "finance" | "workshop" | "marketplace"

export interface SectionFeature {
    /** Display name in the intro page */
    name: string
    /** Short description (1-2 lines) */
    description: string
    /** Route to navigate to */
    route: string
    /** Lucide icon component */
    icon: LucideIcon
    /** Date this feature was added to its section (for "New" badge tracking) */
    addedAt: Date
}

/** Value proposition displayed on the intro page */
export interface SectionValueProp {
    /** Short title for the value prop */
    title: string
    /** Brief description */
    text: string
}

/** Visual metadata for section intro pages */
export interface SectionVisual {
    /** Path to the hero background image in /public */
    heroImage: string
    /** Alt text for the hero image */
    heroAlt: string
    /** CSS gradient for the section accent (from-color to-color) */
    accentGradient: string
    /** CSS class for accent color on icon backgrounds */
    accentBg: string
    /** CSS class for accent text color */
    accentText: string
    /** Step number in the journey (1-based) */
    journeyStep: number
    /** Short journey label (e.g. "You", "Plan", "Build", "Scale") */
    journeyLabel: string
}

/** Connection to another section, shown in the integration zone */
export interface SectionConnection {
    /** Target section ID */
    targetId: SectionId
    /** Relationship label (e.g. "feeds into", "powers") */
    relationship: string
    /** Short description of how the sections connect */
    description: string
}

export interface Section {
    id: SectionId
    /** Display label in sidebar */
    label: string
    /** Route to the section intro page */
    introRoute: string
    /** Short tagline for the intro page hero */
    tagline: string
    /** Longer description for the intro page */
    description: string
    /** Features within this section */
    features: SectionFeature[]
    /** Value propositions shown on the intro page */
    valueProps: SectionValueProp[]
    /** Visual metadata for the intro page hero and accents */
    visual: SectionVisual
    /** Connections to other sections */
    connections: SectionConnection[]
}

/**
 * Master section registry — the single source of truth for sidebar sections.
 *
 * @description Each section maps to a clickable header in the sidebar that
 * navigates to an intro page. Features within the section are displayed as
 * nav items below the header.
 */
export const SECTIONS: Section[] = [
    {
        id: "me",
        label: "Me",
        introRoute: "/me",
        tagline: "Everything you need, one glance",
        description: "Start your day here. Due tasks, live updates, and your momentum — all in one view. No digging through emails. No switching between apps.",
        valueProps: [
            { title: "Start every day informed", text: "See what's due, what's overdue, and what changed — the moment you open ForgeOS." },
            { title: "Track your momentum", text: "Your activity heatmap and streak show real progress. Watch your productivity compound over time." },
        ],
        visual: {
            heroImage: "/images/sections/me-hero.png",
            heroAlt: "Clean desk with ultrawide monitor showing a personal dashboard in morning light",
            accentGradient: "from-orange-500 to-amber-400",
            accentBg: "bg-orange-50",
            accentText: "text-international-orange",
            journeyStep: 1,
            journeyLabel: "You",
        },
        connections: [
            { targetId: "plan", relationship: "feeds into", description: "Your dashboard keeps you informed, so when you sit down to plan, you know exactly where things stand." },
        ],
        features: [
            {
                name: "My Profile",
                description: "Your profile, companies, and marketplace presence",
                route: "/my-profile",
                icon: UserCircle,
                addedAt: new Date("2025-12-01"),
            },
            {
                name: "Updates",
                description: "Notes, comments, and changes across your tasks and objectives",
                route: "/updates",
                icon: Bell,
                addedAt: new Date("2026-02-03"),
            },
        ],
    },
    {
        id: "plan",
        label: "Plan",
        introRoute: "/plan",
        tagline: "Idea to plan in seconds",
        description: "Describe what you want in one sentence. ForgeOS generates objectives, tasks, timelines, and milestones. Or pick a template and deploy a full plan instantly. No spreadsheets. No consultants. No wasted days.",
        valueProps: [
            { title: "One sentence, full plan", text: "Type what you want to accomplish. Get back a structured plan with phases, tasks, and deadlines — ready to execute." },
            { title: "Templates for every scenario", text: "Launching a startup? Running a fundraise? Hiring a team? Pick a template and start in seconds, not weeks." },
            { title: "Strategy that cascades", text: "Every task traces back to a strategic objective. Always know why you're doing what you're doing." },
        ],
        visual: {
            heroImage: "/images/sections/plan-hero.png",
            heroAlt: "Bright office with a structured plan and timeline on a large display",
            accentGradient: "from-orange-500 to-blue-500",
            accentBg: "bg-blue-50",
            accentText: "text-electric-blue",
            journeyStep: 2,
            journeyLabel: "Plan",
        },
        connections: [
            { targetId: "me", relationship: "informed by", description: "Your dashboard keeps you informed, so when you sit down to plan, you know exactly where things stand." },
            { targetId: "workshop", relationship: "drives", description: "Once you've planned it, build it. Tasks and objectives flow straight to your team and The Forge." },
        ],
        features: [
            {
                name: "Strategy",
                description: "Strategy flow, timeline, and visual map of your strategic goals",
                route: "/canvas",
                icon: Waypoints,
                addedAt: new Date("2026-02-09"),
            },
            {
                name: "Objectives",
                description: "Set and track high-level strategic goals",
                route: "/new-objectives",
                icon: Target,
                addedAt: new Date("2025-12-15"),
            },
            {
                name: "Tasks",
                description: "Manage and assign actionable work items",
                route: "/new-tasks",
                icon: CheckSquare,
                addedAt: new Date("2025-12-10"),
            },
        ],
    },
    {
        id: "finance",
        label: "Finance",
        introRoute: "/finance/intro",
        tagline: "Your financial command centre",
        description: "See your complete financial picture in one place. Revenue, expenses, cash flow, invoices, and profitability — all unified from your existing data. No spreadsheets. No guesswork.",
        valueProps: [
            { title: "See everything at a glance", text: "Cash position, revenue trends, expense breakdown, and outstanding invoices — all on a single dashboard." },
            { title: "Know your margins", text: "Real-time profitability from your Money Map data. Understand where every pound goes and what drives your bottom line." },
            { title: "Stay on top of payments", text: "Track outstanding invoices with aging buckets. Never miss an overdue payment again." },
        ],
        visual: {
            heroImage: "/images/sections/finance-hero.png",
            heroAlt: "Clean financial dashboard showing revenue charts and KPI cards",
            accentGradient: "from-orange-500 to-emerald-400",
            accentBg: "bg-emerald-50",
            accentText: "text-status-success",
            journeyStep: 3,
            journeyLabel: "Finance",
        },
        connections: [
            { targetId: "plan", relationship: "informed by", description: "Your strategic plans drive financial projections and budget allocation." },
            { targetId: "marketplace", relationship: "tracks", description: "Orders, payments, and invoices from the Marketplace flow into your financial overview." },
        ],
        features: [
            {
                name: "Overview",
                description: "Your unified financial dashboard — KPIs, charts, and transaction feed",
                route: "/finance",
                icon: PoundSterling,
                addedAt: new Date("2026-02-23"),
            },
            {
                name: "Money Map",
                description: "Visualise revenue streams, costs, and profitability",
                route: "/finance/money-map",
                icon: Map,
                addedAt: new Date("2026-02-23"),
            },
            {
                name: "Invoices",
                description: "Track outstanding payments and aging buckets",
                route: "/finance/invoices",
                icon: FileText,
                addedAt: new Date("2026-02-23"),
            },
        ],
    },
    {
        id: "workshop",
        label: "Workshop",
        introRoute: "/workshop",
        tagline: "Where ideas become real",
        description: "Turn plans into products. Scan any product idea into a full engineering dossier. Coordinate your team. Go from concept to prototype at a speed that wasn't possible before.",
        valueProps: [
            { title: "Idea to engineering spec — in minutes", text: "Describe a product. Get a complete dossier: 3D CAD models, material specs, and build plans. What used to take weeks takes minutes." },
            { title: "Your team, at a glance", text: "People and roles in one view. Assign work, track capacity, and keep everyone moving in the same direction." },
            { title: "Build your playbook", text: "Create and reuse prompt workflows. The more you build, the faster everything gets." },
        ],
        visual: {
            heroImage: "/images/sections/workshop-hero.png",
            heroAlt: "Modern makerspace with prototypes, 3D printer, and engineer reviewing CAD designs",
            accentGradient: "from-orange-600 to-amber-500",
            accentBg: "bg-orange-50",
            accentText: "text-international-orange",
            journeyStep: 4,
            journeyLabel: "Build",
        },
        connections: [
            { targetId: "plan", relationship: "executes", description: "Once you've planned it, build it. Tasks and objectives flow straight to your team and The Forge." },
            { targetId: "marketplace", relationship: "sources from", description: "Need more hands? More materials? The Marketplace plugs directly into your workshop." },
        ],
        features: [
            {
                name: "The Forge",
                description: "Design-to-RFQ workspace for guided intake, CAD generation, and supplier handoff",
                route: "/the-forge",
                icon: Flame,
                addedAt: new Date("2026-02-11"),
            },
            {
                name: "Team",
                description: "Team members, roles, and capacity",
                route: "/team",
                icon: Users,
                addedAt: new Date("2025-12-10"),
            },
            {
                name: "Specialists",
                description: "Your on-demand team of experts — brief them on anything",
                route: "/agents",
                icon: UsersRound,
                addedAt: new Date("2026-02-01"),
            },
            {
                name: "Inspiration",
                description: "Techniques, tutorials, and expert guidance to level up your craft",
                route: "/learn",
                icon: BookOpen,
                addedAt: new Date("2026-02-22"),
            },
        ],
    },
    {
        id: "marketplace",
        label: "Marketplace",
        introRoute: "/marketplace-hub",
        tagline: "Everything you need, everyone you need",
        description: "Don't do it all yourself. Find expert talent, source products and services, and fill gaps fast. No recruiters. No agencies. No long procurement cycles.",
        valueProps: [
            { title: "Find experts in minutes", text: "Fractional executives, consultants, and specialists — browse, compare, and engage. No recruiter fees, no 6-week searches." },
            { title: "Source products and services", text: "Materials, components, professional services. Compare options, check ratings, place orders — all in one place." },
            { title: "Discover what's possible", text: "See what others are building. Find techniques, trends, and inspiration for your next move." },
        ],
        visual: {
            heroImage: "/images/sections/marketplace-hero.png",
            heroAlt: "Bright marketplace with diverse professionals networking and browsing product displays",
            accentGradient: "from-orange-500 to-teal-400",
            accentBg: "bg-teal-50",
            accentText: "text-teal-600",
            journeyStep: 5,
            journeyLabel: "Scale",
        },
        connections: [
            { targetId: "workshop", relationship: "supplies", description: "Need more hands? More materials? The Marketplace plugs directly into your workshop." },
            { targetId: "me", relationship: "grows", description: "Your reputation, orders, and marketplace activity all flow back to your profile." },
        ],
        features: [
            // ── People ──
            {
                name: "Recruits",
                description: "Find expert talent — fractional executives, specialists, and consultants",
                route: "/recruits",
                icon: UserSearch,
                addedAt: new Date("2026-02-11"),
            },
            {
                name: "Guild",
                description: "Community hub — events, networking, and apprentice pool",
                route: "/guild",
                icon: GraduationCap,
                addedAt: new Date("2026-01-15"),
            },
            {
                name: "Apprenticeship",
                description: "Track apprenticeship progress, OTJT hours, and learning modules",
                route: "/apprenticeship",
                icon: BookOpen,
                addedAt: new Date("2026-01-15"),
            },
            // ── Supplies ──
            {
                name: "Marketplace",
                description: "Find experts, suppliers, products, and services",
                route: "/marketplace",
                icon: Store,
                addedAt: new Date("2025-12-20"),
            },
            {
                name: "Orders",
                description: "View and manage your marketplace orders",
                route: "/marketplace-orders",
                icon: ShoppingBag,
                addedAt: new Date("2026-01-10"),
            },
        ],
    },
]

/**
 * Get a section by ID.
 */
export function getSectionById(id: SectionId): Section | undefined {
    return SECTIONS.find((s) => s.id === id)
}

/**
 * Get all features across all sections.
 */
export function getAllSectionFeatures(): SectionFeature[] {
    return SECTIONS.flatMap((s) => s.features)
}

/**
 * Index at which the "Supplies" sub-label begins in the marketplace section.
 * Used by the sidebar to render visual sub-labels.
 * People: Recruits (0), Guild (1), Apprenticeship (2) → Supplies starts at 3.
 */
export const MARKETPLACE_SUPPLIES_START_INDEX = 3
