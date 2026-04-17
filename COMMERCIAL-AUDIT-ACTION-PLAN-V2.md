# Fractional Forge — Commercial Audit & Action Plan (v3)

**Updated:** 2026-04-16
**Objective:** First paying customers. Build demand without cold-call demos.
**Status:** 80 of 95 done. Restructured after Tristan triage (Apr 16).

---

## COMPLETED since v2 (Apr 14 evening → Apr 16)

- **84.** LinkedIn thread — posted
- **89.** PostHog — activated (env vars live on Vercel production)
- **90.** Product screenshots on homepage hero — done (12 screenshots, ProductShowcase live)

Plus major off-tracker Apr 15-16 work:
- Fractional exec onboarding improvements (role picker, day rate field, relaxed server validation, marketplace auto-listing)
- Homepage voice rewrite (action-led hero, "Note from Tristan" section with AWS analogy, LinkedIn message folded in)
- Mobile responsiveness audit — 14 issues fixed across marketing + platform, 9/10 score
- Billing + viral referral + signup journey fixes (~30 commits)
- LinkedIn profile updated with ForgeOS positioning

---

## KILLED (not doing — Tristan decision Apr 16)

- **78.** Loom demo — deferred indefinitely
- **82.** Demo calls — not doing. System must sell itself.
- **80, 81, 83.** Mass cold outreach batches (LinkedIn DMs + cold emails) — killed. Replaced by content + accelerator strategy.
- **88.** Day 8 outreach review — killed (tied to dead outreach batches).
- **Priority support** as a concept — remove label from pricing page + code.

---

## WORKING NOW (separate window)

- **94.** Hardware accelerator outreach — in progress (HAX, Techstars, EF, Founders Factory, SETsquared)

---

## TODAY — needs Tristan input

### 85. Community posts (3 communities)
Proposed targets:
1. **r/hwstartups** (Reddit)
2. **Hacker News — Show HN** (best slot: Tuesday 8am PT)
3. **Indie Hackers** (solo founder / bootstrapper community)

Drafts at `drafts/community-posts.md` exist but pre-date the Apr 16 voice rewrite. **Action:** I re-voice them against your real LinkedIn message, show you for approval.

### 79. Prospect list — repurposed as "warm-up list"
Not for cold DMs (per your triage). Repurposed for organic engagement — people to like, comment on, and show up next to on LinkedIn. 50 UK hardware founders, HAX/Techstars alumni, Innovate UK grant recipients. Columns: name, company, LinkedIn URL, one hook.

**Action:** I build it, you review.

### 93. Unified CRM / signup dashboard
One view, not two. Combines:
- PostHog (pageviews, funnel conversion)
- Supabase (signups, trial activity, retainers, orders)
- Sales pipeline (Prospect → Contacted → Demo → Trial → Paid)

**Decision needed:** internal `/admin/pipeline` page only, or public-facing "growth dashboard" you can show on stage?

---

## AUTONOMOUS — I handle, no input needed

- Open `ENGAGEMENT-PLAN.md` Section 3 — walk through 4 pending approval decisions on 5-email welcome drip
- Test voice-to-task end-to-end, report if it works
- Check `/about` page — report founder photo + overall state
- ShareResultBanner — DELETED Apr 16 (unused, never wired into any page)
- Explain onboarding cascade (7 skippable steps — what they are, keep/collapse recommendation)
- Remove "Priority support" label from pricing + code

---

## PLAN LATER — I'll write scoping one-pagers on each

- **95.** LinkedIn content plan (3x/week cadence, pillar themes, first 4 weeks queued)
- **96.** Product Hunt launch — what it is, when to launch, what assets needed
- **86/87.** Trial signup review — proposal: automate weekly "new signups + what they did" digest email to you (zero manual work)
- **91.** Week 2-4 scale outreach — defer until first paying customer
- **92.** First testimonial collection — defer until first paying customer

---

## NEW WORK STREAMS (surfaced Apr 16)

- Remove priority support labels from pricing + code
- Onboarding cascade consolidation (needs proposal from me first)
- ShareResultBanner — DELETED Apr 16
- Welcome + first-week email drip (4 approval decisions)
- Founder photo on `/about` (I'll report what's there first)
- Stripe bank account at dashboard.stripe.com/settings/payouts (Tristan's own list)

---

## REVENUE TARGETS

| Milestone | Timeline | What It Takes |
|-----------|----------|--------------|
| First revenue (£49+) | April 18 | 1 paying customer on Startup Team |
| £500 MRR | May 2026 | 10 customers (mix of £49 and £149) |
| £2,000 MRR | July 2026 | 25 customers |
| £10,000 MRR | October 2026 | 75-100 customers |

---

## DRAFTS READY FOR USE (in drafts/ directory)

| File | What it is | Status |
|------|-----------|--------|
| demo-call-script.md | 20-min demo playbook | Archived — demo calls killed |
| linkedin-thread.md | 6-post LinkedIn thread | ✅ Posted |
| community-posts.md | Reddit, HN, Indie Hackers posts | Needs re-voicing (Apr 16 voice) |
| hfn-blog-adaptations.md | 4 blog posts from HFN articles | Ready — review and publish |
| accelerator-pitch-email.md | Partnership pitch for 5 accelerators | In progress (separate window) |
| product-hunt-launch-plan.md | Full PH launch strategy | Needs Tristan one-pager |
