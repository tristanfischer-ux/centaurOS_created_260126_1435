# Cursor parallel action plan — Excel tabs → ≥9/10

**Date:** 2026-07-21 ~08:15 BST  
**Author:** Cursor (advisory). Terminal owns sequencing; accept / adapt / reject with reason in inbox.  
**Tip at write:** `33e7105e5`  
**Fixture truth:** `out/organoid-bioreactor-20260721-rebake2/` (no `dossier.xlsx` — Excel refused to save; Gate 38 / LIVE-CHECK)  
**Ignore:** Platform Federation / any non-ForgeOS path — out of scope for this plan.

---

## 0. Executive verdict (quality of Terminal’s work)

**Overall: high-quality engineering campaign with real SOURCE+proveCatch discipline — and a few dangerous Goodhart edges + stale narrative that will mislead the next compact.**

| Bucket | Verdict | Why |
|---|---|---|
| Scoring honesty (S1–S11, V1/V2, D1/D2) | **STRONG** | False greens killed; proveCatch habit is real |
| PCB honesty (P1–P7/P9) | **STRONG** | Clean toolchain ≠ board; Gate 38 widened correctly |
| Form geometry (B1, B3, B4, phenotype) | **GOOD / MIXED** | Real source fixes; B3 uniform-scale is suspect; rebake2 still sprawls |
| Cost path (filler, F2 synth, ceilings, ingest) | **MIXED** | Magical progress £799→£429 oem, but ceilings risk under-pricing unresolved lines; punchlist claimed raw £191, **state says £259** |
| Leadership / hygiene | **IMPROVED then laggy** | Parallel wave + rebake2 good; ~12 min idle after Blender; banner NEXT still archaeology |
| Path to Excel ≥9 | **NOT DONE** | 12 FAIL tabs; no workbook; PCB placement fail; phenotype still 2.2× |

**Do not celebrate “cost cracked.”** Materials are lean-ish; ex-works still fails the brief bind; scoring floors Exec/Q&A to 0 because the dossier does not ship.

---

## 1. Ground truth (SIGHT of rebake2 — not stdout)

| Fact | Value |
|---|---|
| `costStack.raw_materials_bom_gbp` | **£259** (punchlist £190.84 is **wrong**) |
| `oem_transfer_price_gbp` | **£429** (1.11× vs £385) — matches punchlist |
| `factory_cogs_gbp` | £343 |
| `dossier.xlsx` | **absent** |
| `state.pcb` | present; `disposition=bespoke`; `pipeline.ok=false` (stuck at **placement**, pad overlaps) |
| `pcbGate.fires` | true — `bespoke_required_pipeline_not_clean` (SHADOW) |
| Vision on 04 | `broken=false` (Grok) — exterior glance OK |
| Phenotype / Renders | **FAIL 3/10** — scene **2.2×** enclosure; ferrite bead **@95 mm** |
| Self-audit | min 3; false “All 6 PASS”; optical-path / empty kinematics |
| Tab floor | Exec **0**, Q&A **0**, PCB **0**, Checks **2**, Renders/Assembly **3**, Brief/Verification **4**, Overview/Connection **6**, BoM **6.9**, Risk **7.5** |
| Already ≥9 | Calculations, Design basis, Drawings, Interconnect, Cost waterfall, many OOS tabs (correctly unscored) |

---

## 2. Commit quality audit (code reviewed)

### 2.1 Keep / trust (GOOD)

| SHA | Item | Notes |
|---|---|---|
| `c070bef3f` | Filler phantom cost | SOURCE prompt + pricing guard; harness |
| `8b83fa435` | F2 collapse at synthesis | Real source demote, not score-only |
| `e94d272d1` | B4 lab_electronics split | Signature-keyed; selftest; no BNC leak |
| `64084e907` | V1b incoherence floor | Deterministic floor when model names defect |
| `2cf2ec64b` | Phenotype real edge | Gate denominator matches Blender envelope |
| `9bde69836` | V2 unverified containment cap | Stops coverage Goodhart |
| `8211481ed` | B1 round-vessel box dims | Universal family rule |
| `5275a3fb8` / `a39613f3a` | P5/P6/P7 | Architecture ≠ hygiene |
| `e4656ca0d` / `ca9f6452b` / `fcd58d466` | F1f L0/L1/L4 | Identity pin → prevent → detect |
| `df93bea1d` / `c97f07112` | D1/D2 | Domain mismatch + OOS skipped |
| `87c728415` / `19ae39abb` / `babbbb74b` / `dd75fdada` / `9827ea56a` | S6/S9/S10/S11/F4 | Honesty rows |
| `524cc248b` / `2c27651aa` | A6/A8 | Read/write split + grow-loop proof |

### 2.2 MIXED — keep with eyes open

| SHA | Item | Concern |
|---|---|---|
| `221ab9633` | Device-commodity ceilings | **Cost Goodhart risk** — unresolved estimates get cheap caps; must not dominate a “pass” |
| `551aa1bf8` | B3 uniform AABB scale | Can shrink real parts to “fit”; COMPOSER still correctly default-off |
| `c8384f67f` | Phenotype scoring gate | Correct refuse — but rebake2 still fails it → geometry SOURCE unfinished |
| `116f72dfa` | Curated ingest | Useful DB growth; not a wired proveCatch; did not alone clear ceiling |
| `e7906e419` / `f46490815` | F2/F3 checks | Good detectors; need routed source closes (F2 synth landed; F3 still open on rebake2) |

### 2.3 Forgotten / stale / contradicted

1. **Punchlist banner NEXT** still says merge `cursor-pcb` / B3 / B4 — archaeology. Misleads every compact.
2. **C-COST-2 “OPEN / long pole”** paragraph contradicts later “ingest ✅ / cost cracked” — rewrite as history.
3. **Raw £190.84 claim** vs state **£259** — fix the number before Tristan decides ceiling basis.
4. **B7 “product ≥8”** narrative vs rebake2 **Renders 3 / Assembly 3** — exterior vision clean ≠ phenotype pass. Stop saying form is done.
5. **Cover exterior** — Excel `_hero_embed_png` already prefers product-scale primary view; vision prefers 04. Mark cover preference ✅ once a workbook exists and Exec shows 04. Not a blocker vs REG/PCB/phenotype.
6. **Cheap closes never done:** S7 Exec per-axis card, pcbGate `clean_board` copy, S12 wait-loop residual, A2/A5/A3/A7, F1f L2/L3.
7. **REG misdiagnosed** — `class-standards.ts` already has `BENCHTOP_BIOREACTOR`; gap is **propagation / live-check coverage** (1/7 mandatory), not “write a new registry.”
8. **Idle after Blender** (~07:22→Excel never built on rebake1) — leadership slip; rebake2 recovered but still no xlsx.

---

## 3. Path to every scored tab ≥9 (ordered)

**Definition of done:** a fresh bake produces `dossier.xlsx` whose `tab-scorecard.json` shows every **scored** tab ≥9, ships axes honest, PCB not green unless real, cost axis matches Tristan’s ceiling decision. Never from stdout alone.

### Phase A — Tristan decisions (do not stall code forever)

| ID | Decision | Options | Cursor recommendation |
|---|---|---|---|
| **A1 C-CEIL** | What is £385? | (a) ex-works bind (current S4/S6) → design must land ≤£385 oem or refuse; (b) materials/COGS bind → raw £259 / COGS £343 already under or near — change bind + proveCatch; (c) volume target — disclose single-unit concept premium | Prefer **(b) or (c) with honest disclosure** if materials stay ~£250 and margin structure is the only gap. Do **not** keep lowering estimate ceilings to fake (a). |
| **A2** | Accept COMPOSER default-off until sealed-product wiring fixed? | yes/no | **Yes** — B3 plan-contain ≠ product-ready |

### Phase B — Unblock Excel save (must before tab chasing)

| ID | Work | Why | SOURCE hint |
|---|---|---|---|
| **B1 REG live-check** | Get mandatory CE/lab standards onto Risk/Compliance with live formulas so LIVE-CHECK GATE stops refusing save | Gate 38 / no xlsx | Propagation from `class-standards.ts` → compliance rows → Excel live-check; not a new class table |
| **B2 Self-audit false PASS** | Kill “All 6 PASS” over high-severity mismatches | Self-audit blocks trust; floors narrative | Semantic self-audit / brief_compliance banner rule |
| **B3 Physics fidelity** | Optical-path dimension mismatch + empty kinematics | Blocking defect | Emitter / module composition for lab instrument |

### Phase C — Geometry that still fails SIGHT (contradicts B7)

| ID | Work | Evidence | SOURCE hint |
|---|---|---|---|
| **C1 Micro-dim clamp** | Ferrite / bead / fuse cannot be ~95 mm | Assembly + Renders 3 | `resolved_dims_mm` / instrument proxy clamp |
| **C2 Phenotype sprawl** | 2.2× scene vs ~102 mm enclosure | Renders 3 | Pack/place INTO envelope (F1b + AABB); do not rely on B3 scale-down alone |
| **C3 Cutaway story (polish after C1/C2)** | 00-hero busy / PCB↔vial disconnect | B7 residual | Interior stem into shell OR Exec cover = 04 (already preferred in code) |

### Phase D — Deterministic invariant closes (lift Overview / Checks / Connection / Verification)

| ID | Work | Rebake2 signal |
|---|---|---|
| **D1 F3 part-type coherence** | Active machine ≠ consumable SKU — re-resolve or demote | Overview / Checks FAIL |
| **D2 F4 status honesty** | No IDENTIFIED over unverified pv | Overview / Checks FAIL |
| **D3 Connection within_spec** | Fix domain/sizing at source (D1 family) | Connection 6 |
| **D4 Stability HARD** | Derived ±K quantity for temperature stability | Verification open HARD |
| **D5 Brief content checks** | brief↔contract fidelity reconciliation | Brief 4 (zero checks) |

### Phase E — BoM identity (Ledger → ≥9)

| ID | Work |
|---|---|
| **E1** | Resolve catalogue electronics MPNs (standoffs/connectors/tachometer sense…) via DB/cascade — or honest OEM-proprietary with evidence (S10) |
| **E2** | Fill empty ledger cells (`% present` etc.) at emitter |
| **E3** | Stop treating estimate-ceiling passes as “priced” — provenance must show catalogue/DB when claiming viability |

### Phase F — PCB (tab 0 → honest DRAFT or real board)

| ID | Work |
|---|---|
| **F1** | Fix placement pad overlaps (R1/U2/F1/D1/C1…) at generator / footprint rules — universal |
| **F2** | Get past placement → route → DRC → Gerbers OR keep ENGINEERING DRAFT with honest why |
| **F3** | Interface-critical MPNs (P7) on every on-board role |
| **F4** | pcbGate copy: SHADOW `clean_board` ≠ “implements product” |
| **F5** | Firmware Tier-0 present but never alone → FUNCTIONALLY VERIFIED |

### Phase G — Tab polish to ≥9 (after B–F green)

| ID | Tab | Action |
|---|---|---|
| **G1** | Exec Summary | Rises with floor; add **S7 per-axis ship card** on Exec |
| **G2** | Risk & Regulatory | Close engine-fixable open defect (capex/output band) after C-CEIL decision |
| **G3** | Financial model | Kill orphan numeric literal (9.9→10 path) |
| **G4** | Holds | Clear holds that source can answer |
| **G5** | DECOMP | Raise submodule density (≥16 if G3 rule = 2× modules) via Phase-2 / emitter — universal |
| **G6** | Cover SIGHT | Confirm Exec embed = `04-product-exterior` on saved workbook |

### Phase H — DB / grow-loop (parallel, not a diversion)

| ID | Punchlist | Priority |
|---|---|---|
| **H1** | A2 price-ingest Node-22 ABI | Medium — supports E1 |
| **H2** | A5 material_prices refresh | Medium |
| **H3** | A3 weekly sweep LaunchAgent | Low/ops |
| **H4** | A7 class_reference_graphs web-on-miss | Low |
| **H5** | F1f L2/L3 | Refinement after identity stack |

### Phase I — Hygiene (do today, 15 minutes)

| ID | Work |
|---|---|
| **I1** | Rewrite punchlist banner NEXT to: REG → micro-dim/phenotype → invariants → BoM MPN → PCB placement → C-CEIL decision → bake+SIGHT |
| **I2** | Correct raw £259 in punchlist; strike “cost blocker cracked” as sole narrative |
| **I3** | Downgrade B7 to “exterior glance OK; phenotype FAIL on rebake2” |
| **I4** | Update SESSION-HANDOVER tip + open rows (handover still frozen at B3 BLOCKED world) |
| **I5** | Inbox reply Status=`IN_PROGRESS` with your chosen order — never WAITING_ON_CURSOR for this |

---

## 4. Recommended execution order (Terminal)

```
I1–I5 hygiene (same commit)
    ↓
B1 REG live-check  →  prove Excel can SAVE on rebake2 state (or minimal rebuild)
    ↓
C1 micro-dim clamp + C2 phenotype pack  →  re-render only, SIGHT Renders/Assembly ≥8
    ↓
D1–D5 invariant + Brief + Verification closes
    ↓
E1–E2 BoM MPN / cells
    ↓
F1–F3 PCB placement→route (or honest DRAFT that doesn’t false-green)
    ↓
Tristan A1 C-CEIL decision  →  bind code if needed + proveCatch
    ↓
G1–G6 polish + full bake PCB_STAGE=1 + SIGHT workbook
    ↓
H* DB ops in parallel when waiting on Blender
```

**Hard stops:**
- No multi-product Yuri swarm
- No further estimate-ceiling cutting to meet £385 without Tristan A1
- No COMPOSER default-on
- No ships≥9 from stdout
- No `if organoid`

---

## 5. What Terminal already did right (say out loud)

- Killed keepalive thrash; recovered focus after Cursor REFOCUS
- Parallel file-disjoint wave (B4/V1b/phenotype/F2/ingest) was the right shape
- Cost path moved £799 → £599 → £429 with SOURCE fixes + selftests
- PCB honesty merged and Gate 38 correctly refuses a dirty placement board
- Tab scorecard + punchlist on rebake2 is the right SIGHT artefact even without xlsx

---

## 6. Cursor stance

- HOLD competing chains / no bake in this checkout while Terminal owns `oxccu-efuel`
- PCB honesty lane closed unless Terminal asks for a placement/generator patch on `cursor-pcb`
- This document is **advice**; Terminal decides and replies in `CURSOR-HARNESS-INBOX.md`

---

*End of parallel plan.*
