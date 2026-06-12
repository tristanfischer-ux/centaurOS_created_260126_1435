# Engineering Dossier — tiers (Free / £1k / £5k)

**Generated: 2026-06-09 10:31 BST.** *Refreshed each revision.*

*Implements Stages 0–2 of `FRACTIONAL-FORGE-PLAN.md` for the **Engineering Dossier**. The **market / customer / go-to-market / business-plan** content is a **SEPARATE generated report** (a distinct build — plan §9), NOT part of this dossier. Supersedes the earlier "trimmed-sections" version (Tristan 2026-06-09: free and £1k are the SAME document, with specifics masked — not a shorter doc). Prior reverted attempt: drawer `forgeos_dossier_free_paid_variant` (keep the `String("null")` fix).*

## The model — redaction, not removal
- **Free and £1k are the SAME document, page-for-page.** Free masks the **actionable specifics** behind an inline **"🔒 Upgrade to the £1,000 report to reveal."** The founder sees the full shape, length and substance of what they'd get — so the value of paying is unmistakable.
- **£1k = a toggle.** It instantly un-masks; same render, no regeneration → ~pure margin.
- **£5k is NOT a new document.** It's the £1k report after a **human expert audit** — an expert goes through it **section-by-section, page-by-page** and marks it up (the *"teacher checking the homework"*); the **AI incorporates every audit note and cleans it up** → the £5k report. The AI did the homework, the human checks it, the AI applies the corrections.

## Shown in free  vs  masked until £1k
**Shown even in free** (the substance + the proof + "look how much is here"):
- All engineering — process flow, mass/energy balance, feasibility verdict, the **full worked calculations + tools-used** (the "deterministic, computed, not guessed" credibility).
- All module overviews + diagrams.
- **All costs** — every BoM line total, sub-totals, the grand total, cost methodology.
- The **counts** — that there are *N* parts, *N* suppliers, *N* experts.
- Risk, regulatory, brief, executive summary.

**Masked until £1k** (the actionable specifics — "🔒 upgrade to reveal"):
- **BoM:** each line's *item description* and *supplier / manufacturer* (the quantity, unit cost and line total still show) → row reads `🔒 item · 🔒 supplier · ×N · £unit · £line`.
- **Sourcing & Procurement:** the supplier names + contacts.
- **Engagement Plan / specialist questions:** the expert **roles** + the **questions to ask** (free shows only *"you'll need N experts — upgrade to see the roles + the questions"*).

**Added at £5k** (the human layer):
- Each section **expert-audited**; the **named experts** (Nick sources them); their **audit notes + corrections woven in by the AI and cleaned up**; escrow access to those experts.

## Per-section
| Section | Free | £1k | £5k |
|---|---|---|---|
| Engineering (basis, calcs, tools) | ✓ full | ✓ full | ✓ + audit notes |
| Module overviews + diagrams | ✓ full | ✓ full | ✓ audited |
| BoM line **costs** + totals | ✓ all | ✓ all | ✓ corrected |
| BoM **item + supplier** per line | 🔒 masked | ✓ revealed | ✓ corrected |
| Sourcing — supplier names | 🔒 masked | ✓ revealed | ✓ RFQ-ready |
| Expert roles + questions | 🔒 "N experts — upgrade" | ✓ roles + questions | ✓ **named** + answers |
| Cost summary / methodology | ✓ | ✓ | ✓ |
| Risk / regulatory / brief / exec | ✓ | ✓ | ✓ |

*(Market / customer / GTM / business plan live in the SEPARATE Business/Market Report — not in this dossier.)*

## Next-stage CTA (every tier points forward)
- **Free →** *"Upgrade to the £1,000 report to reveal the parts, suppliers and experts."*
- **£1k →** *"Have it validated: the £5,000 expert-audited report."*
- **£5k →** *(prominent)* **"Next: the RFQ stage — we take this to your suppliers and bring back real quotes."** The hand-off to Stage 3 must be unmistakable at the end of the £5k report.

## Implementation
- One `state.json` → rendered with a **`tier` flag** (`free` / `paid` / `vetted`) in `render-minimal-pdf.tsx`. `free`↔`paid` = **field-level** mask/unmask (instant, no regeneration). `vetted` = the audit overlay (expert notes merged in + clean-up pass).
- Masking is at the **field** level (item, supplier, role, question), NOT the section level — every section renders in all tiers; only the specifics blank to a lock line.
- Reuse the prior (reverted) free/paid machinery rather than rebuild; keep the `String("null")` fix.
- The **Business/Market Report** will follow the same free/£1k/£5k tiering pattern, but is a separate generator (its own spec).
