# ForgeOS Master Test Prompt — Consolidated E2E
**Target:** https://fractionalforge.app
**Date:** March 29, 2026

## Accounts
- **Tristan:** tristan.fischer@gmail.com (Google OAuth) — Forge Guild workspace
- **Soldado:** mark@soldado.uk / Soldado2026! — Soldado workspace
- **Logged-out:** Incognito/public pages

---

## PART 1: PUBLIC PAGES (Logged Out)

### 1.1 Homepage Hero & CTAs
1. Navigate to https://fractionalforge.app (public landing page)
2. Verify hero section loads with headline and CTA buttons
3. CTAs should say "Start Free" or "Get Started Free" (NOT "Start Free Trial")
4. Screenshot hero section

### 1.2 Founding Member Counter
1. Look for founding member counter: "X of 100 founding spots claimed"
2. Number should be ~28 (NOT 90+)
3. Screenshot the counter

### 1.3 Product Showcase (Tabbed Screenshots)
1. Scroll to "See ForgeOS" section
2. Verify 7 tabs: The Forge, Source, Specialists, Dashboard, Cash Burn, Strategy, Investors
3. Click through each tab — each should show a screenshot in browser frame mockup
4. Active tab highlighted in orange, no broken images
5. Screenshot tab strip

### 1.4 Screenshot Quality
1. "The Forge" tab: module cards with isometric CAD illustrations
2. "Source" tab: Sankey diagram with colourful curved lines
3. "Cash Burn" tab: cumulative balance chart, scenario controls, weekly cash flow bars
4. "Specialists" tab: team huddle meeting dialog

### 1.5 Meeting Flow Section
1. Find "Meetings that produce real deliverables" section
2. Verify 3 steps in horizontal row: Run the meeting, We extract the output, Ready to execute
3. Each step: numbered orange circle, title, browser-frame screenshot, description
4. Connecting arrows between steps on desktop
5. Screenshot

### 1.6 Pricing Page
1. Navigate to /pricing
2. Verify plan cards: Free, Startup Team, Scale-Up, Enterprise
3. Free plan: "Start Free" button (NOT "Start Free Trial")
4. Paid plans: correct pricing, feature lists
5. No "AI-powered" or "AI" emphasis language
6. Screenshot

### 1.7 Preview Landing Page
1. Navigate to /preview-landing (or linked from homepage)
2. Page should load without errors
3. Screenshot

### 1.8 Cross-Page Consistency
1. Check that footer links work (pricing, about, etc.)
2. No broken links on homepage

### 1.9 Auth Guard
1. Try navigating to /recruits or /today without being logged in
2. Should redirect to login
3. PASS: No unauthenticated access to platform pages

### 1.10 Mobile Responsiveness
1. Resize browser to ~375px width
2. Tab strip scrollable horizontally
3. Meeting flow stacks vertically
4. Resize back to desktop

---

## PART 2: LOGGED-IN TESTS (Tristan Account)

### 2.1 Login
1. Navigate to /login, sign in with Google OAuth (tristan.fischer@gmail.com)
2. Should land on /today
3. Sidebar should show company name (NOT "Personal Workspace")
4. No sandbox banner visible

### 2.2 Today Page — Cal Briefing
1. Find Cal, Chief of Staff card with hero briefing
2. Briefing should be personalized (2-4 sentences, specific, actionable — not just "Welcome back")
3. Should reference strategy pillars or coach toward creating them
4. Greeting ("Good morning, Tristan") above Cal's text — NO duplicate greeting in Cal's text
5. "Reply to Cal" chip below briefing — click it, advisor panel should open with Cal
6. Close advisor panel
7. Refresh icon near streak badge — click it, briefing should reload
8. Screenshot

### 2.3 Today Page — Other Elements
1. Getting Started checklist (if visible): shows progress X/6
2. Strategy section: strategy pillars with progress bars
3. Referral banner: "Give AI Credits, Get AI Credits" with founding member badge
4. Screenshot

### 2.4 Team Page — Orbit Chart Tooltips
1. Navigate to /team
2. Hover over nodes in orbit chart — dark tooltip with person's name
3. CRITICAL: Tooltip must appear ABOVE all other nodes, never hidden behind adjacent circles
4. Test edge nodes (top, bottom, left, right) — tooltips not clipped by container
5. Screenshot

### 2.5 Recruits Page — Smart Matching
1. Navigate to /recruits
2. Two tabs: "For You" and "Browse All" — "For You" default active
3. Auto-matching should start streaming: "Analysing your team needs...", then match cards
4. Match cards: LEFT (who) + RIGHT (why) two-column layout
5. Personalized rationale explaining why this person fits YOUR company
6. "View Profile" link works
7. "Discuss with Harper" opens advisor panel with Harper
8. Switch to "Browse All" tab — standard marketplace browse with AI Talent Finder search
9. Switch back to "For You" — results persist (no re-streaming)
10. Screenshot

### 2.6 Harper Briefing on Recruits
1. Top of /recruits: Harper specialist briefing hero card
2. Harper provides hiring context about team gaps
3. Screenshot

### 2.7 Specialists Page
1. Navigate to /specialists
2. Open chat with Finn (Finance Lead): "What should I focus on financially this quarter?"
3. Open chat with Sage (Strategist): "What's our biggest strategic risk?"
4. Open chat with Sal (Sales Lead): "How should we approach our first 10 customers?"
5. Each should respond with noticeably different voice/style (DeepSeek, Gemini, OpenAI)
6. Screenshot each

### 2.8 Red Team Debate
1. Navigate to /red-team
2. Empty state: should NOT say "AI models" — should say "multi-perspective debate" or similar
3. Start a new debate: enter a strategic question, click Start
4. Verify 5 personas stream in sequence (BULL, BEAR, REALIST, DISRUPTOR, WILDCARD)
5. Each argument streams character by character
6. After Round 1 completes, fact-check badges should appear
7. Previous debates should load from history on page refresh
8. No debug text like "*[Character running on fallback model]*"
9. Screenshot during streaming and after completion

### 2.9 Investor Matching
1. Navigate to /investors (or investor matching page)
2. Matching should auto-start with SSE streaming
3. Score badges: green (>=70), amber (40-69), grey (<40)
4. Match cards with personalized rationales
5. No auth errors in console
6. Tier gating if on free tier (5 matches visible, upgrade CTA)
7. Screenshot

### 2.10 Visual Verification Checks
1. CTO banner: Should show "Fractional CTO" title (not "AI CTO")
2. Browse header: marketplace header should be clean, no "AI" emphasis
3. Sidebar: Pricing link should work from sidebar if present

---

## PART 3: SUPPLIER MATCHING (Soldado Account)

### 3.1 Login
1. Navigate to /login
2. Log in: mark@soldado.uk / Soldado2026!
3. Confirm dashboard loads

### 3.2 Navigate to Marketplace
1. Go to /marketplace (or Marketplace in sidebar)
2. Two tabs: "For You" (sparkle icon) + "Browse All" (grid icon)
3. "For You" default active (underlined orange)

### 3.3 Matching Flow
1. Auto-matching starts on page load
2. Progress: "Scoring suppliers...", "Generating insights...", batched streaming
3. Match rows stream in progressively (batches of 5)
4. Wait for completion (30-90 seconds)
5. Screenshot

### 3.4 Match Row Layout
1. LEFT: score badge, supplier name, category/subcategory badges, location, rating, verified badge, action buttons
2. RIGHT: "WHY THEY FIT YOUR COMPANY", 2-3 sentence AI rationale, top factor tags
3. Screenshot close-up

### 3.5 Score Badge Colors
1. >=70 green, 40-69 amber, <40 grey
2. Hover tooltip: "Match Score: X/100" with bullet points
3. Screenshot tooltip

### 3.6 Rationale Quality
1. Read 5+ rationales — should mention specific capabilities (CNC, ISO, etc.)
2. Should connect to company's actual profile
3. 2-3 sentences, not generic/repetitive

### 3.7 Actions
1. Heart icon: click to save (fills orange, toast "Saved supplier" for 3 seconds)
2. Click again to unsave (unfills, toast "Removed from saved")
3. CTA buttons: "Get Quote" (Products) or "Book Consultation" (Services)

### 3.8 Tier Gating
1. If free tier: only 5 match rows, blurred/locked section below, upgrade CTA
2. If paid: more than 5 visible

### 3.9 Near Misses
1. After matching: "Near Misses (X)" collapsible card
2. Expand: score, supplier name, subcategory, brief reason explaining WHY ranked lower
3. Reasons should mention weaknesses (e.g., "No industry overlap", "Missing certifications")
4. NOT strengths

### 3.10 Browse All Tab
1. Click "Browse All" — standard marketplace loads
2. Search bar, category filters, sort controls, grid cards
3. Click back to "For You" — results still there (not re-fetched)

### 3.11 Refresh Matches
1. Click "Refresh Matches" button
2. Old results clear, new matching starts
3. Button shows spinner, disabled during loading

---

## Report Template
After all tests, produce structured results with PASS/FAIL for each test, screenshots, and issues found.
