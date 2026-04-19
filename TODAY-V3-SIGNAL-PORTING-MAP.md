# Today V3 — Signal Porting Map

> **Purpose:** Driving document for the Today V3 rebuild. The next Claude agent
> uses this map to refactor `src/app/(platform)/today/today-view.tsx` (1,636 lines)
> into the V3 frame in `FORGE-MOCKUP-TODAY-V3.html` (945 lines) without losing
> any signal currently visible on `/today`.
>
> **Guiding rule (Tristan):** *"Today V3 is a reskin-plus-frame, not a reset.
> Port existing Today signals into V3 panel slots."* No signal may be silently
> dropped. Every signal below carries a MUST / NICE / DROP-WITH-APPROVAL tag.
>
> **Absolute paths** (never relative, per working rules):
> - Current page: `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/app/(platform)/today/today-view.tsx`
> - V3 mockup:    `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/FORGE-MOCKUP-TODAY-V3.html`
> - Page entry:   `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/app/(platform)/today/page.tsx`
> - Cal hook:     `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/app/(platform)/today/use-cal-briefing.ts`
> - Forge feed:   `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/hooks/useTodayForgeFeed.ts`
> - Signal types: `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/types/today.ts`

---

## 1. Inventory — Current `today-view.tsx` surfaces

Enumerated by render order, with line ranges (today-view.tsx 1,636 lines).

| # | Surface | Lines | Gate | Feeding data |
|---|---|---|---|---|
| C0 | `PageHeader` — orange accent bar + "Today" h1 | 488, 1020-1029 | always | static |
| C1 | `FractionalExecPromoCard` (Phase-5 retro opt-in) | 492 (also 328 in error branch) | `showFractionalExecPrompt` prop | props |
| C2 | Cal hero card — avatar + greeting + narrative + `AskSpecialistButton` + `StreakBadge` + refresh | 494-710 | always; narrative has 3-stage fallback (Cal > briefing.narrative > briefing.greeting) | `briefing`, `calNarrative`, `calInput`, `isCalLoading`, `refreshBriefing` |
| C2a | 5-stat strip inside hero (`AnimatedStatCard` x4 + `TodayTimeCard`) — Completed / Due today / Overdue / Team completed + Today's Time | 586-620 | `pulseData?.personal` truthy | `pulse.data.personal`, `pulse.data.team`, `pulse.data.trends` |
| C2b | Smart Nudges list (strip inside hero) — bullet + message + optional action | 622-668 | `briefing.nudges.length > 0 || unreadCount > 0` | `briefing.nudges[]`, `unreadCount` |
| C2c | Unread-messages nudge (appended inside C2b strip) | 652-666 | `unreadCount > 0` | `unreadCount` |
| C2d | Intelligence Signal footer (days of data · best day · velocity %) | 671-690 | `briefing.intelligenceDaysOfData > 7` | `briefing.intelligenceDaysOfData`, `briefing.bestProductivityDay`, `briefing.velocityTrend` |
| C2e | Partial-data warning + retry row | 693-707 | `pulseError && !briefingError` | error state, `loadData` |
| C3 | Cal's urgency-triaged insights feed (`SpecialistInsightCard` list) | 713-730 | `calInsights.length > 0` | `calInsights[]` from `useCalBriefing` |
| C4 | `GettingStartedHero` (onboarding checklist) | 733-735 | `initialOnboardingData` truthy | `initialOnboardingData`, `onShareReferral` |
| C5 | Sandbox Welcome Banner — 2-path card (Create Company / Fractional Exec) | 738-782 | `_isSandbox && !sandboxBannerDismissed` | `initialOnboardingData._isSandbox`, `isMigratedUser`, `sandboxBannerDismissed` |
| C6 | `ReferralNudgeBanner` | 785 | component decides internally | `getMyReferralInfo()` inside component |
| C7 | `FocusTasksSection` — "Focus Today" list + 2 empty states (all-clear / overdue-only) | 788-798, 1164-1281 | always | `briefing.topTasks[]`, `briefing.overdueCount` |
| C8 | Unread Messages section (standalone below hero) | 800-834 | `unreadCount > 0` | `unreadCount` |
| C9 | `BlockersSection` — "Blockers" list (severity badge) | 837-845, 1283-1323 | `pulseData.blockers.length > 0` | `pulseData.blockers[]` |
| C10 | `PendingApprovalsSection` — "Awaiting Your Review" list | 848-856, 1325-1363 | `pulseData.pending_approvals.length > 0` | `pulseData.pending_approvals[]` |
| C11 | `AtRiskObjectivesSection` — "At Risk" list + on-track empty state | 859-865, 1365-1434 | always | `briefing.atRiskObjectives[]` |
| C12 | `StrategySpotlightSection` — pillar dots + progress bars + overdue count | 868-876, 1436-1541 | `strategyHealth.length > 0` | `strategyHealth[]` from `getStrategyHealthSummary` |
| C13 | "Your Team" — proactive insights block: `WeeklyBrief` + `InsightFeed` | 879-893 | always | internal to both components |
| C14 | `InsightsSection` — daily-pulse insights w/ celebration/warning/suggestion styling | 896-902, 1543-1609 | `pulse.insights.length > 0` (else empty-state) | `pulse.insights[]` |
| C15 | "Brief Your Team" card — 3 `AskSpecialistButton` chips (Cal / Sage / Choose) | 905-959 | always | `pulse.data` blockers/approvals counts for notes |
| C16 | Quick Actions footer — 4 link buttons (Tasks / Objectives / Strategy / Plan) | 962-992 | always | static |
| C17 | `PageTour` — onboarding guided tour, conditional on hero visibility | 998-1010 | `dismissed || completed>=3` | `initialOnboardingData` |
| C18 | `CreateCompanyDialog` (modal, sandbox path A) | 379 (in error branch) & implicitly in sandbox card state | `showCreateCompany` state | — |
| C19 | `TodayViewSkeleton` — full-page skeleton during refresh/manual reload | 1040-1089 | `isLoading` | — |
| C20 | Error-branch "welcome" view — role-aware hero (Executive / Apprentice / default) + retry button | 320-472 | `bothFailed` (`briefingError && pulseError`) | `initialOnboardingData._userRole`, `loadData` |

### Cross-cutting signals / behaviours (not discrete surfaces)

- **Celebration effects** (lines 241-262): streak milestones (3/7/14/30) fire `celebrateStreak`; "all clear" (no tasks + no overdue) fires confetti. Hooks only, no render.
- **Screen-context registration** (lines 214-237): writes page summary + pillar entities into `useRegisterScreenContext` for AdvisorPanel. Hook only.
- **`handleShareReferral`** (lines 196-211): clipboard copy + checklist mark — passed to `GettingStartedHero`.
- **`handleDiscussInsight`** (lines 308-310): `useAdvisorPanel().openPanel(specialistId, {...})` — passed to `SpecialistInsightCard`.

---

## 2. Inventory — `FORGE-MOCKUP-TODAY-V3.html` sections

Enumerated in render order (mockup is 945 lines).

| # | Section (V3 slot) | Mockup lines | Purpose |
|---|---|---|---|
| V0 | Annotation note (dev-only) — meta explainer | 409-412 | not built in React |
| V1 | Greeting h1 — "Morning, Tristan" | 414-415 | time-aware greeting |
| V2 | `.greeting-sub` chips row — date/time + danger/warning/info counts ("1 broke overnight", "2 overdue", "3 waiting on you") | 416-421 | at-a-glance day state |
| V3 | `.headline-grid` — 2-col: Priority slab (left, 2.2fr) + Runway card (right, 1fr) | 424-463 | top-of-page hero split |
| V3a | Priority slab — kicker ("Blocking — #1 today") + source tag + headline + body + action buttons + grounding-line | 427-442 | *source-agnostic* hero decision |
| V3b | Runway card — Money-cited runway (months/bar/mini-stats: burn, verbal committed) | 445-461 | Money deep-link pulse |
| V4 | `.minigrid` — 3 tiles (Forge cost, Money pipeline, Plan tasks) | 466-495 | three-terminal pulse |
| V5 | `.waiting-card` — "Waiting on you" inbox, 5 rows (Jian/Chase/Fiona/Sage/Priya), Approve/Ask/Reject buttons, "Send standup" top-right nudge | 502-580 | the *why-you-open-the-app* surface |
| V6 | `.mid-grid` — 2-col: ranked Queue card (1.7fr) + Calendar peek (1fr) | 587-717 | decay-ordered triage + today's calls |
| V6a | Queue card — title ("Today · 7 items"), filters (All/Forge/Products/Plan/Money/Compliance), view-toggle (By decay / By section), 7 rows with rank/label/source-tag/decay/go-btn | 590-679 | source-mixed triage queue |
| V6b | Calendar peek — 3 cal-items (now/upcoming), cal-tag per source, "Tomorrow: 3 calls · 1 review" footer | 682-715 | today's calendar |
| V7 | `.horizon-card` — 14-day risk horizon SVG (forward-looking, anchored to first-flight milestone, events coloured by source, legend) | 724-835 | physical-consequence-time view |
| V8 | Section label "Where you stand · 4 sections at a glance" | 842-845 | heading |
| V9 | `.signals-strip` — 4 flat cards (Forge / Products / Money / Plan) with KPI + tag | 847-897 | gateway cards |
| V10 | `.app-signals` — footer pill row (Comms unread / Time hours / Review items / Knowledge digest) | 904-920 | un-redesigned-surface counts |
| V11 | Change-log annotations | 927-940 | not built in React |

### V3 surfaces NOT present in mockup (already implicit in app shell)

- Sidebar (`.sidebar`, 336-404) — owned by `src/app/(platform)/layout.tsx`, NOT re-rendered in today-view. **Ignore.**
- `WelcomeBackBanner` — sits in platform layout (`src/app/(platform)/layout.tsx`), NOT in today-view, so not in mockup body either. **Ignore at page level; confirm layout still mounts it.**

---

## 3. Per-signal porting decision table

**Column key:**
- **V3 slot** — target section from §2 (V1-V10).
- **Priority** — MUST = no V3 ship without it · NICE = would be lovely · DROP? = propose dropping, flag for explicit Tristan approval before removing.
- **Porting notes** — concrete mechanic: straight port / reformat / merge / stub / defer.

| # | Current signal | Data source | V3 slot | Porting notes | Priority |
|---|---|---|---|---|---|
| 1 | PageHeader h1 "Today" + accent bar (C0) | static | V1 greeting replaces | Replace the accent-bar H1 with the mockup's `.greeting` + `.greeting-sub` pattern. Use `getTimeGreeting(firstName)` for "Morning/Afternoon/Evening, Tristan". Move weekday+date+time to the chip row. | MUST |
| 2 | FractionalExecPromoCard (C1) | `showFractionalExecPrompt` prop | top of main, above V1 **OR** as first row in V5 ("Waiting on you") | Keep as a dismissible banner above V1 when visible. Not in mockup — add as a stateful banner component. Do NOT inline into V3a (hero priority slab is source-agnostic — don't pin a promo there). | MUST (conversion surface) |
| 3 | Cal avatar + greeting line + narrative (C2 core) | `briefing.userName`, `calNarrative`, `isCalLoading` | Merge into V1 (greeting) + V3a (priority slab body) | Greeting itself goes to V1. Cal narrative becomes a dedicated "Cal says…" line under the greeting OR is folded into V3a as the priority-slab `<p>` body. **Recommended:** single-line "Cal says: {narrative}" under `.greeting-sub` chips, with the Ask/Refresh/Streak controls inline. Do NOT lose the `aria-live="polite"` wrapper. | MUST |
| 4 | Narrative fallback chain (Cal→briefing.narrative→briefing.greeting) | derived | same as #3 | Keep the three-stage string fallback verbatim. | MUST |
| 5 | "Reply to Cal" `AskSpecialistButton` | inline-built context | inline with #3 | Keep as a `chip` variant button in the same line as Cal's text. | MUST |
| 6 | `StreakBadge` (C2 right rail) | `briefing.streak` | V2 `.greeting-sub` chips row | Add as one of the chips (info variant). Milestone celebration hook stays server-effect-only. | MUST |
| 7 | Refresh briefing button (C2 right rail) | `refreshBriefing`, `isCalLoading` | inline with #3 | Keep but style as a small ghost icon-button beside the Cal-narrative line. | NICE |
| 8 | 5-stat strip — Completed / Due today / Overdue / Team completed + TodayTimeCard (C2a) | `pulseData.personal`, `pulseData.team`, `pulseData.trends` | V4 `.minigrid` (3 tiles) + V10 `.app-signals` (Time pill) | **Reformat heavily.** The mockup minigrid is 3 tiles (cost/pipeline/tasks) — use `tasks_due_today` for the *Plan · tasks* tile ("N due · M overdue"). Move **TodayTimeCard** to the **V10 Time pill** ("14 / 40h this week") — keep as a small inline mini-stats card. Completed + trend arrow: absorb into the Plan tile subtitle ("+3 from yesterday"). Do NOT try to cram all 5 stats back into the headline strip. | MUST (all 5 metrics preserved, re-homed) |
| 9 | Smart Nudges list (C2b) | `briefing.nudges[]` | V5 `.waiting-card` rows **or** V6a queue rows | These are terminal-agnostic nudges with actionHref/actionLabel. **Port every nudge** into the V6a ranked queue — each becomes one queue row with source-tag `meta` (use greyscale) and the nudge.type maps to decay (`overdue`/`at_risk`/`stale`/`momentum`). Do NOT merely delete. If ctaHref is present, use it as the `Open →` href. | MUST |
| 10 | Unread-messages inline nudge (C2c, inside C2b) | `unreadCount` | V10 `.app-signals` Comms pill | Single pill, "Comms · N unread", linked to `/updates`. Dual-surface (also sits in V6a queue if `unreadCount>=5`? — propose as a V6a row only when high). | MUST (as pill) |
| 11 | Intelligence Signal footer (days-of-data / best day / velocity) (C2d) | `briefing.intelligenceDaysOfData`, `bestProductivityDay`, `velocityTrend` | new slim line under V1 **OR** drop with approval | Tristan's "No AI emphasis" rule — avoid framing as "intelligence". Port as a quiet "Based on {N} days · best day {X} · velocity {+Y%}" caption under the greeting. Gate on `intelligenceDaysOfData > 7`. | NICE (DROP? if V1 feels crowded — ask Tristan) |
| 12 | Partial-data warning + retry (C2e) | `pulseError`, `briefingError`, `loadData` | under V4 minigrid (or as a thin banner above V5) | Keep the "Some data unavailable · Retry" row. Do not place in hero. | MUST |
| 13 | Cal's urgency-triaged insights (C3) | `calInsights[]` via `useCalBriefing` | V5 `.waiting-card` rows + V6a queue rows (hybrid) | `SpecialistInsightCard` is effectively "ask from a specialist, with context". **High-urgency insights → V5 Waiting-on-you rows** (avatar = specialist, source-tag = section, buttons = Approve/Ask/Reject mapping to accept/discuss/dismiss). **Lower-urgency insights → V6a queue rows.** Keep `dismissInsight` + `handleDiscussInsight` wiring. | MUST |
| 14 | GettingStartedHero onboarding checklist (C4) | `initialOnboardingData` | above V1, full-width | Render above greeting when checklist not dismissed + <3 complete. Out-of-flow — still a priority for first-login UX. | MUST |
| 15 | Sandbox Welcome Banner 2-path card (C5) | `_isSandbox && !sandboxBannerDismissed` | above V1, below C14 | Straight port of current card — leave design untouched for now (not in scope of V3 reskin per "reskin-plus-frame" rule). | MUST |
| 16 | `ReferralNudgeBanner` (C6) | internal component logic | below V10, above footer Quick Actions | Keep as a thin banner. Can be deferred to below-the-fold (after V10). | NICE |
| 17 | FocusTasksSection + both empty states (C7) | `briefing.topTasks[]`, `overdueCount` | V6a queue (rows) **and** V5 if `isOverdue` | Each topTask becomes a V6a queue row with source-tag `plan` (tasks are Plan domain). Overdue tasks get `decay.overdue` class. **All-clear empty state:** render in V6a queue body as "You're all caught up — time to plan your next move." **Overdue-only empty state:** V6a row count shows "N overdue, nothing new today". | MUST |
| 18 | Unread Messages standalone card (C8) | `unreadCount` | V10 `.app-signals` Comms pill | Superseded by V10. Do NOT render a second standalone card — that's the "two surfaces for one signal" bug the V3 annotation calls out. | DROP-WITH-APPROVAL (duplicates #10) |
| 19 | BlockersSection (C9) | `pulseData.blockers[]` | V5 `.waiting-card` rows | Each blocker becomes a Waiting-on-you row. Avatar = blocker.user_name initials, body = blocker.blocker text, source-tag = `forge` if linked to a task/part, else `plan`. Severity ≥ high → show red `btn-n`-style urgent indicator. | MUST |
| 20 | PendingApprovalsSection (C10) | `pulseData.pending_approvals[]` | V5 `.waiting-card` rows | Straight port — approvals are the canonical Waiting-on-you items. Map: who = assignee_name, ask = task title, decisions = Approve/Ask/Reject (currently only has one Link, extend to 3 buttons). source-tag = `plan`. | MUST |
| 21 | AtRiskObjectivesSection + on-track empty state (C11) | `briefing.atRiskObjectives[]` | V9 `.signals-strip` Plan card (summary) + V6a queue (per-objective rows) | The **summary number** ("2 at risk") belongs in the V9 Plan signal card. **Per-objective rows** (with reason + progress% + daysUntilDeadline) belong in V6a queue. **"All on track" empty state** — render as the V9 Plan card copy ("Q2 on-track 3/3 · keep momentum"). | MUST |
| 22 | StrategySpotlightSection pillar list + progress bars + all-healthy empty state (C12) | `strategyHealth[]` | V9 `.signals-strip` Plan card (aggregate) — with on-hover detail **OR** keep as dedicated section below V9 | The mockup's V9 Plan card is terse. The current pillar list (name + progress + overdue count) is denser and more useful than what fits in V9. **Recommended:** keep V9 Plan card as summary, but **render StrategySpotlight as a collapsible section directly under V9 Plan card** (or under V8 section label). Do NOT lose the pillar breakdown — Tristan uses this to see which pillar is red. | MUST |
| 23 | "Your Team" — WeeklyBrief + InsightFeed (C13) | internal | **DEFER** — move out of Today view to a dedicated `/updates` surface **OR** render below V9 as an expanded card | These are heavy proactive-insights components. V3 is a triage surface; these are a team-digest. **Recommended:** Render below V9 signals strip as a collapsible "Team brief" block, collapsed by default. No V3 slot maps cleanly. | DROP-WITH-APPROVAL (propose collapsed-by-default) |
| 24 | InsightsSection — celebration/warning/suggestion from `pulse.insights` (C14) | `pulse.insights[]` | V6a queue rows (for warnings/suggestions) + hero "Cal says" line (for celebrations) | Split by type. `warning`/`suggestion` → V6a rows (source-tag = `meta`). `celebration` → append to Cal's narrative OR surface as a chip in V2. Do NOT duplicate Cal's Insights (C3) — deduplicate by `insight.id`. | MUST |
| 25 | "Brief Your Team" 3-chip card (C15) | `pulse.data` counts for notes | DEFER — move to Specialists sidebar section OR keep as small footer chip row | Not in V3 mockup. Three `AskSpecialistButton`s (Cal/Sage/Choose) — keep but demote to a thin chip row below V10, or move to AdvisorPanel entry. Do not occupy prime real estate. | NICE |
| 26 | Quick Actions 4-link footer (Tasks/Objectives/Strategy/Plan) (C16) | static | DROP — replicated by sidebar | Sidebar already provides these nav entries. V3 mockup drops them. **Propose dropping** — flag to Tristan. | DROP-WITH-APPROVAL |
| 27 | PageTour (C17) | `initialOnboardingData` | unchanged — overlay | Overlay component, not in document flow. Keep wiring identical. Update `data-tour="..."` attrs to new V3 containers. | MUST |
| 28 | CreateCompanyDialog (C18) | `showCreateCompany` state | unchanged — modal | Modal, no V3 slot needed. Keep wiring. | MUST |
| 29 | TodayViewSkeleton (C19) | `isLoading` | rewrite to mirror V3 layout | Rewrite skeleton to match V3 grid (greeting strip + headline-grid 2-col + minigrid 3-col + waiting-card + mid-grid 2-col). Current skeleton matches old layout only. | MUST |
| 30 | Error-branch "welcome" view (role-aware) (C20) | `bothFailed`, `_userRole` | above V1, replacing hero | Keep as a full-page replacement when `bothFailed`. Does not need to mirror V3 grid — error UX trumps design coherence. Include FractionalExecPromoCard + GettingStartedHero + Sandbox banner + role-aware CTA hero as today. | MUST |
| 31 | `useRegisterScreenContext` hook (cross-cutting) | derived | unchanged | Keep as-is. Update summary string to include new V5 "waiting on you" count + V6a queue total. | MUST |
| 32 | Celebration effects (confetti + streak) (cross-cutting) | `briefing`, refs | unchanged | Keep effect hook identical. Retrigger conditions unchanged. | MUST |
| 33 | `handleShareReferral` / `handleDiscussInsight` handlers (cross-cutting) | — | unchanged | Keep wiring into new V3 children. | MUST |

### Items from the V3 mockup that the queue / waiting-card will need

- **Source tagging** — every row in V5 and V6a has a `.source-tag.source-{forge|products|plan|money|compliance|comms|people}`. Current signals must be tagged. Mapping:
  - `briefing.nudges[].type` → `meta` (until nudges carry a domain tag).
  - `briefing.topTasks[]` → `plan`.
  - `briefing.atRiskObjectives[]` → `plan`.
  - `pulseData.blockers[]` → `plan` (fallback) or `forge` if linked to a forge entity.
  - `pulseData.pending_approvals[]` → `plan`.
  - `strategyHealth[]` → `plan`.
  - `calInsights[]` / `pulse.insights[]` → use the specialist domain if available; fallback `meta`.
  - `useTodayForgeFeed.signals[]` → `forge` (already tagged in `TodaySignal.section`).

- **Decay** — V6a queue rows show a decay label (e.g. `-62 days`, `14 days`, `3 days`). Derive from:
  - Tasks: `dueDate` → days until due (negative = overdue).
  - Objectives: `daysUntilDeadline` (direct field).
  - Blockers / approvals: `created_at` → days elapsed.
  - Forge signals: `TodaySignal.decayRate` (already enumerated `immediate|1d|3d|7d|30d`).

- **Sort order** — V6a is ordered by consequence × decay. Current Today has no consequence field. Options: (a) use severity (blockers.severity, insight.type) as a proxy, (b) use the Forge `consequence_weight` field for forge-originated signals, default 1.0 otherwise.

---

## 4. New V3 slots that need data the current Today doesn't have

| V3 slot | What the mockup shows | Porting plan | Blocking? |
|---|---|---|---|
| **V3a Priority slab** | A source-agnostic #1 priority (today: Astra AS9100 cert expiry, source=Forge) | **Stub for now.** Until the consequence-ranking service exists, render the *highest-urgency* row from the merged queue (calInsights + topTasks + blockers + atRiskObjectives + forge signals) as the priority slab content. Kicker = "Blocking — #1 today" when any overdue exists, else "Today's focus". Actions = item's cta. | No — stubbable |
| **V3b Runway card** | Cash runway months, burn, verbal committed, progress bar | **Stub** — render a "Connect Cash/Burn" CTA card (placeholder for Money Phase 4). Link to `/money/cockpit` (or `#` if not built). Copy: "Connect your finances to see runway here." | No — explicit stub |
| **V4 minigrid tile 1 — Forge cost** | "£172k over · HAPS build commit vs ceiling" | **Hook into `useTodayForgeFeed`** — select the top cost-breach signal (`section='forge'`, sourceEntityType indicates cost). If no Forge signals: render empty placeholder "No Forge cost breaches today." | No — feed wired, data may be empty |
| **V4 minigrid tile 2 — Money pipeline** | "£800k target · £420k verbal + live" | **Stub** — "Coming in Phase 4 · Money." Placeholder copy. | No — stub |
| **V4 minigrid tile 3 — Plan tasks** | "3/5 on-track · 2 at risk · 7 tasks due this week" | **Derive from existing data:** `strategyHealth.filter(h==='on-track').length / total` + `atRiskObjectives.length` + `pulseData.personal.tasks_due_today`. | No — derivable today |
| **V5 Waiting-on-you "Send standup" button** (top-right of waiting-card) | Posts standup to team chat | **Defer** — wire to existing `/updates` compose flow OR stub to `#`. Not in scope of V3 reskin. | No — stub acceptable |
| **V5 avatar per row** | Colour-coded initials circle per person | **Use `UserAvatar` component** (size `sm`, role-based colour). For specialist-sourced rows, use the specialist's avatar image (already done in current hero). | No — component exists |
| **V6a queue filters (All/Forge/Products/Plan/Money/Compliance)** | Chip-style filter tabs | **Build client-side.** Filter the merged signal array by `section`. No server change needed. | No |
| **V6a view toggle (By decay / By section)** | Re-groups queue | **Build client-side.** By decay = sort by `compareTodaySignals`-style decay×consequence. By section = group rows under section headers. | No |
| **V6b Calendar peek** | 3 cal-items, "Tomorrow: X calls" | **NEW DATA SOURCE NEEDED.** No existing Today calendar integration. Options: (a) reuse TodayTimeCard data if it shows calendar, (b) stub to "No calendar connected" with CTA, (c) defer entirely to a later phase. **Recommended:** stub with a "Connect calendar" CTA card. | No — stub |
| **V7 14-day risk horizon SVG** | Forward-looking event timeline, colour-coded by source | **DEFER to later phase.** No existing horizon data aggregator. Mockup shows Forge/Money/Plan/Products/Compliance events. Render a placeholder card "14-day horizon coming soon — first flight 12 Jun" with a link to `/strategy`. | No — stub |
| **V9 Products signal card** | "Agri-Tech Monitor · 11/15 · 2 LOIs" | **Placeholder: "Coming in Phase 4 · Products."** (Phase order is revised — Products is deferred.) | No — placeholder |
| **V9 Money signal card** | "Runway 11.4mo · raise £800k" | **Placeholder: "Connect cash/burn."** Same stub as V3b. | No — stub |
| **V10 App-signals pill — Time** | "14 / 40h this week" | **Reuse `TodayTimeCard` data** — render inline in the pill. | No — component exists |
| **V10 App-signals pill — Review** | "2 items to approve" | **Reuse `pulseData.pending_approvals.length`** OR a `getMyReviewQueueCount()` stub. Until Review surface exists, use approvals count. | No — derivable |
| **V10 App-signals pill — Knowledge** | "1 new digest" | **Stub to `0`** or hide pill if 0. No Knowledge surface yet. | No — stub/hide |

### Phase-order revision note (per task brief)

- Phase 1 (current): V3 reskin of Today, with Forge feed mounted (PR #1.5).
- Phase 2: Plan (already partially wired — strategyHealth, atRiskObjectives, topTasks exist).
- Phase 3: Forge feed populates real cost/risk/supply signals.
- **Phase 4: Products panel** — placeholder "Coming in Phase 4" until then.
- **Phase 5 (revised): Money panel** — keep Connect-Cash-Burn stub.

---

## 5. Components the rebuild must import and where each lives in V3

| Component | Current import path | V3 usage |
|---|---|---|
| `Card`, `CardContent`, `CardHeader`, `CardFooter` | `@/components/ui/card` | Every V3 panel (V3a, V3b, V5, V6a, V6b, V7, V9 cards). Do not inline `<div className="rounded...">`; use `Card`. |
| `Button` | `@/components/ui/button` | V3a actions row (primary + secondary + ghost variants), V5 row buttons (use `variant="outline"` size `sm`), V10 pills (can be `<a>` but prefer Button with `asChild`). |
| `Badge` | `@/components/ui/badge` | V2 chips (use `variant="secondary"` or `destructive` as needed). Avoid hardcoded colours. |
| `StatusBadge` | `@/components/ui/status-badge` | V2 chips where status is semantic (broke/overdue/waiting). Use `StatusBadge` over `Badge` for all status indicators per design rules. |
| `UserAvatar`, `UserAvatarStack` | `@/components/ui/user-avatar` | V5 row avatars (size `sm`), V6a queue if specialist-assigned. Replace the mockup's `.waiting-item .avatar` colour classes with role-based `UserAvatar`. |
| `Skeleton` | `@/components/ui/skeleton` | `TodayViewSkeleton` rewrite to match V3 grid. |
| `AskSpecialistButton` | `@/components/specialists/ask-specialist-button` | V3a priority-slab "Ask Cal" CTA, V5 row "Ask" buttons, V15 chip row (if kept). |
| `SpecialistInsightCard` | `@/components/specialists/specialist-insight-card` | Used when rendering `calInsights` in V5 (compact) — keep `onDismiss` + `onDiscuss`. |
| `StreakBadge` | `@/components/celebrations/StreakBadge` | V2 chips row (inline). |
| `ReferralNudgeBanner` | `@/components/ui/referral-nudge-banner` | Below V10. |
| `FractionalExecPromoCard` | `@/components/today/fractional-exec-promo` | Above V1. |
| `GettingStartedHero` | `@/components/onboarding/getting-started-hero` | Above V1 (or in error branch above hero). |
| `CreateCompanyDialog` | `@/components/create-company-dialog` | Modal — wired to sandbox-banner button. |
| `PageTour` | `@/components/guidance/page-tour` | Overlay — update `data-tour` attrs on V3 containers. |
| `TodayTimeCard` | `@/components/time/today-time-card` | V10 Time pill (inline) — may need a compact variant. |
| `WeeklyBrief` | `@/components/insights/weekly-brief` | Collapsible block under V9 (DROP-WITH-APPROVAL candidate). |
| `InsightFeed` | `@/components/insights/insight-feed` | Collapsible block under V9 (DROP-WITH-APPROVAL candidate). |
| `useCalBriefing` | `@/app/(platform)/today/use-cal-briefing` | Cal narrative + insights. Keep identical API. |
| `useTodayForgeFeed` | `@/hooks/useTodayForgeFeed` | **NEW in V3** — mount with `{ foundryId }`. Feeds V3a (priority candidate) + V4 tile 1 + V6a queue rows + V9 Forge card. |
| `useAdvisorPanel` | `@/contexts/advisor-panel-context` | `openPanel` handler for V5 "Ask" row buttons. |
| `useCelebration` | `@/hooks/useCelebration` | Confetti + streak celebration effects. Unchanged. |
| `useRegisterScreenContext` | `@/contexts/screen-context` | Unchanged — update summary string. |

### Component signatures worth holding (load-bearing)

```ts
// useTodayForgeFeed.ts — new V3 mount
useTodayForgeFeed({ foundryId }: { foundryId: string | null })
  : { signals: TodaySignal[]; isLoading: boolean; refresh: () => void }
```

```ts
// types/today.ts — sort key for V6a queue
compareTodaySignals(a: TodaySignal, b: TodaySignal): number
// Orders by (decayRate rank, then -consequenceWeight, then -createdAt)
```

```ts
// actions/nudges.ts — current briefing shape (subset)
interface MorningBriefing {
  greeting, narrative, userName,
  topTasks: Array<{ id, title, objectiveTitle, dueDate, isOverdue }>,
  overdueCount,
  atRiskObjectives: Array<{ id, title, progress, daysUntilDeadline, reason }>,
  streak, completedYesterday,
  nudges: Array<{ type: 'overdue'|'stale'|'at_risk'|'momentum', message, actionLabel?, actionHref? }>,
  intelligenceDaysOfData, bestProductivityDay, velocityTrend
}
```

```ts
// lib/reports/types.ts — pulse shape (subset)
interface DailyPulseData {
  personal: { tasks_completed_count, tasks_due_today, tasks_overdue, ... },
  team: { total_completed, completion_rate, ... },
  blockers: Blocker[], pending_approvals: PendingApproval[],
  trends: { completed_yesterday, personal_completed_yesterday }
}
```

```ts
// actions/canvas.ts — strategy pillar shape
interface StrategyHealthItem {
  id, title, health: 'on-track'|'at-risk'|'off-track'|'completed'|'not-started',
  progress, objectiveCount, overdueTaskCount
}
```

---

## 6. Assembly order for the V3 page (suggested render tree)

```
<TodayView>
  <ErrorBranch if={bothFailed}>...</ErrorBranch>          // C20, unchanged

  <GettingStartedHero />                                  // C4, MUST
  <SandboxWelcomeBanner if={_isSandbox} />                // C5, MUST
  <FractionalExecPromoCard visible={...} />               // C1, MUST

  <GreetingHeader>                                        // V1 + V2
    Morning, {firstName}
    <ChipRow>
      {weekdayDate}
      <StatusBadge variant="danger" if={overdueCount>0}>N overdue</StatusBadge>
      <StatusBadge variant="info" if={waitingOnYouCount>0}>N waiting</StatusBadge>
      <StreakBadge streak={...} />
    </ChipRow>
    <CalNarrativeLine>
      Cal says: {calNarrative || briefing.narrative || briefing.greeting}
      <AskSpecialistButton variant="chip" label="Reply to Cal" />
      <RefreshButton />
    </CalNarrativeLine>
    <IntelligenceFooter if={days>7} />                    // C2d, NICE
  </GreetingHeader>

  <HeadlineGrid>                                          // V3
    <PrioritySlab>                                        // V3a — stubbed from top queue item
      <Kicker /> <SourceTag /> <h2 /> <body /> <actions />
    </PrioritySlab>
    <RunwayCard stub="connect-cash-burn" />               // V3b — Phase 5 stub
  </HeadlineGrid>

  <Minigrid>                                              // V4
    <ForgeCostTile signals={forgeFeed.signals} />
    <MoneyPipelineTile stub="phase-5" />
    <PlanTasksTile strategyHealth={...} atRisk={...} dueToday={...} />
  </Minigrid>

  <PartialDataWarning if={pulseError} />                  // C2e

  <WaitingOnYouCard>                                      // V5
    {merged({
      approvals: pulseData.pending_approvals,
      blockers: pulseData.blockers,
      calInsights: calInsights.filter(urgency>=high),
    }).map(row => <WaitingRow />)}
  </WaitingOnYouCard>

  <MidGrid>                                               // V6
    <QueueCard>                                           // V6a
      <Filters /> <ViewToggle />
      {merged({
        topTasks, atRiskObjectives,
        nudges, forgeFeed.signals,
        lowUrgencyCalInsights, pulse.insights (warning/suggestion only)
      }).sort(compareTodaySignals).map(row => <QueueRow />)}
    </QueueCard>
    <CalendarPeek stub="connect-calendar" />              // V6b — stub
  </MidGrid>

  <HorizonCard stub="phase-later" />                      // V7 — stub

  <SectionLabel>Where you stand · 4 sections</SectionLabel>   // V8
  <SignalsStrip>                                          // V9
    <ForgeSignalCard />   // from forgeFeed
    <ProductsSignalCard stub="phase-4" />
    <MoneySignalCard stub="phase-5" />
    <PlanSignalCard />    // from strategyHealth + atRiskObjectives + pulseData
  </SignalsStrip>

  <StrategySpotlightSection items={strategyHealth} />     // C12 — preserved below V9

  <CollapsibleTeamBrief>                                  // C13 — DROP-WITH-APPROVAL candidate
    <WeeklyBrief /> <InsightFeed />
  </CollapsibleTeamBrief>

  <AppSignalsFooter>                                      // V10
    <CommsPill unread={unreadCount} />
    <TimePill timeCard={TodayTimeCard} />
    <ReviewPill count={pendingApprovals.length} />
    <KnowledgePill count={0} />  // hidden if 0
  </AppSignalsFooter>

  <ReferralNudgeBanner />                                 // C6 — NICE

  <BriefYourTeamChips />                                  // C15 — NICE/DEFER
  // Quick Actions footer (C16) — DROP-WITH-APPROVAL

  <PageTour />                                            // C17
  <CreateCompanyDialog />                                 // C18
</TodayView>
```

---

## 7. Explicit DROP-WITH-APPROVAL list (ask Tristan before removing)

1. **C8 — standalone Unread Messages card** (duplicates V10 Comms pill). Remove.
2. **C13 — "Your Team" WeeklyBrief + InsightFeed block**. Propose collapsed-by-default below V9, or move to `/updates`.
3. **C16 — Quick Actions 4-link footer** (Tasks/Objectives/Strategy/Plan). Sidebar covers these.
4. **C15 — "Brief Your Team" 3-chip card**. Propose demoting to thin chip row, or moving into AdvisorPanel entry.
5. **C2d — Intelligence Signal footer** (days-of-data/best-day/velocity). V1 may feel crowded with this line. Propose moving to a "?" tooltip beside greeting.

---

## 8. MUST-preserve checklist (pre-merge gate)

Before the V3 PR ships, verify every one of the following renders or is reachable:

- [ ] Cal narrative with three-stage fallback (Cal > briefing.narrative > briefing.greeting).
- [ ] `briefing.topTasks` all render in V6a (every task preserved, none dropped).
- [ ] `briefing.atRiskObjectives` all render in V6a and aggregate shown in V9 Plan card.
- [ ] `briefing.nudges` all render in V6a (every nudge preserved, including momentum ones).
- [ ] `briefing.overdueCount` drives the V2 danger chip.
- [ ] `briefing.streak` renders in V2 as StreakBadge.
- [ ] `briefing.intelligenceDaysOfData` signal rendered or explicitly dropped-with-approval.
- [ ] `pulseData.personal.tasks_completed_count` + trend arrow preserved (minigrid or V9 Plan card).
- [ ] `pulseData.personal.tasks_due_today` preserved (V4 Plan tile).
- [ ] `pulseData.personal.tasks_overdue` preserved (V2 chip).
- [ ] `pulseData.team.total_completed` preserved somewhere (V9 Plan card subtitle acceptable).
- [ ] `pulseData.trends.personal_completed_yesterday` preserved (trend arrow in Plan tile).
- [ ] `pulseData.blockers[]` all render in V5.
- [ ] `pulseData.pending_approvals[]` all render in V5.
- [ ] `pulse.insights[]` all render (V6a for warning/suggestion, V2 chip / hero for celebration).
- [ ] `strategyHealth[]` rendered — pillar list below V9 preserved.
- [ ] `unreadCount` rendered in V10 Comms pill.
- [ ] `calInsights[]` rendered in V5 (high urgency) + V6a (low urgency), dismiss/discuss wired.
- [ ] `showFractionalExecPrompt` prop honoured (C1 above V1).
- [ ] `initialOnboardingData` — GettingStartedHero + Sandbox banner + PageTour gate logic preserved.
- [ ] `bothFailed` error branch preserved verbatim (C20).
- [ ] Celebration effects (confetti + streak) unchanged.
- [ ] `useRegisterScreenContext` still mounted, summary updated.
- [ ] `useTodayForgeFeed` mounted with `foundryId` (NEW for V3).
- [ ] Skeleton rewritten to V3 grid.
- [ ] `data-tour="today-briefing"`, `today-focus`, `today-insights` reattached to new containers for PageTour.

---

## 9. Open questions for Tristan (answer before build)

1. **Priority slab consequence ranking** — accept the "pick highest-urgency row from merged queue" stub, or wait for a dedicated ranker? (Recommend: stub.)
2. **Quick Actions footer (C16)** — drop, or keep as a compact chip row? (Recommend: drop.)
3. **WeeklyBrief + InsightFeed (C13)** — collapsed-by-default under V9, or move to `/updates`? (Recommend: collapsed, in-page.)
4. **Intelligence Signal line (C2d)** — keep under greeting as quiet caption, or hide entirely? (Recommend: quiet caption, gated `days>7`.)
5. **Calendar peek (V6b)** — stub "connect calendar", reuse TodayTimeCard data somehow, or defer entirely? (Recommend: stub.)
6. **14-day horizon (V7)** — stub a placeholder card, or omit the card until data exists? (Recommend: stub.)
7. **Unread Messages card (C8)** — confirm OK to drop in favour of V10 Comms pill.
