# ForgeOS — Business Plan (Working Draft)

**Fractional Forge Limited**
**Date**: 3 March 2026 | **Last Updated**: 10 March 2026
**Status**: Draft — to be developed with financial projections

---

## 1. Executive Summary

ForgeOS is an operating system for hardware startup founders. It replaces the need to hire a full leadership team by providing 13 AI specialist advisors, a concept-to-RFQ manufacturing workspace, and a B2B marketplace — all in one platform.

**The Problem**: Hardware founders face a knowledge coordination crisis. Building physical products requires expertise spanning 10+ domains, and most startups can't afford specialists in each. Founders currently cobble together 6+ SaaS tools and expensive consultants.

**The Solution**: ForgeOS bundles AI advisory, manufacturing tools, marketplace, work management, and finance tools into a single platform purpose-built for hardware companies.

**Revenue Model**: SaaS subscriptions (Free to £499/mo) + 10% marketplace transaction fee.

**Target Market**: Hardware startup founders, pre-seed to Series A, globally (English-speaking markets first).

---

## 2. Problem

### 2.1 The Knowledge Gap

Hardware founders don't know what they don't know. They can't see all the domains required to ship a product, can't identify where they have gaps, and can't generate the right questions to ask experts.

### 2.2 Concrete Examples

- **The FCC Surprise**: Robotics startup spent 8 months building without consulting regulatory. Discovered wireless module needed FCC certification at DVT. 4-month delay + £32K redesign.
- **The Battery Expert Search**: Consumer electronics founder spent 3 weeks finding a BMS expert across LinkedIn, advisors, and consultants. Generic questions yielded generic answers.
- **The CM Rework Loop**: Team sent PCB design to CM without structured RFQ. 47 clarifying questions across 12 email threads over 6 weeks. Design wasn't manufacturable at target cost.

### 2.3 Current Alternatives

Founders currently use a fragmented stack: ChatGPT/Claude for advice (no context persistence), Asana/Monday for tasks, Fusion 360 for CAD, Upwork/Fiverr for freelancers, QuickBooks for finance, Slack for comms. None of these tools understand hardware development workflows or talk to each other.

---

## 3. Solution

### 3.1 AI Specialists (Core Differentiator)

13 AI advisors, each modelled after a world-class executive archetype, providing domain-specific guidance with:
- Persistent conversation memory
- Company context awareness (stage, industry, purpose)
- Cross-specialist coordination ("After talking to Finn about cash flow, you should brief Fiona on fundraising")
- Multiple access points (web panel, mobile FAB, Cmd+K, Telegram bot)

### 3.2 The Forge (CAD Lab)

Concept → 3D Model → DFM Analysis → Peer Review → Instant Quote → RFQ in one workflow.

**Current pipeline**: Claude generates CadQuery Python → Modal.com executes → STL/STEP output → Three.js renders. Works for simple parametric geometry.

**Planned upgrade** (see Business/product-roadmap.md): Replace primary CAD generation with Zoo.dev API (purpose-trained geometry model producing manufacturing-grade STEP files), add Dashnode DFM analysis after generation, add Xometry API for instant manufacturing quotes before RFQ broadcast. This transforms The Forge from a CAD generation tool into a full concept-to-manufacture decision engine. The existing CadQuery pipeline is retained as an advanced/fallback mode.

### 3.3 B2B Marketplace

Hardware-focused marketplace with matching, Stripe escrow, milestone tracking, and dispute resolution. Categories: People, Products, Services, AI, Finance.

### 3.4 Operational Tools

Tasks (Kanban/Gantt/OKR), finance (budgeting, cash burn, invoicing), messaging, Google Calendar sync, background intelligence sweeps.

---

## 4. Business Model

### 4.1 Revenue Streams

| Stream | Mechanism | Expected Mix |
|--------|-----------|-------------|
| Subscriptions | Monthly/annual SaaS fees | 60-70% |
| Marketplace fees | 10% platform fee on transactions | 25-35% |
| Premium features | Voice/avatar modes, API access | 5-10% |

### 4.2 Pricing

| Tier | Monthly | Annual (per mo) | Target Persona |
|------|---------|-----------------|----------------|
| Explorer | Free | Free | Solo founders testing |
| Startup Team | £49 | £39.20 | Early-stage, small team |
| Professional | £149 | £119.20 | Growing team, power users |
| Enterprise | £499 | £399.20 | Large teams, custom needs |

### 4.3 Unit Economics (To Be Validated)

- **CAC (Customer Acquisition Cost)**: Target <£80 blended (see Finance/unit-economics.md)
- **LTV (Lifetime Value)**: ~£2,900 blended (see Finance/unit-economics.md)
- **AI Cost per User**: To be measured — critical metric given multi-model approach
- **Gross Margin Target**: >70% on subscriptions, >80% on marketplace fees
- **Payback Period Target**: <6 months

---

## 5. Market

### 5.1 Target Market

**Primary**: Hardware startup founders (solo to 10-person team), pre-seed to Series A, building physical products (consumer electronics, robotics, IoT, medical devices, industrial).

**Secondary**: Corporate innovation labs, engineering consultancies, hardware accelerator cohorts.

**Geography**: UK, US, EU initially (English-speaking).

### 5.2 Market Size (Directional)

- Thousands of hardware startups founded globally each year
- Global product design and development services market is substantial
- Adjacent markets: project management SaaS, AI tools, manufacturing marketplace

*Detailed TAM/SAM/SOM analysis needed with actual market research.*

### 5.3 Competitive Positioning

ForgeOS creates a new category: "AI Operating System for Hardware Startups." No single competitor offers the combination of AI advisors + CAD generation + DFM analysis + instant quoting + marketplace + work management.

**The upgraded Forge pipeline** (Zoo.dev → Dashnode DFM → Xometry quoting → marketplace RFQ) creates genuine lock-in: each stage's data feeds the next, the specialist AI layer adds contextual interpretation that raw API access doesn't provide, and the integration eliminates the tool-switching that currently fragments hardware development workflows. See Business/strategic-api-landscape.md for the full competitive analysis.

---

## 6. Go-to-Market Strategy

### Phase 1: Foundation (Months 1-3)
- Launch 1.0 with polished core features
- Seed marketplace with 20-50 providers
- Content marketing: blog, LinkedIn, hardware forums
- Free tier drives organic signups
- Target: ~190 registered, ~13 paid

### Phase 2: Traction (Months 4-6)
- Hardware accelerator partnerships (HAX, Highway1, Bolt)
- Case studies from early customers
- Referral programme for providers and customers
- Target: ~560 registered, ~36 paid

### Phase 3: Growth (Months 7-12)
- Product Hunt or similar high-visibility launch
- Paid acquisition (targeted LinkedIn, hardware communities)
- Enterprise sales motion
- Target: ~2,000 registered, ~122 paid (conservative projections; stretch target: 2,500/200)

### Phase 4: Scale (Year 2+)
- International expansion
- Additional vertical templates (medical devices, automotive, aerospace)
- Partner API ecosystem
- Fundraise if metrics warrant it

---

## 7. Financial Projections

*To be developed — see Finance/financial-projections.md*

Key assumptions to model:
- Free → paid conversion rate (target: 5-10%)
- Monthly churn rate (target: <5%)
- Average Revenue Per User (ARPU)
- AI cost per active user per month
- Marketplace GMV growth
- Headcount and infrastructure costs

---

## 8. Team

### Current
- **Tristan Fischer** — Founder. Full-stack development, product vision, business strategy.

### Priority Hires (see Operations/hiring-plan.md)
1. Full-stack developer (reduce bus-factor risk)
2. Growth marketer (content + community)
3. Customer success (onboarding, retention)

---

## 9. Funding Strategy

### Current: Bootstrapped
Self-funded with lean development practices keeping costs low.

### Future Options
- **SEIS/EIS**: SEIS: 50% income tax relief (company can raise up to £250K per year). EIS: 30% income tax relief (up to £5M per year).
- **Angel round**: £150-300K at seed stage if traction warrants
- **Grants**: Innovate UK, hardware-specific grants
- **Revenue-funded**: If unit economics work, continue bootstrapping

### Key Milestones for Fundraise Readiness
- 50+ paid subscribers
- Positive marketplace GMV trend
- AI cost per user <30% of ARPU
- 2+ case studies showing measurable customer value
- Clear path to £100K ARR

---

## 10. Risks

See ForgeOS-Analysis-Report.docx Section 8 for detailed risk matrix.

**Top 4**:
1. Marketplace cold start — mitigate with proactive provider recruitment
2. AI cost scaling — mitigate with per-user caps and multi-provider optimisation; note that API integrations (Zoo.dev, Dashnode, Xometry) add ~$5-30/user/month in third-party costs that must be modelled into tier pricing (see Business/product-roadmap.md cost model)
3. Single developer dependency — mitigate by hiring second developer ASAP
4. Third-party API dependency — Zoo.dev, Dashnode, Xometry become critical path components. Mitigate by retaining CadQuery fallback for CAD generation and building abstraction layers that allow provider substitution

---

## Next Steps

1. [ ] **Evaluate Zoo.dev API** — benchmark against CadQuery on 10 representative hardware components
2. [ ] **Evaluate Dashnode DFM** — test with existing STEP files, assess manufacturability coverage
3. [ ] Complete financial projections with actual cost data (including third-party API costs)
4. [ ] Validate pricing with 10+ target customer conversations
5. [ ] Define and measure key activation metrics
6. [ ] Build a 90-day marketing calendar
7. [ ] Recruit first 20 marketplace providers
8. [ ] Record product demo video
9. [ ] Model API cost impact on tier pricing (see Business/product-roadmap.md)
