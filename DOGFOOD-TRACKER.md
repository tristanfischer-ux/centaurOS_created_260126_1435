# ForgeOS Dogfooding Issue Tracker

**Created:** 2026-04-11
**Purpose:** Track every issue found during Tristan's dogfooding session. Nothing gets skipped.

---

## Completed

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 1 | Test accounts in public /experts directory | DONE | Migration 20260411100000 |
| 2 | OG tags missing on all pages | DONE | Root layout + dynamic OG image |
| 3 | Homepage meta title generic | DONE | Now "ForgeOS — AI Manufacturing Platform..." |
| 4 | Sitemap missing pricing/terms/privacy | DONE | Added |
| 5 | "Post a Role" link 404 | DONE | Changed to /join?role=founder |
| 6 | /about page missing | DONE | Created with founder bio |
| 7 | /contact page missing | DONE | Created with email, Calendly, form |
| 8 | Cookie consent banner missing (GDPR) | DONE | Slide-up banner added |
| 9 | CAD Lab claims oversold | DONE | "STEP files" -> "concept packages" |
| 10 | Investor preview on homepage | DONE | Interactive search, anonymized cards |
| 11 | Search-to-signup pre-fill | DONE | Stage/industry extracted from query |
| 12 | Trevor HARRIS duplicate in public directory | DONE | is_public=false on duplicate |
| 13 | Supabase auth emails unbranded | DONE | All 13 templates branded ForgeOS |
| 14 | Elena Vasquez account on tristan.fischer@gmail | DONE | Account purged, reset to clean |
| 15 | Foundry name "The Forge Guild" | DONE | Renamed to "Fractional Forge" |
| 16 | Password reset for Tristan | DONE | Set to ForgeOS-2026! |
| 17 | Onboarding wizard blocking access | DONE | All flags set to completed |
| 18 | Founding counter inconsistent framing | DONE | Both pages now say "X spots left" |
| 19 | Fake team members on Team page | DONE | 20 profiles moved to demo-archive foundry |
| 20 | Test accounts on Recruits page | DONE | 7 provider_profiles deactivated |
| 21 | Strategy/Objectives need "Demo:" prefix | DONE | 19 objectives prefixed |

## In Progress

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 22 | AI specialist interaction: no loading indicator, response dumps at bottom | DONE | Bouncing dots indicator + scroll-to-top fix |
| 23 | Strategy page: "Import Business Plan" fails to parse markdown | DONE | Resilient per-section parsing with regex fallback |
| 24 | Strategy page: needs drag-and-drop text support for uploads | DONE | Now accepts dragged text, wraps as .md file |
| 25 | Review queue: missing orange accent bar | DONE | Added typography.pageHeader + pageHeaderAccent |
| 26 | Review queue: should have AI specialist comment at top | DONE | Added Cal (Chief of Staff) briefing hero |
| 27 | Business plan import extracts products instead of objectives | DONE | Switched objectives to Opus, Sonnet was returning empty arrays |
| 28 | Demo data disclaimer infrastructure | DONE | isDemoData prop + cleaned cash data |
| 29 | Onboarding wizard too intimidating | DONE | Skip option, relaxed validation, example chips |
| 30 | Forge page overselling capability | DONE | "engineering packages" → "explore materials, manufacturing approaches, find suppliers" |

| 31 | Investor Overview layout/charts messy | DONE | Sentence case headers, wider labels, legend below donut, geo normalization |
| 32 | Investors "For You" returns 0 results | DONE | Foundry missing stage/sector — populated: Seed/manufacturing |
| 33 | Business plan import: maxDuration timeout | DONE | Added maxDuration=300 for Opus calls |
| 34 | Merge dialog: hires/funding invisible | DONE | Expandable card sections with full details |
| 35 | Investor match pre-warming | DONE | Background fetch on first platform page load per session |

## To Do

| # | Issue | Priority | Notes |
|---|-------|----------|-------|
| 36 | Custom SMTP for email sender address | DONE | Resend SMTP configured |
| 37 | Business plan import: API route for Opus | DONE | /api/analyze-objectives with maxDuration=300, client calls in parallel |
| 38 | Business plan import: objectives as strategic goals | DONE | is_strategic_goal=true so they appear on Strategy page |
| 39 | Business plan import: hires/funding → tasks | DONE | Creates tasks linked to parent objectives |

## To Do

| # | Issue | Priority | Notes |
|---|-------|----------|-------|
| 40 | Demo data cleanup system | HIGH | Button in Settings + prompt after onboarding completion |
| 41 | Record 2-min demo video of The Forge | HIGH | Tristan to record |
| 42 | Write first case study | HIGH | From FF's own usage |
| 43 | Update mock URLs in product screenshots | LOW | .com -> .app |
| 44 | Update commercial audit action plan in ForgeOS | MEDIUM | Import into Strategy page once pipeline works |

---

**Session totals: 39 done, 5 remaining**

*Updated as issues are found and resolved. Every item Tristan flags gets added here.*
