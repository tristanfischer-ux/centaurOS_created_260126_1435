# CentaurOS Business Analysis Prompt

> A comprehensive framework for top-tier business consultants analyzing CentaurOS

---

## Executive Briefing

**Company:** CentaurOS  
**Category:** B2B SaaS / Marketplace  
**Tagline:** "Democratic Workflow Engine" for Fractional Foundries  
**Key Innovation:** AI Agents as first-class workforce citizens alongside humans

### What You're Analyzing

CentaurOS is building infrastructure for the future of work where AI agents and human experts collaborate as equals. The platform combines:

1. **Workflow Engine** - Democratic task management with Accept/Reject/Forward/Amend actions
2. **AI Integration** - Autonomous "Ghost Agents" that execute tasks and submit work for human approval
3. **B2B Marketplace** - Four categories: People, Products, Services, AI
4. **Payment Infrastructure** - Escrow, milestones, retainers via Stripe Connect

### Current Revenue Model

| Stream | Take Rate | Notes |
|--------|-----------|-------|
| Marketplace Orders | 8% | Deducted from escrow release |
| Booking Fees | 10% | Day-rate bookings |
| Retainer Agreements | 10% | Recurring weekly billing |

### Key Terminology

- **Foundry**: A tenant organization (company/team using CentaurOS)
- **Ghost Agent**: Autonomous AI worker triggered by task assignment
- **Centaur Pairing**: Human profile linked with an AI agent partner
- **Democratic Workflow**: Assignees control task flow (accept, reject, forward, amend)
- **Risk Levels**: Low (auto-complete), Medium (peer review), High (executive approval)

---

## Part 1: Strategic Analysis

### 1.1 Market Positioning Questions

**Category Creation vs. Feature Set:**
- Is "Fractional Foundry" a new category or a rebranding of existing concepts (agency, consultancy, distributed team)?
- Can CentaurOS own this category, or will it be absorbed by larger players?
- What is the 30-second elevator pitch that resonates with buyers?

**Competitive Differentiation:**
- How does this differ from:
  - **Workforce Management**: Monday.com, Asana, ClickUp, Notion
  - **Freelance Marketplaces**: Upwork, Fiverr, Toptal, A.Team
  - **AI Orchestration**: LangChain, AutoGPT, AgentGPT
  - **HR/Staffing Tech**: Deel, Remote, Oyster
- What is defensible? What can be copied in 6 months?

**Positioning Matrix Analysis:**
```
                    HIGH WORKFLOW COMPLEXITY
                            |
    Enterprise ERP    |    CentaurOS?
    (SAP, Workday)    |    (Hybrid AI+Human)
                            |
    -------------------|-------------------
                            |
    Simple Tools      |    AI Agents
    (Trello, Slack)   |    (ChatGPT, Claude)
                            |
                    LOW WORKFLOW COMPLEXITY
                            
    HUMAN-CENTRIC ←————————————→ AI-CENTRIC
```

### 1.2 Total Addressable Market (TAM)

**Questions to Answer:**
1. What is the global market size for:
   - Freelance/gig economy platforms?
   - Workflow/project management software?
   - AI agent/automation tools?
2. What is the intersection (the true TAM for hybrid human-AI workforce)?
3. What industries are most ready for this model?
   - Creative agencies?
   - Software development?
   - Professional services (legal, accounting)?
   - Manufacturing/supply chain?

**Segmentation Analysis:**
- **By Company Size**: SMB (<50), Mid-market (50-500), Enterprise (500+)
- **By Geography**: UK-first, then EU, US, APAC?
- **By Use Case**: Internal teams vs. external provider networks
- **By Maturity**: AI-curious vs. AI-native organizations

### 1.3 Competitive Intelligence

**Direct Competitors to Analyze:**
| Company | Category | Threat Level | Notes |
|---------|----------|--------------|-------|
| Upwork | Marketplace | High | Could add AI agents |
| Toptal | Talent Network | Medium | Premium positioning |
| Monday.com | Workflow | High | Could add marketplace |
| Notion | Workspace | Medium | AI features growing |
| A.Team | Formation | Medium | Similar "team assembly" concept |
| Deel | HR/Payments | Low | Different focus but adjacent |

**Key Competitive Questions:**
- Which competitor is most likely to build this in 12 months?
- What would acquisition interest look like? From whom?
- Are there partnership opportunities with non-competing players?

---

## Part 2: Business Model Deep Dive

### 2.1 Unit Economics Analysis

**Data to Request:**
- Customer Acquisition Cost (CAC) by channel
- Lifetime Value (LTV) by customer segment
- LTV:CAC ratio
- Payback period in months
- Gross margin by revenue stream
- Net Revenue Retention (NRR)

**Questions to Probe:**
1. What is the blended take rate across all transaction types?
2. How does GMV translate to actual revenue?
3. What percentage of Foundries transact on the marketplace vs. just use workflow tools?
4. Is there a "land and expand" motion? What triggers expansion?

### 2.2 Pricing Strategy Assessment

**Current Pricing Architecture:**
```
MARKETPLACE FEES
├── Orders: 8% of transaction value
├── Bookings: 10% of booking value
└── Retainers: 10% of weekly billing

RETAINER DISCOUNTS (Provider Side)
├── 10 hours/week: 0% discount
├── 20 hours/week: 5% discount
└── 40 hours/week: 10% discount
```

**Questions to Evaluate:**
1. Is 8-10% competitive? (Upwork charges 5-20%, Fiverr 20%)
2. Should pricing vary by category? (AI tools vs. human services)
3. Is there price sensitivity? What would 12% or 15% do to conversion?
4. Should there be a SaaS subscription for workflow-only users?
5. What is the optimal balance between buyer fees and seller fees?

### 2.3 Revenue Stream Analysis

**Current Streams:**
1. **Transaction Fees** - % of GMV
2. **Payment Processing Margin** - Stripe fees passed through or absorbed?
3. **Future Potential**: SaaS subscriptions, premium features, advertising/promotion

**Questions:**
- What is the revenue concentration? (% from top 10 customers)
- What is the mix between one-time orders vs. recurring retainers?
- How seasonal is the business?
- What is the path to $1M, $10M, $100M ARR?

---

## Part 3: Operational Analysis

### 3.1 Technology Assessment

**Current Stack:**
- Frontend: Next.js 15, Tailwind CSS, Shadcn UI
- Backend: Supabase (Postgres, Auth, Realtime, Edge Functions)
- AI: OpenAI GPT-4o, Whisper
- Payments: Stripe Connect

**Technical Due Diligence Questions:**
1. **Scalability**: Can the architecture handle 100x current load?
2. **Dependency Risk**: What happens if:
   - OpenAI increases prices 10x?
   - Supabase has extended downtime?
   - Stripe changes Connect terms?
3. **Security Posture**: 
   - Is RLS (Row Level Security) sufficient for enterprise?
   - Path to SOC 2 Type II?
   - GDPR/data residency compliance?
4. **Technical Debt**: What shortcuts were taken? What needs refactoring?

### 3.2 AI Architecture Analysis

**Ghost Agent System:**
```
Task Assigned to AI → Database Trigger → Edge Function → GPT-4o → 
Response Written → Status: "Amended_Pending_Approval" → Human Review
```

**Questions:**
1. What is the cost per AI task execution?
2. What is the average latency for Ghost Agent responses?
3. How is prompt engineering managed? Version control?
4. What is the failure rate? How are errors handled?
5. Can this scale to 1M tasks/day? What breaks first?

### 3.3 Marketplace Operations

**Supply Side (Providers):**
- How are providers onboarded? (Currently admin-curated)
- What is provider activation rate? Retention?
- What is average provider earnings?
- How is quality controlled?

**Demand Side (Buyers/Foundries):**
- What is the buyer activation rate?
- What is the average order value?
- What is repeat purchase rate?
- How long from signup to first transaction?

**Marketplace Health Metrics to Request:**
- GMV (Gross Merchandise Value)
- Take rate (Revenue / GMV)
- Liquidity (% of searches that result in transaction)
- Time to first match
- Dispute rate
- Refund rate

---

## Part 4: Financial Analysis

### 4.1 Current Financial State

**Data to Request:**
| Metric | Current | 6mo Ago | 12mo Ago |
|--------|---------|---------|----------|
| MRR | ? | ? | ? |
| ARR | ? | ? | ? |
| GMV | ? | ? | ? |
| Customers (Foundries) | ? | ? | ? |
| Active Providers | ? | ? | ? |
| Burn Rate | ? | ? | ? |
| Runway (months) | ? | ? | ? |

### 4.2 Growth Trajectory Questions

1. What is the month-over-month growth rate?
2. What is driving growth? (Organic, paid, referral, partnerships)
3. What is the sales cycle length?
4. What is the win rate on qualified opportunities?
5. What is the churn rate? Why do customers leave?

### 4.3 Investment Readiness

**Stage Assessment:**
- Pre-seed / Seed / Series A / Series B?
- Current investors and cap table structure?
- Funding history and use of proceeds?

**Questions for Investment Thesis:**
1. What is the funding ask?
2. What milestones will this capital achieve?
3. What is the path to next round?
4. What are the key risks that could derail the business?
5. What is the exit thesis? (IPO, acquisition, strategic sale)

**Potential Acquirers:**
| Company | Strategic Rationale | Likelihood |
|---------|---------------------|------------|
| Salesforce | Workforce + AI play | Medium |
| Microsoft | Teams/workplace integration | Low |
| Upwork | Add AI + workflow to marketplace | High |
| Monday.com | Add marketplace + AI to workflow | Medium |
| SAP/Workday | HR tech modernization | Low |
| Private Equity | Roll-up in workforce tech | Medium |

---

## Part 5: Risk Assessment

### 5.1 Market Risks

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| AI hype cycle cools | High | Medium | Focus on proven ROI cases |
| Enterprise not ready for AI workers | High | Medium | Education + gradual adoption |
| Recession reduces freelance spending | Medium | Low | Counter-cyclical pitch |
| Regulatory changes (AI in employment) | Medium | Medium | Legal monitoring + compliance |

### 5.2 Competitive Risks

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| Upwork launches AI agents | High | High | Speed to market, niche focus |
| Microsoft adds to Teams | High | Low | Different ICP, stay nimble |
| Dozens of AI workflow startups | Medium | High | Category leadership, brand |
| Open source alternatives | Medium | Medium | Enterprise features, support |

### 5.3 Operational Risks

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| OpenAI API cost increase | High | Medium | Multi-provider strategy |
| Supabase outage/migration | Medium | Low | Architecture flexibility |
| Payment fraud/disputes | Medium | Medium | Fraud detection, escrow |
| Provider quality issues | Medium | Medium | Curation, ratings, reviews |
| Data breach | High | Low | Security investment, SOC 2 |

### 5.4 Execution Risks

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| Founder burnout | High | Medium | Team building, delegation |
| Key person dependency | High | Medium | Documentation, hiring |
| Premature scaling | High | Medium | Unit economics discipline |
| Product sprawl | Medium | Medium | Focus, prioritization |

---

## Part 6: Strategic Recommendations Framework

### 6.1 Critical Questions for Leadership

**Vision & Strategy:**
1. What does CentaurOS look like at $100M ARR?
2. Is this a workflow company, marketplace company, or AI company? Can it be all three?
3. What is the "unfair advantage" that compounds over time?

**Focus & Prioritization:**
4. Should you focus on workflow OR marketplace first?
5. Which customer segment should you double down on?
6. What features should you NOT build?

**Growth & Scale:**
7. What is the GTM motion? (PLG, sales-led, hybrid)
8. What is the international expansion sequence?
9. What partnerships would be transformative?

**Financial & Exit:**
10. What is the path to profitability if needed?
11. What metrics need to hit for Series A/B?
12. What would make you say yes to an acquisition offer?

### 6.2 Potential Strategic Options

**Option A: Workflow-First**
- Focus on being the best democratic workflow tool
- Marketplace becomes secondary revenue stream
- Compete with Monday, Asana, Notion
- SaaS subscription model

**Option B: Marketplace-First**
- Focus on building liquidity in the marketplace
- Workflow is differentiation, not core
- Compete with Upwork, Toptal
- Transaction fee model

**Option C: AI-Native Platform**
- Focus on being THE platform for AI + human teams
- Position as infrastructure for AI workforce
- Compete with LangChain, AI agent startups
- Usage-based pricing

**Option D: Vertical Focus**
- Pick one industry (e.g., creative agencies, law firms)
- Build deep domain expertise
- Become the "Foundry OS for X"
- Premium pricing justified by specialization

---

## Part 7: Engagement Deliverables

### 7.1 Recommended Consulting Workstreams

| # | Workstream | Lead | Duration | Key Deliverable |
|---|------------|------|----------|-----------------|
| 1 | Market Sizing | Strategy | 2 weeks | TAM/SAM/SOM model |
| 2 | Competitive Analysis | Strategy | 2 weeks | Landscape map + positioning |
| 3 | Unit Economics | Finance | 2 weeks | CAC/LTV model + margin analysis |
| 4 | Pricing Study | Commercial | 3 weeks | Price elasticity + recommendations |
| 5 | Tech Due Diligence | Operations | 2 weeks | Architecture review + risk register |
| 6 | GTM Strategy | Commercial | 3 weeks | Playbook + channel strategy |
| 7 | Financial Model | Finance | 2 weeks | 5-year projections + scenarios |
| 8 | Risk Assessment | All | 1 week | Prioritized risk matrix |

### 7.2 Expected Outputs

1. **Executive Summary** (2-3 pages)
   - Key findings and recommendations
   - Investment thesis summary
   - Priority actions

2. **Market Analysis Report** (15-20 pages)
   - TAM/SAM/SOM sizing with methodology
   - Competitive landscape with feature matrix
   - Customer segmentation analysis
   - Market trends and timing assessment

3. **Financial Model** (Excel/Sheets)
   - Historical performance analysis
   - 5-year revenue projections (base/bull/bear)
   - Unit economics dashboard
   - Funding requirements and runway

4. **Strategic Roadmap** (10-15 pages)
   - Prioritized initiatives
   - Resource requirements
   - Key milestones and metrics
   - Risk mitigation plan

5. **Board Presentation** (20-30 slides)
   - Investment-ready narrative
   - Key metrics and growth story
   - Competitive positioning
   - Ask and use of proceeds

---

## Part 8: Interview Guide

### 8.1 Questions for the Founder/CEO

**Vision:**
- Why did you start this? What problem were you solving?
- What does success look like in 5 years?
- What keeps you up at night?

**Product:**
- What feature has had the biggest impact?
- What have you tried that didn't work?
- What would you build if you had unlimited resources?

**Market:**
- Who is your ideal customer?
- Who are you most worried about competitively?
- What market insight do you have that others don't?

**Business:**
- What are your most important metrics?
- What is your biggest constraint right now?
- What would you do with $10M in funding?

### 8.2 Questions for Customers (Foundries)

**Discovery:**
- How did you find CentaurOS?
- What were you using before?
- What problem were you trying to solve?

**Usage:**
- What features do you use most?
- How has it changed how you work?
- What would make you use it more?

**Value:**
- Has it saved you time or money? How much?
- Would you recommend it? To whom?
- What would make you stop using it?

### 8.3 Questions for Providers

**Onboarding:**
- Why did you join the marketplace?
- How does it compare to other platforms?
- Was the onboarding process smooth?

**Experience:**
- What do you like most about the platform?
- What frustrates you?
- How is the buyer quality?

**Economics:**
- Is the pricing fair?
- How does your income here compare to other channels?
- What would make you more active on the platform?

---

## Appendix: Data Request Checklist

### Financial Data
- [ ] Monthly revenue for past 24 months (by stream)
- [ ] GMV for past 24 months
- [ ] Customer count over time
- [ ] Churn data (logo and revenue)
- [ ] CAC by channel
- [ ] Burn rate and runway
- [ ] Cap table and funding history

### Product Data
- [ ] Active users (DAU, WAU, MAU)
- [ ] Feature usage analytics
- [ ] Activation and retention cohorts
- [ ] NPS scores over time
- [ ] Support ticket volume and categories

### Marketplace Data
- [ ] Provider count and activation rate
- [ ] Average order value
- [ ] Transaction volume by category
- [ ] Search-to-transaction conversion
- [ ] Dispute and refund rates
- [ ] Provider earnings distribution

### Technical Data
- [ ] Infrastructure costs (hosting, APIs)
- [ ] OpenAI API spend
- [ ] System uptime and incident history
- [ ] Security audit results
- [ ] Technical debt assessment

---

*This prompt was generated to guide a comprehensive business analysis of CentaurOS. Consultants should adapt questions and focus areas based on the specific engagement objectives and available data.*
