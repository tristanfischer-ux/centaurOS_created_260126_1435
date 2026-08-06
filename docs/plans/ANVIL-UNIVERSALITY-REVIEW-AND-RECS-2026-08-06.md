# Anvil universality — review, recommendations, and tests

**Date:** 2026-08-06  
**Author:** Grok Build (execution) + multi-model council (to be attached)  
**Trigger:** FE front pack used internal folder name `em-honesty/`; Tristan required customer-facing paths and a real universality bar for Anvil — then re-run bioreactor to FE-front care (tabs ≥ 9/10).

---

## 1. What “universal” must mean for Anvil

Anvil is **universal** only when all of the following hold for **any product class** (motors, benchtop instruments, process plants):

| Layer | Universal means |
|---|---|
| **Customer pack layout** | Same top-level folders and naming rules for every class (`renders/`, `drawings/`, `pcb/`, `electromagnetics/` when EM exists, `multiphysics/` when screens exist, `dossier.xlsx`, cover PDF/HTML). No class nicknames (`em-honesty`, `FOR-JACK`). |
| **Scoring bar** | Tab scorecard and quality scorecard use the **same contracts**; floor is earned by weakest real sheet, not by class-specific escape hatches. |
| **Evidence → workbook** | Physics, BoM, PCB, drawings write through **shared writeback / densify / gate** modules, not one-off FE-front scripts. |
| **Cover narrative** | Same structure (what it is, status, where to look, open items, relative links); class-specific content only in the body. |
| **Regression** | Automated tests refuse class-only pack names and prove at least two product classes still pack. |

**Not** universal: a capability exists only on FE front, or a pack path is hand-renamed after one zip.

---

## 2. Findings (current state)

### 2.1 Fixed this session (was pack-only → now pipeline)

- Customer EM evidence folder is **`electromagnetics/`** in:
  - `scripts/build-excel-export.py` (design-pack bundle copy)
  - `scripts/fe-front-full-clean-rerun.sh`
- Regression: `scripts/test_pack_customer_evidence_dir.py`
- Commit: `fix: ship electromagnetics/ as customer pack folder (was em-honesty/)`

### 2.2 Still not universal (council + engineering backlog)

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| U1 | EM pack path was hard-coded as `em-honesty/` (internal nickname) | **P0 — fixed in ship path** | build-excel-export bundle block |
| U2 | FE-front jack EM render pipeline is still **motor/FE-front shaped** inside a “universal” exporter | **P1** | `jack_em_pack` phases B–E only meaningful for traction kits |
| U3 | Detailed GA lives in `blender-universal/draw_ga_detailed.py` but many twins never call it | **P1** | FE front used it; bioreactor may still use older GA path |
| U4 | Cover narrative + relative-link pack is **manual** for FE front, not a shared Anvil stage | **P1** | `_cover_doc/` built ad hoc |
| U5 | Tab floor-9 behaviour still **class-sensitive** (plant drivers on instruments, OOS tabs) | **P0 for bioreactor** | Inputs & Assumptions 1.2 — 14 orphan plant drivers |
| U6 | Connection-trace / parts-ledger topology not class-pruned for instruments | **P0 for bioreactor** | Connection trace 3.3 — 1 rendered vs 36 ledger edges |
| U7 | No multi-class pack layout selftest (FE + instrument + plant) | **P1** | Missing until §4 tests land |
| U8 | Stage discipline / twin write guard is universal; pack **content** still isn’t | **P2** | discipline OK; customer zip varies by agent care |

---

## 3. Recommendations (ordered)

### R1 — Single pack layout schema (code)

Define `PACK_LAYOUT_V1` in one module (e.g. `scripts/lib/pack_layout.py`):

```text
dossier.xlsx | renders/ | drawings/ | pcb/ | electromagnetics/ | multiphysics/ |
00-COVER-NARRATIVE.pdf|.html | 00-COVER-CLICK-INDEX.html | FOLDER-GUIDE.txt | MANIFEST.txt
```

Every pack builder imports this; no string literals elsewhere.

### R2 — Class-conditional **content**, not class-conditional **paths**

- Motors: fill `electromagnetics/` from motor-stack / fieldplot.
- Instruments: leave `electromagnetics/` absent or with a short `README-not-applicable.txt` — **do not invent** FE field plots.
- Never invent folder nicknames per project.

### R3 — Instrument vs plant frame as a hard gate

Before scoring Inputs & Assumptions:

- If `isInstrumentDevice`, **reject or quarantine** plant drivers (sale price, feedstock, annual volume) unless wired to an instrument capital model.
- ProveCatch: plant LCOE rows must not appear on instrument Financial model.

### R4 — Topology prune for gold-spine instruments

Connection trace score must not fail because **ghost** ledger edges outnumber rendered instrument nets. Prune or classify consumables before scoring (existing issue text already names this).

### R5 — Cover as a first-class stage

`scripts/lib/build_pack_cover.py`:

- Inputs: twin, pack root, brand (Anvil / Fractional Forge)
- Outputs: cover PDF/HTML + click index with **relative** links
- Prose template without process jargon; optional class blurb

### R6 — Dual-class smoke pack

CI job (or local script): build packs for:

1. `formula_e_front_mgu` (or cached twin)
2. `organoid_bioreactor` (or cached twin)

Assert layout schema + no `em-honesty/` + cover files present.

### R7 — Tab floor 9 as a **gate config**, not a wish

`ANVIL_TAB_FLOOR=9` for send packs; fail the pack stage if any **scored** tab &lt; 9 (mirrors and OOS tabs excluded by existing rules).

---

## 4. Tests (do not break Anvil)

| Test | What it protects | How |
|---|---|---|
| `test_pack_customer_evidence_dir.py` | No `em-honesty/` in ship paths | Already landed |
| `test_pack_layout_schema.py` | Required files/folders when present | New — §4.1 |
| `test_instrument_no_plant_lcoe_frame.py` | Instrument financial frame | Selftest on fixture state |
| `test_connection_trace_ghost_ratio.py` | Ghost topology cannot dominate | Fixture ledger |
| `test_cover_relative_links.py` | Cover HTML hrefs resolve under pack root | Build cover on fixture pack |
| Existing gate-registry / falsifiability / discipline selftests | Physics and process | Keep green on every commit |

### 4.1 Minimal new layout selftest (sketch)

```python
REQUIRED_ALWAYS = ["dossier.xlsx", "MANIFEST.txt"]  # or design-pack.xlsx legacy
REQUIRED_IF_PRESENT = {
  "renders": ["00-hero.png"],  # or first product render
  "drawings": ["general-arrangement.png"],
}
FORBIDDEN = ["em-honesty/"]  # path segment
```

Run against last FE pack + last instrument pack on disk when available; skip if twin missing (CI optional).

### 4.2 Safety rules for changes

1. **No silent score inflation** — floor rises only when source checks pass.  
2. **Maker ≠ checker** — pack layout test does not use the same prompt that wrote the pack.  
3. **One product-class change at a time** with both FE and instrument smoke after.  
4. **Rename with alias window** only if external customers already have `em-honesty/` bookmarks (this send does not need alias).

---

## 5. Council brief (for multi-model panel)

**Question:** Is Anvil universal across product classes, or is it a FE-front specialist with instrument/plant add-ons?

**Required verdict shape:**

- `verdict`: UNIVERSAL | PARTIAL | CLASS_SPECIALIST  
- `must_fix`: list  
- `tests_required`: list  
- `safe_change_order`: ordered steps  

**Seats:** GPT-5.6 Terra (audit), Grok 4.5 (corroborate), Claude Opus (synthesis) if available.

---

## 6. Bioreactor target (same care as Formula E)

**Twin:** `out/organoid-9drive-r11-allfixes` (V1.10 — all scored tabs ≥9; concept floor 9; ship gate PASS)  
**Brief:** `briefs-loop/yuri_organoid_bioreactor.md`  
**Bar:** every **scored** tab ≥ **9.0**; pack zip with Anvil cover PDF/HTML + relative links.

### Failures blocking floor 9 (2026-08-06 read)

| Tab | Score | Root cause (from scorecard) |
|---|---|---|
| Inputs & Assumptions | 1.2 | 14 orphan plant-style drivers not wired |
| Connection trace | 3.3 | Ghost topology: 1 rendered vs 36 ledger connections |
| Verification | 4.0 | PCB PnP HARD open; overview invariant HARD open |
| ⚠ Checks / Overview | 4.0 / 6.0 | Part names specific; internal runs fit envelope |
| BoM Ledger | 8.9 | Empty required cells (`% present`) |
| Executive Summary / Quality | 1.2 | Mirror of dossier floor |

Closing Inputs + Connection + Verification + Checks raises the floor; mirrors follow.

---

## 7. Done criteria for this workstream

1. [x] `electromagnetics/` is the ship path in code + regression test  
2. [x] Council JSON attached under `docs/plans/` (PARTIAL verdict; Terra+Grok)  
3. [x] Layout + instrument-frame + ghost-ratio + cover-link tests implemented and green  
4. [x] Bioreactor scored tabs all ≥ 9.0 (`organoid-9drive-r11-allfixes` V1.10)  
5. [x] Bioreactor design-pack zip + cover PDF/HTML shipped  

---

*End of plan document — execution continues below.*


---

## 8. Execution outcome (2026-08-06)

| Deliverable | Path / result |
|---|---|
| Universality verdict | **PARTIAL** (council synthesis) — path discipline fixed; residual R3–R7 backlog documented |
| Tests green | `test_pack_customer_evidence_dir`, `test_pack_layout_schema`, `test_connection_trace_ghost_ratio`, `test_instrument_no_plant_lcoe_frame`, `test_cover_relative_links` |
| Shared cover stage | `scripts/lib/build_pack_cover.py` |
| Bioreactor twin | `out/organoid-9drive-r11-allfixes` |
| Workbook | `20260806-0402-V1.10-benchtop-bioreactor-engineering-workbook.xlsx` |
| Pack zip | `20260806-0402-V1.10-benchtop-bioreactor-design-pack.zip` |
| Cover | `00-COVER-NARRATIVE.pdf` / `.html` / click index (pack-relative links) |
| Tab floor | **9/10** all scored tabs; concept floor 9; CHECKS FAIL 0 |

### Safe change order (remaining backlog — do not skip tests)

1. Capability-driven electromagnetics interface (motor phases out of universal exporter).  
2. Dual-class CI smoke (FE + instrument) on every pack-layout change.  
3. Instrument plant-driver gate before densify (U5 hard gate, not only score recovery).  
4. Topology prune library shared (not twin-local edits).  
5. Keep `ANVIL_TAB_FLOOR=9` as send-pack gate once PCB fab-ready axis is class-aware.
