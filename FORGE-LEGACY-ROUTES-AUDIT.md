# Forge Legacy Routes Audit — Pre-PR-#2

**Date:** 2026-04-19 (post PR #1 merge)
**Author:** Agent audit run
**Consumer:** Claude agent shipping PR #2 (Workspace + PROJECT-CREATE at `/the-forge-v2` behind `new_forge_experience` flag)
**Scope:** Every file under `src/app/(platform)/the-forge/**`, matched against `FORGE-MOCKUP-*.html` spec set at repo root.

---

## 0. TL;DR — Decisions at a glance

| Bucket | Count | Behaviour at cutover |
|---|---|---|
| **PRESERVE — CAD lab tree** | 40 files | Stay at `/the-forge/cad-lab/**` path-stable. Linked from new Geometry drill-in. No migration. |
| **MIGRATE — fold into `/the-forge-v2/*`** | 34 files | Content/logic reused inside a new v2 route; legacy file deleted at cutover. |
| **DEPRECATE — remove at cutover** | 5 files | No v2 destination. Redirect or 404. |
| **PRESERVE — shared Forge libs** | 23 files | `services/*`, `lib/*`, `components/hooks/*` — imported by server actions outside Forge. Keep path. |
| **Accidental route** | 1 file | `components/page.tsx` (Component Library) — move up to a real location or redirect. |

Canonical rule applied throughout: **PRESERVE the entire `src/app/(platform)/the-forge/cad-lab/**` tree.** Nothing under that path is flagged MIGRATE or DEPRECATE.

---

## 1. Mockup spec set (canonical target IA)

59 mockup files at repo root. Grouped by the tier structure in `FORGE-MOCKUP-INDEX.html`.

### Tier 1 — Cockpit / top-level
| Mockup | Inferred v2 route |
|---|---|
| `FORGE-MOCKUP-TODAY.html` / `TODAY-V2` / `TODAY-V3` | `/today` (already v2, out of scope) |
| `FORGE-MOCKUP-WORKSPACE.html` | `/the-forge-v2/[projectId]` (project cockpit) |
| `FORGE-MOCKUP-EMPTY-WORKSPACE.html` | `/the-forge-v2` index empty state |
| `FORGE-MOCKUP-EMPTY-TODAY.html` | (Today owns) |
| `FORGE-MOCKUP-OPERATIONS.html` | `/the-forge-v2/operations` (cross-project ops) |
| `FORGE-MOCKUP-EXPERTS.html` | `/the-forge-v2/experts` |
| `FORGE-MOCKUP-EXPERT-PROFILE.html` | `/the-forge-v2/experts/[id]` |

### Tier 2 — Project artefacts (each is a tab/drill-in off Workspace)
| Mockup | Inferred v2 route |
|---|---|
| `FORGE-MOCKUP-BRIEF.html` | `/the-forge-v2/[projectId]/brief` |
| `FORGE-MOCKUP-BRIEF-LOCK.html` | brief lock dialog |
| `FORGE-MOCKUP-MODULES.html` | `/the-forge-v2/[projectId]/modules` |
| `FORGE-MOCKUP-MODULE-DETAIL.html` | `/the-forge-v2/[projectId]/modules/[moduleId]` |
| `FORGE-MOCKUP-BOM.html` | `/the-forge-v2/[projectId]/bom` |
| `FORGE-MOCKUP-BOM-ADD.html` / `EMPTY-BOM` | BOM add dialog / empty state |
| `FORGE-MOCKUP-PART-DETAIL.html` | `/the-forge-v2/[projectId]/bom/[partId]` |
| `FORGE-MOCKUP-SUPPLIERS.html` | `/the-forge-v2/[projectId]/suppliers` |
| `FORGE-MOCKUP-SUPPLIER-CREATE.html` / `SUPPLIER-DETAIL.html` | supplier CRUD |
| `FORGE-MOCKUP-RISKS.html` / `EMPTY-RISKS` / `RISK-CREATE` | `/the-forge-v2/[projectId]/risks` |
| `FORGE-MOCKUP-COST.html` / `EMPTY-COST` | `/the-forge-v2/[projectId]/cost` |
| `FORGE-MOCKUP-GEOMETRY.html` / `GEOMETRY-UPLOAD` | `/the-forge-v2/[projectId]/geometry` (drill-in to **preserved** CAD lab) |
| `FORGE-MOCKUP-LAUNCH.html` / `LAUNCH-HANDOFF.html` | `/the-forge-v2/[projectId]/launch` |

### Tier 3 — Actions, dialogs, flows (inline or route-in-modal)
`COMPOSE`, `APPROVE`, `ASSUMPTION-TEST`, `ASK-SPECIALIST`, `FORK`, `SCHEDULE`, `REQUEST`, `REVISIONS`, `REVISION-MERGE`, `EXPORT`, `ARCHIVE-PRODUCT`, `PROMOTE-TO-FORGE`, `PROMOTE`, `READINESS-ACTION`, `COMPETITOR-DETAIL`, `MARKET-SIZING`, `INTERVIEW-DETAIL`, `LOI-DETAIL`.

### Tier 4 — Onboarding / products / cross-cutting
`ONBOARD-*` (6 files), `PRODUCTS-V2`, `EMPTY-PRODUCTS-V2`, `PROJECT-CREATE`.

### Audit artefact
`FORGE-MOCKUP-GAP-AUDIT.html` — not a page; it's the canonical audit index.

---

## 2. Legacy route inventory

### 2.1 Top-level `/the-forge` (route root)

| Path | Description | Decision | Maps to |
|---|---|---|---|
| `src/app/(platform)/the-forge/page.tsx` | Project list index (mounts ForgeProjectList in Suspense). | **MIGRATE** | `WORKSPACE` index + `EMPTY-WORKSPACE` at `/the-forge-v2` |
| `src/app/(platform)/the-forge/layout.tsx` | (none — inherits `(platform)/layout.tsx`) | n/a | n/a |
| `src/app/(platform)/the-forge/loading.tsx` | Skeleton for the Forge index page. | **MIGRATE** | v2 index skeleton (trivial rewrite) |
| `src/app/(platform)/the-forge/xray-view.tsx` | Legacy single-page scrollable product dossier (29KB). Imports ScanHero, DesignBriefInterview, SystemBlueprint, ExecutiveDashboard, ModuleExplorer, TimelineView, RiskRegister, TeamMap, SupplyChain, DiagnosticCenter. | **DEPRECATE** | Superseded by WORKSPACE + per-artefact v2 routes. Kill at cutover. |

### 2.2 `/the-forge/components/` — 42 component files + 1 accidental route + hooks + tests

**Accidental route file (route leak):**

| Path | Description | Decision | Notes |
|---|---|---|---|
| `components/page.tsx` | Component Library browse page (accidentally exposed at `/the-forge/components`). | **DEPRECATE** | Move to a real route (e.g. `/components` or `/the-forge-v2/component-library`) OR 404. Referenced in `src/contexts/screen-context.tsx:149`. Confirm no deep links. |

**Project list / cards (root `/the-forge`):**

| Path | Description | Decision | Maps to |
|---|---|---|---|
| `components/forge-project-list.tsx` | Renders grid of Forge projects + starting paths. | **MIGRATE** | `WORKSPACE` index grid |
| `components/forge-project-card.tsx` | Individual project card tile. | **MIGRATE** | `WORKSPACE` project tile |
| `components/recent-projects-grid.tsx` | "Recent projects" section for Forge index. | **MIGRATE** | `WORKSPACE` recent-projects strip |
| `components/sample-project-preview.tsx` | Sample/demo project preview card. | **MIGRATE** | `EMPTY-WORKSPACE` demo tile |
| `components/forge-project-header.tsx` | Breadcrumb/back header (links `/the-forge`). | **MIGRATE** | Workspace project-header block |
| `components/forge-project-context.tsx` | React context for currently-viewed project. | **MIGRATE** | v2 equivalent with broader artefact state |
| `components/forge-screen-context.tsx` | Screen-context wrapper (specialist routing). | **MIGRATE** | v2 Workspace screen-context hook |
| `components/forge-cto-banner.tsx` | CTO specialist banner inline on index. | **MIGRATE** | Fold into `WORKSPACE` eng-intel strip |
| `components/forge-advisor-insights.tsx` | Advisor insight chips. | **MIGRATE** | Fold into `WORKSPACE` eng-intel |
| `components/forge-hover-explanations.tsx` | Hover-tooltip copy constants (23KB — pure content). | **MIGRATE** | v2 microcopy lib; likely trim heavily |
| `components/page.tsx` | (covered above as accidental route) | — | — |

**Narrative / dossier content (legacy xray-view feeders):**

| Path | Description | Decision | Maps to |
|---|---|---|---|
| `components/scan-hero.tsx` | Idea-capture hero for new scans. | **MIGRATE** | `PROJECT-CREATE` |
| `components/new-scan-view.tsx` | "Start a new scan" view wrapper. | **MIGRATE** | `PROJECT-CREATE` |
| `components/concept-view.tsx` | Concept/intake view; links to `/the-forge/[scanId]/dossier?tab=summary`. | **MIGRATE** | `BRIEF` + `PROJECT-CREATE` |
| `components/concept-research.tsx` | Concept research deep-dive panel. | **MIGRATE** | `BRIEF` research section |
| `components/dossier-view.tsx` | Main dossier tabbed container (Summary / Modules / Risks / ...). | **DEPRECATE** | Split into v2 per-artefact routes (BRIEF, MODULES, BOM, RISKS, COST). Kill container. |
| `components/interview-panel.tsx` | Interview Q&A panel. | **MIGRATE** | `INTERVIEW-DETAIL` + `BRIEF` |
| `components/scan-celebration.tsx` | Post-scan celebration animation. | **MIGRATE** | `WORKSPACE` resumed-state card (subtler) |
| `components/quick-insights.tsx` | Quick-insight strip for dossier. | **MIGRATE** | `WORKSPACE` health strip |
| `components/system-blueprint.tsx` | System blueprint diagram (links to `/the-forge/[id]/dossier?module=...`). | **MIGRATE** | `MODULES` system-view |
| `components/module-explorer.tsx` | 46KB module explorer — the heavy one. | **MIGRATE** | `MODULES` + `MODULE-DETAIL` |
| `components/edit-module-dialog.tsx` | Edit-module CRUD dialog. | **MIGRATE** | `MODULE-DETAIL` edit flow |
| `components/xray-module-node.tsx` | Node renderer for module graph. | **MIGRATE** | `MODULES` graph node |
| `components/xray-schematic.tsx` | System schematic SVG/canvas. | **MIGRATE** | `MODULES` schematic view |
| `components/sub-assembly-diagram.tsx` | Sub-assembly breakdown diagram. | **MIGRATE** | `MODULE-DETAIL` sub-assembly |
| `components/executive-dashboard.tsx` | Executive summary dashboard tab. | **MIGRATE** | `WORKSPACE` health strip + eng-intel |
| `components/engineering-summary.tsx` | 43KB engineering summary (long). | **MIGRATE** | Split across `MODULES` / `COST` / `RISKS` |
| `components/engineering-review-package.tsx` | Engineering review PDF/package builder. | **MIGRATE** | `LAUNCH-HANDOFF` export |
| `components/design-changes-dialog.tsx` | Dialog for staged design changes. | **MIGRATE** | `REVISIONS` + `REVISION-MERGE` |
| `components/diagnostic-center.tsx` | Diagnostic / validation center. | **MIGRATE** | `OPERATIONS` + `ASSUMPTION-TEST` |
| `components/timeline-view.tsx` | Roadmap/timeline view. | **MIGRATE** | `WORKSPACE` timeline card or `SCHEDULE` |
| `components/risk-register.tsx` | Risk register table. | **MIGRATE** | `RISKS` |
| `components/team-map.tsx` | People/team map for a project. | **MIGRATE** | `EXPERTS` (project-scoped) |
| `components/people-view.tsx` | People tab wrapper. | **MIGRATE** | `EXPERTS` |
| `components/supply-chain.tsx` | Supply chain visualization (9KB). | **MIGRATE** | `SUPPLIERS` |
| `components/supply-chain-view.tsx` | Supply chain tab wrapper. | **MIGRATE** | `SUPPLIERS` |
| `components/rfq-section.tsx` | RFQ section within dossier. | **MIGRATE** | `SUPPLIERS` + `REQUEST` |
| `components/contracting-view.tsx` | Contracting tab wrapper. | **MIGRATE** | `SUPPLIERS` / `LAUNCH` |
| `components/contracting-dashboard.tsx` | 27KB contracting dashboard. | **MIGRATE** | `SUPPLIERS` + `LAUNCH-HANDOFF` |
| `components/stl-viewer.tsx` | STL 3D viewer component. | **MIGRATE** | `GEOMETRY` (links into preserved CAD lab) |
| `components/editable-list.tsx` | Generic editable list primitive. | **MIGRATE** | Shared UI util in v2 |
| `components/promote-to-product-button.tsx` | "Promote to Product" CTA. Imported by `recent-projects-grid.tsx`. | **MIGRATE** | `PROMOTE` / `PROMOTE-TO-FORGE`. Cross-cutting — see §5. |

**Component tests:**

| Path | Description | Decision |
|---|---|---|
| `components/__tests__/forge-project-list.test.tsx` | Integration test for project list. | **MIGRATE** (rewrite for v2 ForgeWorkspaceList) |

**Component hooks:**

| Path | Description | Decision |
|---|---|---|
| `components/hooks/use-forge-images.ts` | Hook for Forge image fetching. | **PRESERVE** (move to `src/hooks/` in v2, or keep path-stable as utility) |
| `components/hooks/use-forge-matching.ts` | Hook for person/supplier matching. | **PRESERVE** |
| `components/hooks/use-forge-persist.ts` | Hook for persisting Forge state. | **PRESERVE** |
| `components/hooks/use-forge-pipeline.ts` | Hook driving the Forge pipeline (12KB). | **PRESERVE** (rewired inside v2; logic unchanged) |

### 2.3 `/the-forge/services/` — domain services (imported outside Forge)

All services in `src/app/(platform)/the-forge/services/*` are imported by `src/actions/xray.ts`, `src/actions/cad-lab-images.ts`, and `src/lib/cad-lab/module-to-module-spec-adapter.ts`. **PRESERVE** the entire directory path-stable to avoid churn; they're not UI.

| Path | Description | Decision |
|---|---|---|
| `services/cad-generator.ts` | 65KB CAD code generator. | **PRESERVE** |
| `services/cad-parameters.ts` | CAD parameter schema. | **PRESERVE** |
| `services/cfd-generator.ts` | CFD analysis generator. | **PRESERVE** |
| `services/convergence-controller.ts` | Multi-step convergence loop driver. | **PRESERVE** |
| `services/fea-generator.ts` | FEA analysis generator. | **PRESERVE** |
| `services/image-generator.ts` | 57KB image pipeline. | **PRESERVE** |
| `services/image-overlay.ts` | Image annotation overlay. | **PRESERVE** |
| `services/inspiration-bridge.ts` | Inspiration → scan bridge. | **PRESERVE** |
| `services/people.ts` | People matching service. | **PRESERVE** |
| `services/premium-analysis-generator.ts` | Premium analysis bundler. | **PRESERVE** |
| `services/scan.ts` | 40KB scan orchestrator. | **PRESERVE** |
| `services/structural-brief.ts` | Structural brief generator. | **PRESERVE** |
| `services/suppliers.ts` | Supplier matching service. | **PRESERVE** |
| `services/thermal-generator.ts` | Thermal analysis generator. | **PRESERVE** |
| `services/topo-generator.ts` | Topology optimization generator. | **PRESERVE** |
| `services/xray-schema.ts` | Zod schema for xray/scan (29KB). | **PRESERVE** |
| `services/xray-to-inspiration.ts` | xray → inspiration adapter. | **PRESERVE** |
| `services/xray-to-objectives.ts` | xray → objectives adapter. | **PRESERVE** |
| `services/xray-to-strategy.ts` | xray → strategy adapter. | **PRESERVE** |

**Post-v2 consolidation (optional, not PR #2):** once v2 ships, relocate services to `src/lib/forge/services/` for clarity. Out of scope here.

### 2.4 `/the-forge/lib/`

| Path | Description | Decision |
|---|---|---|
| `lib/status-colors.ts` | Status → colour mapping for Forge statuses. | **PRESERVE** (tiny util; move to `src/lib/forge/` in post-v2 cleanup) |

### 2.5 `/the-forge/cad-lab/**` — 40 files — ALL PRESERVE

Per Tristan's Phase 1 decision: CAD lab is preserved at `/the-forge/cad-lab` path-stable through cutover. New Workspace GEOMETRY card drill-ins link here.

**Shell / context / layout:**

| Path | Description | Decision |
|---|---|---|
| `cad-lab/layout.tsx` | Shared CAD lab layout (Suspense + provider wrapper). | **PRESERVE** |
| `cad-lab/loading.tsx` | CAD lab loading skeleton. | **PRESERVE** |
| `cad-lab/page.tsx` | 74KB CAD lab landing page. | **PRESERVE** |
| `cad-lab/cad-lab-context.tsx` | 233KB context (largest file). | **PRESERVE** |
| `cad-lab/cad-lab-layout-client.tsx` | Client layout shell + nav. | **PRESERVE** |
| `cad-lab/cad-lab-nav.tsx` | 4-stage pipeline stepper. | **PRESERVE** |
| `cad-lab/cad-lab-utils.tsx` | CAD lab utility helpers. | **PRESERVE** |
| `cad-lab/use-generation-phase.ts` | Hook for generation-phase state. | **PRESERVE** |

**Stage pages (the 4-stage pipeline):**

| Path | Stage | Decision |
|---|---|---|
| `cad-lab/specify/page.tsx` | Specify (96KB — biggest page in repo) | **PRESERVE** |
| `cad-lab/specify/loading.tsx` | Specify skeleton | **PRESERVE** |
| `cad-lab/build/page.tsx` | Build (80KB) | **PRESERVE** |
| `cad-lab/build/loading.tsx` | Build skeleton | **PRESERVE** |
| `cad-lab/source/page.tsx` | Source (71KB) | **PRESERVE** |
| `cad-lab/assemble/page.tsx` | Assemble (54KB) | **PRESERVE** |
| `cad-lab/review/page.tsx` | Review (35KB) | **PRESERVE** |

**Legacy stages (likely dead but inside the preserved tree — keep as-is):**

| Path | Stage | Decision |
|---|---|---|
| `cad-lab/analysis/page.tsx` | Stub (663 bytes — likely redirect). | **PRESERVE** (leave for separate dead-route cleanup) |
| `cad-lab/procurement/page.tsx` | Stub (675 bytes). | **PRESERVE** |
| `cad-lab/cad/page.tsx` | Older CAD viewer (13KB). | **PRESERVE** |
| `cad-lab/mashup/page.tsx` | Mashup builder (14KB). | **PRESERVE** |
| `cad-lab/parts-bom/page.tsx` | Parts BOM (30KB). | **PRESERVE** |
| `cad-lab/supply-flow/page.tsx` | Supply-flow diagram page (6KB). | **PRESERVE** |
| `cad-lab/templates/page.tsx` | Templates (17KB). | **PRESERVE** |

**CAD lab library:**

| Path | Description | Decision |
|---|---|---|
| `cad-lab/lib/flow-edge-utils.ts` | Flow-graph edge utilities. | **PRESERVE** |

**CAD lab components (32 files):**

| Path | Decision |
|---|---|
| `cad-lab/components/checkpoint-revision-diffs.tsx` | **PRESERVE** |
| `cad-lab/components/code-editor.tsx` | **PRESERVE** |
| `cad-lab/components/collapsible-section.tsx` | **PRESERVE** |
| `cad-lab/components/concept-build-diff.tsx` | **PRESERVE** |
| `cad-lab/components/design-brief-interview.tsx` | **PRESERVE** |
| `cad-lab/components/design-intake-form.tsx` | **PRESERVE** |
| `cad-lab/components/design-report-dialog.tsx` | **PRESERVE** |
| `cad-lab/components/fade-in.tsx` | **PRESERVE** |
| `cad-lab/components/hero-section.tsx` | **PRESERVE** |
| `cad-lab/components/illustration-style-selector.tsx` | **PRESERVE** |
| `cad-lab/components/integration-view.tsx` | **PRESERVE** |
| `cad-lab/components/linked-product-chip.tsx` | **PRESERVE** |
| `cad-lab/components/mashup-concept-search.tsx` | **PRESERVE** |
| `cad-lab/components/mashup-generation-progress.tsx` | **PRESERVE** |
| `cad-lab/components/mashup-source-selector.tsx` | **PRESERVE** |
| `cad-lab/components/module-carousel.tsx` | **PRESERVE** |
| `cad-lab/components/module-flow-canvas.tsx` | **PRESERVE** |
| `cad-lab/components/module-image-card.tsx` | **PRESERVE** |
| `cad-lab/components/module-image-grid.tsx` | **PRESERVE** |
| `cad-lab/components/module-node.tsx` | **PRESERVE** |
| `cad-lab/components/module-results-view.tsx` | **PRESERVE** |
| `cad-lab/components/parameter-panel.tsx` | **PRESERVE** |
| `cad-lab/components/pre-exec-validation-alerts.tsx` | **PRESERVE** |
| `cad-lab/components/process-flow-diagram.tsx` | **PRESERVE** |
| `cad-lab/components/product-overview-card.tsx` | **PRESERVE** |
| `cad-lab/components/product-overview-hero.tsx` | **PRESERVE** |
| `cad-lab/components/provider-comparison.tsx` | **PRESERVE** |
| `cad-lab/components/redline-diff.tsx` | **PRESERVE** |
| `cad-lab/components/reference-document-upload.tsx` | **PRESERVE** |
| `cad-lab/components/reference-image-upload.tsx` | **PRESERVE** |
| `cad-lab/components/reference-model-viewer.tsx` | **PRESERVE** |
| `cad-lab/components/research-section.tsx` | **PRESERVE** |
| `cad-lab/components/seeded-brief-card.tsx` | **PRESERVE** |
| `cad-lab/components/supply-flow-diagram.tsx` | **PRESERVE** |
| `cad-lab/components/supply-flow-types.ts` | **PRESERVE** |
| `cad-lab/components/system-architecture-graph.tsx` | **PRESERVE** |
| `cad-lab/components/system-visual-overview.tsx` | **PRESERVE** |

**CAD lab tests:**

| Path | Decision |
|---|---|
| `cad-lab/components/__tests__/module-detail-edit.test.tsx` | **PRESERVE** |
| `cad-lab/components/__tests__/module-image-grid.test.tsx` | **PRESERVE** |
| `cad-lab/components/__tests__/process-flow-interactive.test.tsx` | **PRESERVE** |
| `cad-lab/components/__tests__/product-overview-card.test.tsx` | **PRESERVE** |

---

## 3. Files grouped by decision (flat index)

### MIGRATE — 34 files

| # | Path | Target v2 artefact |
|---|---|---|
| 1 | `page.tsx` | Workspace index (list) |
| 2 | `loading.tsx` | v2 index skeleton |
| 3 | `components/forge-project-list.tsx` | Workspace list |
| 4 | `components/forge-project-card.tsx` | Workspace tile |
| 5 | `components/recent-projects-grid.tsx` | Workspace recent strip |
| 6 | `components/sample-project-preview.tsx` | Empty-Workspace demo |
| 7 | `components/forge-project-header.tsx` | Workspace header block |
| 8 | `components/forge-project-context.tsx` | v2 project context |
| 9 | `components/forge-screen-context.tsx` | v2 screen-context hook |
| 10 | `components/forge-cto-banner.tsx` | Workspace eng-intel |
| 11 | `components/forge-advisor-insights.tsx` | Workspace eng-intel |
| 12 | `components/forge-hover-explanations.tsx` | v2 microcopy lib |
| 13 | `components/scan-hero.tsx` | PROJECT-CREATE |
| 14 | `components/new-scan-view.tsx` | PROJECT-CREATE |
| 15 | `components/concept-view.tsx` | BRIEF + PROJECT-CREATE |
| 16 | `components/concept-research.tsx` | BRIEF research section |
| 17 | `components/interview-panel.tsx` | INTERVIEW-DETAIL / BRIEF |
| 18 | `components/scan-celebration.tsx` | Workspace resumed card |
| 19 | `components/quick-insights.tsx` | Workspace health strip |
| 20 | `components/system-blueprint.tsx` | MODULES system-view |
| 21 | `components/module-explorer.tsx` | MODULES + MODULE-DETAIL |
| 22 | `components/edit-module-dialog.tsx` | MODULE-DETAIL edit |
| 23 | `components/xray-module-node.tsx` | MODULES graph node |
| 24 | `components/xray-schematic.tsx` | MODULES schematic |
| 25 | `components/sub-assembly-diagram.tsx` | MODULE-DETAIL sub-assembly |
| 26 | `components/executive-dashboard.tsx` | Workspace health + eng-intel |
| 27 | `components/engineering-summary.tsx` | MODULES / COST / RISKS |
| 28 | `components/engineering-review-package.tsx` | LAUNCH-HANDOFF |
| 29 | `components/design-changes-dialog.tsx` | REVISIONS + REVISION-MERGE |
| 30 | `components/diagnostic-center.tsx` | OPERATIONS + ASSUMPTION-TEST |
| 31 | `components/timeline-view.tsx` | Workspace timeline / SCHEDULE |
| 32 | `components/risk-register.tsx` | RISKS |
| 33 | `components/team-map.tsx` | EXPERTS (project-scoped) |
| 34 | `components/people-view.tsx` | EXPERTS |

Plus (same decision, listed with caveats):

| # | Path | Target v2 artefact | Note |
|---|---|---|---|
| 35 | `components/supply-chain.tsx` | SUPPLIERS | Large (9KB) |
| 36 | `components/supply-chain-view.tsx` | SUPPLIERS | Thin wrapper |
| 37 | `components/rfq-section.tsx` | SUPPLIERS + REQUEST | |
| 38 | `components/contracting-view.tsx` | SUPPLIERS / LAUNCH | |
| 39 | `components/contracting-dashboard.tsx` | SUPPLIERS + LAUNCH-HANDOFF | Large (27KB) |
| 40 | `components/stl-viewer.tsx` | GEOMETRY drill-in | Links into preserved CAD lab |
| 41 | `components/editable-list.tsx` | Shared UI util | Small primitive |
| 42 | `components/promote-to-product-button.tsx` | PROMOTE + PROMOTE-TO-FORGE | Cross-cutting (see §5) |
| 43 | `components/__tests__/forge-project-list.test.tsx` | Rewrite for v2 list | |

### DEPRECATE — 5 files

| # | Path | Reason | Migration path |
|---|---|---|---|
| 1 | `xray-view.tsx` | Legacy single-page dossier. Replaced by Workspace + per-artefact v2 routes. | Any inbound link to legacy scan detail → redirect to `/the-forge-v2/[projectId]`. |
| 2 | `components/dossier-view.tsx` | Tabbed dossier container. v2 splits each tab into its own route. | Rewire each tab's content into its own v2 page; delete container. |
| 3 | `components/page.tsx` (accidental route `/the-forge/components`) | ComponentLibraryPage leaked into Forge namespace. | Move to `/components` or `/the-forge-v2/component-library`; update `src/contexts/screen-context.tsx:149`. |
| 4 | `cad-lab/analysis/page.tsx` | 663-byte stub (likely redirect); not in v2 IA. | PRESERVE formally (inside CAD tree) — flagged here only as a housekeeping candidate for a **separate** cleanup PR. NOT in PR #2. |
| 5 | `cad-lab/procurement/page.tsx` | 675-byte stub; not in v2 IA. | Same as above — PRESERVE for PR #2, separate cleanup PR. |

> Items 4 and 5 are flagged per Tristan's PRESERVE-CAD rule — **do NOT touch them in PR #2.** Listed here only so the next cleanup PR knows they exist.

### PRESERVE — CAD lab (40) + services (19) + lib (1) + hooks (4) = 64 files

Full list in §2.3–§2.5 above. Path-stable across cutover.

---

## 4. Deep-link risk analysis (cutover — `/the-forge-v2` renames to `/the-forge`)

At cutover the flag flips and `/the-forge-v2/*` becomes `/the-forge/*`. **The legacy `/the-forge/*` URLs that users/emails/Slack links currently point at will either collide or break.** Top 5 URLs at risk:

| # | Legacy URL | Who links to it | What happens at cutover | Mitigation |
|---|---|---|---|---|
| 1 | `/the-forge` (index) | `today-view.tsx`, `plan-section-intro.tsx`, `workshop-section-intro.tsx`, email template `lib/notifications/channels/email.ts`, `forge-project-header.tsx` | New Workspace renders. OK if new layout is a superset of old. | Verify v2 root renders correctly under `/the-forge` path. Keep back-compat redirect from `/the-forge` → `/the-forge` (no-op but document). |
| 2 | `/the-forge/[id]/dossier?tab=summary` / `?module=<moduleId>` | Hard-coded in `components/concept-view.tsx:140`, `components/system-blueprint.tsx:297` | **404 today** (no `[id]/dossier` folder exists — already broken). | Replace with `/the-forge-v2/[projectId]/brief` and `/the-forge-v2/[projectId]/modules/[moduleId]` in the MIGRATE pass. Add a 301 rewrite rule in `next.config.ts` for any real inbound traffic. |
| 3 | `/the-forge?thread=<id>` | `new-tasks/task-detail-panel.tsx:490`, `tasks/full-task-view.tsx:662`, `new-objectives/objective-detail-panel.tsx:133` | `thread` query param has no handler in new Workspace. | v2 Workspace must read `thread` query param and open the equivalent thread pane; failing that, swallow silently (no harm). |
| 4 | `/the-forge/new` | `workshop-section-intro.tsx:84` — "Start a new scan" CTA | **404 today** (no `/new` folder exists). | Redirect to `/the-forge-v2/create` (`PROJECT-CREATE`). Add `next.config.ts` rewrite. |
| 5 | `/the-forge/cad-lab/[projectId]` and `/the-forge/cad-lab?project=<id>` | `products/[id]/product-detail-view.tsx:1060,1083` | PRESERVED — CAD lab path-stable. Works unchanged. | Nothing. This is the path-stability dividend. |

**Honorable mentions (6–8):**

- `/the-forge/components` (accidental) — inbound traffic unknown; 404 or redirect to `/components`.
- Every `forge-routes.ts` constant — single file. Update once during MIGRATE.
- `src/lib/__tests__/forge-route-consistency.test.ts` — route-consistency test. Will flag v1 vs v2 drift; **update the test** as part of PR #2.

**Rewrite rule proposal (for `next.config.ts` at cutover):**

```
{ source: '/the-forge/new', destination: '/the-forge-v2/create', permanent: true }
{ source: '/the-forge/:scanId/dossier', destination: '/the-forge-v2/:scanId', permanent: true }
{ source: '/the-forge/components', destination: '/the-forge-v2/component-library', permanent: true }
```

---

## 5. Cross-cutting surfaces (noted, not deep-audited)

These are files **outside** `/the-forge/*` that import from inside it — any rename/move breaks them. Coordinate carefully.

### 5.1 Server actions importing Forge services

Grep hits on `the-forge/(cad-lab|components|services|lib)`:

| Import site | What it imports | Blast radius |
|---|---|---|
| `src/actions/xray.ts` | `services/*` (scan, image-generator, structural-brief, people, suppliers, xray-schema, xray-to-*) | High. All xray actions. |
| `src/actions/cad-lab-images.ts` | `services/image-generator.ts`, `services/image-overlay.ts` | Medium. |
| `src/actions/cad-lab-report.ts` | `cad-lab/components/design-report-dialog.tsx` and related | Medium. |
| `src/actions/forge-shortlist.ts` | `cad-lab/cad-lab-context.tsx` types | Low. |
| `src/actions/forge-contracts.ts` | References UI via doc comment only. | None. |
| `src/actions/report-downloads.ts` | CAD lab context | Low. |
| `src/actions/supply-flow.ts` | supply-flow types | Low. |
| `src/lib/cad-lab/module-to-module-spec-adapter.ts` | `services/xray-schema.ts` | Medium. |
| `src/lib/cad-lab/audience.ts` | CAD lab context types | Low. |
| `src/lib/notifications/channels/email.ts:515` | Hardcoded URL `/the-forge/cad-lab` | Low (CAD path preserved). |
| `src/contexts/screen-context.tsx:149` | `"/the-forge/components"` key | Low (route leak). |
| `src/lib/forge-routes.ts` | Route constants only | Low — single file to update. |
| `src/lib/route-specialist-map.ts` | Route → specialist mapping | Low — update alongside. |
| `src/lib/cad-lab/stage-specialist-map.ts` | CAD-stage → specialist mapping | Low. |
| `src/lib/page-knowledge.ts` | `/the-forge/*` page knowledge | Low. |
| `src/components/cad/*` (11 files) | CAD lab context + components | Medium. Pure CAD lab dependency; PRESERVE covers it. |
| `src/components/sidebar/data/workshop.ts` | Sidebar entry for Forge | **Update in PR #2** to expose `/the-forge-v2` behind flag. |

### 5.2 Promote-to-Product button

`components/promote-to-product-button.tsx` is used only by `components/recent-projects-grid.tsx` (inside Forge). **Not currently imported by `/products/*`.** The MIGRATE destination (`PROMOTE` / `PROMOTE-TO-FORGE` mockups) lives in v2; no cross-boundary concern today.

### 5.3 Test suites

- `src/lib/__tests__/forge-route-consistency.test.ts` — validates `FORGE_ROUTES` constants. **Must update** in PR #2.
- `src/app/(platform)/the-forge/components/__tests__/forge-project-list.test.tsx` — rewrite for v2 list.
- CAD lab tests (`cad-lab/components/__tests__/*`) — **PRESERVE unchanged**.

### 5.4 Sidebar / nav

- `src/components/sidebar/data/workshop.ts` exposes Forge entries. PR #2 should gate new entries behind `new_forge_experience`.
- Redirects from old sidebar items to new ones must be flag-aware.

### 5.5 Email / notifications

- `src/lib/notifications/channels/email.ts:515` uses `https://fractionalforge.app/the-forge/cad-lab`. Path-stable (CAD lab preserved). No change.

---

## 6. Recommended PR #2 scope (decision support)

Based on this audit, PR #2 ships:

1. **New routes** (feature-flagged):
   - `/the-forge-v2` — Workspace index (MIGRATE: `page.tsx`, `forge-project-list`, `forge-project-card`, `recent-projects-grid`, `sample-project-preview`).
   - `/the-forge-v2/create` — PROJECT-CREATE (MIGRATE: `scan-hero`, `new-scan-view`).
   - Feature flag: `new_forge_experience`. When off, legacy routes render.

2. **Do NOT touch in PR #2**:
   - Any file under `/the-forge/cad-lab/**`.
   - Any service file under `/the-forge/services/**`.
   - `lib/forge-routes.ts` — still used by legacy. Add v2 constants alongside, don't rename yet.
   - `xray-view.tsx` / `dossier-view.tsx` — deprecate later, when dossier tabs have v2 replacements.

3. **Defer to PR #3+**:
   - BRIEF, MODULES, BOM, SUPPLIERS, RISKS, COST, GEOMETRY, LAUNCH routes.
   - Dialogs and flows (COMPOSE, APPROVE, ASSUMPTION-TEST, etc).
   - Deep-link rewrites in `next.config.ts` — land only at cutover.
   - Removal of `xray-view.tsx`, `dossier-view.tsx`, accidental `components/page.tsx` — cutover-only.

4. **Housekeeping (separate PR, NOT PR #2)**:
   - `cad-lab/analysis/page.tsx` and `cad-lab/procurement/page.tsx` stubs.
   - Relocating `services/` to `src/lib/forge/services/` (optional, not urgent).

---

## 7. File-count sanity check

| Bucket | Files |
|---|---|
| Top-level `/the-forge` | 4 (`page.tsx`, `loading.tsx`, `xray-view.tsx`, +layout inherited) |
| `components/` | 42 (includes page.tsx leak + 1 tests + 4 hooks) |
| `services/` | 19 |
| `lib/` | 1 |
| `cad-lab/` (shell + utils) | 8 |
| `cad-lab/` stage pages | 7 × (page + some loading) = ~10 files |
| `cad-lab/` legacy stages | 7 |
| `cad-lab/` lib | 1 |
| `cad-lab/` components + tests | 36 + 4 = 40 |
| **Total files audited** | **~132** |

| Decision | Count |
|---|---|
| MIGRATE | 34 (+1 test = 35) |
| DEPRECATE | 3 active + 2 cad-lab stubs flagged for later |
| PRESERVE (CAD tree) | ~60 |
| PRESERVE (services/lib/hooks) | 23 |
| Accidental route | 1 |

---

## 8. Open questions for next agent / Tristan

1. **Does `/the-forge?thread=<id>` need to survive?** Three inbound callers (tasks, objectives). Trivial to keep. Confirm.
2. **Is there prod traffic on `/the-forge/new` or `/the-forge/components`?** Both are currently 404 or unreachable — if zero traffic, simplest to remove instead of redirect.
3. **Should `forge-hover-explanations.tsx` (23KB of microcopy) be rewritten, or lifted verbatim?** Per "No AI emphasis" rule, the legacy copy likely contains banned terms ("AI-powered", "Smart"). Needs a copy pass during MIGRATE.
4. **CAD lab as Geometry drill-in — how is the link rendered?** Does `GEOMETRY` mockup link to `/the-forge/cad-lab/[projectId]` directly, or to `/the-forge-v2/[projectId]/geometry` which then iframes/redirects? Affects `stl-viewer.tsx` MIGRATE plan.
5. **Does PR #2's `PROJECT-CREATE` need to wire into existing `scanIdeaAction` from `src/actions/xray.ts`, or is there a new server action?** If reusing, `scan-hero.tsx`'s logic should transfer 1:1.

---

*Audit complete. All 132 files under `src/app/(platform)/the-forge/**` assigned a decision. PR #2 can proceed with confidence the CAD lab tree stays untouched and the MIGRATE-to-Workspace path is bounded.*
