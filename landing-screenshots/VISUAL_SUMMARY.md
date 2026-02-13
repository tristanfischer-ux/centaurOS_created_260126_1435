# Fractional Forge Landing Page — Visual Section Audit

**URL:** https://fractionalforge.app  
**Date:** 2025-02-13  
**Viewport:** 1440×900  
**Screenshots:** `landing-screenshots/`

---

## Section-by-Section Summary

### 1. Hero Section ✅
- **Content:** "Stop Burning Runway on Hardware That Takes **Forever.**" with Early Access tag, subtext, and "Apply for Early Access →" CTA.
- **Visuals:** Clean, bright hero with blurred background image. International Orange for headline accent and CTA. v0.9 badge at bottom.
- **Notes:** Consistent, professional, no obvious issues.

### 2. Problem Section ("The Hardware Trap") ✅
- **Content:** "Building Hardware Shouldn't Mean Burning Everything." with three problem cards: 12–18 months, £50–100k/month, 30–40% equity.
- **Visuals:** Three-column grid with clock, dollar, and equity icons. Cards with light red/pink icon backgrounds.
- **Potential issue:** Icon backgrounds may use hardcoded `bg-red-50`/`bg-red-100` instead of semantic tokens like `bg-status-error-light` (per color-consistency rules).

### 3. Savings Calculator / Traditional vs Fractional ✅
- **Content:** Split image (stressed founder vs collaborative team) with "Traditional Development vs. The Fractional Model". "See Your Savings" section with headline "How Much Is Your Standing Army Really Costing You?"
- **Visuals:** Strong visual contrast. Interactive calculator with sliders (team size, cost/engineer, timeline) and cost comparison boxes.
- **Potential issues:**
  - "Traditional" box uses light red; "Fractional" uses light green — may be hardcoded `text-red-*`/`bg-red-*` and `text-green-*`/`bg-green-*` instead of `text-destructive`/`bg-status-error-light` and `text-status-success`/`bg-status-success-light`.

### 4. Solution Section ("The Fractional Model") ✅
- **Content:** "What If You Could Build Hardware Like Software?" with value pillars: Fractional Teams, Fractional Cost, Full Ownership, 12-Week Sprints, Manufacturing Network, Operating System.
- **Visuals:** Cards use light blue/teal accent for icons and highlights.
- **Potential issue:** Blue accent may be hardcoded `text-blue-*` instead of `text-electric-blue`.

### 5. How a Project Works ✅
- **Content:** "From Concept to Prototype. Weeks, Not Months." with drone example, timeline steps (Scope definition, Concept design, Rapid prototyping, Functional testing, Production-ready).
- **Visuals:** Dark card with drone image on left; vertical timeline with orange icons on right.
- **Potential issue:** Dark illustrative card contrasts with light-first philosophy; verify it uses semantic dark tokens if intentional.

### 6. Platform Capabilities / Metrics ✅
- **Content:** Four metric cards: 80+ Manufacturing Techniques, 100 Founding Member Spots, 10 Engineering Categories, £0 Equity Given Up.
- **Visuals:** Clean cards with large orange numbers. Consistent layout.
- **Notes:** Looks good. Header lacks orange accent bar (per layout-spacing for platform pages — may be acceptable for marketing).

### 7. How It Works (3-Step) ✅
- **Content:** Apply → Get Matched → Build & Launch. Each step with icon, title, description.
- **Visuals:** "Senior Specialists Only", "No Equity, No Lock-In", "Full Manufacturing Stack" cards above; three horizontal step cards below.
- **Potential issue:** Muted blue/grey step icons; verify not hardcoded `text-slate-*` or `text-gray-*`.

### 8. Manufacturing Network ✅
- **Content:** "80+ Techniques. One Platform." with technique badges (Additive Manufacturing, CNC Machining, Sheet Metal, etc.) and green checkmarks.
- **Visuals:** Oval badges with light borders. "Explore All 78+ Techniques" link in electric blue.
- **Potential issue:** Green checkmarks may use hardcoded `text-green-*`; should use `text-status-success`.

### 9. Pricing Section ✅
- **Content:** Free (£0), Starter (£49/mo), Professional (£149/mo) with feature lists.
- **Visuals:** Professional card has orange border and "Most Popular" badge. Green checkmarks on feature lists.
- **Potential issues:**
  - **CRITICAL:** Green checkmarks likely hardcoded `text-green-*` → use `text-status-success`.
  - "Get Started Free" and "Start Building" buttons may use hardcoded gray (`bg-slate-100`, `text-slate-900`).
  - "Most Popular" badge may use `bg-orange-100` instead of semantic token.

### 10. FAQ Section ✅
- **Content:** Accordion-style questions (IP ownership, fractional model, hardware types, Early Access, cost, non-founders, timeline, refund policy).
- **Visuals:** Clean accordion cards with chevron indicators.
- **Potential issue:** FAQ link in nav doesn't show `text-international-orange` for active state when scrolled to FAQ.

### 11. Final CTA Section ✅
- **Content:** "Ready to Build Hardware at Software Speed?" with "Apply for Early Access →" and "Already a member? Login".
- **Visuals:** Dark background section (dark blue/navy) with light text — contrasts with rest of page's light theme.
- **Potential issue:** Dark CTA section contradicts "Light-First Design"; may be intentional for emphasis but worth verifying against design philosophy.

### 12. Footer ✅
- **Content:** Logo, tagline, copyright; Platform links (Pricing, Login, Apply); Role links (Founders, Executives, Apprentices); "Build Faster. Burn Less." tagline.
- **Visuals:** Dark footer with light text. Clear structure.
- **Notes:** Dark footer is conventional; overall page uses mix of light sections and dark CTA/footer.

---

## Summary of Issues

### Critical / Likely Violations
| Section | Issue |
|---------|-------|
| Problem | Icon backgrounds may use hardcoded red (`bg-red-50`, etc.) |
| Savings Calculator | Traditional/Fractional boxes may use hardcoded red/green |
| Manufacturing | Green checkmarks may use `text-green-*` |
| Pricing | Green checkmarks, gray secondary buttons, orange badge may use hardcoded colors |

### Moderate / Design Consistency
| Section | Issue |
|---------|-------|
| Solution | Blue accent may be hardcoded `text-blue-*` |
| How a Project Works | Dark illustrative card vs light-first philosophy |
| Header | Missing orange accent bar (platform page standard; marketing may differ) |
| FAQ | Active nav state not visually clear when scrolled to FAQ |
| Final CTA | Dark background contradicts light-first design |

### Positive
- Consistent use of International Orange for primary CTAs
- Clean, modern layout with good typography hierarchy
- Airy spacing and readable structure
- Professional footer and navigation

---

## Recommended Next Steps

1. **Run `./scripts/check-design-tokens.sh`** to surface hardcoded color usage.
2. **Audit Problem, Calculator, Manufacturing, and Pricing** for `text-green-*`, `bg-red-*`, `text-slate-*`, etc.
3. **Confirm marketing vs platform** — if this is a marketing page, missing accent bar and distinct nav style may be intentional.
4. **Evaluate dark CTA/footer** — decide if it's an intentional exception or should align with light-first design.
