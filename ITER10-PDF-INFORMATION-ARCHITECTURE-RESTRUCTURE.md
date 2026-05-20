# PDF Information Architecture Restructure — Iter-10 Plan

**Trigger:** Tristan reviewing the iter-9 verify PDF — Appendix A + B + K10 sections are audience-confusing and detached from where the content is relevant.

**Goal:** Move every piece of "this needs human attention" information from end-of-document appendices into the place in the document where the reader is already looking at the relevant module / sub-module / part.

## What's wrong with the current structure

### Appendix A — Parts Pending Verification
Currently the chain runs G5 part-number verification on every emitted SKU and produces three buckets:
- **Verified** (Mouser / DigiKey / Farnell / Brave hit) — listed in the main BoM
- **Stripped (fabricated)** — chain identified the SKU as hallucinated, removed it, recommended a real replacement
- **Plausible but unverified** — chain couldn't fully verify but the manufacturer + part-number format look plausible

The main BoM (Section 6) shows the verified ones with a green badge. Stripped + uncertain get pushed to Appendix A in a separate layout. Tristan's audit: "It's not 100% clear to me what the difference between those two things is."

Two structural problems:
1. **Duplication of mental model**: reader sees a part in the BoM, then has to flip 20 pages to Appendix A to find out the verification details
2. **Sub-module cross-reference is broken**: narrative says "Module 2.1 Air Handling Unit", BoM groups parts by sub-module name ("Air Handling Unit") but doesn't carry the "2.1" numbering — and Appendix A loses the grouping entirely (it's a flat list of stripped parts with location strings like "Energy Conversion Transduction / LED Lighting System")

### Appendix B — Manual Review Notes
Aggregates findings from the physics-critic, G1b compliance, G4 grammar, G5 parts gates. Each finding has a technical name (`engineering_plausibility @ energy_conversion_transduction/sub_modules[0]/words[1]`) and prose. Tristan's audit: this needs to be IN the module sections as "design considerations the engineer should think about", not detached at the end.

Problems:
1. **Technical names** ("Physics critic 3/10 engineering plausibility") don't translate the finding to action
2. **Detachment from the affected module** — reader sees Module 2 HVAC, finishes reading, has no idea Appendix B says "design has a 10× LED-driver mismatch and a pump head 6× shortfall"
3. **All findings in one stack** — the reader can't easily tell which findings affect which module without re-reading the `where` field

### K10 reference graph shadow check
Engineering-internal output: "matched_edges: 11, missing_required: 2, extra_emitted: 4, verdict: PASS_SHADOW". Tristan's audit: "really don't understand what's going on at all". This is correct — K10 is a chain-quality gate for engineers building the chain, not for engineers reading the report.

## Proposed restructure

### Change A: BoM mirrors the narrative's sub-module numbering

Today the narrative reads:
> **Module 1 — Container Shell & Trolley Structure**
> 1.1 Primary growing container
> 1.2 Fertigation container
> 1.3 Mobile growing trolley
> ...

Today the BoM reads:
> **Module 1 — Structure Containment £536**
> Primary Growing Container ... £36.70
> Fertigation Container ... £23.50
> Mobile Growing Trolley ... £406.75
> ...

After:
> **Module 1 — Container Shell & Trolley Structure**
> **1.1 Primary growing container — £36.70**
> [parts table with 1.1.1, 1.1.2 row numbers matching the order in narrative]
> **1.2 Fertigation container — £23.50**
> ...

The renderer already knows the sub-module order (it walks `state.moduleDecomposition.modules[].sub_modules[]`). The change is just: emit `${moduleIdx}.${subModuleIdx}` numbering in both the narrative `ModuleSection` AND the `BillOfMaterialsPage`, using the SAME index order.

### Change B: Verification status inline in every BoM row

Each BoM row gets a verification status indicator in a new column (or as a colour-coded badge):

| Indicator | Meaning | Inline action |
|---|---|---|
| ✓ | Verified against distributor catalogue | No extra info shown |
| △ STRIPPED | Generator emitted a fake SKU; chain stripped it; engine recommended a real replacement | Sub-row immediately below shows "→ Recommended: \<real manufacturer\> \<real SKU\> — \<reasoning\>" with confidence chip (HIGH / MEDIUM / MANUAL-SOURCING) |
| ? UNVERIFIED | Plausible but couldn't be confirmed | Sub-row shows "Engineer to verify against datasheet — \<reason\>" |
| ⓘ MANUAL SOURCE | Chain can't recommend (custom-fab, descriptive part) | Sub-row shows what to search for |

Sub-rows are visually subordinate (lighter background, indented, smaller font) so the BoM totals row stays scannable.

**Appendix A is removed.** Everything that was there is now inline in the BoM.

### Change C: "Design considerations" sub-section at the end of each module

Each module section gets a new bottom block "Design considerations & things to verify". Content sourced from state, FILTERED by which module the finding affects:

```
Module 2 — HVAC & Heat Rejection System
[overview prose]
[sub-modules with sub-module numbering]
[BoM for this module with inline verification — per Changes A + B]

⚠ Design considerations & things to verify
  (3 items the engineer should address before procurement)

  • Driver-to-load power balance — the chain specified 8 × Mean Well
    HLG-320H-48 drivers (320 W each, 2.56 kW total) feeding LED panels
    rated 2.5 kW per trolley. Driver capacity is approximately equal to
    load, leaving no headroom for cable losses or driver derating at
    high ambient temperature. Verify driver datasheet at the intended
    operating temperature; consider upsizing to CSP-3000 class for
    comfortable margin.

  • Refrigerant cycle COP claim — the design assumes a 3.8 COP for the
    Copeland scroll compressor at the stated condenser temperature.
    Manufacturer's published curves should be cross-referenced against
    the actual evaporator / condenser temperatures of this loop before
    sizing electrical supply.

  • Static pressure feasibility — the design routes a 300 mm axial fan
    against an estimated 150 Pa duct static pressure. 300 mm axial
    wheels typically max out around 100 Pa; the fan may stall.
    Substitute a centrifugal plug fan (e.g. ebm-papst RadiPac) sized
    for the actual duct system.
```

Content sources:
- `state.physicsCritique.issues[]` filtered by `where` containing this module's id (parse the slash-path)
- `state.complianceGate` standards related to this module's component types (heat pump compliance → environmental_interface; food contact compliance → mass_fluid_transport)
- K10 missing-edges where either endpoint is this module (translated to plain English: "the design assumes safety_protection wires into sensing_instrumentation for the CO2 alarm but the link wasn't explicitly specified")
- Phase 2 unrepaired gate failures (state.designDecisions[]) where the affected module is this one

Plain-English framing: NO mention of "physics critic", "G1b", "G4", "K10 shadow check". The reader sees "things to verify" presented as engineering judgement calls, not as machine output.

### Change D: K10 shadow output translated into per-module design considerations

The standalone K10 section disappears. Missing required edges become entries in the design-considerations block of the affected modules.

For example, today's K10 output for a VF that's missing the `safety_protection ↔ sensing_instrumentation` edge:
> "K10 shadow: FAIL_SHADOW — matched=11 missing=1"
> "missing_required: from=safety_protection to=sensing_instrumentation mechanism=alarm_interlock"

Becomes (in BOTH the safety_protection module's design considerations AND the sensing_instrumentation module's):
> "Cross-module wiring assumption — the CO2 over-concentration alarm chain assumes the CO2 sensor in the sensing instrumentation feeds the safety interlock. The wiring topology for this link wasn't explicitly specified in the design output — verify the alarm-interlock wiring (typically: NDIR CO2 sensor analog 4-20 mA → safety relay input → contactor trip) before commissioning."

### What stays at the end of the PDF

A short single-page **"Engineering Quality Assurance Summary"** with just the numeric outcomes — no detail, just confidence-restoring counts:

> The chain ran the following automated checks on this design:
> • 20 universal arithmetic gates (X passed, Y failed → Y items surfaced in module Design Considerations)
> • Physics-critic peer review (X high-severity findings → all surfaced in relevant modules)
> • Compliance gate (X mandatory standards covered, Y missing → surfaced in Compliance section)
> • Part-number verification (X verified, Y stripped, Z plausible-but-unverified → all annotated inline in BoM)
> • Cross-module topology check (X required connections present, Y missing → surfaced in relevant modules)

This gives the reader confidence that checks DID happen, without dumping the raw machine output.

## Implementation plan

| Sub-step | File(s) | Effort |
|---|---|---|
| C1 — Mirror sub-module numbering between narrative + BoM | scripts/render-minimal-pdf.tsx — ModuleSection + BillOfMaterialsPage | 2-3 hrs |
| C2 — Inline verification status in BoM rows | scripts/render-minimal-pdf.tsx — BomPartRow rendering + look up partVerifications by word_id | 3-4 hrs |
| C3 — "Design considerations" block per module | scripts/render-minimal-pdf.tsx — ModuleSection + new helper to gather + format findings per module | 4-6 hrs |
| C4 — K10 translation helper | scripts/render-minimal-pdf.tsx — new helper to turn missing-edge JSON into plain-English notes | 2 hrs |
| C5 — Remove Appendix A page; reduce Appendix B; add QA Summary page | scripts/render-minimal-pdf.tsx — delete PartsPendingVerificationPage call site, replace ManualReviewAppendixPage with QASummaryPage | 1 hr |
| Total | | 1.5-2 days |

## Things that need careful thought

### Page count
- Today: Modules section ~25-30 pages, BoM ~10-12 pages, Appendices ~25-30 pages → ~60-70 pages
- After: each module section becomes longer (overview + sub-modules + inline BoM + design considerations) → estimated 4-5 pages per module × 11 modules = 44-55 pages just for module sections, plus front matter + compliance + risk + suppliers + QA summary
- Net page count probably similar (~60-70), but information is denser per page and the reader doesn't need to flip back to appendices

### Inline verification — sub-row vs always-visible
- Option 1: stripped/uncertain parts always show the sub-row → more scannable, more vertical space
- Option 2: stripped/uncertain parts get a badge + an "(see Appendix)" link → keeps the BoM compact but reintroduces the flip-the-page problem
- **Recommend Option 1** for the principle: information goes where the reader is looking

### Design considerations — order + format
- Should items be ranked by severity (HIGH first)? — probably yes
- Should the source (physics-critic vs gate vs K10) be visible to the reader? — NO. The reader cares WHAT to verify, not which subsystem of the chain flagged it.
- Length per item — 2-3 sentences. The current physics-critic prose is often 4-6 sentences with technical jargon; needs translation.

### Compliance findings — module-level vs section-level
- G1b compliance gate output today is a flat list of standards in the Compliance section
- Some standards are clearly module-affecting (BS EN 14511 = chiller/heat pump → environmental_interface)
- Others are product-wide (HACCP, BRCGS for food safety → not module-specific)
- **Recommend**: module-affecting standards mentioned in the affected module's design considerations AS WELL AS in the central Compliance section (don't remove from Compliance — duplicate the relevant subset)

### Old appendix content that has no inline destination
- A few items in current Appendix B don't map cleanly to a module:
  - "Class registry auto-generated" flag (when product class isn't in the standard 20)
  - Compliance gate jurisdiction conflict (UK + EU + global without explicit harmonisation plan)
- These belong on a small "Report-level notes" card at the cover or in the Brief section, not in a module

## Open questions for council critique

1. **Is the principle right?** Move information to where the reader is looking, vs. structured-by-source-system appendices. Are there engineering audiences who PREFER the appendix structure (e.g. compliance officers who skim the appendix for issues)?

2. **Inline verification — sub-row pattern correct?** Or should stripped parts be shown as a STRIKE-THROUGH BoM row with the recommendation in the same row visually? Or a "swap arrow" pattern (fabricated SKU → recommended SKU on one line)?

3. **"Design considerations" framing** — better name? "Engineer notes", "Verify before procurement", "Open questions for the engineer"? The framing must signal "things to think about" not "things wrong with the design".

4. **K10 translation** — should we keep ANY trace of the topology check in the PDF for engineers who want to know what was checked? Or completely hide from user-facing output (the K10 data stays in state.json for chain debugging but never appears in PDF)?

5. **QA Summary page** — should it count the checks numerically (current proposal) or describe the categories of check the chain runs (more like a "quality methodology" page)? Or both?

6. **What about Performance Card (Section 0.5) + Design Trade-offs (Section 1.5)** — they already do something similar (surface chain decisions in narrative format). Does this restructure conflict with or extend them?

7. **Module-section length** — at ~4-5 pages each × 11 modules, that's 44-55 pages just for modules. Reading-from-cover-to-cover becomes harder. Should we add a per-section table of contents at the start of each module?

8. **The cover Manual-Review pill strip** — today shows "G1b compliance | G4 grammar | G5 part numbers | Physics critic" pills when those gates fire. After restructure, the underlying findings live inline in modules. Does the cover strip still make sense, OR does it now mislead because it points to "Appendix B" sections that don't exist anymore? Recommend re-labelling to "N design considerations to verify across modules" with a count.
