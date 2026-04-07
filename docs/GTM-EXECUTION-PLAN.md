# Fractional Forge — Executable GTM Plan

**The point:** Every action in this plan is assigned to an executor. ~90% is done by AI (specialists + Claude Code). ~10% is Tristan reviewing, approving, and handling the human-only tasks.

**How it works:** You say "Let's do it." I create the objectives and tasks inside ForgeOS, assign them to the right specialists, code the infrastructure they need, and the specialists execute. You review their outputs and approve. The platform running its own growth plan IS the demo.

---

## The Three Executors

| Executor | What They Do | Examples |
|---|---|---|
| **Claude Code** (me) | Build platform features, code infrastructure, generate SEO pages, set up integrations | Blog route, PostHog, landing pages, newsletter capture |
| **ForgeOS Specialists** | Research, write content, draft outreach, analyze markets, create strategies | Mia writes blog posts, Sal drafts PE fund emails, Sage does competitive research |
| **Tristan** | Review/approve outputs, send LinkedIn DMs, take calls, make strategic decisions | Approve Mia's blog post, send Sal's email from your account, take the PE fund call |

---

## Phase 0: Platform Readiness

**Before any GTM action, I build the infrastructure the specialists need.**

| # | What | Executor | Time | Why |
|---|---|---|---|---|
| 0.1 | Install PostHog analytics + UTM capture on signup | Claude Code | 30 min | Can't measure anything without this |
| 0.2 | Build `/blog` route with MDX support | Claude Code | 45 min | Mia's blog content needs somewhere to live |
| 0.3 | Build newsletter signup on all public pages + Resend broadcast list | Claude Code | 30 min | Email capture for nurture sequences |
| 0.4 | Build `/for-pe-funds` landing page | Claude Code | 45 min | Destination for PE fund outreach |
| 0.5 | Build `/for-cfo` landing page | Claude Code | 30 min | Destination for exec recruitment |
| 0.6 | Build standalone `/case-studies` page | Claude Code | 30 min | Social proof hub |
| 0.7 | Ensure day rates display prominently on all exec cards | Claude Code | 15 min | Radical transparency is the value prop |
| 0.8 | Enrich top 50 SEO pages with real content | Claude Code | 60 min | Thin pages won't rank |

**Total Claude Code time: ~4-5 hours. Tristan reviews when done.**

---

## Phase 1: Supply Seeding (Weeks 1-4)

**Goal: 15 PE-experienced fractional CFO profiles live on the platform.**

### Objective: "Build founding executive bench"
*Created as ForgeOS objective, assigned to Harper + Sal*

| # | Task | Executor | Tristan's Role | Output |
|---|---|---|---|---|
| 1.1 | Research 100 fractional CFOs with PE experience on LinkedIn | **Sage** (web_search) + **Harper** | Review the list, remove anyone you know isn't right | Spreadsheet of 100 names + LinkedIn URLs + PE experience summary |
| 1.2 | Draft "founding executive" recruitment pitch | **Sal** | Review and edit for your voice | Copy-paste-ready LinkedIn DM + follow-up sequence |
| 1.3 | Draft executive value proposition one-pager | **Mia** | Review | PDF/page explaining why execs should join |
| 1.4 | Send 20 LinkedIn connection requests/day | **Tristan** | YOU DO THIS — AI cannot send LinkedIn DMs | Connections sent |
| 1.5 | Take 15-min qualification calls | **Tristan** | YOU DO THIS — AI cannot take calls | Qualified exec list |
| 1.6 | Draft exec profile from CV/call notes | **Harper** | Review and approve | Complete marketplace profile |
| 1.7 | Write case study template for execs to fill in | **Mia** | Review | Template with prompts for challenge/approach/outcome |
| 1.8 | Quality-check all profiles (headshot, case studies, rate, PE experience) | **Cal** | Final approval | Quality report per profile |

### Weekly Content (runs parallel)

| # | Task | Executor | Tristan's Role | Cadence |
|---|---|---|---|---|
| 1.9 | Draft daily LinkedIn post (founder voice) | **Mia** | Edit in 10 min, post from your account | 5x/week |
| 1.10 | Draft weekly blog post (SEO-optimised, PE-focused) | **Mia** | Review, approve, I publish to /blog | 1x/week |
| 1.11 | Generate SEO content for programmatic pages | **Claude Code** | None needed | Batch in Week 1 |

### What This Looks Like in ForgeOS

```
Objective: "Build Founding Executive Bench — 15 PE CFOs by Week 4"
  ├── Task: "Research 100 fractional CFOs" → assigned to Sage
  ├── Task: "Draft recruitment pitch" → assigned to Sal  
  ├── Task: "Draft exec value prop" → assigned to Mia
  ├── Task: "Send LinkedIn outreach" → assigned to Tristan (manual)
  ├── Task: "Profile creation from CVs" → assigned to Harper
  ├── Task: "Weekly blog: What PE funds need from a fractional CFO" → assigned to Mia
  ├── Task: "Weekly blog: Fractional CFO day rates UK 2026" → assigned to Mia
  └── Task: "Quality audit of all live profiles" → assigned to Cal
```

You open ForgeOS, see the tasks, click into each specialist's output, approve or edit, move on.

---

## Phase 2: Demand — PE Fund Outreach (Weeks 5-8)

**Goal: 5 PE fund relationships, 3-5 company briefs.**

### Objective: "Acquire first PE fund partnerships"
*Created as ForgeOS objective, assigned to Sal + Sage*

| # | Task | Executor | Tristan's Role | Output |
|---|---|---|---|---|
| 2.1 | Research 30 UK lower-mid-market PE funds (operating partners, portfolio size, sectors) | **Sage** (web_search) | Review and prioritise | Target list with contact names and fund profiles |
| 2.2 | Ask platform execs "Which PE funds have you worked with?" | **Tristan** | YOU DO THIS in calls/messages | Warm intro opportunities |
| 2.3 | Draft cold outreach email sequence for PE operating partners | **Sal** | Review, edit for your voice | 3-email sequence, copy-paste ready |
| 2.4 | Draft PE fund pitch deck (5 slides: problem, solution, bench, proof, ask) | **Fiona** + **Mia** | Review | PPTX via pptxgenjs |
| 2.5 | Send outreach to PE funds (email + LinkedIn) | **Tristan** | YOU DO THIS | Messages sent |
| 2.6 | Take meetings with interested funds | **Tristan** | YOU DO THIS | Meeting notes |
| 2.7 | Draft meeting follow-up emails | **Sal** | Review, send from your account | Follow-up within 24hrs |
| 2.8 | When brief comes in: run AI match + hand-select top 3 | **Claude Code** triggers match, **Tristan** validates | Review match results, add your judgment | Shortlist of 3 execs |
| 2.9 | Draft 3-way introduction email (you + exec + company CEO) | **Sal** | Review and send | Warm introduction |
| 2.10 | Track match: time-to-shortlist, acceptance, feedback | **Cal** | None | Metrics for case studies |

### Weekly Content (continues)

| # | Task | Executor | Tristan's Role |
|---|---|---|---|
| 2.11 | Draft daily LinkedIn post (now including PE market insights) | **Mia** | Edit, post |
| 2.12 | Draft weekly blog post (PE + fractional exec topics) | **Mia** | Review, approve |
| 2.13 | Draft first newsletter (to whatever email list exists) | **Mia** | Review, I send via Resend |

---

## Phase 3: Prove & Scale (Weeks 9-12)

**Goal: 5 confirmed placements, 2 case studies, first revenue.**

### Objective: "Document proof and begin scaling"
*Assigned to Cal (coordination) + Mia (content) + Finn (revenue)*

| # | Task | Executor | Tristan's Role | Output |
|---|---|---|---|---|
| 3.1 | Collect 30-day feedback from first placements | **Cal** drafts survey, **Tristan** sends | Send to companies + execs | Satisfaction data |
| 3.2 | Write 2 case studies from placement data | **Mia** | Review for accuracy, get logo permission | Published on /case-studies |
| 3.3 | Draft "State of Fractional CFOs in PE" micro-report | **Sage** + **Mia** | Review | PDF/blog post with original data |
| 3.4 | Model unit economics from real placement data | **Finn** | Review | Revenue model, CAC, LTV |
| 3.5 | Draft accounting firm outreach (now WITH case studies) | **Sal** | Review, send | Outreach to 3 firms |
| 3.6 | Expand exec bench to 25-30 (using proof points) | Same as Phase 1 flow | Same | More profiles |
| 3.7 | Review all channel data: what converted? | **Sage** + **Finn** | Strategic decisions | Month 4-6 plan |
| 3.8 | Draft press pitch to Sifted/TechCrunch | **Mia** | Review, send | Press outreach |

---

## The Content Machine (Ongoing, All Specialist-Driven)

| Content Type | Specialist | Frequency | Tristan's Role | Where It Lives |
|---|---|---|---|---|
| LinkedIn posts | Mia drafts | Daily (5x/week) | 10 min edit, post from your account | LinkedIn |
| Blog posts | Mia drafts | Weekly | Review, approve → I publish to /blog | /blog |
| Newsletter | Mia drafts | Monthly | Review → I send via Resend broadcast | Email |
| Case studies | Mia writes from data | As placements complete | Verify accuracy, get permission | /case-studies |
| Cold email sequences | Sal drafts | Per campaign | Edit for voice, send from your account | Email |
| PE fund research | Sage researches | Per target | Review target list | Internal |
| Competitive analysis | Sage analyses | Monthly | Read and act on | Internal |
| Financial model | Finn models | Monthly | Review assumptions | Internal |
| Exec recruitment pitches | Sal drafts | Per batch | Edit, send via LinkedIn | LinkedIn |

---

## Tristan's Weekly Time Commitment

### Weeks 1-4 (Supply Seeding)
| Activity | Hours | Frequency |
|---|---|---|
| Review specialist outputs (content, pitches, research) | 3 | Daily, 30 min |
| LinkedIn DMs to execs | 5 | Daily, 1 hour |
| Qualification calls (15 min each, ~10/week) | 2.5 | As scheduled |
| Edit and post LinkedIn content | 1 | Daily, 10 min |
| **Total** | **~12 hrs/week** | |

### Weeks 5-8 (Demand)
| Activity | Hours | Frequency |
|---|---|---|
| Review specialist outputs | 3 | Daily |
| PE fund outreach (email + LinkedIn) | 3 | Daily |
| PE fund meetings | 3 | 2-3 meetings/week |
| Concierge matching (validate AI picks, make intros) | 2 | As briefs come in |
| Edit and post LinkedIn content | 1 | Daily |
| **Total** | **~12 hrs/week** | |

### Weeks 9-12 (Prove)
| Activity | Hours | Frequency |
|---|---|---|
| Review specialist outputs | 3 | Daily |
| Placement follow-ups | 2 | Weekly |
| Edit and post content | 1 | Daily |
| Strategic decisions (review Sage + Finn analysis) | 2 | Weekly |
| Accounting firm outreach | 2 | Weekly |
| **Total** | **~10 hrs/week** | |

---

## What Makes This a Demo

When you show a potential user ForgeOS, you can say:

> "We used our own platform to launch our company. Here's what happened:
> - Sage researched 30 PE funds and ranked them by fit
> - Sal drafted every cold email sequence we sent
> - Mia wrote every blog post and LinkedIn post you've seen
> - Harper helped vet and profile every executive on the platform
> - Finn modelled our unit economics from real placement data
> - Cal tracked everything and gave us a weekly brief
> 
> I spent 12 hours a week reviewing their work and handling the calls. The AI team did the other 40 hours of work.
> 
> That's what YOUR ForgeOS team does for YOUR business."

This is the single most compelling sales story: the product selling itself by having built the company that sells it.

---

## Kickoff Sequence

When you say "Let's do it," here's the exact order:

1. **I code Phase 0** (PostHog, blog, newsletter, landing pages, case studies page, SEO enrichment) — ~4 hours
2. **I create the Phase 1 objectives and tasks in ForgeOS** — assigned to the right specialists
3. **The sweep runs** — Sage, Mia, Sal, Harper start producing outputs on their tasks
4. **You open ForgeOS** — see the specialist outputs, review them, approve them
5. **You start LinkedIn outreach** using Sal's drafted pitches
6. **Mia's first blog post publishes** — SEO clock starts ticking
7. **We iterate weekly** — I update tasks, specialists produce more, you review and act

The whole machine starts turning.

---

## Infrastructure I Build vs Features Specialists Use

| I Build (Code) | Specialists Use (Already Built) |
|---|---|
| /blog MDX route | Task system + assignment |
| PostHog + UTM tracking | Agent sweep (auto-runs every 2 hrs) |
| Newsletter capture + Resend broadcast | web_search tool |
| /for-pe-funds landing page | write_document (content creation) |
| /for-cfo landing page | Specialist workflows (email sequences, content strategies) |
| /case-studies aggregation page | PROPOSED_ACTIONS (auto-create tasks) |
| SEO page content enrichment | Pitch deck generation (pptxgenjs) |
| Day rate prominence on cards | Cross-specialist handoffs |
| Brief submission form | Match notification emails |
