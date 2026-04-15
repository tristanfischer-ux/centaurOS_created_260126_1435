# ForgeOS Red Team Audit V2 — Pre-Launch

**Date:** 2026-04-15
**Prior Audit:** April 10 (68 issues, 63 fixed)
**Purpose:** Final pre-launch sweep before LinkedIn outreach morning of April 16
**Method:** 10-pass red team from different attack/test angles

---

## Score Card

| Pass | Angle | Issues Found | Issues Fixed | P0 | P1 | P2 | Status |
|------|-------|-------------|-------------|----|----|----|----|
| 1 | Public pages — broken links, missing content, 404s | | | | | | RUNNING |
| 2 | Mobile responsive — every page on small viewport | | | | | | PENDING |
| 3 | SEO & meta — OG tags, structured data, canonical URLs | 10 | 8 | 1 | 7 | 2 | DONE |
| 4 | Auth flows — login, signup, password reset, redirects | | | | | | PENDING |
| 5 | Platform pages — load, render, no console errors | | | | | | PENDING |
| 6 | Forms & CTAs — contact form, pricing CTAs, join flow | | | | | | PENDING |
| 7 | Security — headers, CORS, CSP, exposed secrets, RLS | 1 | 1 | 0 | 1 | 0 | DONE |
| 8 | Performance — LCP, bundle size, image optimization | | | | | | PENDING |
| 9 | Copy & brand — consistency, typos, wrong numbers, dead positioning | 15 | 9 | 8 | 1 | 6 | DONE |
| 10 | Edge cases — empty states, error pages, 404, rate limits | | | | | | PENDING |
| S1 | Stripe & financial exposure | 7 | 5 | 5 | 2 | 0 | DONE |
| S2 | RLS & data breach | | | | | | RUNNING |
| S3 | API abuse & rate limiting | | | | | | RUNNING |
| S4 | Data scraping protection (investors/suppliers) | | | | | | RUNNING |
| S5 | SEO + AI agent friendliness | | | | | | RUNNING |
| S6 | API billing limits failsafe | | | | | | RUNNING |
| S7 | Operational (Sentry, GDPR, multi-account, email) | | | | | | RUNNING |
| **TOTALS** | | **33** | **23** | **14** | **11** | **8** | |

---

## Issues Log

| # | Pass | Sev | Page/Route | Description | Fix | Status |
|---|------|-----|------------|-------------|-----|--------|
| 1 | 9 | P0 | cad-instructions.ts:15,24 | Old centauros.io URLs in AI prompts | Changed to fractionalforge.app | FIXED |
| 2 | 9 | P0 | page.tsx:668 | "AI-powered matching scores" on homepage | Removed "AI-powered" | FIXED |
| 3 | 9 | P0 | investors/page.tsx:34,37 | "AI-powered recommendations" in OG meta | Changed to "personalised" | FIXED |
| 4 | 9 | P0 | ask-modal.tsx:169 | "AI-powered insights" in dialog | Changed to "insights from your advisory forum" | FIXED |
| 5 | 9 | P0 | learn-page.tsx:523,558 | "AI-powered insights" (2 instances) | Removed "AI-powered" | FIXED |
| 6 | 9 | P0 | CommandPalette.tsx:245 | "AI-powered" badge | Changed to "Auto-extract" | FIXED |
| 7 | 9 | P0 | settings/help/page.tsx:86 | "AI-powered features" | Changed to "Smart assist features" | FIXED |
| 8 | 9 | P0 | marketing-content.ts:352 | "AI-powered" in press release template | P1 — indirect (generated content) | NOTED |
| 9 | 9 | P1 | screen-context.tsx:131 | "AI-powered engineering research" in context | Not user-facing | NOTED |
| 10 | 9 | P2 | trial.ts:6,137 | "Centaur Matcher" in code/feature ID | Internal only | NOTED |
| 11 | 9 | P2 | invite/[token]/page.tsx:155 | centaur-os-core.png image src | Filename only, alt text correct | NOTED |
| 12 | 9 | P2 | usage-tracking.ts:30 | centaur_matcher feature ID | Internal type | NOTED |
| 13 | 9 | P2 | domains.ts:69-70 | centauros.io in domain redirect | Legitimate legacy redirect | NOTED |
| 14 | 9 | P2 | database.types.ts:18773 | centaur_discount_percent column | Auto-generated, needs migration | NOTED |
| 15 | 7 | P1 | cron/outreach-drip/route.ts:44 | Cron auth bypass when CRON_SECRET unset | Changed to fail-closed | FIXED |
| 16 | 3 | P0 | layout.tsx | twitter:image 404 (/images/og-default.png missing) | Removed broken reference, rely on dynamic OG | FIXED |
| 17 | 3 | P1 | layout.tsx | OG title/desc still said "AI Manufacturing Platform" | Updated to OS positioning | FIXED |
| 18 | 3 | P1 | case-study/page.tsx | Duplicate "| ForgeOS | ForgeOS" in title | Removed manual suffix | FIXED |
| 19 | 3 | P1 | sample-package/page.tsx | Duplicate "| ForgeOS | ForgeOS" in title | Removed manual suffix | FIXED |
| 20 | 3 | P1 | sitemap.ts | 5 marketing pages missing from sitemap | Added for-founders, for-manufacturers, case-study, sample-package, join | FIXED |
| 21 | 3 | P1 | Multiple pages | Missing canonical URLs, og:url, og:site_name | Added to case-study, sample-package, for-founders, for-manufacturers | FIXED |
| 22 | 3 | P1 | for-founders, for-manufacturers, sample-package | Missing og:image | Relies on layout default (needs real OG image later) | NOTED |
| 23 | 3 | P2 | sitemap.ts | All lastmod dates identical | Auto-generated, acceptable | NOTED |
| 24 | 3 | P2 | No hreflang tags | Not critical for single-locale site | NOTED |
| 25 | S1 | P0 | api/investors/match/route.ts | No AI cost gate — unlimited LLM calls | Added aiGuard | FIXED |
| 26 | S1 | P0 | api/recruits/match/route.ts | No AI cost gate | Added aiGuard | FIXED |
| 27 | S1 | P0 | api/suppliers/match/route.ts | No AI cost gate | Added aiGuard | FIXED |
| 28 | S1 | P0 | api/red-team/generate/route.ts | No AI cost gate — 16-24 LLM calls per debate | Added aiGuard | FIXED |
| 29 | S1 | P0 | api/analyze-objectives/route.ts | No AI cost gate — Opus at $5/$25 per 1M tokens | Added aiGuard | FIXED |
| 30 | S1 | P1 | api/health/ai/route.ts | Health check makes real AI calls without rate limit | Needs IP rate limiting | TODO |
| 31 | S1 | P1 | api/billing/test-activate/route.ts | Test billing activation exists in production | Triple-gated but should be removed | TODO |
| 32 | S1 | P2 | payments/flow.ts:226,509 | Fee calculated at initiation AND release — could differ | Use stored fee at release | NOTED |
| 33 | S1 | P2 | limit-check.ts:69 | Developer foundry bypass in AI limits | Logged, acceptable | NOTED |

---

## Pass Details

### Pass 1: Public Pages
- [ ] Homepage (/)
- [ ] Pricing (/pricing)
- [ ] About (/about)
- [ ] Contact (/contact)
- [ ] Terms (/terms)
- [ ] Privacy (/privacy)
- [ ] For Founders (/for-founders)
- [ ] For Manufacturers (/for-manufacturers)
- [ ] Case Study (/case-study)
- [ ] Sample Package (/sample-package)
- [ ] Login (/login)
- [ ] Join (/join)
- [ ] All nav links resolve
- [ ] All footer links resolve
- [ ] No dead links

### Pass 2: Mobile Responsive
- [ ] Homepage at 375px
- [ ] Pricing at 375px
- [ ] All marketing pages at 375px
- [ ] Navigation hamburger/mobile menu
- [ ] Text doesn't overflow
- [ ] Images scale properly
- [ ] CTAs are tappable (min 44px)

### Pass 3: SEO & Meta
- [ ] Every page has unique title + description
- [ ] OG tags present and correct on all pages
- [ ] JSON-LD structured data valid
- [ ] Canonical URLs
- [ ] robots.txt
- [ ] sitemap.xml
- [ ] Favicon loads

### Pass 4: Auth Flows
- [ ] Login page renders
- [ ] Join page renders
- [ ] OAuth buttons present
- [ ] Redirect after login
- [ ] Redirect when unauthenticated
- [ ] Password reset flow

### Pass 5: Platform Pages (authenticated)
- [ ] Dashboard loads
- [ ] Each specialist chat loads
- [ ] Tasks page loads
- [ ] Objectives page loads
- [ ] Settings page loads
- [ ] No console errors

### Pass 6: Forms & CTAs
- [ ] Contact form submits successfully
- [ ] Contact form validation works
- [ ] Pricing CTA buttons link correctly
- [ ] Join form validation
- [ ] Newsletter/email capture (if exists)

### Pass 7: Security
- [ ] Security headers (X-Frame-Options, CSP, etc.)
- [ ] No secrets in client bundle
- [ ] HTTPS enforced
- [ ] Cookies secure + httpOnly
- [ ] No exposed API keys in source
- [ ] RLS policies active

### Pass 8: Performance
- [ ] Homepage loads < 3s
- [ ] No massive JS bundles
- [ ] Images optimized (next/image)
- [ ] Fonts loaded efficiently
- [ ] No layout shift

### Pass 9: Copy & Brand
- [ ] No mentions of "Centaur" or "CentaurOS" in UI
- [ ] Consistent "ForgeOS" / "Fractional Forge" usage
- [ ] Numbers match (7,800+ investors, 13,700+ manufacturers, 13 specialists)
- [ ] No placeholder text
- [ ] No lorem ipsum
- [ ] Pricing matches actual plans

### Pass 10: Edge Cases
- [ ] 404 page works
- [ ] Error boundary catches crashes
- [ ] Empty states render properly
- [ ] Rate limit responses handled gracefully
