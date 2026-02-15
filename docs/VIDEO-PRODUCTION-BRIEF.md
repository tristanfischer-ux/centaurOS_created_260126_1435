# ForgeOS Video Production Brief

**Director:** Claude Opus  
**Tools:** MiniMax Video or Google Gemini Video  
**Output:** 8 product walkthrough videos (30-90s each, 1080p MP4)  
**Hosting:** Supabase Storage bucket `videos/walkthroughs/`

---

## Brand Guidelines

- **Primary Color:** International Orange (#FF4500) — used for CTAs, accents, active states
- **Secondary Color:** Electric Blue (#3B82F6) — used for info, links, secondary accents
- **Background:** Light, airy, white (#FFFFFF) with soft gray (#F8F9FA) surfaces
- **Typography:** Clean sans-serif, generous whitespace
- **Tone:** Professional but warm. Optimistic. Empowering. Never corporate-cold.
- **Music:** Upbeat, modern, minimal electronic. Think "Apple product launch" energy — not intense, not boring.
- **Pace:** Quick but clear. No lingering. Each scene 3-5 seconds max.
- **Transitions:** Smooth cross-fades or gentle zoom transitions. No hard cuts.

---

## Video 1: Platform Overview

**File:** `platform-overview.mp4`  
**Duration:** 60 seconds  
**Purpose:** First-time user orientation — "here's what ForgeOS does"

### Prompt

```
Create a 60-second product walkthrough video for ForgeOS, a modern SaaS platform for hardware startups.

VISUAL STYLE: Clean, bright, minimal UI screens on white background. International Orange (#FF4500) accent color. Smooth zoom and pan transitions between screens. Light ambient music.

SEQUENCE:
1. (0-5s) ForgeOS logo animation on white background. Text: "Your Command Center"
2. (5-12s) Dashboard overview — show a bright, airy web dashboard with sidebar navigation (orange active states), greeting card, metric tiles, and task list
3. (12-20s) Strategy view — golden "Company Purpose" card at top, three strategic pillar cards with health bars (green/amber/red), connected node graph below
4. (20-28s) Objectives — grid of objective cards with progress bars filling up, one card expanding to show linked tasks
5. (28-36s) Tasks — task list with status badges (green "Done", orange "In Progress", gray "Pending"), a task being checked off with satisfying animation
6. (36-44s) Team — grid of team member avatar cards with role badges (orange "Founder", lighter "Executive", neutral "Apprentice"), invite dialog appearing
7. (44-52s) The Forge — split screen: research panel on left, 3D CAD wireframe model rotating on right with dimension annotations
8. (52-58s) Marketplace — search bar, category pills, grid of verified supplier cards with star ratings
9. (58-60s) Closing: ForgeOS logo + tagline "Build at Software Speed"

NO narration needed. Text overlays on each scene describing the feature (clean white text with subtle shadow).
```

---

## Video 2: Creating Objectives

**File:** `creating-objectives.mp4`  
**Duration:** 45 seconds  
**Purpose:** Show how to create and manage strategic objectives

### Prompt

```
Create a 45-second product tutorial video showing how to create objectives in ForgeOS.

VISUAL STYLE: Clean SaaS interface, white background, International Orange (#FF4500) accents. Smooth cursor movements. Light upbeat music.

SEQUENCE:
1. (0-5s) Title card: "Creating Objectives" with Target icon in orange circle
2. (5-12s) Objectives page — grid of existing objective cards with progress bars. Orange "+ New Objective" button pulses gently
3. (12-22s) Click "New Objective" — wizard dialog slides in from center. Show 3-step stepper (dots: orange active, gray pending). Step 1: type "Launch MVP by Q2" into title field, character counter updating
4. (22-30s) Step 2: Add key results — "Ship beta to 10 users", "Zero critical bugs". Each appears as a card
5. (30-38s) Step 3: Review screen showing the complete objective. Click orange "Create" button
6. (38-43s) New objective card appears in the grid with 0% progress bar. Progress bar animates to 15% as tasks auto-link
7. (43-45s) Text overlay: "From idea to action in 30 seconds"

Simulate realistic mouse cursor movements. Text overlays describe each action.
```

---

## Video 3: Managing Tasks

**File:** `managing-tasks.mp4`  
**Duration:** 45 seconds  
**Purpose:** Show task creation, workflow, and completion

### Prompt

```
Create a 45-second product tutorial video showing task management in ForgeOS.

VISUAL STYLE: Clean, bright SaaS interface. International Orange accents. Smooth animations. Light music.

SEQUENCE:
1. (0-4s) Title card: "Managing Tasks" with CheckSquare icon
2. (4-10s) Task list view — rows with avatars, task titles, status badges (green "Done", orange "In Progress"), due dates. Orange accent bar on left side
3. (10-18s) Quick add: press "N" shortcut — minimal input appears at top. Type "Review quarterly report". Press Enter. Task slides into list
4. (18-26s) Task detail: click a task row — detail panel opens showing title, description, assignee avatar, due date calendar picker, linked objective
5. (26-33s) Status change: drag task from "In Progress" column to "Done" — satisfying completion animation with green checkmark
6. (33-40s) Filter: click "Assignee" filter — dropdown with team member avatars. Select one — list filters smoothly
7. (40-45s) "Today" badge — show task appearing in Today view with "Due Today" highlight. Text: "Stay on top of every task"

Show cursor interactions. Clean text overlays.
```

---

## Video 4: Building Your Team

**File:** `building-your-team.mp4`  
**Duration:** 45 seconds  
**Purpose:** Show team management and role assignment

### Prompt

```
Create a 45-second product tutorial video showing team management in ForgeOS.

VISUAL STYLE: Warm, bright interface. International Orange (#FF4500) for Founder badges, lighter orange for Executive, neutral gray for Apprentice. Smooth transitions.

SEQUENCE:
1. (0-4s) Title card: "Building Your Team" with Users icon
2. (4-12s) Team page — grid of member cards with circle avatars (initials in colored backgrounds), names, and role badges. Orange "Invite Member" button top right
3. (12-20s) Click "Invite" — dialog appears. Type email address into field. Select role from dropdown: "Founder" (dark orange), "Executive" (light orange), "Apprentice" (gray). Click orange "Send Invite"
4. (20-28s) Invite sent — confirmation toast slides in. Show the new member card appearing in the grid with a "Pending" badge that transitions to "Active"
5. (28-36s) Role hierarchy — visual diagram showing Founder → Executive → Apprentice with brief description of each. Clean icons and connecting lines
6. (36-42s) Capacity view — horizontal bar chart showing each member's task load. One bar highlighted in orange (overloaded), tooltip appears
7. (42-45s) Text overlay: "The right people. The right roles. The right speed."

Clean cursor movements. Warm, welcoming tone.
```

---

## Video 5: The Marketplace

**File:** `marketplace.mp4`  
**Duration:** 90 seconds  
**Purpose:** Show marketplace search, discovery, and booking

### Prompt

```
Create a 90-second product walkthrough video for the ForgeOS Marketplace.

VISUAL STYLE: Bright, professional. International Orange accents. Blue (#3B82F6) for verified badges. Star ratings in amber. Light energetic music.

SEQUENCE:
1. (0-5s) Title card: "The Marketplace" with Store icon
2. (5-15s) Marketplace landing — search bar with placeholder "What do you need?", category filter pills (Manufacturing, Design, Engineering, Consulting). Grid of listing cards below
3. (15-25s) Search: type "CNC machining aluminum" — results filter in real-time. Cards show company logos, star ratings, "Verified" badges with green checks, price ranges
4. (25-35s) Smart Search: click Sparkles icon — AI search panel opens. Type "I need someone to prototype a bracket mount in aluminum, under $500". AI matches appear with relevance scores
5. (35-45s) Listing detail: click a card — full listing page with company info, portfolio images, service description, pricing tiers, reviews with star ratings
6. (45-55s) RFQ flow: click "Request Quote" — form appears with project description, quantity, timeline. Click "Send RFQ"
7. (55-65s) Booking: on another listing, click "Book Consultation" — calendar picker appears, select time slot, confirm. Confirmation card with calendar event
8. (65-75s) Favorites: heart icon on cards — starred items appear in "My Stack" sidebar section
9. (75-85s) Orders: show Orders page with active bookings, status badges (green "Confirmed", blue "In Progress", orange "Pending")
10. (85-90s) Text overlay: "78+ manufacturing techniques. Verified specialists. One search."

Professional, marketplace feel. Show realistic supplier data.
```

---

## Video 6: The Forge & CAD Lab

**File:** `the-forge-cad-lab.mp4`  
**Duration:** 90 seconds  
**Purpose:** Show product development pipeline from concept to manufacturing

### Prompt

```
Create a 90-second product walkthrough video for The Forge and CAD Lab in ForgeOS.

VISUAL STYLE: Technical but accessible. Orange (#FF4500) for pipeline stages, blue gradient on 3D models. Clean engineering aesthetic with warm accents.

SEQUENCE:
1. (0-5s) Title card: "The Forge & CAD Lab" with Flame icon in orange
2. (5-15s) Product pipeline overview — horizontal progress bar with stages: Research → Decompose → Build → Review → Manufacture. First two stages show green checkmarks, Build is orange (active)
3. (15-25s) Research phase — left panel with source links and notes. Right panel with competitor analysis cards. AI assistant bubble suggesting "3 relevant patents found"
4. (25-35s) CAD Lab entrance — split view: left side shows component tree (bracket, housing, fastener nodes), right side shows 3D parametric model of a mechanical bracket
5. (35-50s) 3D model interaction — model rotates smoothly, dimension annotations appear (120mm width, 80mm height, 10mm holes). Exploded view shows internal features. Wireframe overlay toggles on/off
6. (50-60s) Parameter editing — sidebar slider adjusts "Wall Thickness" from 3mm to 5mm. Model updates in real-time. Stress map overlays showing blue (safe) to red (high stress)
7. (60-70s) Engineering dossier — document view with specs table, BOM (bill of materials) with part numbers, tolerance notes, material callouts (6061-T6 Aluminum)
8. (70-80s) Export — click "Export for Manufacturing" — STEP file download, PDF drawing generation, quote request auto-created in Marketplace
9. (80-88s) Connection to Marketplace — smooth transition showing the exported design linked to supplier quotes in the Marketplace
10. (88-90s) Text overlay: "From concept to manufacturing. One platform."

Show technical precision with warm, accessible design.
```

---

## Video 7: Strategy Dashboard

**File:** `strategy-dashboard.mp4`  
**Duration:** 45 seconds  
**Purpose:** Show strategic planning and alignment features

### Prompt

```
Create a 45-second product tutorial video showing the Strategy Dashboard in ForgeOS.

VISUAL STYLE: Executive-level feel. Golden amber for purpose card, orange for active elements, green/amber/red for health indicators. Clean, spacious layout.

SEQUENCE:
1. (0-4s) Title card: "Strategy Dashboard" with Waypoints icon
2. (4-12s) Strategy page — golden gradient "Company Purpose" card at top with compass icon and purpose statement. Three strategic pillar cards below
3. (12-20s) Pillar cards — "Market Expansion" (80% green health bar), "Product Innovation" (45% amber bar), "Operational Efficiency" (20% red bar). Each shows health dot
4. (20-28s) Strategy River — node-and-edge visualization showing objectives flowing from pillars. Nodes connected by lines. Hovering a node highlights its connections
5. (28-36s) Click "Define Purpose" — wizard modal opens. Conversational questions: "Why does your company exist?". Step progress with orange stepper dots
6. (36-42s) Health check — click a pillar card. Detailed view with leading indicators, trend chart, linked objectives with progress bars
7. (42-45s) Text overlay: "Align every action to your purpose"

Executive, strategic tone. Warm but authoritative.
```

---

## Video 8: Today — Daily Briefing

**File:** `today-daily-briefing.mp4`  
**Duration:** 45 seconds  
**Purpose:** Show the personalized daily command center

### Prompt

```
Create a 45-second product tutorial video showing the "Today" daily briefing page in ForgeOS.

VISUAL STYLE: Warm, morning energy. Orange-to-yellow gradient edges. Clean white background. Uplifting music.

SEQUENCE:
1. (0-4s) Title card: "Your Daily Briefing" with CalendarDays icon
2. (4-10s) Today page loads — warm greeting card: "Good morning, Tristan" with sun icon. Soft orange-yellow gradient border. Below: three sections appear
3. (10-18s) Focus Tasks — 3 priority items with checkboxes and color-coded urgency dots. One gets checked off — satisfying checkmark animation with task sliding up
4. (18-26s) At Risk — amber warning badges on 2 items ("Deadline tomorrow", "Blocked by dependency"). Click one — quick detail popup shows context
5. (26-32s) Quick Wins — small green-tagged items that take <15 minutes. Check one off — streak counter increments "7 day streak" with flame icon
6. (32-40s) Morning ritual — show the page refreshing at 6am with new content smoothly fading in. "Updated today at 6:00 AM" timestamp
7. (40-45s) Text overlay: "Start every day knowing exactly what matters"

Warm, motivating energy. Like a perfect morning routine.
```

---

## Upload Instructions

Once videos are generated:

1. Name files exactly as shown in the **File** field above
2. Upload to Supabase Storage:
   ```
   videos/walkthroughs/platform-overview.mp4
   videos/walkthroughs/creating-objectives.mp4
   videos/walkthroughs/managing-tasks.mp4
   videos/walkthroughs/building-your-team.mp4
   videos/walkthroughs/marketplace.mp4
   videos/walkthroughs/the-forge-cad-lab.mp4
   videos/walkthroughs/strategy-dashboard.mp4
   videos/walkthroughs/today-daily-briefing.mp4
   ```
3. The URLs are already wired into the code via `src/lib/video-urls.ts`
4. Once uploaded, videos will automatically appear in:
   - Help Center video library
   - Page-specific help dialogs (? shortcut)
   - Onboarding modal celebration step
   - Getting Started checklist "Watch overview" item

## Supabase Storage URL Pattern

```
https://jyarhvinengfyrwgtskq.supabase.co/storage/v1/object/public/videos/walkthroughs/{filename}.mp4
```
