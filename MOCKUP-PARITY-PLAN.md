# Mockup Parity Plan — 3-page validation set

**Purpose.** Validate the mockup-faithful build approach on three pages (Today V2, Workspace, Brief) before rolling the approach out to other terminals.

**The rule (non-negotiable).** The HTML mockup is the V1 spec. Translate DOM → React 1:1, section-by-section, top-to-bottom. Copy is matched. Structure is matched. Affordances are matched. Data slots (hardcoded strings like "HAPS UAV", "£172k", "11.4 months") are marked and wired to real sources. If a real source is missing, the section renders an **empty state that fills the same visual footprint** and names the surface that would populate it — never "coming soon" / "ships next round" / placeholder scaffold.

**Branch.** `feat/forge-v2-cutover` (HEAD `73043317`). `today-view.tsx` has uncommitted Chunk-C-style V3 changes that DO NOT match Today V2 — these get overwritten wholesale.

**Shell.** Sidebar is `src/components/sidebar/Sidebar.tsx`. The Forge pages nest inside `src/app/(platform)/the-forge-v2/_components/workspace-shell.tsx`. Both stay — pages change, shell doesn't.

**Feature flag.** `FLAG_NEW_FORGE_EXPERIENCE` in `src/lib/features/keys.ts`. While I'm iterating these 3 pages on preview, flag stays OFF for everyone else. Ship to production only after user signs off on all three.

---

## Page 1 — `/today` rebuild to match `FORGE-MOCKUP-TODAY-V2.html`

**File.** `src/app/(platform)/today/today-view.tsx` + `page.tsx` (fetches).

**Mockup section → production component → data source.**

| # | Mockup section | Component | Data source | Status |
|---|---|---|---|---|
| 1 | Greeting row (name, date/time, 3 chips) | `<TodayGreeting>` | `user.full_name`, `Date.now()`, derived signal counts | `full_name`, `new Date()` exist. Signal counts derived from: broke = overnight new blocking items from `getStrategyHealthSummary()` filtered by `severity=blocking + createdAt>yesterday`; overdue = `getMorningBriefing().priorities` filtered by `decay<0`; waiting = length of queued-decisions array (new, see row 3). |
| 2a | Priority / blocking card (LEFT of headline-grid) | `<PriorityCard>` | `getMorningBriefing()` → first item of `priorities` (highest consequence × shortest decay) | Exists at `nudges.ts:68`. Returns `{ greeting, priorities: [{ source, title, summary, actions[], groundingLine }] }`. **Gap:** briefing doesn't currently surface source-tag colour or 3 actions — I extend the type. |
| 2b | Cash runway card (RIGHT of headline-grid) | `<RunwayCard>` | `getFinanceDashboard()` at `actions/finance-dashboard.ts:82` | Exists. Returns `{ runwayMonths, monthlyBurn, totalCommitted, seriesTargetDate }`. Wire through. |
| 3 | Waiting on you card (3 queued decisions + count badge + "Send standup to team") | `<WaitingOnYouCard>` + `<WaitingItem>` | **NEW action: `getWaitingOnYou()` returns `QueuedDecision[]`** | **Data gap.** No action today. Composed from: specialist-flagged decisions pending founder input. For V1 I stand up `getWaitingOnYou()` that unions (a) `strategyHealth.blockingItems` where `requiresFounderDecision=true`, (b) `messaging` threads where `awaiting_user=true`, (c) RFQ promote/reject queue. Empty state: "Nothing waiting on you. Specialists queue decisions here when they need your input." + link to `/comms`. |
| 4a | Today queue (LEFT of mid-grid) — ranked list w/ source-tag filter tabs | `<TodayQueue>` + `<QueueFilterTabs>` + `<QueueRow>` | `getMyDailyPulse()` at `reports.ts:39` | Exists — returns daily items. **Gap:** current shape isn't source-tagged. I extend the returned item to include `source: 'forge'\|'money'\|'people'\|'compliance'\|'comms'` and a `decayDays` number (negative = overdue). Empty state per filter: "No Forge items today." / "No Money items today." etc. |
| 4b | Today's calendar (RIGHT of mid-grid) — 3 next events + tomorrow count | `<TodayCalendar>` + `<CalItem>` | `listUpcomingEvents()` at `google-calendar.ts:37` | Exists, wired in `use-cal-briefing.ts`. Wire same data through. Empty state: "No calls today. Connect Google Calendar →" when integration not connected; "Clear day — no meetings." when connected but empty. |
| 5 | 14-day risk horizon (SVG timeline) | `<RiskHorizon>` (client component, renders SVG from typed data) | **NEW action: `getRiskHorizon()` returns `{ anchorEvent, anchorDate, events: HorizonEvent[] }`** | **Data gap.** Composed from: `getAllMilestones()` at `canvas.ts:528` for anchor + `getStrategyHealthSummary()` items with dueDate within 14 days. For V1 I wire `getRiskHorizon()` that returns events colour-coded by source. If no anchor milestone set: empty state "Set your flight anchor in Strategy → " pointing at `/strategy`. |
| 6 | Your builds row (3 tiles — 2 active + 1 new-build) | `<BuildsRow>` + `<BuildTile>` | `listCadLabProjects()` at `cad-lab-projects.ts:170` | Exists. Returns projects with `name`, `subject`, `status`, `aiCostEstimates`, `hero_image_url`. Wire. Empty state on zero projects: "No builds yet. Start your first →" (large new-build tile takes the full row). |
| 7 | Operations footer strip (flat) | `<OperationsStrip>` | **NEW action: `getOperationsSummary()` returns `{ productsShipped, activeSuppliers, certExpiringIn30Days }`** | **Data gap.** Composed from: `operations` project state counts, suppliers table, certificate table. For V1 I wire `getOperationsSummary()` which returns zeros if tables empty; strip shows "Operations · 0 products shipped · 0 active suppliers · 0 cert expiries". |
| 8 | Team footer strip | `<TeamStrip>` | `getFoundryMembers()` at `canvas.ts:596` | Exists. Returns `{ id, full_name, role }[]`. Derive counts ("Daniel (CTO) · Priya (Ops) · 13 specialists on call"). Last-sync timestamp from `audit_log` latest row. |

**Removed from today-view.** "Cal Chief of Staff" greeting card, "You're all caught up" empty state, "4 sections at a glance" strip, "Team brief" collapsible, "Elsewhere in ForgeOS" strip, "Brief a specialist" strip, "Give AI Credits" banner, release-notice-banner, onboarding prompts. (None of those are in the V2 mockup.)

**Kept from current.** `page.tsx` wraps in `<Suspense>`; `<TodayGreeting>` reads `initialBriefing.greeting` to pick "Morning/Afternoon/Evening, {name}".

---

## Page 2 — `/the-forge-v2/projects/[id]` rebuild to match `FORGE-MOCKUP-WORKSPACE.html`

**File.** `src/app/(platform)/the-forge-v2/projects/[id]/page.tsx` (and `_components/`).

**Pre-existing.** `loadCadLabProject(id)` at `cad-lab-projects.ts:213` returns full project data including modules, revision, costs, reviews. WorkspaceShell handles breadcrumb + title — I REMOVE WorkspaceShell from this page and render breadcrumb/header inside the body, because the mockup shows a custom full-width project header (dot + name + subtitle + quick-stats + CTA stack) that WorkspaceShell doesn't match.

**Mockup section → production component → data source.**

| # | Mockup section | Component | Data source | Status |
|---|---|---|---|---|
| 1 | Breadcrumb (Today › HAPS UAV) | `<WorkspaceBreadcrumb>` | `project.name` | Exists. |
| 2 | Project header (dot + name + subtitle + 4 quick-stats + CTA stack) | `<ProjectHeader>` | `project.name`, `project.subject`, `moduleCount`, `partCount`, `project.designRevision`, `project.research.designBrief.{quantityTarget,markets,regulatoryFlags,startedAt}` | **Partial gap.** `markets` and `regulatoryFlags` aren't in current `CadLabDesignBrief` type. Either extend type + capture in brief editor, OR derive regulatoryFlags from compliance engine. For V1 I extend `CadLabDesignBrief` to include `markets: string[]` and `regulatoryFlags: string[]` — filled in the Brief (page 3) and surfaced here. Empty state: "Markets not declared · open Brief →" as a placeholder stat. |
| 3 | Resumed state card ("Where you left off · 2 hours ago") | `<ResumedCard>` | **NEW: `getResumeState(projectId)` returns `{ lastSurface, lastSurfaceHref, blockingItem, grounding }`** | **Data gap.** Derived from (a) `audit_log` latest row scoped to project, (b) top item in `getStrategyHealthSummary({ projectId })` where `severity=blocking`. Empty state (no blocking item): card swaps to green "You're on track — no open blockers on this project." with CTA "Open BOM →". If no `last_viewed_at` recorded: "Welcome back. Start with Brief →". |
| 4 | Health strip (4 cards: What will bite / Who's on the hook / Cost at this BOM / BOM maturity) | `<HealthStrip>` + `<HealthCard>` | Composed: `risks.count by severity`, `suppliers.count by state`, `aiCostEstimates.totalUnitCost + project.research.designBrief.unitCostCeiling`, `parts.count spec'd vs total` | Exists in pieces. Costs and BOM maturity derivable from `loadCadLabProject()` now. Risks + suppliers need `getProjectRiskSummary(projectId)` and `getProjectSupplierSummary(projectId)` — **new thin actions wrapping existing tables**. Colour (red/amber/green top bar) driven by threshold rules documented in the component. |
| 5 | System illustration (dark card, 2 panes: Nano Banana render + System blueprint SVG) | `<SystemIllustration>` | Pane 1: `project.productOverview` image from `public/cad-lab/hero.png` equivalent (`project.heroImageUrl`). Pane 2: **hardcoded SVG per mockup for V1** — this is a static engineering drawing, not generated data. | Pane 1 exists. Pane 2 is the 500×300 SVG from the mockup — **I lift the SVG verbatim into a `<SystemBlueprintSvg>` component**. It's project-specific for HAPS but acts as a legit V1 — future work generates this SVG per project. Legend (CFRP / Solar cells / Al-7075) comes from `project.materials` if we have it, hardcoded if not. **Flag for user:** do you want the blueprint SVG lifted verbatim as "the HAPS example" for V1, or do you want every project to get its own blueprint (much bigger scope)? |
| 6 | Define cluster (3 artefact cards: Brief / Modules / BOM) | `<ArtefactGrid cluster="define">` + `<ArtefactCard>` | Each card: state colour (green/amber/red/grey), badge, body-line, chips — computed from `project.research.designBrief`, `project.modules`, `project.keyParts` | Data exists. State mapping rules: Brief = green if `designBrief.completeFields === 10/10`; Modules = green if all modules stable; BOM = amber if spec'd < total parts. |
| 7 | Deliver cluster (3 artefact cards: Suppliers / Cost / Risks) | same | `getProjectSupplierSummary()`, `project.aiCostEstimates`, `getProjectRiskSummary()` | Same new thin-action pattern as health strip. |
| 8 | Support cluster (3 artefact cards: Experts / Geometry / Launch Checklist) | same | `getProjectExpertEngagements(projectId)` (NEW — thin), `project.modules[].renders`, launch = `grey` / static "awaits 1st award" | Experts action doesn't exist but retainer/engagement data does in `specialist_engagements` table. Launch checklist is grey-state until first batch awarded — static text matches mockup. |
| 9 | Engineering Intelligence (20 materials + 82 hardware + 20 processes + 10 supplier techniques, 3-row previews per) | `<EngineeringIntelligence>` + section components | **NEW action: `getEngineeringLibrarySummary()` returns counts + top-3 of each** | **Data gap.** Likely lives in `engineering_library` / `materials` / `processes` tables or is seeded static. Need to verify if these tables exist. If they don't, I seed them from the mockup's contents (20 materials, 82 hardware, 20 processes, 10 techniques) as canonical reference data — this is the ForgeOS engineering library Tristan's already talked about. Empty state (if tables exist but empty): "Library not yet seeded — admin action required." |
| 10 | Known Challenges (58 items, 2-col: Failure Modes / Open Questions, filter-by-module affordance) | `<KnownChallenges>` + `<FilterByModule>` | Aggregated from `project.modules[].known_failure_modes` + `project.modules[].open_questions` | Exists in module data (cad-lab module payload has these fields). Composed into a flat list, linked back to module. |
| 11 | Activity timeline (7 recent items) | `<ActivityTimeline>` | `getProjectActivityFeed(projectId, { limit: 7 })` (NEW — thin wrapper over `audit_log`) | audit_log has the data; thin action joins with profile avatars. Empty state: "No activity yet on this project." |
| 12 | Phase tabs (fixed bottom: Design/Specify/Source/Assemble + TF avatar pill) | `<PhaseTabsFixed>` | Static tabs + active based on current artefact context; avatar from `user.full_name` | Fully local state + user avatar. |

---

## Page 3 — `/the-forge-v2/projects/[id]/brief` rebuild to match `FORGE-MOCKUP-BRIEF.html`

**File.** `src/app/(platform)/the-forge-v2/projects/[id]/brief/page.tsx` + `_components/`.

**Pre-existing.** `BriefEditor` client component with a textarea for `productOverview` + readonly design-brief fields. This is WRONG for V1 — the mockup shows a **locked read-only spec** with edit behind "Edit (new revision)", NOT an inline editor. I rewrite.

**Mockup section → production component → data source.**

| # | Mockup section | Component | Data source | Status |
|---|---|---|---|---|
| 1 | Breadcrumb (Today › HAPS UAV › Brief) | `<WorkspaceBreadcrumb>` | `project.name` | Exists. |
| 2 | Page header (icon + "Brief" + "Complete · locked" chip + subtitle + 3 CTAs) | `<BriefPageHeader>` | `project.briefLockedAt`, `project.briefFieldsFilled / 10` | **Gap.** No `briefLockedAt` / `briefFieldsFilled` today — previous session explicitly deferred the migration. I add `brief_locked_at timestamptz` + `brief_fields_filled smallint` columns to `cad_lab_projects` and a `lockBrief` / `forkBrief` action pair. CTAs: "Share with investor" → opens `/the-forge-v2/projects/[id]/export`; "Edit (new revision)" → opens `/fork`; "Export PDF" → export action. |
| 3 | Brief dual-pane hero (Nano Banana render LEFT + Mission envelope SVG RIGHT) | `<BriefHero>` | Left pane: `project.heroImageUrl`. Right pane: **mission envelope SVG computed from brief mission params** (altitude target, endurance target, payload). | Hero image exists. Mission envelope: for V1 I render the SVG **from brief data** (altitude/endurance/payload → plotted target point on the envelope curve). If mission params missing from brief: "Mission envelope appears once altitude + endurance are set in Brief" empty state. |
| 4 | Locked banner ("Revision A locked · 2026-04-02 · 14 supplier RFQs cite this revision") | `<BriefLockedBanner>` | `project.briefLockedAt`, `project.designRevision`, `countRfqsCitingRevision(projectId, revisionId)` | Lock timestamp = new column. RFQ count derivable from existing `rfqs` table. Empty state: hidden if brief unlocked (in-draft state — different banner: "Draft · unlocked"). |
| 5a | Mission card LEFT (5 fields: Product / Mission / Target customers / Why now / Constraints declared) | `<BriefMissionCard>` | `project.research.designBrief.{useCase,mission,targetCustomers,whyNow}` + constraints: `{unitCostCeiling, firstShipDate, maxMass, batchSize, markets, productionRegion}` | Design-brief type has `useCase`, `targetProcess`, `targetMaterial`, `toleranceTarget`, `quantityTarget`, `complianceNotes` today — **schema mismatch with mockup**. The mockup's fields are narrative (Mission, Target customers, Why now) plus structured constraints. **Decision required:** extend `CadLabDesignBrief` to add `mission: string`, `targetCustomers: string`, `whyNow: string`, `constraints: { unitCostCeiling, firstShipDate, maxMassKg, batchSize, markets, productionRegion }`. This adds fields to every new project — and every existing project will have empty values, which the page renders as empty states ("Mission not yet declared · edit Brief →"). |
| 5b | Sidebar stack RIGHT — Regulatory posture (6 items with status icons) | `<RegulatoryPostureCard>` | `project.research.designBrief.regulatory: RegulatoryItem[]` | **New field.** `RegulatoryItem = { code: 'AS9100D'\|'EASA Part 21'\|..., status: 'met'\|'in-progress'\|'not-started', note: string }`. For V1 the 6 items from the mockup are the **default seeded list** for aerospace projects; user edits in the Brief fork flow. Empty state (not seeded): "Regulatory posture not yet declared". |
| 5c | Sidebar stack RIGHT — All-in cost vs ceiling (£172k / £150k, 115% of ceiling) | `<CostVsCeilingCard>` | `project.aiCostEstimates.totalUnitCost` + `designBrief.constraints.unitCostCeiling` | Cost exists; ceiling is new (see 5a). Bar is a computed gradient. |
| 5d | Sidebar stack RIGHT — Mass budget (68.17 / 68.00 kg MTOW, 0.17 kg over, "See module breakdown →") | `<MassBudgetCard>` | Sum of `project.modules[].estimatedMassKg` + `designBrief.constraints.maxMassKg` | Mass sums exist in module data. Max mass is new. Link to `/modules` for breakdown. |
| 6 | Revision history (4 revisions with dots — current + 3 prior drafts) | `<RevisionHistoryCard>` + `<RevisionRow>` | **NEW action: `listBriefRevisions(projectId)` reads new `brief_revisions` table** | **Data gap.** No revision-history table today — `designRevision` is a single version number. I add `brief_revisions (id, project_id, revision_label, locked_at, locked_by, changelog, rfqs_count, created_at)` table. For existing projects with no history, empty state: "No prior revisions — this is revision A." |
| 7 | Design grounded in (3 pills: Mission-envelope calculators / Regulatory library / Material cost index + footnote) | `<GroundedInPills>` | Static for V1 — these are ForgeOS library references, not project data | Static OK. |

---

## Data gaps — summary

**New actions to write (all thin wrappers, most over existing tables):**
1. `getWaitingOnYou()` — unions blocking strategy items + awaiting messages + RFQ queue.
2. `getRiskHorizon()` — milestones + strategy health items within 14-day window, colour-coded.
3. `getOperationsSummary()` — product/supplier/cert counts.
4. `getProjectRiskSummary(projectId)`, `getProjectSupplierSummary(projectId)`, `getProjectExpertEngagements(projectId)`, `getProjectActivityFeed(projectId)` — per-project thin wrappers.
5. `getResumeState(projectId)` — last-viewed + top blocker.
6. `getEngineeringLibrarySummary()` — engineering-library aggregate; seeds from mockup constants if empty.
7. `lockBrief(projectId)`, `forkBrief(projectId)`, `listBriefRevisions(projectId)`.

**New migrations:**
- `cad_lab_projects.brief_locked_at timestamptz`, `cad_lab_projects.brief_fields_filled smallint`.
- `brief_revisions` table.
- `CadLabDesignBrief` type extended (`mission`, `targetCustomers`, `whyNow`, `markets`, `regulatoryFlags`, `constraints { unitCostCeiling, firstShipDate, maxMassKg, batchSize, markets, productionRegion }`, `regulatory: RegulatoryItem[]`).
- Possibly `engineering_materials`, `engineering_processes`, `engineering_hardware`, `supplier_techniques` tables if they don't exist — or seed constants.

**Empty-state policy.** Where real data doesn't yet exist for an existing project, the section renders an **empty state that fills the same visual footprint as the populated version** (same card, same height, same borders — just copy swapped + a "populate in X →" link). This avoids the scaffold failure mode: the layout doesn't collapse or disappear when data is missing, it simply prompts the user to fill it.

---

## Build order + commit cadence

1. **Migrations + type extensions** — one commit. Push, regen types, verify tsc.
2. **New actions** — one commit per surface area (Today actions / Workspace actions / Brief actions). Push.
3. **Page 1 (Today)** — one commit. Push. **Parity gate against `FORGE-MOCKUP-TODAY-V2.html`.** Fix diffs before moving on.
4. **Page 2 (Workspace)** — one commit. Push. **Parity gate against `FORGE-MOCKUP-WORKSPACE.html`.** Fix diffs.
5. **Page 3 (Brief)** — one commit. Push. **Parity gate against `FORGE-MOCKUP-BRIEF.html`.** Fix diffs.
6. **Handover note** — tick each page in this plan with `Mockup parity: ✓` and paste screenshot paths. User reviews preview URLs, signs off.

---

## Parity gate protocol (non-negotiable before any ✓)

For each page:

```
agent-browser close --all
agent-browser open file:///Users/tristanfischer/Developer/CentaurOS\ created\ 260126\ 1435/FORGE-MOCKUP-TODAY-V2.html --headless --viewport 1440x900
agent-browser screenshot /tmp/today-mockup.png
~/.claude/scripts/forgeos-login.sh /today   # authenticates + navigates preview
agent-browser screenshot /tmp/today-prod.png
```

Read both screenshots. Section-by-section diff — I log the result in this document as `Mockup parity: ✓` or `Mockup parity: ⚠ <list of diffs>`. `⚠` entries get fixed in the same session before the next page starts.

---

## Questions for user before I start writing code

1. **System blueprint SVG (Workspace, section 5).** Mockup's HAPS plan-view SVG is project-specific artwork. Options: (a) lift it verbatim as a "HAPS example" and mark every other project's blueprint as empty-state until per-project blueprint generation lands — simplest, mockup-faithful for the one demo project; (b) scope per-project SVG generation into this round — much bigger. **My recommendation: (a).**

2. **Engineering Intelligence (Workspace, section 9).** The 20/82/20/10 library counts — do we have these tables seeded anywhere, or is this the first time the engineering library surfaces? If the library is a fresh seed, I'll add it as part of the migration work with the exact counts from the mockup.

3. **Regulatory posture default seed (Brief, section 5b).** Mockup shows 6 items (AS9100D, EASA Part 21, UKCA DO-160G, ITAR/EAR99, DO-178C, UN38.3) as the canonical aerospace set. Confirm: aerospace projects get this as default, non-aerospace get an empty "Declare regulatory scope →" state?

4. **Flag rollout.** While iterating these 3 pages, `FLAG_NEW_FORGE_EXPERIENCE` stays OFF for everyone. Only preview URLs visible. Flip to ON only after user signs off all 3. Confirm.

Once answered, I start with the migrations commit.
