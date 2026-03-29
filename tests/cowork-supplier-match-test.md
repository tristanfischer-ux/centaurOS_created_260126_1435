# Test: Smart Supplier Matching — "For You" Tab

## Setup
1. Open https://fractionalforge.app/login
2. Log in with: `mark@soldado.uk` / `Soldado2026!`
3. Navigate to the Marketplace page (sidebar → Marketplace, or go to https://fractionalforge.app/marketplace)

## Test 1: Tab Structure
- [ ] Verify two tabs appear at the top: **"For You"** and **"Browse All"**
- [ ] Verify "For You" is the default active tab (highlighted in orange)
- [ ] Click "Browse All" — verify the existing marketplace grid loads with search/filter controls
- [ ] Click "For You" — verify it switches back

## Test 2: Matching Flow (Happy Path)
- [ ] On the "For You" tab, verify matching starts automatically on page load
- [ ] Verify a progress card appears with a sparkle icon and text like "Scoring suppliers against your profile..."
- [ ] Wait for scoring to complete — verify it shows "Scored X suppliers" with a count
- [ ] Verify "Generating insights..." progress appears with batch numbers (e.g. "batch 1 of 4")
- [ ] Verify supplier match rows start appearing as batches complete (they stream in progressively)
- [ ] Verify the "Refresh Matches" button is disabled during loading and enabled after completion

## Test 3: Match Row Layout
For each visible match row, verify:
- [ ] **Left column**: Score badge (coloured number), supplier name, category/subcategory badges, location with map pin icon, star rating (if available), verified badge (if applicable)
- [ ] **Right column**: "WHY THEY FIT YOUR COMPANY" heading, 2-3 sentence AI-generated rationale text, top factor tags at the bottom
- [ ] On mobile viewport (resize to <1024px): verify columns stack vertically (supplier info on top, rationale below)

## Test 4: Score Badge
- [ ] Scores ≥70 should show in green
- [ ] Scores 40-69 should show in amber
- [ ] Scores <40 should show in grey
- [ ] Hover over the score badge — verify a tooltip appears showing the top factors

## Test 5: Actions
- [ ] Click the heart icon on a supplier — verify it fills orange and shows "Saved supplier" toast
- [ ] Click the heart again — verify it unfills and shows "Removed from saved" toast
- [ ] Verify CTA buttons are context-aware:
  - Products category → "Get Quote"
  - Services category → "Book Consultation"
  - People category → "Message"
- [ ] Click "Export CSV" button — verify a CSV file downloads with the match data

## Test 6: Tier Gating (if on free tier)
- [ ] Verify only 5 match rows are visible
- [ ] Below the 5 rows, verify a blurred/locked section appears with "X more matches" heading
- [ ] Verify an "Upgrade" link appears pointing to /pricing
- [ ] Verify a summary banner shows "Showing 5 of X scored suppliers"

## Test 7: Near Misses
- [ ] After matching completes, verify a "Near Misses (X)" collapsible section appears
- [ ] Click to expand — verify it shows a list of lower-ranked suppliers with scores, names, subcategories, and brief reasons
- [ ] Click to collapse — verify it closes

## Test 8: Profile Incomplete Gate
To test this, you'd need an account without industry/stage set. If the test account has these fields:
- [ ] Verify matching proceeds normally (no "Complete your profile" gate)

If the test account is missing industry or stage:
- [ ] Verify a card appears: "Complete your profile to unlock matches"
- [ ] Verify missing fields are listed
- [ ] Verify a "Complete Profile" button links to /strategy

## Test 9: Error Recovery
- [ ] Click "Refresh Matches" while results are already showing — verify old results clear and new matching starts
- [ ] If matching fails (e.g. network issue), verify an error card appears with a "Retry" button

## Test 10: Rationale Quality
Read through 5+ rationales and assess:
- [ ] Do they reference specific supplier capabilities (not generic filler)?
- [ ] Do they connect supplier strengths to the company's actual needs?
- [ ] Do they mention certifications, materials, or processes when relevant?
- [ ] Are they 2-3 sentences (not too long, not too short)?

## Expected Issues & Notes
- The Soldado test account may not have Forge projects or coverage gaps set up — this means manufacturing fit and gap coverage scores will be 0, and weight redistribution will shift those points to industry alignment. The rationales should still be meaningful based on industry/stage.
- Matching 8,600+ suppliers takes time. Expect 30-90 seconds total (scoring is fast, but Haiku rationale generation runs in batches of 5).
- Pre-existing type errors in billing/onboarding files are unrelated to this feature.
