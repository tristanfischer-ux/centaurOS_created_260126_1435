# FE Front FPK — Engine catalogue wiring status

**Date:** 2026-08-01 (afternoon)  
**Twin (only):** `out/formula-e-front-mgu-20260729-1432/`  
**Branch:** `oxccu-efuel`  
**Owners:** terminal = EM / DEC-EM-1 · Cursor = non-colliding wiring (this doc + gate 44)  
**Catalogue source:** `docs/plans/FE-FRONT-FPK-TERMINAL-BAR-AB-ENGINE-CATALOGUE-2026-08-01.md`

---

## Verdict (one glance)

| Layer | Status |
|---|---|
| Bar A | **FAIL** — duty ~42 N·m FE capability vs 125.21; DEC-EM-1 hold on geometry |
| Bar B | Correctly open (dyno/HIL/fab/XYZ/VOF/FIA) |
| Stack solvers on twin | **Wired, currently FAILING gate 44** — ~5/22 FRESH after recent `state.json` bumps; EM case + probes fresh, most screens STALE |
| Honesty gates 41–43 | **Wired + ENFORCE by default** (CLI + gate-registry proveCatch) |
| Solver-coverage gate 44 | **Just wired** — was report/`exit 1`; now `--enforce` → exit 44 + punchlist |
| Industrial / MDO / KISSsoft / LTspice / cantools | **Not wired** (correctly early for most; HIL prep is the cheap parallel) |

---

## 1. Catalogue items vs wiring

### Used engines (in repo / twin)

| Engine | Wired? | Notes |
|---|---|---|
| xfemm / femmcli + Pyleecan | Yes | Live EM path; terminal owns `em_fia_front_kit_case` |
| swat_em | Yes | Winding belt fix landed |
| ISO 6336 / bevel screens | Yes | Planetary strength **INVALIDATED** until EM OD freeze |
| CoolProp / fluids / ht | Yes | Analytical thermal / oil |
| OpenFOAM docker cases | Scaffold | Not free-surface VOF proof |
| CalculiX rotor / magnet pocket | Yes | Screening FoS only |
| ROSS | Yes | Screen, not Campbell/NVH |
| Blender / Cycles | Yes | Cursor tranche done; terminal owns SIGHT |
| CadQuery / forge-truth CAD | Partial | Sphere-proxy authenticity residual |
| atopile / KiCad | Draft | NOT_FAB honest |
| Council LLMs | Process | Advisory / CritPt triad — not physics authority |

### P0 “unused but should” (catalogue §3–4)

| Item | Wired into engine? | What to do |
|---|---|---|
| Design-space / DEC-EM-1 (not FEMM↔JMAG swap) | Decision brief exists | Terminal: reconcile λ_pm before geometry change |
| JMAG **or** Motor-CAD+Maxwell | **No** | After / parallel to DEC diagnosis — pick one |
| pymoo / OpenMDAO around FE | **No** | After λ_pm story stable enough to optimise |
| KISSsoft / Romax LTCA | **No** | Only after EM OD freeze |
| LTspice DPT + FastHenry → PLECS | **No** | Cheap parallel for SiC honesty |
| OpenFOAM VOF / Particleworks | **No** | After gear freeze |
| cantools + Renode | **No** | Cheap Bar B prep now |

### Theatre (correctly not wired)

3D EM, NVH campaigns, SPH marketing splash, package-swapping 2D FEA expecting 2× torque.

---

## 2. Gates that close the “forgot the tools” failure

| Code | Name | Enforce default | Mechanism |
|---|---|---|---|
| 41 | claim-provenance | ON | Claim registry → fresh artefact + value match |
| 42 | excitation-tracking | ON | Async harmonics vs synchronised duty |
| 43 | magnet-flux-focusing | ON | A_m/A_g face starvation |
| **44** | **solver-coverage** | **ON** | Discover `--twin` solvers; STALE/MISSING → exit 44 + punchlist |

Kill / shadow (per gate): set `CLAIM_PROVENANCE_ENFORCING` / `EXCITATION_TRACKING_ENFORCING` / `MAGNET_FOCUSING_ENFORCING` / `SOLVER_COVERAGE_ENFORCING` to `off` or `shadow`.

```bash
# Gate 44 — report + enforce
.venv/bin/python scripts/lib/fpk_solver_coverage.py \
  --twin out/formula-e-front-mgu-20260729-1432 --enforce

# Prove the catch (meta)
npx tsx scripts/lib/gate-registry.ts --selftest
```

**Live twin note (this stamp):** ~5/22 FRESH (`em_fia_front_kit_case` + probes + pyleecan crosscheck). Gate 44 **BLOCKS** (exit 44) with a punchlist of 17 re-runs. During DEC-EM λ_pm work, terminal may set `SOLVER_COVERAGE_ENFORCING=off` temporarily — prefer re-running the punchlist (or `--run`) before shipping any claim that depends on those screens.

---

## 3. What Cursor did this session (non-colliding)

1. Audited catalogue vs twin / gates / motor-stack.
2. Promoted `fpk_solver_coverage.py` from soft report to **gate 44** (`--enforce` → exit 44, punchlist, env default ON, `--selftest` proveCatch).
3. Registered proveCatch in `scripts/lib/gate-registry.ts` + `ALL_GATE_CODES`.
4. Documented exits 41–44 in `CLAUDE.md`.
5. **Did not** edit `em_fia_front_kit_case.py` or DEC-EM geometry (terminal lane).

---

## 4. Suggested next (split ownership)

**Terminal (EM critical path)**  
1. DEC-EM-1 λ_pm reconciliation (transient BEMF / turns / paths) — hold geometry.  
2. Refresh Bar A tracker from twin (~42 N·m capability, not stale ~118).  
3. Clear gate 44: re-run punchlist (or `fpk_solver_coverage.py --twin … --run`) so coverage is all-FRESH before shipping non-EM claims.

**Cursor (parallel, if free)**  
1. Optional: cantools DBC scaffold + Renode stub (Bar B prep).  
2. Optional: architecture-blockers honesty — refuse empty `architectureBlockers` while `duty_torque_screen_ok` is false.  
3. Do **not** start JMAG/KISSsoft/VOF wiring until terminal freezes EM OD.

---

## 5. Bar snapshot (for tracker refresh)

| Signal | Approx | Source of truth |
|---|---|---|
| Duty required | 125.21 N·m @ 20 000 rpm | Brief / duty screen |
| FE capability (post DEC arithmetic honesty) | ~42 N·m | DEC-EM-1 brief |
| Excitation tracking | CLOSED (+p·θm) | Gate 42 domain |
| Magnet face | Starved (A_m/A_g≈0.56) — do not “fix” with whole-torque scale factor | Gate 43 + DEC brief |
| `ship_ok` | false | Standing |
| Homologation | NOT_HOMOLOGATED | Standing |
