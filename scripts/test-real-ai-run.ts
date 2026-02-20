/**
 * @file test-real-ai-run.ts
 *
 * @description End-to-end test of the "Seed Round Fundraise" workflow template
 * using REAL AI calls (Google Gemini 2.5 Flash for text, Google Gemini for images).
 * Chains node outputs sequentially, assembles the final markdown artifact,
 * and saves everything to the database.
 *
 * Run: npx tsx scripts/test-real-ai-run.ts
 *
 * @security Uses service role key and API keys — test script only, never deploy
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// ─── Load environment ───────────────────────────────────────────────
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const googleApiKey = process.env.GOOGLE_AI_API_KEY

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
}

if (!googleApiKey) {
    console.error('Missing GOOGLE_AI_API_KEY in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Test user credentials ──────────────────────────────────────────
const TEST_EMAIL = 'founder@centauros.ai'
const TEST_PASSWORD = 'centaurOS2026!'

// ─── System prompt (same as /api/agents/execute) ────────────────────
const SYSTEM_PROMPT = `You are a world-class business strategist and AI assistant helping startup founders and operators build, grow, and scale their companies.

## Your Standards
- Be direct and actionable. Every recommendation should be something the reader can act on this week.
- Write for busy founders — use clear structure, short paragraphs, and bullet points. No filler, no fluff, no corporate speak.
- Use markdown formatting: headers for sections, tables for comparative data, bold for key terms, bullet points for lists.
- When presenting numbers, use tables. When comparing options, use tables. When showing timelines, use tables.

## Honesty & Accuracy
- Clearly distinguish between: (1) data the user provided, (2) widely-accepted industry knowledge, and (3) your estimates or assumptions.
- Flag assumptions explicitly: "Assumption: ..." or mark estimates with "~" or "[estimated]".
- Never fabricate specific statistics, company names, or benchmark numbers. If you don't have real data, say so and provide ranges or directional guidance instead.
- When uncertain, say "I'd recommend validating this with..." rather than presenting guesses as facts.

## Output Quality
- Prioritize depth on the 2-3 most important points over shallow coverage of everything.
- End with clear next steps: who does what, by when.
- If the user's input is missing critical information, note what's missing and work with what you have rather than asking questions (since this is a one-shot prompt, not a conversation).
- Calibrate your response length to the complexity of the request — don't pad short answers.`

// ─── NovaBuild case study input ─────────────────────────────────────
const NOVABUILD_INPUT = `Company: NovaBuild — AI-powered construction project management
Stage: Pre-seed, 8 months old
Team: 3 co-founders (ex-Autodesk PM, ex-McKinsey, Stanford CS PhD)
Traction: 12 pilot customers, £180K ARR, 40% MoM growth
Target raise: £2.5M seed round
Use of funds: 60% engineering (hire 4), 25% sales (hire 2), 15% ops
Cap table: Founders hold 85%, angel investors 10%, ESOP 5%
Previous funding: £350K pre-seed from angels
Target investors: Foundamental, Brick & Mortar Ventures, Concrete VC
Warm connections: Intro to Foundamental via YC alumni network
Key metric: Reduces project delays by 34% (validated across 12 pilots)
Differentiator: Only platform that combines BIM data with real-time site sensor feeds using computer vision`

// ─── Prompt templates (from prompt-library.ts) ──────────────────────
// We only need the defaultPrompt for each node's promptId

const PROMPT_TEMPLATES: Record<string, string> = {
    'startup-vision-mission': `You are a world-class startup advisor who has helped hundreds of companies articulate their purpose.

{{input}}

Based on the above, craft:
1. A bold VISION statement (what the world looks like if you succeed — 1 sentence)
2. A clear MISSION statement (what you do, for whom, and why it matters — 1-2 sentences)
3. A set of 3-5 core VALUES that will guide the team's decisions

**If the input includes existing vision/mission statements**, critique and improve them rather than starting from scratch. Explain what's weak and why the revision is stronger.
**If the input is a description of the company**, craft new statements from scratch.

First, analyze: What is genuinely unique about this company? What would be lost if they didn't exist? Who specifically would miss them? This emotional core should drive the vision.

For each, explain the strategic thinking behind your choice. Make it memorable, authentic, and specific — avoid generic platitudes.

**Anti-patterns to avoid:**
- Vision statements that could apply to any company ("To make the world a better place")
- Mission statements that describe features instead of impact
- Values that are just nice words without behavioral implications ("Integrity," "Excellence")
- More than 5 values (nobody remembers them)

**Examples of strong vision statements:**
- Tesla: "To accelerate the world's transition to sustainable energy."
- Stripe: "To increase the GDP of the internet."
**Example of a strong value (specific, not generic):**
- "Default to transparency" (not "We value honesty") — this tells you what to DO, not just what to believe.

**Before finalizing, verify:** (1) Could another company use these exact same statements? If yes, they're not specific enough. (2) Does the vision describe a future state, not what you do today? (3) Does each value tell employees what to DO in a difficult situation?`,

    'startup-market-sizing': `You are a market analysis expert who prepares sizing estimates for VC-backed companies.

{{input}}

Calculate market size using both top-down and bottom-up approaches:

**Top-Down (TAM -> SAM -> SOM)**
- TAM: Total addressable market (global, all segments)
- SAM: Serviceable addressable market (your geography + segments you CAN reach)
- SOM: Serviceable obtainable market (realistic 3-year capture)
- Show the logic chain and data sources for each number

**Bottom-Up (more credible for investors)**
- Number of potential customers in target segment
- Average revenue per customer (ACV)
- Realistic penetration rate by year
- Bottom-up SOM = customers × ACV × penetration

**Market Dynamics**
- Growth rate (CAGR)
- Key trends driving growth
- Risks that could shrink the market

Present numbers in a clear table. Flag where you're making assumptions vs. citing data.

**Before finalizing, verify:** (1) Do TAM > SAM > SOM numbers make logical sense? (2) Does the bottom-up estimate roughly triangulate with the top-down? (3) Would a skeptical VC find the SOM number credible? (4) Are all assumptions explicitly labeled?`,

    'fundraising-financial-projections': `You are a startup CFO who builds investor-grade financial models.

{{input}}

**If the input includes actual financials** (revenue, costs, metrics), build projections from real data.
**If the input is limited** (just a business model or pricing), build a bottom-up model with clearly marked assumptions and provide the framework for the user to plug in real numbers.
**If no financial data is provided**, explain what inputs are needed and provide a template structure.

Create a 3-year financial projection narrative:

**Revenue Model**
- Year 1, 2, 3 revenue projections
- Key drivers (customers × ARPU, or units × price)
- Growth rate assumptions and justification
- Revenue mix (if multiple streams)

**Cost Structure**
- COGS and gross margin trajectory
- Operating expenses by category (people, marketing, infrastructure)
- Headcount plan by department

**Key Metrics by Year**
| Metric | Year 1 | Year 2 | Year 3 |
- MRR/ARR, customers, ARPU, churn, CAC, LTV, gross margin, burn rate, revenue

**Path to Profitability**
- When do you break even?
- What needs to be true?

**Assumptions & Sensitivities**
- Top 5 assumptions that drive the model
- Bull/base/bear scenarios

Make the numbers tell a story. Show the "why" behind every number.

**Data Integrity:** For every number in the projection, label the source: [FROM INPUT], [CALCULATED], or [ASSUMPTION]. Clearly state the top 5 assumptions driving the model. Never present made-up revenue figures as real — use ranges and scenarios when data is limited.

**Example metrics table format:**
| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| ARR | £480K [CALCULATED] | £1.8M [ASSUMPTION: 275% growth] | £5.4M [ASSUMPTION: 200% growth] |
| Customers | 40 | 120 | 300 |
| ARPU | £1,000/mo | £1,250/mo | £1,500/mo |
| Gross Margin | 72% | 78% | 82% |`,

    'fundraising-pitch-deck': `You are a pitch deck expert who has helped raise £500M+ across 100+ rounds. You also have an eye for visual design — you know that a great deck is 50% narrative and 50% visual impact.

{{input}}

**If the input is detailed** (metrics, team bios, competitive data), create a ready-to-use pitch deck narrative with visual direction.
**If the input is sparse** (just an idea or rough description), create a structured framework with placeholders clearly marked as [FILL IN: specific data needed] and focus on the narrative arc and messaging strategy.

Write the narrative for a pitch deck (slide by slide). For EACH slide provide ALL of the following:

1. **Headline** — max 10 words, the single takeaway (should tell the story alone)
2. **Content** — 3-5 bullet points, max 8 words per bullet
3. **Speaker Notes** — what the presenter says out loud (conversational, 3-4 sentences)
4. **Visual Direction** — describe exactly what should appear on the slide visually

---

**Slide 1: Title** — Company name, one-line description, round details
**Slide 2: Problem** — The pain point, who feels it, how big it is
**Slide 3: Solution** — Your product, how it works
**Slide 4: Demo/Product** — Key screenshots or feature highlights
**Slide 5: Market** — TAM/SAM/SOM with credible sources
**Slide 6: Business Model** — How you make money, pricing, unit economics
**Slide 7: Traction** — The hockey stick
**Slide 8: Competition** — Why you win
**Slide 9: Team** — Why THIS team can execute
**Slide 10: Financials** — Projections, key assumptions
**Slide 11: The Ask** — How much, what for, milestones
**Slide 12: Vision** — The big picture

**Before finalizing, verify:** (1) Could someone build these slides in Gamma or Canva using ONLY your Visual Direction? (2) Do the headlines alone tell the full story? (3) Is every Visual Element specific enough to render?`,

    'visual-slide-generator': `Create a professional, modern presentation slide image based on the following content. The slide should look like it belongs in a world-class pitch deck or board presentation.

Design requirements:
- Clean, minimal layout with generous whitespace
- Dark navy or charcoal background with white/light text for maximum impact
- Use orange (#FF4500) as the accent color for key data points and highlights
- Professional sans-serif typography (like Helvetica or Inter)
- Include relevant data visualisation (charts, graphs, metrics) if the content contains numbers
- No stock photo clichés — use abstract geometric shapes, gradients, or data-driven graphics
- 16:9 aspect ratio suitable for presentation slides

Content to visualise:
{{input}}

Generate one hero slide that captures the most important insight from the content above.`,

    'fundraising-investor-qa': `You are a pitch coach who has prepped 500+ founder pitches.

{{input}}

Prepare answers for the top investor questions by category:

**Market (10 questions)**
1. How big is the market? 2. Why now? 3. How fast is it growing? ...

**Product (10 questions)**
1. How does it work? 2. What's your unfair advantage? 3. What's the IP situation? ...

**Business Model (10 questions)**
1. How do you make money? 2. What are your unit economics? 3. What's your pricing? ...

**Traction (10 questions)**
1. What's your MRR? 2. Growth rate? 3. Who are your biggest customers? ...

**Team (5 questions)**
1. Why are you the right team? 2. What's missing? 3. How did the founders meet? ...

**Fundraise (5 questions)**
1. How much are you raising? 2. What will you do with it? 3. What's your runway? ...

**If detailed company information is provided**, write specific, ready-to-use answers.
**If the input is limited**, provide answer frameworks with [FILL IN: specific data point needed] markers.

First, identify: What are the 3 HARDEST questions this specific company will face?

For each question, provide:
- A strong, concise answer (2-3 sentences)
- Data points to reference
- Common pitfalls to avoid
- **The follow-up question the investor will ask** (and how to handle it)

**Before finalizing, verify:** (1) Are the answers honest? (2) Does each answer end with confidence, not defensiveness? (3) Are the hardest questions addressed head-on, not dodged?`,

    'fundraising-warm-intro': `You are a fundraising communications expert who has crafted 300+ warm intro requests resulting in a 60%+ conversion rate.

{{input}}

Write TWO emails:

**Email 1: To the mutual connection (requesting the intro)**
- Brief, respectful, easy to forward
- Why this investor is a good fit
- 2-3 sentence "forwardable blurb" about your company
- Make it easy to say yes or no

**Email 2: The "forwardable blurb" (what gets forwarded to the investor)**
- One line: what you do
- One line: traction/proof
- One line: why this investor specifically
- One line: the ask (a 20-minute call)

Guidelines:
- Keep Email 1 under 150 words
- Keep Email 2 under 100 words
- Be specific about WHY this investor (thesis fit, portfolio synergies)
- Never be desperate — you're offering an opportunity, not begging

**Before finalizing, verify:** (1) Is the forwardable blurb compelling enough that you'd forward it yourself? (2) Is there a specific reason this investor (not just "they invest in SaaS")? (3) Is the ask low-commitment?`,

    'fundraising-due-diligence': `You are a due diligence expert who has managed 200+ DD processes.

{{input}}

**If the company is pre-seed/seed**, provide a lighter-touch checklist — investors expect less documentation at this stage.
**If the company is Series A+**, provide the full enterprise-grade checklist.

Create a due diligence preparation checklist:

**Corporate & Legal**
- Certificate of incorporation, bylaws, board minutes, cap table, IP assignments, material contracts

**Financial**
- Financial statements, bank statements, revenue breakdown, burn rate, outstanding debts

**Product & Technology**
- Architecture overview, security practices, key technical risks, IP portfolio

**Team**
- Org chart, key employee agreements, option grants, key person risk

**Commercial**
- Customer contracts, pipeline, churn data, NPS

**For each item:**
| Document | Status | Owner | Est. Time to Prepare | Priority |

**Common DD Killers** (fix these first):
- Missing IP assignments
- Messy cap table
- No employment agreements
- Customer concentration >30%

**Before finalizing, verify:** (1) Are the highest-priority items ready or in progress? (2) Is the timeline realistic? (3) Are there any skeletons that should be proactively disclosed?`,

    'fundraising-post-raise': `You are a startup PR and communications expert who has managed 75+ post-raise announcement campaigns.

{{input}}

Create a post-raise communication plan:

**Day 1: Internal** (always first — your team should never learn from Twitter)
- All-hands announcement, FAQ for team questions

**Day 1-2: Investors**
- Thank you email to new investors
- Update to existing investors
- Thank you to people who made intros

**Day 3-5: Public Announcement** (if applicable)
- Press release draft
- Blog post announcement
- Social media posts

**Day 5-7: Recruitment Push**
- "We just raised £X" job posts
- Updated careers page messaging

**Week 2: Customer/Partner Communication**
- Email to customers
- Partner outreach

**Ongoing**
- Monthly investor update cadence
- Board meeting scheduling
- 90-day post-raise milestone planning

**Before finalizing, verify:** (1) Is internal communication happening BEFORE the public announcement? (2) Are investor thank-yous personalized? (3) Is the recruitment push ready to capitalize on the news cycle?`,
}

// ─── Types ──────────────────────────────────────────────────────────

interface NodeData {
    promptId?: string
    label: string
    description?: string
    category?: string
    icon?: string
    userInput?: string
    output?: string
    executionStatus?: string
    isHumanTask?: boolean
    guidance?: string
    checklist?: string[]
    checklistCompleted?: boolean[]
    providerId?: string
    modelId?: string
    outputModality?: string
}

interface WorkflowNode {
    id: string
    type: string
    position: { x: number; y: number }
    data: NodeData
}

interface WorkflowEdge {
    id: string
    source: string
    target: string
    animated?: boolean
}

// ─── Topological sort (from export-markdown.ts) ─────────────────────

function getOrderedNodeIds(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
    const edgeMap = new Map(edges.map((e) => [e.source, e.target]))
    const targets = new Set(edges.map((e) => e.target))

    let currentId = nodes.find((n) => !targets.has(n.id))?.id
    const ordered: string[] = []
    const visited = new Set<string>()

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId)
        if (nodes.find((n) => n.id === currentId)) ordered.push(currentId)
        currentId = edgeMap.get(currentId)
    }

    for (const n of nodes) {
        if (!visited.has(n.id)) ordered.push(n.id)
    }

    return ordered
}

// ─── Markdown assembly (from export-markdown.ts) ────────────────────

function statusIcon(status?: string): string {
    switch (status) {
        case 'approved': return '✅'
        case 'review': return '🔶'
        case 'running': return '⏳'
        case 'error': return '❌'
        default: return '⬜'
    }
}

function generateWorkflowMarkdown(
    workflowName: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): string {
    const orderedIds = getOrderedNodeIds(nodes, edges)
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))
    const completedCount = nodes.filter((n) => n.data.executionStatus === 'approved').length

    const lines: string[] = []
    lines.push(`# ${workflowName || 'Workflow Results'}`)
    lines.push('')
    lines.push(`**Generated:** ${new Date().toLocaleString()}  `)
    lines.push(`**Steps:** ${nodes.length} | **Completed:** ${completedCount}/${nodes.length}`)
    lines.push('')
    lines.push('---')
    lines.push('')

    orderedIds.forEach((id, i) => {
        const node = nodeMap.get(id)
        if (!node) return

        const data = node.data
        const stepNum = i + 1
        const icon = statusIcon(data.executionStatus)
        const isHuman = node.type === 'human-task' || data.isHumanTask

        lines.push(`## ${icon} Step ${stepNum}: ${data.label || 'Untitled'}`)
        lines.push('')

        if (isHuman) {
            lines.push('> **Type:** Human checkpoint')
            lines.push('')
            if (data.guidance) {
                lines.push('### Guidance')
                lines.push('')
                lines.push(data.guidance)
                lines.push('')
            }
            if (data.checklist && data.checklist.length > 0) {
                lines.push('### Checklist')
                lines.push('')
                data.checklist.forEach((item, ci) => {
                    const done = data.checklistCompleted?.[ci] ?? false
                    lines.push(`- [${done ? 'x' : ' '}] ${item}`)
                })
                lines.push('')
            }
        } else {
            if (data.userInput?.trim()) {
                lines.push('### Input')
                lines.push('')
                lines.push('```')
                lines.push(data.userInput.trim())
                lines.push('```')
                lines.push('')
            }
            if (data.output?.trim()) {
                lines.push('### Output')
                lines.push('')
                lines.push(data.output.trim())
                lines.push('')
            }
        }

        lines.push('---')
        lines.push('')
    })

    return lines.join('\n')
}

// ─── AI call helpers ────────────────────────────────────────────────

/**
 * Calls Google Gemini via the SDK for text generation (streaming).
 * Returns the full text output.
 */
async function callGeminiText(prompt: string, input: string): Promise<string> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(googleApiKey!)
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

    const finalPrompt = prompt.replace(/\{\{input\}\}/g, input)
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${finalPrompt}`

    const result = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
            maxOutputTokens: 16384,
        },
    })

    let fullOutput = ''
    let chunkCount = 0

    for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) {
            fullOutput += text
            chunkCount++
            // Print a dot every 10 chunks to show progress
            if (chunkCount % 10 === 0) {
                process.stdout.write('.')
            }
        }
    }

    return fullOutput
}

/**
 * Calls Google Gemini for image generation.
 * Returns a data URI or URL.
 */
async function callGoogleImage(prompt: string, input: string): Promise<string> {
    const finalPrompt = prompt.replace(/\{\{input\}\}/g, input)

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${googleApiKey}`

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: finalPrompt }] }],
            generationConfig: {
                responseModalities: ['IMAGE', 'TEXT'],
            },
        }),
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`Google AI image error (${response.status}): ${err}`)
    }

    const data = await response.json()
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const imagePart = parts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData)

    if (!imagePart?.inlineData) {
        // Check if there's text output instead (some models return text descriptions)
        const textPart = parts.find((p: { text?: string }) => p.text)
        if (textPart?.text) {
            return `[Image generation returned text instead: ${textPart.text.substring(0, 200)}]`
        }
        throw new Error('No image data returned from Gemini')
    }

    const { mimeType, data: base64 } = imagePart.inlineData
    // Return just the first 100 chars of base64 for logging, but store the full URI
    const dataUri = `data:${mimeType};base64,${base64}`
    console.log(`  Image generated: ${mimeType}, ${Math.round(base64.length / 1024)}KB`)
    return dataUri
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════')
    console.log('  REAL AI TEST: Seed Round Fundraise × NovaBuild')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')

    const overallStart = Date.now()

    // 1. Authenticate
    console.log('1. Authenticating as test user...')
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
    })

    if (authError || !authData.user) {
        console.error('Authentication failed:', authError?.message)
        process.exit(1)
    }

    const userId = authData.user.id
    console.log(`  ✓ Logged in as ${TEST_EMAIL} (${userId})`)

    // 2. Get foundry ID
    const { data: profile } = await supabase
        .from('profiles')
        .select('foundry_id, active_foundry_id')
        .eq('id', userId)
        .single()

    const foundryId = profile?.active_foundry_id || profile?.foundry_id
    if (!foundryId) {
        console.error('No foundry found for user')
        process.exit(1)
    }
    console.log(`  ✓ Foundry: ${foundryId}`)
    console.log('')

    // 3. Load the template
    console.log('2. Loading Seed Round Fundraise template...')

    // Dynamic import of the workflow templates
    const { WORKFLOW_TEMPLATES } = await import(
        '../src/app/(platform)/agents/lib/workflow-templates.js'
    )

    const template = WORKFLOW_TEMPLATES.find(
        (t: { id: string }) => t.id === 'seed-round-fundraise'
    )

    if (!template) {
        console.error('Template "seed-round-fundraise" not found')
        process.exit(1)
    }

    const nodes: WorkflowNode[] = template.nodes as WorkflowNode[]
    const edges: WorkflowEdge[] = template.edges as WorkflowEdge[]
    const orderedIds = getOrderedNodeIds(nodes, edges)

    const promptNodes = nodes.filter((n) => n.type === 'prompt')
    const humanNodes = nodes.filter((n) => n.type === 'human-task')

    console.log(`  ✓ Template: ${template.name}`)
    console.log(`  ✓ Nodes: ${nodes.length} total (${promptNodes.length} prompt, ${humanNodes.length} human)`)
    console.log(`  ✓ Execution order: ${orderedIds.join(' → ')}`)
    console.log('')

    // 4. Execute nodes sequentially
    console.log('3. Executing nodes with REAL AI...')
    console.log('─'.repeat(60))

    // Build a node map for quick lookup
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))

    // Track cumulative output for chaining
    let cumulativeOutput = NOVABUILD_INPUT
    const nodeOutputs: Record<string, string> = {}
    const nodeTimes: Record<string, number> = {}

    for (let i = 0; i < orderedIds.length; i++) {
        const nodeId = orderedIds[i]
        const node = nodeMap.get(nodeId)
        if (!node) continue

        const stepNum = i + 1
        const isHuman = node.type === 'human-task' || node.data.isHumanTask
        const nodeStart = Date.now()

        if (isHuman) {
            // Human checkpoint — mark as approved, no AI call
            console.log(`\n[${stepNum}/${orderedIds.length}] 👤 ${node.data.label} (human — auto-approved)`)
            node.data.executionStatus = 'approved'
            node.data.checklistCompleted = node.data.checklist?.map(() => true) ?? []
            nodeOutputs[nodeId] = `[Human checkpoint completed: ${node.data.label}]`
            nodeTimes[nodeId] = Date.now() - nodeStart
            continue
        }

        // Prompt node — call real AI
        const promptId = node.data.promptId
        const modality = node.data.outputModality || 'text'
        const promptTemplate = promptId ? PROMPT_TEMPLATES[promptId] : null

        if (!promptTemplate) {
            console.log(`\n[${stepNum}/${orderedIds.length}] ⚠️  ${node.data.label} — no prompt template for "${promptId}", skipping`)
            node.data.executionStatus = 'error'
            node.data.output = `[Missing prompt template: ${promptId}]`
            nodeOutputs[nodeId] = node.data.output
            nodeTimes[nodeId] = Date.now() - nodeStart
            continue
        }

        console.log(`\n[${stepNum}/${orderedIds.length}] 🤖 ${node.data.label}`)
        console.log(`  Provider: ${modality === 'image' ? 'Google Gemini (image)' : 'Google Gemini 2.5 Flash'}`)
        console.log(`  Modality: ${modality}`)
        console.log(`  Input length: ${cumulativeOutput.length.toLocaleString()} chars`)
        process.stdout.write('  Generating')

        try {
            let output: string

            if (modality === 'image') {
                process.stdout.write('...')
                output = await callGoogleImage(promptTemplate, cumulativeOutput)
                // For image nodes, we store the data URI as output
                // but don't chain the image base64 to subsequent text nodes
                console.log(' ✓')
            } else {
                output = await callGeminiText(promptTemplate, cumulativeOutput)
                console.log(` ✓ (${output.length.toLocaleString()} chars)`)
            }

            node.data.userInput = cumulativeOutput.substring(0, 5000) // Truncate for storage
            node.data.output = output
            node.data.executionStatus = 'approved'
            nodeOutputs[nodeId] = output

            // Chain: for text outputs, the next node gets this output as its input
            // For image outputs, keep the previous cumulative text
            if (modality !== 'image') {
                cumulativeOutput = output
            }

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            console.log(` ❌ ERROR: ${message}`)
            node.data.executionStatus = 'error'
            node.data.output = `[Error: ${message}]`
            nodeOutputs[nodeId] = node.data.output
        }

        nodeTimes[nodeId] = Date.now() - nodeStart
        console.log(`  Time: ${(nodeTimes[nodeId] / 1000).toFixed(1)}s`)
    }

    console.log('')
    console.log('─'.repeat(60))
    console.log('')

    // 5. Assemble markdown artifact
    console.log('4. Assembling markdown artifact...')
    const markdown = generateWorkflowMarkdown(template.name, nodes, edges)
    console.log(`  ✓ Markdown: ${markdown.length.toLocaleString()} chars`)
    console.log('')

    // 6. Save to database
    console.log('5. Saving to database...')

    // Insert workflow run
    const { data: runData, error: runError } = await supabase
        .from('agent_workflow_runs')
        .insert({
            workflow_id: null, // template IDs are slugs, not UUIDs
            foundry_id: foundryId,
            run_by: userId,
            status: 'completed',
            workflow_name: `${template.name} [REAL AI] [${template.id}]`,
            node_count: nodes.length,
            nodes_completed: nodes.length,
            node_outputs: nodeOutputs,
            started_at: new Date(overallStart).toISOString(),
            completed_at: new Date().toISOString(),
        })
        .select('id')
        .single()

    if (runError) {
        console.error(`  ❌ Failed to create workflow run: ${runError.message}`)
    } else {
        console.log(`  ✓ Workflow run: ${runData.id}`)
    }

    // Insert artifact
    const { data: artifactData, error: artifactError } = await supabase
        .from('agent_artifacts')
        .insert({
            run_id: runData?.id ?? null,
            workflow_id: null,
            foundry_id: foundryId,
            created_by: userId,
            title: `${template.name} — NovaBuild (Real AI)`,
            content: markdown,
            content_type: 'report',
            metadata: {
                template_id: template.id,
                company: 'NovaBuild',
                test_type: 'real_ai',
                node_count: nodes.length,
                prompt_nodes: promptNodes.length,
                human_nodes: humanNodes.length,
                providers_used: ['google'],
            },
        })
        .select('id')
        .single()

    if (artifactError) {
        console.error(`  ❌ Failed to create artifact: ${artifactError.message}`)
    } else {
        console.log(`  ✓ Artifact: ${artifactData.id}`)
    }

    // 7. Summary
    const totalTime = Date.now() - overallStart
    console.log('')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('  RESULTS')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')
    console.log(`  Template:       ${template.name}`)
    console.log(`  Company:        NovaBuild`)
    console.log(`  Total time:     ${(totalTime / 1000).toFixed(1)}s`)
    console.log(`  Artifact size:  ${markdown.length.toLocaleString()} chars`)
    console.log(`  Workflow run:   ${runData?.id ?? 'FAILED'}`)
    console.log(`  Artifact ID:    ${artifactData?.id ?? 'FAILED'}`)
    console.log('')

    // Per-node timing
    console.log('  Per-node timing:')
    orderedIds.forEach((id, i) => {
        const node = nodeMap.get(id)
        if (!node) return
        const time = nodeTimes[id] ?? 0
        const isHuman = node.type === 'human-task'
        const status = node.data.executionStatus === 'approved' ? '✅' : '❌'
        const outputLen = nodeOutputs[id]?.length ?? 0
        console.log(
            `    ${status} ${(i + 1).toString().padStart(2)}. ${node.data.label.padEnd(35)} ${(time / 1000).toFixed(1).padStart(6)}s  ${isHuman ? '(human)' : `${outputLen.toLocaleString()} chars`}`
        )
    })

    console.log('')

    // Preview of first prompt output
    const firstPromptOutput = Object.values(nodeOutputs).find(
        (v) => v && !v.startsWith('[Human') && !v.startsWith('[Error') && !v.startsWith('data:')
    )
    if (firstPromptOutput) {
        console.log('  First AI output preview (500 chars):')
        console.log('  ' + '─'.repeat(56))
        console.log('  ' + firstPromptOutput.substring(0, 500).replace(/\n/g, '\n  '))
        console.log('  ' + '─'.repeat(56))
    }

    console.log('')
    console.log('Done! ✅')
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
