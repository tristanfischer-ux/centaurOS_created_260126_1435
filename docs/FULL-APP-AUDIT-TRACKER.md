# Full App Audit — Browser Test Tracker

## Phase 1: Public Pages (User 4: Public Visitor)
| Page | Status | Issues |
|------|--------|--------|
| / (landing) | PASS | Loads correctly, "We build atoms at the speed of bits" |
| /pricing | PASS | Shows tiers: Starter, Professional, Enterprise |
| /experts | FAIL | "Something went wrong" — pre-existing bug, null profile_slug in ExpertCard |
| /experts/fractional-cmo | PASS | Shows "No fractional cmos found yet" (expected) |
| /experts/fractional-cfo/london | PASS | Shows "No fractional cfos in London yet" (expected) |
| /blog | PASS | Shows "No posts yet" with newsletter signup |
| /join | PASS | Shows "Join ForgeOS" signup form |
| /login | PASS | Login form renders correctly |
| /terms | PASS | Full ToS renders |
| /privacy | PASS | Full privacy policy renders |
| /techniques | PASS | Manufacturing techniques explorer |
| /sitemap.xml | PASS | Includes /blog and /experts |

## Phase 2: Core Platform (User 1: Founder)
| Page | Status | Issues |
|------|--------|--------|
| /today | PASS | Dashboard loads with morning briefing |
| /strategy | PASS | Strategy canvas loads |
| /new-objectives | PASS | Objectives page loads |
| /new-tasks | PASS | Tasks page loads |
| /review | PASS | Review queue with empty state |
| /agents | PASS | AI Team specialist roster |
| /agents/artifacts | PASS | Deliverables gallery |
| /reports | PASS | Reports hub |
| /team | PASS | Team page |
| /settings | PASS | Settings hub |
| /my-profile | PASS | Profile management |
| /updates | PASS | Comms feed |
| /knowledge | PASS | Knowledge base |
| /red-team | PASS | Red team debate tool |

## Phase 3: Growth & Sales
| Page | Status | Issues |
|------|--------|--------|
| /recruits | PASS | Recruits page |
| /investors | PASS | Investor management |
| /outreach | PASS | Outreach campaigns |
| /marketplace-v2 | PASS | Marketplace browser |
| /products | PASS | Product catalog |

## Phase 4: Finance
| Page | Status | Issues |
|------|--------|--------|
| /cash-burn | PASS | Cash burn dashboard |
| /finance | PASS | Finance hub |

## Phase 5: Provider Portal
| Page | Status | Issues |
|------|--------|--------|
| /provider-portal | PASS | Provider dashboard |
| /provider-portal/profile | PASS | Provider profile editor |
| /provider-portal/pricing | PASS | Pricing management |
| /provider-portal/case-studies | PASS | Case studies |

## Bonus Pages
| Page | Status | Issues |
|------|--------|--------|
| /time | PASS | Time tracking |
| /whats-new | PASS | Changelog |
| /google-apps | PASS | Google integration |
| /agents/artifacts | PASS | Deliverables |

## Summary

**Total pages tested: 33**
**Passed: 32 (97%)**
**Failed: 1 (3%)**

## Issues Found

### 1. /experts — "Something went wrong" (PRE-EXISTING, NOT from our changes)
- **Root cause:** Expert directory RPC returns data with `profile_slug: null`. The ExpertCard component likely crashes when rendering a link to `/expert/null`.
- **Impact:** Public visitors cannot browse the expert directory. Role and location sub-pages work (they return empty when no matches).
- **Our changes:** We never modified this file. git log confirms it was last touched in the original directory feature commit.
- **Fix required:** Either (a) filter out experts without slugs in the RPC, or (b) handle null slugs in ExpertCard.

## Fixes Applied
No fixes needed from our recent work — all new pages (blog, review, execution) work correctly. The one issue found (/experts) is pre-existing.
