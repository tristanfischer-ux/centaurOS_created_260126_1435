# Full verification RE-RUN — FE Front FPK (post DEC-008 restamp)

**Verifier:** Grok Build  
**When:** 2026-08-03T17:31:04Z  
**HEAD:** `b7430405d` · branch `oxccu-efuel`  
**Twin:** `out/formula-e-front-mgu-20260729-1432/`  
**Workbook:** `20260803-1357-V1.280-DRAFT-...xlsx`  
**Pack:** `20260803-1357-V1.280-...design-pack.zip`  
**Log:** `docs/plans/_verify_rerun_20260803-183104.log`  
**Workflow:** `fe-front-full-verification-2` launched in parallel (results may arrive later; this report is parent-command evidence)

**Hard stops held:** `ship_ok` false everywhere scanned · Bar B 10/10 OPEN · nothing invented · no detector weakened.

---

## Executive verdict

**Still not clean for an external engineer — but F1 is fixed on the twin.**

| vs first full verify | Status |
|---|---|
| F1 DEC-008 twin restamp (magnet 159→83.8, duty basis) | **FIXED on twin** |
| F2 pack xlsx ≠ DRAFT xlsx | **Still open** |
| F3 Quality R12 “no dyno/HIL gaps” PASS | **Still open** |
| F4 Checks tab magnet 159.35 FAIL | **Still open (workbook stale)** |
| F5 torque 119.7 vs 125.22 | **Still open** |
| Drawing gates live 23/23 | **PASS (re-run)** |
| state.drawingGates stale fails | **Still open** |
| render-ga-coherence ok∧broken | **Still open** |
| PCB NOT_FAB + DRC 0 | **OK**; FAB-READY banner remains |
| ship_ok | **false** |

**Bottom line:** Twin physics now matches DEC-008. **Customer-facing Excel V1.280 was not rebuilt** after the restamp, so Jack’s workbook still shows the continuous-path magnet FAIL and never mentions 83.8 °C.

---

## Physics table (re-derived this run)

| Claim | Claimed / expected | Re-derived now | OK? |
|---|---|---|---|
| T_req | 125.2193 N·m | **125.2193** (η=0.9777, 19.5k rpm) | **Yes** |
| EM mean \|T\| | 81.558 | **81.558081** | **Yes** |
| Ratio | 0.651× | **0.651345** | **Yes** |
| Magnet @ DEC-008 | 83.8 °C | **83.8** `basis=screen_dec_008_intermittent` | **Yes** |
| continuous_power basis | intermittent | **`intermittent_peak`** | **Yes** |
| Thermal screens agree | ~0 | **Δ=0.0000** both 83.8; cont_ref 159.35 kept | **Yes** |
| Iron loss | 6035 screening | **6035.1** `screening_estimate` | **Yes** |
| DEC-009 24k/130 / 1.069× | frozen in register | **`max_rotor_speed` still 19500; ratio still 0.651** | **No — not applied** |
| duty_basis_contradiction | should be clear | **cleared** (only shaft_power_vs_class HIGH remains) | **Yes** |
| ship_ok | false | **false** (0 true keys in state) | **Yes** |

**Commands:**
```bash
.venv/bin/python scripts/lib/physics_plausibility.py --twin <twin>
# → HIGH shaft_power_vs_class only; duty_basis_contradiction ABSENT
.venv/bin/python  # quantities + EM + cooling JSON arithmetic
```

---

## Findings (this re-run), worst first

### R1 — Excel / Checks still show magnet **159.35 vs 150 FAIL** after twin is 83.8  
**Class:** STALE (workbook vs twin) · **Severity:** CRITICAL for Jack  

```text
⚠ Checks R63: Brief target met: magnet_temp_limit_c | 159.35 | 150 | FAIL
Verification hits: 83.8≈0  159.35≈0 (numeric) but Checks string still 159.35
```

Twin: `mgu_magnet_temp_c=83.8`. Workbook was built **before** DEC-008 restamp and never regenerated.

**Reader concludes:** Magnets breach.  
**Reality on twin:** Magnets clear under DEC-008 with 66 K margin.

---

### R2 — Design-pack zip still not the DRAFT workbook  
**Class:** STALE / WRONG · **Severity:** HIGH  

```text
pack xlsx 50,286,308 bytes
disk DRAFT 50,936,300 bytes
match False
both zip testzip OK; pack zero_files=0
```

---

### R3 — Quality & Audit R12 still PASSes “no open dyno/HIL/supplier gaps”  
**Class:** WRONG · **Severity:** HIGH  

```text
QA_R12: "Race homologation holds — no open dyno/HIL/supplier gaps" | PASS ✓ | "clean — no OPEN blocks_homologation holds"
QA_R122: DYNO … OPEN BLOCKED
QA_R123: HIL … OPEN BLOCKED (still labelled DEC-008 — ID collision with A-DUTY freeze)
QA_R27: release_readiness 4 · 45 open holds
```

---

### R4 — `render-ga-coherence.json`: `ok=true` AND `broken=true`  
**Class:** WRONG · **Severity:** HIGH  

```text
coherence ok True broken True
defects: large external sphere absent from GA; copper tube cluster unmatched
```

---

### R5 — `state.drawingGates` stale vs live gates  
**Class:** STALE · **Severity:** HIGH  

```text
live re-run: 23 gates · 0 failing · ALL-PASS=True
state.drawingGates: all_pass=False n_failing=2 (manifest_svg_projection, material_diversity)
drawing-gates.json on disk: all_pass True
```

---

### R6 — Torque denominator trap still in Verification  
**Class:** misleading · **Severity:** MED–HIGH  

```text
Verification numeric hits 119.7≈3  125.22≈0
```

Duty requirement re-derives to **125.2193**; workbook spine still emphasises **119.7**.

---

### R7 — PCB sheet banner “FAB-READY — UNPROVEN IN HARDWARE”  
**Class:** honesty risk · **Severity:** MED  

Live: `NOT_FABRICATION_READY=true`, DRC 0 on both boards (KiCad reports 2026-07-30), fitness `{ok:true, findings:[]}`.  
Banner leads with FAB-READY; NOT_FAB is the controlling flag — easy to misread.

---

### R8 — Dual hero PNGs (different age/size)  
**Class:** two-store risk · **Severity:** LOW–MED  

```text
00-hero.png          14.3 MB  2026-08-03 10:32
renders/00-hero.png   3.6 MB  2026-07-29
```

---

### R9 — physics shaft_power_vs_class still HIGH  
**Class:** real design flag · **Severity:** MED (known)  

244.5 kW shaft vs 350 kW class label (70%). Not a restamp bug; not cleared by DEC-008.

---

### R10 — DEC-009 frozen but not applied to twin  
**Class:** STALE decision vs twin · **Severity:** HIGH for architecture narrative  

Register: 24,000 rpm / 130 mm, 1.069×.  
Twin: 19,500 rpm, 0.651×. Same shape as pre-fix F1.

---

### R11 — ESCALATE stubs (3 front-MGU) still present while gates green  
**Class:** STALE snapshot · **Severity:** LOW  

---

## Guards (this run)

| Check | Result |
|---|---|
| falsifiability --twin | **0/169** unfalsifiable |
| bar_b freshness --twin | **ok=true** |
| physics_plausibility --twin | **1 HIGH** (shaft class only) |
| physics + dec008 selftests | **OK** |
| typecheck baseline | **PASS** (143) |
| verify-engine-guards.sh | **✓ PASS** |

---

## Area scorecard

| Area | Result |
|---|---|
| 3.1 Excel | Opens 31 tabs; **stale vs DEC-008 twin**; pack mismatch; R12 greenwash |
| 3.2 Renders | Coverage 100% blender/GA/SLD; dual hero files; coherence broken |
| 3.3 Drawings | **Live 23/23 PASS**; state snapshot stale |
| 3.4 PCB | NOT_FAB true; DRC 0; FAB-READY wording |
| 3.5 Physics | **DEC-008 consistent**; DEC-009 not applied; torque formula OK |
| 3.6 Guards | All green except intentional physics shaft-class HIGH |

---

## What was not checked

- Full visual SIGHT of every render PNG this run (hero path only noted via dual files)  
- Deliberate DRC scratch injection  
- Full Suppliers MPN walk  
- Excel rebuild / pack rebuild  
- DEC-009 restamp  
- Workflow-2 child synthesis (may still be running)

---

## Recommended next actions (priority)

1. **Rebuild Excel + design-pack** from the restamped twin (clears R1, R2, part of R6).  
2. **Fix Quality R12** so it cannot PASS while DYNO/HIL rows are OPEN.  
3. **Fix coherence `ok`/`broken` dual-true** (or stop writing ok=true when broken).  
4. **Sync state.drawingGates** from live `drawing-gates.json` after each gate run.  
5. **DEC-009 restamp** if architecture narrative claims 1.069× / 24k rpm.  
6. Leave `ship_ok=false`.

---

*Re-run complete. F1 twin fix holds. Pack still not shippable to an external engineer without workbook/pack rebuild and honesty fixes.*

---

## Progress after re-run (same day, Grok continue)

| Item | Status after continue |
|---|---|
| R1 workbook magnet stale | **FIXED** — V1.282+ Checks magnet actual **99.4 °C** (DEC-008+009) |
| R2 pack ≠ workbook | **FIXED** — pack SHA gate OK on V1.283+ |
| R5 drawingGates state | **FIXED** earlier (state sync) |
| R10 DEC-009 not on twin | **FIXED** — `apply_dec_009_em_restamp` + HANDLERS; rpm 24000, stack 130 mm, torque_ratio 1.069, magnet 99.4 |
| Decision Register missing DEC-008/009 | **FIXED** — `sync_decision_register` in apply_frozen; V1.283 DR rows 12–13 |
| R3 Quality R12 greenwash | **FIXED** — V1.284 Q&A axis **FAIL** `OPEN (6): DYNO…, HIL…, …` |
| Coherence enforce | **PASS** findings=0 on V1.284 |
| R4 render-ga ok∧broken | still open (artefact absent on twin this check) |
| R6 torque denominator | still open (narrative) |
| R9 shaft_power_vs_class HIGH | intentional residual |
| ship_ok | **false** (held) |

**Customer send (current):**  
`20260803-1922-V1.284-DRAFT-formula-e-front-mgu-engineering-workbook.xlsx`  
`20260803-1922-V1.284-formula-e-front-mgu-design-pack.zip`

**Universal plumbing added this session:**  
`apply_dec_009_em_restamp.py`, register file→state sync, coherence check 5 (register parity), R3 hardwareCorrelation in ship axis.

---

## Workflow `fe-front-full-verification-2` — complete

- **Run:** `wf_019fc8ad20b37d819e1d6d5d23150a51` · ~46 min · 7 agents · budget 7/48  
- **overall_ok:** `false` (correct for **V1.280**-era twin)  
- **Held:** ship_ok false · Bar B OPEN · detectors fire · no holds closed  
- **Area ok:** GUARDS/PHYSICS/DRAWINGS true · EXCEL/PCB/RENDERS false  
- **Full write-up:** [`FINDINGS-FULL-VERIFICATION-2-2026-08-03-GROK.md`](./FINDINGS-FULL-VERIFICATION-2-2026-08-03-GROK.md)  
- **Raw JSON:** `docs/plans/VERIFY2-*-2026-08-03.json`  

Highest synthesis findings still relevant after V1.284: hero open-assembly (S1), torque denominator trap (S12/G), PCB FAB-READY banner vs NOT_FAB (S5), dual pcb-stage (S9), continuous_reference thermal Δ0.115 K (E), ESCALATE stubs vs green gates (S11). Excel magnet/Exec greenwash items (S2–S3) were V1.280-stale and should be re-checked on V1.284 before treating as open.
