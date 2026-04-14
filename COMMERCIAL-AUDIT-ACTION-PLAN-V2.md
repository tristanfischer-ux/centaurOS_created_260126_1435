# Fractional Forge — Commercial Audit & Action Plan (v2)

**Date:** 2026-04-13 (updated 2026-04-14 evening)
**Objective:** First paying customers by 2026-04-18. Stop building. Start selling.
**Deadline:** 3 days.

---

## COMPLETED ACTIONS (75 done)

### Site Credibility Fixes (April 11)
1. Removed test accounts from /experts directory (migration filters test/e2e/qa names)
2. Deduplicated Trevor HARRIS entries (deactivated duplicate profile)
3. Fixed "Post a Role" 404 link (changed from /login to /join?role=founder)
4. Fixed homepage role CTAs (all 6 link to /join with role params)
5. Added Open Graph + Twitter Card meta tags to all pages (root layout + dynamic OG image generator)
6. Fixed homepage meta title: "ForgeOS — AI Manufacturing Platform for Hardware Startups"
7. Added pricing/terms/privacy/about/contact to sitemap
8. Added GDPR-compliant cookie consent banner with slide-up animation

### New Pages (April 11)
9. Created /about page (founder bio, mission, company info)
10. Created /contact page (email, Calendly, contact form)

### Product Copy Honesty (April 11)
11. Toned down CAD Lab claims everywhere: "engineering packages" changed to "concept packages"
12. Updated Forge page copy: "manufacturing-ready" changed to "explore materials, manufacturing approaches, find suppliers"
13. Updated homepage, root layout meta, sidebar tooltip, Forge page, and cards

### Homepage Conversion Hook (April 11)
14. Added interactive investor preview search box on homepage
15. Shows 5 anonymized investor cards (no firm names until signup)
16. Search query pre-fills signup form (stage/industry extracted from query)

### Email & Auth (April 11)
17. Branded all 13 Supabase auth email templates with ForgeOS styling
18. Configured custom SMTP via Resend (smtp.resend.com, sender "Fractional Forge")
19. Set password for tristan.fischer@gmail.com account

### Account & Database Cleanup (April 11)
20. Purged Elena Vasquez demo data from account
21. Renamed foundry from "The Forge Guild" to "Fractional Forge"
22. Set account to Founder role, Enterprise tier, Owner of forge-guild
23. Moved 20 fake team member profiles to demo-archive foundry
24. Hidden 7 test provider_profiles from Recruits directory
25. Deleted all tasks and objectives (clean slate for import)
26. Deleted demo cash data (7 out + 3 in entries)
27. Populated foundry stage=Seed, sector=manufacturing, company_profile
28. Normalized geographic data (UK vs United Kingdom)

### AI & UX Improvements (April 11)
29. Added bouncing dots indicator + scroll fix to AI specialist chat
30. Made business plan import resilient (partial results instead of total failure)
31. Added drag-and-drop text support for business plan import
32. Switched business plan import to Opus (Sonnet was too weak for objectives extraction)
33. Fixed business plan import timeout (maxDuration=300 on strategy page)
34. Added onboarding wizard skip option + relaxed validation + example headline chips
35. Added demo data disclaimer infrastructure (isDemoData prop)
36. Added investor match pre-warming (background fetch on first platform page load)

### Investor Overview (April 11)
37. Fixed section headers to sentence case (removed ALL CAPS)
38. Widened bar chart labels (20-char limit, was 14)
39. Moved donut legend horizontal below chart (was vertical right)

### Security Audit (April 10)
40. Full security audit: 68 issues found, 63 fixed — auth wrappers, filter injection, timing-safe, RLS, billing, 41 TS errors

### Overnight Autonomous Session (April 13-14)
41. Applied RLS hardening migration (quote_requests: DELETE policy, foundry_id INSERT check)
42. All pending DB migrations confirmed applied
43. Fixed investor getSimilarInvestors pagination (was capped at 1,000 by PostgREST)
44. Marketplace embedding backfill (fixed 768 dimensions, processing ~15,490 listings)
45. Added sidebar nav entry for /marketplace/quotes (desktop + mobile)
46. Upgraded demo data cleanup button in Settings (AlertDialog confirmation)
47. Updated 16 files from fractionalforge.com to fractionalforge.app
48. Set up PostHog analytics integration (platform-only, env-var gated)
49. Unified marketing nav/footer across 8 public pages
50. Verified AI search industry/certification extraction (already fully implemented)
51. Fixed ProcessDiscoveryGrid to hide during marketplace search
52. Added "What is an AI task?" explainer tooltip on pricing page
53. Wrote case study from real CAD Lab data (Agricultural IoT Irrigation System)

### April 14 — New Pages & Content
54. Built /for-founders landing page (hero, problem stats, solution cards, case study, pricing)
55. Built /for-manufacturers landing page (hero, value props, stats, how it works, FAQ)
56. Built /case-study page (full Agricultural IoT case study with deliverable cards)
57. Built /sample-package page (engineering package preview for non-logged-in visitors)
58. Published case study section on homepage ("See It In Action")
59. Added FAQ schema (JSON-LD FAQPage + Organization structured data)
60. Fixed grants page modal formatting (scroll, overflow, badges, pinned footer)

### April 14 — Content Drafts (in drafts/ directory)
61. Demo call script (20-minute structured playbook)
62. LinkedIn thread post (6-post thread about building ForgeOS)
63. Community posts (Reddit r/hwstartups, HN Show HN, hardware Slack/Discord)
64. 4 blog posts adapted from HFN Tier 1 articles (with ForgeOS context + backlinks)
65. Accelerator partnership pitch email (HAX, Techstars, EF, Founders Factory, SETsquared)
66. Product Hunt launch plan (Week 6-8 strategy with assets, schedule, metrics)

### April 14 — Major Homepage Rebuild (4 iterations from red team)
67. Repositioned as "The Operating System for Hardware Startups" (not AI tool, not manufacturing)
68. New tagline: "Expert knowledge, smart tools, investor intelligence, and manufacturing connections"
69. 7-section structure: Hero → How It Works → Meet Your Team → Investors → Founder → Pricing → FAQ
70. Restored 3-pillar section with images (Expert Knowledge, Smart Tools, Factories Without Factory)
71. 13 specialist avatars showing real character images
72. Investor stats: 7,800+ Investors, 49,000+ Contacts, 3,000+ Grants
73. Removed: Old Way, Find Your Role, Protection & Trust, Cloud Factory, founding member language
74. Softened all AI language to augmentation/support tone

### April 14 — Platform Fixes
75. Fixed pricing table: "0% first £10K" → "0% first 3 orders", added orders/month and team member limits
76. Removed "Experts" link from marketing navigation and footer
77. Contact form now sends via Resend server action (was mailto: only)

---

## REMAINING ACTIONS (19 remaining)

### CRITICAL — Do today/tomorrow (April 14-15)

78. Record 2-minute Loom demo video of The Forge / CAD Lab — show: product idea → concept package → matched suppliers. Embed on homepage.
79. Build 50-prospect LinkedIn list — "hardware startup founder" UK, HAX/Techstars alumni, Innovate UK grant recipients. For each: name, company, product, stage, LinkedIn URL, pain point.

### HIGH — Outreach Week (April 14-18)

80. Send Batch 1: 20 personalised LinkedIn messages + 10 cold emails
81. Send Batch 2: 15 LinkedIn messages + 10 emails + follow up on non-responders (April 15)
82. Run first demo calls and send personalised follow-up within 1 hour
83. Send Batch 3: 15 remaining LinkedIn messages (April 16)
84. Post LinkedIn thread (draft ready in drafts/linkedin-thread.md)
85. Post in 3 communities (drafts ready in drafts/community-posts.md)
86. Review all trial signups — personalised emails based on usage (April 17)
87. Direct conversion asks to most engaged trial users
88. Day 8 review: count outreach, replies, demos, signups, conversions. Plan Week 2.

### IMPORTANT — Activate (Tristan needed)

89. Activate PostHog — create project at posthog.com, add NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST to Vercel env vars
90. Add real product screenshot to homepage hero (replace placeholder)

### MEDIUM — Week 2-4 (April 19 - May 9)

91. Continue outreach: 50 more prospects (target total: 100 reached)
92. Collect and publish first testimonial(s) on homepage
93. Set up CRM pipeline tracking: Prospect → Contacted → Demo → Trial → Paid
94. Approach 5 hardware accelerators with partnership pitch (draft ready in drafts/accelerator-pitch-email.md)
95. Start LinkedIn posting 3x/week
96. Plan Product Hunt launch for Week 6-8 (plan ready in drafts/product-hunt-launch-plan.md)

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
3. One ICP, one message: hardware founders who need to move faster.
4. Proof beats promises. One testimonial > 100 feature bullets.
5. The demo IS the product. Show, don't tell.
6. Follow up relentlessly. 80% of sales happen after the 5th follow-up.
7. Revenue by Friday. Not "soon". Friday. One customer. £49.

---

## DRAFTS READY FOR USE (in drafts/ directory)

| File | What it is | Status |
|------|-----------|--------|
| demo-call-script.md | 20-min structured demo playbook | Ready |
| linkedin-thread.md | 6-post LinkedIn thread | Ready — review and post |
| community-posts.md | Reddit, HN, Slack posts | Ready — review and post |
| hfn-blog-adaptations.md | 4 blog posts from HFN articles | Ready — review and publish |
| accelerator-pitch-email.md | Partnership pitch for 5 accelerators | Ready — personalise and send |
| product-hunt-launch-plan.md | Full PH launch strategy | Ready — for Week 6-8 |
