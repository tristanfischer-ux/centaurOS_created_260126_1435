/**
 * @file test-startup-templates.ts
 *
 * @description Pipeline test for ALL workflow templates (startup + business + manufacturing).
 * Exercises the full artifact pipeline WITHOUT making AI API calls:
 *   Template loading → Node ordering → Input resolution → Mock output →
 *   Markdown assembly → DB persistence → Verification
 *
 * Run: npx tsx scripts/test-startup-templates.ts
 *
 * @security Uses service role key — test script only, never deploy
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// ─── Load environment ───────────────────────────────────────────────
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Test user credentials ──────────────────────────────────────────
const TEST_EMAIL = 'founder@centauros.ai'
const TEST_PASSWORD = 'centaurOS2026!'

// ─── Types (minimal, matching the codebase) ─────────────────────────

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

interface WorkflowTemplate {
    id: string
    name: string
    description: string
    category: string
    icon: string
    nodeCount: number
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
    whyItMatters: string
    estimatedTime?: string
}

// ─── Dummy case studies for ALL templates ───────────────────────────

const CASE_STUDIES: Record<string, { company: string; input: string }> = {
    // ── Startup Templates (8) ───────────────────────────────────────
    'seed-round-fundraise': {
        company: 'NovaBuild',
        input: `Company: NovaBuild — AI-powered construction project management
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
Differentiator: Only platform that combines BIM data with real-time site sensor feeds using computer vision`,
    },

    'go-to-market-launch': {
        company: 'HealthPulse',
        input: `Company: HealthPulse — Remote patient monitoring for chronic conditions
ICP: Mid-size cardiology clinics (5-20 physicians), US-based, already using EHR
Value proposition: "Cut cardiac readmissions by 45% with AI-powered remote monitoring that integrates with your existing EHR in under 2 hours"
Top 3 differentiators vs. alternatives:
1. 2-hour EHR integration (competitors take 6-8 weeks)
2. FDA-cleared AI triage that reduces false alerts by 78%
3. Patient app with 89% daily engagement rate (industry avg: 23%)
Current state: FDA 510(k) cleared, 3 paying clinics, launching publicly
Pricing: £299/patient/month (avg clinic monitors 200 patients = £59.8K/mo)
Target: 50 clinics in first 12 months`,
    },

    'startup-operating-rhythm': {
        company: 'DataForge',
        input: `Company: DataForge — Real-time analytics SaaS for e-commerce
Last quarter results:
- ARR grew from £1.2M to £1.8M (50% QoQ)
- Net revenue retention: 135%
- Churn: 2.1% monthly (down from 3.4%)
- Team: grew from 18 to 26 people
- Shipped: real-time dashboards, Shopify integration, custom alerts
Top 3 priorities this quarter:
1. Launch enterprise tier (>£50K ACV accounts)
2. Reduce onboarding time from 14 days to 3 days
3. Hire VP Engineering and VP Sales
Department lead input:
- Engineering: Tech debt slowing feature velocity, need dedicated sprint
- Sales: Pipeline is 4x target but close rate dropping (38% → 29%)
- CS: Onboarding bottleneck is data migration, not product complexity
- Marketing: Organic traffic up 120% but conversion rate flat at 2.1%`,
    },

    'startup-business-plan': {
        company: 'GreenLoop',
        input: `Company: GreenLoop — B2B circular economy marketplace for industrial materials
Industry reports: Global circular economy market projected at £4.5T by 2030 (Ellen MacArthur Foundation)
Top 5 competitors:
1. Rubicon (waste management, £800M raised, public via SPAC) — broad waste focus, not materials
2. Rheaply (asset exchange, Series A) — internal enterprise focus, not cross-company
3. Cirplus (plastics marketplace, seed) — plastics only, EU-focused
4. Materiom (open-source materials, grant-funded) — research, not commercial
5. Traditional brokers (fragmented, offline) — no tech, high fees (15-25%)
Financials: £420K ARR, 85% gross margin, £38K MRR, 18-month runway
Customer feedback: "Finally, a platform where I can sell my PET waste without calling 20 brokers" — Head of Sustainability, Unilever
Validation: 340 registered companies, 89 active traders, £2.1M GMV in last 6 months
Key insight: Industrial materials waste worth £180B/year goes to landfill that could be recycled`,
    },

    'pivot-decision': {
        company: 'QuickShip',
        input: `Company: QuickShip — Same-day B2B delivery platform
Current metrics:
- MRR: £85K (flat for 4 months)
- Churn: 8.2% monthly (up from 5.1% six months ago)
- NPS: 18 (down from 42)
- Activation rate: 34% of signups complete first delivery
- Revenue per customer: declining from £420/mo to £310/mo
- CAC: £1,200 (LTV:CAC ratio now 1.4:1)
Qualitative feedback from CS team:
- "Customers love speed but hate reliability — 23% of deliveries are late"
- "Enterprise clients want SLAs we can't meet with our current driver network"
- "Three customers left for in-house solutions this month"
What's working: Same-day promise resonates, brand recognition growing, driver app rated 4.7 stars
What's not working: Unit economics underwater at current scale, reliability issues, enterprise segment underserved
Cash position: 9 months runway at current burn`,
    },

    'cash-crisis-playbook': {
        company: 'BrightEdge',
        input: `Company: BrightEdge — AI tutoring platform for K-12
Current bank balance: £340,000
Monthly burn rate: £95,000
Upcoming payment obligations:
- 30 days: £42K (AWS hosting, salaries)
- 60 days: £38K (office lease renewal, contractor payments)
- 90 days: £95K (annual software licenses due, Q1 tax payment)
Months of runway remaining: 3.6 months
Top 5 largest expense line items:
1. Salaries & benefits: £52K/month (12 FTEs)
2. AWS/infrastructure: £18K/month (scaling with users)
3. Office lease: £8K/month (locked until March 2027)
4. Marketing & ads: £7K/month (Google Ads, content)
5. Contractors: £6K/month (2 part-time engineers)
Additional context: Series A round fell through last month when lead investor pulled out. ARR is £380K but growth stalled at 3% MoM. School district sales cycle is 6-9 months.`,
    },

    'pitch-deck-creation': {
        company: 'AeroSense',
        input: `Founding story: Two aerospace engineers who spent 10 years inspecting wind turbines by rope decided there had to be a better way. After a near-fatal fall in 2024, they built AeroSense — autonomous drone inspection that's 10x faster, 50x safer, and catches defects human inspectors miss.
Key traction metrics:
- £620K ARR, growing 25% MoM
- 18 wind farm customers across UK, Denmark, and Germany
- 4,200 turbines inspected (23,000 blades analysed)
- Defect detection accuracy: 97.3% (vs. 71% for manual inspection)
- 0 safety incidents in 14 months of operation
Team:
- CEO: Dr. Sarah Chen — 10yr aerospace eng, ex-Rolls-Royce, PhD Cambridge
- CTO: Marcus Webb — 8yr robotics, ex-DJI, led team of 30
- VP Sales: James Park — 12yr energy sales, ex-Vestas, built £40M pipeline
The ask:
- Raising: £5M Series A
- Use of funds: 40% R&D (solar panel inspection), 35% sales (EU expansion), 25% ops
- Timeline: Close by end of Q2 2026
- Existing investors: Seedcamp, Climate-KIC (£1.5M seed in 2024)`,
    },

    'investor-relations-cadence': {
        company: 'PayFlow',
        input: `Company: PayFlow — Embedded payments infrastructure for vertical SaaS
Key metrics this quarter:
- ARR: £3.8M (up from £2.9M last quarter, 31% QoQ growth)
- Net revenue retention: 148%
- Gross margin: 72%
- Monthly burn: £180K
- Runway: 22 months
- TPV (Total Payment Volume): £890M annualised
Top 3 wins:
1. Signed largest customer ever — PropertyStack (£480K ACV)
2. Launched in 3 new verticals (fitness, veterinary, dental)
3. Achieved SOC 2 Type II certification
Top 3 challenges:
1. VP Engineering departed — interim CTO in place, searching for replacement
2. Stripe announced competing feature (but limited to US, we're UK/EU focused)
3. Onboarding time increased from 2 weeks to 4 weeks due to compliance requirements
Key hires: Head of Compliance (ex-Wise), Senior Solutions Architect (ex-Adyen)
Departures: VP Engineering (personal reasons, amicable)
Strategy changes: Expanding to EU (Germany, France) ahead of schedule due to partner demand
Investors: Index Ventures (lead), Balderton, firstminute capital`,
    },

    // ── Business Templates (13) ─────────────────────────────────────
    'product-launch-campaign': {
        company: 'SnapHire',
        input: `Product: SnapHire 2.0 — AI-powered video interview platform
Features: One-way video interviews, AI candidate scoring, calendar integration, ATS sync, mobile app
Benefits: Reduces time-to-hire by 60%, eliminates scheduling overhead, removes unconscious bias with structured scoring
Pricing: Starter £99/mo (50 interviews), Growth £299/mo (200 interviews), Enterprise custom
Target audience: HR managers and talent acquisition leads at companies with 100-2000 employees, primarily tech and professional services
Campaign goals: 500 free trial signups in first 30 days, 50 paid conversions, 10 enterprise demos
Brand guidelines: Professional but approachable, blue/white colour scheme, tone is "smart friend who happens to be an HR expert"
Launch date: March 15, 2026`,
    },

    'content-marketing-pipeline': {
        company: 'CloudSecure',
        input: `Company: CloudSecure — Cloud security posture management for mid-market
3-5 content themes for Q2 2026:
1. "Zero Trust in Practice" — practical guides for implementing zero trust in AWS/Azure/GCP
2. "Compliance Without the Pain" — SOC 2, ISO 27001, HIPAA automation stories
3. "The CISO's Playbook" — decision frameworks for security leaders
4. "Cloud Misconfigurations" — real-world breach analyses and prevention
5. "Security for Developers" — shift-left security practices
Target keywords: cloud security posture management, CSPM, cloud misconfiguration, zero trust cloud, SOC 2 automation
Content goals: 40% increase in organic traffic, 200 MQL/month from content, 15% email open rate
Current state: Blog gets 12K monthly visits, 3.2K email subscribers, publishing 2x/week`,
    },

    'sales-outreach-sequence': {
        company: 'FleetMind',
        input: `Company: FleetMind — AI fleet management for logistics companies
Target accounts: 30 mid-size logistics companies (50-500 vehicles) in UK and Germany
Buyer persona: VP Operations or Fleet Director, 35-50 years old, frustrated with manual route planning and fuel costs, measured on delivery efficiency and cost per mile
Pain points: Rising fuel costs (up 34% YoY), driver shortage, manual route planning wastes 2-3 hours daily, no real-time visibility into fleet performance
Decision-makers: VP Ops (budget holder), CTO (technical evaluation), CFO (ROI sign-off)
Influencers: Fleet supervisors, dispatch managers, drivers
Our differentiator: Only platform that combines route optimization + predictive maintenance + driver coaching in one tool. Customers see 18% fuel savings within 60 days.
Pricing: £15/vehicle/month (avg fleet of 200 = £3K/month = £36K ACV)`,
    },

    'cold-email-outreach-pipeline': {
        company: 'Vendora',
        input: `Product description: Vendora is an AI-powered vendor management platform that automates procurement workflows, contract management, and spend analytics for mid-market companies (200-2000 employees). We replace spreadsheets and email chains with a single source of truth for all vendor relationships.
Ideal Customer Profile: Companies with 200-2000 employees, spending £1M+/year on vendors, currently managing procurement via spreadsheets or basic tools. Industries: tech, professional services, healthcare. Role titles: VP Finance, Head of Procurement, CFO, COO.
Top 3 value propositions with metrics:
1. "Save 23% on vendor spend through automated contract benchmarking" (avg saving £340K/year for mid-market)
2. "Cut procurement cycle time from 6 weeks to 5 days" (based on 45 customer average)
3. "Eliminate 15 hours/week of manual vendor management" (finance team time saved)
Case study 1: TechFlow (Series C SaaS, 450 employees) — Challenge: 200+ vendors managed across 12 spreadsheets, no visibility into contract renewals. Result: Consolidated to one platform, saved £520K in Year 1 through renegotiation alerts, zero missed renewals.
Case study 2: MedFirst (Healthcare group, 800 employees) — Challenge: Compliance requirements meant 8-week procurement cycles, 3 FTEs dedicated to vendor paperwork. Result: Automated compliance checks cut cycles to 6 days, reassigned 2 FTEs to strategic work.
Tone preference: Professional but direct — think "confident consultant, not corporate robot"
Prospect: Sarah Chen, VP Finance, DataStack Inc (Series B, 340 employees, just raised £25M)`,
    },

    'hiring-pipeline': {
        company: 'Orbital',
        input: `Company: Orbital — Satellite data analytics platform
Role: Senior Machine Learning Engineer
Must-have skills: Python, PyTorch/TensorFlow, experience with geospatial data, 5+ years ML engineering, deployed models at scale (>1M inferences/day)
Nice-to-have: Remote sensing background, Rust/C++ for performance-critical code, experience with satellite imagery (SAR, multispectral)
Seniority: Senior (IC4-IC5 equivalent), reports to VP Engineering
Compensation: £95K-£120K base + equity (0.05-0.15%), fully remote UK/EU, 28 days holiday + bank holidays
Timeline: Start interviewing in 2 weeks, offer out within 6 weeks, start date within 10 weeks
Team context: Joining a 6-person ML team, building next-gen deforestation detection and urban growth models. Team uses PyTorch, deployed on AWS SageMaker, data pipeline in Airflow.
Culture: Deep technical discussions encouraged, weekly paper reading group, annual team offsite, dog-friendly office (London Bridge)`,
    },

    'quarterly-business-review': {
        company: 'Taskly',
        input: `Company: Taskly — Project management SaaS for agencies
Department KPIs this quarter:
- Sales: £1.4M new ARR booked (target: £1.2M, 117%), 38 new logos, win rate 32%
- Marketing: 8,200 MQLs (target: 7,000, 117%), CAC £890 (target: <£1,000), 4.2% blog conversion rate
- Product: Shipped Gantt view, client portal, and Slack integration. NPS: 52 (up from 44). 99.95% uptime.
- Engineering: Sprint velocity 42 points/sprint (up 15%), tech debt reduced from 28% to 19% of backlog
- CS: NRR 128%, churn 1.8% monthly (target <2%), 94% CSAT score
- Finance: ARR £6.2M, gross margin 81%, burn rate £140K/month, runway 24 months

Financial data: Q4 P&L shows revenue £1.55M (subscription £1.42M + services £130K), COGS £295K, gross profit £1.255M. OpEx: R&D £420K, S&M £380K, G&A £195K. Net loss: -£140K (improving from -£210K last quarter).

OKR progress:
1. "Become the #1 tool for creative agencies" — 67% complete (launched agency-specific templates, 2 case studies published, 3 more in pipeline)
2. "Achieve £6M ARR" — 103% complete (hit £6.2M!)
3. "Ship self-serve onboarding" — 45% complete (delayed by client portal priority)

Key wins: Signed 3 enterprise accounts (>£50K ACV each), won G2 "Leader" badge for project management
Key challenges: Self-serve onboarding delayed, 2 senior engineers resigned, competitor launched AI features`,
    },

    'customer-onboarding': {
        company: 'BookStack',
        input: `Company: BookStack — All-in-one practice management for independent bookkeepers
Customer journey (sign-up to value):
1. Sign up (free trial, no credit card) → 2. Connect accounting software (Xero/QBO) → 3. Import client list → 4. Set up first workflow template → 5. Complete first client task → 6. Invite team member → 7. Convert to paid
Biggest drop-off points:
- 42% drop between step 2 (connect software) and step 3 (import clients) — "I'll do it later" syndrome
- 28% drop between step 4 (workflow) and step 5 (first task) — complexity overwhelm
- Only 31% of trial users reach step 5 within 14-day trial
Recent customer feedback:
- "I loved the concept but got stuck connecting Xero — the permissions screen was confusing" — Jane, sole practitioner
- "Too many options when setting up workflows. I just want a simple template to start" — Mike, 3-person firm
- "Once I got it working, it's brilliant. But getting there took 3 days of fiddling" — Sarah, 8-person firm
Current metrics: 2,100 monthly signups, 11% trial-to-paid conversion, £49/user/month pricing, 8.4% monthly churn`,
    },

    'brand-launch': {
        company: 'Mosaic',
        input: `Company: Mosaic — Diversity & inclusion analytics platform
Brand values (from founder workshop):
1. "Data tells the truth" — Decisions should be evidence-based, not performative
2. "Progress over perfection" — Small measurable improvements beat grand gestures
3. "Uncomfortable conversations welcome" — Real inclusion requires honest dialogue
4. "Everyone belongs at the table" — Accessibility is non-negotiable, not an afterthought
Brand personality: If Mosaic were a person, they'd be a thoughtful professor who also happens to be great at dinner parties — knowledgeable and data-driven but warm, approachable, and genuinely curious about people
Target audience: Chief People Officers and Heads of D&I at companies with 500+ employees. They're measured on representation metrics, inclusion survey scores, and retention equity. They're tired of "diversity theatre" and want tools that drive real, measurable change.
Visual inspiration: Warm earth tones (terracotta, sage, cream), modern serif typography, photography featuring real employees (not stock), geometric patterns inspired by mosaic tiles
Competitors' brand positioning: Culture Amp (employee experience, broader), Textio (hiring language, narrow), Diversio (D&I surveys, similar but less analytical)`,
    },

    'strategic-planning-offsite': {
        company: 'Wayfinder',
        input: `Company: Wayfinder — AI travel planning for corporate teams
Pre-read data for the offsite:
Key metrics (last 12 months):
- ARR: £4.1M → £8.9M (117% growth)
- Customers: 89 → 214 (140% growth)
- NRR: 142%
- Gross margin: 74% (target: 80%)
- Burn: £280K/month
- Runway: 18 months

Market landscape:
- Corporate travel spending recovering post-COVID, projected £1.4T globally by 2027
- Navan (formerly TripActions) raised $300M at $9.2B valuation — focused on large enterprise
- TravelPerk raised €115M — focused on mid-market Europe
- Gap: No AI-first platform for 50-500 employee companies

Customer feedback themes:
- "Your AI recommendations save our admins 6 hours/week" (top praise)
- "Need better Slack integration" (top request)
- "Hotel inventory is limited in Asia" (top complaint)

Individual strategic priority inputs (collected async):
- CEO: "We need to decide: go upmarket to enterprise or double down on mid-market"
- CTO: "AI moat is real but we need to invest in proprietary data to keep it"
- VP Sales: "Enterprise deals are 5x ACV but 4x longer sales cycle"
- VP Product: "Platform is stretched thin — need to focus on 2-3 killer features, not 10 mediocre ones"
- CFO: "Gross margin needs to improve before next raise or we'll dilute too much"

Offsite goal: Agree on the 3 strategic bets for 2026-2027 and assign owners`,
    },

    'monthly-business-review': {
        company: 'SignalBox',
        input: `Company: SignalBox — Product analytics for mobile apps
January 2026 department data:

Revenue & Sales:
- MRR: £312K (up 4.2% from December)
- New logos: 14 (target: 12)
- Pipeline: £890K qualified
- Bookings: £186K new ARR
- Win rate: 28% (down from 31% in Dec)
- Average deal size: £13.3K ACV

Product:
- DAU: 4,200 (up 8%)
- MAU: 11,400 (up 5%)
- Feature adoption: Funnels 78%, Retention 64%, A/B Testing 34%
- NPS: 47
- P0 bugs resolved: 3/3
- Uptime: 99.98%

Marketing:
- Website visitors: 42K
- MQLs: 620 (target: 500)
- CAC: £1,240 (up from £1,080 — concerned)
- Content: Published 8 blog posts, 2 case studies, 1 webinar (312 registrants)
- Organic traffic: up 14% MoM

Engineering:
- Velocity: 38 story points/sprint
- Deployment frequency: 12/week
- Change failure rate: 2.1%
- P0 incidents: 1 (resolved in 22 minutes)

Finance:
- Cash: £2.8M
- Burn: £195K/month
- Runway: 14.4 months
- P&L: Revenue £312K, COGS £68K, Gross Profit £244K (78.2% margin)
- OpEx: £439K → Net loss: -£195K`,
    },

    'new-hire-onboarding': {
        company: 'Canopy',
        input: `Company: Canopy — Climate risk assessment platform for insurers
New hire details:
- Name: Dr. Priya Sharma
- Role: Senior Climate Data Scientist
- Start date: March 3, 2026
- Manager: Dr. James Liu (Head of Data Science)
- Team: 5-person data science team (all remote, UK/EU timezones)
- Location: Remote (London-based, will visit office monthly)

Role context:
- Building next-gen flood risk models using satellite imagery and climate projections
- Key project: Integrate ESA Sentinel-2 data pipeline for real-time risk scoring
- Tech stack: Python, PyTorch, GeoAI, AWS SageMaker, PostGIS, dbt
- Coming from: Willis Towers Watson (5 years), PhD in Atmospheric Science from Imperial

Onboarding buddy: Alex Torres (Senior ML Engineer, 2 years at Canopy, knows the codebase best)

First week priorities:
1. Understand Canopy's climate model architecture
2. Get local dev environment running
3. Meet all team members + key stakeholders (Product, Engineering, Sales)
4. Review current flood model accuracy benchmarks

Equipment: MacBook Pro M3, 2x external monitors, home office stipend (£500)
Access: GitHub, AWS, Slack, Notion, JIRA, Looker`,
    },

    'product-spec-to-ship': {
        company: 'Folio',
        input: `Company: Folio — Portfolio management platform for freelancers
Feature: "Smart Proposals" — AI-generated project proposals based on freelancer's portfolio and client brief

Customer interviews (3-5 customers):
- "I spend 4-6 hours writing each proposal. If AI could draft 80% of it, I'd pay extra" — Maria, UX designer
- "The hardest part is pricing. I never know if I'm too high or too low for the market" — Jake, web developer
- "I want proposals that look professional but still sound like ME, not a robot" — Aisha, brand strategist
- "Integration with my existing portfolio is key — I want it to pull relevant case studies automatically" — Tom, photographer
- "I lose deals because I take too long to respond. Speed matters more than perfection" — Li, copywriter

Analytics: 67% of users say proposal writing is their #1 time sink. Average proposal takes 4.2 hours. Users who send proposals within 24h of inquiry have 3x higher close rate.

Technical constraints:
- Must integrate with existing portfolio data model
- AI generation should take <30 seconds
- Must support customizable templates (not one-size-fits-all)
- Mobile support required (42% of users check Folio on mobile)

Success metrics:
- 50% of active users try Smart Proposals within 30 days of launch
- Proposals generated in <60 seconds (including user customization)
- Users who adopt Smart Proposals increase proposal volume by 3x
- NPS for Smart Proposals users ≥60`,
    },

    'customer-success-review': {
        company: 'Relay',
        input: `Company: Relay — Internal communications platform for frontline workers
Account under review: MegaMart (national grocery chain, 12,000 employees)

Usage/engagement data:
- 8,400 of 12,000 employees activated (70% adoption, target was 80%)
- Daily active users: 3,200 (38% of activated — declining from 45% 3 months ago)
- Most used features: Shift announcements (89%), schedule viewing (76%), team chat (41%)
- Least used: Knowledge base (12%), feedback surveys (8%), training modules (6%)
- Average session: 4.2 minutes/day

Support tickets:
- 34 tickets last quarter (up from 18)
- Top issues: Push notification reliability (12 tickets), SSO login failures (8), slow loading on older Android devices (6)
- Average resolution time: 3.2 hours

NPS responses: Score 31 (down from 48 at launch)
- Promoters say: "Shift announcements replaced our WhatsApp groups — much better"
- Detractors say: "App crashes on my phone", "Too many notifications", "Managers don't use it so what's the point"

Contract details:
- Current contract: £240K/year (£20/employee/year)
- Renewal date: June 30, 2026 (4 months away)
- Expansion opportunity: 3 new distribution centres (4,000 additional employees)
- Risk: Their new CTO is evaluating Microsoft Teams as a consolidation play

Recent conversations:
- COO (sponsor): "We believe in Relay but need to see adoption numbers improve before renewal"
- IT Director: "Notification issues are eroding trust with store managers"`,
    },

    'compliance-readiness': {
        company: 'VaultAI',
        input: `Company: VaultAI — AI-powered document processing for legal firms
Jurisdictions: UK (primary), EU (Germany, France — expanding Q3), US (California — 2027 plan)
Industry-specific regulations:
- SRA (Solicitors Regulation Authority) standards for law firm technology
- Legal Professional Privilege considerations — our AI processes privileged documents
- Professional Indemnity Insurance requirements for legal tech providers

Data privacy applicability:
- UK GDPR: Yes (UK customers, processing personal data in legal documents)
- EU GDPR: Yes (German and French law firms starting Q3)
- CCPA: Not yet (no California customers, but planning for 2027)

Other regulations:
- Cyber Essentials Plus (required by many UK law firms as vendor prerequisite)
- ISO 27001 (requested by 60% of enterprise prospects — not yet certified)
- SOC 2 Type II (US enterprise requirement, needed before US expansion)
- AI Act (EU) — High-risk AI system classification likely applies to legal document processing

Company size thresholds:
- 45 employees, £3.2M ARR
- Process 2M+ documents/year containing personal data
- Store data in AWS eu-west-2 (London) and eu-central-1 (Frankfurt)

Current compliance status:
- Cyber Essentials: Certified
- ISO 27001: Gap assessment done, 6 months from certification
- SOC 2: Not started
- GDPR DPA: Template exists but not reviewed by external counsel since 2024`,
    },

    // ── Manufacturing Templates (1) ─────────────────────────────────
    'manufacturing-decision-engine': {
        company: 'TerraBot',
        input: `Product description: TerraBot Explorer — Autonomous soil sampling robot for precision agriculture
Size: 60cm x 40cm x 35cm, target weight <8kg
Features: 6-wheel differential drive, soil auger mechanism, GPS/RTK positioning, 4G connectivity, swappable battery, IP67 weatherproof enclosure, onboard soil sensor array

Target production volume:
- Phase 1: 10 prototypes (Q2 2026)
- Phase 2: 100 units pilot batch (Q4 2026)
- Phase 3: 1,000 units/year (2027)
- Phase 4: 10,000 units/year (2028+)

Budget:
- Prototype budget: £5,000/unit
- Production target: <£1,200/unit at 10K volume (selling at £3,500)

Timeline:
- First functional prototype: June 2026
- Pilot batch (100 units): December 2026
- Production volume: March 2027

Material requirements:
- Enclosure: UV-resistant, impact-resistant, IP67 rated, lightweight
- Chassis: High stiffness-to-weight ratio, vibration dampening
- Auger mechanism: Corrosion-resistant, hardened cutting edges
- Battery enclosure: Flame-retardant, easy-swap mechanism

Regulatory requirements:
- CE marking (EU machinery directive)
- FCC/UKCA for radio equipment (4G module)
- IP67 certification for outdoor operation
- No specific agricultural machinery regulations at this size

Design constraints:
- Must survive 1m drop onto concrete
- Operating temperature: -10°C to +50°C
- Must be field-serviceable (no special tools for battery/auger swap)
- Auger must penetrate clay soil to 30cm depth`,
    },
}

// ─── Mock output generators (prompt-type-specific) ──────────────────

function generateMockOutput(
    templateId: string,
    promptId: string,
    nodeLabel: string,
    inputText: string,
    company: string
): string {
    // Map prompt IDs to realistic placeholder content
    const generators: Record<string, () => string> = {
        'startup-vision-mission': () => `## Vision & Mission — ${company}

**Vision:** To create a world where ${company}'s technology transforms its industry, making operations 10x more efficient and accessible to organisations of every size.

**Mission:** ${company} empowers teams with AI-driven tools that eliminate manual bottlenecks, reduce costs by 40%, and deliver measurable outcomes within 30 days of deployment.

**Core Values:**
1. **Default to transparency** — Share context broadly; assume good intent
2. **Ship and iterate** — Perfect is the enemy of deployed
3. **Measure what matters** — Every initiative has a success metric before it starts
4. **Customer obsession over competitor paranoia** — Build for the user in front of you

*[Test output — template: ${templateId}, prompt: ${promptId}]*`,

        'startup-market-sizing': () => `## Market Sizing — ${company}

### TAM (Total Addressable Market)
Global market opportunity: **£12.4B** by 2028 (CAGR 23.5%)
Based on: Total industry spend on the problem ${company} solves across all geographies and segments.

### SAM (Serviceable Addressable Market)
Reachable market with current product: **£3.1B**
Based on: English-speaking markets (UK, US, EU) × target company size (50-5000 employees) × willingness to adopt SaaS solutions.

### SOM (Serviceable Obtainable Market)
Realistic 3-year capture: **£185M** (6% of SAM)
Based on: Current growth trajectory, sales capacity, competitive landscape.

### Key Assumptions [VALIDATE]
- Market growing at 23.5% CAGR (industry reports suggest 18-28%)
- 40% of target companies actively evaluating solutions
- Average contract value: £48K/year

*[Test output — template: ${templateId}, prompt: ${promptId}]*`,

        'fundraising-financial-projections': () => `## 3-Year Financial Projections — ${company}

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| ARR | £1.2M | £4.8M | £14.4M |
| Customers | 45 | 142 | 380 |
| ACV | £26.7K | £33.8K | £37.9K |
| Gross Margin | 78% | 82% | 85% |
| Net Burn | -£1.8M | -£2.4M | +£1.2M |
| Headcount | 18 | 42 | 78 |
| CAC | £8.2K | £6.4K | £5.1K |
| LTV:CAC | 4.2x | 5.8x | 7.4x |

### Revenue Assumptions
- Land-and-expand model: 35% of customers expand within 12 months
- Net revenue retention: 130% (based on current cohort data)
- Sales cycle: 45 days (SMB), 90 days (enterprise)

### Key Risks
1. Enterprise sales cycle may extend to 120+ days
2. Gross margin assumes infrastructure cost reduction via reserved instances
3. Headcount assumes competitive hiring market

*[Test output — template: ${templateId}, prompt: ${promptId}]*`,

        'fundraising-pitch-deck': () => `## Pitch Deck Narrative — ${company}

### Slide 1: Title
${company} — [One-line description of what the company does]

### Slide 2: The Problem
Every year, [target customers] waste [£X / Y hours] on [specific problem]. The current solutions are [slow/expensive/inaccurate] because they were built for a different era.

### Slide 3: The Solution
${company} is an AI-powered platform that [specific value proposition]. We [specific mechanism] to deliver [specific outcome] in [timeframe].

### Slide 4: Traction
- £XXK ARR, growing XX% MoM
- XX paying customers across [verticals/geographies]
- Key metrics: [metric 1], [metric 2], [metric 3]

### Slide 5: Market
TAM: £X.XB | SAM: £X.XB | SOM: £XXXM
The market is growing at XX% CAGR, driven by [trend 1] and [trend 2].

### Slide 6: Business Model
Revenue model: [SaaS/marketplace/usage-based]
Unit economics: ACV £XXK | CAC £X.XK | LTV:CAC X.Xx | Payback X months

### Slide 7: Competition
We win because: [1] [2] [3]. Competitors focus on [X]; we focus on [Y].

### Slide 8: Team
[CEO]: [background] | [CTO]: [background] | [VP Sales]: [background]
Why us: [unique insight/unfair advantage]

### Slide 9: The Ask
Raising £XM [round type] to: [use of funds breakdown]
Timeline: Close by [date]

*[Test output — template: ${templateId}, prompt: ${promptId}]*`,

        'fundraising-investor-qa': () => `## Investor Q&A Prep — ${company}

### Category 1: Market & Competition
**Q: How big is the market really?**
A: The total addressable market is £X.XB growing at XX% CAGR. Our bottoms-up analysis based on [customer segment] × [ACV] validates the top-down estimate. We're targeting the £X.XB SAM initially.

**Q: What if [Big Tech Company] builds this?**
A: [Big Tech] would need to [specific technical/regulatory/go-to-market barriers]. Our advantage is [speed/domain expertise/existing integrations]. History shows incumbents struggle with [specific dynamic].

### Category 2: Business Model
**Q: Why is your churn rate at X%?**
A: Early churn was driven by [root cause]. We've addressed this by [specific fix]. Last 3 cohorts show churn at [improved rate].

**Q: What does your sales pipeline look like?**
A: Current pipeline is £X.XM, Xx qualified opportunities. Win rate: XX%. Average sales cycle: XX days.

### Category 3: Team & Execution
**Q: What's your biggest risk?**
A: [Honest answer about biggest risk] and here's how we're mitigating it: [specific actions].

*[Test output — template: ${templateId}, prompt: ${promptId}]*`,

        'fundraising-warm-intro': () => `## Warm Intro Emails — ${company}

### Email 1: To [Investor Name] via [Mutual Connection]

Subject: Intro request — ${company} (XX% MoM growth, raising £XM)

Hi [Connection Name],

Quick favour — would you be open to introducing me to [Investor Name] at [Fund]?

${company} is [one sentence]. We're at £XXK ARR growing XX% month-over-month with XX paying customers. Raising a £XM [round type] to [one sentence use of funds].

I think [Fund] would be a great fit because [specific reason tied to their thesis/portfolio].

Happy to send a one-pager if helpful. No worries if the timing isn't right.

Thanks,
[Your Name]

---

### Forwardable Blurb (for the introducer to copy-paste)

"Hey [Investor], wanted to connect you with [Founder] at ${company}. They're building [description] and seeing strong traction (£XXK ARR, XX% MoM). Thought it might be up your alley given [specific fund thesis fit]. Let me know if you'd like an intro."

*[Test output — template: ${templateId}, prompt: ${promptId}]*`,

        'fundraising-due-diligence': () => `## Due Diligence Prep — ${company}

### Data Room Checklist

**Corporate**
- [ ] Certificate of incorporation
- [ ] Articles of association (current)
- [ ] Board resolutions and minutes
- [ ] Cap table (fully diluted)
- [ ] Shareholder agreements

**Financial**
- [ ] Last 12 months P&L (monthly)
- [ ] Balance sheet (current)
- [ ] Cash flow statement
- [ ] Financial projections (3-year model)
- [ ] Bank statements (last 6 months)

**Commercial**
- [ ] Customer list with ARR breakdown
- [ ] Cohort analysis (retention, expansion)
- [ ] Pipeline report
- [ ] Key customer contracts (top 5)

**Technical**
- [ ] Architecture overview
- [ ] Security audit / SOC 2 status
- [ ] IP assignments from all contributors

### Timeline
Week 1-2: Document collection → Week 3: Investor review → Week 4: Follow-up questions → Week 5: Decision

*[Test output — template: ${templateId}, prompt: ${promptId}]*`,

        'fundraising-post-raise': () => `## Post-Raise Communications — ${company}

### Internal Announcement (Team)

Subject: We raised £XM — here's what it means for us

Team,

I'm thrilled to share that we've closed our £XM [round type] led by [Lead Investor], with participation from [Other Investors].

**What this means:** We have runway to [specific goals]. This is NOT a license to spend — it's fuel to execute faster on the strategy we've already validated.

**What changes:** [Specific hiring plans, new initiatives]
**What doesn't change:** Our focus on [core metrics], our culture of [core value], and our obsession with [customer focus].

### External Announcement (Press/Social)

${company} raises £XM to [mission statement]. The round was led by [Investor] to accelerate [specific growth area].

*[Test output — template: ${templateId}, prompt: ${promptId}]*`,
    }

    // Generic fallback for prompts without specific generators
    const defaultGenerator = () => `## ${nodeLabel} — ${company}

### Analysis

Based on the provided context for ${company}, here is a comprehensive ${nodeLabel.toLowerCase()} analysis.

### Key Findings

1. **Strength:** The company shows strong fundamentals in its core market segment with clear product-market fit signals.
2. **Opportunity:** Expanding into adjacent verticals could increase TAM by 3-5x within 18 months.
3. **Risk:** Competitive pressure from well-funded incumbents requires differentiated positioning.
4. **Action Required:** Validate assumptions around [key metric] with next quarter's data before committing resources.

### Recommendations

1. Focus resources on the highest-conviction growth lever identified above
2. Build measurement infrastructure to track leading indicators weekly
3. Schedule quarterly reviews to reassess strategy against actual performance
4. Maintain 18+ months of runway as a non-negotiable constraint on spending

### Next Steps

- [ ] Review this analysis with the leadership team
- [ ] Identify the top 3 actionable items
- [ ] Assign owners and deadlines for each action
- [ ] Schedule follow-up review in 2 weeks

*[Test output — template: ${templateId}, prompt: ${promptId}]*`

    const generator = generators[promptId] || defaultGenerator
    return generator()
}

// ─── Node ordering (same logic as export-markdown.ts) ───────────────

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

// ─── Markdown assembly (same logic as export-markdown.ts) ───────────

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

    const completedCount = nodes.filter(
        (n) => n.data.executionStatus === 'approved'
    ).length

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

// ─── Content type inference (same logic as workflow view) ────────────

function inferContentType(workflowName: string): string {
    const name = workflowName.toLowerCase()
    if (name.includes('email') || name.includes('outreach') || name.includes('intro')) return 'email'
    if (name.includes('report') || name.includes('review') || name.includes('analysis')) return 'report'
    if (name.includes('deck') || name.includes('presentation') || name.includes('board')) return 'presentation'
    if (name.includes('checklist') || name.includes('playbook')) return 'checklist'
    return 'document'
}

// ─── Main pipeline ──────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('=== Workflow Template Pipeline Test (All Templates) ===\n')

    // 1. Authenticate as test user
    console.log(`Authenticating as ${TEST_EMAIL}...`)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
    })

    if (authError || !authData.user) {
        console.error('Auth failed:', authError?.message || 'No user returned')
        process.exit(1)
    }

    const userId = authData.user.id
    console.log(`Authenticated: ${userId}\n`)

    // 2. Get foundry ID from profile
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', userId)
        .single()

    if (profileError || !profile?.foundry_id) {
        console.error('Could not get foundry_id:', profileError?.message || 'No profile')
        process.exit(1)
    }

    const foundryId = profile.foundry_id
    console.log(`Foundry: ${foundryId}\n`)

    // 3. Import templates dynamically (they're TS with complex types)
    //    We load the raw template data by importing the module
    let WORKFLOW_TEMPLATES: WorkflowTemplate[]
    try {
        const mod = await import(
            path.resolve(process.cwd(), 'src/app/(platform)/agents/lib/workflow-templates.ts')
        )
        WORKFLOW_TEMPLATES = mod.WORKFLOW_TEMPLATES
    } catch (err) {
        console.error('Failed to import workflow-templates.ts:', err)
        console.log('Falling back to hardcoded template IDs...')
        // If import fails, we'll construct minimal templates inline
        WORKFLOW_TEMPLATES = []
    }

    // Use all templates that have a matching case study
    const allTemplates = WORKFLOW_TEMPLATES.length > 0
        ? WORKFLOW_TEMPLATES.filter((t) => CASE_STUDIES[t.id])
        : []

    if (allTemplates.length === 0) {
        console.error('No templates with case studies found. Check import path.')
        process.exit(1)
    }

    const startupCount = allTemplates.filter((t) => t.category === 'startup').length
    const businessCount = allTemplates.filter((t) => t.category === 'business').length
    const mfgCount = allTemplates.filter((t) => t.category === 'manufacturing').length
    console.log(`Found ${allTemplates.length} templates (${startupCount} startup, ${businessCount} business, ${mfgCount} manufacturing)\n`)

    // 4. Process each template
    const results: Array<{
        template: string
        company: string
        runId: string | null
        artifactId: string | null
        contentLength: number
        nodeCount: number
        promptNodes: number
        humanNodes: number
        status: 'success' | 'error'
        error?: string
    }> = []

    for (let i = 0; i < allTemplates.length; i++) {
        const template = allTemplates[i]
        const caseStudy = CASE_STUDIES[template.id]

        if (!caseStudy) {
            console.log(`[${i + 1}/${allTemplates.length}] ${template.name} — SKIP (no case study)`)
            results.push({
                template: template.name,
                company: 'N/A',
                runId: null,
                artifactId: null,
                contentLength: 0,
                nodeCount: template.nodes.length,
                promptNodes: 0,
                humanNodes: 0,
                status: 'error',
                error: 'No case study data',
            })
            continue
        }

        console.log(`[${i + 1}/${allTemplates.length}] ${template.name} (${caseStudy.company})`)

        try {
            // Deep clone nodes so we can mutate them
            const nodes: WorkflowNode[] = JSON.parse(JSON.stringify(template.nodes))
            const edges: WorkflowEdge[] = JSON.parse(JSON.stringify(template.edges))

            // Order nodes topologically
            const orderedIds = getOrderedNodeIds(nodes, edges)
            const nodeMap = new Map(nodes.map((n) => [n.id, n]))

            let promptNodeCount = 0
            let humanNodeCount = 0
            let previousOutput = ''

            // Process each node in order
            for (const nodeId of orderedIds) {
                const node = nodeMap.get(nodeId)
                if (!node) continue

                const isHuman = node.type === 'human-task' || node.data.isHumanTask

                if (isHuman) {
                    // Mark human tasks as approved with all checklist items completed
                    humanNodeCount++
                    node.data.executionStatus = 'approved'
                    if (node.data.checklist) {
                        node.data.checklistCompleted = node.data.checklist.map(() => true)
                    }
                } else {
                    // Prompt node — generate mock output
                    promptNodeCount++

                    // Set input: first prompt node gets the case study, subsequent get previous output
                    if (promptNodeCount === 1) {
                        node.data.userInput = caseStudy.input
                    } else if (previousOutput) {
                        node.data.userInput = previousOutput
                    }

                    // Generate mock output
                    const mockOutput = generateMockOutput(
                        template.id,
                        node.data.promptId || 'unknown',
                        node.data.label,
                        node.data.userInput || '',
                        caseStudy.company
                    )

                    node.data.output = mockOutput
                    node.data.executionStatus = 'approved'
                    previousOutput = mockOutput
                }
            }

            // Generate the full markdown artifact
            const markdown = generateWorkflowMarkdown(template.name, nodes, edges)

            // Build node outputs snapshot (same format as the real workflow view)
            const nodeOutputs = orderedIds.map((id) => {
                const node = nodeMap.get(id)
                return {
                    id,
                    label: node?.data.label || 'Unknown',
                    output: node?.data.output || null,
                    status: node?.data.executionStatus || 'idle',
                }
            })

            // Insert workflow run
            // workflow_id is UUID type — template IDs are slugs, so we use null
            // and store the template ID in workflow_name for traceability
            const { data: runData, error: runError } = await supabase
                .from('agent_workflow_runs')
                .insert({
                    workflow_id: null,
                    foundry_id: foundryId,
                    run_by: userId,
                    status: 'completed',
                    workflow_name: `${template.name} [${template.id}]`,
                    node_count: nodes.length,
                    nodes_completed: nodes.length,
                    node_outputs: nodeOutputs,
                    started_at: new Date().toISOString(),
                    completed_at: new Date().toISOString(),
                })
                .select('id')
                .single()

            if (runError) {
                throw new Error(`Failed to create workflow run: ${runError.message}`)
            }

            const runId = runData.id
            console.log(`  Workflow run created: ${runId}`)

            // Insert artifact
            const contentType = inferContentType(template.name)
            const { data: artifactData, error: artifactError } = await supabase
                .from('agent_artifacts')
                .insert({
                    run_id: runId,
                    workflow_id: null,
                    foundry_id: foundryId,
                    created_by: userId,
                    title: `${template.name} — ${caseStudy.company} (Test)`,
                    content: markdown,
                    content_type: contentType,
                    metadata: {
                        isTest: true,
                        company: caseStudy.company,
                        templateId: template.id,
                        generatedAt: new Date().toISOString(),
                        promptNodes: promptNodeCount,
                        humanNodes: humanNodeCount,
                    },
                    is_starred: false,
                    version_number: 1,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .select('id')
                .single()

            if (artifactError) {
                throw new Error(`Failed to create artifact: ${artifactError.message}`)
            }

            console.log(`  Artifact saved: ${artifactData.id} (${markdown.length.toLocaleString()} chars)`)
            console.log(`  Nodes: ${promptNodeCount} prompt + ${humanNodeCount} human-task = ${nodes.length} total`)
            console.log('')

            results.push({
                template: template.name,
                company: caseStudy.company,
                runId,
                artifactId: artifactData.id,
                contentLength: markdown.length,
                nodeCount: nodes.length,
                promptNodes: promptNodeCount,
                humanNodes: humanNodeCount,
                status: 'success',
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error(`  ERROR: ${message}\n`)
            results.push({
                template: template.name,
                company: caseStudy.company,
                runId: null,
                artifactId: null,
                contentLength: 0,
                nodeCount: template.nodes.length,
                promptNodes: 0,
                humanNodes: 0,
                status: 'error',
                error: message,
            })
        }
    }

    // 5. Verification — query back all artifacts
    console.log('=== Verification ===\n')

    const { data: artifacts, error: verifyError } = await supabase
        .from('agent_artifacts')
        .select('id, title, content_type, created_at')
        .eq('foundry_id', foundryId)
        .eq('created_by', userId)
        .like('title', '%(Test)%')
        .order('created_at', { ascending: false })
        .limit(20)

    if (verifyError) {
        console.error('Verification query failed:', verifyError.message)
    } else {
        console.log(`Found ${artifacts?.length || 0} test artifacts in database:\n`)
        artifacts?.forEach((a, i) => {
            console.log(`  ${i + 1}. [${a.content_type}] ${a.title}`)
        })
    }

    // 6. Summary table
    console.log('\n=== Results Summary ===\n')

    const successCount = results.filter((r) => r.status === 'success').length
    const failCount = results.filter((r) => r.status === 'error').length

    console.log(`Template                          | Company     | Status  | Content`)
    console.log(`${'─'.repeat(34)}|${'─'.repeat(13)}|${'─'.repeat(9)}|${'─'.repeat(12)}`)

    for (const r of results) {
        const templateCol = r.template.padEnd(33)
        const companyCol = r.company.padEnd(12)
        const statusCol = r.status === 'success' ? 'OK     ' : 'FAILED '
        const contentCol = r.status === 'success'
            ? `${r.contentLength.toLocaleString()} ch`
            : r.error || 'Unknown'
        console.log(`${templateCol} | ${companyCol} | ${statusCol} | ${contentCol}`)
    }

    console.log('')
    console.log(`${successCount}/${results.length} templates passed.`)
    if (failCount > 0) {
        console.log(`${failCount} template(s) failed.`)
    }
    console.log('')
    console.log('Artifacts visible at: /agents/artifacts')
    console.log('')

    process.exit(failCount > 0 ? 1 : 0)
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
