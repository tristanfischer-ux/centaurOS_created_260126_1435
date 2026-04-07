# Fractional Forge — Go-to-Market Plan (Red-Teamed Final)

**Version:** 3.0 (post-3x red team)  
**Date:** 2026-04-07  
**Status:** Ready for execution

---

## Executive Summary

This plan launches Fractional Forge as an invite-only network of pre-vetted fractional CFOs for PE-backed companies scaling £3M-£15M, before expanding to other C-suite functions. It prioritises trust-building over traffic, concierge matching over automation, and geographic density (London/SE) over national coverage.

**The three bets:**
1. Win 5 PE fund relationships (each = 5-15 portfolio companies)
2. Build a curated bench of 20 genuinely impressive fractional CFOs
3. Hand-broker 10 placements that become publishable case studies

Everything else — SEO, content, partnerships, automation — supports these three.

---

## Part 1: Who We Serve (Narrowed ICPs)

### ICP A: The Company (Demand Side)

**Beachhead segment:** PE-backed companies, £3M-£15M revenue, 20-80 employees, London/SE England.

| Attribute | Detail |
|---|---|
| **Ownership** | Lower-mid-market PE fund (BGF, LDC, NorthEdge, Foresight, August Equity) |
| **Stage** | Post-acquisition (100 days), pre-exit preparation, or scaling under new ownership |
| **Trigger event** | PE fund says "you need proper financial reporting" / board demands management accounts / preparing for bolt-on acquisition or exit |
| **Decision maker** | CEO (appointed by fund) or PE fund operating partner |
| **Pain** | "The fund wants board-ready management accounts by Q2. We've never had a real finance function." |
| **Budget** | £1,500-£3,000/week (2-3 days of a senior FD/CFO) |
| **Why PE-backed?** | Concentrated buyer (200 UK funds), recurring need (every portfolio company), high willingness to pay, low price sensitivity (fund expenses it) |

**Expansion path (Month 6+):** VC-backed Series A/B → bootstrapped £5M+ → other functions (CTO, COO, CMO).

### ICP B: The Executive (Supply Side)

**Beachhead segment:** Fractional CFOs/FDs with PE-backed company experience, based in London/SE.

| Attribute | Detail |
|---|---|
| **Background** | Former FD/CFO who has worked inside PE portfolio companies |
| **Seniority** | 15+ years, ACA/ACCA/CIMA qualified |
| **Current model** | Already fractional (2-4 clients), wants better client pipeline |
| **Pain** | "I spend 40% of my time on biz dev. I want pre-qualified introductions to PE-backed companies." |
| **What they value** | Quality of clients (PE = serious, well-funded), no tyre-kickers, professional positioning, published rates |
| **Differentiator they care about** | FF provides PE-specific deal flow they can't get from The CFO Centre (which serves SMEs broadly) |

**Expansion path:** Other PE-experienced execs (COO, CTO) → broader fractional market.

---

## Part 2: Competitive Positioning

### Why Not The CFO Centre?
They employ CFOs directly (40-60% markup, hidden pricing). They serve SMEs broadly. They don't specialise in PE environments where the CFO needs debt covenant reporting, board packs, and exit preparation.

### Why Not LinkedIn?
Free but unvetted. 50 applicants in 24 hours, 2 weeks of inbox sorting, no case studies, no rate transparency, no quality signal.

### Why Not Odgers/Exec Capital?
Premium recruitment firms. 3-6 week timelines, £20K+ placement fees, designed for permanent/interim, not fractional.

### Fractional Forge's Wedge
**"48 hours from brief to shortlist. Published day rates. PE-specialist CFOs with verified case studies."**

The value prop is **speed + transparency + PE specialisation**:
- Speed: AI matching delivers 3 pre-vetted candidates in 48 hours (vs 2-3 weeks elsewhere)
- Transparency: Published day rates (radical — incumbents hide pricing behind sales calls)
- Specialisation: Every exec on the platform has verifiable PE-backed company experience

---

## Part 3: Business Model

### Revenue Streams

| Stream | Amount | When |
|---|---|---|
| **Placement fee** | £3,000-£5,000 per successful match | On engagement start |
| **Platform subscription (company)** | £200-£400/month | Ongoing (includes IR35 compliance tools, time tracking, deliverable management) |
| **Platform subscription (exec)** | £0 (free for first 50 founding execs) → £49/month after | Post-founding period |
| **PE fund portfolio deal** | 20% discount on placement fees for 5+ concurrent placements | Per fund agreement |

### Preventing Disintermediation
The subscription must justify itself independently:
- IR35 compliance documentation and status determination
- Time tracking and deliverable management (already built)
- Contract templates for fractional engagements
- Insurance wrapper referral
- Ongoing match quality — the next hire is easier

### Unit Economics Target
- Average placement fee: £3,500
- Average monthly subscription: £300
- Average engagement duration: 9 months
- LTV per company: £3,500 + (£300 x 9) = £6,200
- CAC target: <£1,500 (break even on placement fee alone)

---

## Part 4: 90-Day Execution Plan

### Phase 0: Platform Readiness (Week 0 — before any GTM)

These must ship before a single outreach message is sent:

| # | Task | Owner | Days |
|---|---|---|---|
| 1 | Install PostHog analytics + UTM capture on signup | Claude Code | 1 |
| 2 | Build audience-specific landing pages: `/for-pe-funds`, `/for-cfo` | Claude Code | 2 |
| 3 | Build email capture + Resend broadcast list (newsletter signup on all public pages) | Claude Code | 1 |
| 4 | Build `/blog` route with MDX support | Claude Code | 2 |
| 5 | Build standalone `/case-studies` page (aggregates from exec profiles) | Claude Code | 1 |
| 6 | Enrich top 50 programmatic SEO pages with real content (salary data, hiring guides, local context) | Claude Code | 2 |
| 7 | Add "Published Day Rate" prominently to all exec cards and profiles | Claude Code | 0.5 |
| 8 | Create PE fund portal concept page (`/for-pe-funds`) with portfolio dashboard mockup | Claude Code | 1 |

**Total: ~10 days of Claude Code work. Tristan reviews/approves daily.**

### Phase 1: Supply Seeding (Weeks 1-4)

**Goal:** 15 complete, impressive CFO profiles live on the platform.

**Week 1:**
- [ ] Identify 100 fractional CFOs on LinkedIn with PE-backed experience (use Nightshift to source + enrich)
- [ ] Draft "founding executive" pitch: zero platform fees for 6 months, permanent founding badge, featured placement, input into product roadmap
- [ ] Send 20 LinkedIn connection requests/day with personal note (Tristan only — cannot automate)
- [ ] Publish 1 LinkedIn post: "Why I'm building Fractional Forge" (founder story, not product pitch)

**Week 2:**
- [ ] Take 10-15 intro calls with interested execs (15 min each — qualify for PE experience)
- [ ] Offer white-glove onboarding: "Send me your CV, I'll build your profile" (reduce friction to zero)
- [ ] Get first 5 profiles live with real headshots, real case studies, real day rates
- [ ] Publish 1 LinkedIn post: insight about fractional CFO market (use platform data even if small)

**Week 3:**
- [ ] Continue outreach — 20 connection requests/day
- [ ] Take another 10-15 calls
- [ ] Get profiles 6-10 live
- [ ] Write first blog post: "What PE funds actually need from a fractional CFO" (targets long-tail SEO)
- [ ] Publish 1 LinkedIn post

**Week 4:**
- [ ] Profiles 11-15 live — marketplace now looks credible for CFO searches
- [ ] Quality check: every profile has headshot, 2+ case studies, published day rate, PE-relevant experience
- [ ] Reject any execs who don't meet quality bar (curation > volume)
- [ ] Publish 1 LinkedIn post + 1 blog post

**Success criteria:** 15 PE-experienced CFO profiles that a PE operating partner would find credible.

### Phase 2: Demand — PE Fund Outreach (Weeks 5-8)

**Goal:** 5 PE fund relationships, 3-5 qualified company introductions.

**Week 5:**
- [ ] Identify 30 target PE funds (lower-mid-market, UK, 5+ portfolio companies in £3M-£15M range)
- [ ] For each: find the operating partner or portfolio talent lead (the person who hires for portfolio companies)
- [ ] Ask your 15 execs: "Which PE funds have you worked with?" — warm intros are 10x more effective
- [ ] Send first 10 outreach messages: "We have 15 pre-vetted CFOs who specialise in PE portfolio environments. First placement is free if it doesn't work out."

**Week 6:**
- [ ] Take meetings with interested funds (expect 3-5 from 30 outreaches)
- [ ] Pitch: "Use us as your go-to fractional CFO bench. We'll match within 48 hours. First one's risk-free."
- [ ] Send second batch of 10 outreaches
- [ ] Publish 1 LinkedIn post about PE + fractional exec trends

**Week 7:**
- [ ] Follow up on all Week 5-6 conversations
- [ ] Get first 1-2 concrete briefs from PE portfolio companies
- [ ] Hand-match these yourself (you know all 15 execs personally by now)
- [ ] Make introductions via warm email (3-way intro: you, exec, company CEO)

**Week 8:**
- [ ] First 1-2 placements confirmed (or at least in trial)
- [ ] Document EVERYTHING: time-to-match, company feedback, exec feedback
- [ ] Begin writing case study #1
- [ ] Publish 1 LinkedIn post: "Our first match: 36 hours from brief to introduction"

**Success criteria:** 5 PE fund contacts engaged, 3 company briefs received, 1-2 placements in progress.

### Phase 3: Prove & Scale (Weeks 9-12)

**Goal:** 5 confirmed placements, 2 publishable case studies, first revenue.

**Week 9-10:**
- [ ] Close 3-5 more placements from PE pipeline
- [ ] Collect feedback at 30-day mark from first placements
- [ ] Get logo permission from 3+ companies
- [ ] Write and publish 2 case studies on `/case-studies`
- [ ] Send first newsletter to collected email list (even if only 50-100 people)

**Week 11-12:**
- [ ] Publish "State of Fractional CFOs in PE" micro-report (original data from your placements)
- [ ] Begin expanding exec bench to 25-30 (now you have proof points to recruit with)
- [ ] First approach to 2 accounting firms (with case studies and PE fund logos in hand)
- [ ] Review all metrics: which outreach messages converted? Which exec profiles got most interest? What day rates are market-clearing?
- [ ] Plan Month 4-6 based on real data, not assumptions

### Phase 3 Targets (Honest Numbers)

| Metric | Month 1 | Month 2 | Month 3 |
|---|---|---|---|
| Exec profiles (PE CFOs) | 15 | 20-25 | 25-30 |
| PE fund relationships | 0 | 5 | 8-10 |
| Qualified company briefs | 0 | 3-5 | 8-12 |
| Confirmed placements | 0 | 1-2 | 5-8 |
| Placement revenue | £0 | £3K-£10K | £15K-£25K |
| Published case studies | 0 | 0 | 2-3 |
| Email list size | 20 | 80 | 150-200 |
| Blog posts published | 0 | 2 | 4-6 |

---

## Part 5: Channel Strategy (2 Per Audience, Deep Not Wide)

### For Companies: PE Fund Operating Partners + Programmatic SEO

**Channel 1 — PE Fund Direct Outreach (primary, Weeks 5-12)**
- Target: Operating partners and portfolio talent leads at 30 UK lower-mid-market PE funds
- Method: LinkedIn + warm intros from execs on the platform
- Offer: First placement risk-free, 48-hour matching SLA, portfolio dashboard
- Why this channel: One relationship = 5-15 potential clients. Concentrated, high-intent, recurring need.
- Human effort required: 5-10 hours/week (Tristan)

**Channel 2 — Programmatic SEO (compounding, start Week 0)**
- Target: Long-tail keywords incumbents ignore: "fractional CFO for PE portfolio companies", "fractional FD private equity UK", "part-time CFO for acquisition integration"
- Method: Claude Code generates 200+ hyper-specific pages with genuine content (salary benchmarks, hiring guides, PE-specific advice)
- Why this channel: Zero marginal cost, compounds over 6-12 months, already have infrastructure
- Human effort required: 2 hours/week (review AI-generated content)

**Deferred channels (Month 4+):** Accounting firm partnerships, Google Ads, content marketing at scale.

### For Executives: LinkedIn Outbound + Referrals

**Channel 1 — LinkedIn Direct Recruitment (primary, Weeks 1-4)**
- Target: People whose LinkedIn headline says "Fractional CFO" or "Portfolio FD" + PE-backed company history
- Method: 20 connection requests/day + personal note + 15-min qualification call
- Offer: Founding exec status, zero fees for 6 months, featured placement, pre-qualified PE deal flow
- Why this channel: Execs ARE on LinkedIn. They respond to personal outreach from founders, not ads.
- Human effort required: 10-15 hours/week (Tristan — the single biggest time commitment)

**Channel 2 — Exec-to-Exec Referrals (secondary, Week 3+)**
- Lever the existing referral system: every exec you recruit knows 5 more
- Offer: "Refer a colleague → they get founding status, you get priority placement for 30 days"
- Why this channel: Fractional CFOs run in tight networks. One good exec refers three more.
- Human effort required: 1 hour/week (follow up on referral invites)

**Deferred channels (Month 4+):** ICAEW partnership, fractional exec communities, podcast appearances.

---

## Part 6: Content Strategy (Sustainable for Solo Founder)

### Reality-Adjusted Cadence

| Type | Frequency | Owner | Time/week |
|---|---|---|---|
| LinkedIn post (founder voice) | 1/day, 5x week | Claude drafts, Tristan edits (10 min each) | 1 hour |
| Blog post (SEO-optimised) | 1/week | Claude drafts, Tristan reviews | 1 hour |
| Newsletter | Monthly | Claude drafts from blog + placement stories | 30 min |
| Case study | As placements complete | Tristan interviews, Claude writes | 2 hours each |

**Total content time: ~3 hours/week** (vs 8-10 hours in the original plan).

### LinkedIn Content Pillars (5 rotating topics)

1. **Builder diary** — "Here's what happened this week building Fractional Forge" (vulnerability, traction signals)
2. **Market insight** — "PE funds are hiring 3x more fractional CFOs than 2024. Here's why." (data, positioning)
3. **Exec spotlight** — "Meet [Name], one of our founding CFOs. She scaled 4 PE portfolio companies from £5M to £40M." (social proof)
4. **Hot take** — "The CFO Centre charges 50% markup and hides pricing. We publish day rates. Here's why." (differentiation, controversy drives engagement)
5. **Company story** — "A PE-backed manufacturer needed a CFO in 48 hours. Here's how we matched them." (proof of concept)

### Blog SEO Targets (1/week)

Month 1-2 topics:
- "How to Hire a Fractional CFO for Your PE Portfolio Company"
- "Fractional CFO Day Rates UK 2026: What Companies Actually Pay"
- "The First 100 Days: What a Fractional CFO Does in a PE-Backed Business"
- "Fractional CFO vs Finance Director: Which Does Your Business Need?"

These target mid-to-long-tail keywords that The CFO Centre doesn't own because they're PE-specific.

---

## Part 7: SEO Strategy (Revised)

### Abandon Head Terms, Win Long Tail

**Do NOT target (yet):** "fractional CFO" (1,300/mo, CFO Centre owns page 1)  
**DO target:** PE-specific and location-specific long-tail variants

### Tier 1: PE-Specific (own these in 90 days)

| Keyword | Est. Volume | Competition |
|---|---|---|
| fractional CFO private equity | 90 | Very low |
| fractional FD PE portfolio | 40 | Very low |
| part-time CFO PE backed company | 30 | Very low |
| interim CFO acquisition integration | 50 | Low |
| fractional finance director private equity UK | 20 | Very low |

Low volume but ultra-high intent and zero competition. 10 of these pages collectively = 1 high-volume keyword.

### Tier 2: Programmatic Long-Tail (scale to 500+ pages)

| Pattern | Examples | Method |
|---|---|---|
| fractional CFO [city] | London, Manchester, Birmingham, Leeds, Edinburgh | Already built at /experts/[role]/[location] — enrich with real content |
| fractional [role] for [industry] | "fractional CFO for SaaS", "fractional FD for manufacturing" | New programmatic pages |
| fractional [role] cost UK | "fractional CFO cost UK", "fractional CTO day rate" | Blog posts with real rate data from platform |
| how to hire fractional [role] | "how to hire a fractional CFO" | Blog posts |

### Tier 3: Head Terms (Month 6+ when domain authority builds)

Only then begin targeting "fractional CFO", "fractional CTO", etc. with comprehensive pillar pages.

### Technical SEO (already mostly done)

- [x] Dynamic sitemap
- [x] JSON-LD structured data
- [x] OG image generation
- [x] Programmatic /experts/[role]/[location] pages
- [ ] Submit sitemap to Google Search Console (Week 0)
- [ ] Enrich programmatic pages with unique, useful content (not just exec listings)
- [ ] Add FAQ schema to blog posts
- [ ] Internal linking strategy (every blog post → relevant /experts page)

---

## Part 8: Partnerships (Deferred to Month 4-6, with prep starting Month 2)

### Why Defer
Partnerships require social proof to pitch. "We've placed 8 fractional CFOs in PE portfolio companies with a 100% retention rate" is a pitch. "We're a new platform, want to partner?" is not.

### Partnership 1: Accounting Firms (Month 4-6)
**Prep (Month 2-3):** Ask every exec and company: "Who's your accountant?" Build a warm-intro list.
**Pitch (Month 4):** "We've placed 8 CFOs in PE-backed companies. Your £5M clients need this. Here's a co-branded page. 10% referral fee per placement."
**Target:** Regional offices of BDO, Mazars, PKF, MHA (more entrepreneurial than London HQ).

### Partnership 2: PE Fund Formalisation (Month 4-6)
**Prep (Month 1-3):** Informal relationships from direct outreach.
**Pitch (Month 4):** "You've used us for 3 placements. Let's formalise: branded portal for your portfolio, 20% volume discount, quarterly talent briefing."
**Target:** The 5 funds you already work with from Phase 2.

### Partnership 3: Professional Associations (Month 6+)
**Prep (Month 4-5):** Publish the "State of Fractional CFOs in PE" report, get press coverage.
**Pitch (Month 6):** ICAEW Practice Connect: "Official Fractional Career Partner — free member webinar, member discount, co-branded assessment tool. £10K annual sponsorship."

---

## Part 9: Trust & Credibility Ladder

### Before Any Outreach (Week 0)

| Signal | How |
|---|---|
| Professional landing page | Already exists — review and polish for PE audience |
| Founder credibility | Tristan's LinkedIn profile must show relevant experience or advisory board members who lend credibility |
| Published day rates | Add prominent rate display to all exec cards (radical transparency) |
| Clear vetting messaging | Add "How We Vet" section to landing page: interview process, PE experience verification, case study review |

### Before PE Fund Outreach (Week 5)

| Signal | How |
|---|---|
| 15 named exec profiles | Headshots, real names, real case studies, real rates |
| Founding exec testimonials | 3-5 quotes from execs about why they joined FF |
| "How it works" page | Clear 3-step process: brief → 48hr match → introduction |
| PE-specific positioning | Landing page speaks directly to PE operating partners |

### Before Scaling (Month 3+)

| Signal | How |
|---|---|
| 3+ case studies with named companies | Full narrative: challenge → match → outcome → metrics |
| PE fund logos | "Trusted by portfolio companies of [Fund 1], [Fund 2], [Fund 3]" |
| Match metrics | "Average 36 hours from brief to shortlist. 95% match acceptance rate." |
| NPS score | Survey at 30 and 90 days. Publish if >50. |
| Press/PR | Pitch to Sifted: "How PE funds are using AI to match fractional CFOs" |

---

## Part 10: What Claude Code Builds (Autonomous Work)

These are tasks I (Claude Code) can execute without Tristan's involvement beyond a final review. Ordered by priority.

### Sprint 1: Platform Readiness (Week 0, ~10 dev days)

1. **PostHog integration** — Install, add UTM capture on signup, create conversion funnels
2. **Email capture + Resend broadcast** — Newsletter signup component on all public pages, Supabase `newsletter_subscribers` table, Resend audience sync
3. **MDX blog** — `/blog` route with MDX support, SEO metadata, related posts, CTA to sign up
4. **Audience landing pages** — `/for-pe-funds` (portfolio dashboard mockup, fund-specific value prop) and `/for-cfo` (exec-specific value prop, founding member CTA)
5. **Case studies page** — `/case-studies` aggregating published case studies from exec profiles, with standalone routes
6. **Rate transparency** — Prominently display published day rates on all exec cards and directory pages
7. **SEO content enrichment** — Generate genuine, useful content for top 50 /experts/[role]/[location] pages
8. **"How We Vet" section** — Add vetting process description to landing page and directory

### Sprint 2: PE-Specific Features (Weeks 3-4, ~5 dev days)

9. **PE fund landing page** — `/for-pe-funds` with portfolio company management concept, bulk placement discount messaging
10. **48-hour SLA tracker** — Track time from brief submission to shortlist delivery, display on marketing pages
11. **Brief submission form** — Simple form for companies: "Describe what you need" → creates a matchable brief
12. **Match notification emails** — When a match is made, both sides get a professional email with intro and next steps

### Sprint 3: Growth Infrastructure (Weeks 5-8, ~5 dev days)

13. **Referral enhancements** — Exec-specific referral track: "Invite a colleague → priority placement for 30 days"
14. **Newsletter system** — Monthly broadcast from collected emails via Resend, with basic template
15. **Admin metrics dashboard** — Track: exec signups, company briefs, matches made, time-to-match, revenue
16. **IR35 compliance starter** — Basic status determination questionnaire + PDF output (high-value subscription feature)

---

## Part 11: Tristan's Weekly Time Budget

| Activity | Hours/week | Phase |
|---|---|---|
| LinkedIn exec outreach (DMs + calls) | 12 | Weeks 1-4 |
| PE fund outreach (research + meetings) | 8 | Weeks 5-8 |
| Concierge matching (personal intros) | 4 | Weeks 5-12 |
| Content review (Claude drafts → Tristan edits) | 3 | Ongoing |
| Product review (Claude builds → Tristan approves) | 3 | Ongoing |
| Operations (billing, support, admin) | 2 | Ongoing |
| **Total** | **~30-35** | |

This leaves 15-20 hours/week for product thinking, strategy, and life — sustainable for a solo founder.

---

## Part 12: Month 4-6 Preview (Contingent on Month 1-3 Results)

**If 5+ placements confirmed:**
- Expand exec bench to 50 (add COO and CTO functions)
- Formalise 2 PE fund partnerships
- Approach 3 accounting firms with case studies
- Begin Google Ads on proven keywords (£1-2K/month)
- Hire part-time content writer or VA

**If <5 placements:**
- Diagnose: supply problem (not enough good execs?) or demand problem (PE funds not buying?)
- If supply: pivot to white-glove profile building, offer more aggressive founding terms
- If demand: test different segment (VC-backed instead of PE-backed, or different function)
- Do NOT scale channels until core matching is proven

---

## Appendix A: What Was Cut From the Original Plan (And Why)

| Original Item | Cut Because |
|---|---|
| 10 channels (5 per audience) | Solo founder can execute 2 well, not 10 badly |
| 2 blog posts/week | Unsustainable; 1/week is plenty for SEO compounding |
| 500 newsletter subs by Month 2 | No email infrastructure exists; realistic target is 80 |
| 150 exec profiles by Month 3 | Quality > quantity; 25-30 PE-specialist CFOs beats 150 generalists |
| Professional association partnerships | Too slow for Month 1-3; moved to Month 6+ |
| Broad ICP (£1M-£30M all industries) | Too wide; narrowed to PE-backed £3M-£15M |
| "AI matching" as primary value prop | Meaningless at <100 execs; speed + transparency + PE specialisation is the wedge |
| Bi-weekly newsletter | Monthly is sustainable; bi-weekly with 50 subscribers is performative |
| National UK coverage | London/SE only until unit economics proven |
| Google Ads in Month 1 | No conversion data to optimise against; defer to Month 4 |

## Appendix B: Key Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Execs go direct with companies after first engagement | High | High | One-time placement fee (not ongoing %) + subscription with genuine value (IR35, time tracking) |
| PE funds already have preferred recruiters | Medium | High | Position as complement not replacement: "For fractional/part-time roles your recruiter doesn't cover" |
| The CFO Centre responds aggressively to competition | Low | Medium | They serve SMEs broadly; PE niche is too small for them to pivot to |
| Cannot recruit 15 quality execs in 4 weeks | Medium | High | Offer white-glove onboarding ("send CV, we build profile"), extend timeline to 6 weeks |
| First placements fail | Low | Very High | Guarantee first placement: free replacement if it doesn't work within 30 days |
| Market too small (PE-backed CFO niche) | Low | Medium | Expansion path is clear: PE COO/CTO → VC-backed → broader market |
