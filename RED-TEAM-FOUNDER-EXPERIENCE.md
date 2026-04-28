# Red Team — Founder Experience Walkthrough

**Date**: 2026-04-25
**Tester**: Claude (agent-browser against `https://fractionalforge.app`)
**Method**: 3 hardware-startup-founder personas, sampled walkthrough across homepage / signup / brainstorming / investors / forge.
**Coverage**: ⚠️ Sampled, not exhaustive — see "What I tested" per persona.

---

## Strategic frame (added 2026-04-25 from Tristan)

Two job-to-be-done categories, each with distinct success criteria:

### Killer features (drive sign-up + drive PAYING)
The features founders would pay for on their own. Tangible output every session.

- **Investors** (`/investors`) — *"give me 12 funded UK Series A leads in food tech, with the opening email already drafted"*. Output is a matched list + outreach. A founder pays for THIS.
- **The Forge** (`/the-forge-v2`) — *"turn my one-paragraph product idea into a system architecture, BOM, and manufacturer shortlist"*. Output is a buildable spec. A founder pays for THIS.

These are the two sales pitches. They need to deliver something concrete on first use that a founder couldn't get anywhere else for the price.

### Sticky features (keep founders coming back daily/weekly so they keep paying)
The features that compound value over time. Not necessarily what gets someone to sign up — but what keeps them from cancelling.

- **Plan** (compressed Strategy + Objectives + Tasks) — daily workspace.
- **Suppliers** (`/marketplace`) — project-spanning shortlists, quote tracking, alerts.
- **Manufacturing Techniques** (`/learn`) — saved techniques, annotations, learning tracks.
- **Brainstorming** (`/agents`, as Perplexity-for-founder-issues) — searchable history of every business conversation, with citations and follow-up branches.

Stickiness wins via history, accumulation, alerts, and digests. The killer features win via concrete tangible output on first use.

### Acquisition vs retention split

| Surface | Type | Success metric |
|---|---|---|
| Homepage / `/welcome` | Acquisition | Sign-up conversion within 90s |
| `/investors` | **KILLER** | Output worth paying for on first use |
| `/the-forge-v2` | **KILLER** | Output worth paying for on first use |
| `/agents` Brainstorming | Sticky | Sessions/week per active user |
| `/plan` (compressed) | Sticky | DAU returning to plan |
| `/marketplace` Suppliers | Sticky | Saved-supplier count + quote-tracking activity |
| `/learn` Manufacturing Techniques | Sticky | Saved-technique count + return visits |

This frame should drive every redesign decision below.

## TL;DR

The new sidebar structure (Brainstorming · Fundraising · Workshop · Marketplace) is clean and lands on the right surfaces. The Brainstorming page itself is the strongest screen — idea grid, pre-paired specialists, sensible defaults. **But the headline bug is fatal to first impressions: the flagship Brainstorming feature errored on first use** (`The AI provider is temporarily overloaded`). A founder evaluating this product clicks one prompt, gets an error, and bounces. Fix that first. Everything else is secondary.

Search on `/investors` is confirmed broken (Tristan flagged in chat). The Investors page is also stats-heavy when it should be search-first — Phase G redesign is the right call.

There is no anonymous path. Maya can't look around without signing up — confirms the freemium pivot.

The new Forge build (`feat/forge-v2-cutover`) is NOT in production. I tested only the deployed version.

---

## Persona 1 — Maya (anonymous, first-time founder)

**Profile**: 28, mechanical engineer, 6 months in. Smart air-quality monitor for offices. £50K savings, no co-founder, no investors yet. Bounces in 90 seconds if first impression poor. Won't sign up before seeing something work.

**What I tested (production, no login)**:
- Homepage cold load — ✓
- "START FREE" CTA — ✓ (does not navigate cleanly; redirects through login wall)
- Signup form (`/join`) — ✓
- Anonymous interaction with any feature — ❌ blocked by login wall (no path)

### Findings

**1. No anonymous play path. Critical.**
- `/signup` redirects to `/login?redirect=/signup` (login required to see signup??)
- `/join` is the actual signup form. Routing inconsistency.
- "START FREE" CTA in the hero appears to drop to the same login-then-signup chain
- For Maya: the very first action she wants to take ("show me what this does") is impossible. She has to give name + email + password (with complexity requirement) + confirm password before seeing a single feature.
- **Verdict: Maya bounces before signup completes.** ~15-20% conversion at best.
- **Fix**: this is exactly the freemium-plan motivation. Phase F Step 1 (anonymous cookie) + Step 2 (anonymous unlocks on `/agents` + `/investors`) will close this.

**2. Marketing copy uses "AI agents" repeatedly. Inconsistent with in-product voice.**
- Homepage hero: *"Supported by 13 specialist AI agents"*
- Card heading: *"13 Specialist AI Agents. Your Judgement."*
- Card body: repeats "AI agents" 3+ times
- Then in the product, copy says "13 specialists" (no AI emphasis)
- This is a deliberate marketing-vs-product split per `CLAUDE.md`, but **the dissonance is jarring**. Maya sees "AI agents" everywhere on landing, signs up, sees "specialists" inside, wonders if she's in the right product.
- **Fix**: align marketing copy to "specialists" too. The "AI" emphasis on landing is no longer differentiating in 2026.

**3. Long homepage scroll (~10000px tall).**
- Three sections after the hero: How It Works (3 cards), Fractional Expertise pitch, Investor Intelligence section
- Maya wants to evaluate in 90s. The scroll asks for 5+ minutes.
- **Fix**: collapse to hero + 1 paragraph + CTA. Move detail to `/how-it-works`.

**4. Cookie banner blocks the hero on first load.**
- Top of every page until accepted/declined. Blocks the headline copy + first CTA placement.
- Maya is on a phone, sees ad copy chopped in half, taps Accept reflexively, loses the message.
- **Fix**: smaller bottom-right toast variant, or accept-on-first-action.

**5. Voice on landing is generic-SaaS, not Tristan's voice.**
- "FOR HARDWARE STARTUP FOUNDERS" + "Everything a hardware startup needs" reads like every Y-Combinator landing page.
- Tristan's actual voice (from his LinkedIn / Gmail per CLAUDE.md) is first-person, specific numbers, British spelling. The landing is corporate.
- **Fix**: rewrite hero copy in Tristan's voice. Lead with a specific founder problem. The "From Tristan" letter further down is great — promote it up.

### Maya's verdict (assuming she gets through signup)
Signup → land on something useful: **probable**, given the Brainstorming page is the new default landing.
Recommend to a friend after one session: **unlikely** unless brainstorming actually works (see Persona 2 finding).

---

## Persona 2 — Priya (logged-in, second-time founder, raising Series A)

**Profile**: 38, ex-Dyson PM, rugged consumer drone, £400K pre-orders. 5-person team, raising £4M. Critical of bad UX. Recommendations matter.

**What I tested**:
- Brainstorming page (`/agents`) — ✓ rendered, ✓ idea grid, ❌ session errored
- Investors page (`/investors`) — ✓ rendered, ⚠️ search not tested (broken per Tristan)
- The Forge — not tested (running out of session time; new build not in production anyway)

### Findings

**6. 🚨 BRAINSTORMING ERRORS ON FIRST USE. P0.**
- Flow: clicked the "How should we price our first product?" prompt → Team Meeting dialog opened with Finn/Sal/Priya pre-selected (correct) → clicked "Start Meeting" → Priya streamed: *"Priya: Separating must-haves from nice-to-haves..."* → after ~20 seconds: **`[Error: Could not generate response]`** + red banner: *"Priya encountered an error: The AI provider is temporarily overloaded. Please try again in a few seconds."*
- **This is the flagship feature on the flagship page**. A founder's very first action errors out.
- The fallback UX (Cancel / Weigh In / Let Them Discuss / Wrap Up buttons appearing anyway) is graceful, but the damage is done — Priya now thinks the product doesn't work.
- **Fix priority**: P0. Likely causes: provider rate limit, retries not implemented, no fallback model chain. Need to: (a) add retry with exponential backoff inside `streamSpecialistResponse`; (b) add fallback-model chain (DeepSeek → Sonnet → Gemini Flash → MiniMax) so a single provider going hot doesn't break the session; (c) on persistent failure, return a graceful "I'm having a moment, give me 30 seconds" placeholder, not a stack-trace-style error.

**7. Brainstorming page UI is otherwise excellent.**
- 8 idea prompts in a 2-col grid, each with category pill + question + subtitle + specialist chips
- Cal Chief of Staff hero with relevant copy ("clean slate ... pick the one problem that's costing you the most time...")
- Sidebar correctly shows post-pivot structure
- "Or brainstorm something else" textarea below the grid (didn't test but visible)
- This is what the rest of the product should feel like.

**8. Investors page is stats-heavy, not search-first.**
- Default tab "Overview" shows stats: 8,264 Total Investors / 53,895 Partners / 63,919 Portfolio Cos / 3,042 Grants
- 5 tabs: Overview / For You / Investors / Grants / Contacts — feels like a CRM
- For Priya — who wants to find 12 specific UK Series A leads in consumer hardware THIS WEEK — the stats are noise. She wants a search box, top.
- Fiona's hero is good ("I've built matching that finds investors by thesis fit, not just sector tags. Try the search with your one-line pitch and see who lights up.") — but the search box she's referring to isn't visible on the default tab.
- **Fix**: Phase G redesign. Hero + big search box + curated prompt cards (UK Series A in food tech / Climate funds with hardware portfolio / Family offices £250K+ etc) on the default landing. Stats and Contacts/Grants behind a "More" disclosure.

**9. Disclaimer copy violates "No AI Emphasis" rule.**
- Inside the Team Meeting dialog: *"AI Specialists can make mistakes, just like people. You're in charge — always verify what matters."*
- Per `CLAUDE.md`, in-product copy should say "specialists" not "AI specialists".
- Trivial fix, but the rule exists for a reason — every "AI" reminds the user they're talking to a robot, not a colleague.

**10. AdvisorPanel FAB visible bottom-right on all logged-in pages.**
- This is the right-hand specialist sidebar Tristan asked to remove.
- Phase E plan stands.

**11. Cookie banner blocks logged-in pages too.**
- Same problem as Maya. Confirmed across `/agents`, `/investors`, every screen.

### Priya's verdict
- "I clicked one button and it errored — does anything work?" → low confidence in stability.
- Investors page wants more clicking than pricing-comparison sites she's used to → friction.
- **Recommend to her network: unlikely** until brainstorm reliably runs and investor search returns something.

---

## Persona 3 — Jamal (logged-in, deep-tech, regulated)

**Profile**: 32, PhD biomed, low-cost dialysis device for emerging markets. £150K grant, raising £1M from impact funds. Tolerates ugly if it works. Despises marketing fluff.

**What I tested**:
- Reviewed same surfaces as Priya (single test session). Below findings are JUDGEMENT in his voice.

### Findings

**12. The 8 idea prompts include "What's our biggest risk right now?" — high resonance for Jamal.**
- Pairs Sage + Leo (Strategy + Legal). For a regulated medical device, this is exactly the conversation he wants.
- Prompts skewed slightly to commercial founders (pricing, positioning, fundraising). One regulatory/compliance prompt would expand reach to deep-tech.
- **Fix**: add a 9th prompt. Suggestion: *"What regulatory and IP risks should we map first?"* → pair Leo + Sage. Or *"How do we de-risk our first manufacturing partner?"* (already exists, pair Fang + Chase — works).

**13. The 13-specialist roster is wide enough that Jamal can find domain-relevant voices.**
- Leo (Legal) for regulatory, Fang (Manufacturing) for supply, Chase (Supply Chain) for partnerships.
- BUT — none of the specialists are positioned as a "regulated industries" / "medical devices" / "scientific instruments" expert.
- For Jamal's go-to-market, this is fine (specialists are functional, not industry-specific).
- For his TECHNICAL conversations (FDA pathway, ISO 13485, biocompatibility testing), the generic Leo isn't going to cut it.
- **Decision needed**: do the specialists need industry overlays (e.g. Leo-medtech vs Leo-consumer)? Probably not for V1; flag for V2.

**14. Stickiness framing of Plan / Suppliers / Manufacturing Techniques is right (per Tristan).**
- All three sections share the same job: be there when the founder comes back tomorrow, and the day after.
- Currently they're each a single read-only-ish surface. They need history, accumulation, and come-back triggers to deliver on retention.

**Plan stickiness levers** (during the compressed-Plan port):
- **Daily progress feed**: "Yesterday: 2 tasks closed, 1 risk surfaced by Sage" → makes returning feel like checking in on progress
- **Streak counter** (existing `useCelebration` hook): visible commitment to coming back
- **Auto-generated weekly digest**: emails him on Sunday with the week's wins + next week's priorities → drags him back in
- **Decision history** (`/plan/history` already routes-but-not-built): every choice with rationale, searchable. Founders love this for fundraising diligence.
- **"What changed since you last visited?"** banner: highlight new specialist insights, completed tasks, due-this-week items

**Suppliers stickiness levers** (rebuild scope):
- **Saved-supplier shortlists per project**: not just a list of suppliers, but "the 7 PCB houses I'm comparing for HAPS v2"
- **Quote-tracking ledger**: every quote requested + its status (sent → received → comparing → awarded), with timeline
- **Lead-time alerts**: when a saved supplier's lead time changes, push a notification — "PCBWay just moved from 2 weeks to 4. Two of your active projects depend on this."
- **Side-by-side comparison view**: pick 3 suppliers, see capability + cost + lead-time + reliability score in one table. Save the comparison.
- **Procurement diary**: an automatic log of every supplier interaction (quote, RFQ, message, order). Searchable. Doubles as audit trail for diligence.
- **"Suppliers like the ones you saved" recommendations**: weekly email with new matches based on saved-shortlist patterns.

**Manufacturing Techniques stickiness levers** (rebuild scope):
- **Saved techniques per project**: pin the techniques relevant to a Forge project. They show up in the project sidebar AND on the Techniques page filtered to "your saved".
- **Founder annotations / private notes**: per-technique notes — "we tried this on v1 prototype, didn't work because…". Sage can read these to inform future advice.
- **New-technique notifications in your domain**: weekly digest of new techniques added in your sector (food tech, biomed, etc).
- **Q&A activity feed**: "Sage answered Lia's question about CNC tolerances — relevant to your Forge project". Makes the static library feel live.
- **Personalised learning tracks**: "Your next 5 techniques based on your BOM" — auto-curated using BOM data + foundry context + domain.
- **Founder-contributed techniques**: turn the directory into a community asset. Founders submit techniques they've learned the hard way; community votes; high-quality contributions earn extra brainstorming credits (ties into the viral mechanic).

**Brainstorming as "Perplexity for founder business issues"** (functional brief):
- Today: click a prompt → Team Meeting modal → specialists stream a conversation → modal closes → conversation gone.
- Perplexity equivalent: every session has a permanent URL, sources are cited, follow-up questions are suggested, history is searchable.
- Build to match:
  - **Conversation persistence**: every brainstorming session gets a permanent `/brainstorm/<id>` URL. Listed on `/brainstorm/history`.
  - **Source citations**: when Sage references "your runway is 11 months", show what data fed that (foundry profile / cashflow upload / objective due date). Click-through to the source.
  - **Follow-up prompt suggestions**: at the end of every session, 3 suggested next-questions based on what came up. One click runs the next brainstorm.
  - **Searchable history**: full-text + semantic search across all your past brainstorms. "What did we decide about pricing in February?" should work.
  - **Multi-issue threading**: unlike Perplexity (single thread), brainstorms can branch — pricing question opens a hiring sub-question. Surface that branching as a tree on the history page.

### Jamal's verdict
- Sage hero copy + biggest-risk prompt make him feel like the product was built with him in mind. **Good first impression**.
- Brainstorming error (same as Priya) erodes that instantly.
- Plan section, once compressed and made sticky, is the feature he'd come back for daily.
- **Recommend: yes, IF the brainstorming reliability gets fixed AND Plan stickiness lands.**

---

## Cross-persona patterns

| # | Issue | Severity | Hits Personas |
|---|---|---|---|
| 1 | Brainstorming session errors on first use | **P0** | Priya, Jamal (Maya can't get there) |
| 2 | No anonymous play — login wall before any feature | P0 | Maya |
| 3 | Investor search broken (per Tristan) | P0 | Priya, Jamal |
| 4 | Cookie banner blocks every page on first visit | P1 | All three |
| 5 | "AI agents" / "AI Specialists" copy inconsistencies | P1 | All three |
| 6 | Investors page stats-heavy not search-first | P1 | Priya |
| 7 | Marketing copy generic-SaaS, not Tristan's voice | P1 | Maya |
| 8 | AdvisorPanel right-hand FAB still mounted | P2 | All three |
| 9 | `/signup` → `/login` → `/join` routing inconsistency | P2 | Maya |
| 10 | Plan section needs stickiness levers (history feed, streak, digest) | P2 | Jamal |
| 11 | Idea prompts skew commercial — add regulatory / deep-tech prompt | P3 | Jamal |
| 12 | New Forge build not in production (on `feat/forge-v2-cutover`) | — | n/a (deploy when ready) |

---

## Would they recommend it? (the viral question)

| Persona | Today | Post-fixes (P0+P1) |
|---|---|---|
| Maya | No (can't get in) | Probably yes if brainstorming impresses on first use |
| Priya | No (errors out) | Yes if investor matching delivers |
| Jamal | Maybe (good prompts) | Yes once Plan becomes sticky |

**The viral mechanic Tristan suggested (more friends invited = more VC searches) only works once the product earns the recommendation.** Today it doesn't, because Priya's first brainstorm errors and her first investor search is broken. Fix those two and the credit-referral system has fuel.

### Viral credit mechanic — refined for FREEMIUM-PLAN.md

Adding to FREEMIUM-PLAN.md as Phase F Step 6 (referral credit engine):

- **Free tier base**: 30 investor searches / month, 10 brainstorming sessions / month
- **Each invited friend who signs up + runs ≥1 brainstorm in their first 7 days**: +10 investor searches/month for inviter (capped at +100 = 10 friends)
- **Each invited friend who upgrades to paid**: +20 brainstorming sessions/month for inviter (capped at +60 = 3 paid friends)
- **Visible meter in sidebar footer**: `42/130 searches · invite a friend → +10`
- **One-tap share**: `Copy invite link` button on the meter → `https://fractionalforge.app/?ref=<inviter_anon_id>`
- **Quality guard**: only count friends who actually USE the product (run brainstorm OR run search) within 7 days. Prevents signup-spam farming.
- Built on existing `getMyReferralInfo()` action

---

## Recommended fix order (re-prioritised for killer-vs-sticky frame)

The killer features (Investors + Forge) MUST work before stickiness investments make sense. Nobody pays for sticky retention if the headline feature didn't earn the sign-up.

### Tier 0 — Killer features must work (P0, this week)
1. **Investor search fix end-to-end** (Phase G redesign + verify embedding fix from commit 94b14d74). Killer feature #1 — every other lever in the product fails if a founder's first investor search returns nothing or errors.
2. **Brainstorming reliability** — retry + fallback-model chain. Brainstorming is sticky-tier in the new frame, but it's also the default landing page after sign-up, so its first-use experience is part of acquisition. Fix it.
3. **Forge new build (`feat/forge-v2-cutover`) deploy** — the textarea-first landing + autopilot + RunningState changes need to merge to main and ship. Killer feature #2 lives here.

### Tier 1 — Acquisition (so founders can actually meet the killer features)
4. **Phase F Step 1**: anonymous-cookie middleware + cost-aware model tier. Invisible plumbing.
5. **Phase F Step 2**: anonymous unlocks on `/agents` + `/investors`. Maya can try the killer features before signing up.
6. **Phase F Step 6**: viral credit mechanic. Once Investors works, every successful search becomes referral fuel.
7. **Cookie banner**: smaller variant or first-action accept.
8. **Marketing copy**: align to in-product "specialists" language; rewrite hero in Tristan's voice.

### Tier 2 — Stickiness build-out (turn paying users into long-term paying users)
9. **Phase D port (Plan)** — compressed Strategy+Objectives+Tasks per `FORGEOS-COMPRESSED-PLAN-MOCKUP.html` + stickiness levers (history feed, streak badge, weekly digest, what-changed banner).
10. **Suppliers stickiness rebuild** — saved-shortlists per project, quote-tracking ledger, lead-time alerts, side-by-side comparison view, procurement diary.
11. **Manufacturing Techniques stickiness rebuild** — saved-per-project, founder annotations, new-technique notifications, Q&A activity feed, personalised learning tracks, founder-contributed content.
12. **Brainstorming as Perplexity** — conversation persistence at `/brainstorm/<id>`, source citations, follow-up suggestions, searchable history, multi-issue branching tree.

### Tier 3 — Polish + cleanup
13. **Phase E**: remove AdvisorPanel right-hand sidebar with modal fallback (10 call sites mapped, ready to go).
14. **Welcome page rebuild**: align with new sidebar structure (the local edit got lost in repo thrash; will redo).
15. **Add 9th idea prompt**: regulatory/IP for deep-tech founders.

---

## Coverage caveats (what I did NOT test)

- Full anonymous → registered → paid funnel (anonymous mode doesn't exist yet)
- The new Forge build (`feat/forge-v2-cutover`, commit `f6c94c1b`) — not in production
- Investor search returning real results (broken per Tristan; redesign covers fallback)
- Mobile breakpoints (1280px desktop only this round)
- The Pricing page upgrade flow
- Email-verification drip
- Onboarding for a new genuine signup (used existing test account)

If any of these are critical to verify before committing to the fix order, flag and I'll do a focused second round.

---

## Where the work goes

- This document → `RED-TEAM-FOUNDER-EXPERIENCE.md` (repo root)
- Viral credit mechanic → folded into `FREEMIUM-PLAN.md` as Phase F Step 6 (next commit)
- P0 fixes (#1, #3) → next code session
- Phase plans (E, F, G, D-port) already tracked — execution priority reordered above
