# Platform Gap Analysis: GTM Plan vs Current Capabilities

## What the Plan Needs vs What Exists

### GREEN — Already Built, Ready to Use

| Capability | Status | Location |
|---|---|---|
| Programmatic SEO pages (/experts/[role]/[location]) | Done | `src/app/(directory)/` |
| JSON-LD structured data | Done | `src/lib/directory/structured-data.ts` |
| Dynamic sitemap | Done | `src/app/sitemap.ts` |
| OG image generation | Done | `src/app/api/og/profile/` |
| Executive profiles (rates, case studies, endorsements) | Done | provider_profiles, marketplace_listings |
| AI matching (5-factor scoring + rationales) | Done | `src/lib/recruit-match.ts` |
| Founding member system (first 100, badge, credits) | Done | profiles table, `src/actions/referrals.ts` |
| Referral system (cross-audience) | Done | `src/lib/referrals/process-signup.ts` |
| Stripe billing (3 tiers) | Done | `src/app/api/billing/` |
| Role-differentiated signup | Done | `src/app/join/page.tsx` |
| Case studies on exec profiles | Done | `src/app/(platform)/provider-portal/case-studies/` |
| Time tracking | Done | `src/actions/time-tracking.ts` |
| Resend transactional email | Done | `src/lib/notifications/channels/email.ts` |
| Activity event tracking | Done | `src/actions/activity-events.ts` |
| Featured/tier placement system (DB ready) | Done | marketplace_listings.is_featured, featured_until |
| Provider portal (pricing, availability, analytics) | Done | `src/app/(platform)/provider-portal/` |

### YELLOW — Partially Built, Needs Enhancement

| Capability | Current State | What's Needed | Effort |
|---|---|---|---|
| Published day rates | Stored in DB, shown in detail modal | Prominently display on ALL exec cards and directory listings | 0.5 days |
| Founding member badge | DB fields exist, counter on /join | Visual badge component on profiles + directory cards | 0.5 days |
| Exec-specific referral incentive | Generic referral (10 credits) | Exec referral track: "invite colleague → priority placement 30 days" | 1 day |
| Vetting/quality messaging | Verification fields exist | Public-facing "How We Vet" section on landing page | 0.5 days |
| Email infrastructure | Resend transactional only | Broadcast/newsletter capability via Resend Audiences API | 1 day |
| Rate transparency on cards | Rate in DB, maybe not prominent | Ensure MarketCardV2 and directory cards show day rate prominently | 0.5 days |

### RED — Does Not Exist, Must Build

| Capability | Why Needed | Priority | Effort |
|---|---|---|---|
| **PostHog/analytics integration** | Cannot measure which channels drive signups, where users drop off | P0 (Week 0) | 1 day |
| **UTM parameter capture on signup** | Cannot attribute signups to campaigns | P0 (Week 0) | 0.5 days |
| **Blog/CMS (MDX)** | Content marketing for SEO compounding | P0 (Week 0) | 2 days |
| **Newsletter signup on public pages** | Email list building for nurture | P0 (Week 0) | 1 day |
| **Audience landing page: /for-pe-funds** | PE fund-specific value prop and CTA | P0 (Week 0) | 1.5 days |
| **Audience landing page: /for-cfo** | Exec-specific value prop and founding CTA | P0 (Week 0) | 1 day |
| **Standalone /case-studies page** | Social proof hub (currently buried in exec profiles) | P1 (Week 1) | 1 day |
| **SEO page content enrichment** | Programmatic pages need real content, not just listings | P1 (Week 1) | 2 days |
| **Brief submission form** | Companies submit what they need → matchable brief | P1 (Week 3) | 1.5 days |
| **Match notification emails** | Both sides need professional intro email when matched | P1 (Week 3) | 1 day |
| **48-hour SLA tracker** | Marketing claim needs backing data | P2 (Week 5) | 1 day |
| **Admin metrics dashboard** | Track supply/demand/matches/revenue in one place | P2 (Week 5) | 2 days |
| **Monthly newsletter broadcast** | Nurture email list | P2 (Week 5) | 1 day |
| **IR35 compliance questionnaire** | High-value subscription feature | P3 (Week 9) | 3 days |
| **PE fund portfolio dashboard** | Differentiated offering for fund partnerships | P3 (Week 9) | 5 days |

## Build Priority Summary

| Sprint | Timing | Items | Total Effort |
|---|---|---|---|
| **Sprint 0: Readiness** | Week 0 (before GTM) | PostHog, UTM, blog, newsletter capture, 2 landing pages, rate display, vet messaging | ~8 dev days |
| **Sprint 1: Supply tools** | Weeks 1-4 | Case studies page, SEO enrichment, founding badge display, exec referral track | ~5 dev days |
| **Sprint 2: Demand tools** | Weeks 3-6 | Brief form, match emails, SLA tracker, admin dashboard | ~5.5 dev days |
| **Sprint 3: Scale features** | Weeks 9-12 | IR35 tool, PE fund dashboard, newsletter system | ~9 dev days |

**Total platform work: ~27.5 dev days across 12 weeks** — achievable alongside GTM execution.

## What Claude Code Can Build Autonomously

All items above can be built by Claude Code with minimal Tristan input. Specifically:

**Fully autonomous (build + test + ship):**
- PostHog integration
- UTM capture
- Newsletter signup component + Supabase table
- Blog route with MDX
- Case studies aggregation page
- Rate display improvements
- SEO page content generation
- Admin metrics dashboard
- Match notification email templates

**Needs Tristan input on copy/design, then autonomous build:**
- /for-pe-funds landing page (Tristan provides value prop bullet points)
- /for-cfo landing page (Tristan provides exec pitch)
- "How We Vet" section (Tristan describes actual vetting process)
- Brief submission form (Tristan defines what fields matter)
- IR35 questionnaire (legal accuracy needed)

**Needs external decision:**
- PE fund portfolio dashboard (scope depends on what funds actually want — build after first fund meeting)
