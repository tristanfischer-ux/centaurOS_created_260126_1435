# BACKLOG — the single durable ledger of agreed work (anti-"say-it-then-never-do")

> **THE RULE (closes the capture gap):** every idea agreed with Tristan is appended HERE in the SAME turn it is discussed — never "later". If it is not in this file by the end of the turn it was raised, it does not exist.
> **DONE ≠ captured.** An item is `✓DONE` only with a proof artefact: a commit SHA **and** a full-run number (scorecard / verify output). No proof = not done.
> **Audit in 10 seconds:** `bash scripts/verify-floor.sh` (the scores) + this file (the list). Don't trust me — read this file.
> **Forcing function:** at the start of any work session, read this file and work the highest-priority non-DONE item. Do not generate-new-and-forget. Do not end a session with undone items unlogged.
> Status key: 💡 idea · ✅ agreed · 🔨 in-progress · ✓DONE(proof) · ⏸ parked

## A · FLOOR-8 (RAS, Monday demo) — every scorecard section ≥8
- A1 ✓DONE INC-0 scorecard de-dup + self-rewriting code-fix gated off — SHA `2475c38a6` (pushed)
- A2 ✓DONE INC-1 tool_archetype 2→10 — SHA `58439188a`, confirmed end-to-end in run ras-inc3 (pushed)
- A3 🔨 INC-3 physics — make pump per-unit flow EXPLICIT (1,670/pump) so the critic can't misread; size main breaker to connected load; biofilter tank=153 (not 92); reconcile panel↔contract load. UNIVERSAL. (sub-agent running; held local `6f0e1704e`, NOT pushed — has not lifted the floor.) Proof: full-run physics_fidelity ≥8.
- A4 ✅ INC-2 brief_compliance — value+unit fallback mapping for the 5 "—" metrics. Proof: full-run brief_compliance ≥8.
- A5 ✅ INC-4 connectivity — deterministic pre-Blender connection-graph completion (process & instrument ≥80%). Proof: full-run connectivity ≥8.
- A6 ✅ INC-5 drawings read ONE ledger + hero reframe (fill the frame, drop the empty ground plane). Proof: eyeball + drawing_gates ≥8.
- A7 ✅ Fix drawing_gates regression — panel load_reconcile 2,865 vs contract 1,719 (connected-load scope). Proof: full-run drawing_gates ≥8.

## B · DETERMINISTIC VERIFICATION — the architecture reframe (Tristan 2026-06-19) ⭐
> Principle: a number is trustworthy only if you can WATCH it be computed; discrepancies flagged by deterministic ARITHMETIC, not an LLM. The Excel IS the verification engine. CAGE the LLM critic.
- B1 ✅ Every number is DERIVED (formula + visible inputs) or SOURCED (provenance link) — no bare assertions. Needs: expose inputs on the 25 legacy calcs + BoM price derivation.
- B2 ✅ Complete deterministic CHECK SUITE (Excel ⚠Checks + mirrored engine gates), all pure arithmetic: consistency (per-unit×count=total, Σsub=principal, emitter=contract, cross-page equal); adequacy (rating≥duty: pump / breaker / cable / tank>media / chiller); balances (mass / energy / flow); cost (per-line band, Σ=cover).
- B3 ✅ DEMOTE the LLM critic — deterministic checks drive the physics score; the LLM is advisory + cross-checked, may NEVER turn a green check red or set the floor alone.
- B4 ✅ Make numbers EXPLICIT on the words so the LLM can't misread (= the pump-1336 root cause; task #123).

## C · SPREADSHEET (dossier.xlsx) — the 50 improvements + provenance
> Full 50 + phased plan captured from the sub-agent deliverable (Phase 1 quick wins · Phase 2 bigger · Phase 3 engine). Sequence the VERIFICATION items (B2) to the FRONT.
- C1 ✅ Provenance: confidence tiers (green/amber/red), "Verified by" column (catalogue/distributor/parametric/LLM), surface the quantity tool_id/URL/uncertainty already in state.json, source-URL hyperlinks.
- C2 ✅ Schedules-as-tables: panel schedule → tab; process schedules → tab (line/valve/instrument); line&velocity tab (within_spec flag); parts-manifest + cable/pipe take-off tabs; SLD/P&ID/BFD companion tables beside the picture.
- C3 ✅ Nav/UX: Contents tab + hyperlinks + back-links; autofilter; number formats (£#,##0 / #,##0); print areas + headers; freeze panes; tab colours; grouping/outline.
- C4 ✅ Interactivity: single Inputs tab; scenario columns (low/central/high); sensitivity/tornado; data-validation dropdowns; named ranges.
- C5 ✅ Engineering value: spec-sheet-per-principal; cost waterfall; brief-compliance matrix; energy/OPEX; assumptions tab.
- C6 ✅ Sharing/accessibility: README/how-to-read; glossary; locked-vs-editable; metadata (run id/SHA/date/disclaimer); colour-blind-safe palette.
- C7 ✅ ENGINE changes (Phase 3): per-BoM-row tool_id provenance; structured `basis` fields on requirementsBom/costBasis.
- C8 ✅ Fix exporter bug — value-equality chaining grabs the wrong cell (wall & roof both = 4920 → both ref B30); chain by symbol+label, not value.
- C9 ✅ Wire the exporter into the chain — auto-generate dossier.xlsx on every run.

## D · KNOWN DEFECTS (found this session)
- D1 ✅ Grundfos UP15-42 — a real domestic-circulator MPN marked "IDENTIFIED" and priced £67,900 as a 97 kW pump. Fix the part selection; the B2 part-vs-duty + price-band checks catch it.
- D2 ✅ The LLM physics critic mis-reads correct deterministic designs (read a per-tank 1,336 branch flow as the pump total) — the reason for B3/B4.

## Status log
- 2026-06-19 created (captures the full recent discussion). A1/A2 DONE+pushed; A3 in-progress (sub-agent).
