# Renderer Redesign — ForgeOS PDF Engine v2

**Status:** Design only — zero `.tsx` changes  
**Reference output:** BESS-40FT-LFP-001, Rev A (40 pages)  
**Prompt architecture source:** prompt_architecture.pdf (24 pages), Stage 10  
**Current renderer:** `stages/7-pdf.tsx` (~2,400 lines, React-PDF)  
**Date:** 2026-05-08

---

## Table of Contents

1. Side-by-side comparison (section by section)
2. New renderer architecture
3. Required upstream data shape changes
4. Migration plan
5. Open questions for Tristan

---

## 1. Side-by-Side Comparison

### 1.1 Cover Page / Project Metadata

**Current renderer:**
The cover page renders as a dark-navy full-bleed banner (`coverBanner`) with white title text, an orange bottom border, and the project ID as subtitle. Below the banner is an "Economics Dashboard" panel with stat tiles (unit cost, target ceiling, NRE, spatial allocation, safety coverage, compound score, modules, BOM lines) and a source grading key. The feasibility banner from `state.feasibility.compactBanner` appears as a narrow colour strip between the banner and the content area. There is no page header on the cover — this page uses `coverPage` style without the standard header rule.

**BESS reference:**
The cover renders as a white-background page with a thin running header at top (`BESS-40FT-LFP-001 | Forge Engineering Report | Rev A` in small grey text above a full-width horizontal rule). The title is large bold black serif ("Forge Engineering Report"), with the product subtitle in teal/steel-blue below it, then a pipe-separated one-liner spec string. A bordered amber/orange box follows as the FEASIBILITY DECISION banner — text inside reads label line ("FEASIBILITY DECISION" in small caps orange) and the verdict ("CONDITIONALLY FEASIBLE — Proceed with noted warnings" in bold orange). Then a plain two-column key/value metadata table (Project ID, Product Class, Revision, Generated, Engine Version) with bold left column and plain right column. Then a section heading "Economics" followed by another key/value table (BOM Rows, Estimated Unit Cost with inline source grade tag `[Source grade: D — engineering estimate]`, Target Ceiling, Headroom, Total NRE, Unit Cost + NRE, Cost Status). Then a second table (Modules count, BOM Rows sourced/pending summary). Page number at bottom right.

**What needs to change:**
- Replace dark-navy banner with white-background layout, page header rule, title typography (large bold, subtitle in teal).
- The feasibility banner must move to a proper bordered box (amber border, amber label, amber bold verdict text) — not a full-bleed colour strip.
- Replace stat-tile dashboard with two plain key/value tables (metadata table + economics table). The economics table must include inline source grade tags directly in the value cell (not as separate `GradeLabel` components appended after).
- Add the `PageHeader` component to the cover page (the BESS reference shows the project ID header on every page including the cover).
- Remove "Economics Dashboard" heading; replace with "Economics" as a section heading.
- Cost Status cell must include prose description ("COMPUTED — but exceeds ceiling. See Cost section for reduction paths."), not just a formatted number.
- Headroom must display as a signed number (e.g. `–£67,800  (37.7% over budget)`) when negative.

---

### 1.2 Feasibility Gate Results

**Current renderer (`FeasibilityGatePage`):**
Renders a 4-column table: Check (name), Status (coloured PASS/WARN/FAIL), Reason, Evidence. Checks are hard-coded from `state` fields. Intro paragraph is generic. Below the table is a blue callout with methodology note, then `SourceFooter`. No "Action required" bold callout. The check names are numbered (e.g. "1. Regulatory Standards Identified") rather than matching the pipeline check IDs (e.g. `bom_population`, `cost_feasibility`).

**BESS reference (page 4):**
Same 4-column structure but check names use pipeline internal IDs (`bom_population`, `cost_feasibility`, `layout_feasibility`, etc.). Status badges are coloured text (green PASS, red FAIL, amber WARN) without background. After the table, a bold "Action required:" paragraph calls out the most critical failure in plain prose — no separate callout box, just bold inline text followed by the consequence and required action. The section uses the standard page header.

**What needs to change:**
- Check names must come from pipeline check IDs stored in a `feasibility.checks` array on `PipelineState`, not be hard-coded strings.
- Add an `ActionCallout` component for the post-table "Action required:" block — bold intro, plain prose consequence, source of the check.
- Remove the `SourceFooter` block from this page (BESS reference does not show it here).
- Remove the blue methodology callout box.
- The table needs a 4-column structure with a dark-navy header row (not the current grey `BG_HEADER`). See Section 2 below for the `DarkHeaderTable` component spec.

---

### 1.3 Brief and Requirements

**Current renderer (`BriefPages`):**
Two pages. First page: the raw brief in a neutral callout, then Project Purpose in a neutral callout, Core Objectives as bullets, Key Requirements & Constraints as two side-by-side KV columns, Scope Boundaries, Success Criteria. Second page: Engine-Inferred Assumptions table and Research Sources table. Appendix styling. Source-grading key in the cover page, not this section.

**BESS reference (pages 5–7):**
Single section "Brief and Requirements" spanning pages 5–7. Contains:
- "Overview and Context" as a teal H2 subheading, followed by two paragraphs of prose (product description and strategic rationale).
- "Mission Statement" as teal H2, single paragraph.
- "Target Customers" as teal H2, paragraph.
- "Why Now" as teal H2, paragraph, then `[Source grade: C — industry reports from BNEF, Cornwall Insight, and National Grid ESO published data]` in small italic grey as a standalone line (a source attribution footnote, not a `GradeLabel` inline).
- "Engineering Constraints" as teal H2, then a plain key/value table with bold left column (Unit Cost Ceiling, Target Mass, Target Dimensions, Usable Energy, Power Rating, Cell Chemistry, Design Life, Operating Temperature, Batch Size, Target Process, Target Material, Safety Standard).
- "Research Sources" as a teal H2, intro sentence explaining the grade system (A=test data, B=engineering analysis, C=published, D=expert estimate, E=LLM hypothesis), then a 4-column table (Source, Type, Grade, Relevance) with dark-navy header.

**What needs to change:**
- Rename "Founder's Original Brief" panel to proper narrative prose under an "Overview and Context" subsection heading (teal colour, not the current grey `h2`).
- "Project Purpose" neutral callout → "Mission Statement" teal H2 + plain paragraph.
- Add "Target Customers" and "Why Now" subsections from `state.research.designBrief`.
- Engineering Constraints table must source from `brief.constraints` structured fields, not a mix of prose reconstruction and formatted numbers.
- Research Sources table must use the 4-column BESS schema (Source, Type, Grade, Relevance). Current table has (Title, Type, Year, Relevance) — missing Grade column, has Year instead.
- Source attribution footnotes must render as small italic text below sections, not as `SourceFooter` blocks or `GradeLabel` components.
- The inferred-assumptions appendix page can remain but should not appear before the main brief content.

---

### 1.4 Regulatory and Compliance

**Current renderer (`RegulatorySection`):**
Overview page: 6-column table (Code, Name, Status, £ cost, Weeks, Owner role). Cost and weeks are computed from `computeNreFromRegulatory()`, a heuristic. Per-standard detail pages: pill badges for Status/Owner/Cost/Weeks, then Summary, Applicability (in neutral callout), Engineering Impact, and a two-panel green/amber row for Evidence Required / Gap Action. Grade is always `[D]`.

**BESS reference (pages 8–12):**
Overview page: 5-column table (Standard, Jurisdiction, Status, Grade, Applicability and Impact) with dark-navy header. "Grade" is a single letter column. No cost or weeks columns in the overview table. Then per-standard detail pages: standard name as a teal H2. Below it: a plain KV table (Version, Jurisdiction, Owner, Status, Claim Type, Source Grade — e.g. "C — UNVERIFIED — certificate not yet obtained from CATL"). Then four subsections as teal H3s: **Applicability** (prose paragraph), **Engineering Impact** (prose paragraph), **Evidence Required** (prose paragraph), **Gap Action** (prose paragraph). No callout boxes, no pill badges. No cost/NRE columns on the detail pages. Source grade appears in the KV table, not as a `GradeLabel` component.

**What needs to change:**
- Overview table: replace 6 columns (Code, Name, Status, £, Weeks, Owner) with 5 columns (Standard, Jurisdiction, Status, Grade, Applicability and Impact). Drop the cost/weeks from the overview.
- Per-standard detail pages: drop pill badges. Render as a KV table (Version, Jurisdiction, Owner, Status, Claim Type, Source Grade), then the four teal H3 subsection blocks (Applicability, Engineering Impact, Evidence Required, Gap Action).
- The source grade in the KV table must come from `reg.sourceGrade` on each regulatory entry (a new upstream field — see Section 3).
- "Claim Type" (requirement / recommendation / guidance) is also a new upstream field per standard.
- "Version/date" must come from `reg.versionDate` (new upstream field).
- Replace `computeNreFromRegulatory()` usage on the overview page — it produced cost/weeks columns that the BESS reference does not show in the regulatory section at all. Those go into the Cost section's NRE table instead.
- Add `RegulatoryStandardBlock` component (see Section 2).

---

### 1.5 Sizing and Spatial Allocation

**Current renderer (`SizingSection`):**
Single page. FEASIBLE/INFEASIBLE callout box. System Envelope KV (dimensions, floor area, volume, rules domain). Floor Margin callout (computed from `module_dimensions`). Thermal Margin callout (looked up from modules). Module Allocation Zone Table (4 columns: Module, L×W×H, Area m², Mount). Conflicts callout if any.

**BESS reference (pages 13–14):**
Section heading "Sizing and Spatial Allocation" with intro paragraph explaining the solver. Then "Container Envelope" as teal H2, followed by a plain KV table (External Dimensions, Internal Dimensions, Internal Volume, Usable Floor Area, Target Mass Budget, Container Tare Mass, Available Payload Mass, Layout Feasible — with prose value "YES — 92% volume utilisation, 96% mass utilisation"). Then "Zone Allocation" as teal H2 with an intro paragraph, then a 5-column table (Zone, Length mm, Volume m³, Mass kg, Contents) with dark-navy header. Then "Clearance and Access" as teal H2 with a short paragraph. Then a bold paragraph for the mass-budget warning ("Total allocated mass: 23,600 kg. Remaining mass budget: 650 kg (2.7% margin for cables, fasteners, and contingency). This is tight — detailed cable harness mass estimation is required before design freeze.") — this is the `ActionCallout` pattern.

**What needs to change:**
- KV table must add Internal Dimensions, Container Tare Mass, Available Payload Mass, Layout Feasible (as a prose string "YES — X% volume utilisation, Y% mass utilisation").
- Zone table must use the BESS 5-column schema (Zone name, Length mm, Volume m³, Mass kg, Contents). Currently the renderer uses a generic per-module table from `module_dimensions`; it needs a `sizing.zones` array from the upstream solver output (new upstream field — see Section 3).
- Add "Clearance and Access" text from `sizing.clearanceNotes` (new upstream field).
- The tight-mass-budget warning must render as an `ActionCallout` (bold paragraph), not a neutral callout box.
- Volume utilisation and mass utilisation percentages must come from solver output fields `sizing.volumeUtilisationPct` and `sizing.massUtilisationPct` (new upstream fields).

---

### 1.6 System Modules

**Current renderer (`ModulesSection`):**
One page per module. Header: section label `h5` + module name `h1` + grade label. Maturity and mass as pill badges. Then Purpose, Why It Matters (in neutral callout), Technical Description, Key Specs (KV pairs from `m.specs`), then BOM table (7 columns: Part #, Description, Supplier, Gr., Qty, Unit £, Ext £), a module subtotal row, cost-basis appendix block, and datasheet-evidence block.

**BESS reference (pages 15–31):**
Overview table first (page 15): "System Modules and Architecture" H1 with intro paragraph explaining ENGINEERING vs PRELIMINARY maturity tiers. Then a 5-column overview table (Module, Maturity, BOM Rows, Est. Cost, Mass) with dark-navy header. Maturity values are coloured (ENGINEERING = teal/green, PRELIMINARY = amber/orange). Then each module gets its own pages. Module heading is bold black H1 (not teal). Below the heading: a bordered teal info box (the "module maturity banner") showing "Module Maturity: ENGINEERING | Lead Time: 12 weeks (...) | Status: Preliminary design complete". Then teal H2 subsections: Purpose (prose), Why It Matters to the System (prose), Technical Description (prose). Then "Key Specifications" as teal H2, followed by a plain KV table (Mass, Dimensions, Interfaces, Estimated Cost). Then "Bill of Materials" as teal H2, followed by a 7-column BOM table (Part, Qty, Unit £, Total £, M/B, Supplier, Gr.) with dark-navy header. MODULE TOTAL row at bottom in bold. The BOM table has no Part Number column — it uses descriptive part names.

**What needs to change:**
- Add a module overview summary table before the individual module pages. Current renderer goes straight to per-module pages with no overview table.
- Module maturity banner must be a bordered teal info box (not pill badges). Must include Lead Time and Status text from `m.estimatedLeadTimeWeeks` and a new `m.statusNote` field (see Section 3).
- BOM table column order must change from (Part #, Description, Supplier, Gr., Qty, Unit £, Ext £) to (Part, Qty, Unit £, Total £, M/B, Supplier, Gr.). The current `Make/Buy` flag (`p.isPurchased`) maps to the M/B column as "Buy" or "Make".
- Module maturity values in the overview table must be colour-coded (teal for ENGINEERING, amber for PRELIMINARY).
- Subsection headings must use teal colour (not the current dark grey `h4`).

---

### 1.7 Bill of Materials and Cost (BOM Cost Section)

**Current renderer (`CostWaterfallSection`):**
Single page. Unit cost waterfall table (3 columns: Line, Rationale, £ per unit). Per-module BOM totals table (2 columns: Module, £ subtotal). NRE table (3 columns: Standard/activity, Scope, £ total). Ceiling comparison table. Benchmark comparison block (BENCH-L1). Cost reduction paths table (3 columns: Strategy, Est. savings, Effort). A benchmark check badge appears inline above the per-module table.

**BESS reference (pages 32–33):**
Section heading "Cost Waterfall and Economics". An amber bordered callout box ("COST CEILING EXCEEDED") at the top showing: title in bold amber caps, then pipe-separated summary ("Estimated unit cost: £190,472 | Target ceiling: £180,000 | Overshoot: £10,472 (5.8%)"), then a prose consequence. Then "BOM Cost by Module" as teal H2 with a 4-column table (Module, BOM Cost, % of BOM, Grade) with dark-navy header. Then "Overhead and Assembly Costs" teal H2 with a plain KV-style table (BOM Total, Assembly Labour 15%, Factory Testing, Shipping, Overheads 8%, Contingency 10%, ESTIMATED UNIT COST — in bold caps). Then "Non-Recurring Engineering (NRE)" teal H2 with an intro sentence and a 2-column table (NRE Item, Cost). Then "Cost Reduction Paths" teal H2 with an intro sentence and a 4-column table (Option, Saving, Trade-off, Feasible?).

**What needs to change:**
- Cost ceiling exceeded banner must render as a bordered callout (amber when WARN, red when hard FAIL) with structured content: bold caps title, pipe-separated summary line, prose consequence — not the current audit-log style.
- BOM Cost by Module table must add a "% of BOM" column and a "Grade" column. Current table has 2 columns (Module, £ subtotal).
- Overhead/Assembly table must list each overhead line item explicitly (Assembly Labour %, Factory Testing £ flat, Shipping £ flat, Overheads %, Contingency %) — not computed from a single `overheadMultiplier`. These values must come from upstream cost computation fields (see Section 3).
- NRE table must use 2 columns (NRE Item, Cost) — not the current 3-column (Standard/activity, Scope, £ total). NRE items must list individual activities (UL test, G99 test, BMS firmware, etc.) not just per-standard codes.
- Cost reduction paths table must add a "Feasible?" column with coloured values (Yes/No/Maybe).
- Remove the BENCH-L1 benchmark comparison block from this section (it is not in the BESS reference cost section).

---

### 1.8 Research Sources

**Current renderer:**
Research sources render in the `BriefPages` appendix page as a 4-column table (Title, Type, Year, Relevance), only shown if `b.sources` exists.

**BESS reference (page 6, within Brief section):**
"Research Sources" is a top-level section within the Brief, rendered with an intro paragraph explaining the grade system (A=test data, B=engineering analysis, C=published, D=expert estimate, E=LLM hypothesis). Then a 4-column table (Source, Type, Grade, Relevance) with a dark-navy header. The "Source" column uses the source name/title; "Grade" is a single letter. No Year column.

**What needs to change:**
- Add a `Grade` column to the sources table; drop the `Year` column.
- The source grade value must come from `src.sourceGrade` on each `SourceCitation` (new upstream field — see Section 3).
- Move Research Sources from the appendix page into the Brief section body, after "Engineering Constraints".

---

### 1.9 Risk Register (FMEA)

**Current renderer:**
FMEA renders from `state.modules[].riskMatrix[]`. There is no overview table. Each risk within each module renders inline on that module's page. The `RiskRow` schema has: `id`, `hazard`, `cause`, `consequence`, `existingControls`, `severity`, `likelihood`, `detection`, `mitigation`, `verificationTest`, `owner`.

**BESS reference (pages 34–38):**
Section heading "Risk Register (FMEA)". Intro paragraph explaining the FMEA schema (S, O, D each 1–10, RPN = S×O×D, detection captures likelihood of escaping undetected). Note that all risks are Grade D. Then a 7-column summary table (ID, Module, Failure Mode, S, O, D, RPN, Owner, Gr.) with dark-navy header. RPN values are coloured (high RPN in red/amber). Then each risk gets its own detail block as: risk ID + title as a teal H2, then a plain KV table (Module, Cause, Local Effect, System Effect, Severity/Occurrence/Detection with "= RPN NNN", Existing Controls, Planned Mitigation, Verification Test, Owner, Source Grade, Status — e.g. "OPEN — verification test not yet executed").

**What needs to change:**
- FMEA must move to its own section (currently scattered inside module pages). The renderer needs a `RiskRegisterSection` component.
- Add FMEA summary overview table (7 columns).
- Each risk detail block: add KV rows for Local Effect, System Effect, Existing Controls, Planned Mitigation, Verification Test, Status. Currently the renderer shows the risk as a table row only, with no per-risk detail expansion.
- "Status" (OPEN/CLOSED) must come from a new `r.status` field (see Section 3).
- "Planned Mitigation" must come from `r.mitigation` (exists in current schema but not rendered in FMEA section).
- The risk detail page uses the same teal subsection heading pattern — needs the `RegulatoryStandardBlock` pattern applied.

---

### 1.10 Audit Log

**Current renderer:**
No dedicated Audit Log section in the current renderer. The `sourceAttributions` and `llmAttributions` arrays are used for `SourceFooter` blocks on individual pages, not aggregated into a standalone section.

**BESS reference (page 39):**
Section heading "Audit Log" with subtitle "Pipeline execution trace for this report generation." Then a 5-column table (Pipeline Step, Status, Duration, Source, Notes) with dark-navy header. Status values are coloured (Complete in green, COMPUTED in amber, FEASIBLE in teal, WARN in amber, FULL (with warnings) in amber). Each pipeline step is a row.

**What needs to change:**
- Add a `AuditLogSection` component. This requires a new `pipelineTrace` array on `PipelineState` (see Section 3) — an ordered list of pipeline execution steps with status, source, and notes for each.
- Status colours: Complete=green, FEASIBLE=teal, COMPUTED=amber, WARN=amber, FAIL=red, BLOCKED=red.
- Current `sourceAttributions` (an unordered array of `{ section, source, detail }`) is not sufficient; it doesn't represent execution order or per-step status.

---

### 1.11 Source Attribution (end-of-report summary)

**Current renderer:**
Per-section `SourceFooter` blocks scattered throughout, showing "Data Sources" and "Overall Section Grade" at the bottom of each page. No consolidated end-of-report attribution table.

**BESS reference (page 40):**
Section heading "Source Attribution". Intro paragraph explaining the grade system. Then a 4-column table (Section, Grade, Source, Verification Status) with dark-navy header. Each row covers a report section. A bold closing disclaimer paragraph. This is the last page of the report.

**What needs to change:**
- Add a `SourceAttributionSection` component rendering the consolidated table.
- Remove per-section `SourceFooter` blocks (or reduce them to a footnote line).
- The table data must come from a new `pipelineSourceSummary` array on `PipelineState` (see Section 3).

---

### 1.12 Executive Summary

**Current renderer (`ExecutiveSummaryPage`):**
One page. Title with grade label. Project name as H2, description as prose, feasibility verdict in a left-bordered callout, then four stat tiles in a 2×2 grid (Est. Unit Cost, NRE Total, Complexity, Compound Quality), then a top-3 risks table.

**BESS reference:**
The BESS reference does not have a separate Executive Summary page — the cover page serves this function. In the prompt_architecture Stage 10, executive summary is listed as a section that exists in the `FULL_REPORT` output.

**What needs to change:**
The executive summary rendering is not directly referenced in the BESS PDF but the prompt_architecture confirms it should exist. The current design (stat tiles + top risks) can remain, but the layout should be updated to match the BESS visual style — no dark stat tiles with coloured tops; instead use a KV table for key metrics, the feasibility decision as a bordered callout box (same style as the cover page), and the risk table with dark-navy headers.

---

## 2. New Renderer Architecture

### 2.1 Design Tokens

Replace the current brand-orange palette with the BESS dual-palette:

```
BESS_TEAL     = '#2563ae'   // section headings, subsection headings, module maturity
BESS_NAVY     = '#1e3a5f'   // table header backgrounds
BESS_AMBER    = '#d97706'   // WARN state, feasibility CONDITIONALLY FEASIBLE
BESS_GREEN    = '#16a34a'   // PASS, FEASIBLE, ENGINEERING maturity
BESS_RED      = '#dc2626'   // FAIL, INFEASIBLE
HEADER_RULE   = '#cccccc'   // thin horizontal rule in page header
TABLE_BORDER  = '#cccccc'   // table outer and inner borders
HEADER_TEXT   = '#ffffff'   // text on dark-navy table headers
INK           = '#1a1a1a'   // body text
MUTED         = '#666666'   // secondary text, source grade tags
```

The existing orange `BRAND` token can remain for internal-facing use (ForgeOS UI) but must not appear in the BESS-style PDF output.

---

### 2.2 Component Inventory

The following 14 new or replaced components are required. Existing components marked [RETIRE] should be removed or deprecated in `7-pdf-v2.tsx`.

| # | Component | Replaces | Purpose |
|---|-----------|----------|---------|
| 1 | `PageHeader` | Nothing (new) | Running header: project ID + pipe + "Forge Engineering Report" + pipe + Rev A, above a thin horizontal rule. Fixed=true. On every page. |
| 2 | `PageFooter` (revised) | Existing `PageFooter` | Keep existing, but change to: left = nothing (BESS shows nothing left), right = "Page N". Remove section text from left. |
| 3 | `FeasibilityDecisionBanner` | The current colour-strip banner | Bordered box (amber/red/green border). Two lines: small-caps label ("FEASIBILITY DECISION") + bold verdict. Width = 100%. |
| 4 | `KVTable` | Existing `KV` + wrapping code | Full-width two-column key/value table with bold left column and plain right column. Border around entire table, internal row dividers. Accepts optional `sourceGradeInline` on individual values. |
| 5 | `DarkHeaderTable` | Existing `tableWrap`+`tHead` pattern | Multi-column table with dark-navy header row (white text, bold). Accepts column spec array `{label, width, align}`. Handles alternating row tinting. |
| 6 | `SourceGradeTag` | Existing `GradeLabel` | Inline text element: `[Source grade: X — description]` in small grey italic, rendered as a `<Text>` node after the value it annotates. |
| 7 | `MaturityBanner` | Pill badge pattern | Bordered teal info box. Content: "Module Maturity: X | Lead Time: Y weeks (detail) | Status: Z" in small monospace or condensed text. Used at the top of each module page. |
| 8 | `TealH2` | Existing `h2` style | Section subheading in BESS_TEAL, font size 14, bold, margin top 20 bottom 8. No border. |
| 9 | `TealH3` | Existing `h3` style | Subsection heading in BESS_TEAL, font size 11, bold, margin top 16 bottom 6. |
| 10 | `ActionCallout` | Existing calloutAmber/calloutRed | Plain bold paragraph (no border box). Text starts "Action required:" in bold, continues in regular weight. Used after feasibility table, sizing tight-margin warning, cost ceiling exceeded note. |
| 11 | `RegulatoryStandardBlock` | Current per-reg detail page layout | Per-standard layout: KV table (Version, Jurisdiction, Owner, Status, Claim Type, Source Grade), then four TealH3 subsections (Applicability, Engineering Impact, Evidence Required, Gap Action). |
| 12 | `RiskDetailBlock` | No equivalent exists | Per-risk layout: risk ID + title as TealH2, KV table (Module, Cause, Local Effect, System Effect, S/O/D = RPN N, Existing Controls, Planned Mitigation, Verification Test, Owner, Source Grade, Status). |
| 13 | `AuditLogSection` | Nothing (new section) | Full-page section with pipeline trace table. Dark-navy header. Status values coloured. |
| 14 | `SourceAttributionSection` | Per-page `SourceFooter` blocks | End-of-report consolidated attribution table. |

[RETIRE]:
- `SourceFooter` component (replaced by end-of-report `SourceAttributionSection`)
- `GradeLabel` component (replaced by `SourceGradeTag`)
- `stat`, `statRow`, `statLabel`, `statValue`, `statSub` style tokens (replaced by `KVTable`)
- `coverBanner` style (replaced by white-background cover with `PageHeader`)
- `calloutNeutral`, `calloutBlue`, `calloutGreen`, `calloutAmber`, `calloutRed` styles (replaced by `ActionCallout` for action-required cases; bordered `FeasibilityDecisionBanner` for decision cases; inline prose for everything else)
- `pillWrap`, `pill`, `pillMuted` styles (replaced by `MaturityBanner`)

---

### 2.3 Page Layout and Data Flow

```
PipelineState
├── projectId                          → PageHeader (all pages)
├── feasibility                        → FeasibilityDecisionBanner (cover)
│   ├── checks[]                       → DarkHeaderTable (feasibility gate page)
│   └── actionRequired                 → ActionCallout (feasibility gate page)
├── research.designBrief               → BriefSection
│   ├── useCase / mission / targetCustomers / whyNow  → prose subsections
│   ├── constraints (structured)       → KVTable (Engineering Constraints)
│   └── sources[].sourceGrade          → DarkHeaderTable (Research Sources)
├── research.designBrief.regulatory[]  → RegulatorySection
│   ├── [].sourceGrade                 → RegulatoryStandardBlock KV row
│   ├── [].versionDate                 → RegulatoryStandardBlock KV row
│   ├── [].claimType                   → RegulatoryStandardBlock KV row
│   └── [].verificationStatus          → RegulatoryStandardBlock KV row
├── sizing                             → SizingSection
│   ├── .zones[]                       → DarkHeaderTable (Zone Allocation)
│   ├── .volumeUtilisationPct          → KVTable (Layout Feasible row)
│   ├── .massUtilisationPct            → KVTable (Layout Feasible row)
│   └── .clearanceNotes                → TealH2 + prose
├── modules[]                          → ModulesSection
│   ├── [].maturity                    → MaturityBanner + overview table colour
│   ├── [].estimatedLeadTimeWeeks      → MaturityBanner
│   ├── [].statusNote                  → MaturityBanner
│   └── [].bomRows[]                   → DarkHeaderTable (BOM per module)
├── costBreakdown                      → CostSection
│   ├── .overheadLines[]               → KVTable (Overhead & Assembly)
│   ├── .nreItems[]                    → DarkHeaderTable (NRE)
│   ├── .reductionPaths[]              → DarkHeaderTable (Cost Reduction Paths)
│   └── .ceilingStatus                 → FeasibilityDecisionBanner variant
├── fmea[]                             → RiskRegisterSection
│   ├── [].status                      → RiskDetailBlock KV row
│   └── [].gradeOverride               → RiskDetailBlock KV row
├── pipelineTrace[]                    → AuditLogSection
└── pipelineSourceSummary[]            → SourceAttributionSection
```

---

### 2.4 Section Render Order

The BESS reference section order (matching the prompt_architecture FULL_REPORT definition):

1. Cover Page (project metadata + feasibility decision + economics KV tables)
2. Feasibility Gate Results
3. Brief and Requirements (including Research Sources subsection)
4. Regulatory and Compliance (overview table + per-standard detail pages)
5. Sizing and Spatial Allocation
6. System Modules and Architecture (overview table + per-module pages)
7. Cost Waterfall and Economics
8. Risk Register (FMEA)
9. Audit Log
10. Source Attribution

The current renderer order is: Cover → Table of Contents → Executive Summary → Feasibility Gate → Brief (two pages) → Regulatory → Sizing → Modules → Cost → Suppliers (three pages) → FMEA (inline in modules) → Research → Audit Log.

The new renderer drops the Table of Contents (BESS reference does not have one). The Executive Summary merges into the Cover page (the BESS reference cover page serves as executive summary). Supplier shortlist pages (SupplierBuySection, SupplierMakeSection, SupplierServicesSection) are retained as-is — the BESS reference does not have an explicit supplier shortlist section, but Stage 10 in the prompt_architecture allows for it and the current implementation should not be dropped. They render between Cost and Risk Register.

---

## 3. Required Upstream Data Shape Changes

The following fields do not currently exist on `PipelineState` or its sub-types but are required by the new renderer. Each entry includes the stage responsible for producing it.

### 3.1 Feasibility Gate — new fields on `PipelineState`

| Field path | Type | Description | Producing stage |
|---|---|---|---|
| `feasibility.checks[]` | `FeasibilityCheck[]` | Array of check results with machine IDs | Stage 8 (deterministic) |
| `feasibility.checks[].checkId` | `string` | Machine ID e.g. `bom_population`, `cost_feasibility` | Stage 8 |
| `feasibility.checks[].status` | `'PASS' \| 'WARN' \| 'FAIL'` | Result | Stage 8 |
| `feasibility.checks[].reason` | `string` | Human-readable explanation | Stage 8 |
| `feasibility.checks[].evidence` | `string` | Compact key=value evidence string | Stage 8 |
| `feasibility.overallStatus` | `'PASS' \| 'WARN' \| 'FAIL' \| 'BLOCKED'` | Aggregate | Stage 8 |
| `feasibility.reportType` | `'FULL_REPORT' \| 'FEASIBILITY_EXCEPTION' \| 'BRIEF_INCOMPLETE'` | Controls section inclusion | Stage 9 |
| `feasibility.actionRequired` | `string \| null` | Bold action callout text after the checks table | Stage 8 |

**Currently:** `state.feasibility` is cast via `(state as any).feasibility` and only `status` and `compactBanner` are used. The checks array is hard-coded in the renderer from ad-hoc state field checks.

---

### 3.2 Regulatory — new fields on `RegulatoryItem`

| Field path | Type | Description | Producing stage |
|---|---|---|---|
| `RegulatoryItem.sourceGrade` | `'A' \| 'B' \| 'C' \| 'D' \| 'E'` | Provenance grade for the standard's applicability assessment | Stage 4 (LLM) |
| `RegulatoryItem.versionDate` | `string` | e.g. "Ed. 2 (2022)", "Issue 6 (2023)" | Stage 4 (LLM) |
| `RegulatoryItem.claimType` | `'requirement' \| 'recommendation' \| 'guidance'` | Type of obligation | Stage 4 (LLM) |
| `RegulatoryItem.verificationStatus` | `string` | e.g. "UNVERIFIED — certificate not yet obtained" | Stage 4 (LLM) |
| `RegulatoryItem.jurisdiction` | `string` | e.g. "International / UK adopted" | Stage 4 (LLM) |

**Currently:** `RegulatoryItem` has `code`, `name`, `summary`, `status`, `applicability`, `designImpact`, `evidenceRequired`, `ownerRole`, `gapAction`. Missing: `sourceGrade`, `versionDate`, `claimType`, `verificationStatus`, `jurisdiction`.

---

### 3.3 Research Sources — new field on `SourceCitation`

| Field path | Type | Description | Producing stage |
|---|---|---|---|
| `SourceCitation.sourceGrade` | `'A' \| 'B' \| 'C' \| 'D' \| 'E'` | Grade for this individual source | Stage 3 (LLM) |

**Currently:** `SourceCitation` has `title`, `type`, `year`, `publisher`, `relevance`, `uri`. Missing: `sourceGrade`.

---

### 3.4 Sizing — new fields on `DimensionSheet`

| Field path | Type | Description | Producing stage |
|---|---|---|---|
| `DimensionSheet.zones[]` | `SizingZone[]` | Named zones with length, volume, mass, contents | Stage 7a (deterministic sizing solver) |
| `DimensionSheet.zones[].name` | `string` | e.g. "Battery Zone" | Stage 7a |
| `DimensionSheet.zones[].lengthMm` | `number` | Zone length in mm | Stage 7a |
| `DimensionSheet.zones[].volumeM3` | `number` | Zone volume in m³ | Stage 7a |
| `DimensionSheet.zones[].massKg` | `number` | Allocated mass in kg | Stage 7a |
| `DimensionSheet.zones[].contents` | `string` | Prose list of what lives in the zone | Stage 7a |
| `DimensionSheet.volumeUtilisationPct` | `number` | e.g. 92 | Stage 7a |
| `DimensionSheet.massUtilisationPct` | `number` | e.g. 96 | Stage 7a |
| `DimensionSheet.externalDimensionsMm` | `{ w: number; d: number; h: number }` | Outer envelope | Stage 7a |
| `DimensionSheet.internalDimensionsMm` | `{ w: number; d: number; h: number }` | Inner envelope after insulation | Stage 7a |
| `DimensionSheet.tareMassKg` | `number` | Container tare | Stage 7a |
| `DimensionSheet.availablePayloadMassKg` | `number` | Max payload = total budget minus tare | Stage 7a |
| `DimensionSheet.clearanceNotes` | `string` | Prose description of aisles, clearances | Stage 7a |
| `DimensionSheet.massMarginNote` | `string \| null` | Tight-margin warning text for ActionCallout | Stage 7a |

**Currently:** `DimensionSheet` has `feasible`, `rules_domain`, `envelope` (interior dims only), `floor_budget_m2`, `module_dimensions` (keyed by module name, not named zones), `conflicts`, `recommendations`. It lacks zones, utilisation percentages, external/internal dimension split, tare/payload split, and clearance notes.

---

### 3.5 Modules — new fields on `Module`

| Field path | Type | Description | Producing stage |
|---|---|---|---|
| `Module.maturity` | `'CONCEPTUAL' \| 'PRELIMINARY' \| 'ENGINEERING'` | Maturity classification | Stage 5 (LLM) |
| `Module.statusNote` | `string` | e.g. "Preliminary design complete" | Stage 5 (LLM) |
| `Module.estimatedLeadTimeWeeks` | `number` | Already exists — but must be populated by Stage 5 | Stage 5 (LLM) |
| `Module.bomRows` | `number` | Count of BOM rows for this module (for overview table) | Stage 6 (BOM) |
| `Module.estimatedCostGbp` | `number \| null` | Module BOM total (for overview table) | Stage 6 (BOM) |
| `Module.keySpecifications` | `{ label: string; value: string }[]` | Structured KV specs (Mass, Dimensions, Interfaces, Est. Cost) | Stage 5 (LLM) |

**Currently:** `Module` has `status` (free-form string, not the CONCEPTUAL/PRELIMINARY/ENGINEERING enum), no `maturity` field, no `statusNote`, no `bomRows` count, no `estimatedCostGbp`, and `specs` (a typed `ModuleSpecs` with named numeric fields) rather than a flexible `keySpecifications[]` array. The `estimatedLeadTimeWeeks` field exists but is often null.

**Note:** The new `Module.maturity` enum is distinct from the existing `Module.status` field. Do not rename — keep `status` as-is for pipeline compatibility and add `maturity` as a separate field.

---

### 3.6 Cost — new fields on `CostBreakdown`

| Field path | Type | Description | Producing stage |
|---|---|---|---|
| `CostBreakdown.overheadLines[]` | `CostOverheadLine[]` | Explicit breakdown of assembly/test/shipping/overhead/contingency | Stage 7b (deterministic) |
| `CostBreakdown.overheadLines[].label` | `string` | e.g. "Assembly Labour (15% of BOM)" | Stage 7b |
| `CostBreakdown.overheadLines[].gbp` | `number` | Amount in GBP | Stage 7b |
| `CostBreakdown.nreItems[]` | `NreItem[]` | Named NRE activities with costs | Stage 7b (or Stage 4) |
| `CostBreakdown.nreItems[].label` | `string` | e.g. "UL 9540A system-level fire test" | Stage 7b |
| `CostBreakdown.nreItems[].gbp` | `number` | Cost in GBP | Stage 7b |
| `CostBreakdown.reductionPaths[]` | `CostReductionPath[]` | Cost reduction options | Stage 7b or brief rebrief loop |
| `CostBreakdown.reductionPaths[].option` | `string` | Description of the option | Stage 7b |
| `CostBreakdown.reductionPaths[].savingGbp` | `string` | e.g. "~£55,000" | Stage 7b |
| `CostBreakdown.reductionPaths[].tradeoff` | `string` | Prose description of the trade-off | Stage 7b |
| `CostBreakdown.reductionPaths[].feasible` | `'Yes' \| 'No' \| 'Maybe' \| 'At volume'` | Feasibility assessment | Stage 7b |
| `CostBreakdown.perModule[].pctOfBom` | `number` | Percentage of total BOM cost | Stage 7b |
| `CostBreakdown.perModule[].grade` | `string` | Source grade for this module's cost | Stage 7b |
| `CostBreakdown.ceilingExceededBanner` | `string \| null` | Prose for the cost ceiling callout box | Stage 7b |

**Currently:** `CostBreakdown` has `unitTotalGbp`, `ceilingGbp`, `perModule[]` (with `moduleName`, `totalGbp` — no pct, no grade), `overheadMultiplier` (single number), `nreTotalGbp` (single number), `rawBomCostGbp`. The renderer reconstructs overhead lines with hard-coded percentages and hard-codes four cost reduction paths. NRE items are computed from `computeNreFromRegulatory()`. None of these are stored on `CostBreakdown`.

---

### 3.7 FMEA — new fields on `RiskRow`

| Field path | Type | Description | Producing stage |
|---|---|---|---|
| `RiskRow.status` | `'OPEN' \| 'CLOSED' \| 'IN_PROGRESS'` | Verification status | Stage 5 (LLM) |
| `RiskRow.gradeOverride` | `'A' \| 'B' \| 'C' \| 'D' \| 'E' \| null` | Source grade for this risk (defaults to D) | Stage 5 (LLM) |
| `RiskRow.moduleId` | `string` | Parent module ID — needed to move FMEA out of the module pages | Stage 5 (LLM) |

**Currently:** `RiskRow` has `id`, `hazard`, `cause`, `consequence`, `existingControls`, `severity`, `likelihood`, `detection`, `mitigation`, `verificationTest`, `owner`. Missing: `status`, `gradeOverride`. The `moduleId` is implied by the fact that risks live inside `Module.riskMatrix[]`, but a top-level FMEA requires it to be explicit.

**Additionally:** A top-level `state.fmea: RiskRow[]` array is needed for the `RiskRegisterSection` component to avoid iterating all modules. This can be computed at render time by flattening `state.modules[].riskMatrix[]` with `moduleId` injection, but it is cleaner to populate it upstream.

---

### 3.8 Audit Log — new fields on `PipelineState`

| Field path | Type | Description | Producing stage |
|---|---|---|---|
| `PipelineState.pipelineTrace[]` | `PipelineTraceEntry[]` | Ordered execution record | All stages (appended) |
| `PipelineTraceEntry.step` | `string` | Stage name e.g. "Brief parsing" | Each stage |
| `PipelineTraceEntry.status` | `string` | e.g. "Complete", "FEASIBLE", "WARN" | Each stage |
| `PipelineTraceEntry.durationMs` | `number \| null` | Wall-clock duration | Each stage |
| `PipelineTraceEntry.source` | `string` | e.g. "LLM (Claude Opus 4.6)", "Deterministic" | Each stage |
| `PipelineTraceEntry.notes` | `string` | e.g. "47 rows; 38 sourced, 9 pending" | Each stage |

**Currently:** `PipelineState` has `sourceAttributions[]` (unordered, no status) and `llmAttributions[]` (no status). Neither carries execution order or per-step status codes. The `StageResult<T>` interface has `durationMs` but it is not aggregated onto `PipelineState`.

---

### 3.9 Source Attribution Summary — new fields on `PipelineState`

| Field path | Type | Description | Producing stage |
|---|---|---|---|
| `PipelineState.pipelineSourceSummary[]` | `SourceSummaryEntry[]` | Per-section source attribution for end-of-report table | Stage 10 / orchestrator |
| `SourceSummaryEntry.section` | `string` | Report section name | Stage 10 |
| `SourceSummaryEntry.grade` | `string` | Overall grade letter or range e.g. "C/D" | Stage 10 |
| `SourceSummaryEntry.source` | `string` | e.g. "User brief + market reports" | Stage 10 |
| `SourceSummaryEntry.verificationStatus` | `string` | e.g. "Market claims cross-referenced with BNEF" | Stage 10 |

**Currently:** No equivalent exists. Per-page `SourceFooter` blocks each have their own local source list.

---

### 3.10 Summary Count

Total new fields required: **52 fields** across 9 data structures. Of these:

- 7 are new top-level fields on `PipelineState` (feasibility sub-object fields, pipelineTrace, pipelineSourceSummary)
- 5 are new fields on `RegulatoryItem`
- 1 is a new field on `SourceCitation`
- 14 are new fields on `DimensionSheet`
- 6 are new fields on `Module`
- 11 are new fields on `CostBreakdown`
- 3 are new fields on `RiskRow`
- 5 are new `PipelineTraceEntry` fields (new interface)
- 4 are new `SourceSummaryEntry` fields (new interface)

Fields that can be backfilled by the renderer without upstream changes (computed at render time, acceptable as a first-pass):
- `Module.bomRows` — count `state.parts.filter(p => p.sourceModuleId === m.id).length`
- `Module.estimatedCostGbp` — sum from `CostBreakdown.perModule`
- `DimensionSheet.volumeUtilisationPct` — can be inferred if the solver already computes it internally
- Flattened FMEA array — flatten `modules[].riskMatrix[]`

Fields that **cannot** be backfilled at render time and **must** come from upstream before the v2 renderer is enabled:
- `feasibility.checks[]` with machine IDs and `actionRequired`
- `RegulatoryItem.sourceGrade`, `versionDate`, `claimType`, `verificationStatus`, `jurisdiction`
- `DimensionSheet.zones[]`, `externalDimensionsMm`, `internalDimensionsMm`, `tareMassKg`, `availablePayloadMassKg`
- `CostBreakdown.overheadLines[]`, `nreItems[]`, `reductionPaths[]`, `perModule[].pctOfBom`
- `pipelineTrace[]`

---

## 4. Migration Plan

### 4.1 Build strategy

The new renderer is built as `stages/7-pdf-v2.tsx` alongside the existing `stages/7-pdf.tsx`. The existing file is not touched. The orchestrator (`index.ts` / `run.ts`) selects the renderer via an env flag:

```
FORGE_PDF_RENDERER=v2   # activates 7-pdf-v2.tsx
FORGE_PDF_RENDERER=v1   # default, uses existing 7-pdf.tsx
```

Alternatively, a per-project flag on the project record (`pdf_renderer_version: 'v1' | 'v2'`) allows A/B testing on live projects without a deploy change.

### 4.2 Shared components directory

New components defined in Section 2.2 live in `stages/pdf-components/` so they can be imported by both `7-pdf.tsx` and `7-pdf-v2.tsx` if any backporting is desired:

```
stages/pdf-components/
  PageHeader.tsx
  FeasibilityDecisionBanner.tsx
  KVTable.tsx
  DarkHeaderTable.tsx
  SourceGradeTag.tsx
  MaturityBanner.tsx
  TealH2.tsx
  ActionCallout.tsx
  RegulatoryStandardBlock.tsx
  RiskDetailBlock.tsx
  AuditLogSection.tsx
  SourceAttributionSection.tsx
```

### 4.3 Data shape migration sequence

The upstream field changes (Section 3) must land **before** `7-pdf-v2.tsx` is enabled for production. Suggested order:

1. **Phase A — Feasibility gate fields** (`feasibility.checks[]`, `feasibility.actionRequired`, `feasibility.reportType`). Required for the Feasibility Gate page and cover page. Stage 8 already computes the checks; this is a schema change to expose them on `PipelineState`.

2. **Phase B — Regulatory fields** (`RegulatoryItem.sourceGrade`, `versionDate`, `claimType`, `verificationStatus`, `jurisdiction`). Stage 4 prompt already requests these per the prompt_architecture Stage 4 schema. The `types.ts` `RegulatoryItem` interface needs extension.

3. **Phase C — Sizing zones** (`DimensionSheet.zones[]` and utilisation fields). This requires updating the Stage 7a sizing solver to emit the zone array. For products with the `iso_container_layout` solver, zones are already computed internally.

4. **Phase D — Cost breakdown items** (`CostBreakdown.overheadLines[]`, `nreItems[]`, `reductionPaths[]`). Stage 7b cost computation already has the data to produce these; it is a matter of restructuring the output.

5. **Phase E — Module fields** (`Module.maturity`, `statusNote`, `keySpecifications[]`). Stage 5 decomposition prompt already requests `maturity` per the prompt_architecture schema; `types.ts` needs the new fields.

6. **Phase F — FMEA and Audit Log** (`RiskRow.status`, `pipelineTrace[]`, `pipelineSourceSummary[]`). The orchestrator needs to append a trace entry after each stage completes.

### 4.4 Estimated code volume

| Item | Est. lines |
|---|---|
| New `pdf-components/` files (14 components) | ~600 |
| `7-pdf-v2.tsx` main document + section components | ~900 |
| `types.ts` extensions (new interfaces + fields) | ~120 |
| Stage 8 schema changes (feasibility.checks[]) | ~40 |
| Stage 7a solver zone output | ~60 |
| Stage 7b cost breakdown restructure | ~60 |
| Orchestrator trace append | ~30 |
| **Total new/changed** | ~1,810 |

Lines removed from `7-pdf.tsx` when retired: ~2,400 (eventually). During migration, both files coexist.

### 4.5 Estimated wall-clock effort

| Phase | Effort |
|---|---|
| Component library (14 components, design tokens) | 3–4 Sonnet hours |
| Section renderers (Cover, Feasibility, Brief, Regulatory, Sizing, Modules, Cost, FMEA, Audit Log, Source Attribution) | 5–6 Sonnet hours |
| Upstream data shape changes (types + stage modifications) | 2–3 Sonnet hours |
| Integration testing against BESS test fixture | 1–2 Sonnet hours |
| **Total estimate** | **11–15 Sonnet hours** |

The component library phase can run in parallel with the upstream data shape changes, as the components can be built against the target schemas before the schemas are live.

---

## 5. Open Questions for Tristan

### Q1: Source grade display — inline vs footnote vs end-of-section?

The BESS reference uses three different patterns for source grade display:
- Inline in the value cell (Economics table on cover: `£247,800  [Source grade: D — engineering estimate]`)
- In a dedicated KV row (Regulatory per-standard table: `Source Grade | C — UNVERIFIED — certificate not yet obtained from CATL`)
- As a standalone italic footnote line (Brief section, after the "Why Now" paragraph: `[Source grade: C — industry reports from BNEF...]`)

The current renderer uses `GradeLabel` as a bracket tag everywhere. The design proposes `SourceGradeTag` as a replacement.

**Decision needed:** Should the v2 renderer follow the BESS reference exactly (three different patterns by context), or standardise on one pattern for simplicity? If standardising, which pattern?

---

### Q2: Supplier shortlist pages — include or exclude?

The BESS reference has no supplier shortlist section. The current renderer has three supplier pages (`SupplierBuySection`, `SupplierMakeSection`, `SupplierServicesSection`) that are unique to the ForgeOS implementation and valuable to the founder. The prompt_architecture Stage 10 does not mention supplier shortlist as a named section.

**Decision needed:** Do the supplier pages stay in the v2 renderer (placed after Cost, before FMEA)? If yes, do they get the BESS visual treatment (dark-navy headers, no pill badges)? If no, does the supplier data move into the module BOM table's Supplier column only?

---

### Q3: Table of Contents — keep or drop?

The current renderer has a Table of Contents page. The BESS reference does not. The ToC is static (no page numbers because React-PDF does not support dynamic cross-references in the `Text render={}` callback at ToC generation time).

**Decision needed:** Drop the ToC in v2, or retain it as an optional page controlled by the `FORGE_PDF_RENDERER` env flag?

---

### Q4: Module BOM table — Part Number column?

The BESS reference BOM table has 7 columns: Part (descriptive name), Qty, Unit £, Total £, M/B, Supplier, Gr. No Part Number column. The current renderer shows Part Number as the first column and uses it as the primary key for BOM line lookups.

**Decision needed:** Drop Part Number from the rendered BOM table in v2 (matching BESS), or retain it as a narrower column? If dropped, ensure the BOM lookup logic (`bomLines.childPartId`) still works internally without rendering the Part Number.

---

### Q5: Phase gate for enabling v2 on live projects

The upstream data shape changes in Section 3.3–3.9 mean that any project run through the current pipeline will have null values for the new fields. The v2 renderer needs to degrade gracefully (show "Not available" rather than crashing) for fields that are null because the pipeline has not yet been updated.

**Decision needed:** What is the acceptable minimum data set for a project to be rendered with v2? Options:
- (a) Only enable v2 when all Phase A–F upstream changes are live (cleanest, slowest).
- (b) Enable v2 immediately with null-safe fallbacks — the renderer shows placeholder text for missing fields and uses the current data where it exists.
- (c) Enable v2 per-project manually as individual projects are re-run through the updated pipeline.

Option (b) is the lowest-risk engineering choice but produces hybrid-quality output during the transition. Option (c) is the cleanest user experience but requires manual project management.

---

*End of design document.*
