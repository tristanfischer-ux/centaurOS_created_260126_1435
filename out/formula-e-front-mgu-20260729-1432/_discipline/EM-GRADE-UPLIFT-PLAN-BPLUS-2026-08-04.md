# EM grade uplift plan — every layer ≥ B+ / A−

**Twin:** `formula-e-front-mgu-20260729-1432`  
**Stamped:** 2026-08-04  
**Objective:** Raise the staff-engineer grade card so **no EM layer sits below B+**, with A− preferred where evidence allows.  
**Non-negotiable:** British honesty. Dual bars stay dual. `ship_ok` stays false until partner gates actually close — we do **not** mint green by redefining PASS.

---

## 0. What “B+ / A−” means here

| Layer | B+ (minimum) | A− (stretch) | Cannot claim without |
|---|---|---|---|
| **Toolchain & method** | Already there | Mesh sensitivity + published torque-integral proveCatch | — |
| **Kit-case Path B story** | One OP fully documented: excitation, turns, angle, position mean, ripple, dual-bar | Position-dense mean matches dense-map at same OP within tolerance | Dyno for “reliable” |
| **Map / MTPA depth** | Closed **screen map**: same metric everywhere; peak vs mean explained; MTPA locus + ripple band | True MTPA schedule (current angle vs torque/speed) from FE flux linkage | Dyno map for release |
| **Voltage / FW** | FE flux-linkage voltage circle at kit OP + simple FW envelope | Speed–torque FE envelope with V and I limits | Measured λ, Rs, L |
| **Partner-ready field viz** | Tony 2D + 3D landscape + OC vs loaded (largely **done** 2026-08-04) | Animated rotor sweep + Jack-pack pages + `.fem` handoff | Partner eyeballs |
| **Release / homologation** | **Readiness B+**: every *internal* gate green or OPEN-with-owner; single BARB list; no silent holds | Homologation path documented | Jack/dyno/ICD — **not internal** |

### Hard truth on the F row

**Release / homologation cannot reach true A− ship_ok without partners.**  
What *can* reach B+ is **release readiness**:

- No unexplained tension between artefacts  
- Every OPEN item has an owner + BARB id  
- Internal EM evidence is coherent enough that dyno is a *calibration*, not a *rescue*

If the objective is “all six cells ≥ B+”, the sixth cell is scored as **readiness**, not as “we shipped.”

---

## 1. Current grade card (baseline) and target

| Layer | Now | Target | Δ |
|---|---|---|---|
| Toolchain & method | B+ / A− | **A−** | Mesh + method proveCatch |
| Kit-case Path B story | B | **A−** | OP identity + ripple + dual-bar pack page |
| Map / MTPA depth | C+ / B− | **B+** (A− if time) | One metric, closed screen map, resolve 122 vs 107 vs 56 |
| Voltage / FW | C | **B+** | FE λ-based voltage circle, not scalar only |
| Partner-ready field viz | D → ~**B+** after fieldplot pack | **A−** | Jack pages + animation + denser grid |
| Release / homologation | F by policy | **B+ readiness** | Coherent OPEN register; still `ship_ok=false` |

---

## 2. Success criterion (done when)

**Done** = a single twin stamp `em_grade_card.json` where every layer is ≥ B+, plus:

1. **One OP identity card** — Path B kit-case mean \|T\|, architecture bar, binding bar, angle, I, turns, stack, magnets — no rival “peak” numbers without labels.  
2. **One map metric** — dense MTPA and hybrid map report the **same** definition of mean/peak as kit-case (or explicitly different with conversion).  
3. **FE voltage screen** — Vll from flux linkage at OC + loaded; bus util at 600/750/900 V; FW note OPEN or screened.  
4. **Field pack in partner path** — fieldplot PNGs + interactive HTML + optional `.fem` listed in Jack pack index (still not “sent” until you say so).  
5. **Readiness register** — BARB list only; no internal EM contradiction marked green.  
6. **`ship_ok` still false** until S-EM-TRUTH replaced by dyno.

---

## 3. Workstreams (ordered)

### Phase A — Stop the internal contradictions (kit-case + map → B+/A−)

**Why first:** Partners lean in on *one story*. 122 vs 107 vs 56 kills trust faster than missing FW.

| ID | Work | Produces | Effort |
|---|---|---|---|
| A1 | **OP identity document** in twin: Path B kit-case is the headline torque story; dense peak and dense mean are *secondary* with definitions | `em_op_identity_card.json` + one-pager PNG | S |
| A2 | **Metric unification** — define `mean_|T|_over_rotor_positions_at_fixed_I_angle` vs `peak_|T|_on_grid` vs `best_angle_mean_|T|`; rewrite dense MTPA summary to use kit-case-compatible means where comparable | Updated dense/hybrid summaries + honesty notes | M |
| A3 | **Re-run dense MTPA at kit-case angle (−30°)** with same position sampling philosophy as kit-case dense sweep (or document why different) | Dense slice at −30° comparable to 122 N·m | M |
| A4 | **Ripple band** on kit-case: min/max/mean, pk–pk %, sign-stable — already partly there; promote to first-class card | `em_torque_ripple_card.png` | S |
| A5 | **Dual-bar pack page** (already exists) — ensure fieldplot + map pages *link* to it, never replace it | Cross-links in narrative | S |

**Exit A:** Kit-case story A−; Map depth ≥ B+ (closed *screen* map, tensions explained numerically).

---

### Phase B — Voltage / FW → B+

| ID | Work | Produces | Effort |
|---|---|---|---|
| B1 | Use existing **OC flux linkage** + loaded circuit λ from FEMM (`mo_getcircuitproperties`) for λ_pm and λ at load | FE-backed λ numbers | M |
| B2 | **Voltage circle screen** at 24k: V from ωλ, compare to available Vll at 600/750/900 V; PF/I explicit | `path_b_voltage_fe_circle_screen.json` + PNG | M |
| B3 | **Simple FW envelope** — analytical or FE-lite: max torque vs speed under V and I limits (even coarse is B+ vs pure scalar) | `em_fw_envelope_screen.json` + PNG | M |
| B4 | Mark scalar voltage page as *predecessor*; FE circle is authoritative for Path B OP | Honesty stamps | S |

**Exit B:** Voltage/FW ≥ B+ — “FE voltage proof at kit OP” not “scalar util only.”  
Still not dyno-closed.

---

### Phase C — Field viz → A− (from today’s B+)

**Already landed (2026-08-04):** `em_fia_fieldplot_pack.py` — OC/loaded Tony maps, 3D landscapes, Plotly HTML, pole zoom, air-gap ring, OC vs loaded compare. Peaks OC 2.25 T / loaded 2.69 T.

| ID | Work | Produces | Effort |
|---|---|---|---|
| C1 | **Denser grid** optional 96² for partner-facing finals | Higher-res PNGs | S–M (runtime) |
| C2 | **Rotor-position animation** — 8–12 frames of loaded |B| or 3D landscape → GIF/MP4 | `fieldplot_rotor_sweep.gif` | M |
| C3 | **Export `.fem`** for partner FEMM GUI open | `path_b_oc.fem`, `path_b_loaded.fem` | S |
| C4 | **Jack pack pages** 30–34: field cover, OC vs loaded, 3D landscape, how-to-read, honesty | Pack PNGs (not sent until approved) | M |
| C5 | Fix **air-gap ring** sampling if still spiky; optional quiver polish | Cleaner 3D ring | S |

**Exit C:** Field viz A− — partner can *see* magnets ↔ copper without reading JSON.

---

### Phase D — Toolchain A−

| ID | Work | Produces | Effort |
|---|---|---|---|
| D1 | **Mesh / probe sensitivity** — one coarser + one denser field grid; torque at kit OP within band | `em_mesh_sensitivity.json` | M |
| D2 | Document torque integral (22) + air-gap selection proveCatch in one page | Already in code comments → partner one-pager | S |
| D3 | Optional: second solver cross-check (Pyleecan MagFEMM) at *one* OP only | `em_crosscheck_one_op.json` | M |

**Exit D:** Toolchain solidly A−.

---

### Phase E — Release readiness B+ (not false ship_ok)

| ID | Work | Produces | Effort |
|---|---|---|---|
| E1 | **EM readiness scorecard** — layer grades + evidence paths + OPEN owners | `em_grade_card.json` + PNG | S |
| E2 | **Single BARB list** for EM only (dyno, lap, λ measure, demag bench) | Slice of partner asks | S |
| E3 | **Narrative section** “What B+ means / what still needs Jack” | Update `FE-FRONT-HYPOTHESIS-NARRATIVE.md` | S |
| E4 | **Do not** flip `ship_ok` or homologation >1/10 without S-EM-TRUTH replacement | Policy gate | — |

**Exit E:** Release row = **B+ readiness**, still F-for-ship until partners.

---

## 4. Recommended sequence (critical path)

```text
Week-shaped order (effort, not calendar):

  A1 OP identity          ─┐
  A2 Metric unify         ─┼─► A3 dense@−30° ─► A4 ripple card ─► Kit A−, Map B+
  A5 dual-bar links       ─┘

  B1 FE λ                 ─► B2 voltage circle ─► B3 FW envelope ─► Voltage B+

  C2 animation + C3 .fem + C4 Jack pages ─► Field viz A−
       (C1 denser optional parallel)

  D1 mesh sensitivity ─► Toolchain A−

  E1–E3 scorecard + narrative ─► Readiness B+
```

**Do not** start Jack-pack send or `ship_ok` work until A+B exit.

**Parallel-safe:** C (field polish) can run beside A/B once pack exists (it does).

---

## 5. What moves each grade (one-liners)

| Layer | One move that unlocks B+/A− |
|---|---|
| Toolchain | Mesh sensitivity stamp + method one-pager |
| Kit-case | OP identity + ripple as first-class; no rival headlines |
| Map/MTPA | Same mean definition as kit-case; −30° dense slice; tensions closed in prose *and* numbers |
| Voltage/FW | FE λ voltage circle at 24k vs bus |
| Field viz | Jack pages + rotor GIF + `.fem` (core maps **done**) |
| Release | Readiness scorecard; partners still own ship |

---

## 6. Explicitly out of scope for this plan

- Inventing dyno CSV or Gerbers  
- Collapsing architecture and binding bars  
- Claiming 3D end-winding FE (field pack is 2D FE + 3D *presentation*)  
- Nest-in-bore gear strength (separate architecture hold)  
- Sending Jack pack without your go-ahead  

---

## 7. First concrete sprint (if you say “go”)

**Sprint 1 (minimum path to all ≥ B+ readiness):**

1. A1 + A2 + A3 — kill the 122/107/56 confusion  
2. B1 + B2 — FE voltage circle  
3. C3 + C4 — `.fem` + Jack field pages (no send)  
4. E1 — `em_grade_card.json` re-score  

**Sprint 2 (A− polish):**

5. A4 ripple, B3 FW envelope, C2 animation, D1 mesh sensitivity, E2–E3 narrative  

---

## 8. Re-score after Sprint 1 (predicted)

| Layer | Predicted |
|---|---|
| Toolchain | B+ / A− (unchanged until D1) |
| Kit-case | **A−** |
| Map/MTPA | **B+** |
| Voltage/FW | **B+** |
| Field viz | **A−** (with C3/C4) |
| Release readiness | **B+** (`ship_ok` still false) |

---

## 9. Owner note

Internal engineering can deliver Sprint 1 without Jack.  
**Only** S-EM-TRUTH (dyno) moves Release from “readiness B+” to anything that could justify `torque_reliable=true` or homologation above ~1/10.
