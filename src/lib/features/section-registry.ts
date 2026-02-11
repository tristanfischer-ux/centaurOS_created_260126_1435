/**
 * @file section-registry.ts — Section definitions for sidebar navigation
 *
 * @description Defines the four navigation sections (Me, Plan, Workshop, Marketplace)
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
    Bot,
    UserSearch,
    GraduationCap,
    BookOpen,
    Lightbulb,
    Store,
    ShoppingBag,
} from "lucide-react"

// ─── Section Definitions ────────────────────────────────────────────────────

export type SectionId = "me" | "plan" | "workshop" | "marketplace"

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
        tagline: "Your personal command centre",
        description: "Everything about you — your profile, activity feed, and personal settings. This is your home base inside ForgeOS.",
        valueProps: [
            { title: "Own your identity", text: "Your profile is your presence across the entire platform — companies, marketplace, and team." },
            { title: "Stay in the loop", text: "One feed for everything: task updates, comments, mentions, and changes that matter to you." },
        ],
        visual: {
            heroImage: "/images/sections/me-hero.png",
            heroAlt: "Personal dashboard on an ultrawide curved monitor",
            accentGradient: "from-orange-500 to-amber-400",
            accentBg: "bg-orange-50",
            accentText: "text-international-orange",
            journeyStep: 1,
            journeyLabel: "You",
        },
        connections: [
            { targetId: "plan", relationship: "feeds into", description: "Your profile and updates keep you informed as you plan what to build next." },
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
        tagline: "From vision to action",
        description: "Map your strategy, set objectives, and break them into tasks. This is where you decide what to build and when.",
        valueProps: [
            { title: "Strategy first", text: "Start with the big picture — map where you're going before deciding how to get there." },
            { title: "Cascading goals", text: "Objectives break into tasks automatically. Every piece of work traces back to a strategic goal." },
            { title: "Clear priorities", text: "See what matters most and allocate your team's time to the highest-impact work." },
        ],
        visual: {
            heroImage: "/images/sections/plan-hero.png",
            heroAlt: "Strategic roadmap on a conference room display",
            accentGradient: "from-orange-500 to-blue-500",
            accentBg: "bg-blue-50",
            accentText: "text-electric-blue",
            journeyStep: 2,
            journeyLabel: "Plan",
        },
        connections: [
            { targetId: "me", relationship: "informed by", description: "Your updates and profile context help shape what you plan." },
            { targetId: "workshop", relationship: "drives", description: "Plans become real work in the Workshop — tasks flow to your team and forge." },
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
        id: "workshop",
        label: "Workshop",
        introRoute: "/workshop",
        tagline: "Where the work happens",
        description: "Your team, your AI agents, and The Forge — the tools you need to turn plans into reality.",
        valueProps: [
            { title: "The Forge", text: "Scan any product idea and get a full engineering dossier — 3D CAD models, specs, and build plans." },
            { title: "Human + AI teams", text: "Your people and AI agents work side by side. Assign tasks, track capacity, and move fast." },
            { title: "Prompt engineering", text: "Build, chain, and reuse prompt workflows that make your AI agents more effective over time." },
        ],
        visual: {
            heroImage: "/images/sections/workshop-hero.png",
            heroAlt: "Engineer and robotic arm in a modern manufacturing workshop",
            accentGradient: "from-orange-600 to-amber-500",
            accentBg: "bg-orange-50",
            accentText: "text-international-orange",
            journeyStep: 3,
            journeyLabel: "Build",
        },
        connections: [
            { targetId: "plan", relationship: "executes", description: "Workshop is where planned tasks get done — by your team, your agents, or The Forge." },
            { targetId: "marketplace", relationship: "sources from", description: "Need more people or supplies? The Marketplace plugs directly into your workshop." },
        ],
        features: [
            {
                name: "The Forge",
                description: "Scan an idea into a buildable engineering dossier with 3D CAD models",
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
                name: "Agents",
                description: "Prompt workflows — build, chain, and copy prompts",
                route: "/agents",
                icon: Bot,
                addedAt: new Date("2026-02-01"),
            },
        ],
    },
    {
        id: "marketplace",
        label: "Marketplace",
        introRoute: "/marketplace-hub",
        tagline: "Recruits and supplies",
        description: "Find people, services, and inspiration. The Guild connects you with talent; the Marketplace connects you with suppliers.",
        valueProps: [
            { title: "Find talent", text: "The Guild is where engineers, designers, and specialists come together. Find your next hire or apprentice." },
            { title: "Source supplies", text: "Browse products, services, and expert consultants. Place orders and track delivery." },
            { title: "Get inspired", text: "Discover what others are building and find ideas for your next project." },
        ],
        visual: {
            heroImage: "/images/sections/marketplace-hero.png",
            heroAlt: "People collaborating in a modern coworking space",
            accentGradient: "from-orange-500 to-teal-400",
            accentBg: "bg-teal-50",
            accentText: "text-teal-600",
            journeyStep: 4,
            journeyLabel: "Scale",
        },
        connections: [
            { targetId: "workshop", relationship: "supplies", description: "People and products from the Marketplace flow into your Workshop to get things built." },
            { targetId: "me", relationship: "grows", description: "Your marketplace activity, reputation, and orders all feed back to your profile." },
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
                name: "Inspiration",
                description: "Get ideas on what to do next and discover opportunities",
                route: "/inspiration",
                icon: Lightbulb,
                addedAt: new Date("2026-02-07"),
            },
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
