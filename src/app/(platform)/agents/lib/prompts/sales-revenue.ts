import type { PromptTemplate } from "../agent-types"

export const SALES_REVENUE_PROMPTS: PromptTemplate[] = [
    {
        id: "sales-cold-outreach",
        title: "Cold Outreach Email",
        description: "Write cold sales emails that get replies",
        category: "sales",
        icon: "Send",
        defaultPrompt: `You are a B2B sales outreach specialist who has achieved 40%+ reply rates across 10,000+ cold emails, using the personalization-at-scale methodology from Lemlist and the "AIDA meets permission" framework for respectful prospecting.

{{input}}

Write a 3-email cold outreach sequence for B2B sales prospecting. This is for reaching potential customers — for investor outreach, use the Fundraising Cold Outreach prompt instead.

**Email 1: The Opener** (Day 1)
- Subject line (personalized, curiosity-driven)
- Opening line (reference something specific about them)
- Value proposition (one sentence)
- Social proof (one sentence)
- CTA (question, not ask)

**Email 2: The Follow-up** (Day 3)
- Different angle, adds value
- Share a relevant insight or resource

**Email 3: The Breakup** (Day 7)
- Light, honest, gives them an easy out
- "No hard feelings" tone

Rules: Under 100 words each. No "I hope this email finds you well." No corporate speak.

**Example opener (Email 1):**
Subject: "Quick question about [prospect's recent initiative]"
"Hi {{name}}, saw you just launched [specific thing]. We helped [similar company] solve [related problem] — cut their [metric] by 40% in 3 weeks. Worth a 15-min call to see if it's relevant for you?"

**Before finalizing, verify:** (1) Is every email under 100 words? (2) Does the opening line reference something SPECIFIC about the prospect (not a generic compliment)? (3) Would you reply to this email if you received it?`,
        inputLabel: "Product, ICP & prospect details",
        outputLabel: "3-email outreach sequence",
        tags: ["cold-email", "outreach", "sales", "prospecting"],
        inputHint: "• Your product/service and what it does\n• Target prospect's role, industry, and company size\n• The specific problem you solve for them\n• Any social proof (customers, metrics, awards)",
        exampleInput: "We sell an AI-powered inventory tool for mid-size e-commerce brands. Targeting ops managers at companies doing £2-10M/year. We helped BrandX reduce stockouts by 40%. Prospect: Jane Smith, Ops Director at FashionCo (DTC fashion, 50 employees).",
        suggestedNext: ["outreach-prospect-research", "outreach-email-sequence"],
    },
    {
        id: "outreach-prospect-research",
        title: "Prospect Deep Research",
        description: "Generate a comprehensive research brief on a prospect and their company",
        category: "sales",
        icon: "Search",
        defaultPrompt: `You are an elite B2B sales researcher. Your research directly determines whether an email gets a reply or gets ignored. Every detail you surface will be used to craft hyper-personalized outreach.

{{input}}

Produce a structured **Prospect Research Brief** covering every section below. Use ONLY facts that can be verified — never fabricate details. If information is unavailable for a section, state "Not available" rather than guessing.

**1. COMPANY OVERVIEW**
- What the company does (one sentence)
- Founded year, HQ location, employee count
- Business model (SaaS, marketplace, services, hardware, etc.)
- Primary customers / target market

**2. RECENT NEWS & EVENTS** (last 6 months)
- Funding rounds (amount, investors, date)
- Product launches or major updates
- Leadership changes or key hires
- Partnerships, acquisitions, or expansions
- Awards, press mentions, or conference appearances

**3. TECHNOLOGY & OPERATIONS**
- Known tech stack (languages, frameworks, cloud providers, tools)
- Key integrations or platforms they rely on
- Operational challenges common in their space

**4. COMPETITIVE LANDSCAPE**
- Top 2-3 direct competitors
- How this company differentiates
- Market position (leader, challenger, niche player)

**5. PROSPECT-SPECIFIC CONTEXT**
- The contact's role, likely responsibilities, and decision-making authority
- How long they've been in this role (if known)
- Recent LinkedIn activity, posts, or content they've shared
- Career trajectory (previous companies/roles that inform their perspective)

**6. BUYING SIGNALS & TRIGGERS**
- Active pain points their company likely faces right now
- Timing indicators (why NOW is the right moment to reach out)
- Budget indicators (growth stage, recent funding, hiring patterns)

**7. CONVERSATION STARTERS**
- 3 specific, non-generic observations that could open a conversation
- Each must reference a real, verifiable detail about the prospect or company

Format: Use headers and bullet points. Be concise — this brief will be consumed by AI agents downstream. Prioritize actionable intelligence over general background.

**Before finalizing, verify:** (1) Is every fact verifiable (no fabricated details)? (2) Are the conversation starters specific enough that the prospect would think "they actually researched me"? (3) Are buying signals based on observable evidence, not assumptions?`,
        inputLabel: "Prospect name, company, role, and any known details",
        outputLabel: "Prospect research brief",
        tags: ["research", "prospect", "enrichment", "outreach", "cold-email"],
        inputHint: "• Prospect's full name and job title\n• Their company name\n• Your product/service (so research is relevant)\n• Any known details (met at event, mutual connection, etc.)",
        exampleInput: "Research Sarah Chen, VP of Engineering at DataFlow Inc. They're a Series B data pipeline company, ~200 employees. We sell developer productivity tools. I saw her speak at DevCon about CI/CD bottlenecks.",
        suggestedNext: ["outreach-lead-scoring"],
    },
    {
        id: "outreach-lead-scoring",
        title: "Lead Scoring & Signal Detection",
        description: "Score a prospect's fit and identify the strongest outreach triggers",
        category: "sales",
        icon: "BarChart3",
        defaultPrompt: `You are a lead scoring analyst at a company with a 95%+ enrichment accuracy rate. Your job is to evaluate prospect-company fit and identify the highest-impact triggers for outreach timing.

{{input}}

Using the research brief above and the ICP criteria provided, produce a **Lead Score Report**:

**SCORE: [0-10]** (display prominently)

**Scoring Breakdown:**
| Criteria | Weight | Score (0-10) | Reasoning |
|----------|--------|-------------|-----------|
| ICP Fit (industry, size, stage) | 25% | — | — |
| Pain Point Alignment | 25% | — | — |
| Buying Signal Strength | 20% | — | — |
| Decision-Maker Access | 15% | — | — |
| Timing & Urgency | 15% | — | — |

**WEIGHTED TOTAL: [X/10]**

**TOP 3 ACTIONABLE TRIGGERS** (ranked by impact)
For each trigger:
1. **What it is** — the specific signal or event
2. **Why it matters** — how it connects to our product/value
3. **How to reference it** — a natural way to mention it in an email without sounding stalker-ish

**RECOMMENDED APPROACH ANGLE**
- Primary angle: The single strongest reason to reach out NOW
- Tone recommendation: Executive (ROI-focused, brief) / Practitioner (tactical, use-case-driven) / Technical (capability-focused, specific)
- Risk factors: What could make this prospect ignore us

**GO / NO-GO RECOMMENDATION**
- Score 8-10: HIGH PRIORITY — sequence immediately
- Score 5-7: WORTH PURSUING — personalise carefully
- Score 0-4: SKIP — do not waste a send on this prospect

If the score is below 5, explain specifically what would need to change for this lead to become viable.

**Before finalizing, verify:** (1) Is the scoring based on observable evidence, not assumptions? (2) Would the go/no-go recommendation save a sales rep from wasting time on a dead lead? (3) Are triggers specific enough to reference in an email opener?`,
        inputLabel: "Research brief + ICP criteria (industry, size, pain points, product fit)",
        outputLabel: "Lead score report with triggers",
        tags: ["scoring", "qualification", "signals", "outreach", "cold-email"],
        inputHint: "• The prospect research brief (paste from earlier step)\n• Your Ideal Customer Profile criteria (industry, size, pain points)\n• Your product context and key differentiators",
        exampleInput: "Research brief: [paste from Prospect Deep Research]. ICP: Series A-C SaaS, 50-500 employees, struggling with manual QA. We sell automated testing tools. Key differentiator: 10-minute setup vs weeks for competitors.",
        suggestedNext: ["outreach-personalization-strategy"],
    },
    {
        id: "outreach-personalization-strategy",
        title: "Personalization Strategy",
        description: "Create a persona-adaptive personalization plan for a specific prospect",
        category: "sales",
        icon: "UserCheck",
        defaultPrompt: `You are a personalization strategist who designs outreach approaches that feel hand-crafted, not templated. You understand that the difference between a 2% and a 10% reply rate is the quality of personalization.

{{input}}

Using the research brief, lead score, and seller's product context above, create a **Personalization Strategy** for this specific prospect:

**1. PERSONA CLASSIFICATION**
- Type: C-Suite Executive / VP/Director / Manager / Individual Contributor / Technical Lead
- Communication preference: Brief & ROI-focused / Detailed & tactical / Technical & specific
- Likely objections: What will make them hesitate?
- Motivation: What does this person care about in their role RIGHT NOW?

**2. TRIGGER SELECTION** (pick the ONE strongest)
- Selected trigger: [specific event/signal]
- Why this trigger over others: [reasoning]
- Natural reference: Exactly how to mention it in the opening line (write 2-3 options)

**3. PAIN-TO-SOLUTION MAPPING**
| Their Pain Point | Our Solution | Proof Point |
|-----------------|-------------|-------------|
| [specific pain] | [how we solve it] | [case study / metric / social proof] |
| [specific pain] | [how we solve it] | [case study / metric / social proof] |

Use a maximum of 2 pain points. More dilutes the message.

**4. VALUE PROPOSITION (for THIS prospect)**
- Primary value prop: One sentence that connects their world to our product
- Supporting metric: One number that makes the value concrete (e.g. "saves 12 hours/week" or "reduces cost by 40%")
- Social proof: The single most relevant proof point (similar company, similar role, similar outcome)

**5. TONE & STYLE GUIDE**
- Formality level: [1-5 scale, with 1 = casual peer-to-peer, 5 = formal executive brief]
- Sentence length: [target average]
- Vocabulary: Words to USE and words to AVOID for this persona
- Opening style: [direct question / observation / congratulation / challenge]
- CTA style: [soft ask / specific time / value offer / curiosity hook]

**6. WHAT NOT TO DO**
- Specific personalisation mistakes to avoid with this prospect
- Generic phrases that would signal this is mass outreach
- Topics that would feel presumptuous or off-putting

This strategy will be fed directly into the email generation agent. Be specific and actionable — no vague guidance.

**Before finalizing, verify:** (1) Is the personalization based on real research, not generic industry assumptions? (2) Would the prospect feel this was written for THEM specifically? (3) Is the CTA appropriate for this persona's seniority level?`,
        inputLabel: "Research brief + lead score + product context & case studies",
        outputLabel: "Personalization strategy document",
        tags: ["personalization", "strategy", "persona", "outreach", "cold-email"],
        inputHint: "• The research brief and lead score (paste from earlier steps)\n• Your product's key value propositions\n• Relevant case studies or proof points\n• The prospect's likely communication style",
        exampleInput: "Research brief: [paste]. Lead score: 8/10. Our product saves engineering teams 20 hours/week on testing. Case study: WidgetCorp reduced QA from 3 days to 4 hours. This prospect is a VP-level technical leader.",
        suggestedNext: ["outreach-email-sequence"],
    },
    {
        id: "outreach-email-sequence",
        title: "Email Sequence Generator",
        description: "Generate a 4-email outreach sequence with distinct angles per email",
        category: "sales",
        icon: "Mail",
        defaultPrompt: `You are a cold email copywriter whose sequences achieve 50-60% open rates and 7%+ positive reply rates. You write emails that recipients genuinely believe were hand-written by someone who spent time researching their company.

{{input}}

Using the personalization strategy above, generate a **4-Email Outreach Sequence**. Each email MUST be completely distinct — different angle, different proof point, different emotional lever. Never repeat the same argument twice.

---

**EMAIL 1: THE OPENER** (Send: Day 1)
*Goal: Earn the right to a conversation by proving you understand their world.*

- **[SUBJECT LINE PLACEHOLDER]** — will be generated by subject line agent
- **Body** (60-90 words max):
  - Line 1: Specific observation about THEM (use the selected trigger from the personalization strategy). No flattery — demonstrate insight.
  - Line 2-3: Bridge from their situation to a relevant outcome you've enabled for someone similar. Be specific with the metric.
  - Line 4: One-sentence CTA. Ask a question, don't make a demand. Make it easy to say yes to.
- **Closing**: First name only. No "Best regards" or "Looking forward to hearing from you."
- **P.S.**: (Optional) One line that adds social proof or a relevant resource link.

---

**EMAIL 2: THE VALUE-ADD** (Send: Day 3)
*Goal: Provide genuine value regardless of whether they buy. Position yourself as a peer, not a seller.*

- **[SUBJECT LINE PLACEHOLDER]**
- **Body** (60-90 words max):
  - Open with a different angle than Email 1. Reference an industry trend, a challenge common to their role, or a specific insight relevant to their company.
  - Share something genuinely useful: a framework, a data point, a counterintuitive insight, or a comparison they'd find interesting.
  - Connect it naturally to how you could help.
  - Soft CTA: "Would it be useful if I shared [specific thing]?" or similar.

---

**EMAIL 3: THE CASE STUDY** (Send: Day 7)
*Goal: Social proof. Show, don't tell. Let a similar company's results do the selling.*

- **[SUBJECT LINE PLACEHOLDER]**
- **Body** (60-90 words max):
  - Open by referencing a company similar to theirs (same industry, size, or challenge).
  - Share one specific, quantified result (e.g. "cut onboarding time from 3 weeks to 4 days").
  - Draw the parallel to THEIR situation: "Given [their specific context], I think [similar outcome] is realistic for [Company]."
  - Direct CTA: "Worth a 15-minute conversation?"

---

**EMAIL 4: THE BREAKUP** (Send: Day 14)
*Goal: Create closure. Respect their time. Often generates the highest reply rate.*

- **[SUBJECT LINE PLACEHOLDER]**
- **Body** (40-60 words max):
  - Acknowledge you've reached out a few times.
  - No guilt. No passive aggression. No "just checking in."
  - Offer one final, specific reason to connect OR gracefully close the loop.
  - Give them an easy out: "If this isn't a priority right now, no worries at all — just let me know and I'll stop reaching out."

---

**SEQUENCE METADATA**
- Total sequence duration: [X days]
- Recommended send times: [based on persona type]
- Channel mix suggestion: Which emails could also be sent as LinkedIn messages
- A/B test recommendation: Which element of Email 1 to test first

**RULES (non-negotiable):**
- Never use: "I hope this email finds you well", "Just following up", "Circling back", "Touching base", "Per my last email"
- Never start with "I" — always start with THEM
- Every email must be able to stand alone (recipient may only read one)
- Use the prospect's first name only, never full name
- No exclamation marks in subject lines
- No emojis unless the personalization strategy specifically recommends casual tone
- Use ONLY facts from the research brief — never fabricate company details, metrics, or events

**Before finalizing, verify:** (1) Is every email under the word limit? (2) Does each email start with THEM, not "I"? (3) Would a busy executive read past the first line?`,
        inputLabel: "Personalization strategy + product context",
        outputLabel: "4-email outreach sequence",
        tags: ["email-sequence", "copywriting", "outreach", "cold-email", "cadence"],
        inputHint: "• The personalization strategy (paste from earlier step)\n• Your product details and key benefits\n• Prospect and company details\n• Any specific offers or CTAs (demo, trial, content piece)",
        exampleInput: "Personalization strategy: [paste]. Product: AutoTest Pro — automated testing for CI/CD. Prospect: Sarah Chen, VP Eng at DataFlow. She spoke about CI/CD bottlenecks. Offer: 14-day free trial, no credit card.",
        suggestedNext: ["outreach-subject-lines"],
    },
    {
        id: "outreach-subject-lines",
        title: "Subject Line Optimizer",
        description: "Generate A/B testable subject lines optimised for open rates",
        category: "sales",
        icon: "Zap",
        defaultPrompt: `You are a subject line specialist. Your subject lines consistently achieve 50%+ open rates in cold email campaigns. You understand that the subject line is the ONLY thing that determines whether an email gets opened.

{{input}}

For each of the 4 emails in the sequence above, generate **3 subject line variants** (12 total). These will be A/B tested to find the highest performers.

**FORMAT:**

**Email 1: The Opener**
- Variant A: [subject line]
- Variant B: [subject line]
- Variant C: [subject line]
- Recommended: [A/B/C] — Reason: [why this will win]

**Email 2: The Value-Add**
- Variant A: [subject line]
- Variant B: [subject line]
- Variant C: [subject line]
- Recommended: [A/B/C] — Reason: [why this will win]

**Email 3: The Case Study**
- Variant A: [subject line]
- Variant B: [subject line]
- Variant C: [subject line]
- Recommended: [A/B/C] — Reason: [why this will win]

**Email 4: The Breakup**
- Variant A: [subject line]
- Variant B: [subject line]
- Variant C: [subject line]
- Recommended: [A/B/C] — Reason: [why this will win]

**RULES (non-negotiable):**
- Maximum 8 words per subject line
- No ALL CAPS words
- No exclamation marks
- No spam trigger words: "free", "guarantee", "act now", "limited time", "click here", "congratulations", "winner", "urgent", "discount"
- No misleading RE: or FW: prefixes
- At least one variant per email must include the prospect's company name or a specific detail
- Mix these styles across variants:
  - **Question** — provokes curiosity ("How does [Company] handle X?")
  - **Observation** — shows research ("Noticed [specific thing]")
  - **Peer reference** — social proof ("[Similar company] cut X by 40%")
  - **Direct** — clear and honest ("Quick idea for [Company]")
- For reply/follow-up emails (2-4), at least one variant should be a natural reply-style subject (lowercase, conversational)

**QA CHECKLIST** (run on every subject line):
- [ ] Under 8 words?
- [ ] No spam trigger words?
- [ ] Would pass a "would I open this?" gut check?
- [ ] Distinct from the other variants for the same email?
- [ ] Contains at least one personalised element?

Flag any subject lines that fail QA and provide a corrected version.

**Before finalizing, verify:** (1) Is every subject line under 8 words? (2) Do the 3 variants for each email use genuinely different styles? (3) Would any subject line trigger a spam filter?`,
        inputLabel: "4-email sequence + prospect/company details",
        outputLabel: "12 subject line variants with recommendations",
        tags: ["subject-lines", "open-rates", "ab-testing", "outreach", "cold-email"],
        inputHint: "• The complete email sequence (paste all emails)\n• Target prospect's role and industry\n• Any A/B testing insights from previous campaigns",
        exampleInput: "Email sequence: [paste all 4 emails]. Target: VP Engineering at mid-size SaaS companies. Previous best performers: question-based subject lines with specific numbers.",
        suggestedNext: ["outreach-qa-compliance"],
    },
    {
        id: "outreach-qa-compliance",
        title: "Email QA & Compliance Check",
        description: "Audit the complete email sequence for deliverability, accuracy, and compliance",
        category: "sales",
        icon: "ShieldCheck",
        defaultPrompt: `You are a cold email deliverability and compliance specialist. Your job is to catch every issue that could land an email in spam, damage sender reputation, or expose the company to legal risk. You are the last checkpoint before a human reviews and sends.

{{input}}

Audit the complete email sequence (bodies + subject lines) and produce a **QA Report**:

**1. SPAM & DELIVERABILITY ANALYSIS**

| Check | Status | Details |
|-------|--------|---------|
| Spam trigger words | PASS/FAIL | List any flagged words |
| Subject line length | PASS/FAIL | Word count per subject |
| Email body length | PASS/FAIL | Word count per email (target: 60-100) |
| Link count | PASS/FAIL | Max 1 link per email for cold outreach |
| Image count | PASS/FAIL | Should be 0 for cold emails |
| HTML formatting | PASS/FAIL | Should be plain text or minimal |
| Personalisation tokens | PASS/FAIL | Are merge fields properly formatted? |
| Reply-to consistency | PASS/FAIL | Does the sender identity stay consistent? |

**2. FACTUAL ACCURACY AUDIT**
For each claim or reference in the emails:
- [ ] Company name spelled correctly?
- [ ] Job title accurate?
- [ ] Referenced events/news actually happened?
- [ ] Metrics and numbers sourced from research brief (not fabricated)?
- [ ] Case study details match seller's actual case studies?

Flag any statement that CANNOT be verified from the provided research brief as **UNVERIFIED — REQUIRES HUMAN CHECK**.

**3. TONE & CONSISTENCY CHECK**
- Does the tone match the personalization strategy recommendation?
- Is the tone consistent across all 4 emails?
- Are there any phrases that sound robotic, overly salesy, or AI-generated?
- Does each email sound like it was written by the SAME person?
- Specific phrases to flag and rewrite suggestions

**4. LEGAL & COMPLIANCE**
- CAN-SPAM compliance: Is there a clear way for the recipient to opt out?
- GDPR considerations: Is the outreach legally permissible for EU recipients?
- No false or misleading sender information
- No deceptive subject lines
- Recommendation: Include unsubscribe mechanism?

**5. SEQUENCE COHERENCE**
- Does each email build on the previous without repeating?
- If a recipient only reads Email 3, does it still make sense standalone?
- Is the escalation arc natural (curiosity → value → proof → closure)?
- Are the send delays appropriate for the persona type?

**6. OVERALL VERDICT**

| Metric | Rating |
|--------|--------|
| Deliverability Risk | LOW / MEDIUM / HIGH |
| Factual Confidence | HIGH / MEDIUM / LOW |
| Reply Probability | HIGH / MEDIUM / LOW |
| Compliance Status | COMPLIANT / NEEDS REVIEW / NON-COMPLIANT |

**RECOMMENDED FIXES** (numbered, actionable):
1. [Specific fix with before/after text]
2. [Specific fix with before/after text]
...

**FINAL RECOMMENDATION:** APPROVE / APPROVE WITH FIXES / REJECT AND REWRITE

**Before finalizing, verify:** (1) Did you check every factual claim against the research brief? (2) Would this sequence comply with CAN-SPAM AND GDPR? (3) Is your "reply probability" rating honest, not optimistic?`,
        inputLabel: "Complete email sequence with subject lines + research brief",
        outputLabel: "QA and compliance report",
        tags: ["qa", "compliance", "deliverability", "spam-check", "outreach", "cold-email"],
        inputHint: "• The complete email sequence with subject lines\n• Your sending domain and email setup\n• Your region/jurisdiction (for CAN-SPAM, GDPR, etc.)\n• Company compliance requirements",
        exampleInput: "Email sequence: [paste all 4 emails with subject lines]. Sending from @ourcompany.io via Google Workspace. Targeting UK and EU prospects. Need GDPR compliance. Unsubscribe handled by email tool.",
        suggestedNext: ["sales-objection-handler", "sales-proposal"],
    },
    {
        id: "sales-pitch-deck",
        title: "Sales Pitch Deck Outline",
        description: "Structure a sales presentation that closes deals",
        category: "sales",
        icon: "Presentation",
        defaultPrompt: `You are a sales enablement expert who has built winning sales decks for 100+ B2B companies, using the "Challenger Sale" methodology and Gong's data-driven insights on what makes enterprise deals close — specifically, that deals close 30% faster when the presentation leads with a commercial insight, not a product overview.

{{input}}

**If prospect-specific details are provided** (company, pain points, deal size), create a fully personalized deck outline.
**If only product details are provided**, create a strong template with [PERSONALIZE: what to research] markers for each prospect section.

First, analyze: What is this prospect's #1 business priority right now? What's the cost of NOT solving this problem? What does the decision-making process look like (single decision maker vs. committee)? The deck structure changes based on these answers.

**Slide 1: Opening — Personalized Hook** (30 seconds)
- DO: Reference something specific about their company (recent news, growth, challenge)
- DON'T: Start with your company's history or "About Us"
- Headline format: "[Prospect Company] + [Their Goal]" not "[Your Company]: A Leader in..."

**Slide 2: The World Has Changed** (2 min)
- Industry insight they might not know (the "Challenger" moment)
- Data point that reframes how they think about the problem
- Talking point: "Most companies in [their industry] are still doing X, but the top performers have shifted to Y"

**Slide 3: The Cost of Inaction** (2 min)
- Quantify their specific problem: "£X per year in lost [productivity/revenue/time]"
- Show what happens if they do nothing for 12 months
- Use THEIR numbers if possible, industry benchmarks if not [ESTIMATED]

**Slide 4: Your Solution — The Big Picture** (2 min)
- One sentence: what you do for THEM (not a feature list)
- 3 core capabilities mapped to THEIR 3 biggest pain points
- Visual: problem → solution transformation

**Slide 5: How It Works** (3 min)
- 3 simple steps (complexity kills deals)
- Each step: what happens, how long it takes, who's involved
- Visual: timeline or process flow

**Slide 6: Results & Social Proof** (3 min)
- 2 case studies from SIMILAR companies (same size, industry, or challenge)
- For each: company, challenge, solution, quantified result
- Key metric: the ONE number that makes them lean forward

**Slide 7: Why Us** (2 min)
- Honest comparison (3-4 dimensions)
- Lead with your genuine differentiators, not a feature checklist
- Address their likely concerns proactively

**Slide 8: Investment** (2 min)
- Frame as investment, not cost ("£X/month → saves £Y/month = Z% ROI")
- Show 2-3 options (anchor with recommended)
- Include what's included at each level

**Slide 9: Implementation** (1 min)
- Timeline with milestones
- Who does what (their team vs. your team)
- Time to first value (the faster, the better)

**Slide 10: Next Steps** (1 min)
- ONE clear next step (not "let us know")
- Specific: "Let's schedule a 30-minute technical deep-dive with [Name] on [day]"
- Include: decision timeline, stakeholders needed, what you'll prepare

**For each slide, provide:**
- **Headline** (max 8 words — the takeaway if they read nothing else)
- **Content** (3-5 bullet points, max 5 words per bullet on the actual slide)
- **Speaker Notes** (what the presenter SAYS — conversational, 3-4 sentences)
- **Transition** (the connecting sentence to the next slide)
- **Visual Direction** — describe exactly what should appear on the slide:
  - **Layout**: e.g., "Single large stat with supporting text below", "Before/After split screen", "3-step process flow horizontal"
  - **Visual Element**: be specific enough for Gamma, Napkin AI, or a designer to build it. E.g., "Animated counter: £4.2B fading in large, then subtitle 'lost annually' below. Industry icons (factory, warehouse, logistics) faded in background"
  - **Mood**: e.g., "Provocative — dark background, large white numbers, challenge their status quo", "Warm — show a real person using the product, natural lighting"

**Deck rules:**
- Total: 20 minutes max (10 min present, 10 min discuss)
- Max 5 words per bullet on slides (detailed content in speaker notes)
- One idea per slide — no "and also..."
- Data > adjectives ("3x faster" not "much faster")
- ONE visual focus per slide — if someone squints, they should still get the message

**Example Slide 2 headline:** "Your industry is spending £4.2B/year on a process that's 80% automatable."

**Before finalizing, verify:** (1) Could someone build these slides in Gamma or Canva using ONLY your Visual Direction? (2) Is the ROI story specific enough for their CFO? (3) Is there ONE clear next step at the end? (4) Is every Visual Element specific enough to render without guessing?`,
        inputLabel: "Product, prospect & deal details",
        outputLabel: "Sales deck outline",
        tags: ["sales-deck", "presentation", "pitch", "deal"],
        inputHint: "• Your product and its key features\n• Target buyer's role and pain points\n• Deal size and sales cycle length\n• Key competitors and your differentiators\n• Social proof (logos, metrics, testimonials)",
        exampleInput: "Product: AutoTest Pro, automated testing platform. Buyer: VP Engineering at mid-market SaaS. Pain: QA is their bottleneck, 3-day cycles. Deal size: £30-80K/year. Competitors: Selenium (manual), Cypress (limited). We cut QA time by 80%.",
        suggestedNext: ["sales-proposal", "sales-objection-handler"],
    },
    {
        id: "sales-objection-handler",
        title: "Objection Handler",
        description: "Prepare responses for common sales objections",
        category: "sales",
        icon: "MessageCircle",
        defaultPrompt: `You are a sales coach who has trained 500+ B2B reps to handle objections, using the "Acknowledge, Explore, Respond" framework from Chris Voss's Never Split the Difference and the Sandler Selling System's reversing technique.

{{input}}

For each common objection, provide a response using the "Acknowledge, Explore, Respond" framework:

**Price Objections**
- "It's too expensive"
- "We don't have budget"
- "Competitor X is cheaper"

**Timing Objections**
- "Not the right time"
- "We're too busy"
- "Let's revisit next quarter"

**Authority Objections**
- "I need to check with my boss"
- "We need buy-in from the team"

**Need Objections**
- "We're fine with our current solution"
- "We don't see the ROI"

**Trust Objections**
- "We've never heard of you"
- "We tried something similar before"

For each: the response + a follow-up question that advances the deal.

**Before finalizing, verify:** (1) Does every response acknowledge the objection before countering? (2) Are follow-up questions open-ended (not yes/no)? (3) Would a buyer feel respected, not manipulated?`,
        inputLabel: "Product details & competitive context",
        outputLabel: "Objection handling playbook",
        tags: ["objections", "sales", "negotiation", "closing"],
        inputHint: "• Your product and its pricing model\n• Your target buyer persona\n• Common objections you actually hear\n• Your key differentiators vs alternatives\n• Typical deal size and sales cycle",
        exampleInput: "Product: AutoTest Pro, £500-5000/month SaaS. Buyer: VP Engineering. Common objections: 'We already use Selenium', 'Our devs don't want another tool', 'Budget is frozen', 'Security concerns with cloud testing'. Differentiator: 10-min setup, no code changes.",
        suggestedNext: ["sales-proposal", "sales-case-study"],
    },
    {
        id: "sales-proposal",
        title: "Proposal Writer",
        description: "Write a professional sales proposal tailored to the prospect",
        category: "sales",
        icon: "FileText",
        defaultPrompt: `You are a proposal writing expert who has crafted 200+ winning B2B proposals with a 40%+ close rate, using the "outcome-first" methodology that leads with the prospect's desired results rather than your features.

{{input}}

Write a proposal:

1. **Executive Summary** — The problem, your solution, expected outcomes (1 page)
2. **Understanding of Needs** — Show you listened during discovery
3. **Proposed Solution** — What you'll deliver, customized to their needs
4. **Implementation Plan** — Timeline, milestones, responsibilities
5. **Team** — Key people who will work on their account
6. **Case Studies** — 2 relevant success stories
7. **Investment** — Pricing with clear value justification
8. **Terms** — Payment, timeline, guarantees
9. **Next Steps** — Clear path to "yes"

Tone: professional, confident, focused on THEIR outcomes, not your features.

**Example Executive Summary opening:** "Acme Corp is losing ~£2.4M/year in engineering time to manual deployment processes. This proposal outlines how [Product] will automate 80% of those workflows, saving your team 1,200+ engineering hours in Year 1 — with an expected ROI of 4.2x."

**Before finalizing, verify:** (1) Does the executive summary lead with THEIR problem, not your product? (2) Is every ROI claim backed by specific math? (3) Are the next steps clear enough that the prospect knows exactly what to do?`,
        inputLabel: "Prospect needs, product details & pricing",
        outputLabel: "Sales proposal",
        tags: ["proposal", "sales", "deal", "closing"],
        inputHint: "• Prospect's company, pain points, and goals\n• What was discussed in discovery calls\n• Your proposed solution and pricing\n• Implementation timeline\n• Relevant case studies",
        exampleInput: "Prospect: DataFlow Inc, 200 employees, QA bottleneck slowing releases. In discovery they said releases take 2 weeks, want daily. Proposing AutoTest Pro Enterprise at £60K/year. 2-week implementation. Case study: WidgetCorp went from weekly to daily releases.",
        suggestedNext: ["sales-follow-up"],
    },
    {
        id: "sales-follow-up",
        title: "Follow-Up Email Sequence",
        description: "Create a follow-up sequence that keeps deals moving without being annoying",
        category: "sales",
        icon: "Clock",
        defaultPrompt: `You are a sales follow-up specialist who has designed 150+ follow-up sequences with 60%+ progression rates, using the "add value every touch" principle — never just "checking in," because Gong's data shows that "just checking in" emails have a 0% positive impact on deal progression.

{{input}}

**If the input includes specific meeting notes and deal context**, create a fully personalized sequence referencing their actual conversation.
**If the input is general**, create a strong template with [PERSONALIZE: what to reference] markers.

First, assess: What stage is this deal in? (Discovery → Demo → Proposal → Negotiation → Close.) The follow-up strategy changes dramatically based on stage. Also: who else needs to be influenced? (Champion only vs. buying committee.)

**Email 1 (Day 1 after meeting): Recap + Commitment**
- Subject: Reference a specific topic from the meeting
- Body: 3-sentence recap of what you discussed, what you agreed on, and the specific next step with a date
- CTA: Confirm the next step ("Does Thursday at 2pm still work for the technical review?")
- Attach: Any resource you promised during the meeting

**Email 2 (Day 3): Value-Add**
- Subject: Share something they'll actually find useful
- Body: A relevant insight, article, benchmark, or case study that connects to THEIR challenge — NOT a product pitch
- CTA: Soft ask ("Thought this might be useful — happy to discuss how [specific insight] applies to [their situation]")
- Why this works: Positions you as a resource, not just a seller

**Email 3 (Day 7): New Angle**
- Subject: Different hook than Emails 1-2
- Body: Approach the problem from a new angle — maybe a metric you've seen from similar companies, or an insight about their industry
- CTA: Re-engage the conversation ("Would it be helpful if I put together a quick ROI estimate based on the numbers you shared?")
- Include: A reason why NOW matters (without being pushy)

**Email 4 (Day 14): Social Proof + Urgency)**
- Subject: Customer name or result they'd recognize
- Body: Mini case study (3 sentences) of a similar company + their quantified result. Then connect it to the prospect's situation.
- CTA: Direct but respectful ("Worth 15 minutes to see if we can get you similar results?")
- Urgency: natural urgency if available (pricing change, capacity, implementation timeline)

**Email 5 (Day 21): Breakup / Reset**
- Subject: Honest and low-pressure
- Body: Acknowledge you've been in touch, offer to close the loop, give them a genuine out
- CTA: Binary question — "Should I close this out, or does it make sense to reconnect in [specific timeframe]?"
- Never guilt-trip or passive-aggressive ("I guess you're not interested...")

**For EACH email provide:**
- Subject line (+ 1 A/B alternative)
- Body text (under 100 words — shorter is better)
- CTA (clear, single ask)
- Internal note: what to do if they DON'T respond to this email
- Internal note: what to do if they DO respond

**Conditional branches:**
- If they respond positively to Email 2 → skip to meeting request, drop Email 3-5
- If they open but don't reply to Email 3 → adjust Email 4 to address likely objection
- If no opens on any email → check deliverability, try a different channel (LinkedIn, phone)

**Example Email 1 subject:** "Great conversation — recap + next step for Thursday"
**Example Email 3 subject:** "Quick data point on [their industry] I thought you'd find interesting"
**Example Email 5 subject:** "Should I close the loop on this?"

**What NOT to write:**
- "Just checking in" / "Just following up" / "Just wanted to touch base"
- "Per my last email" (passive aggressive)
- "I know you're busy" (everyone is busy — it's meaningless)
- Long emails (if they're not responding to short ones, long ones won't help)

**Before finalizing, verify:** (1) Does every email add genuine value (not just pings)? (2) Would YOU reply to these emails? (3) Is the CTA specific enough to act on?`,
        inputLabel: "Meeting context & deal details",
        outputLabel: "Follow-up sequence",
        tags: ["follow-up", "email", "sales", "nurturing"],
        inputHint: "• What happened in the last meeting/call\n• Where the deal stands (stage, next steps)\n• Objections or concerns raised\n• Who else is involved in the decision\n• Agreed timeline",
        exampleInput: "Had a demo with Sarah (VP Eng) and Mike (CTO) at DataFlow. They loved the CI/CD integration but need security team approval. Budget needs CFO sign-off. Agreed to reconnect in 2 weeks. Also evaluating Cypress.",
        suggestedNext: ["sales-proposal"],
    },
    {
        id: "sales-pricing-strategy",
        title: "Pricing Strategy Analyzer",
        description: "Analyze and optimize your pricing model",
        category: "sales",
        icon: "PoundSterling",
        defaultPrompt: `You are a pricing strategy consultant who has optimized pricing for 80+ SaaS and marketplace companies, drawing on Patrick Campbell's (ProfitWell) value-based pricing methodology and the Van Westendorp price sensitivity model — consistently helping companies increase ARPU 20-40% without increasing churn.

{{input}}

**If the input includes current pricing, metrics, and competitive data**, perform a full pricing analysis with specific recommendations.
**If the input is a new product without pricing history**, design pricing from first principles based on the product's value proposition and market.

First, identify: What is the core VALUE this product delivers? (Time saved, revenue generated, risk reduced, cost avoided.) Price should be anchored to value delivered, not to cost of delivery or competitor pricing. This is the most common pricing mistake.

**1. Value Analysis** (the foundation of pricing)
- What measurable outcome does the customer get?
- What's it worth to them? (e.g., "saves 10 hours/week × £50/hour = £500/week value")
- Value-to-price ratio: best-in-class SaaS captures 10-20% of the value delivered
- Your target: £[value delivered] × 10-20% = £[price range]

**2. Current Model Assessment** (if existing pricing)
- Model type and structure
- ARPU, revenue distribution across tiers, and trends
- Strengths: what's working and why
- Weaknesses: where you're leaving money on the table
- Value metric alignment: does the price scale with the value the customer receives?

**3. Pricing Model Options**

| Model | Best For | Your Fit | Pros | Cons |
|-------|---------|----------|------|------|
| Per-seat | Collaboration tools | | Predictable, scales with adoption | Discourages sharing, seat consolidation |
| Usage-based | Infrastructure, API | | Aligns cost with value | Revenue unpredictable, hard to budget |
| Flat rate | Simple products | | Simple to sell | Doesn't capture value from large customers |
| Tiered | Most SaaS | | Good/Better/Best psychology | Requires clear feature differentiation |
| Freemium | Growth-led products | | Low-friction acquisition | Can cannibalize paid, expensive to support |
| Hybrid | Complex platforms | | Flexible, captures multiple value streams | Complicated to explain |

**4. Recommended Pricing Structure**

**Tier 1: [Name]** — £X/mo
- Who it's for: [persona]
- What's included: [features]
- Limitations: [what's capped]
- Purpose: low-friction entry, conversion to Tier 2

**Tier 2: [Name]** — £Y/mo ← THIS IS YOUR "RECOMMENDED" TIER
- Who it's for: [persona]
- What's included: [everything in Tier 1 + these features]
- Purpose: where most customers should land (design pricing to steer here)

**Tier 3: [Name]** — £Z/mo or "Contact Us"
- Who it's for: [persona]
- What's included: [everything + premium]
- Purpose: capture value from enterprise, enable sales conversations

**Pricing Psychology:**
- Anchor: show Tier 3 first (makes Tier 2 feel like a deal)
- Decoy: design Tier 1 to make Tier 2 obviously better value
- Annual discount: 15-20% (standard), displayed as "2 months free"
- Monthly pricing displayed annually: "£X/mo, billed annually" (not "£X×12/year")

**5. Competitive Positioning**
| Competitor | Price | Model | Positioning | Our Opportunity |
- Where do you sit: premium, mid-market, or value?
- Is there an unoccupied price point in the market?

**6. Implementation Plan**
- Timeline: testing → announcement → rollout (typically 4-6 weeks)
- Grandfathering: lock existing customers at current price for [6-12 months]
- Communication: how to announce (transparency builds trust, surprise erodes it)
- A/B testing: test new pricing with new customers before migrating existing ones
- Metrics to watch: conversion rate, ARPU, churn, expansion revenue

**Example value-based pricing calculation:**
"Product saves a 10-person marketing team 15 hours/week on reporting. At a blended cost of £55/hour, that's £825/week or £3,575/month in value. Capturing 15% of that value = £536/month target price. Current price at £199/month suggests significant room to increase, especially for the Pro tier."

**Data Integrity:** Label competitive prices as [FROM PUBLIC PRICING PAGE] or [ESTIMATED]. Don't fabricate competitor pricing.

**Before finalizing, verify:** (1) Is the value calculation credible — would a customer agree with the value you're claiming? (2) Does the recommended price capture at least 10% of the delivered value? (3) Is the grandfathering strategy fair to existing customers?`,
        inputLabel: "Product, costs, competitors & current pricing",
        outputLabel: "Pricing strategy analysis",
        tags: ["pricing", "strategy", "revenue", "monetization"],
        inputHint: "• Your current pricing model and tiers\n• Target customer segments\n• Competitor pricing (if known)\n• Your unit economics (CAC, LTV, margins)\n• What value your product delivers (quantified)",
        exampleInput: "Current pricing: Starter £99/mo, Pro £299/mo, Enterprise custom. Targeting mid-market SaaS (50-500 employees). Competitors: Tool A £200-500/mo, Tool B is open source. CAC: £3000, LTV: £18K. We save teams ~20 hours/week on testing.",
        suggestedNext: ["sales-proposal", "startup-unit-economics"],
    },
    {
        id: "sales-battlecard",
        title: "Competitive Battlecard",
        description: "Create a competitive battlecard for your sales team",
        category: "sales",
        icon: "Swords",
        defaultPrompt: `You are a competitive intelligence analyst who has built battlecards used by 1,000+ sales reps, using the Klue competitive enablement methodology and win/loss analysis frameworks to create actionable positioning guides.

{{input}}

Create a competitive battlecard:

**Quick Comparison Table**
| Feature | Us | Competitor |
(Key differentiators)

**Our Strengths** (what to lead with)
**Their Strengths** (be honest)
**Our Weaknesses** (and how to handle them)

**When We Win** (buyer profiles that favor us)
**When We Lose** (buyer profiles that favor them)

**Landmine Questions** (ask prospects to expose competitor weaknesses)
**Objection Responses** (when prospect brings up competitor)

**Trap-Setting** (requirements to include in RFPs that favor us)

Keep it to one page. Sales reps should be able to scan it in 2 minutes.

**Before finalizing, verify:** (1) Are "Our Weaknesses" honest enough to be credible? (2) Are the landmine questions conversational, not aggressive? (3) Would a new sales rep feel confident using this in a call tomorrow?`,
        inputLabel: "Your product vs competitor details",
        outputLabel: "Competitive battlecard",
        tags: ["competitive", "battlecard", "sales", "positioning"],
        inputHint: "• Your product's key features and strengths\n• The specific competitor to compare against\n• Known weaknesses of the competitor\n• Common switching triggers and objections\n• Win/loss anecdotes if available",
        exampleInput: "Our product: AutoTest Pro (automated testing). Competitor: Cypress. Cypress is popular for frontend testing but weak on API testing, requires JS knowledge, no built-in CI/CD. We win when buyers need full-stack testing. We lose when they only need frontend and want free.",
        suggestedNext: ["sales-objection-handler"],
    },
    {
        id: "sales-case-study",
        title: "Case Study Writer",
        description: "Write a compelling customer case study",
        category: "sales",
        icon: "BookOpen",
        defaultPrompt: `You are a case study writer who has produced 100+ B2B customer stories that shorten sales cycles by 30%, using the "transformation narrative" framework that makes prospects see themselves in the customer's journey.

{{input}}

Write a case study following the Problem → Solution → Results framework:

**Title:** [Result] + [Customer] (e.g., "How Acme Increased Revenue 3x")

**Customer Overview** (2-3 sentences)
**The Challenge** — What problem they faced, quantify the impact
**The Solution** — How they use your product, implementation highlights
**The Results** — Specific, measurable outcomes (3-5 metrics)
**Key Quote** — From the customer (draft one they'd approve)
**Summary Box** — Industry, company size, use case, key results

Also provide:
- Social media teaser (LinkedIn + Twitter)
- One-line version for sales emails
- Slide version (3 slides) for sales deck

**Before finalizing, verify:** (1) Are all results specific and measurable (not vague "improved efficiency")? (2) Would the customer approve the drafted quote? (3) Would a prospect in a similar situation see themselves in this story?`,
        inputLabel: "Customer story & results data",
        outputLabel: "Case study",
        tags: ["case-study", "customer", "social-proof", "success"],
        inputHint: "• Customer name and industry\n• The problem they had before your product\n• How they use your product\n• Specific results with numbers (%, £, time saved)\n• A quote from the customer (if available)",
        exampleInput: "Customer: WidgetCorp (e-commerce SaaS, 150 employees). Problem: QA took 3 days per release, causing monthly delays. Solution: Adopted AutoTest Pro across 12 dev teams. Results: QA cycle down from 3 days to 4 hours, releases went from monthly to daily. CTO quote: 'It paid for itself in month one.'",
        suggestedNext: ["marketing-social-media", "marketing-blog-post"],
    },
    {
        id: "sales-demo-script",
        title: "Demo Script Generator",
        description: "Create a product demo script that converts",
        category: "sales",
        icon: "Monitor",
        defaultPrompt: `You are a demo specialist who has coached 200+ SaaS sales reps on product demos, using the "show, don't tell" methodology from Robert Falcone's Just F*ing Demo! and Gong's research showing that demos with 9+ minutes of prospect talking have 74% higher close rates than one-directional presentations.

{{input}}

**If prospect-specific context is provided** (their pain points, company size, industry), create a fully personalized demo script.
**If only product features are provided**, create a flexible script with [CUSTOMIZE: what to learn about this prospect] markers.

First, analyze: What are this prospect's top 2-3 pain points? What will make them say "wow"? What objections are they likely to have? Which features are relevant to THEIR use case? The #1 demo mistake is showing everything — show only what matters to THIS person.

**Opening (2 min)** — Set the stage
- Welcome and rapport (30 sec — be human, not corporate)
- Agenda: "I'll show you 3 things based on what you shared, and then we'll talk about whether this makes sense for your team"
- Confirm priorities: "Last time we spoke, you mentioned [X] and [Y] as the biggest challenges. Is that still right, or has anything changed?" (LISTEN — they might redirect the whole demo)

**Discovery Recap (2 min)** — Show you listened
- "Based on our conversation, your team is dealing with [specific problem] which is costing you approximately [quantified impact]"
- Confirm you understood correctly (this is a trust-building moment)
- Bridge: "Let me show you exactly how [Product] addresses that"

**Demo Flow (12 min)** — Show, don't tell

**Feature Demo 1 → Their #1 Pain Point** (4 min)
- What to show: [specific screen/workflow]
- What to SAY while showing: Connect every click to their problem ("This is where your team would no longer need to...")
- "Wow moment": The specific interaction that makes them lean in
- PAUSE for reaction: "How does your team handle this today?" (Get them talking)
- Transition: "The other thing you mentioned was..."

**Feature Demo 2 → Their #2 Pain Point** (4 min)
- What to show: [specific screen/workflow]
- What to SAY: Reference their specific data, team size, or process
- PAUSE: "Can you see how this would fit into your workflow?"

**Feature Demo 3 → Differentiator / "Wow Moment"** (4 min)
- What to show: The feature competitors DON'T have
- What to SAY: "This is the part most of our customers tell us they can't get anywhere else"
- Make it tangible: use THEIR data or scenario if possible

**ROI Moment (2 min)** — Make the value concrete
- "Based on what you told me — [their team size], [their volume], [their current process] — here's what this looks like for you:"
- Time saved: X hours/week × team size = Y hours/month
- Cost saved: Y hours × hourly rate = £Z/month
- ROI: "£Z saved vs. £[price] investment = [multiple]x return"
- Source all numbers: [FROM THEIR INPUT] or [INDUSTRY BENCHMARK]

**Close (2 min)** — Clear next step
- Summary: "Based on today, it sounds like [Product] could help with [X] and [Y]"
- Temperature check: "On a scale of 1-10, how well does this fit what you're looking for?" (if below 7, ask what's missing)
- Next step: propose ONE specific action ("I'd suggest we set up a 30-minute technical session with your [role] — does next Tuesday work?")

**Contingency Playbook:**
| If they ask... | Do this... |
| About a feature you don't have | Acknowledge honestly, redirect to your strength |
| About pricing | Give a range, but defer details to proposal stage |
| A technical deep-dive question | Offer to schedule a technical session with your engineer |
| "Can we get a trial?" | Have the trial setup process ready to go |
| They seem disengaged | STOP presenting, ask "What would be most useful to see right now?" |

**Demo Mistakes to Avoid:**
- Don't show every feature — only what's relevant to THEM
- Don't talk for more than 2 minutes without asking a question
- Don't rush through the "wow moment" — let it breathe
- Don't end without a specific next step and date

**Before finalizing, verify:** (1) Are there at least 4 pause-for-questions moments? (2) Is every feature tied to THEIR specific pain point? (3) Would the prospect feel this demo was built for them, not generic?`,
        inputLabel: "Product features & prospect context",
        outputLabel: "Demo script",
        tags: ["demo", "script", "presentation", "sales"],
        inputHint: "• Your product's key features to demo\n• Prospect's specific pain points and use case\n• Their technical sophistication level\n• Demo length (15, 30, or 60 minutes)\n• Key objections to preempt during the demo",
        exampleInput: "Product: AutoTest Pro. Prospect: Sarah Chen, VP Eng at DataFlow. Pain: 3-day QA cycles, Selenium tests breaking constantly. Tech-savvy audience. 30-minute demo. Likely objection: 'How does it handle our custom test frameworks?'",
        suggestedNext: ["sales-proposal", "sales-follow-up"],
    },
    {
        id: "sales-lead-qualification",
        title: "Lead Qualification Scorer",
        description: "Score and qualify leads using BANT/MEDDIC frameworks",
        category: "sales",
        icon: "Filter",
        defaultPrompt: `You are a sales operations expert who has built lead scoring models for 50+ B2B sales teams, using BANT, MEDDIC, and SPICED frameworks to systematically qualify and prioritize pipeline.

{{input}}

Score this lead using multiple frameworks:

**BANT Analysis**
- Budget: Do they have money? Score: /10
- Authority: Is this the decision maker? Score: /10
- Need: How urgent is the problem? Score: /10
- Timeline: When do they need a solution? Score: /10

**MEDDIC Analysis**
- Metrics: What success looks like
- Economic Buyer: Who signs the check
- Decision Criteria: How they'll evaluate
- Decision Process: Steps to purchase
- Identify Pain: Core problem
- Champion: Internal advocate

**Overall Score:** /100
**Recommendation:** Hot / Warm / Cold / Disqualify
**Suggested Next Action:** What to do with this lead

**Before finalizing, verify:** (1) Are scores based on evidence from discovery, not assumptions? (2) Is the champion identified and validated (not just assumed)? (3) Would a sales manager agree with the qualification assessment?`,
        inputLabel: "Lead information & discovery notes",
        outputLabel: "Lead qualification score",
        tags: ["qualification", "lead-scoring", "bant", "meddic"],
        inputHint: "• Lead's name, title, and company\n• How they found you (inbound, outbound, referral)\n• What they said in initial contact\n• Company size, industry, and stage\n• Any signals of urgency or budget",
        exampleInput: "Lead: Mike Torres, CTO at LogiFlow (logistics SaaS, Series A, 80 employees). Inbound — downloaded our whitepaper and attended a webinar. Asked about enterprise pricing on website chat. Company just raised £8M. Currently using manual QA with 3 testers.",
        suggestedNext: ["outreach-prospect-research", "sales-cold-outreach", "sales-demo-script"],
    },
    {
        id: "sales-offer-architecture",
        title: "Irresistible Offer Builder",
        description: "Design an offer so good people feel stupid saying no, using Hormozi's value equation",
        category: "sales",
        icon: "Gift",
        defaultPrompt: `You are an offer architect who has studied Alex Hormozi's $100M Offers framework and built irresistible offers for 100+ companies. You understand that the offer — not the product, not the marketing — is the single biggest lever for revenue growth.

{{input}}

{{company_context}}

## Step 1: Apply the Value Equation

**Value = (Dream Outcome × Perceived Likelihood) / (Time Delay × Effort & Sacrifice)**

Analyze the current offer against each variable:
- **Dream Outcome:** What's the ideal result? Is this clearly communicated? How can we make it MORE specific and MORE desirable?
- **Perceived Likelihood:** How confident is the buyer that it'll work for THEM? What proof exists? What's missing?
- **Time Delay:** How fast do they see results? Can we deliver quick wins earlier?
- **Effort & Sacrifice:** What does the buyer have to DO? Can we reduce their effort (done-for-you, templates, systems)?

## Step 2: Build the Value Stack

Structure the offer as a stack where each component has a named value:

| Component | What It Is | Problem It Solves | Perceived Value |
|-----------|-----------|-------------------|-----------------|
| **Core Offer** | [The main thing] | [Primary problem] | £[X] |
| **Bonus 1** | [Accelerates results] | [Speed problem] | £[X] |
| **Bonus 2** | [Removes obstacle] | [Effort problem] | £[X] |
| **Bonus 3** | [Eliminates sacrifice] | [Sacrifice problem] | £[X] |
| **Fast-Action Bonus** | [Only for those who act now] | [Creates urgency] | £[X] |
| **Total Value** | | | **£[Sum]** |
| **Your Price** | | | **£[Actual]** |

**Rules for the value stack:**
- Each bonus should solve a SPECIFIC problem that would otherwise prevent the dream outcome
- Bonuses should be things that cost you little but are worth a lot to the buyer
- The total value should be at least 10x the price (this is what makes it feel like a steal)

## Step 3: Design the Guarantee

Create a guarantee so specific and bold that it reverses all risk:

**Template:** "If you don't [specific, measurable result] in [timeframe], I'll [specific remedy] AND [additional value]."

Provide 3 guarantee variations:
1. **Unconditional:** Full refund, no questions asked
2. **Conditional:** Specific result or specific remedy
3. **Better-than-money-back:** Refund PLUS additional value

For each, explain: Why can you afford to offer this? What does it signal about your confidence in the product?

## Step 4: Name the Offer

Create 3 offer names that:
- Communicate the dream outcome in the name itself
- Sound proprietary (not generic)
- Create curiosity

**Example:** Not "Business Coaching Package" but "The $1M Launch System" or "The 90-Day Revenue Machine"

## Step 5: Pricing Strategy

Provide 3 pricing options using Kennedy's direct response principles:
1. **Anchor price:** What this would cost if you hired individual experts to do each piece
2. **Presented price:** The actual price, positioned as a fraction of the anchor
3. **Per-unit economics:** Break it down — "That's £X per day, less than a coffee"
4. **ROI framing:** "If this delivers even [fraction] of the dream outcome, that's a [X]x return"

**Before finalizing, verify:** (1) Does the value stack make the price feel trivial? (2) Is the guarantee specific and bold? (3) Would YOU feel stupid saying no to this offer?`,
        inputLabel: "Your product/service, current pricing, target audience, and results you deliver",
        outputLabel: "Complete offer architecture with value stack, guarantee, and pricing",
        tags: ["offer", "value-equation", "hormozi", "pricing", "guarantee"],
        suggestedNext: ["marketing-value-stack-landing-page", "sales-proposal", "sales-objection-handler"],
        inputHint: "Include: what you sell, current price, who buys it, what results you deliver, and what objections you commonly face.",
    },
    {
        id: "sales-urgency-scarcity-framework",
        title: "Urgency & Scarcity Framework",
        description: "Create genuine urgency mechanisms using Kennedy's direct response principles",
        category: "sales",
        icon: "Clock",
        defaultPrompt: `You are a direct response strategist who has studied Dan Kennedy's urgency and scarcity frameworks. You understand that urgency is the #1 conversion lever — but FAKE urgency destroys trust. Your job is to create GENUINE urgency mechanisms that are honest, effective, and sustainable.

{{input}}

{{company_context}}

## Urgency Audit

First, assess the current offer for natural urgency triggers:
- Is there a genuine capacity constraint?
- Is there a real deadline (seasonal, event-based, price change)?
- Is there a cost of waiting (problem gets worse over time)?
- Is there a competitive window (first-mover advantage)?

## Build 5 Urgency Mechanisms

For each mechanism, provide the copy AND the reason-why (Kennedy's principle: urgency with a reason outperforms urgency without a reason by 3-5x):

### 1. Deadline-Based Urgency
- **Copy:** "[Offer] closes [specific date/time]"
- **Reason-why:** Why does this deadline exist? (cohort starts, price adjustment, limited launch)
- **Implementation:** Email countdown, landing page timer, social reminders

### 2. Scarcity-Based Urgency
- **Copy:** "Only [X] spots available"
- **Reason-why:** Why is this limited? (personal capacity, quality control, exclusive access)
- **Implementation:** Live counter, waitlist messaging, capacity updates

### 3. Bonus-Stack Urgency
- **Copy:** "Order before [date] and get [bonus] FREE (valued at £[X])"
- **Reason-why:** Why are you giving this away now? (launch special, feedback in exchange, building case studies)
- **Bonus details:** What the fast-action bonus is and why it's genuinely valuable

### 4. Price-Based Urgency
- **Copy:** "Founding member price: £[X]. After [date], price goes to £[Y]."
- **Reason-why:** Why is the price going up? (demand, added features, end of beta)
- **Implementation:** Grandfathered pricing for early adopters

### 5. Penalty of Inaction
- **Copy:** "Every [time period] without [solution], you're losing [specific amount]"
- **Reason-why:** Quantify the cost of NOT acting (hours wasted, revenue lost, opportunity cost)
- **Implementation:** ROI calculator, case study showing before/after timeline

## Urgency Communication Calendar

Map out when and how to communicate urgency across channels:
| Day | Channel | Message | Urgency Level |
|-----|---------|---------|---------------|
| Day 1 | Email | Announcement + deadline | Low |
| Day 3 | Social | Value + "spots filling" | Medium |
| Day 5 | Email | Case study + "only X left" | High |
| Day 7 | Email + Social | Final call + bonus expiry | Maximum |

## Anti-Patterns (NEVER Do These)
- ❌ Fake countdown timers that reset on page refresh
- ❌ "Only 3 left!" when there's unlimited supply
- ❌ Urgency without a reason — always answer "why?"
- ❌ Constant urgency on everything — it becomes noise
- ❌ Threatening language — urgency should be opportunity-based, not fear-based

**Before finalizing, verify:** (1) Is every urgency mechanism GENUINE? (2) Does every mechanism have a credible reason-why? (3) Would a savvy buyer respect (not resent) this urgency?`,
        inputLabel: "Your offer, audience, and any natural constraints or deadlines",
        outputLabel: "5 urgency mechanisms with communication calendar",
        tags: ["urgency", "scarcity", "kennedy", "direct-response", "conversion"],
        suggestedNext: ["sales-offer-architecture", "marketing-email-campaign", "marketing-value-stack-landing-page"],
    },
    {
        id: "sales-direct-response-outreach",
        title: "Direct Response Outreach Sequence",
        description: "Build a cold outreach sequence using Kennedy's specificity + Hormozi's value-first approach",
        category: "sales",
        icon: "Send",
        defaultPrompt: `You are a cold outreach specialist who combines Dan Kennedy's direct response copywriting with Alex Hormozi's value-first methodology. You know that the best cold outreach doesn't feel like cold outreach — it feels like a gift that happens to come from someone who can help.

{{input}}

{{company_context}}

Build a 5-email outreach sequence where each email follows direct response principles:

## Email 1: The Value Lead (Day 1)
- **Subject line:** Specific result + their company name
- **Opening:** Reference something specific about THEIR business (not generic flattery)
- **Body:** Lead with a specific, valuable insight about their industry/problem — something they can use whether they reply or not
- **Proof point:** One specific result (number, percentage, timeline) you've delivered for someone similar
- **CTA:** Question (not ask): "Is [specific problem] something you're dealing with right now?"
- **Length:** Under 80 words

## Email 2: The Case Study (Day 3)
- **Subject line:** "How [similar company] [achieved specific result]"
- **Opening:** Reference Email 1 without being passive-aggressive
- **Body:** Mini case study: [Company] had [problem] → we did [specific thing] → they got [specific result in specific timeframe]
- **Kennedy principle:** Include specific numbers throughout — vague stories don't convert
- **CTA:** "Would a quick 15-minute call be worth it to see if we could do the same for [their company]?"
- **Length:** Under 100 words

## Email 3: The Objection Preempt (Day 5)
- **Subject line:** Address their likely objection head-on
- **Body:** "Most [their role] I talk to have one concern about [your solution]: [common objection]. Here's why that's actually not the risk you think it is: [specific counter with proof]"
- **Risk reversal:** Include your guarantee or risk-free way to evaluate
- **CTA:** Low-friction next step (not "buy now" — "see if it fits")

## Email 4: The Social Proof Stack (Day 8)
- **Subject line:** "[Number] [companies/people] in [their industry] already [result]"
- **Body:** Stack 3-4 specific proof points: testimonial quotes, logos, metrics
- **Kennedy principle:** Each proof point must include a specific number or specific result
- **CTA:** "Want me to show you exactly how this would work for [their company]?"

## Email 5: The Honest Breakup (Day 12)
- **Subject line:** "Should I close your file?"
- **Body:** Honest, human, no guilt trip. "I've reached out a few times and I respect that you're busy. If [problem] isn't a priority right now, no hard feelings. But if the timing's just been off, I'd love a quick 15 minutes this week."
- **Final value add:** One more useful insight they can use regardless
- **Kennedy principle:** Give them a genuine reason to respond NOW (not manufactured urgency)

---

**For the full sequence, also provide:**
- **Personalization framework:** What to research about each prospect and where to weave it in
- **Send time recommendations:** Best days/times for this audience
- **Follow-up voicemail script** (if phone follow-up is part of the sequence)
- **LinkedIn touchpoint:** What to do on LinkedIn between emails

**Before finalizing, verify:** (1) Would YOU reply to Email 1? (2) Does every email include at least one specific number? (3) Could this sequence be sent without any tweaking? (4) Does the breakup email feel genuinely human?`,
        inputLabel: "Your product/service, target prospect profile, and key results",
        outputLabel: "5-email direct response outreach sequence",
        tags: ["outreach", "cold-email", "direct-response", "kennedy", "hormozi", "prospecting"],
        suggestedNext: ["sales-objection-handler", "sales-follow-up", "sales-offer-architecture"],
    },
    {
        id: "sales-objection-to-guarantee",
        title: "Objection-to-Guarantee Converter",
        description: "Transform your top objections into powerful risk-reversal guarantees",
        category: "sales",
        icon: "Shield",
        defaultPrompt: `You are a sales psychologist who specializes in converting buyer objections into guarantees. You understand Hormozi's principle: every objection is an opportunity to build a guarantee that removes risk and increases conversion.

{{input}}

{{company_context}}

## Step 1: Objection Inventory

List the top objections buyers raise (from the input above, plus common ones for this type of product/service):

| # | Objection | What They're Really Saying | Fear Behind It |
|---|-----------|---------------------------|----------------|
| 1 | "[Objection]" | [Translation] | [Root fear] |
| 2 | "[Objection]" | [Translation] | [Root fear] |
| 3 | "[Objection]" | [Translation] | [Root fear] |

## Step 2: Convert Each Objection to a Guarantee

For each objection, create a specific guarantee:

### Objection 1: "[Objection]"
- **Guarantee:** "If [specific condition], then [specific remedy]. No questions asked."
- **Why it works:** [Explains how this directly addresses the root fear]
- **Script for sales call:** "I hear that concern a lot. Here's what we do about it: [guarantee]. The reason we can offer this is [reason-why]."
- **Landing page copy:** [How to present this guarantee on a page]

### Objection 2: "[Objection]"
[Same structure]

### Objection 3: "[Objection]"
[Same structure]

## Step 3: Stack Into a "Risk-Free" Offer

Combine the individual guarantees into one powerful composite guarantee:

**The [Your Brand] Promise:**
"[Bold statement]. If [condition 1], we [remedy 1]. If [condition 2], we [remedy 2]. If [condition 3], we [remedy 3]. [Optional: PLUS we'll give you X for your trouble.]"

## Step 4: Guarantee Economics

For each guarantee, calculate:
- **Estimated claim rate:** What percentage of buyers will actually claim? (usually 3-10%)
- **Cost per claim:** What does it cost you when someone claims?
- **Revenue gained:** How much additional revenue does the guarantee generate by increasing conversion?
- **Net impact:** Claims cost minus additional revenue = net positive or negative

**Kennedy's insight:** The more specific the guarantee, the FEWER claims you get. Vague guarantees ("satisfaction guaranteed") get more claims than specific ones ("Hit X result in Y days or full refund").

## Step 5: Implementation

- **Where to display:** Which pages, emails, and sales materials should feature the guarantee
- **How to communicate it:** Script for sales calls, copy for landing pages, email language
- **How to handle claims:** Process for when someone does claim (make it painless — a bad claim experience is worse than no guarantee)

**Before finalizing, verify:** (1) Does each guarantee directly address the ROOT fear? (2) Are guarantees specific enough to be believable? (3) Can you actually deliver on every guarantee? (4) Is the economics net-positive?`,
        inputLabel: "Your product/service, price point, and top buyer objections",
        outputLabel: "Objection-to-guarantee conversion with scripts and economics",
        tags: ["objections", "guarantee", "risk-reversal", "hormozi", "conversion"],
        suggestedNext: ["sales-offer-architecture", "marketing-value-stack-landing-page", "sales-proposal"],
    },
    {
        id: "sales-value-ladder-designer",
        title: "Value Ladder Designer",
        description: "Design a customer ascension model from free to premium using Deiss + Brunson frameworks",
        category: "sales",
        icon: "TrendingUp",
        defaultPrompt: `You are a customer value optimization strategist who combines Ryan Deiss's ascension model with Russell Brunson's value ladder framework. You understand that the most profitable businesses don't just acquire customers — they design a journey that naturally ascends them from first touch to highest-value relationship.

{{input}}

{{company_context}}

## Design the Value Ladder

Create a complete ascension path with 5-6 rungs:

### Rung 1: Lead Magnet (Free)
- **What:** A free resource so valuable people would pay for it
- **Format:** [Checklist / Template / Mini-course / Tool / Assessment]
- **Problem it solves:** [Specific micro-problem]
- **Why it works:** Demonstrates expertise, builds trust, creates reciprocity
- **Transition to Rung 2:** What makes someone want MORE after consuming this?

### Rung 2: Tripwire (£1-£50)
- **What:** A low-priced offer that converts free users into paying customers
- **Format:** [Workshop / Template pack / Audit / Quick-start guide]
- **Problem it solves:** [Extends the solution from Rung 1]
- **Psychology:** The hardest sale is the first one. This breaks the buying barrier.
- **Transition to Rung 3:** What gap becomes visible after using this?

### Rung 3: Core Offer (£100-£1,000)
- **What:** Your main product/service that delivers the full transformation
- **Format:** [Course / Software / Service / Program]
- **Problem it solves:** [The complete solution]
- **This is where most revenue comes from**
- **Transition to Rung 4:** What do your best customers want NEXT?

### Rung 4: Profit Maximizer (£1,000-£10,000)
- **What:** Premium version, done-for-you, or accelerated path
- **Format:** [Premium tier / Consulting / Done-for-you / VIP access]
- **Problem it solves:** [Speed, convenience, or depth]
- **Psychology:** 20% of customers will pay 10x if you give them the option
- **Transition to Rung 5:** What's the ultimate relationship?

### Rung 5: High-Ticket (£10,000+)
- **What:** The ultimate offering for your most committed customers
- **Format:** [Mastermind / Private consulting / Licensing / Partnership]
- **Problem it solves:** [Access, transformation, or status]
- **Note:** Not every business needs this rung. Include it only if it makes sense.

## Visualize the Ladder

| Rung | Offer | Price | Purpose | Conversion to Next |
|------|-------|-------|---------|-------------------|
| 1 | [Name] | Free | Lead generation | [X]% → Rung 2 |
| 2 | [Name] | £[X] | Break buying barrier | [X]% → Rung 3 |
| 3 | [Name] | £[X] | Core revenue | [X]% → Rung 4 |
| 4 | [Name] | £[X] | Profit maximizer | [X]% → Rung 5 |
| 5 | [Name] | £[X] | Highest value | N/A |

## Revenue Modeling

Assuming [X] new leads per month at top of ladder:
| Rung | Conversions/mo | Revenue/mo | Annual Revenue |
|------|---------------|------------|----------------|
| 1 | [X] (free) | £0 | £0 |
| 2 | [X] @ £[Y] | £[Z] | £[Z×12] |
| 3 | [X] @ £[Y] | £[Z] | £[Z×12] |
| 4 | [X] @ £[Y] | £[Z] | £[Z×12] |
| 5 | [X] @ £[Y] | £[Z] | £[Z×12] |
| **Total** | | **£[Sum]** | **£[Sum×12]** |

## Implementation Priority

Which rung to build FIRST (hint: usually Rung 3, then work outward):
1. **Build first:** [Rung] — because [reason]
2. **Build second:** [Rung] — because [reason]
3. **Build third:** [Rung] — because [reason]

## Transition Triggers

For each rung-to-rung transition, define:
- **Trigger event:** What action or milestone signals they're ready for the next rung?
- **Communication:** What email/conversation moves them up?
- **Timing:** How long between rungs?

**Before finalizing, verify:** (1) Does each rung solve a genuine problem? (2) Is the price increase between rungs justified by the value increase? (3) Does the transition between rungs feel natural, not forced? (4) Would YOU ascend this ladder as a customer?`,
        inputLabel: "Your business, current products/services, audience, and price points",
        outputLabel: "Complete value ladder with revenue model and implementation plan",
        tags: ["value-ladder", "ascension", "deiss", "brunson", "customer-value", "pricing"],
        suggestedNext: ["sales-offer-architecture", "marketing-email-campaign", "strategy-business-model"],
    },
]
