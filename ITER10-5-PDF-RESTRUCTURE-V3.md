# Iter-10.5 v3 — REVISED PDF Information Architecture

**Status:** PLAN — Tristan-revised after council review of v2
**Date:** 2026-05-20
**Supersedes:** ITER10-5-PDF-RESTRUCTURE-V2.md (council-reviewed v2)
**Driver:** Tristan's verbatim instructions + 3 reference images (current iter-10 inline BoM / Chain V2 BoM / Chain V2 manual review notes)

---

## What this plan does in one line

Adopt the Chain V2 Bill-of-Materials look (clean 7-column table, sub-module groups with sub-totals, module total) **inline at the end of each module**, with a numbered Notes block beneath it absorbing all manual review / verification / replacement / custom-source content. Kill the standalone BoM page, the Design Trade-offs page, and the Manual Review appendix. Fold Design Trade-offs **into** each module.

---

## Page order (target — Tristan-defined)

```
1. Cover                                    ← title + cost stack + install price + grand total
2. Brief & Requirements
3. Operational Headline                     ← own page (Tristan: "you can talk about the operational headline")
4. Performance Characteristics
5. Module Connection Map                    ← cross-cutting notes block at bottom (notes not tied to any specific module)
6. Module 1
     6.1 narrative overview
     6.2 Sub-module 1.1 — narrative + Chain-V2-style BoM + numbered Notes
     6.3 Sub-module 1.2 — same
     ...
     6.n Design trade-offs for THIS module (small italic block)
     6.last Module total: £X,XXX
7. Module 2..N (same structure)
8. System-Level Risks & Integration         ← AFTER all modules (cross-module integration risks)
9. Compliance
10. Risk Register                           ← keep IF distinct from #8; otherwise merge (see §Open Question 1)
11. Suppliers                               ← non-destructive filtering (see §Open Question 2)
12. END                                     ← NO master BoM page, NO Issue Index, NO Engineering Q&A Summary
```

---

## The BoM block (adopted from Chain V2 — your reference image #2)

Each sub-module ends with a 7-column table:

| PART | MANUFACTURER | PART NUMBER | QTY | UNIT (£) | LINE (£) | SRC · REF |
|------|--------------|-------------|-----|----------|----------|-----------|
| 40ft Hc ISO Container¹ | CIMC | 40HC-ISO-2024 | ×7 | ~£112.50 | £787.50 | Web - |
| Pir Insulation Panel² | Kingspan | KS1000-80 | ×40 | ~£0.33 | £13.20 | Web <.5x |
| Container Door Seal³ | Trelleborg | D-40HC-80PIR | ×2 | ~£0.33 | £0.66 | Web - |

`Sub-total — Primary Container Shell                                        £2,489.19`

**Notes** *(italics, ≤8pt)*
> ¹ Manufacturer-level match. CIMC is the industry-standard for ISO 1496-1 containers; sold by specification not unique SKU. Confidence: HIGH.
> ² Plausible part-number format but not found in distributor catalogue. Engineer to verify against manufacturer datasheet before procuring.
> ³ Manual sourcing required — custom EPDM extruded profile with PIR foam inserts. Search Trelleborg Sealing Solutions or Henniges Automotive for an off-the-shelf equivalent.

### What the Notes block absorbs
The Notes block replaces FIVE separate things from the current document:
- Inline italic sub-rows beneath each BoM line (the cramped iter-10 layout in your reference image #1)
- Appendix A — Parts Pending Verification page
- Appendix B — Manual Review Notes (the beige callout blocks from your reference image #3)
- Plausible-but-Unverified inline rows
- "Use instead" replacement recommendations

**One superscript per noteworthy line. One Notes section per sub-module. Done.**

### Status signalling
No more `VERIFIED` / `REPLACED` / `SOURCE` / `CUSTOM` 4-letter badges. The note text itself carries the meaning:
- Confident catalogue match → no superscript at all (it's just procurement-ready)
- Manufacturer-level match → superscript with "Manufacturer-level match. <reason>. Confidence: HIGH"
- Verification needed → superscript with "Plausible part-number format but not found in distributor catalogue. Engineer to verify."
- Replacement → superscript with "Use instead: <SKU>. <reason>. Confidence: HIGH"
- Custom build → superscript with "Manual sourcing required. <where to look>."

---

## Per-module structure (target)

```
MODULE 1 — Structure Containment                                       £44,561.61
─────────────────────────────────────────────────────────────────────────────────
<narrative overview paragraph>

  1.1  Primary Container Shell
       <description / engineering notes>

       ┌──── BoM table (Chain V2 7-column format) ────┐
       └─ Sub-total — Primary Container Shell  £2,489.19

       Notes
       ¹ <note>     ² <note>     ³ <note>     ...

  1.2  Secondary Container Shell
       ...

  1.3  Mobile Growing Trolley
       ...

  DESIGN TRADE-OFFS — Module 1
  • <Trade-off 1>: <selected option> vs <alternative considered> — <reason in domain terms>
  • <Trade-off 2>: ...

  Module 1 total                                                        £44,561.61
```

---

## Design Trade-offs — translation
**Drop ALL engine-internal labels.** No more `Engine B Choice 2`, `Compliance Choice 1`, `Pricing engine`.

Rewrite each trade-off in the format:
> **<Domain trade-off>**: <selected option> chosen over <alternative considered> because <reason in the brief / regulatory / capacity / cost terms the reader understands>.

Example:
> **Cooling system**: Direct expansion (DX) chosen over chilled water because the 20 kW load and single-container envelope made the additional pump and tank circuit unjustified.

Engine attribution moves to a small italic line at the very bottom of each module: *Source: pricing engine, compliance engine, K10 reference graph.*

---

## Manual Review Notes — where the content actually goes

Per your reference image #3 (the beige callout boxes), the content is **useful engineering** but the language is jargon ("high/high/high/high, brief_to_design_fidelity @ energy_conversion_transduction/sub_modules[0]/words[0]").

Rule:
1. **Findings tied to a specific module → inline in that module's Notes block** (under the relevant BoM row) with translated plain-English headers.
2. **Findings not tied to any specific module → "Cross-cutting Engineering Notes" block at the bottom of the Module Connection Map page** (or fold into Module 1 if there's only one or two).

Translation: the chain currently emits `[high/high] brief_to_design_fidelity @ <path>` as the header. Replace with:
> **Heat balance check** — *severity: high, confidence: high*
> The 40 LED panels at 500 W = 20 kW heat load, but the DX cooling capacity is specified at 18 kW. An 18 kW system cannot offset >20 kW of heat without thermal runaway above the 18–25 °C target.
> *Suggested check*: Increase DX cooling to at least 25 kW sensible capacity to handle the 20 kW LED load plus auxiliary loads (fans, pumps) and provide a safety margin.

The chain code shouldn't be visible to the reader at all.

---

## Decisions (with the council's input folded in where it agreed with you)

| # | Decision | Source |
|---|---|---|
| D1 | Page order: Cover → Brief → Headline → Performance → Module Map → Modules (each containing Trade-offs + BoM + Notes) → System Risks → Compliance → Risk Register → Suppliers → END | Tristan |
| D2 | No standalone BoM master page — Chain V2 format inline per sub-module IS the master | Tristan (overrides council) |
| D3 | No standalone Design Trade-offs page — folded inside each module | Tristan (overrides council) |
| D4 | Manual Review Notes content folded into module Notes blocks (per-module → inline; cross-cutting → Module Map page) | Tristan |
| D5 | BoM rendering adopts Chain V2 7-column look (Part / Mfr / P/N / Qty / Unit / Line / SRC·REF + sub-totals + module total) | Tristan ref image #2 |
| D6 | Status signalling via plain-English NOTE TEXT, not 4-letter badges; superscript numerals link parts to notes | Tristan |
| D7 | Notes block: italics, ≤8pt, numbered list beneath the BoM table | Tristan |
| D8 | 2-deep numbering (1.1, 1.2) for sub-modules; BoM rows unnumbered (bullets / table rows only) | Tristan + council |
| D9 | Translate jargon headers (e.g. `[high/high] brief_to_design_fidelity @ ...`) to plain English in the renderer for THIS iteration; chain-side `human_label` emission as separate workstream (council's strong recommendation, deferred to its own task) | Tristan + council Q6 |
| D10 | Risk Priority table: combined headers `Severity (Sev) / Likelihood (Lik) / Detection (Det) / Risk Priority (RP)` (per Gemini 3.1 Pro — better than footnote-only) | Council Q4 |
| D11 | Suppliers: non-destructive filter — render greyed-out for invalid URLs and append "X suppliers filtered for invalid URL" notice (per Grok + GPT-5.5) | Council Q7 |
| D12 | Delete `HeadlinePage` as a separate component (operational headline gets its own page #3, but rendered by Brief/Headline shared logic, not a duplicate Page) | Tristan |
| D13 | Delete `IssueIndexPage` | Tristan + council Q9 |
| D14 | Delete `EngineeringQASummaryPage` | Tristan + council Q9 |
| D15 | Module status strip: Cost only, drop count chips | Tristan + council |

---

## Two questions back to you

### Q1 — Risk Register / System-Level Risks duplication

Council said you have two risk-looking sections — `System-Level Risks & Integration` (added in iter-10, sits at #8 in target order) AND `Risk Register` (older, with the Sev/Lik/Det/RP table, sits at #10). You said in the message: *"I'm not quite sure why they're saying the two of them. It looks like I can just see risk and failure mode analysis, which I think is fine."*

Both currently render in the PDF (lines 5521 and 5549 of `render-minimal-pdf.tsx`). Three options:

- **A** — Keep BOTH. `System-Level Risks` = integration narrative (heat balance across modules, total power balance, etc.). `Risk Register` = formal Sev/Lik/Det/RP table. Different content, different purpose.
- **B** — Merge into ONE section called `Risk & Integration Analysis` with both the narrative AND the table.
- **C** — Drop `System-Level Risks` entirely (assume the formal Risk Register already covers cross-cutting), and put any cumulative cross-module engineering findings into the Cross-cutting Engineering Notes on the Module Map page.

Recommend: **B** (one section, two sub-blocks). Reduces audience confusion and matches your "just see one" expectation.

### Q2 — Suppliers: non-destructive vs hard suppress (explained plainly)

What this is about: some supplier matches the chain finds turn out to have invalid URLs (404s, redirects to homepage, wrong company) or don't reference any actual BoM part. Two ways to render them on the Suppliers page:

- **Hard suppress** = silently delete those rows. Reader never sees them. Risk: a partially-valid match (correct manufacturer + bad URL) gets removed and reader loses a procurement lead.
- **Non-destructive** = render them greyed-out with a marker like "URL not validated — verify manually" and add a small notice at the bottom: "5 supplier matches filtered for invalid URLs". Reader sees what was found AND what was filtered. Procurement still has the manufacturer name to work with.

Council unanimous: non-destructive is safer. Recommend: **non-destructive**.

---

## Implementation phases (file edits)

All in `scripts/render-minimal-pdf.tsx`.

| Phase | What |
|---|---|
| A | Page reorder in `MinimalDocument`; delete `IssueIndexPage`, `EngineeringQASummaryPage`, standalone `DesignTradeOffsPage`, standalone `BillOfMaterialsPage` (we never recovered it from git in this version — it stays gone), `PartsPendingVerificationPage`, `ManualReviewAppendixPage` |
| B | Build new `SubModuleBomBlock` component — Chain V2 7-column table + sub-total. Recover the visual style from `git show e771b800d~1:scripts/render-minimal-pdf.tsx` (the old `BillOfMaterialsPage` rendering logic, minus the standalone-page wrapper) |
| C | Build new `NotesBlock` component — italic, ≤8pt, numbered list. Takes a `NoteEntry[]` array where each entry has `{ idx, text, severity? }` |
| D | Build new `noteCollectorForSubModule()` function — pulls together: replacement recommendations, verification flags, manual sourcing, manual review badges, physics critic findings whose `where_path` matches the sub-module |
| E | Rewrite `ModuleSection` to render: narrative → for each sub-module {narrative → SubModuleBomBlock → NotesBlock} → ModuleDesignTradeOffsBlock → Module total row |
| F | Build `ModuleDesignTradeOffsBlock` — domain-translated trade-offs (no "Engine B Choice" labels). Engine attribution as italic footnote at module bottom |
| G | Build `CrossCuttingNotesBlock` at bottom of `ModuleConnectionMapPage` for findings not tied to a specific module |
| H | Risk Register column header rewrite: `Severity (Sev) / Likelihood (Lik) / Detection (Det) / Risk Priority (RP)` |
| I | Suppliers non-destructive filter: render greyed row + "X filtered" notice instead of suppressing |
| J | Resolve Q1 (System-Level Risks ↔ Risk Register) per your call |
| K | Brief page: absorb operational headline as a page-start banner (or keep as page #3 — D1 says page #3; if you want it folded into Brief instead, say so) |
| L | Translation map for jargon headers (renderer-side stopgap; chain-side `human_label` as separate workstream task) |

---

## Acceptance criteria (test on iter-9 verify state.json)

1. Brief is page 2 (immediately after cover)
2. Operational Headline is page 3 (own page) or top banner of Brief (per your Q on K)
3. Each module shows a Chain V2-style BoM table per sub-module with sub-total
4. Each module shows a Design Trade-offs block at the bottom (before module total)
5. Each module ends with "Module N total: £X" row
6. Notes block beneath each BoM is italic, smaller font, numbered, superscripted from BoM rows
7. No standalone Bill of Materials page anywhere in the PDF
8. No standalone Design Trade-offs page anywhere in the PDF
9. No Appendix A or B
10. No Issue Index, no Engineering Q&A Summary
11. No `[high/high] brief_to_design_fidelity @ ...` or similar jargon visible in PDF text
12. No `Engine B Choice 2` or similar engine names in headings
13. Suppliers page has at least one row greyed out (if any URL invalid) + "X filtered" notice
14. Page count: ≤55 pages (down from current 60)
15. All changes universal across product classes
16. Fresh end-to-end verify chain on a BESS or heat pump renders cleanly (no VF-specific shortcut)

---

## What this plan DOES NOT include

- Chain-side `human_label` emission for codes (separate task — council strongly recommends, but it's chain work not renderer work)
- Supplier matcher root-cause fix (separate task — render-time filter is the stopgap)
- A regression test harness for the PDF (task #64 still pending)
- Physics Repair Loop tuning (no change)

---

## Rollout

1. **You answer Q1 + Q2 above** + confirm K (headline on own page #3 OR banner on Brief).
2. I implement Phases A→L in commit order.
3. Render test PDF from existing iter-9 state.json → visual review with you.
4. If passes: trigger fresh end-to-end verify on a different product class.
5. If passes: ship to main.
6. Create separate task for chain-side `human_label` emission.
