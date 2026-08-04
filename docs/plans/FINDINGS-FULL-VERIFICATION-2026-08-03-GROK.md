# Full independent verification — FE Front FPK deliverable

**Verifier:** Grok Build  
**Date:** 2026-08-03  
**Handover:** `docs/plans/HANDOVER-FULL-VERIFICATION-2026-08-03.md`  
**Twin:** `out/formula-e-front-mgu-20260729-1432/`  
**Workbook:** `20260803-1357-V1.280-DRAFT-formula-e-front-mgu-engineering-workbook.xlsx`  
**Pack:** `20260803-1357-V1.280-formula-e-front-mgu-design-pack.zip`  
**Branch tip at start of run:** `b7430405d` on `oxccu-efuel` (handover cited `80cae3479` — tip has moved)  
**Workflow:** `fe-front-full-verification` launched in parallel; this report is **parent-command evidence**, not a workflow write-up.

**Hard stops held:** `ship_ok` remains **false**. No Bar B hold closed. Nothing invented as measured. No detector weakened.

---

## Executive verdict

**This pack is not clean.** An external engineer who trusts the Bar A “DEC-008/009 closed” narrative, or who opens only the design-pack zip, will be misled.

Highest-value class of defect: **frozen decisions and customer-facing claims that the live twin / workbook have not absorbed** (snapshot family, sixth subsystem).

A clean bill of health was **not** earned. Findings below are ordered by what an external reader would wrongly conclude.

---

## Findings (worst first)

### F1 — DEC-008 / DEC-009 frozen, but live twin still continuous @ 19,500 rpm  
**Classification:** STALE (decision vs twin) · **Severity:** CRITICAL for external reader  

| Claim | Where asserted | Live twin |
|---|---|---|
| 250 kW is **intermittent** 24% (DEC-008) | `10-decision-register.json` DEC-008 `FROZEN_UNDER_ASSUMPTION` | `continuous_power_kw=250` **`basis=continuous`** still present; `duty_regen_time_s=24` / `76` also present |
| Magnet **83.8 °C** under DEC-008 | Bar A close narrative / handover | `mgu_magnet_temp_c=159.35`; cooling network magnet **159.235 °C**; thermal screen **159.35 °C** |
| DEC-009 **24,000 rpm / 130 mm**, torque **1.069×** | DEC-009 frozen | `max_rotor_speed_rpm=19500`; EM `mean_torque_vs_required_ratio=0.651345`; mean \|T\| **81.558 N·m** vs required **125.215 N·m** |

**Commands:**
```bash
.venv/bin/python -c "..."  # quantities + em_fia_front_kit_case + 10-decision-register
.venv/bin/python scripts/lib/physics_plausibility.py --twin out/formula-e-front-mgu-20260729-1432
# → HIGH duty_basis_contradiction (continuous 250 kW vs 24% vignette)
# → HIGH shaft_power_vs_class (244.5 kW shaft vs 350 kW class)
```

**Reader would conclude:** “Bar A closed the duty and EM option; the machine is thermally fine at 24% and makes 1.069× torque at 24k.”  
**Reality:** Live physics artefacts are still the **continuous / 19.5k baseline** path. DEC freeze did not rewrite the twin.

---



### F1 status — FIXED 2026-08-03 (DEC-008 restamp)

Applied `scripts/lib/apply_dec_008_duty_restamp.py --twin out/formula-e-front-mgu-20260729-1432`:

| Field | Before | After |
|---|---|---|
| continuous_power_kw.basis | continuous | **intermittent_peak** |
| mgu_magnet_temp_c | 159.35 | **83.8** (vignette×mid) |
| mgu_winding_temp_c | 159.35 | **83.8** |
| thermal/network magnet screens | ~159 | **83.8** (continuous ref retained) |
| physics duty_basis_contradiction | HIGH | **cleared** |
| ship_ok | false | **false** |

Audit: `_motor_stack/dec_008_duty_restamp.json`. DEC-009 geometry **not** applied (separate restamp).  
`shaft_power_vs_class` HIGH remains (244.5 vs 350 class) — outside DEC-008 scope.

### F2 — Design-pack zip ships a **different workbook** than the standalone V1.280 xlsx  
**Classification:** STALE / WRONG (shipping set) · **Severity:** HIGH  

**Command:**
```text
pack xlsx size 50,286,308
disk xlsx size 50,936,300
match False
zip testzip: None (both archives well-formed)
```

**Reader would conclude:** The zip is the complete deliverable matching the DRAFT workbook beside it.  
**Reality:** Byte sizes differ by ~650 KB — pack is not the same file as `...V1.280-DRAFT-...workbook.xlsx`.

---

### F3 — Quality & Audit row scores “no open dyno/HIL/supplier gaps” PASS while the same tab lists them OPEN  
**Classification:** WRONG (honesty presentation) · **Severity:** HIGH  

**Command:** openpyxl `Quality & Audit` (data_only), exact rows:

| Row | Metric | Score UI | Detail |
|---|---|---|---|
| **12** | “Race homologation holds — **no open dyno/HIL/supplier gaps**” | **1 · PASS ✓** | “**clean — no OPEN blocks_homologation holds**” |
| 26 | Closure honesty | 10 PASS | OPEN race holds disclosed; ship_ok=false; hold list… |
| 27 | Release readiness | **4** ⛔ | NOT_HOMOLOGATED: **45** open release holds |
| **122** | DYNO_TORQUE_EFFICIENCY_MAP | **OPEN / BLOCKED** | Calibrated dyno… |
| **123** | HIL_POPULATED_INVERTER | **OPEN / BLOCKED** | (labelled DEC-008 — **ID collision**: DEC-008 is now A-DUTY freeze) |
| 124–127 | FLOW / HEATER / OVERSPEED / DOUBLE_PULSE | **OPEN / BLOCKED** | |

Also R14: “Deliverable renders — all clean + present” **PASS** while hero SIGHT shows floating geometry (F7).  
R76: “**20 of 169** deterministic invariants FAIL”.

**Reader would conclude from R12 alone:** No dyno/HIL/supplier gaps.  
**Reality two rows later:** those holds are OPEN/BLOCKED; release_readiness=4.

---

### F4 — Checks tab still shows magnet **159.35 °C vs 150 °C FAIL** (continuous path)  
**Classification:** STALE relative to DEC-008 narrative · **Severity:** HIGH (if pack claims DEC-008 thermal clear)  

**Command:** openpyxl key scan  
```text
⚠ Checks: Brief target met: magnet_temp_limit_c
design (mgu_magnet_temp_c) = 159.35 C — ceiling 150
```

Agrees with live quantities. Contradicts “83.8 °C under DEC-008” narrative unless that narrative is clearly labelled “decision only, twin not restamped.”

---

### F5 — Torque denominator trap still live in workbook Verification spine  
**Classification:** UNSUPPORTED / misleading if 119.7 used as duty requirement · **Severity:** MEDIUM–HIGH  

**Re-derive (command arithmetic):**
```text
P_elec = 250 kW, n = 19500 rpm, ω = 2042.035 rad/s
T = P/(η·ω) with η=0.9777 → 125.219 N·m  (matches claimed duty requirement)
T with contract mgu_efficiency=0.96749 → 126.541 N·m
EM required_shaft_torque_nm = 125.214912
EM torque_magnitude_mean_nm = 81.558081 → ratio 0.651×
mgu_shaft_torque_nm = 119.7 basis=continuous (at 244.49 kW shaft)  ← not the duty requirement
```

Workbook Verification tab pairs **119.7** with contract calc identity (PASS) and flags **mgu_shaft_torque_max_nm 334** HARD open (64% rel err).  
**Reader risk:** Treating 119.7 as “required torque” flatters duty ratio toward 0.68×.

---

### F6 — physics_plausibility still correctly fires HIGH on the twin  
**Classification:** not a false alarm — **detector success** · **Severity:** n/a (evidence)  

```text
.venv/bin/python scripts/lib/physics_plausibility.py --twin <dir>
[HIGH] shaft_power_vs_class: 244.5 kW vs 350 kW class (70%)
[HIGH] duty_basis_contradiction: continuous 250 kW vs 24 s/100 s vignette
ok=False
```

If customer docs claim these are “resolved by DEC-008,” that is a doc defect; the **guard is right**.

---

### F7 — Hero render visual defects (SIGHT)  
**Classification:** COSMETIC / morphology · **Severity:** MEDIUM for external eyes  

**Command:** `read_file` on `00-hero.png`  
Observed: concentric cassette with copper loops and MCU shelf **readable**, but:
- floating thin grey bar top-left (unattached geometry)
- floor rails / fastener nubs look like leftover construction geometry

Coverage ledger claims 100% blender/GA/SLD present counts — **structural coverage ≠ visual cleanliness**.

---

### F8 — PCB: NOT_FAB and DRC JSON are real; “fitness 7.6/10” is not a live score  
**Classification:** UNSUPPORTED (handover claim vs twin) · **Severity:** LOW  

**Live:**
```text
state.pcb.designFitness = {ok: true, findings: []}
NOT_FABRICATION_READY = true
pipeline.drc = {ran: true, violations: 0}
2 boards: traction_gate_drive, traction_control
drc-report.json (KiCad DRC v1) violations=[] dated 2026-07-30
ignored_checks include: missing_courtyard, track_not_centered_on_via,
  footprint_filters_mismatch, footprint_type_mismatch, tuning_profile_*
```

Note: the string `7.6` in `state.json` is a **dropped gear-ratio** claim (7.6:1), not a PCB fitness score. Handover “fitness 7.6/10” was not re-derived from project files.

**NOT_FAB survives** — good.  
**0 DRC:** real KiCad reports; several check classes ignored. Deliberate scratch fail not run this session.
**Engine guards:** `bash scripts/verify-engine-guards.sh` → **✓ Engine guards passed** (including gate-registry selftest).

---

### F9 — Escalation stubs still present for front MGU while drawing gates JSON is green  
**Classification:** STALE (snapshot family #6) · **Severity:** LOW–MEDIUM process  

```text
drawing-gates.json: all_pass True, n_gates 23, n_failing 0
tasks/harness-stubs/ESCALATE__formula_e_front_mgu__* still present
55 ESCALATE stubs total under tasks/harness-stubs/
```

Matches handover known-open item: stubs do not auto-retract.

---

### F10 — Connectivity scorecard still lists inverter housing/cover missing electrical I/O  
**Classification:** UNSUPPORTED / noisy · **Severity:** LOW  

`quality-scorecard.json` connectivity defects name INV-4/INV-5 housing/cover as electrical missing_input/output — likely head-noun / topology false friends. SLD claim of 6/6 coverage not re-proven by re-render this session.

---

## Physics table (§3.5) — claimed vs re-derived

| Claim | Claimed | Re-derived | Gap | OK? |
|---|---|---|---|---|
| Duty torque required | 125.2193 N·m | 125.219 with η=0.9777; EM req 125.215 | ~0 | **Yes** (formula) |
| Delivered baseline mean \|T\| | 81.558 N·m | EM `torque_magnitude_mean_nm=81.558081` | 0 | **Yes** |
| Ratio baseline | 0.651× | 81.558/125.215 = 0.6513 | 0 | **Yes** |
| DEC-009 1.069× @ 24k/130 | 1.069× | **Not in live EM twin** — still 0.651× @ 19.5k | **missing restamp** | **No** |
| Iron loss | 6035 W screening | 6035.1 W `basis=screening_estimate`, uncertainty_pct=40, two-sided caveat present | 0 | **Yes** (label honest in quantity) |
| Magnet @ DEC-008 intermittent | 83.8 °C | **Live 159.35 °C continuous path** | **~75 K** | **No** (twin not on DEC-008 path) |
| Two thermal screens agree 0.1 K | 0.1 K | \|159.35 − 159.235\| = **0.115 K** | ~0 | **Yes** (both continuous) |
| Falsifiability | 0/169 | `check_falsifiability_audit --twin` → 0 cannot fail | 0 | **Yes** |
| ship_ok | false | state + multiphysics + Bar B all false | 0 | **Yes** |

---

## Area coverage summary

| Area | Result | Key commands |
|---|---|---|
| **3.1 Excel** | Opens clean (31 sheets); pack xlsx **≠** DRAFT xlsx; honesty tension F3; Verification uses 119.7 identity | openpyxl load; zipfile testzip; size compare |
| **3.2 Renders** | Ledger coverage 23/23 blender; hero SIGHT issues F7 | parts-ledger.json; read 00-hero.png |
| **3.3 Drawings** | On-disk gates **23/23 pass**; full re-run wall-clock not finished in parent before report (workflow may complete) | drawing-gates.json |
| **3.4 PCB** | 2 boards; DRC JSON 0 viol; NOT_FAB true; fitness 7.6 unsupported | drc-report.json; state.pcb |
| **3.5 Physics** | Formula OK; **DEC freeze not in twin** | quantities; EM case; cooling screens; physics_plausibility |
| **3.6 Guards** | falsifiability OK; Bar B freshness OK; physics_plausibility **correctly fails**; typecheck OK; full `verify-engine-guards.sh` started (see session) | as named |

---

## Adversarial detectors

| Detector | Fresh twin | Adversarial |
|---|---|---|
| `check_falsifiability_audit` | 0/169 unfalsifiable | prior Bar A selftest proveCatch retained (not re-broken this session) |
| `check_bar_b_register_freshness` | ok=true | prior session: historical 194/3.442/71 still fires |
| `physics_plausibility` | **2 HIGH** on live twin | selftest should still catch FE-shaped faults — run `--selftest` in parent CI |

**Conclusion:** Detectors that should fire on the **current** twin **do fire** (physics). Bar B freshness is green because the register matches the **stale continuous twin**, not because DEC-008 was absorbed.

---

## What was not checked (and why)

1. **Deliberate DRC injection on scratch board** — DRC JSON is real; would-catch-X not proven.  
2. **Deliberate DRC injection on scratch board** — time; DRC JSON format is real KiCad v1 with empty violations, but “would catch X” not proven this session.  
3. **Full cross-tab mechanical equality of every repeated quantity** — sampled high-value keys only.  
4. **Re-run FEMM / CalculiX / full cooling producers** — used live artefacts + decision register; did not wall-clock re-solve EM.  
5. **Every render PNG SIGHT** — hero only opened with eyes; exploded/catalogue not fully sighted.  
6. **Suppliers OPEN BY DESIGN MPN fabrication scan** — not exhaustively walked.  
7. **gate-registry “9 of 29 block” audit** — not re-enumerated.  
8. **Workflow `fe-front-full-verification` child synthesis** — may still be running; this report does not depend on it.

Silent partial coverage is declared here deliberately.

---

## Scorecard note

```text
floor 4, mean 9.1, allPass false
release_readiness score 4 — deliberate NOT_HOMOLOGATED / NOT_FAB / concept render
```

**Do not raise release_readiness without Bar B evidence.** That floor is one of the few honest signals in the pack.

---

## Recommended next actions (for humans / next agent — not done here)

1. **Restamp twin after DEC-008/009** or clearly label every customer surface “decisions frozen; physics twin still baseline continuous @ 19.5k until restamp.”  
2. **Rebuild design-pack zip** from the same bytes as the DRAFT workbook.  
3. **Fix Quality & Audit** “no OPEN blocks_homologation” language when holds exist.  
4. **Retract or freshness-gate** `ESCALATE__formula_e_front_mgu__*` stubs.  
5. Leave `ship_ok=false`.

---

## ship_ok / holds

| Check | Result |
|---|---|
| state.ship_ok | false |
| motor-multiphysics.ship_ok | false |
| Bar B register ship_ok | false |
| Bar B holds OPEN | 10/10 |
| torque_reliable | false |

---

*End of parent verification report. Found defects are successes of this job.*
