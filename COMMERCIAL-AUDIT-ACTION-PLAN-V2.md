# Fractional Forge — Commercial Audit & Action Plan (v2)

**Date:** 2026-04-13 (updated 2026-04-14)
**Objective:** First paying customers by 2026-04-18. Stop building. Start selling.
**Deadline:** 4 days.

---

## COMPLETED ACTIONS (53 done)

### Site Credibility Fixes
1. Removed test accounts from /experts directory (migration filters test/e2e/qa names)
2. Deduplicated Trevor HARRIS entries (deactivated duplicate profile)
3. Fixed "Post a Role" 404 link (changed from /login to /join?role=founder)
4. Fixed homepage role CTAs (all 6 link to /join with role params)
5. Added Open Graph + Twitter Card meta tags to all pages (root layout + dynamic OG image generator)
6. Fixed homepage meta title: "ForgeOS — AI Manufacturing Platform for Hardware Startups"
7. Added pricing/terms/privacy/about/contact to sitemap
8. Added GDPR-compliant cookie consent banner with slide-up animation

### New Pages
9. Created /about page (founder bio, mission, company info)
10. Created /contact page (email, Calendly, contact form)

### Product Copy Honesty
11. Toned down CAD Lab claims everywhere: "engineering packages" changed to "concept packages"
12. Updated Forge page copy: "manufacturing-ready" changed to "explore materials, manufacturing approaches, find suppliers"
13. Updated homepage, root layout meta, sidebar tooltip, Forge page, and cards

### Homepage Conversion Hook
14. Added interactive investor preview search box on homepage
15. Shows 5 anonymized investor cards (no firm names until signup)
16. Search query pre-fills signup form (stage/industry extracted from query)

### Email & Auth
17. Branded all 13 Supabase auth email templates with ForgeOS styling
18. Configured custom SMTP via Resend (smtp.resend.com, sender "Fractional Forge")
19. Set password for tristan.fischer@gmail.com account

### Account & Database Cleanup
20. Purged Elena Vasquez demo data from account
21. Renamed foundry from "The Forge Guild" to "Fractional Forge"
22. Set account to Founder role, Enterprise tier, Owner of forge-guild
23. Moved 20 fake team member profiles to demo-archive foundry
24. Hidden 7 test provider_profiles from Recruits directory
25. Prefixed 19 objectives with "Demo:" (now deleted entirely)
26. Deleted demo cash data (7 out + 3 in entries)
27. Populated foundry stage=Seed, sector=manufacturing, company_profile
28. Normalized geographic data (UK vs United Kingdom)

### AI & UX Improvements
29. Added bouncing dots indicator + scroll fix to AI specialist chat
30. Made business plan import resilient (partial results instead of total failure)
31. Added drag-and-drop text support for business plan import
32. Switched business plan import to Opus (Sonnet was too weak for objectives extraction)
33. Fixed business plan import timeout (maxDuration=300 on strategy page)
34. Added onboarding wizard skip option + relaxed validation + example headline chips
35. Added demo data disclaimer infrastructure (isDemoData prop)
36. Added investor match pre-warming (background fetch on first platform page load)

### Investor Overview
37. Fixed section headers to sentence case (removed ALL CAPS)
38. Widened bar chart labels (20-char limit, was 14)
39. Moved donut legend horizontal below chart (was vertical right)

### Security Audit (68 issues found, 63 fixed)
40. Full security audit completed: auth wrappers on 5 server actions, filter injection fixes, timing-safe webhook comparison, RLS profile trigger, billing enforcement, 41 TypeScript errors fixed

### Overnight Autonomous Session (April 13-14)
41. Applied RLS hardening migration (quote_requests: DELETE policy, foundry_id INSERT check, quantity CHECK)
42. All pending DB migrations confirmed applied
43. Fixed investor getSimilarInvestors pagination — was capped at 1,000 by PostgREST, now uses .range() in 500-row batches
44. Marketplace embedding backfill — fixed script dimensions (768 not 1536), processing ~15,490 listings
45. Added sidebar nav entry for /marketplace/quotes (desktop + mobile)
46. Upgraded demo data cleanup button in Settings (proper AlertDialog confirmation, destructive variant)
47. Updated 16 files from fractionalforge.com to fractionalforge.app
48. Set up PostHog analytics integration (platform-only, env-var gated, respects DNT) — needs NEXT_PUBLIC_POSTHOG_KEY to activate
49. Unified marketing nav/footer across 8 public pages (new MarketingNav + MarketingFooter components)
50. Verified AI search industry/certification extraction — already fully implemented across all 5 pipeline layers
51. Fixed ProcessDiscoveryGrid to hide during marketplace search
52. Added "What is an AI task?" explainer tooltip on pricing page (3 locations)
53. Wrote case study from real CAD Lab data: "Agricultural IoT Irrigation System — from concept to engineering package in 3 hours"

---

## REMAINING ACTIONS (32 remaining)

### CRITICAL — Do before any outreach (April 14)

54. Record 2-minute Loom demo video of The Forge / CAD Lab (concept package generation) — show: type product idea, CAD Lab processes, view engineering package, see matched suppliers. Embed on homepage above the fold.
55. Build 50-prospect LinkedIn list — search: "hardware startup founder" UK, "CTO" + "physical product" UK, HAX/Techstars Hardware alumni, Innovate UK Smart Grant recipients, recent Seedrs/Crowdcube hardware raises. For each: name, company, product, stage, LinkedIn URL, pain point.

### HIGH — Outreach Week (April 14-18)

56. Send Batch 1: 20 personalised LinkedIn messages + 10 cold emails (Day 1 — April 14)
57. Prepare 20-minute demo script (2 min ask about their product, 5 min live CAD Lab demo, 5 min engineering package, 3 min suppliers, 3 min specialists, 2 min pricing)
58. Send Batch 2: 15 LinkedIn messages + 10 emails + follow up on non-responders (Day 2 — April 15)
59. Run first demo calls and send personalised follow-up within 1 hour of each
60. Send Batch 3: 15 remaining LinkedIn messages (Day 3 — April 16)
61. Post on LinkedIn: thread about building ForgeOS with CAD Lab output screenshots, ending with "DM me to try it"
62. Post in 3 communities: Reddit r/hwstartups, Hacker News Show HN, hardware Slack/Discord groups
63. Review all trial signups — personalised emails based on usage (Day 4 — April 17)
64. Direct conversion asks to most engaged trial users: "Upgrade today for founding member pricing — 20% off for life"
65. Day 8 review: count outreach sent, replies, demos, signups, conversions. Calculate rates. Plan Week 2.

### IMPORTANT — Platform fixes (do in parallel)

66. Activate PostHog — create project at posthog.com, add NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST to Vercel env vars
67. Verify grants page modal formatting on desktop and mobile
68. Publish case study on homepage as "Featured Story" section (content written, needs page integration)

### MEDIUM — Week 2-4 (April 19 - May 9)

69. Continue outreach: 50 more prospects (target total: 100 reached)
70. Write blog article: "The Real Cost of Going from Idea to Prototype in the UK (2026)"
71. Write blog article: "Why Hardware Startups Fail at Manufacturing (And How AI Changes That)"
72. Collect and publish first testimonial(s) on homepage
73. Create dedicated landing page /for-founders (hardware founder messaging)
74. Create dedicated landing page /for-manufacturers (supplier/factory messaging)
75. Set up CRM pipeline tracking (even a Notion board): Prospect > Contacted > Demo > Trial > Paid
76. Approach 5 hardware accelerators with partnership pitch (HAX, Techstars Hardware, Entrepreneur First, Founders Factory, SETsquared)
77. Start LinkedIn posting 3x/week (personal brand + company page)
78. Plan Product Hunt launch for Week 6-8 (aim for 10+ testimonials first)

### LOW — Month 2-3 (May - July)

79. Explore paid LinkedIn ads (small budget: $20/day test)
80. Launch referral programme: 1 month free per converting referral
81. Run "From Idea to Prototype in 2 Weeks" webinar
82. Become default tool in 2-3 hardware accelerator programmes
83. Add FAQ schema to homepage FAQ section (structured data for SEO)
84. Start content calendar (1 article/week minimum)
85. Create sample engineering package download for non-logged-in visitors

---

## REVENUE TARGETS

| Milestone | Timeline | What It Takes |
|-----------|----------|--------------|
| First revenue (£49+) | April 18 | 1 paying customer on Startup Team |
| £500 MRR | May 2026 | 10 customers (mix of £49 and £149) |
| £2,000 MRR | July 2026 | 25 customers |
| £10,000 MRR | October 2026 | 75-100 customers |

## WEEK 1 KPIs (April 14-18)

| Metric | Target |
|--------|--------|
| Outreach messages sent | 50 |
| Reply rate | 15%+ (8+ replies) |
| Demo calls completed | 5+ |
| Trial signups | 10+ |
| Paid conversions | 1-3 |
| First revenue | £49+ |

---

## KEY PRINCIPLES

1. STOP BUILDING. START SELLING.
2. Founder-led sales first. 2-3 demo calls per day in Week 1.
3. One ICP, one message: hardware founders who need engineering packages.
4. Proof beats promises. One testimonial > 100 feature bullets.
5. The demo IS the product. Show, don't tell.
6. Follow up relentlessly. 80% of sales happen after the 5th follow-up.
7. Revenue by Friday. Not "soon". Friday. One customer. £49.
