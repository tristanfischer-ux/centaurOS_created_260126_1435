# Agent Handover — Codema dossier ship loop

**Date:** 2026-07-09 ~21:20 BST  
**For:** Claude Code / Fable (fee-free hours)  
**Repo / branch:** `CentaurOS-oxccu-efuel` / `oxccu-efuel`  
**HEAD:** `82ae8fefe` (local; **ahead of origin by 7 commits — not pushed**)  
**Task:** Ship chain-native Codema dossier (`briefs-loop/fischer_farms_codema.md`) with **every tab ≥9** and honest `ships: true`  
**Status:** In progress — **closest yet**. Run **2100** has dossier + scorecard; **one clear blocker left** (Exec Summary UNVERIFIED `ro_makeup_flow_m3_per_hr`)

---

## Context (read this first)

Tristan wants a **chain-native** Codema dossier that a chartered engineer would stamp — floor ≥9 on **every** Excel tab, `ships: true`. All fixes must be **universal** (noun / geometry / provenance signals). **No Codema / `water_treatment` special-cases.**

Success criterion (Tristan):

1. Cold chain finishes (`QUALITY_LOOP_PHASE=3`, isolated `DESIGN_STAGE_CACHE_DIR`)
2. Read **chain-written** `out/<run>/tab-scorecard.json` (not a post-hoc Excel rebuild)
3. Every tab ≥9, `verdict.ships === true`, and **honest** floor matches (Exec Summary must not be 2 while verdict claims ships)

Standing rules: `CLAUDE.md` CORE FIX PRINCIPLE + GATE INTENT + OPERATING-FRAME. Fix the **source rule**, add a **proveCatch**, re-run cold.

---

## Where things stand RIGHT NOW

### Latest cold run: `out/codema-full-20260709-2100`

| Artefact | Path |
|----------|------|
| Scorecard | `out/codema-full-20260709-2100/tab-scorecard.json` |
| Dossier | `out/codema-full-20260709-2100/dossier.xlsx` |
| State | `out/codema-full-20260709-2100/state.json` |
| Dashboard | `out/codema-full-20260709-2100/dashboard.html` |
| Log | `out-codema-codema-full-20260709-2100.log` |
| Chain PID | **finished** (quality loop COMPLETE) |

**Verdict object says:** `ships: true`, `floor: 9.4`  
**BUT honest tab floor is 2** — Executive Summary FAIL. **Do not declare ship.** Treat `summary.min_score` / fail_tabs as truth until Exec ≥9.

```
summary.min_score = 2
fail_tabs = ["Executive Summary"]
```

Almost everything else is ≥9.4:

| Tab | Score | Notes |
|-----|------:|-------|
| Executive Summary | **2** | **BLOCKER** — see Priority 1 |
| Electrical | 9.4 | Was 6.7 on 1820 — Design I fix worked |
| Quality & Audit | 9.4 | Mirrors floor |
| Inputs & Assumptions | 9.4 | |
| BoM Ledger | 9.5 | |
| Risk & Regulatory | **10** | Was 7.9 — phantom Irrigation Pump risk cleared |
| Drawings / Sense-check / Renders / GA / P&ID | **10** | Drawing gates ALL-PASS |
| Most other tabs | 9.7–10 | |

Quality-loop note from log: deterministic sections ≥9; advisory BoM section 8/10 (does not block ship loop the same way — **Exec UNVERIFIED does**).

### Contract quantities that matter (2100 state)

```
fertigation_dosing_pump_power_kw = 15  source=calculator   ✅ (was false brief 7.5)
uv_disinfection_power_kw         = 10.1 source=calculator  ✅ (was hydraulic-lifted to 30)
connected_electrical_load_kw     = 80
electrical_consumer__fertigation_circulation_kw = 30
electrical_consumer__nursery_fertigation_circulation_kw = 7.5
# NO electrical_consumer__irrigation_nutrient_pump_kw  ✅

# STILL PRESENT (tool wrote plant-total — protect may have missed motor path or ran after):
irrigation_pump_flow_m3_h  = 225  source=tool:irrigation:pump-sizing
irrigation_pump_motor_kw   = 30   source=demand-coverage (duty cross-check on 225 @ 2.9 bar)

# RO — brief metric unmet by exact key:
brief metric: ro_makeup_flow_m3_per_hr = 11 m3/hr
contract has: ro_high_pressure_pump_throughput_m3_h = 11
              ro_permeate_capacity_m3_h = 11
              ro_permeate_production_m3_per_hr = 8  (tool — different number)
# MISSING exact key: ro_makeup_flow_m3_per_hr
```

No `Irrigation Pump` principal word in 2100 modules (good). Fertigation Dosing Pump ×2 @ 15 kW (good).

---

## COMPLETED ✅ (commits on `oxccu-efuel`, not pushed)

| Commit | What |
|--------|------|
| `82ae8fefe` | Seed pump motor from Q×P as **calculator** — never fake `source:brief` 7.5 kW (exit 33 root) |
| `a1c4ee053` | Panel ONE-MINT rescale re-derives Design I; UV excluded from hydraulic duty check; parallel `pump_unit*_capacity*` refuse plant-total mint |
| `c9f632c83` | Cable tray demotion by src∪dest plan span |
| `c7b41809d` / `48d456fe6` | Nursery volume parse + protect calculator storage aggregate |
| `e3b494d7a` / `8fd7cbfe1` / `e149a9dec` | GA tags + plant-span fluid demotion |

### Key files touched this loop

- `scripts/lib/engineering-contract.ts` — water_treatment builder: duty-seed motors, no double-count irrigation consumer when unit capacities cover demand
- `scripts/lib/orchestrator/generic/universal-contract-sizing.ts` — `reconcilePumpMotorAgainstStatedPressure` requires `pump` token; phantom plant-total pump suppression; `fluidDemandAlreadyCovered`
- `scripts/lib/orchestrator/generic/bootstrap-tool-plan.ts` — `applyStepOutputs` refuses plant-total pump writes when unit capacities cover flow
- `scripts/blender-universal/draw_panel_schedule.py` — `_reconcile_panels_to_breakdown` re-derives Design I (I15 selftest)
- Selftests: `pump-motor-selftest.ts`, `instrument-sizing-selftest.ts`, `ion-exchange-brief-gate-selftest.ts` (duty-seed proveCatch)

### Run trail (honest)

| Run | Floor | Ships? | What happened |
|-----|------:|--------|---------------|
| 1715 | 2.5 | No | Stray fluid pipe |
| 1735 | 0 | No | Sense-check RADICAL storage |
| 1759 | 2.5 | No | MCC cable trunk |
| 1820 | 6.7 | No | Electrical Design I + Risk Irrigation Pump |
| 1854 | — | — | Died in brief-parse (orphaned) |
| 2008 | — | — | Exit 33 fertigation 7.7 kW (false brief pin) |
| **2100** | **honest 2 / verdict 9.4** | **No (honest)** | Exec UNVERIFIED `ro_makeup_flow` only |

---

## REMAINING TASKS 🔧

### Priority 1 — MUST FIX: Exec Summary UNVERIFIED `ro_makeup_flow_m3_per_hr`

**Problem:** Brief metric `ro_makeup_flow_m3_per_hr` = 11 m³/h is UNVERIFIED. Contract has `ro_high_pressure_pump_throughput_m3_h=11` and `ro_permeate_capacity_m3_h=11` but **not** the exact brief key. Cover compliance HIGH → Exec = 2 → honest floor = 2.

**Issues from scorecard:**
```
[HIGH] brief requirement 'ro_makeup_flow_m3_per_hr' is UNVERIFIED
[HIGH] brief metric 'ro_makeup_flow_m3_per_hr' (target 11m3/hr) is UNVERIFIED
```

**Universal fix (preferred):** extend demand-coverage **rule 4b-exact** (already exists for `peak_circulation_*` style aliases in `universal-contract-sizing.ts` ~1591) so a brief flow metric whose exact key is missing gets an alias from the ONE preferred system flow in the same family — here RO makeup/feed/permeate.  
**OR** emit `ro_makeup_flow_m3_per_hr` from the water_treatment builder as an alias of the brief-stated RO feed/makeup (11), with `source: brief` or calculator lineage from `ro_high_pressure_pump_throughput_m3_h` — but prefer the **generic** brief-key alias path so unseen archetypes get it too.

**Do NOT** hardcode Codema. Key off: brief metric key present + unit family flow + unique delivered RO/makeup/permeate candidate.

**proveCatch:** brief metric `ro_makeup_flow_m3_per_hr=11` + contract with `ro_high_pressure_pump_throughput_m3_h=11` → after mintDemandCoverage / builder, exact key exists and matcherWouldVerify passes. Counter-case: BESS / no RO → no-op.

**Files:**
- `scripts/lib/orchestrator/generic/universal-contract-sizing.ts` (`mintDemandCoverage` rule 4b-exact / PREFERRED_SYS_FLOW_RE — may need RO/makeup preferred keys)
- and/or `scripts/lib/engineering-contract.ts` (emit exact brief key as alias)
- selftest beside existing demand-coverage tests in `instrument-sizing-selftest.ts` or a small new selftest

**Verify:** after fix, either patch-test on 2100 state **or** cold chain; Exec Summary must leave 2.

---

### Priority 2 — Residual: plant-total `irrigation_pump_*` still written

**Problem:** Despite `a1c4ee053` protect, 2100 state still has:
- `irrigation_pump_flow_m3_h=225` from `tool:irrigation:pump-sizing`
- `irrigation_pump_motor_kw=30` from demand-coverage duty cross-check on that 225

No Irrigation Pump **word** (synthesis suppressed), and Risk is 10 — so this may be **quantity litter** only. Still wrong: tool should not write plant-total when `pump_unit_*_capacity` sum to demand.

**Investigate:**
1. Did `applyStepOutputs` protect fire? (check actions.jsonl / protected_keys for 2100)
2. Did a non-bootstrap path write the quantity?
3. Did demand-coverage mint motor after tool wrote flow?

**Fix at source** if still writing; add proveCatch that a contract with unit capacities covering demand ends with **no** `irrigation_pump_flow_m3_h` after bootstrap apply.

---

### Priority 3 — Ships / floor honesty

**Problem:** `verdict.ships=true` / `floor=9.4` while Exec=2. That is Goodhart. After Priority 1, re-check that `summary.min_score` and `verdict.floor` agree. If ships can be true over an UNVERIFIED cover row, that is a **scorecard bug** — fix the ships predicate (source: scorecard / excel export), with proveCatch.

---

### Priority 4 — Only if still failing after P1

- Electrical 9.4: board reconciliation REVIEW ratio 0.68 (saw on 1820; 2100 may still soft-warn). Only chase if it drops below 9.
- Quality-loop advisory BoM 8/10 — Tristan’s ship bar is **tabs ≥9**; don’t boil the ocean on advisory sections unless tabs fail.

---

## NON-GOALS / DO NOT

- Do **not** special-case `if (class === 'water_treatment')` or Codema product names
- Do **not** commit dirty unrelated files (`forge_blender_lib.py`, `out-universal/*`, harness stubs, `benchmark-expectation.ts`, etc.) unless you intentionally own that change
- Do **not** declare ship from `verdict.ships` alone — require **every tab ≥9** including Exec
- Do **not** relaunch cold chains in a pile; one fix → selftest → one cold chain
- Do **not** use Sheet/side panels or hardcoded slate colors if you touch UI (unlikely here)

---

## How to run the cold chain

```bash
cd /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
OUT="out/codema-full-$(date +%Y%m%d-%H%M)"
mkdir -p "$OUT"
export DESIGN_STAGE_CACHE_DIR="$PWD/$OUT/.design-stage-cache"
export BENCHMARK_NET_FORCE=1
export QUALITY_LOOP_PHASE=3
# Prefer Cursor/Claude background Shell with tee — nohup got reaped (1854)
npx tsx --no-cache scripts/serial-design-chain-v2.tsx \
  briefs-loop/fischer_farms_codema.md "$OUT" 2>&1 | tee "out-codema-$(basename $OUT).log"
```

**Success check (only this):**

```bash
python3 - <<'PY'
import json
d=json.load(open("OUT/tab-scorecard.json"))  # replace OUT
v,s=d["verdict"],d["summary"]
tabs=d["tabs"]
floor=min(t["score"] for t in tabs.values() if isinstance(t.get("score"),(int,float)))
print("verdict", v)
print("summary.min_score", s.get("min_score"), "fail", s.get("fail_tabs"))
print("honest_floor", floor)
print("ships_honest", floor>=9 and not s.get("fail_tabs"))
for n,t in sorted(tabs.items(), key=lambda kv: kv[1].get("score",99)):
  if t.get("score",99)<9: print("FAIL", n, t["score"], t.get("issues"))
PY
```

Expect: honest_floor ≥ 9, fail_tabs=[], ships_honest True. Open `dossier.xlsx` and glance Exec compliance rows.

---

## Useful selftests (run before cold chain)

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
.venv/bin/python scripts/blender-universal/draw_panel_schedule.py --selftest
npx tsx --no-cache scripts/lib/orchestrator/generic/pump-motor-selftest.ts
npx tsx --no-cache scripts/lib/orchestrator/generic/instrument-sizing-selftest.ts
npx tsx --no-cache scripts/lib/orchestrator/generic/ion-exchange-brief-gate-selftest.ts
npx tsx --no-cache scripts/lib/orchestrator/generic/nursery-reservoir-volume-selftest.ts
```

Quick contract smoke:

```bash
npx tsx --no-cache -e '
import { buildContract } from "./scripts/lib/engineering-contract.ts"
import { readFileSync } from "fs"
const c = buildContract("water_treatment", {
  original_text: readFileSync("briefs-loop/fischer_farms_codema.md","utf8"),
  product_description: "Codema",
})
const q = c.quantities
console.log("fertig kW", q.fertigation_dosing_pump_power_kw?.value, q.fertigation_dosing_pump_power_kw?.source)
console.log("has irrig motor", "irrigation_pump_motor_kw" in q)
console.log("connected", q.connected_electrical_load_kw?.value)
'
```

Expect: fertig **15** / **calculator**; no `irrigation_pump_motor_kw` from builder; connected ~80.

---

## Quick start for next agent (Fable / Claude Code)

1. **Read this file** + skim `CLAUDE.md` CORE FIX / GATE INTENT.
2. **Confirm 2100 scorecard** still shows Exec=2 on `ro_makeup_flow_m3_per_hr`.
3. **Priority 1 only:** universal exact-key alias / emit for brief `ro_makeup_flow_m3_per_hr` ← delivered RO feed/makeup 11 m³/h. Add proveCatch.
4. Run selftests above.
5. Commit **only** intentional files (message + `regression-harness:` line).
6. **One** cold chain (`QUALITY_LOOP_PHASE=3`, fresh outdir).
7. Read chain-written `tab-scorecard.json` — require **honest** every-tab ≥9.
8. If Exec clears but something else fails: fix that source rule + proveCatch; do not shotgun.
9. Optional Priority 2: stop `irrigation_pump_flow` tool write when unit capacities cover demand.
10. When honest ships: tell Tristan paths to `dossier.xlsx` + scorecard; push branch only if he asks.

---

## Why the previous agent burned hours (so you don’t repeat)

- Full cold chains (~45–90 min) were used as the **discovery** loop instead of state.json + selftests.
- 1854 died orphaned under `nohup` — use a supervised Shell/`tee` session.
- 2008 exit 33 was a **false brief pin** (7.5 default stamped `source:brief`) — fixed in `82ae8fefe`.
- Electrical/Risk roots fixed in `a1c4ee053` and **validated on 2100** (Electrical 9.4, Risk 10).
- Remaining gap is **narrow**: compliance exact-name for RO makeup. Should be a **small universal mint**, not another multi-hour wander.

**ETA if focused:** Priority 1 fix + selftest ~30–60 min; cold chain ~60–90 min; done when honest floor ≥9.

---

## Tristan preferences (relevant)

- Light theme only; universal fixes only
- Chain-native scorecard is the score — not post-hoc Excel
- Delight / ship quality: floor ≥9 every tab
- Company: Fractional Forge / ForgeOS (not CentaurOS in user-facing copy)

---

## Memory / carry-forward

Daily log: `~/.memory/daily/2026-07-09.md`  
Carry-forward last activity was updated for this loop. Update again when you finish or hand off.
