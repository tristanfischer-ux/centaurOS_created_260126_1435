import type { WorkflowTemplate } from "./agent-types"

/**
 * Pre-built workflow templates that users can load onto the canvas.
 * 7 startup-focused + 7 general business.
 *
 * Node positions are calculated to create a clean vertical flow with 200px spacing.
 */

const NODE_X = 300
const NODE_START_Y = 50
const NODE_SPACING_Y = 160

function makeNodes(
    promptIds: string[],
    labels: string[],
    categories: string[],
    icons: string[]
) {
    return promptIds.map((id, i) => ({
        id: `node-${i}`,
        type: "prompt" as const,
        position: { x: NODE_X, y: NODE_START_Y + i * NODE_SPACING_Y },
        data: {
            promptId: id,
            label: labels[i],
            description: "",
            category: categories[i] as never,
            icon: icons[i],
        },
    }))
}

function makeEdges(count: number) {
    return Array.from({ length: count - 1 }, (_, i) => ({
        id: `edge-${i}`,
        source: `node-${i}`,
        target: `node-${i + 1}`,
        animated: true,
    }))
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
    // ── Startup Templates ──────────────────────────────────────────
    {
        id: "seed-round-fundraise",
        name: "Seed Round Fundraise",
        description:
            "The full raise pipeline: from vision to post-raise comms. Takes you from articulating your story through financial projections, pitch deck creation, investor prep, outreach, due diligence, and post-raise announcements.",
        category: "startup",
        icon: "TrendingUp",
        nodeCount: 8,
        nodes: makeNodes(
            [
                "startup-vision-mission",
                "startup-market-sizing",
                "fundraising-financial-projections",
                "fundraising-pitch-deck",
                "fundraising-investor-qa",
                "fundraising-warm-intro",
                "fundraising-due-diligence",
                "fundraising-post-raise",
            ],
            [
                "Vision & Mission",
                "Market Sizing (TAM/SAM/SOM)",
                "3-Year Financial Projections",
                "Pitch Deck Narrative",
                "Investor Q&A Prep",
                "Warm Intro Emails",
                "Due Diligence Prep",
                "Post-Raise Comms",
            ],
            [
                "startup-strategy",
                "startup-strategy",
                "fundraising",
                "fundraising",
                "fundraising",
                "fundraising",
                "fundraising",
                "fundraising",
            ],
            [
                "Sparkles",
                "PieChart",
                "TrendingUp",
                "Presentation",
                "HelpCircle",
                "UserPlus",
                "ClipboardCheck",
                "PartyPopper",
            ]
        ),
        edges: makeEdges(8),
    },
    {
        id: "go-to-market-launch",
        name: "Go-to-Market Launch",
        description:
            "From product-market fit assessment through to your first paying customers. Covers GTM strategy, landing page, product descriptions, social media, and email campaigns.",
        category: "startup",
        icon: "Rocket",
        nodeCount: 7,
        nodes: makeNodes(
            [
                "startup-pmf-assessment",
                "startup-first-100-customers",
                "startup-gtm-strategy",
                "marketing-landing-page",
                "marketing-product-description",
                "marketing-social-media",
                "marketing-email-campaign",
            ],
            [
                "Product-Market Fit Assessment",
                "First 100 Customers Plan",
                "Go-to-Market Strategy",
                "Landing Page Copy",
                "Product Descriptions",
                "Social Media Posts",
                "Email Campaign",
            ],
            [
                "startup-strategy",
                "startup-strategy",
                "startup-strategy",
                "marketing",
                "marketing",
                "marketing",
                "marketing",
            ],
            [
                "CheckCircle",
                "UserPlus",
                "Target",
                "Layout",
                "ShoppingBag",
                "Share2",
                "Mail",
            ]
        ),
        edges: makeEdges(7),
    },
    {
        id: "startup-operating-rhythm",
        name: "Startup Operating Rhythm",
        description:
            "The recurring cadence every startup needs: set OKRs, plan 90 days, run weekly standups, track metrics, and keep the board and investors informed.",
        category: "startup",
        icon: "RefreshCcw",
        nodeCount: 6,
        nodes: makeNodes(
            [
                "startup-okr-writer",
                "startup-90-day-plan",
                "startup-weekly-standup",
                "startup-metrics-dashboard",
                "startup-board-update",
                "fundraising-investor-update",
            ],
            [
                "Quarterly OKRs",
                "90-Day Execution Plan",
                "Weekly Standup",
                "Metrics Dashboard",
                "Board Update Email",
                "Investor Update Email",
            ],
            [
                "startup-strategy",
                "startup-strategy",
                "startup-strategy",
                "startup-strategy",
                "startup-strategy",
                "fundraising",
            ],
            [
                "Target",
                "Map",
                "Calendar",
                "BarChart3",
                "Mail",
                "Mail",
            ]
        ),
        edges: makeEdges(6),
    },
    {
        id: "startup-business-plan",
        name: "Startup Business Plan",
        description:
            "Build a complete business plan from scratch: business model canvas, lean canvas, competitive analysis, unit economics, market sizing, growth strategy, and written plan.",
        category: "startup",
        icon: "FileText",
        nodeCount: 7,
        nodes: makeNodes(
            [
                "startup-business-model-canvas",
                "startup-lean-canvas",
                "startup-competitive-moat",
                "startup-unit-economics",
                "startup-market-sizing",
                "strategy-growth-framework",
                "strategy-business-plan",
            ],
            [
                "Business Model Canvas",
                "Lean Canvas",
                "Competitive Moat Analysis",
                "Unit Economics",
                "Market Sizing",
                "Growth Strategy",
                "Business Plan Writer",
            ],
            [
                "startup-strategy",
                "startup-strategy",
                "startup-strategy",
                "startup-strategy",
                "startup-strategy",
                "strategy",
                "strategy",
            ],
            [
                "LayoutGrid",
                "Layers",
                "Shield",
                "Calculator",
                "PieChart",
                "TrendingUp",
                "FileText",
            ]
        ),
        edges: makeEdges(7),
    },
    {
        id: "pivot-decision",
        name: "Pivot Decision Framework",
        description:
            "When metrics suggest something needs to change: analyze current performance, assess product-market fit, explore pivot options, map competitors, plan scenarios, and create a new 90-day plan.",
        category: "startup",
        icon: "RefreshCcw",
        nodeCount: 6,
        nodes: makeNodes(
            [
                "startup-metrics-dashboard",
                "startup-pmf-assessment",
                "startup-pivot-analysis",
                "strategy-competitive-landscape",
                "strategy-scenario-planner",
                "startup-90-day-plan",
            ],
            [
                "Metrics Dashboard",
                "Product-Market Fit Check",
                "Pivot Analysis",
                "Competitive Landscape",
                "Scenario Planning",
                "New 90-Day Plan",
            ],
            [
                "startup-strategy",
                "startup-strategy",
                "startup-strategy",
                "strategy",
                "strategy",
                "startup-strategy",
            ],
            [
                "BarChart3",
                "CheckCircle",
                "RefreshCcw",
                "Map",
                "GitBranch",
                "Map",
            ]
        ),
        edges: makeEdges(6),
    },

    // ── Awesome-CEO Inspired Templates ─────────────────────────────
    {
        id: "cash-crisis-playbook",
        name: "Cash Crisis Playbook",
        description:
            "When runway gets short, act fast. Based on Sequoia's 'Adapting to Endure' framework: assess cash position, plan crisis response, model scenarios, renegotiate vendors, and communicate with board and team.",
        category: "startup",
        icon: "ShieldAlert",
        nodeCount: 6,
        nodes: makeNodes(
            [
                "finance-cash-flow",
                "strategy-crisis-response",
                "strategy-scenario-planner",
                "finance-procurement",
                "strategy-board-presentation",
                "startup-90-day-plan",
            ],
            [
                "Cash Flow Assessment",
                "Crisis Response Plan",
                "Scenario Planning",
                "Vendor Renegotiation",
                "Board Communication",
                "Recovery 90-Day Plan",
            ],
            [
                "finance",
                "strategy",
                "strategy",
                "finance",
                "strategy",
                "startup-strategy",
            ],
            [
                "DollarSign",
                "ShieldAlert",
                "GitBranch",
                "Handshake",
                "Presentation",
                "Map",
            ]
        ),
        edges: makeEdges(6),
    },
    {
        id: "pitch-deck-creation",
        name: "Pitch Deck Creation",
        description:
            "Build an investor-ready pitch deck from scratch: size your market, analyze your competitive moat, build financial projections, craft the narrative slide by slide, get expert review, and prepare for investor Q&A.",
        category: "startup",
        icon: "Presentation",
        nodeCount: 6,
        nodes: makeNodes(
            [
                "startup-market-sizing",
                "startup-competitive-moat",
                "fundraising-financial-projections",
                "fundraising-pitch-deck",
                "fundraising-pitch-deck-reviewer",
                "fundraising-investor-qa",
            ],
            [
                "Market Sizing (TAM/SAM/SOM)",
                "Competitive Moat Analysis",
                "3-Year Financial Projections",
                "Pitch Deck Narrative",
                "Deck Review & Scoring",
                "Investor Q&A Prep",
            ],
            [
                "startup-strategy",
                "startup-strategy",
                "fundraising",
                "fundraising",
                "fundraising",
                "fundraising",
            ],
            [
                "PieChart",
                "Shield",
                "TrendingUp",
                "Presentation",
                "CheckCircle",
                "HelpCircle",
            ]
        ),
        edges: makeEdges(6),
    },

    // ── General Business Templates ──────────────────────────────────
    {
        id: "product-launch-campaign",
        name: "Product Launch Campaign",
        description:
            "Launch a product with a complete campaign: from product brief to image generation, social media, email, landing page, and LinkedIn post.",
        category: "business",
        icon: "Megaphone",
        nodeCount: 6,
        nodes: makeNodes(
            [
                "marketing-product-description",
                "creative-image-prompt",
                "marketing-social-media",
                "marketing-email-campaign",
                "marketing-landing-page",
                "marketing-ad-copy",
            ],
            [
                "Product Description",
                "AI Image Prompts",
                "Social Media Posts",
                "Email Campaign",
                "Landing Page Copy",
                "Ad Copy",
            ],
            [
                "marketing",
                "creative",
                "marketing",
                "marketing",
                "marketing",
                "marketing",
            ],
            [
                "ShoppingBag",
                "Image",
                "Share2",
                "Mail",
                "Layout",
                "Megaphone",
            ]
        ),
        edges: makeEdges(6),
    },
    {
        id: "content-marketing-pipeline",
        name: "Content Marketing Pipeline",
        description:
            "Create a full content pipeline: from topic research and blog writing through SEO, social repurposing, email newsletter, and analytics.",
        category: "business",
        icon: "FileText",
        nodeCount: 6,
        nodes: makeNodes(
            [
                "marketing-content-calendar",
                "marketing-blog-post",
                "marketing-seo-meta",
                "marketing-social-media",
                "marketing-email-campaign",
                "data-story-narrator",
            ],
            [
                "Content Calendar",
                "Blog Post",
                "SEO Optimization",
                "Social Media Repurposing",
                "Email Newsletter",
                "Analytics Narrative",
            ],
            [
                "marketing",
                "marketing",
                "marketing",
                "marketing",
                "marketing",
                "data-analytics",
            ],
            [
                "Calendar",
                "FileText",
                "Search",
                "Share2",
                "Mail",
                "BookOpen",
            ]
        ),
        edges: makeEdges(6),
    },
    {
        id: "sales-outreach-sequence",
        name: "Sales Outreach Sequence",
        description:
            "Build a complete sales pipeline: qualify leads, write cold outreach, handle objections, create proposals, write case studies.",
        category: "business",
        icon: "Send",
        nodeCount: 6,
        nodes: makeNodes(
            [
                "sales-lead-qualification",
                "sales-cold-outreach",
                "sales-objection-handler",
                "sales-demo-script",
                "sales-proposal",
                "sales-case-study",
            ],
            [
                "Lead Qualification",
                "Cold Outreach",
                "Objection Handling",
                "Demo Script",
                "Proposal",
                "Case Study",
            ],
            ["sales", "sales", "sales", "sales", "sales", "sales"],
            [
                "Filter",
                "Send",
                "MessageCircle",
                "Monitor",
                "FileText",
                "BookOpen",
            ]
        ),
        edges: makeEdges(6),
    },
    {
        id: "hiring-pipeline",
        name: "Hiring Pipeline",
        description:
            "End-to-end hiring: write job descriptions, create interview questions, build scoring rubrics, design compensation packages, and plan onboarding.",
        category: "business",
        icon: "Users",
        nodeCount: 5,
        nodes: makeNodes(
            [
                "hr-job-description",
                "hr-interview-questions",
                "hr-compensation",
                "hr-onboarding",
                "hr-culture",
            ],
            [
                "Job Description",
                "Interview Questions",
                "Compensation Benchmark",
                "Onboarding Checklist",
                "Culture Statement",
            ],
            ["hr", "hr", "hr", "hr", "hr"],
            [
                "Briefcase",
                "HelpCircle",
                "DollarSign",
                "ListChecks",
                "Heart",
            ]
        ),
        edges: makeEdges(5),
    },
    {
        id: "quarterly-business-review",
        name: "Quarterly Business Review",
        description:
            "Prepare a complete QBR: KPI dashboard, financial summary, SWOT analysis, OKR progress, and board presentation.",
        category: "business",
        icon: "Presentation",
        nodeCount: 5,
        nodes: makeNodes(
            [
                "finance-kpi-dashboard",
                "finance-model-narrator",
                "strategy-swot",
                "strategy-okr",
                "strategy-board-presentation",
            ],
            [
                "KPI Dashboard",
                "Financial Summary",
                "SWOT Analysis",
                "OKR Progress",
                "Board Presentation",
            ],
            ["finance", "finance", "strategy", "strategy", "strategy"],
            [
                "BarChart3",
                "Calculator",
                "Grid3x3",
                "Target",
                "Presentation",
            ]
        ),
        edges: makeEdges(5),
    },
    {
        id: "customer-onboarding",
        name: "Customer Onboarding",
        description:
            "Design a complete customer onboarding experience: personas, FAQs, email sequences, health scoring, and satisfaction tracking.",
        category: "business",
        icon: "Heart",
        nodeCount: 5,
        nodes: makeNodes(
            [
                "product-persona",
                "cs-faq",
                "cs-onboarding-emails",
                "cs-health-scorer",
                "cs-nps-response",
            ],
            [
                "User Personas",
                "FAQ Generator",
                "Onboarding Emails",
                "Health Scoring",
                "NPS Responses",
            ],
            [
                "product",
                "customer-success",
                "customer-success",
                "customer-success",
                "customer-success",
            ],
            [
                "UserCircle",
                "HelpCircle",
                "Inbox",
                "Activity",
                "ThumbsUp",
            ]
        ),
        edges: makeEdges(5),
    },
    {
        id: "brand-launch",
        name: "Brand Launch",
        description:
            "Launch a brand from scratch: vision and mission, brand voice, visual identity, landing page, press release, and social media visuals.",
        category: "business",
        icon: "Palette",
        nodeCount: 6,
        nodes: makeNodes(
            [
                "startup-vision-mission",
                "marketing-brand-voice",
                "creative-brand-identity",
                "marketing-landing-page",
                "marketing-press-release",
                "creative-social-visual",
            ],
            [
                "Vision & Mission",
                "Brand Voice Guide",
                "Brand Identity Brief",
                "Landing Page Copy",
                "Press Release",
                "Social Media Visuals",
            ],
            [
                "startup-strategy",
                "marketing",
                "creative",
                "marketing",
                "marketing",
                "creative",
            ],
            [
                "Sparkles",
                "MessageSquare",
                "Palette",
                "Layout",
                "Newspaper",
                "ImageIcon",
            ]
        ),
        edges: makeEdges(6),
    },
]
