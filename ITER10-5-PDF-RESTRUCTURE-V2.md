# Iter-10.5 — PDF Information Architecture: Second Restructure

**Status:** PLAN — awaiting council review then Tristan approval
**Date:** 2026-05-20
**Supersedes:** ITER10-PDF-INFORMATION-ARCHITECTURE-RESTRUCTURE.md (the first restructure shipped in commit e771b800d)
**Trigger:** Tristan's visual review of the iter-10 test PDF surfaced ten distinct problems that the first restructure either created or failed to fix.

---

## Why we are restructuring AGAIN

The iter-10 restructure (commit e771b800d) correctly killed the standalone Appendix A / B detachment problem but introduced **new** audience problems:

1. The reader has no idea what they are looking at because the brief requirements are buried at page 5 — they should be **immediately** after the cover.
2. The Design Trade-offs page references things like "Compliance Choice 1" and "Engine B Choice 2" before the reader has met any modules or knows what "Engine B" is — putting it before the modules is incoherent.
3. The Bill of Materials master summary (cost-by-module rollup + component class breakdown) **disappeared entirely**. It used to be the one page a procurement reader could hand to a buyer. Inline-per-sub-module is good FOR ENGINEERS but procurement now has no single-page view.
4. The inline per-sub-module BoM tables are too cramped — three-deep numbering (`1.1.3`) plus 4-letter status badges plus prices fit in <70mm of column width and the rows do not breathe.
5. The four-letter status badges (`VERIFIED` / `REPLACED` / `SOURCE` / `CUSTOM`) are internal jargon. A reader does not know whether `SOURCE` is good or bad.
6. The Manual Review Notes were partially folded into Engineering Review Notes per module, but the full content **vanished** — entries from earlier in the chain are no longer visible anywhere.
7. The Engineering Review Notes still emit raw internal codes like `ERP SC5` instead of plain-English descriptions.
8. The Risk Priority sub-table has wrapping/layout failure — column headers (`Severity`, `Likelihood`, `Detectability`, `Risk Priority`) are too long for the available width.
9. The Issue Index page and the Engineering Q&A Summary page add no signal for the reader.
10. Module status strip at the head of each module section ("Cost | Parts | Review notes | Procurement exceptions") — the last three counts are noise; Cost is the only number a reader scans.
11. Suppliers content "did not make sense" on the rendered PDF — separate root-cause work needed, but at minimum the renderer should suppress suppliers whose URLs were already nullified by the URL reconciliation pass.

---

## Decision summary

| # | Decision | Rationale |
|---|---|---|
| D1 | **Page order**: Cover → Brief (with Operational Headline folded in) → Performance Card → Module Connection Map → Modules → **Design Trade-offs** → **System-Level Risks** → Compliance → Risk → Design Decisions → Suppliers → **BoM Master Summary** → end | Reader sees what was asked for, what the design promises, what the system looks like, then the modules; only then do they hit the trade-offs (which reference modules) and system-wide risks (which sum across modules). Procurement gets the master BoM at the end. |
| D2 | **Operational Headline folds into the Brief page** | One-line operational headline ("Vertical farm, 100 m² growing area in a 12 m container, target X kg/year") is a *consequence* of the brief, not a separate page. It belongs at the top of the Brief page in a banner. |
| D3 | **Restore master BoM summary page** at the end | Recover from `e771b800d~1` — same component, no logic change, just resurrected. Sub-module sub-totals, component-class breakdown, grand total. Procurement-ready single page. |
| D4 | **Drop module status strip count chips** — keep only Cost | Cost is scanned, the other counts are noise. |
| D5 | **Plain-English BoM status labels** + redesigned inline table | Replace the 4-letter badges with: ✓ "Ready to procure" / △ "Use this replacement instead" / ? "Verify before procuring" / ⓘ "Custom build — spec needs finalising". Widen the table to use the full content width, drop the second sub-module column from the row number (use `1.3` not `1.1.3` — Tristan said three-deep is hard to read), increase row height. |
| D6 | **Restore Manual Review Notes as inline sub-rows beneath the part they refer to** | Currently lost when the standalone appendix was deleted. Need to thread `manualReviewBadges` through `ModuleSection` and render inline beneath the BoM row whose `module_id` / `sub_module_id` matches. |
| D7 | **Engineering Review Notes — kill jargon** | Replace internal codes (e.g. `ERP SC5`, `K10:VF-005`) with plain English from a lookup table. Add a translation pass at the bottom of `gatherEngineeringReviewNotes()`. |
| D8 | **Risk Priority sub-table — abbreviate columns** | Headers: `Sev` / `Lik` / `Det` / `RP`. Footnote at table bottom: "Sev = Severity, Lik = Likelihood, Det = Detectability, RP = Risk Priority (Sev × Lik × Det)". |
| D9 | **Delete Issue Index page and Engineering Q&A Summary page** | Tristan: "I don't really think it adds much value". |
| D10 | **Design Trade-offs page — translate engine names** | Drop "Engine B" / "Compliance Choice 1" labels in headings — describe the trade-off in domain terms ("Higher CAPEX vs lower OPEX", "Faster build vs higher reliability"). Engine names move to a small italic footnote at the page bottom for the audit trail. |
| D11 | **Suppliers page — render-time suppression of nonsense matches** | Suppliers with `url_validation_state === 'invalid'` or no matching part-number reference in any rendered BoM row → suppress from suppliers page entirely. Root-cause supplier-matcher fixes are a separate workstream. |

---

## Page-level layout (target)

```
1. Cover
2. Brief Requirements                 ← banner at top: Operational Headline
3. Performance Characteristics
4. Module Connection Map (+ optional exploded view)
5. Module 1 — narrative + sub-modules with inline BoM + review notes
6. Module 2 — same
   ...
N. Module N
N+1. Design Trade-offs                 ← now after modules: "Engine B" terminology gone
N+2. System-Level Risks & Integration  ← now after modules: cumulative cross-cutting risks
N+3. Compliance
N+4. Risk
N+5. Design Decisions
N+6. Suppliers                         ← nonsense matches suppressed
N+7. Bill of Materials — Master Summary ← RESTORED: cost-by-module + component-class + grand total
[end]
```

### Per-module structure (target)

```
MODULE n — <name>                                           Cost: £x,xxx
                                                            ─────────────
<narrative overview paragraph>

  n.1 — <sub-module name>
        <description>
        ┌─────────────────────────────────────────────────────────────────┐
        │ ✓ Ready to procure       │ Part name           │ Qty │ Unit £ │
        │ △ Use this replacement   │ Part name           │ Qty │ Unit £ │
        │   → <recommended SKU + manufacturer>            │     │        │
        │ ? Verify before procuring│ Part name           │ Qty │ Unit £ │
        │   → <what to verify, why>                       │     │        │
        │ ⓘ Custom build           │ Part name           │ Qty │ Unit £ │
        │   → <what spec needs finalising>                │     │        │
        │   ⚠ Manual review note: <inline narrative>      │     │        │
        └─────────────────────────────────────────────────────────────────┘
                                            Sub-total: £x,xxx

  n.2 — <sub-module name>
        ...

ENGINEERING REVIEW NOTES — Module n
  Issue: <plain English summary>
  Why it matters: <plain English>
  Action: <plain English next step>
  Roles affected: electrical, mechanical
```

---

## Implementation plan (file-level)

All edits in `scripts/render-minimal-pdf.tsx`.

### Phase A — Page reorder + brief/headline fold (small)
1. Edit `MinimalDocument` body (line ~5508): reorder JSX children to target sequence above. Delete `<IssueIndexPage>` and `<EngineeringQASummaryPage>` from output.
2. Edit `BriefPage` (line ~2616): add an operational-headline banner at the top, sourcing from `state.keyMetrics` / `state.headlineMetric` / wherever `HeadlinePage` was reading from.
3. Delete `HeadlinePage` component (line ~2053) and its usage in `MinimalDocument`. Leave `PerformanceCardPage` intact.

### Phase B — Restore BoM master summary (medium)
1. Recover the deleted `BillOfMaterialsPage` from `git show e771b800d~1:scripts/render-minimal-pdf.tsx` (was at line 3953 in the old file).
2. Paste back into the current file near the end (just before MinimalDocument).
3. Wire `<BillOfMaterialsPage state={state} project={project} bomTotals={bomTotals} />` into `MinimalDocument` as the last page before `</Document>`.
4. **Sanity check**: ensure component-class breakdown table still appears in the recovered version. If not, port that block from the old file too.

### Phase C — Module status strip simplification (tiny)
1. In `ModuleSection`, find the status strip render (post-iter-10 it shows Cost / Parts / Review notes / Procurement exceptions).
2. Remove the three count chips. Keep only Cost.

### Phase D — Inline BoM redesign (medium)
1. Replace `v2StatusBadge` plain text labels with the new copy:
   - `VERIFIED` → `Ready to procure`
   - `REPLACED` → `Use this replacement instead`
   - `VERIFY` → `Verify before procuring`
   - `CUSTOM SOURCE` → `Custom build — spec to finalise`
2. Widen the inline BoM table — use full content width, drop one filler column if needed. Increase row vertical padding from 4px to 8px. Increase font from 7.5pt to 8.5pt.
3. Number rows as `n.subIdx` (two-deep) rather than `n.subIdx.lineNum` (three-deep). Lines within a sub-module are bullets, not numbered.

### Phase E — Inline Manual Review Notes (medium)
1. Thread `manualReviewBadges` through `<ModuleSection>` props.
2. For each rendered BoM row, look up any badge whose `module_id` matches the row's module and whose `sub_module_id` (or `part_number`) matches the row.
3. Render as a sub-row beneath the relevant BoM line with the `⚠ Manual review note:` prefix and the narrative content.
4. After all sub-modules render, ensure any **module-level** review-note badges (no sub_module_id) render as a final sub-row beneath the module.

### Phase F — Engineering Review Notes jargon translation (small)
1. Build a translation map in `render-minimal-pdf.tsx` keyed by internal code:
   - `ERP SC5` → `Equipment-rating overlap (sub-check 5: control-loop tuning)` (placeholder — needs domain confirmation per code)
   - `K10:VF-005` → `Module connection check — vertical-farm rule 5`
   - etc.
2. Apply at the bottom of `gatherEngineeringReviewNotes()` before returning.
3. If a code is **not** in the table, render the code in brackets after the plain-English label rather than as the heading.

### Phase G — Risk Priority column abbrev (tiny)
1. Find the risk-priority sub-table inside the Engineering Review Notes block.
2. Replace column headers `Severity`/`Likelihood`/`Detectability`/`Risk Priority` with `Sev`/`Lik`/`Det`/`RP`.
3. Add a footnote text node beneath the table: `Sev = Severity, Lik = Likelihood, Det = Detectability, RP = Risk Priority (Sev × Lik × Det)`.

### Phase H — Design Trade-offs language fix (small)
1. In `DesignTradeOffsPage`, where the current rendering exposes `Engine B Choice 2` / `Compliance Choice 1` headings, replace with the underlying trade-off description from the source data (e.g. `Higher CAPEX vs lower OPEX`).
2. Move engine attributions to italic small text at page bottom: `Source: pricing engine (Engine B), compliance engine, ...`

### Phase I — Suppliers nonsense suppression (small)
1. In `SuppliersPage`, before rendering each supplier, check that at least one BoM row in any module's `partLinkMap` references this supplier's part-number.
2. Also check `url_validation_state` — if `invalid` or missing AND no BoM row references it, suppress.
3. If suppression empties the page, render a single "No qualified supplier matches" line rather than blank-page.

### Phase J — Removals (tiny)
1. Delete `IssueIndexPage` component and its imports/usages.
2. Delete `EngineeringQASummaryPage` component and its imports/usages.

---

## Acceptance criteria (test on iter-9 verify state.json + fresh end-to-end)

| # | Criterion | How verified |
|---|---|---|
| AC1 | Brief Requirements is page 2 (immediately after cover) | Visual: read page 2 of test PDF |
| AC2 | Operational Headline appears as a banner at the top of the Brief page | Visual |
| AC3 | Design Trade-offs appears AFTER all modules | Visual: page number of Design Trade-offs > page number of last module |
| AC4 | "Engine B" terminology is not in any heading on the Design Trade-offs page | Grep `pdftotext` output |
| AC5 | BoM Master Summary is the last content page before end of document | Visual |
| AC6 | Each module shows ONLY "Cost: £x,xxx" in its status strip | Visual; no "Review notes: N" or "Procurement exceptions: N" visible |
| AC7 | BoM status labels read "Ready to procure" / "Use this replacement instead" / "Verify before procuring" / "Custom build — spec to finalise" | Grep `pdftotext` output |
| AC8 | At least one Manual Review Note appears inline beneath a BoM row | Visual |
| AC9 | Engineering Review Notes do not emit raw codes like `ERP SC5` as headings | Grep `pdftotext` output for any `[A-Z]{2,5} [A-Z]?\d+` patterns in headings |
| AC10 | Risk Priority sub-table fits in column with `Sev`/`Lik`/`Det`/`RP` headers | Visual |
| AC11 | No Issue Index page in document | Visual + page count comparison |
| AC12 | No Engineering Q&A Summary page in document | Visual |
| AC13 | All suppliers shown on Suppliers page are referenced by at least one BoM row | Audit script comparing supplier list against BoM part-number set |
| AC14 | Page count is reduced vs iter-10 (current 60 → target ≤55) | `pdfinfo /tmp/iter10-5-test.pdf` |
| AC15 | All changes are universal across product classes (no VF-specific or BESS-specific gates added) | Code review |
| AC16 | Fresh end-to-end verify chain renders cleanly | Run the chain |

---

## Open questions for the council

1. **Headline fold-in placement** — is "operational headline as a banner at the top of the brief page" the right pattern, or should it be in the cover page footer instead?
2. **BoM master summary location** — is the very end of the document the right home, or should it be immediately after Suppliers? (Suppliers is procurement-adjacent; the master BoM is too. Reader workflow: scan modules → check suppliers → procurement summary.)
3. **Manual Review Notes — inline vs end-of-module** — is inline-beneath-the-part better, or should they be a single "Manual Review" block at the bottom of each module (grouped, not interleaved with BoM rows)?
4. **Risk Priority abbreviation** — is footnoting at the bottom of the table sufficient, or should we render the full word on first reference and abbreviate thereafter?
5. **Three-deep vs two-deep numbering** — Tristan said three-deep (`1.1.3`) is too tight. But two-deep (`1.3`) loses the sub-module grouping. Is the right answer two-deep numbering with a visible sub-module **header row** above each group of lines?
6. **Translation map maintenance** — codes like `ERP SC5` are emitted from various places in the chain. A lookup table in the renderer drifts. Should the chain emit `human_label` alongside `code` and the renderer just use that?
7. **Suppliers suppression risk** — suppressing suppliers whose URL is invalid may hide otherwise correct manufacturer-level matches. Is the threshold for suppression right?

---

## What this plan does NOT cover (deferred)

- Supplier-matcher root-cause: why the matches don't make sense in the first place is a chain-side bug, not a renderer bug. Render-time suppression is a stopgap.
- Physics Repair Loop further tuning (iter-9 brief constraint hot-fix is in place, no regression seen).
- New product class support.
- A regression test harness for the PDF (task #64 still pending).

---

## Rollout

1. Council review of THIS plan (parallel dispatch to 5 reviewers).
2. Tristan approves.
3. Implement phases A→J in commit order (one commit per phase to keep diff reviewable).
4. Render test PDF from existing iter-9 state.json → visual review with Tristan.
5. If passes: trigger fresh end-to-end verify on a different product class (BESS or heat pump) to confirm universal.
6. If passes: ship to main, mark iter-10.5 done.
