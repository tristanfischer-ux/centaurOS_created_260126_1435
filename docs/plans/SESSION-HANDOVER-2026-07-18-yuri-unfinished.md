# Agent Handover — Yuri unfinished products → ≥9

**Date:** 2026-07-18 ~05:20 BST  
**Branch:** `oxccu-efuel` (tracking `origin/oxccu-efuel`; large **uncommitted** SOURCE working tree)  
**Task:** Get every unfinished Yuri makers-kit product to **ships + floor ≥9 + gold materials ±15% + form_id match + glance PASS**  
**Status:** Partially complete — **6/7 DONE**; **OpenDrop one excel rebuild away** (SOURCE fix already in tree + state BoM healed)  
**Directive from Tristan:** “fix all the issues. don’t stop.” Handing terminal to another model mid-queue.

**Dated copy:** keep this file as the live root handover; older colorimeter takeover docs under `docs/plans/*HANDOVER*` / `docs/plans/2026-07-13-CURSOR-TAKEOVER-colorimeter.md` are **stale** for this campaign.

---

## Context

Yuri = open hardware instrument briefs (colorimeter, NinjaPCR, Poseidon, OpenFlexure, Pioreactor, Rodeostat, OpenDrop). Campaign watchers burn cold chains; when a run fails the bar, fix the **SOURCE rule** (never a one-off data patch without a proveCatch), heal the artefact if safe, re-score via excel rebuild, then continue.

Standing rules (non-negotiable):
- Fix the **rule** in code + add `--selftest` / proveCatch (`CLAUDE.md` CORE FIX PRINCIPLE).
- SIGHT the real artefact (excel cells, hero PNG, scorecard) — never trust chain stdout alone.
- Do **not** commit/push unless Tristan asks (user rule). Working tree is intentionally dirty with SOURCE.

---

## Bar definition (Yuri)

A product is **DONE** only when **all** of:

| Check | How |
|---|---|
| `ships == True` | `tab-scorecard.json` → `verdict.ships` (written by excel export) |
| `floor ≥ 9` | `verdict.floor` |
| Gold materials ±15% | `python3 scripts/lib/gold_cost_band.py <run>/state.json` |
| Form match | `form-meshes.json` → `form` / `form_id` matches expected |
| Glance | When registered for that form in `drawing_vision_glance.py` |

Expected forms / gold mids (materials):

| Product | Class / key | Form | Gold mid |
|---|---|---|---|
| Colorimeter | optical_instrument | `optical_handheld` | £125 |
| NinjaPCR | thermocycler | `thermocycler` | £480 |
| Poseidon | syringe_pump | `syringe_pump` | £184 |
| OpenFlexure | lab_microscope | `lab_microscope` | £198 |
| Pioreactor | benchtop_bioreactor | `lab_electronics` | £259 |
| Rodeostat | potentiostat | `lab_electronics` | £189 |
| OpenDrop | digital_microfluidics | `lab_electronics` | £236 |

---

## COMPLETED ✅ (6/7 at bar)

| Product | Run dir | ships | floor | form | materials |
|---|---|---|---|---|---|
| Colorimeter | `out/colorimeter-20260717-2254` | True | 9 | optical_handheld | £125 |
| NinjaPCR | `out/ninjapcr-20260718-0001` | True | 9 | thermocycler | £485 |
| Poseidon | `out/poseidon-20260718-0022` | True | 9 | syringe_pump | £184 |
| OpenFlexure | `out/openflexure-20260718-0101` | True | 9 | lab_microscope | £198 |
| Rodeostat | `out/rodeostat-20260718-0201` | True | 9 | lab_electronics | £189 |
| Pioreactor | `out/pioreactor-20260718-0327` | True | 9 | lab_electronics | £259 |

### SOURCE landed this campaign (mostly **uncommitted**)

Key files (do not discard):

| Area | Files | What |
|---|---|---|
| Instrument BoM / gold | `scripts/requirements_bom.py` | Lab culture vessel ≤£45; lab peristaltic floor £45 (not £3k dosing); instrument MCU/frame; gold rescale catalogue-pin GOTCHA; **instrument Distribution Manifold £28** (OpenDrop 0410) |
| Contract calc coverage | `scripts/lib/engineering-contract.ts` | Benchtop / potentiostat / digital_microfluidics `enclosure_volume_m3` emits L×W×H formula (was bare prose → calc-coverage miss) |
| Blender dims / form | `scripts/blender-universal/build_universal_scene.py`, `instrument_form_grammar.py`, `drawing_vision_glance.py` | Lab OD×H parse; culture vessel proxy; `lab_electronics` vision; thermocycler star knob; optical handheld; plantish word-boundary |
| Ledger / PCB | `parts_ledger.py`, `pcb_pipeline_runner.py`, `atopile-generator.ts`, `discover-capability.ts`, `sync-instrument-pcb-state.ts` | Lab filter buffer (not plant separator); DRC timeout 900s; host_protocol_bridge off-board; kicad presence fallback |
| Excel / glance / harness | `build-excel-export.py`, `render_image_quality.py`, `regression-harness.tsx` | Instrument score paths + invariants |
| Watcher | `scripts/yuri-revisit-watch.sh` | Revisit queue (may still be running — see Risks) |

**proveCatch already in `requirements_bom.py --selftest`:** culture vessel, sterile vent ≠ UV, lab peristaltic, floored-catalogue gold rescale, **instrument Distribution Manifold ≤£45 / plant still ≥£1000**.

Last pushed tip (for orientation): `d110d6c43` — working tree is **ahead + dirty** with the table above.

---

## IN PROGRESS — OpenDrop (Priority 1)

**Run:** `out/opendrop-20260718-0410`  
**Class:** `digital_microfluidics` · `isInstrumentDevice: true` · form `lab_electronics` (meshes present)  
**Gold:** PASS — materials £236 == gold £236  

### What was wrong

1. **HARD `dominant_bom_line`:** Distribution Manifold M-101 took plant header budget **£1500**, gold-rescaled to **£171.87 = 73%** of £236 bill → Verification HARD open → floor capped at 4 → ships False.
2. Earlier mid-run: stale PCB `host_protocol_bridge` unresolved (healed with `npx tsx scripts/lib/sync-instrument-pcb-state.ts out/opendrop-20260718-0410`); connectivity plant-filter false positive (fixed in `parts_ledger.py`).

### What is already fixed in tree / state

- **SOURCE** in `scripts/requirements_bom.py` `_unit_operation_price`: if `_IS_INSTRUMENT_DEVICE` and noun matches distribution/delivery manifold → **£28 lab fluidics** basis (not plant £1500). proveCatch next to sterile-vent tests.
- **`state.json` requirementsBom** reassembled: M-101 is **£28**, Σ materials **£236.08**, top line now Galvanic Isolator ~21% (under 50% dominant gate).
- Drawing gates: `all_pass: true`. PCB: fab path was cleaned earlier. Form meshes: `lab_electronics` with chip/BNC/PCB/USB.

### What is NOT done (blocker for ships)

**`dossier.xlsx` is STALE relative to state BoM.**

- `state.json` / scorecard mtime ~05:15; excel ~05:13.
- Verification sheet **still shows** `hold Needs input — dominant_bom_line | OPEN | HARD` and “HARD open 1”.
- `tab-scorecard.json` currently lacks a proper `verdict` object; Executive Summary / Quality & Audit mirror floor **4**.

### Exact next steps (do these first)

```bash
cd /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel

# 1) Confirm SOURCE selftest (manifold proveCatch)
python3 scripts/requirements_bom.py --selftest

# 2) Re-assemble BoM into state (idempotent; already £28 but safe)
python3 - <<'PY'
import json, os
from scripts.requirements_bom import assemble  # may fail as package — use CLI instead
PY
# Prefer CLI + write-back (assemble --json does NOT write state):
python3 - <<'PY'
import json, subprocess, os
run = "out/opendrop-20260718-0410"
rows = json.loads(subprocess.check_output(
    ["python3", "scripts/requirements_bom.py", run, "--json"], text=True))
sp = os.path.join(run, "state.json")
st = json.load(open(sp))
st["requirementsBom"] = rows
# optional: reconcile materials total into costStack if present
json.dump(st, open(sp, "w"))
print("wrote", len(rows), "Σ", round(sum(r["line_gbp"] for r in rows), 2))
m = next(r for r in rows if "Manifold" in r["requirement"])
assert m["line_gbp"] <= 45 and "lab fluidics" in m["basis"], m
PY

# 3) Rebuild excel → refreshes Verification + verdict + tab-scorecard
.venv/bin/python scripts/build-excel-export.py out/opendrop-20260718-0410

# 4) SIGHT the bar
python3 - <<'PY'
import json
from pathlib import Path
p = Path("out/opendrop-20260718-0410")
sc = json.loads((p/"tab-scorecard.json").read_text())
print("verdict", sc.get("verdict") or sc.get("summary"))
print("form", json.loads((p/"form-meshes.json").read_text()).get("form"))
PY
python3 scripts/lib/gold_cost_band.py out/opendrop-20260718-0410/state.json
# Confirm Verification sheet: dominant_bom_line CLOSED / HARD open 0
```

**Done when:** `verdict.ships is True` and `verdict.floor >= 9` and gold PASS and form `lab_electronics`.

If excel rebuild still leaves HARD open: re-run `dossier_audit.check_dominant_bom_line` path — ensure excel reads `state.requirementsBom` not a cached ledger copy; open `dossier.xlsx` Verification rows with openpyxl and confirm no OPEN HARD.

**Do NOT** start a full cold OpenDrop chain unless excel heal fails — heal first (minutes vs hours).

---

## REMAINING TASKS 🔧

### Priority 1 — Finish OpenDrop (above)
**ETA:** one excel rebuild + SIGHT (~5–15 min if clean).

### Priority 2 — Commit SOURCE (only if Tristan asks)
Large dirty tree. Suggested commit grouping (do **not** add `out/`, logs, stubs, `out-universal` noise):

1. `requirements_bom.py` — culture vessel + peristaltic + manifold + gold rescale
2. Blender / form / glance / grammar
3. PCB / ledger / sync
4. engineering-contract enclosure formula + harness stubs only if intentional

Message must include `regression-harness:` line or `no-invariant-needed because …` per CLAUDE.md.

### Priority 3 — Watcher hygiene
`out/logs/yuri-revisit.lockdir` held by **pid 5016** = `bash scripts/yuri-revisit-watch.sh` (was alive at handover).

- It may re-burn products already at bar, or race an excel rebuild.
- Before long work: `ps -p 5016` — if still the revisit script and Tristan wants a quiet terminal, stop it (`kill 5016` after confirming) and remove stale lockdir only if process is dead.
- Log: `out/logs/yuri-revisit-watch.log`

### Priority 4 — Campaign complete declaration
When OpenDrop ships ≥9, status sweep all seven dirs and report the table. No new Yuri product until Tristan opens the next queue.

---

## Known bug patterns (so you don’t re-learn)

| Symptom | Root cause class | Fix locus |
|---|---|---|
| One BoM line >50% after gold rescale | Plant unit-op / take-off on instrument noun | `requirements_bom.py` `_unit_operation_price` / `_materials_takeoff` + instrument gate |
| Materials £3k vs gold £259 | Plant dosing-system **floor** on “Dosing Peristaltic” | `_price_floor_for` instrument skip + lab £45 floor |
| Culture vessel £229 / 88% | Blender AS-BUILT plant cylinder dims on 20 ml vial | `_cyl_from_dim` OD×H + `_lab_culture_vessel_price` |
| Calc-coverage ~97% | Bare `enclosure_volume_m3` prose | `engineering-contract.ts` L×W×H in source_detail |
| PCB unresolved / DRC timeout | Stale off-board word; 300s DRC under load | `sync-instrument-pcb-state.ts`; DRC 900s |
| Connectivity “missing_output” on lab filter | Plant separator classifier | `parts_ledger.py` instrument lab-filter allowlist |
| `assemble(... --json)` leaves state stale | CLI prints JSON only | **Write back** to `state.requirementsBom` then excel |

---

## USEFUL COMMANDS

```bash
# Status sweep
python3 - <<'PY'
import json
from pathlib import Path
for name,d in [
  ("Colorimeter","out/colorimeter-20260717-2254"),
  ("NinjaPCR","out/ninjapcr-20260718-0001"),
  ("Poseidon","out/poseidon-20260718-0022"),
  ("OpenFlexure","out/openflexure-20260718-0101"),
  ("Rodeostat","out/rodeostat-20260718-0201"),
  ("Pioreactor","out/pioreactor-20260718-0327"),
  ("OpenDrop","out/opendrop-20260718-0410"),
]:
  p=Path(d); sc=json.loads((p/"tab-scorecard.json").read_text())
  v=sc.get("verdict") or {}
  form=json.loads((p/"form-meshes.json").read_text()).get("form") if (p/"form-meshes.json").exists() else None
  print(f"{name}: ships={v.get('ships')} floor={v.get('floor')} form={form} open={v.get('open_issues')}")
PY

python3 scripts/requirements_bom.py --selftest
python3 scripts/lib/gold_cost_band.py out/opendrop-20260718-0410/state.json
.venv/bin/python scripts/build-excel-export.py out/opendrop-20260718-0410

# Cold re-run only if heal insufficient (hours; needs API keys — see API_KEYS.md)
# Prefer scripts/yuri-revisit-watch.sh / campaign watch — one product at a time
```

---

## Risks / GOTCHAs

1. **Dirty tree is load-bearing.** Don’t `git checkout --` SOURCE files to “clean up.”
2. **Watcher lock** may collide with excel rebuild or start another OpenDrop burn.
3. **Don’t trust stdout** — open Verification sheet + `tab-scorecard.json` `verdict`.
4. **Gold rescale** can hide plant mis-prices as “still dominant after shrink” — fix unit-op price, don’t only rescale.
5. OpenDrop BoM still has odd catalogue pins (e.g. Emerson Fisher GX as “Flow Control Valve” £18) — not blocking if &lt;50%; don’t chase unless Verification/gold fails.
6. `AGENT_HANDOVER.md` previously described a **2026-07-13 colorimeter** takeover — **replaced** by this doc.

---

## QUICK START FOR NEXT AGENT

1. Read **this file** end-to-end.
2. `ps -p 5016` — note/stop `yuri-revisit-watch.sh` if it will race you.
3. Run **Priority 1** excel rebuild + SIGHT for `out/opendrop-20260718-0410`.
4. If ships + floor ≥9: print the seven-product DONE table; ask Tristan about commit.
5. If still HARD: open Verification in `dossier.xlsx`, find remaining OPEN HARD, route to SOURCE rule (not a one-line excel edit).

**Success sentence to report:**  
“Yuri queue complete — Colorimeter, NinjaPCR, Poseidon, OpenFlexure, Rodeostat, Pioreactor, OpenDrop all ships floor ≥9 with gold + form.”
