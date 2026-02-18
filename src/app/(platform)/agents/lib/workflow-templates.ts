import type { WorkflowTemplate, WorkflowNode, WorkflowNodeType } from "./agent-types"

/**
 * Pre-built workflow templates that users can load onto the canvas.
 * 8 startup-focused + 13 general business = 21 total.
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

// ─── Default provider/model for all AI nodes ────────────────────────
const DEFAULT_PROVIDER = "anthropic"
const DEFAULT_MODEL = "claude-sonnet-4-6"
const IMAGE_PROVIDER = "google"
const IMAGE_MODEL = "gemini-3-pro-image-preview"
const VIDEO_PROVIDER = "minimax"
const VIDEO_MODEL = "MiniMax-Hailuo-2.3"

// ─── Node definition types ──────────────────────────────────────────

interface PromptStep {
    type: "prompt"
    promptId: string
    label: string
    category: string
    icon: string
    /** Override provider (defaults to Anthropic Claude Opus 4.6) */
    providerId?: string
    /** Override model ID */
    modelId?: string
    /** Override output modality (defaults to "text") */
    outputModality?: string
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
                providerId: step.providerId ?? DEFAULT_PROVIDER,
                modelId: step.modelId ?? DEFAULT_MODEL,
                outputModality: step.outputModality ?? "text",
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
                guidance: "Before the workflow runs, pull together the key information your team needs to tell a compelling fundraising story.\n\nOnce you've completed the checklist, open the next step (Vision & Mission) and paste your company details, metrics, and story into its Input Data field — this powers all the AI-generated content that follows.",
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
                guidance: "The previous steps generated your Vision & Mission, Market Sizing, and Financial Projections. Click each step above to review the outputs.\n\nValidate assumptions with your co-founder or finance lead before building the pitch deck. You can edit any output directly — corrections will carry forward to the next steps.",
                checklist: [
                    "Revenue assumptions are realistic and defensible",
                    "Market sizing matches your actual target segments",
                    "Financial model aligns with your burn rate and runway",
                ],
            },
            { type: "prompt", promptId: "fundraising-pitch-deck", label: "Pitch Deck Narrative", category: "fundraising", icon: "Presentation" },
            { type: "prompt", promptId: "visual-slide-generator", label: "Pitch Deck Slide Visuals", category: "creative", icon: "Image", providerId: IMAGE_PROVIDER, modelId: IMAGE_MODEL, outputModality: "image" },
            { type: "prompt", promptId: "fundraising-investor-qa", label: "Investor Q&A Prep", category: "fundraising", icon: "HelpCircle" },
            { type: "prompt", promptId: "fundraising-warm-intro", label: "Warm Intro Emails", category: "fundraising", icon: "UserPlus" },
            { type: "prompt", promptId: "fundraising-due-diligence", label: "Due Diligence Prep", category: "fundraising", icon: "ClipboardCheck" },
            { type: "prompt", promptId: "fundraising-post-raise", label: "Post-Raise Comms", category: "fundraising", icon: "PartyPopper" },
            {
                type: "human-task",
                label: "Rehearse and send",
                guidance: "Your pitch deck narrative, Q&A prep, intro emails, due diligence checklist, and post-raise comms have all been generated. Click each step above to review and export.\n\nPractice your pitch with your team, personalise the intro emails for each investor, and schedule your first meetings.",
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
            whyItMatters: "Most founders waste 3-6 months fundraising because they start outreach before their story is airtight. This workflow builds your entire fundraise pipeline — narrative, projections, deck, Q&A prep, and outreach — in a structured sequence that experienced VCs expect to see.",
            estimatedTime: "4-8 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define your ICP and positioning",
                guidance: "Before building your go-to-market plan, align your team on who you are targeting and how you want to be positioned.\n\nOnce you've completed the checklist, open the next step (Product-Market Fit Assessment) and paste your ICP, value proposition, and differentiators into its Input Data field.",
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
                guidance: "The previous steps generated a PMF Assessment, First 100 Customers Plan, and GTM Strategy. Click each step above to review and export these outputs.\n\nShare the strategy and messaging with real prospects. Their feedback is worth more than any model.",
                checklist: [
                    "Share landing page copy with 5 target customers",
                    "Collect feedback on messaging clarity and appeal",
                    "Adjust positioning based on what resonated",
                ],
            },
            { type: "prompt", promptId: "marketing-landing-page", label: "Landing Page Copy", category: "marketing", icon: "Layout" },
            { type: "prompt", promptId: "marketing-product-description", label: "Product Descriptions", category: "marketing", icon: "ShoppingBag" },
            { type: "prompt", promptId: "marketing-social-media", label: "Social Media Posts", category: "marketing", icon: "Share2" },
            { type: "prompt", promptId: "visual-social-graphic", label: "Social Media Graphics", category: "creative", icon: "Image", providerId: IMAGE_PROVIDER, modelId: IMAGE_MODEL, outputModality: "image" },
            { type: "prompt", promptId: "marketing-email-campaign", label: "Email Campaign", category: "marketing", icon: "Mail" },
            {
                type: "human-task",
                label: "Launch checklist and go-live",
                guidance: "Your landing page copy, product descriptions, social media posts, social graphics, and email campaign have all been generated. Click each step above to review, edit, and export.\n\nRun through the final launch checklist with your team. Make sure everything is ready before you go live.",
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
            whyItMatters: "80% of startups fail at go-to-market, not product. This workflow ensures you validate product-market fit, craft compelling positioning, and build your launch pipeline before spending money on ads and outreach.",
            estimatedTime: "3-6 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Set quarterly priorities with leadership",
                guidance: "Before generating your OKRs, align with your leadership team on the top 3 priorities for this quarter.\n\nOnce you've completed the checklist, open the next step (Quarterly OKRs) and paste your priorities, last quarter's results, and department input into its Input Data field.",
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
                guidance: "The previous steps generated OKRs, a 90-Day Execution Plan, and a Weekly Standup template. Click each step above to review the outputs.\n\nWalk through these with your team leads. Adjust the cadence and metrics to match your team's rhythm.",
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
                guidance: "Your Metrics Dashboard, Board Update, and Investor Update have been generated. Click each step above to review, edit, and export.\n\nPersonalise the updates with your own insights, then send them and track any questions that come back.",
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
            whyItMatters: "The difference between a chaotic startup and a well-run one is operating rhythm. This workflow establishes the cadence of OKRs, sprints, standups, and retrospectives that scale from 5 to 50 people.",
            estimatedTime: "2-3 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Collect market research and data",
                guidance: "Gather the raw inputs your business plan needs: market data, competitive intelligence, financial actuals, and customer research.\n\nOnce you've completed the checklist, open the next step (Business Model Canvas) and paste your gathered data into its Input Data field — this powers all the AI analysis that follows.",
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
                guidance: "The previous steps generated a Business Model Canvas, Lean Canvas, and Competitive Moat Analysis based on your research. Click each step above to review the outputs.\n\nShare these with 2-3 trusted advisors. Challenge every assumption. If you need to adjust anything, edit the outputs directly before continuing.",
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
            { type: "prompt", promptId: "strategy-board-presentation", label: "Stakeholder Presentation", category: "strategy", icon: "Presentation" },
            { type: "prompt", promptId: "visual-slide-generator", label: "Presentation Visuals", category: "creative", icon: "Image", providerId: IMAGE_PROVIDER, modelId: IMAGE_MODEL, outputModality: "image" },
            {
                type: "human-task",
                label: "Present plan to stakeholders",
                guidance: "Your business plan, stakeholder presentation, and presentation visuals have been generated. Click each step above to review and export the outputs.\n\nWalk your co-founders, advisors, or board through the completed materials. Use the Export button on each step to download as PDF, DOCX, or Markdown.",
                checklist: [
                    "Schedule presentation with key stakeholders",
                    "Review and polish the generated presentation deck",
                    "Export the business plan and presentation for sharing",
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
            whyItMatters: "Investors and partners need to see structured thinking, not just a great idea. This workflow produces a comprehensive business plan that demonstrates you understand your market, unit economics, and path to profitability.",
            estimatedTime: "4-8 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Gather team signals and data",
                guidance: "Before analysing a potential pivot, collect the signals from your team and customers that suggest change is needed.\n\nOnce you've completed the checklist, open the next step (Metrics Dashboard) and paste your exported metrics and feedback into its Input Data field.",
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
                guidance: "The previous steps generated a Metrics Dashboard, PMF assessment, and Pivot Analysis. Click each step above to review the outputs.\n\nThis is a major decision. Review the analysis with your co-founders and key leaders before committing to a direction.",
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
            { type: "prompt", promptId: "data-executive-summary", label: "Decision Summary", category: "data-analytics", icon: "FileText" },
            {
                type: "human-task",
                label: "Communicate decision to team",
                guidance: "A Decision Summary has been generated based on the entire analysis. Click the step above to review and export it.\n\nUse this summary as the foundation for your team communication. Personalise it with your own voice and context.",
                checklist: [
                    "Review and personalise the Decision Summary",
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
            whyItMatters: "Pivoting too late burns runway. Pivoting too early abandons potential. This framework forces you to evaluate the evidence objectively and make the decision with clear criteria \u2014 not gut feeling.",
            estimatedTime: "2-4 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Assess current cash position",
                guidance: "Before running the crisis playbook, get an honest picture of where you stand. Pull the real numbers.\n\nOnce you've completed the checklist, open the next step (Cash Flow Assessment) and paste your bank balance, burn rate, obligations, and expense data into its Input Data field.",
                checklist: [
                    "Export current bank balance and burn rate",
                    "List all upcoming payment obligations (30/60/90 days)",
                    "Calculate exact months of runway remaining",
                    "Identify top 5 largest expense line items",
                ],
            },
            { type: "prompt", promptId: "finance-cash-flow", label: "Cash Flow Assessment", category: "finance", icon: "PoundSterling" },
            { type: "prompt", promptId: "strategy-crisis-response", label: "Crisis Response Plan", category: "strategy", icon: "Shield" },
            { type: "prompt", promptId: "strategy-scenario-planner", label: "Scenario Planning", category: "strategy", icon: "GitBranch" },
            {
                type: "human-task",
                label: "Align with board on approach",
                guidance: "The previous steps generated a Cash Flow Assessment, Crisis Response Plan, and Scenario Plans. Click each step above to review and export.\n\nA cash crisis requires board awareness. Share the analysis and get alignment on the response plan before executing.",
                checklist: [
                    "Brief board chair on the situation",
                    "Share crisis response plan with full board",
                    "Get board approval for cost-cutting measures",
                    "Agree on communication approach for team",
                ],
            },
            { type: "prompt", promptId: "finance-procurement", label: "Vendor Renegotiation", category: "finance", icon: "PoundSterling" },
            { type: "prompt", promptId: "strategy-board-presentation", label: "Board Communication", category: "strategy", icon: "Presentation" },
            { type: "prompt", promptId: "startup-90-day-plan", label: "Recovery 90-Day Plan", category: "startup-strategy", icon: "Map" },
            {
                type: "human-task",
                label: "Execute and brief stakeholders",
                guidance: "Your Vendor Renegotiation strategy, Board Communication, and Recovery 90-Day Plan have been generated. Click each step above to review and export.\n\nPut the recovery plan into action. Use the Board Communication as your template for stakeholder updates.",
                checklist: [
                    "Execute immediate cost reductions",
                    "Send the generated Board Communication with your updates",
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
            whyItMatters: "When cash gets tight, most founders make emotional cuts that damage the business long-term. This playbook gives you a structured approach to extend runway while protecting your core growth engine.",
            estimatedTime: "2-3 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Collect your story and metrics",
                guidance: "A great pitch deck starts with your real story. Gather the data and narrative elements that make your company unique.\n\nOnce you've completed the checklist, open the next step (Market Sizing) and paste your story, metrics, team bios, and ask into its Input Data field — this powers the entire deck.",
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
                guidance: "The previous steps generated Market Sizing, Competitive Moat Analysis, and Financial Projections. Click each step above to review and export.\n\nShare these with 2-3 advisors who have fundraising experience before finalising the deck.",
                checklist: [
                    "Share draft narrative with 2 experienced advisors",
                    "Validate financial projections with your finance lead",
                    "Test your story arc: does it compel action?",
                ],
            },
            { type: "prompt", promptId: "fundraising-pitch-deck", label: "Pitch Deck Narrative", category: "fundraising", icon: "Presentation" },
            { type: "prompt", promptId: "visual-slide-generator", label: "Pitch Slide Visuals", category: "creative", icon: "Image", providerId: IMAGE_PROVIDER, modelId: IMAGE_MODEL, outputModality: "image" },
            { type: "prompt", promptId: "fundraising-pitch-deck-reviewer", label: "Deck Review & Scoring", category: "fundraising", icon: "CheckCircle" },
            { type: "prompt", promptId: "fundraising-investor-qa", label: "Investor Q&A Prep", category: "fundraising", icon: "HelpCircle" },
            {
                type: "human-task",
                label: "Final review and practice",
                guidance: "Your Pitch Deck Narrative, Slide Visuals, Deck Review & Scoring, and Investor Q&A Prep have been generated. Click each step above to review and export.\n\nPolish the final deck, rehearse the pitch, and prepare for tough questions.",
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
            whyItMatters: "VCs see 1,000+ decks a year and spend an average of 3 minutes on each. This workflow builds a deck that follows the narrative arc proven to convert \u2014 problem, solution, traction, team, ask \u2014 with the specificity investors demand.",
            estimatedTime: "3-5 hours",
        }
    })(),

    // ── General Business Templates ──────────────────────────────────
    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Brief: product details and audience",
                guidance: "Provide the product details, target audience, and campaign goals so the workflow can generate on-brand content.\n\nOnce you've completed the checklist, open the next step (Product Description) and paste your product brief, audience definition, and brand guidelines into its Input Data field.",
                checklist: [
                    "Write a product brief (features, benefits, pricing)",
                    "Define the target audience for this campaign",
                    "Set campaign goals (awareness, leads, sales)",
                    "Provide brand guidelines or tone of voice",
                ],
            },
            { type: "prompt", promptId: "marketing-product-description", label: "Product Description", category: "marketing", icon: "ShoppingBag" },
            { type: "prompt", promptId: "creative-image-prompt", label: "Image Prompts", category: "creative", icon: "Image" },
            { type: "prompt", promptId: "visual-brand-hero", label: "Product Hero Image", category: "creative", icon: "Image", providerId: IMAGE_PROVIDER, modelId: IMAGE_MODEL, outputModality: "image" },
            { type: "prompt", promptId: "marketing-social-media", label: "Social Media Posts", category: "marketing", icon: "Share2" },
            {
                type: "human-task",
                label: "Review creative with stakeholders",
                guidance: "The previous steps generated a Product Description, Image Prompts, Hero Image, and Social Media Posts. Click each step above to review and export.\n\nShare these with your marketing lead or brand team for feedback before generating the full campaign.",
                checklist: [
                    "Review product description for accuracy",
                    "Check social media posts match brand voice",
                    "Review generated hero image and approve direction",
                ],
            },
            { type: "prompt", promptId: "marketing-email-campaign", label: "Email Campaign", category: "marketing", icon: "Mail" },
            { type: "prompt", promptId: "marketing-landing-page", label: "Landing Page Copy", category: "marketing", icon: "Layout" },
            { type: "prompt", promptId: "marketing-ad-copy", label: "Ad Copy", category: "marketing", icon: "Megaphone" },
            {
                type: "human-task",
                label: "Approve final assets and schedule",
                guidance: "Your Email Campaign, Landing Page Copy, and Ad Copy have been generated. Click each step above to review, edit, and export.\n\nGive final approval on all campaign assets and schedule them for launch.",
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
            whyItMatters: "Most product launches fizzle because they treat marketing as an afterthought. This workflow builds a coordinated campaign — product brief, copy, social, email, and ads — so every channel reinforces the same message on launch day.",
            estimatedTime: "3-5 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define content themes and goals",
                guidance: "Set the strategic direction for your content pipeline before generating anything.\n\nOnce you've completed the checklist, open the next step (Content Calendar) and paste your themes, keywords, and content goals into its Input Data field.",
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
                guidance: "The previous steps generated a Content Calendar, Blog Post, and SEO Optimisation. Click each step above to review and export.\n\nReview the generated content with your editorial team. Check for accuracy, brand voice, and SEO quality.",
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
                guidance: "Your Social Media Repurposing, Email Newsletter, and Analytics Narrative have been generated. Click each step above to review, edit, and export.\n\nHit publish, share across channels, and let the team know what went live.",
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
            whyItMatters: "Consistent content marketing compounds over time, but most teams struggle with ideation and execution cadence. This pipeline generates a quarter\u2019s worth of content themes, outlines, and distribution plans in one focused session.",
            estimatedTime: "3-5 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define target accounts and personas",
                guidance: "Identify who you are selling to before generating outreach materials.\n\nOnce you've completed the checklist, open the next step (Lead Qualification) and paste your target account list, buyer personas, and decision-maker details into its Input Data field.",
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
                guidance: "The previous steps generated Lead Qualification criteria, Cold Outreach templates, and Objection Handling scripts. Click each step above to review and export.\n\nHave your sales lead or most experienced rep review these before generating the demo and proposal materials.",
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
                guidance: "Your Demo Script, Proposal template, and Case Study have been generated. Click each step above to review, edit, and export.\n\nPersonalise each outreach message for the specific account and start your sequences.",
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
            whyItMatters: "Random outreach gets random results. This workflow builds a systematic sales pipeline — from lead qualification through personalised outreach, objection handling, and proposal creation — so you can scale what works.",
            estimatedTime: "3-5 hours",
        }
    })(),

    // ─── Cold Email Outreach Pipeline (11x-Grade) ────────────────────────
    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define ICP & product context",
                guidance: "Before the AI can research and write, it needs to deeply understand what you're selling, who you're selling to, and what makes your offer compelling. The quality of this input directly determines the quality of every email downstream.\n\nOnce you've completed the checklist, open the next step (Prospect Deep Research) and paste all of the above into its Input Data field.",
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
                guidance: "The previous steps generated Prospect Research and Lead Scoring. Click each step above to review the outputs.\n\nApprove high-scoring leads for email generation, reject poor fits, and add any context the AI may have missed.",
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
                guidance: "Your Personalisation Strategy, 4-Email Sequence, Subject Lines, and QA Report have been generated. Click each step above to review and export.\n\nThis is your last checkpoint before emails go out. Review every email for accuracy, tone, and personalisation quality. Your reputation is on the line.",
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
            whyItMatters: "The best sales teams treat outreach as a system, not one-off emails. This pipeline builds your prospect research, personalisation framework, multi-step sequences, and follow-up cadence into a repeatable machine.",
            estimatedTime: "3-5 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define role requirements with hiring manager",
                guidance: "Sit down with the hiring manager to define what they actually need. Great hiring starts with a clear brief.\n\nOnce you've completed the checklist, open the next step (Job Description) and paste the role requirements, skills, seniority level, and comp range into its Input Data field.",
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
                guidance: "The previous steps generated a Job Description and Interview Questions. Click each step above to review and export.\n\nShare these with everyone who will be involved in the hiring process and calibrate on what great looks like.",
                checklist: [
                    "Review job description with interview panel",
                    "Agree on scoring criteria for interviews",
                    "Assign interview stages to panel members",
                ],
            },
            { type: "prompt", promptId: "hr-compensation", label: "Compensation Benchmark", category: "hr", icon: "PoundSterling" },
            { type: "prompt", promptId: "hr-onboarding", label: "Onboarding Checklist", category: "hr", icon: "ListChecks" },
            { type: "prompt", promptId: "hr-culture", label: "Culture Statement", category: "hr", icon: "Heart" },
            {
                type: "human-task",
                label: "Finalise offer and onboarding plan",
                guidance: "Your Compensation Benchmark, Onboarding Checklist, and Culture Statement have been generated. Click each step above to review and export.\n\nUse the compensation benchmark to finalise your offer and the onboarding checklist to prepare for day 1.",
                checklist: [
                    "Prepare written offer using the Compensation Benchmark",
                    "Set up onboarding schedule using the generated checklist",
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
            whyItMatters: "Bad hires cost 3-5x their annual salary when you factor in lost time, team disruption, and severance. This workflow builds a structured hiring process — JD, interview questions, scoring rubric, and comp package — so you evaluate candidates consistently.",
            estimatedTime: "3-5 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Collect data from department leads",
                guidance: "A QBR is only as good as its data. Gather the numbers from each department before generating the review.\n\nOnce you've completed the checklist, open the next step (KPI Dashboard) and paste your KPIs, financials, OKR progress, and key wins/challenges into its Input Data field.",
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
                guidance: "The previous steps generated a KPI Dashboard, Financial Summary, and SWOT Analysis. Click each step above to review and export.\n\nWalk through these with your leadership team before presenting to the board.",
                checklist: [
                    "Review KPIs and flag any concerning trends",
                    "Discuss SWOT findings and strategic implications",
                    "Agree on key messages for board presentation",
                ],
            },
            { type: "prompt", promptId: "strategy-okr", label: "OKR Progress", category: "strategy", icon: "Target" },
            { type: "prompt", promptId: "strategy-board-presentation", label: "Board Presentation", category: "strategy", icon: "Presentation" },
            { type: "prompt", promptId: "visual-slide-generator", label: "Board Presentation Visuals", category: "creative", icon: "Image", providerId: IMAGE_PROVIDER, modelId: IMAGE_MODEL, outputModality: "image" },
            {
                type: "human-task",
                label: "Present to board or all-hands",
                guidance: "Your OKR Progress report, Board Presentation, and Presentation Visuals have been generated. Click each step above to review, edit, and export.\n\nUse the Board Presentation as your deck. Deliver the QBR to your board, investors, or team. Make it a conversation, not a monologue.",
                checklist: [
                    "Schedule and send calendar invite",
                    "Review and personalise the generated Board Presentation",
                    "Do a dry run of the presentation",
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
            whyItMatters: "Companies that run structured QBRs grow 2x faster because they catch problems early and double down on what works. This workflow produces a board-ready review that turns raw data into strategic decisions.",
            estimatedTime: "3-6 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Map your customer journey",
                guidance: "Before building onboarding materials, understand the journey your customers actually take.\n\nOnce you've completed the checklist, open the next step (User Personas) and paste your customer journey map, drop-off points, and customer feedback into its Input Data field.",
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
                guidance: "The previous steps generated User Personas and an FAQ. Click each step above to review and export.\n\nYour CS team talks to customers daily. Review the generated materials with them before going live.",
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
                guidance: "Your Onboarding Emails, Health Scoring model, and NPS Response templates have been generated. Click each step above to review, edit, and export.\n\nDeploy the onboarding sequence and set up monitoring to track how new customers progress.",
                checklist: [
                    "Load the generated onboarding emails into your email tool",
                    "Set up health scoring in your CS platform using the generated model",
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
            whyItMatters: "68% of customers leave because they feel you don't care about them. A structured onboarding experience sets the tone for the entire relationship — from first login through to first value delivered.",
            estimatedTime: "3-5 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Define brand values with founding team",
                guidance: "A brand is built by people, not tools. Start by aligning your founding team on what the brand stands for.\n\nOnce you've completed the checklist, open the next step (Vision & Mission) and paste your brand values, personality, audience, and visual references into its Input Data field.",
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
            { type: "prompt", promptId: "visual-brand-hero", label: "Brand Hero Visual", category: "creative", icon: "Image", providerId: IMAGE_PROVIDER, modelId: IMAGE_MODEL, outputModality: "image" },
            {
                type: "human-task",
                label: "Review identity with stakeholders",
                guidance: "The previous steps generated your Vision & Mission, Brand Voice Guide, Brand Identity Brief, and a Hero Visual. Click each step above to review and export.\n\nShare these with your team and key stakeholders. Brand should feel authentic to everyone.",
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
                guidance: "Your Landing Page Copy, Press Release, and Social Media Visuals have been generated. Click each step above to review, edit, and export.\n\nGive final approval on all brand materials before launch. This is what the world will see.",
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
            whyItMatters: "Your brand is the story people tell about you when you're not in the room. This workflow builds a cohesive brand — voice, identity, copy, and visuals — so every touchpoint reinforces the same message.",
            estimatedTime: "4-6 hours",
        }
    })(),

    // ── New Templates (7) ───────────────────────────────────────────

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Pre-offsite preparation",
                guidance: "Great strategy offsites are won or lost in the preparation. Gather the data and perspectives your team needs to make decisions, not just discuss ideas.\n\nOnce you've completed the checklist, open the next step (SWOT Analysis) and paste your pre-read data, metrics, and priority inputs into its Input Data field.",
                checklist: [
                    "Circulate pre-read packet: key metrics, market landscape, customer feedback",
                    "Collect individual input on top 3 strategic priorities (async, before the offsite)",
                    "Define the offsite's single most important outcome (e.g., 'agree on 3 strategic bets for next year')",
                    "Book a facilitator or assign one team member to keep discussions on track",
                ],
            },
            { type: "prompt", promptId: "strategy-swot", label: "SWOT Analysis", category: "strategy", icon: "Grid3x3" },
            { type: "prompt", promptId: "strategy-scenario-planner", label: "Scenario Planning", category: "strategy", icon: "GitBranch" },
            { type: "prompt", promptId: "strategy-growth-framework", label: "Growth Framework", category: "strategy", icon: "TrendingUp" },
            {
                type: "human-task",
                label: "Facilitated strategy discussion",
                guidance: "The previous steps generated a SWOT Analysis, Scenario Plans, and Growth Framework. Click each step above to review and print the outputs for your offsite.\n\nUse these as conversation starters, not conclusions. The best strategies emerge from honest debate.",
                checklist: [
                    "Walk through SWOT and scenarios as a group — challenge assumptions",
                    "Debate and rank the top 3 strategic bets for the next 12 months",
                    "Assign an owner to each strategic bet",
                    "Identify the biggest risk to each bet and how to mitigate it",
                ],
            },
            { type: "prompt", promptId: "strategy-okr", label: "Strategic OKRs", category: "strategy", icon: "Target" },
            { type: "prompt", promptId: "strategy-initiative-prioritizer", label: "Initiative Prioritization", category: "strategy", icon: "ListOrdered" },
            { type: "prompt", promptId: "strategy-risk-assessment", label: "Risk Assessment", category: "strategy", icon: "AlertTriangle" },
            { type: "prompt", promptId: "data-executive-summary", label: "Strategy Summary", category: "data-analytics", icon: "FileText" },
            {
                type: "human-task",
                label: "Communicate outcomes to the company",
                guidance: "A Strategy Summary has been generated consolidating the OKRs, priorities, and risk assessment. Click the step above to review and export it.\n\nUse this as the foundation for your all-hands communication. The offsite only matters if the rest of the company knows what was decided and why. Communicate within 48 hours.",
                checklist: [
                    "Review and personalise the Strategy Summary",
                    "Schedule all-hands to share the strategic direction",
                    "Publish the OKRs and initiative priorities for the team",
                    "Set up monthly strategy check-ins to track progress",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "strategic-planning-offsite",
            name: "Strategic Planning Offsite",
            description: "Run a world-class strategy offsite: SWOT analysis, scenario planning, growth framework, OKR setting, initiative prioritization, and risk assessment — with structured human checkpoints for debate and decisions.",
            category: "business" as const,
            icon: "Compass",
            nodeCount: steps.length,
            nodes,
            edges,
            whyItMatters: "Most strategy offsites end with enthusiasm but no concrete outcomes. This workflow structures the entire process — from pre-read materials through SWOT, scenario planning, OKRs, and prioritisation — so you leave with decisions, not just discussions.",
            estimatedTime: "4-8 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Gather Market Intelligence",
                guidance: "The quality of your strategic analysis depends on the data you feed it. Collect competitor and market information before running the AI steps.\n\nOnce you've completed the checklist, open the next step (Market Sizing) and paste your data into its Input Data field.",
                checklist: [
                    "Collect competitor pricing, positioning, and key differentiators",
                    "Gather customer feedback or win/loss notes",
                    "Pull any market reports or industry data you have",
                    "Note key financial or traction metrics for your company",
                ],
            },
            { type: "prompt", promptId: "startup-market-sizing", label: "Market Sizing (TAM/SAM/SOM)", category: "startup-strategy", icon: "PieChart" },
            { type: "prompt", promptId: "strategy-competitive-landscape", label: "Competitive Landscape Mapper", category: "strategy", icon: "Map" },
            { type: "prompt", promptId: "strategy-swot", label: "SWOT Analysis", category: "strategy", icon: "Grid3x3" },
            { type: "prompt", promptId: "startup-competitive-moat", label: "Competitive Moat Analyzer", category: "startup-strategy", icon: "Shield" },
            {
                type: "human-task",
                label: "Review & Challenge",
                guidance: "The previous steps generated Market Sizing, Competitive Landscape, SWOT, and Moat analysis. Click each step above to review.\n\nChallenge assumptions before continuing. Validate competitor data where possible and identify blind spots.",
                checklist: [
                    "Review each analysis and flag any assumptions that need validation",
                    "Cross-check competitor details against public or internal sources",
                    "Identify 2–3 blind spots or questions the analysis didn't address",
                ],
            },
            { type: "prompt", promptId: "strategy-risk-assessment", label: "Risk Assessment", category: "strategy", icon: "AlertTriangle" },
            { type: "prompt", promptId: "data-executive-summary", label: "Executive Summary", category: "data-analytics", icon: "FileText" },
            {
                type: "human-task",
                label: "Act on Findings",
                guidance: "An Executive Summary has been generated. Use it as the foundation for decisions and communication.\n\nTurn the top recommendations into objectives and tasks in ForgeOS, and schedule follow-up to track progress.",
                checklist: [
                    "Share the Executive Summary with your team or board",
                    "Create objectives or tasks from the top 3 strategic recommendations",
                    "Schedule a follow-up review (e.g., quarterly) to reassess the market",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "strategic-market-analysis",
            name: "Strategic Market Analysis",
            description: "End-to-end market and competitive analysis: market sizing, competitive landscape, SWOT, moat assessment, risk assessment, and executive summary — with human checkpoints to gather data and challenge assumptions.",
            category: "business" as const,
            icon: "Telescope",
            nodeCount: steps.length,
            nodes,
            edges,
            whyItMatters: "Strategic analysis is only as good as the data you put in and the rigor you apply. This workflow guides you from gathering intelligence through structured analyses to an investor-ready executive summary and concrete next steps.",
            estimatedTime: "2-4 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Collect monthly data from all departments",
                guidance: "The monthly business review is only as good as its data. Pull numbers from every department before generating the review.\n\nOnce you've completed the checklist, open the next step (KPI Dashboard) and paste all department metrics into its Input Data field.",
                checklist: [
                    "Revenue, pipeline, and bookings data from sales",
                    "Product metrics: active users, retention, feature adoption",
                    "Marketing metrics: leads, CAC, conversion rates",
                    "Engineering: velocity, bugs, uptime",
                    "Finance: cash position, burn rate, P&L actuals vs. budget",
                ],
            },
            { type: "prompt", promptId: "finance-kpi-dashboard", label: "KPI Dashboard", category: "finance", icon: "BarChart3" },
            { type: "prompt", promptId: "data-trend-analysis", label: "Trend Analysis", category: "data-analytics", icon: "TrendingUp" },
            { type: "prompt", promptId: "finance-cash-flow", label: "Cash Flow Review", category: "finance", icon: "PoundSterling" },
            {
                type: "human-task",
                label: "Review with department leads",
                guidance: "The previous steps generated a KPI Dashboard, Trend Analysis, and Cash Flow Review. Click each step above to review and export.\n\nWalk through the numbers with each department lead. The goal is to understand WHY metrics moved, not just THAT they moved.",
                checklist: [
                    "Meet with each department lead to review their metrics",
                    "Identify the top 3 wins and top 3 concerns for the month",
                    "Agree on corrective actions for any off-track metrics",
                ],
            },
            { type: "prompt", promptId: "data-executive-summary", label: "Executive Summary", category: "data-analytics", icon: "FileText" },
            { type: "prompt", promptId: "startup-metrics-dashboard", label: "Startup Metrics", category: "startup-strategy", icon: "BarChart3" },
            {
                type: "human-task",
                label: "Present and distribute",
                guidance: "Your Executive Summary and Startup Metrics report have been generated. Click each step above to review, edit, and export.\n\nUse the Executive Summary as your MBR document. Share it with leadership and, optionally, the whole company.",
                checklist: [
                    "Review and personalise the Executive Summary",
                    "Present MBR to leadership team",
                    "Send summary to full company (if appropriate)",
                    "File action items and assign owners",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "monthly-business-review",
            name: "Monthly Business Review",
            description: "Run a structured monthly business review: KPI dashboard, trend analysis, cash flow review, executive summary, and metrics tracking — with leadership review checkpoints.",
            category: "business" as const,
            icon: "BarChart3",
            nodeCount: steps.length,
            nodes,
            edges,
            whyItMatters: "Monthly reviews prevent quarterly surprises. This workflow turns raw department data into a structured review with trend analysis, cash flow check, and executive summary — giving you 30-day feedback loops instead of 90-day ones.",
            estimatedTime: "2-4 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Prepare for the new hire's arrival",
                guidance: "Great onboarding starts before Day 1. Make sure everything is ready so the new hire feels expected and valued from the moment they arrive.\n\nOnce you've completed the checklist, open the next step (Onboarding Checklist) and paste the role details, start date, and team context into its Input Data field.",
                checklist: [
                    "Confirm start date, equipment, and access credentials",
                    "Assign an onboarding buddy from the team",
                    "Block the first week's calendar with key meetings",
                    "Prepare a welcome message from the hiring manager",
                ],
            },
            { type: "prompt", promptId: "hr-onboarding", label: "Onboarding Checklist", category: "hr", icon: "ListChecks" },
            { type: "prompt", promptId: "hr-culture", label: "Culture Statement", category: "hr", icon: "Heart" },
            { type: "prompt", promptId: "startup-90-day-plan", label: "90-Day Plan", category: "startup-strategy", icon: "Map" },
            {
                type: "human-task",
                label: "Week 1: Daily check-ins",
                guidance: "The previous steps generated an Onboarding Checklist, Culture Statement, and 90-Day Plan. Click each step above to review and share with the new hire.\n\nThe first week sets the tone. Check in daily to make sure the new hire is settling in and has everything they need.",
                checklist: [
                    "Day 1: Welcome meeting, team intro, first task assigned",
                    "Day 2-3: Role-specific training and tool setup",
                    "Day 4-5: First deliverable assigned and buddy check-in",
                    "End of week: Manager debrief — 'How was your first week?'",
                ],
            },
            { type: "prompt", promptId: "hr-performance-review", label: "30-Day Review Template", category: "hr", icon: "ClipboardCheck" },
            { type: "prompt", promptId: "hr-360-feedback", label: "Feedback Collection Plan", category: "hr", icon: "RefreshCcw" },
            {
                type: "human-task",
                label: "30-day review and course correction",
                guidance: "The previous steps generated a 30-Day Review Template and Feedback Collection Plan. Click each step above to review and use.\n\nAt 30 days, have a formal check-in. Use the generated templates to structure the conversation.",
                checklist: [
                    "Conduct formal 30-day review using the generated template",
                    "Collect feedback using the generated Feedback Collection Plan",
                    "Adjust the 90-day plan based on progress so far",
                    "Celebrate early wins and address any concerns",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "new-hire-onboarding",
            name: "New Hire Onboarding",
            description: "Onboard a new team member with excellence: pre-arrival prep, onboarding checklist, culture immersion, 90-day plan, and structured 30-day review with feedback collection.",
            category: "business" as const,
            icon: "UserPlus",
            nodeCount: steps.length,
            nodes,
            edges,
            whyItMatters: "The first 90 days determine whether a new hire becomes a long-term contributor or a quick departure. This workflow creates a structured onboarding experience — from pre-arrival prep through 90-day plan and feedback — so new team members reach full productivity faster.",
            estimatedTime: "2-4 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Gather product requirements and context",
                guidance: "Before writing the spec, make sure you understand the problem deeply. Talk to customers, review data, and align with stakeholders.\n\nOnce you've completed the checklist, open the next step (Product Requirements Doc) and paste your customer insights, analytics, constraints, and success metrics into its Input Data field.",
                checklist: [
                    "Interview 3-5 customers about the problem",
                    "Review relevant analytics and support tickets",
                    "Align with engineering on technical constraints",
                    "Define success metrics for this feature",
                ],
            },
            { type: "prompt", promptId: "product-prd", label: "Product Requirements Doc", category: "product", icon: "FileText" },
            { type: "prompt", promptId: "product-user-stories", label: "User Stories", category: "product", icon: "Users" },
            { type: "prompt", promptId: "product-feature-prioritization", label: "Feature Prioritization", category: "product", icon: "ListOrdered" },
            {
                type: "human-task",
                label: "Design review with engineering",
                guidance: "The previous steps generated a PRD, User Stories, and Feature Prioritization. Click each step above to review and export.\n\nWalk through these with your engineering team. Catch feasibility issues early — they're 10x cheaper to fix now than after coding starts.",
                checklist: [
                    "Review PRD with tech lead for feasibility",
                    "Estimate effort for each user story (t-shirt sizing)",
                    "Identify technical risks and dependencies",
                    "Agree on MVP scope vs. future enhancements",
                ],
            },
            { type: "prompt", promptId: "creative-ui-copy", label: "UI Copy", category: "creative", icon: "Type" },
            { type: "prompt", promptId: "product-release-notes", label: "Release Notes (draft)", category: "product", icon: "FileText" },
            {
                type: "human-task",
                label: "Ship, announce, and measure",
                guidance: "Your UI Copy and Release Notes have been generated. Click each step above to review, edit, and export.\n\nThe feature isn't done until it's shipped, announced, and measured. Use the generated release notes as your customer announcement.",
                checklist: [
                    "QA the feature on staging before release",
                    "Publish the generated Release Notes to customers",
                    "Update documentation and help center",
                    "Set up analytics tracking for success metrics",
                    "Schedule 2-week post-launch review",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "product-spec-to-ship",
            name: "Product Spec-to-Ship",
            description: "Take a product idea from spec to ship: PRD, user stories, prioritization, UI copy, release notes — with engineering review and launch checklist.",
            category: "business" as const,
            icon: "Package",
            nodeCount: steps.length,
            nodes,
            edges,
            whyItMatters: "Features that ship without a structured spec process accumulate scope creep and miss deadlines. This workflow takes a product idea from PRD through user stories, prioritisation, and release — with engineering review baked in to catch feasibility issues early.",
            estimatedTime: "3-6 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Prepare account review data",
                guidance: "Pull together everything you know about this customer before the review. The goal is to have a complete picture of account health.\n\nOnce you've completed the checklist, open the next step (Account Health Score) and paste your usage data, support history, contract details, and notes into its Input Data field.",
                checklist: [
                    "Export usage/engagement data for this account",
                    "Review support tickets and NPS responses",
                    "Check contract terms, renewal date, and expansion opportunities",
                    "Note any recent conversations or escalations",
                ],
            },
            { type: "prompt", promptId: "cs-health-scorer", label: "Account Health Score", category: "customer-success", icon: "Activity" },
            { type: "prompt", promptId: "cs-churn-analyzer", label: "Churn Risk Analysis", category: "customer-success", icon: "AlertTriangle" },
            {
                type: "human-task",
                label: "Internal alignment on account strategy",
                guidance: "The previous steps generated an Account Health Score and Churn Risk Analysis. Click each step above to review and export.\n\nBefore the customer meeting, align your internal team on the account strategy. What's the goal for this customer in the next quarter?",
                checklist: [
                    "Review health score and churn risk with CS team",
                    "Align on retention or expansion strategy",
                    "Prepare talking points for the customer meeting",
                    "Identify any product or support issues to address proactively",
                ],
            },
            { type: "prompt", promptId: "cs-renewal-proposal", label: "Renewal Proposal", category: "customer-success", icon: "FileText" },
            { type: "prompt", promptId: "cs-nps-response", label: "NPS Follow-up", category: "customer-success", icon: "ThumbsUp" },
            { type: "prompt", promptId: "cs-email-responder", label: "Customer Communication", category: "customer-success", icon: "Mail" },
            {
                type: "human-task",
                label: "Conduct QBR and follow up",
                guidance: "Your Renewal Proposal, NPS Follow-up, and Customer Communication templates have been generated. Click each step above to review, edit, and export.\n\nRun the customer QBR with a focus on value delivered and future plans. Use the generated materials as your starting point.",
                checklist: [
                    "Conduct QBR meeting with customer stakeholders",
                    "Send follow-up using the generated Customer Communication template",
                    "File action items and assign owners",
                    "Update CRM with account status and next steps",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "customer-success-review",
            name: "Customer Success Review",
            description: "Run a structured customer success review: health scoring, churn risk analysis, renewal proposal, NPS follow-up, and customer communication — with internal alignment and QBR execution.",
            category: "business" as const,
            icon: "Heart",
            nodeCount: steps.length,
            nodes,
            edges,
            whyItMatters: "It costs 5-7x more to acquire a new customer than to retain an existing one. This workflow gives you a structured review process — health score, churn risk, renewal strategy — so you proactively address issues before they become cancellations.",
            estimatedTime: "2-4 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Identify applicable regulations",
                guidance: "Before diving into compliance, identify which regulations actually apply to your business. Over-compliance wastes resources; under-compliance creates risk.\n\nOnce you've completed the checklist, open the next step (Compliance Checklist) and paste your jurisdictions, regulations, and thresholds into its Input Data field.",
                checklist: [
                    "List all jurisdictions where you operate or have customers",
                    "Identify industry-specific regulations (HIPAA, PCI-DSS, etc.)",
                    "Check if GDPR, CCPA, or other data privacy laws apply",
                    "Determine your company's size thresholds for regulatory obligations",
                ],
            },
            { type: "prompt", promptId: "legal-compliance-checklist", label: "Compliance Checklist", category: "legal", icon: "ClipboardCheck" },
            { type: "prompt", promptId: "legal-privacy-policy", label: "Privacy Policy", category: "legal", icon: "Shield" },
            { type: "prompt", promptId: "legal-terms-of-service", label: "Terms of Service", category: "legal", icon: "ScrollText" },
            {
                type: "human-task",
                label: "Legal review of generated documents",
                guidance: "The previous steps generated a Compliance Checklist, Privacy Policy, and Terms of Service. Click each step above to review and export.\n\nCRITICAL: AI-generated legal documents are a starting point, NOT final. Have every document reviewed by a qualified lawyer before publishing.",
                checklist: [
                    "Send compliance checklist to legal counsel for review",
                    "Have privacy policy reviewed by a privacy lawyer",
                    "Have terms of service reviewed by a business lawyer",
                    "Document any jurisdiction-specific modifications needed",
                ],
            },
            { type: "prompt", promptId: "legal-regulatory-impact", label: "Regulatory Impact Assessment", category: "legal", icon: "AlertTriangle" },
            { type: "prompt", promptId: "legal-ip-protection", label: "IP Protection Strategy", category: "legal", icon: "Lock" },
            {
                type: "human-task",
                label: "Implement and maintain compliance",
                guidance: "Your Regulatory Impact Assessment and IP Protection Strategy have been generated. Click each step above to review and export.\n\nCompliance is not a one-time event. Use these outputs alongside your lawyer-reviewed documents to set up ongoing compliance.",
                checklist: [
                    "Publish lawyer-approved legal documents on your website",
                    "Set up quarterly compliance review cadence",
                    "Train team on key compliance obligations",
                    "Create a process for tracking regulatory changes",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "compliance-readiness",
            name: "Compliance Readiness",
            description: "Get compliance-ready: regulatory checklist, privacy policy, terms of service, regulatory impact assessment, and IP protection — with mandatory legal review checkpoints.",
            category: "business" as const,
            icon: "Shield",
            nodeCount: steps.length,
            nodes,
            edges,
            whyItMatters: "Compliance gaps don't announce themselves — they surface during due diligence, customer audits, or regulatory investigations. This workflow identifies your obligations, generates draft legal documents, and builds a maintenance process — with mandatory legal review checkpoints.",
            estimatedTime: "4-8 hours",
        }
    })(),

    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Compile quarterly investor data",
                guidance: "Investors want transparency, consistency, and honesty. Gather the data that tells a complete picture — good and bad.\n\nOnce you've completed the checklist, open the next step (Investor Update Letter) and paste your metrics, wins, challenges, and team changes into its Input Data field.",
                checklist: [
                    "Export key metrics: revenue, growth rate, burn, runway",
                    "Summarise top 3 wins and top 3 challenges this quarter",
                    "List key hires, departures, and team changes",
                    "Note any material changes to strategy or market",
                ],
            },
            { type: "prompt", promptId: "fundraising-investor-update", label: "Investor Update Letter", category: "fundraising", icon: "Mail" },
            { type: "prompt", promptId: "startup-metrics-dashboard", label: "Metrics Dashboard", category: "startup-strategy", icon: "BarChart3" },
            { type: "prompt", promptId: "startup-board-update", label: "Board Update", category: "startup-strategy", icon: "Users" },
            {
                type: "human-task",
                label: "Review with co-founder before sending",
                guidance: "The previous steps generated an Investor Update Letter, Metrics Dashboard, and Board Update. Click each step above to review and export.\n\nNever send investor communications without a second pair of eyes. Tone, accuracy, and messaging matter.",
                checklist: [
                    "Review investor letter with co-founder for tone and accuracy",
                    "Verify all metrics match your internal data",
                    "Check that asks (introductions, advice) are specific and actionable",
                    "Proofread for grammar and formatting",
                ],
            },
            { type: "prompt", promptId: "fundraising-data-room", label: "Data Room Update", category: "fundraising", icon: "FolderOpen" },
            { type: "prompt", promptId: "fundraising-traction-narrative", label: "Traction Narrative", category: "fundraising", icon: "TrendingUp" },
            {
                type: "human-task",
                label: "Send and follow up",
                guidance: "Your Data Room Update and Traction Narrative have been generated. Click each step above to review, edit, and export.\n\nSend the update, then track engagement. Investors who respond are your warmest leads for the next raise.",
                checklist: [
                    "Send investor update to all shareholders",
                    "Send board update to board members",
                    "Update data room with latest documents",
                    "Track which investors reply and note their feedback",
                    "Follow up personally with any investor who has questions",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "investor-relations-cadence",
            name: "Investor Relations Cadence",
            description: "Maintain excellent investor relations: quarterly investor update, metrics dashboard, board update, data room refresh, and traction narrative — with review checkpoints before sending.",
            category: "startup" as const,
            icon: "Users",
            nodeCount: steps.length,
            nodes,
            edges,
            whyItMatters: "The founders who raise follow-on rounds fastest are the ones who keep investors engaged between raises. This workflow builds a quarterly cadence — update letter, metrics, board materials, and data room — so your investors are warm when you need them.",
            estimatedTime: "2-4 hours",
        }
    })(),

    // ─── Manufacturing Decision Engine ──────────────────────────────────
    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Describe your product and requirements",
                guidance: "The quality of manufacturing recommendations depends entirely on the quality of your input. Be as specific as possible about your product, constraints, and goals.\n\nOnce you've completed the checklist, open the next step (Manufacturing Technique Selection) and paste your product description, volumes, budgets, and requirements into its Input Data field.",
                checklist: [
                    "Write a detailed product description (size, weight, features, complexity)",
                    "Define target production volume (prototype, 100, 1k, 10k, 100k+)",
                    "Set budget range (prototype budget + production budget)",
                    "Specify timeline (when do you need first parts? when do you need production volume?)",
                    "List material preferences or requirements (strength, weight, thermal, aesthetic)",
                    "Note any regulatory requirements (FDA, CE, UL, RoHS, REACH)",
                ],
            },
            { type: "prompt", promptId: "mfg-technique-selector", label: "Manufacturing Technique Selection", category: "manufacturing", icon: "Factory" },
            { type: "prompt", promptId: "mfg-material-advisor", label: "Material Recommendation", category: "manufacturing", icon: "Layers" },
            {
                type: "human-task",
                label: "Review technique and material recommendations",
                guidance: "The previous steps generated a Manufacturing Technique Selection and Material Recommendation. Click each step above to review and export.\n\nBefore proceeding to costing and DFM, validate that the recommended technique and material actually fit your constraints. This is the most important decision in the entire workflow.",
                checklist: [
                    "Validate the recommended technique fits your volume and budget",
                    "Confirm the material meets your functional requirements",
                    "Check that cost expectations align with your budget",
                    "Review the scaling path — does the transition from prototype to production make sense?",
                    "If anything doesn't fit, adjust your input and re-run the previous steps",
                ],
            },
            { type: "prompt", promptId: "mfg-cost-estimator", label: "Cost Estimation", category: "manufacturing", icon: "Calculator" },
            { type: "prompt", promptId: "mfg-dfm-review", label: "DFM Review", category: "manufacturing", icon: "ClipboardCheck" },
            { type: "prompt", promptId: "mfg-rfq-spec-writer", label: "RFQ Specification", category: "manufacturing", icon: "FileText" },
            {
                type: "human-task",
                label: "Review RFQ spec and send to suppliers",
                guidance: "Your Cost Estimation, DFM Review, and RFQ Specification have been generated. Click each step above to review, edit, and export.\n\nThe RFQ spec is your primary communication tool with suppliers. A well-written RFQ gets better quotes, faster responses, and fewer misunderstandings.",
                checklist: [
                    "Review the RFQ spec for completeness and accuracy",
                    "Add your company-specific details (contact info, commercial terms)",
                    "Attach any CAD files or drawings referenced in the spec",
                    "Send the RFQ to 3+ qualified suppliers via the Marketplace",
                    "Set a response deadline (typically 1-2 weeks for standard parts)",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "manufacturing-decision-engine",
            name: "Manufacturing Decision Engine",
            description: "The complete manufacturing decision workflow: technique selection, material recommendation, cost estimation, DFM review, and RFQ specification — with human checkpoints at every critical decision point.",
            category: "manufacturing" as const,
            icon: "Factory",
            nodeCount: steps.length,
            nodes,
            edges,
            whyItMatters: "Choosing the wrong manufacturing technique costs hardware startups an average of £50K-200K in wasted tooling and 3-6 months of delays. This workflow guides you through technique selection, material choice, cost estimation, and RFQ creation — the same process a £300/hr manufacturing consultant would follow.",
            estimatedTime: "4-8 hours",
        }
    })(),

    // ─── Marketing Video Pipeline ────────────────────────────────────
    (() => {
        const steps: StepDefinition[] = [
            {
                type: "human-task",
                label: "Brief: product and video goals",
                guidance: "Before the AI generates anything, define what you want the video to communicate and who it's for.\n\nOnce you've completed the checklist, open the next step (Product Description) and paste your product details, brand voice, and video goals into its Input Data field.",
                checklist: [
                    "Write a 2-3 sentence product or campaign description",
                    "Define the target audience for the video",
                    "Choose the tone: professional, playful, dramatic, cinematic",
                    "List 2-3 key messages the video must communicate",
                ],
            },
            { type: "prompt", promptId: "marketing-product-description", label: "Product Description", category: "marketing", icon: "ShoppingBag" },
            { type: "prompt", promptId: "creative-image-prompt", label: "Scene Description", category: "creative", icon: "Image" },
            { type: "prompt", promptId: "visual-brand-hero", label: "Hero Image (First Frame)", category: "creative", icon: "Image", providerId: IMAGE_PROVIDER, modelId: IMAGE_MODEL, outputModality: "image" },
            {
                type: "human-task",
                label: "Review image before animating",
                guidance: "The previous step generated a hero image that will become the first frame of your video. Click the step above to review it.\n\nThis is your last checkpoint before the video is generated. If the image doesn't match your vision, re-run the previous step with a modified prompt.",
                checklist: [
                    "Review the generated hero image for brand alignment",
                    "Confirm the composition works as a video starting frame",
                    "Verify there are no unwanted artifacts or text",
                ],
            },
            { type: "prompt", promptId: "creative-image-prompt", label: "Video Motion Prompt", category: "creative", icon: "Clapperboard" },
            { type: "prompt", promptId: "visual-brand-hero", label: "Animated Marketing Video", category: "creative", icon: "Video", providerId: VIDEO_PROVIDER, modelId: VIDEO_MODEL, outputModality: "video" },
            { type: "prompt", promptId: "marketing-social-media", label: "Social Media Captions", category: "marketing", icon: "Share2" },
            {
                type: "human-task",
                label: "Distribute the video",
                guidance: "Your Marketing Video and Social Media Captions have been generated. Click each step above to review, download, and share.\n\nThe video is optimised for social media. Download it and upload natively to each platform for best reach.",
                checklist: [
                    "Download the video and review on mobile",
                    "Upload natively to LinkedIn, Instagram, and/or TikTok",
                    "Add the generated captions to each post",
                    "Schedule posts for optimal engagement times",
                ],
            },
        ]
        const { nodes, edges } = buildTemplate(steps)
        return {
            id: "marketing-video-pipeline",
            name: "Marketing Video Pipeline",
            description: "Create a marketing video from scratch: product brief, scene description, hero image generation, image-to-video animation, and social media distribution — with review checkpoints.",
            category: "business" as const,
            icon: "Video",
            nodeCount: steps.length,
            nodes,
            edges,
            whyItMatters: "Video content gets 2-3x more engagement than static images on every platform. This workflow generates a complete video asset — from product brief through AI image generation, animation with MiniMax Hailuo, and social media captions — in under an hour instead of days with a video editor.",
            estimatedTime: "1-2 hours",
        }
    })(),
]
