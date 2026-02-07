import type { WorkflowTemplate, WorkflowNode, WorkflowNodeType } from "./agent-types"

/**
 * Pre-built workflow templates that users can load onto the canvas.
 * 7 startup-focused + 7 general business.
 *
 * Every template follows a people-first pattern:
 * - START with a human briefing step (gather context, set direction)
 * - MIDDLE includes a human checkpoint (review, align, decide)
 * - END with a human action step (present, send, launch)
 *
 * Node positions are calculated to create a clean vertical flow with 160px spacing.
 */

const NODE_X = 300
const NODE_START_Y = 50
const NODE_SPACING_Y = 160

// ─── Node definition types ──────────────────────────────────────────

interface PromptStep {
    type: "prompt"
    promptId: string
    label: string
    category: string
    icon: string
}

interface HumanStep {
    type: "human-task"
    label: string
    guidance: string
    checklist: string[]
}

type StepDefinition = PromptStep | HumanStep

// ─── Helper: build mixed node + edge arrays ─────────────────────────

function buildTemplate(steps: StepDefinition[]): {
    nodes: WorkflowNode[]
    edges: { id: string; source: string; target: string; animated: boolean }[]
} {
    const nodes: WorkflowNode[] = steps.map((step, i) => {
        const base = {
            id: `node-${i}`,
            position: { x: NODE_X, y: NODE_START_Y + i * NODE_SPACING_Y },
        }

        if (step.type === "human-task") {
            return {
                ...base,
                type: "human-task" as WorkflowNodeType,
                data: {
                    label: step.label,
                    description: step.guidance,
                    isHumanTask: true,
                    guidance: step.guidance,
                    checklist: step.checklist,
                    checklistCompleted: new Array(step.checklist.length).fill(false),
                },
            }
        }

        return {
            ...base,
            type: "prompt" as WorkflowNodeType,
            data: {
                promptId: step.promptId,
                label: step.label,
                description: "",
                category: step.category as never,
                icon: step.icon,
            },
        }
    })

    const edges = Array.from({ length: steps.length - 1 }, (_, i) => ({
        id: `edge-${i}`,
        source: `node-${i}`,
        target: `node-${i + 1}`,
        animated: true,
    }))

    return { nodes, edges }
}

// ─── Templates ──────────────────────────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
    // ── Startup Templates ──────────────────────────────────────────
    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Gather your fundraising context",
                guidance: "Before the workflow runs, pull together the key information your team needs to tell a compelling fundraising story.",
                checklist: [
                    "Company stage, traction metrics, and team bios",
                    "Target raise amount and use-of-funds plan",
                    "Current cap table and previous funding history",
                    "List of target investors and warm connections",
                ],
            },
            { type: "prompt", promptId: "startup-vision-mission", label: "Vision & Mission", category: "startup-strategy", icon: "Sparkles" },
            { type: "prompt", promptId: "startup-market-sizing", label: "Market Sizing (TAM/SAM/SOM)", category: "startup-strategy", icon: "PieChart" },
            { type: "prompt", promptId: "fundraising-financial-projections", label: "3-Year Financial Projections", category: "fundraising", icon: "TrendingUp" },
            {
                type: "human-task",
                label: "Review numbers with your co-founder",
                guidance: "Pause here and review the generated projections and market sizing with your co-founder or finance lead. Validate assumptions before building the pitch deck.",
                checklist: [
                    "Revenue assumptions are realistic and defensible",
                    "Market sizing matches your actual target segments",
                    "Financial model aligns with your burn rate and runway",
                ],
            },
            { type: "prompt", promptId: "fundraising-pitch-deck", label: "Pitch Deck Narrative", category: "fundraising", icon: "Presentation" },
            { type: "prompt", promptId: "fundraising-investor-qa", label: "Investor Q&A Prep", category: "fundraising", icon: "HelpCircle" },
            { type: "prompt", promptId: "fundraising-warm-intro", label: "Warm Intro Emails", category: "fundraising", icon: "UserPlus" },
            { type: "prompt", promptId: "fundraising-due-diligence", label: "Due Diligence Prep", category: "fundraising", icon: "ClipboardCheck" },
            { type: "prompt", promptId: "fundraising-post-raise", label: "Post-Raise Comms", category: "fundraising", icon: "PartyPopper" },
            {
                type: "human-task",
                label: "Rehearse and send",
                guidance: "Practice your pitch with your team, personalize the intro emails for each investor, and schedule your first meetings.",
                checklist: [
                    "Rehearse pitch with at least 2 friendly advisors",
                    "Personalise each warm intro email",
                    "Schedule first 5 investor meetings",
                    "Prepare data room with due diligence materials",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "seed-round-fundraise",
            name: "Seed Round Fundraise",
            description: "The full raise pipeline: from gathering your story through financial projections, pitch deck creation, investor prep, outreach, and post-raise announcements.",
            category: "startup" as const,
            icon: "TrendingUp",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define your ICP and positioning",
                guidance: "Before building your go-to-market plan, align your team on who you are targeting and how you want to be positioned.",
                checklist: [
                    "Define your ideal customer profile (industry, size, role)",
                    "Articulate your core value proposition in one sentence",
                    "List your top 3 differentiators vs. alternatives",
                ],
            },
            { type: "prompt", promptId: "startup-pmf-assessment", label: "Product-Market Fit Assessment", category: "startup-strategy", icon: "CheckCircle" },
            { type: "prompt", promptId: "startup-first-100-customers", label: "First 100 Customers Plan", category: "startup-strategy", icon: "UserPlus" },
            { type: "prompt", promptId: "startup-gtm-strategy", label: "Go-to-Market Strategy", category: "startup-strategy", icon: "Target" },
            {
                type: "human-task",
                label: "Test messaging with 5 customers",
                guidance: "Share the generated GTM strategy and landing page copy with real prospects. Their feedback is worth more than any model.",
                checklist: [
                    "Share landing page copy with 5 target customers",
                    "Collect feedback on messaging clarity and appeal",
                    "Adjust positioning based on what resonated",
                ],
            },
            { type: "prompt", promptId: "marketing-landing-page", label: "Landing Page Copy", category: "marketing", icon: "Layout" },
            { type: "prompt", promptId: "marketing-product-description", label: "Product Descriptions", category: "marketing", icon: "ShoppingBag" },
            { type: "prompt", promptId: "marketing-social-media", label: "Social Media Posts", category: "marketing", icon: "Share2" },
            { type: "prompt", promptId: "marketing-email-campaign", label: "Email Campaign", category: "marketing", icon: "Mail" },
            {
                type: "human-task",
                label: "Launch checklist and go-live",
                guidance: "Run through the final launch checklist with your team. Make sure everything is ready before you go live.",
                checklist: [
                    "Landing page is live and tested on mobile",
                    "Email sequences are loaded and tested",
                    "Social posts are scheduled across all channels",
                    "Team is aligned on launch day responsibilities",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "go-to-market-launch",
            name: "Go-to-Market Launch",
            description: "From product-market fit assessment through to your first paying customers. Covers GTM strategy, landing page, product descriptions, social media, and email campaigns.",
            category: "startup" as const,
            icon: "Rocket",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Set quarterly priorities with leadership",
                guidance: "Before generating your OKRs, align with your leadership team on the top 3 priorities for this quarter.",
                checklist: [
                    "Review last quarter's results with the team",
                    "Identify the top 3 priorities for this quarter",
                    "Gather input from department leads",
                ],
            },
            { type: "prompt", promptId: "startup-okr-writer", label: "Quarterly OKRs", category: "startup-strategy", icon: "Target" },
            { type: "prompt", promptId: "startup-90-day-plan", label: "90-Day Execution Plan", category: "startup-strategy", icon: "Map" },
            { type: "prompt", promptId: "startup-weekly-standup", label: "Weekly Standup", category: "startup-strategy", icon: "Calendar" },
            {
                type: "human-task",
                label: "Review metrics with your team",
                guidance: "Walk through the metrics dashboard and standup template with your team leads. Adjust the cadence to match your team's rhythm.",
                checklist: [
                    "Review metrics with each department lead",
                    "Agree on weekly standup format and timing",
                    "Set up shared dashboard for real-time tracking",
                ],
            },
            { type: "prompt", promptId: "startup-metrics-dashboard", label: "Metrics Dashboard", category: "startup-strategy", icon: "BarChart3" },
            { type: "prompt", promptId: "startup-board-update", label: "Board Update Email", category: "startup-strategy", icon: "Mail" },
            { type: "prompt", promptId: "fundraising-investor-update", label: "Investor Update Email", category: "fundraising", icon: "Mail" },
            {
                type: "human-task",
                label: "Send updates and collect feedback",
                guidance: "Personalise the board and investor updates with your own insights, then send them and track any questions that come back.",
                checklist: [
                    "Add personal commentary to board update",
                    "Send investor update to all shareholders",
                    "Track any questions or follow-up requests",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "startup-operating-rhythm",
            name: "Startup Operating Rhythm",
            description: "The recurring cadence every startup needs: set OKRs, plan 90 days, run weekly standups, track metrics, and keep the board and investors informed.",
            category: "startup" as const,
            icon: "RefreshCcw",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Collect market research and data",
                guidance: "Gather the raw inputs your business plan needs: market data, competitive intelligence, financial actuals, and customer research.",
                checklist: [
                    "Compile industry reports and market data",
                    "List top 5 competitors with their positioning",
                    "Gather your actual financial data (revenue, costs, runway)",
                    "Summarise customer feedback and validation results",
                ],
            },
            { type: "prompt", promptId: "startup-business-model-canvas", label: "Business Model Canvas", category: "startup-strategy", icon: "LayoutGrid" },
            { type: "prompt", promptId: "startup-lean-canvas", label: "Lean Canvas", category: "startup-strategy", icon: "Layers" },
            { type: "prompt", promptId: "startup-competitive-moat", label: "Competitive Moat Analysis", category: "startup-strategy", icon: "Shield" },
            {
                type: "human-task",
                label: "Validate assumptions with advisors",
                guidance: "Share the business model canvas and competitive analysis with 2-3 trusted advisors. Challenge every assumption.",
                checklist: [
                    "Share canvases with at least 2 advisors",
                    "Flag and resolve questionable assumptions",
                    "Update competitive positioning based on feedback",
                ],
            },
            { type: "prompt", promptId: "startup-unit-economics", label: "Unit Economics", category: "startup-strategy", icon: "Calculator" },
            { type: "prompt", promptId: "startup-market-sizing", label: "Market Sizing", category: "startup-strategy", icon: "PieChart" },
            { type: "prompt", promptId: "strategy-growth-framework", label: "Growth Strategy", category: "strategy", icon: "TrendingUp" },
            { type: "prompt", promptId: "strategy-business-plan", label: "Business Plan Writer", category: "strategy", icon: "FileText" },
            {
                type: "human-task",
                label: "Present plan to stakeholders",
                guidance: "Walk your co-founders, advisors, or board through the completed business plan. Gather sign-off before executing.",
                checklist: [
                    "Schedule presentation with key stakeholders",
                    "Prepare summary deck of key findings",
                    "Collect feedback and final sign-off",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "startup-business-plan",
            name: "Startup Business Plan",
            description: "Build a complete business plan from scratch: business model canvas, lean canvas, competitive analysis, unit economics, market sizing, growth strategy, and written plan.",
            category: "startup" as const,
            icon: "FileText",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Gather team signals and data",
                guidance: "Before analysing a potential pivot, collect the signals from your team and customers that suggest change is needed.",
                checklist: [
                    "Export current metrics (churn, NPS, activation, revenue)",
                    "Collect qualitative feedback from customer-facing team",
                    "Document what's working and what's not",
                ],
            },
            { type: "prompt", promptId: "startup-metrics-dashboard", label: "Metrics Dashboard", category: "startup-strategy", icon: "BarChart3" },
            { type: "prompt", promptId: "startup-pmf-assessment", label: "Product-Market Fit Check", category: "startup-strategy", icon: "CheckCircle" },
            { type: "prompt", promptId: "startup-pivot-analysis", label: "Pivot Analysis", category: "startup-strategy", icon: "RefreshCcw" },
            {
                type: "human-task",
                label: "Discuss options with leadership",
                guidance: "This is a major decision. Review the pivot analysis with your co-founders and key leaders before committing to a direction.",
                checklist: [
                    "Review pivot options with co-founders",
                    "Assess team capability for each option",
                    "Evaluate financial implications of each path",
                    "Make a go/no-go decision as a leadership team",
                ],
            },
            { type: "prompt", promptId: "strategy-competitive-landscape", label: "Competitive Landscape", category: "strategy", icon: "Map" },
            { type: "prompt", promptId: "strategy-scenario-planner", label: "Scenario Planning", category: "strategy", icon: "GitBranch" },
            { type: "prompt", promptId: "startup-90-day-plan", label: "New 90-Day Plan", category: "startup-strategy", icon: "Map" },
            {
                type: "human-task",
                label: "Communicate decision to team",
                guidance: "Once you've decided, communicate the pivot (or the decision to stay the course) clearly to your entire team.",
                checklist: [
                    "Prepare all-hands talking points",
                    "Brief individual team leads first",
                    "Send written communication to full team",
                    "Set up weekly check-ins to track pivot progress",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "pivot-decision",
            name: "Pivot Decision Framework",
            description: "When metrics suggest something needs to change: analyse current performance, assess product-market fit, explore pivot options, map competitors, plan scenarios, and create a new 90-day plan.",
            category: "startup" as const,
            icon: "RefreshCcw",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Assess current cash position",
                guidance: "Before running the crisis playbook, get an honest picture of where you stand. Pull the real numbers.",
                checklist: [
                    "Export current bank balance and burn rate",
                    "List all upcoming payment obligations (30/60/90 days)",
                    "Calculate exact months of runway remaining",
                    "Identify top 5 largest expense line items",
                ],
            },
            { type: "prompt", promptId: "finance-cash-flow", label: "Cash Flow Assessment", category: "finance", icon: "DollarSign" },
            { type: "prompt", promptId: "strategy-crisis-response", label: "Crisis Response Plan", category: "strategy", icon: "Shield" },
            { type: "prompt", promptId: "strategy-scenario-planner", label: "Scenario Planning", category: "strategy", icon: "GitBranch" },
            {
                type: "human-task",
                label: "Align with board on approach",
                guidance: "A cash crisis requires board awareness. Share the analysis and get alignment on the response plan before executing.",
                checklist: [
                    "Brief board chair on the situation",
                    "Share crisis response plan with full board",
                    "Get board approval for cost-cutting measures",
                    "Agree on communication approach for team",
                ],
            },
            { type: "prompt", promptId: "finance-procurement", label: "Vendor Renegotiation", category: "finance", icon: "DollarSign" },
            { type: "prompt", promptId: "strategy-board-presentation", label: "Board Communication", category: "strategy", icon: "Presentation" },
            { type: "prompt", promptId: "startup-90-day-plan", label: "Recovery 90-Day Plan", category: "startup-strategy", icon: "Map" },
            {
                type: "human-task",
                label: "Execute and brief stakeholders",
                guidance: "Put the recovery plan into action. Communicate transparently with your team and investors.",
                checklist: [
                    "Execute immediate cost reductions",
                    "Send board update with action plan",
                    "Brief team on changes (be transparent)",
                    "Set weekly cash position check-ins",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "cash-crisis-playbook",
            name: "Cash Crisis Playbook",
            description: "When runway gets short, act fast. Assess cash position, plan crisis response, model scenarios, renegotiate vendors, and communicate with board and team.",
            category: "startup" as const,
            icon: "Shield",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Collect your story and metrics",
                guidance: "A great pitch deck starts with your real story. Gather the data and narrative elements that make your company unique.",
                checklist: [
                    "Write down your founding story in 3 sentences",
                    "Compile key traction metrics (MRR, users, growth rate)",
                    "List your team's relevant backgrounds",
                    "Define your ask (amount, use of funds, timeline)",
                ],
            },
            { type: "prompt", promptId: "startup-market-sizing", label: "Market Sizing (TAM/SAM/SOM)", category: "startup-strategy", icon: "PieChart" },
            { type: "prompt", promptId: "startup-competitive-moat", label: "Competitive Moat Analysis", category: "startup-strategy", icon: "Shield" },
            { type: "prompt", promptId: "fundraising-financial-projections", label: "3-Year Financial Projections", category: "fundraising", icon: "TrendingUp" },
            {
                type: "human-task",
                label: "Get feedback from advisors",
                guidance: "Before finalising the deck, share the narrative and projections with 2-3 advisors who have fundraising experience.",
                checklist: [
                    "Share draft narrative with 2 experienced advisors",
                    "Validate financial projections with your finance lead",
                    "Test your story arc: does it compel action?",
                ],
            },
            { type: "prompt", promptId: "fundraising-pitch-deck", label: "Pitch Deck Narrative", category: "fundraising", icon: "Presentation" },
            { type: "prompt", promptId: "fundraising-pitch-deck-reviewer", label: "Deck Review & Scoring", category: "fundraising", icon: "CheckCircle" },
            { type: "prompt", promptId: "fundraising-investor-qa", label: "Investor Q&A Prep", category: "fundraising", icon: "HelpCircle" },
            {
                type: "human-task",
                label: "Final review and practice",
                guidance: "Polish the final deck, rehearse the pitch, and prepare for tough questions.",
                checklist: [
                    "Do a full run-through with your co-founder",
                    "Time your pitch (aim for 15-20 minutes)",
                    "Practice answers to the top 10 tough questions",
                    "Get final design polish on slides",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "pitch-deck-creation",
            name: "Pitch Deck Creation",
            description: "Build an investor-ready pitch deck: size your market, analyse your competitive moat, build financial projections, craft the narrative, get expert review, and prepare for investor Q&A.",
            category: "startup" as const,
            icon: "Presentation",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    // ── General Business Templates ──────────────────────────────────
    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Brief: product details and audience",
                guidance: "Provide the product details, target audience, and campaign goals so the workflow can generate on-brand content.",
                checklist: [
                    "Write a product brief (features, benefits, pricing)",
                    "Define the target audience for this campaign",
                    "Set campaign goals (awareness, leads, sales)",
                    "Provide brand guidelines or tone of voice",
                ],
            },
            { type: "prompt", promptId: "marketing-product-description", label: "Product Description", category: "marketing", icon: "ShoppingBag" },
            { type: "prompt", promptId: "creative-image-prompt", label: "Image Prompts", category: "creative", icon: "Image" },
            { type: "prompt", promptId: "marketing-social-media", label: "Social Media Posts", category: "marketing", icon: "Share2" },
            {
                type: "human-task",
                label: "Review creative with stakeholders",
                guidance: "Share the generated creative (descriptions, social posts, images) with your marketing lead or brand team for feedback.",
                checklist: [
                    "Review product description for accuracy",
                    "Check social media posts match brand voice",
                    "Approve image direction and style",
                ],
            },
            { type: "prompt", promptId: "marketing-email-campaign", label: "Email Campaign", category: "marketing", icon: "Mail" },
            { type: "prompt", promptId: "marketing-landing-page", label: "Landing Page Copy", category: "marketing", icon: "Layout" },
            { type: "prompt", promptId: "marketing-ad-copy", label: "Ad Copy", category: "marketing", icon: "Megaphone" },
            {
                type: "human-task",
                label: "Approve final assets and schedule",
                guidance: "Give final approval on all campaign assets and schedule them for launch.",
                checklist: [
                    "Final review of all copy and creative",
                    "Schedule email sends and social posts",
                    "Set up landing page and tracking links",
                    "Brief the team on launch timeline",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "product-launch-campaign",
            name: "Product Launch Campaign",
            description: "Launch a product with a complete campaign: from product brief to social media, email, landing page, and ad copy.",
            category: "business" as const,
            icon: "Megaphone",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define content themes and goals",
                guidance: "Set the strategic direction for your content pipeline before generating anything.",
                checklist: [
                    "Identify 3-5 content themes for the quarter",
                    "Define target keywords and topics",
                    "Set content goals (traffic, leads, engagement)",
                ],
            },
            { type: "prompt", promptId: "marketing-content-calendar", label: "Content Calendar", category: "marketing", icon: "Calendar" },
            { type: "prompt", promptId: "marketing-blog-post", label: "Blog Post", category: "marketing", icon: "FileText" },
            { type: "prompt", promptId: "marketing-seo-meta", label: "SEO Optimisation", category: "marketing", icon: "Search" },
            {
                type: "human-task",
                label: "Editorial review and approvals",
                guidance: "Review the generated content with your editorial team. Check for accuracy, brand voice, and SEO quality.",
                checklist: [
                    "Fact-check all claims and statistics",
                    "Review for brand voice consistency",
                    "Verify SEO meta tags and keywords",
                ],
            },
            { type: "prompt", promptId: "marketing-social-media", label: "Social Media Repurposing", category: "marketing", icon: "Share2" },
            { type: "prompt", promptId: "marketing-email-campaign", label: "Email Newsletter", category: "marketing", icon: "Mail" },
            { type: "prompt", promptId: "data-story-narrator", label: "Analytics Narrative", category: "data-analytics", icon: "BookOpen" },
            {
                type: "human-task",
                label: "Publish and share with team",
                guidance: "Hit publish, share across channels, and let the team know what went live.",
                checklist: [
                    "Publish blog post and check formatting",
                    "Schedule social media posts",
                    "Send newsletter to subscriber list",
                    "Share published content with the team",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "content-marketing-pipeline",
            name: "Content Marketing Pipeline",
            description: "Create a full content pipeline: from topic research and blog writing through SEO, social repurposing, email newsletter, and analytics.",
            category: "business" as const,
            icon: "FileText",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define target accounts and personas",
                guidance: "Identify who you are selling to before generating outreach materials.",
                checklist: [
                    "Build a list of 20-50 target accounts",
                    "Define the buyer persona (role, pain points, goals)",
                    "Identify decision-makers vs. influencers",
                ],
            },
            { type: "prompt", promptId: "sales-lead-qualification", label: "Lead Qualification", category: "sales", icon: "Filter" },
            { type: "prompt", promptId: "sales-cold-outreach", label: "Cold Outreach", category: "sales", icon: "Send" },
            { type: "prompt", promptId: "sales-objection-handler", label: "Objection Handling", category: "sales", icon: "MessageCircle" },
            {
                type: "human-task",
                label: "Review messaging with sales lead",
                guidance: "Have your sales lead or most experienced rep review the outreach templates and objection handling scripts.",
                checklist: [
                    "Review cold outreach for tone and authenticity",
                    "Validate objection responses are accurate",
                    "Adjust language based on real sales conversations",
                ],
            },
            { type: "prompt", promptId: "sales-demo-script", label: "Demo Script", category: "sales", icon: "Monitor" },
            { type: "prompt", promptId: "sales-proposal", label: "Proposal", category: "sales", icon: "FileText" },
            { type: "prompt", promptId: "sales-case-study", label: "Case Study", category: "sales", icon: "BookOpen" },
            {
                type: "human-task",
                label: "Personalise and begin outreach",
                guidance: "Personalise each outreach message for the specific account and start your sequences.",
                checklist: [
                    "Personalise first 10 outreach emails",
                    "Load templates into your sales tool (e.g. HubSpot)",
                    "Set up follow-up sequences",
                    "Schedule first batch of sends",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "sales-outreach-sequence",
            name: "Sales Outreach Sequence",
            description: "Build a complete sales pipeline: qualify leads, write cold outreach, handle objections, create proposals, write case studies.",
            category: "business" as const,
            icon: "Send",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    // ─── Cold Email Outreach Pipeline (11x-Grade) ────────────────────────
    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define ICP & product context",
                guidance: "Before the AI can research and write, it needs to deeply understand what you're selling, who you're selling to, and what makes your offer compelling. The quality of this input directly determines the quality of every email downstream.",
                checklist: [
                    "Write a 2-3 sentence product description (what it does, for whom)",
                    "Define your Ideal Customer Profile (industry, company size, funding stage, role titles)",
                    "List your top 3 value propositions with supporting metrics",
                    "Provide 1-2 case study summaries (company name, challenge, result with numbers)",
                    "Specify tone preference (professional / casual / executive / technical)",
                    "Add prospect details: name, company, role, email, any known signals",
                ],
            },
            { type: "prompt", promptId: "outreach-prospect-research", label: "Prospect Deep Research", category: "sales", icon: "Search" },
            { type: "prompt", promptId: "outreach-lead-scoring", label: "Lead Scoring & Signals", category: "sales", icon: "BarChart3" },
            {
                type: "human-task",
                label: "Review scored leads",
                guidance: "Review the AI's research and scoring. Approve high-scoring leads for email generation, reject poor fits, and add any context the AI may have missed.",
                checklist: [
                    "Verify the research brief is factually accurate",
                    "Confirm the lead score feels right based on your domain knowledge",
                    "Check that the recommended approach angle aligns with your strategy",
                    "Add any insider knowledge the AI couldn't find (mutual connections, past interactions)",
                    "Decision: proceed with email generation or skip this prospect",
                ],
            },
            { type: "prompt", promptId: "outreach-personalization-strategy", label: "Personalization Strategy", category: "sales", icon: "UserCheck" },
            { type: "prompt", promptId: "outreach-email-sequence", label: "Email Sequence (4 emails)", category: "sales", icon: "Mail" },
            { type: "prompt", promptId: "outreach-subject-lines", label: "Subject Line Optimizer", category: "sales", icon: "Zap" },
            { type: "prompt", promptId: "outreach-qa-compliance", label: "QA & Compliance Check", category: "sales", icon: "ShieldCheck" },
            {
                type: "human-task",
                label: "Final review & send",
                guidance: "This is your last checkpoint before emails go out. Review every email for accuracy, tone, and personalisation quality. Your reputation is on the line.",
                checklist: [
                    "Read every email aloud — does it sound like a real person wrote it?",
                    "Verify all company/prospect references are accurate",
                    "Select preferred subject line variant for each email (or approve A/B test)",
                    "Review the QA report and address any flagged issues",
                    "Confirm send schedule and timing (best days: Tue-Thu, best time: 8-10am prospect's timezone)",
                    "Load emails into your sending tool and schedule the sequence",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "cold-email-outreach-pipeline",
            name: "Cold Email Outreach Pipeline",
            description: "11x-grade cold email system: deep prospect research, lead scoring, persona-adaptive personalization, 4-email sequence generation, subject line optimization, and deliverability QA. Achieves 50%+ open rates and 7%+ positive reply rates.",
            category: "business" as const,
            icon: "Send",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define role requirements with hiring manager",
                guidance: "Sit down with the hiring manager to define what they actually need. Great hiring starts with a clear brief.",
                checklist: [
                    "Define must-have vs. nice-to-have skills",
                    "Agree on seniority level and reporting line",
                    "Set compensation range and benefits",
                    "Define timeline for hiring",
                ],
            },
            { type: "prompt", promptId: "hr-job-description", label: "Job Description", category: "hr", icon: "Briefcase" },
            { type: "prompt", promptId: "hr-interview-questions", label: "Interview Questions", category: "hr", icon: "HelpCircle" },
            {
                type: "human-task",
                label: "Calibrate with interview panel",
                guidance: "Share the job description and interview questions with everyone who will be involved in the hiring process.",
                checklist: [
                    "Review job description with interview panel",
                    "Agree on scoring criteria for interviews",
                    "Assign interview stages to panel members",
                ],
            },
            { type: "prompt", promptId: "hr-compensation", label: "Compensation Benchmark", category: "hr", icon: "DollarSign" },
            { type: "prompt", promptId: "hr-onboarding", label: "Onboarding Checklist", category: "hr", icon: "ListChecks" },
            { type: "prompt", promptId: "hr-culture", label: "Culture Statement", category: "hr", icon: "Heart" },
            {
                type: "human-task",
                label: "Finalise offer and onboarding plan",
                guidance: "Once you have a candidate, finalise the offer details and make sure onboarding is ready.",
                checklist: [
                    "Prepare written offer with compensation details",
                    "Set up onboarding schedule for day 1 and week 1",
                    "Assign a buddy or mentor for the new hire",
                    "Prepare equipment and access credentials",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "hiring-pipeline",
            name: "Hiring Pipeline",
            description: "End-to-end hiring: write job descriptions, create interview questions, build scoring rubrics, design compensation packages, and plan onboarding.",
            category: "business" as const,
            icon: "Users",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Collect data from department leads",
                guidance: "A QBR is only as good as its data. Gather the numbers from each department before generating the review.",
                checklist: [
                    "Collect KPIs from each department lead",
                    "Export financial data (P&L, cash flow, ARR)",
                    "Gather OKR progress updates",
                    "Note key wins and challenges from the quarter",
                ],
            },
            { type: "prompt", promptId: "finance-kpi-dashboard", label: "KPI Dashboard", category: "finance", icon: "BarChart3" },
            { type: "prompt", promptId: "finance-model-narrator", label: "Financial Summary", category: "finance", icon: "Calculator" },
            { type: "prompt", promptId: "strategy-swot", label: "SWOT Analysis", category: "strategy", icon: "Grid3x3" },
            {
                type: "human-task",
                label: "Discuss findings with leadership",
                guidance: "Walk through the QBR materials with your leadership team before presenting to the board.",
                checklist: [
                    "Review KPIs and flag any concerning trends",
                    "Discuss SWOT findings and strategic implications",
                    "Agree on key messages for board presentation",
                ],
            },
            { type: "prompt", promptId: "strategy-okr", label: "OKR Progress", category: "strategy", icon: "Target" },
            { type: "prompt", promptId: "strategy-board-presentation", label: "Board Presentation", category: "strategy", icon: "Presentation" },
            {
                type: "human-task",
                label: "Present to board or all-hands",
                guidance: "Deliver the QBR to your board, investors, or team. Make it a conversation, not a monologue.",
                checklist: [
                    "Schedule and send calendar invite",
                    "Do a dry run of the presentation",
                    "Prepare for likely questions",
                    "Send follow-up summary after the meeting",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "quarterly-business-review",
            name: "Quarterly Business Review",
            description: "Prepare a complete QBR: KPI dashboard, financial summary, SWOT analysis, OKR progress, and board presentation.",
            category: "business" as const,
            icon: "Presentation",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Map your customer journey",
                guidance: "Before building onboarding materials, understand the journey your customers actually take.",
                checklist: [
                    "Map the current customer journey (sign-up to value)",
                    "Identify the biggest drop-off points",
                    "Talk to 3 recently onboarded customers about their experience",
                ],
            },
            { type: "prompt", promptId: "product-persona", label: "User Personas", category: "product", icon: "UserCircle" },
            { type: "prompt", promptId: "cs-faq", label: "FAQ Generator", category: "customer-success", icon: "HelpCircle" },
            {
                type: "human-task",
                label: "Review with customer success team",
                guidance: "Your CS team talks to customers daily. Review the generated materials with them before going live.",
                checklist: [
                    "Review personas with CS team for accuracy",
                    "Validate FAQs cover the real questions customers ask",
                    "Check onboarding email tone matches your brand",
                ],
            },
            { type: "prompt", promptId: "cs-onboarding-emails", label: "Onboarding Emails", category: "customer-success", icon: "Mail" },
            { type: "prompt", promptId: "cs-health-scorer", label: "Health Scoring", category: "customer-success", icon: "Activity" },
            { type: "prompt", promptId: "cs-nps-response", label: "NPS Responses", category: "customer-success", icon: "ThumbsUp" },
            {
                type: "human-task",
                label: "Launch onboarding and monitor",
                guidance: "Deploy the onboarding sequence and set up monitoring to track how new customers progress.",
                checklist: [
                    "Load onboarding emails into your email tool",
                    "Set up health scoring in your CS platform",
                    "Create dashboard to track onboarding completion",
                    "Schedule weekly review of onboarding metrics",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "customer-onboarding",
            name: "Customer Onboarding",
            description: "Design a complete customer onboarding experience: personas, FAQs, email sequences, health scoring, and satisfaction tracking.",
            category: "business" as const,
            icon: "Heart",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define brand values with founding team",
                guidance: "A brand is built by people, not tools. Start by aligning your founding team on what the brand stands for.",
                checklist: [
                    "Workshop core brand values with founders",
                    "Define brand personality (if your brand were a person)",
                    "Identify target audience and their aspirations",
                    "Gather visual inspiration and references",
                ],
            },
            { type: "prompt", promptId: "startup-vision-mission", label: "Vision & Mission", category: "startup-strategy", icon: "Sparkles" },
            { type: "prompt", promptId: "marketing-brand-voice", label: "Brand Voice Guide", category: "marketing", icon: "MessageSquare" },
            { type: "prompt", promptId: "creative-brand-identity", label: "Brand Identity Brief", category: "creative", icon: "Palette" },
            {
                type: "human-task",
                label: "Review identity with stakeholders",
                guidance: "Share the brand voice guide and identity brief with your team and key stakeholders. Brand should feel authentic to everyone.",
                checklist: [
                    "Share brand voice guide with team",
                    "Review identity brief with design team",
                    "Get sign-off from founders on brand direction",
                ],
            },
            { type: "prompt", promptId: "marketing-landing-page", label: "Landing Page Copy", category: "marketing", icon: "Layout" },
            { type: "prompt", promptId: "marketing-press-release", label: "Press Release", category: "marketing", icon: "Newspaper" },
            { type: "prompt", promptId: "creative-social-visual", label: "Social Media Visuals", category: "creative", icon: "ImageIcon" },
            {
                type: "human-task",
                label: "Approve final brand package",
                guidance: "Give final approval on all brand materials before launch. This is what the world will see.",
                checklist: [
                    "Final review of all brand materials",
                    "Approve landing page for launch",
                    "Schedule press release and social posts",
                    "Brief the team on new brand guidelines",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "brand-launch",
            name: "Brand Launch",
            description: "Launch a brand from scratch: vision and mission, brand voice, visual identity, landing page, press release, and social media visuals.",
            category: "business" as const,
            icon: "Palette",
            nodeCount: steps.length,
            nodes,
            edges,
        }
    })(),
]
