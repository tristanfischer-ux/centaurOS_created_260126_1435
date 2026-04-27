# Fractional Forge — Brand Guide

**Last Updated**: 27 April 2026 (added §6 Forge Capital module override)

---

## 1. Brand Identity

| Element | Value |
|---------|-------|
| **Company Name** | Fractional Forge |
| **Product Name** | ForgeOS |
| **Tagline** | "We build atoms at the speed of bits" |
| **Category** | Operating System for Hardware Startups |

### Naming Rules
- "Fractional Forge" = the company
- "ForgeOS" = the product/platform
- "Forge teams" = users/customers
- "The Forge" = the CAD/manufacturing workspace feature
- Never: "CentaurOS", "Centaur Dynamics", "Centaur teams"

---

## 2. Voice & Tone

### Brand Personality
ForgeOS is the brilliant, experienced colleague you always wished you had. Knowledgeable without being condescending. Confident without being arrogant. Warm without being unprofessional.

### Voice Attributes

| Attribute | We Are | We Are Not |
|-----------|--------|------------|
| **Expert** | Knowledgeable, precise, credible | Academic, jargon-heavy, condescending |
| **Supportive** | Encouraging, practical, helpful | Patronising, hand-holding, generic |
| **Direct** | Clear, honest, action-oriented | Blunt, cold, corporate |
| **Optimistic** | Positive, forward-looking, energising | Naive, overpromising, dismissive of problems |

### Tone by Context

| Context | Tone | Example |
|---------|------|---------|
| Marketing copy | Warm, confident, inspiring | "Your next product starts here." |
| Product UI | Clear, helpful, encouraging | "Great choice. Let's get your project set up." |
| Error messages | Empathetic, solution-focused | "Something went wrong, but we can fix it. Try refreshing." |
| Technical docs | Precise, structured, practical | "This endpoint accepts a JSON body with the following fields..." |

### Language Rules
- **No AI emphasis**: Never say "AI-powered", "AI-generated", "Smart", "Intelligent". ForgeOS is human-first; AI supports, not showcases.
- **Active voice**: "ForgeOS helps you find experts" not "Experts can be found through ForgeOS"
- **Concrete over abstract**: "Save 3 weeks on your first RFQ" not "Improve efficiency"
- **UK English**: colour, optimise, specialise, licence (noun), license (verb)
- **No superlatives**: Avoid "best", "revolutionary", "game-changing", "cutting-edge"

---

## 3. Messaging Pillars

### Pillar 1: Expert Access for Everyone
"Every hardware founder deserves world-class advice — not just the well-funded ones."

**Key messages**:
- 13 domain specialists available 24/7
- They remember your company context
- They coordinate with each other
- Fraction of the cost of human consultants

### Pillar 2: Concept to Product, One Platform
"Stop toggling between 6 tools. Go from idea to manufacturer RFQ in one place."

**Key messages**:
- Describe a product, get 3D models
- Automatic quality analysis and risk identification
- One-click RFQ generation to suppliers
- Everything connected: tasks, conversations, designs, finances

### Pillar 3: Built for Hardware
"Generic AI tools don't understand hardware. We do."

**Key messages**:
- Manufacturing-specific workflows
- Regulatory awareness built in
- Supply chain intelligence
- Marketplace of vetted hardware experts

---

## 4. Visual Identity

### Colours

| Colour | Hex | Usage |
|--------|-----|-------|
| International Orange | #FF4500 | Primary brand, CTAs, accents |
| Electric Blue | #3B82F6 | Secondary accents, links, info |
| Dark Navy | #1A1A2E | Headings, primary text |
| Light backgrounds | #FFFFFF, #F9FAFB | Page backgrounds, cards |
| Success Green | #22C55E | Positive status, completion |
| Warning Amber | #F59E0B | Alerts, attention needed |
| Error Red | #EF4444 | Errors, destructive actions |

### Typography

| Use | Font | Fallback |
|-----|------|----------|
| Display/Headers | Outfit | system-ui |
| Headings | Playfair Display | Georgia |
| Body Text | Inter | system-ui |
| Code | JetBrains Mono | monospace |

### Design Principles
- **Light-first**: Default to light backgrounds. Dark mode as opt-in.
- **Bright and airy**: Generous whitespace, vibrant accents, optimistic feel.
- **Human-first**: No robot icons, brain graphics, or "AI" labels in the UI.
- **Delight**: Smooth transitions, smart defaults, celebration moments.

---

## 5. Content Guidelines

### Blog Post Standards
- 800-1,500 words for standard posts
- Always lead with the problem, not the solution
- Include at least one concrete example or data point
- End with a clear next step (not just "sign up")
- No stock photos — use product screenshots, diagrams, or original illustrations

### Social Media
- **LinkedIn**: Primary channel. 2-3 posts per week. Mix: insights, product updates, founder stories.
- **Twitter/X**: Shorter-form. Build in public, hardware community engagement.
- **YouTube**: Demo videos, founder interviews, tutorial walkthroughs.

### Email
- Subject lines: 6-10 words, benefit-focused, no clickbait
- Preheader text: Complement the subject, never repeat it
- One CTA per email
- Unsubscribe always visible

---

## 6. Module-Specific Style Overrides

### Forge Capital parity (Investors + Suppliers)

**Tristan mandate (2026-04-27):** "Fractionalforge.app has a very specific style guide which I'm now asking you to break so that it looks more like FORGE capital. The style guide will need to be updated as a result."

The **Investors** module (`/investors`, `/investors/[id]`, `InvestorDetailDialog`, `InvestorDeckSearchClient`) and the **Suppliers** module (`/suppliers`, supplier detail, supplier search) intentionally diverge from the default Fractional Forge tokens to mirror the Forge Capital dashboard 1:1.

**What changes inside these modules:**
- **Accent colour**: Forge Capital indigo (`#4F46E5`) replaces `--color-international-orange` for primary accents — numbers, links, scorecard fills, "Search" buttons, tab pills.
- **Score chip palette**: Tri-band — high `#16a34a`, mid `#f59e0b`, low `#dc2626`. NOT the Fractional Forge orange/grey gradient.
- **Layout**: Two-column dashboard shell (left filter rail, right results column) and modal-overlay detail view, matching `Forge-Capital-Search.html`.
- **Result cards**: Compact rank-prefixed (`1. <name>`) with 6-pillar scorecard grid, composite % badge top-right, 200-char thesis snippet, sector tag row.
- **Detail / modal section order**: Match Scorecard → Why-this-match callout → Pitch Guidance callout → **Investment Thesis (FIRST)** → Ideal Company Profile → Investment Pattern → Team Expertise → Connection Brief → Value Add → Fund Details → Partners → Portfolio → Data Quality.
- **Search-result thesis snippet**: Always `attrs.investment_thesis` first. Fall back to `ideal_company_profile`/`description` only when thesis is null.

**What stays Fractional Forge:**
- Sidebar / Mobile nav / Welcome / Brainstorming / The Forge.
- Marketing site, public pages, signup, pricing.
- Brand voice, copy rules, "no AI emphasis", British spelling.

**Why the two systems coexist:** Forge Capital is the canonical investor + supplier intelligence dashboard. The Fractional Forge platform embeds those two surfaces verbatim — re-skinning them to match Fractional Forge defaults destroys the dashboard density founders need. Treating them as embedded Forge Capital modules preserves quality while letting the rest of the platform keep its own voice.

**Authoritative reference:** When changing anything in `/investors` or `/suppliers`, the spec is `/Users/tristanfischer/Developer/Forge-Capital/Forge-Capital-Search.html` and `Forge-Capital-Dashboard.html` — NOT the default Fractional Forge components.
