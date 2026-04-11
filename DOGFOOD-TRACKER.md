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
| 27 | Business plan import extracts products instead of objectives | DONE | Rewrote OBJECTIVES_PROMPT to be action-plan-aware, fixed PRODUCTS_PROMPT to not extract internal features |

## To Do

| # | Issue | Priority | Notes |
|---|-------|----------|-------|
| 28 | AI specialists should label demo/dummy data clearly | HIGH | Finn shows P&L data as real when it's demo |
| 29 | Onboarding "Professional Identity" wizard too intimidating | HIGH | Needs skip option + AI-assisted profile writing |
| 30 | Custom SMTP for email sender address | MEDIUM | Currently shows noreply@mail.app.supabase.io |
| 31 | Record 2-min demo video of The Forge | HIGH | Tristan to record |
| 32 | Write first case study | HIGH | From FF's own usage |
| 33 | Update mock URLs in product screenshots | LOW | .com -> .app |
| 34 | Review queue items show +7 hires, +5 funding that aren't visible | MEDIUM | Summary counts but no detail tabs for hires/funding |

---

*Updated as issues are found and resolved. Every item Tristan flags gets added here.*
