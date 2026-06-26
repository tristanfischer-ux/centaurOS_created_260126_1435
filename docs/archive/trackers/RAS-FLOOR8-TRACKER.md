# RAS DEMO — THE PLAN (integrated) · FishFrom, Mon 2026-06-22

> This file = the PLAN (what + when). Item ledger + status = `BACKLOG.md`. 50-improvements detail = `docs/SPREADSHEET-50-IMPROVEMENTS.md`. Audit any time: `bash scripts/verify-floor.sh` + `BACKLOG.md`.
> Standing constraints: NO PDFs (Excel is the surface) · everything UNIVERSAL (no `if ras`) · verification is DETERMINISTIC arithmetic, not LLM.

## THE GOAL
A RAS dossier that is demo-ready for FishFrom, reviewed through the **Excel `dossier.xlsx`** (dashboard / ledger / Blender / 8 drawings underneath). No customer PDF.

## THE PRINCIPLE (the spine that unifies everything)
"Demo-ready" = every number is **correct** AND **deterministically verified**. The Excel's arithmetic checks are green, and **those green checks — not an LLM score — are the quality bar.** This *replaces* the old "lift each LLM scorecard section to 8": a section is good when its deterministic checks pass. (This is why the floor stuck at 2 — an LLM critic was misreading correct numbers.)

## THREE CONVERGING STRANDS (not three projects — one goal)

### Strand 1 · Engine numbers CORRECT  (the increments)
- INC 0 ✓ scorecard de-dup + code-fix gated off · INC 1 ✓ tool_archetype 2→10 (both pushed)
- INC 3 ✓ physics (engine) — pump per-unit EXPLICIT 1,670 + main breaker 4,000 A (from 1,719 kW) + biofilter tank 153 + panel 2,865→1,754 (G2 PASS). Commit `a98db4d76` (held). Needs ONE PDF-free chain run to confirm the semantic physics_fidelity re-score.
- INC 2 — brief_compliance value+unit mapping
- INC 4 — connectivity deterministic pre-Blender graph (process & instrument ≥80%)
- INC 5 — drawings read ONE ledger + hero reframe

### Strand 2 · DETERMINISTIC VERIFICATION  (the new arbiter) ⭐
The check suite that PROVES the numbers and CAGES the LLM critic:
- **consistency** (per-unit×count=total, Σsub=principal, emitter=contract), **adequacy** (rating≥duty: pump/breaker/cable/tank>media/chiller), **balances** (mass/energy/flow), **cost** (per-line band, Σ=cover)
- lives in the Excel ⚠Checks (live formulas) **and** mirrored as engine gates
- **demote the LLM critic** — deterministic checks set the score; the LLM is advisory and may never turn a green check red
- *(= BACKLOG §B + the 50's verification items #11–19)*

### Strand 3 · The EXCEL surface  (the 50 improvements)
- **Tier 1** = Strand 2 built IN the Excel + provenance: confidence tiers (#2), Verified-by (#4), part-vs-duty (#3), **fix the chaining bug (#19)**
- **Tier 2** = verifiable artefacts: schedules-as-tables (#20–22), brief-compliance matrix (#45), cost waterfall (#44), spec sheets (#43), Contents tab (#26), number formats (#37)
- **Tier 3** (post-Monday) = nav / visual / interactivity / sharing
- + wire the exporter into the chain (auto-regenerate per run); 2 engine changes (#9 structured basis, #10 per-row tool_id) later

## HOW THEY CONVERGE
Strand 2 (the checks) is *built inside* the Excel (Strand 3 Tier 1). Strand 1 makes the numbers those checks verify. All three meet + one **PDF-free** chain run → the Excel goes GREEN by arithmetic → demo-ready.

## DAY-BY-DAY  (today Fri → demo Mon)
- **Fri (rest):** physics agent finishes INC 3 → I review + re-verify it **against the real words**; START Strand 2/3 Tier 1 (the deterministic check suite — it's the fix *and* the demo).
- **Sat:** INC 2 + INC 4 (Strand 1) · finish the check suite + demote the LLM (Strand 2) · one PDF-free chain run to verify.
- **Sun:** Tier 2 tabs (schedules / matrix / waterfall / spec sheets) · INC 5 (drawings + hero) · regen Excel · verify green.
- **Mon AM:** final PDF-free run · regen Excel · eyeball every tab + the green checks · freeze the artefact.

## STATUS (live — 2026-06-19 PM)
- **origin/main `10297539c`**: INC 0/1 + Excel exporter + **INC-4 connectivity (`959a44972`)** + **CWE-1236 Excel formula-injection fix (`10297539c`)** — all pushed.
- **B3 (cage the LLM critic) — code done + proven, commit pending the run**: `computeQualityScorecard` floor + allPass now set by the DETERMINISTIC sections only (drawing_gates/cost_sanity/physics_gates/tool_archetype/connectivity); LLM self_audit sections = advisory (visible, non-gating); `extractFixDirectives` skips advisory. Pure helper `src/lib/pdf-engine-v2/lib/scorecard-floor.ts` + harness `QL6` (3 cases) GREEN; chain typecheck clean. **Proof on real ras-inc5: floor 6 → 8, allPass=true** (the dragging physics_fidelity=6 + brief_compliance=7 were LLM misread/wobble).
- **Live `out/ras-inc5` (audit-refreshed): deterministic CLI 281/0 · Excel ⚠Checks 0 fail · connectivity process 87% / instruments 100% · scorecard floor 8.** This is the demo-green artefact today.
- **`out/ras-inc6`**: fresh lean run IN FLIGHT (INC-4 source-side spine + B3, end-to-end) → final demo artefact.
- The floor is no longer LLM-noise-gated. Durable history: git log + `BACKLOG.md`.
