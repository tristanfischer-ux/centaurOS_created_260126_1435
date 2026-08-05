# FE Front — adversarial serial attack v9

_Generated 2026-08-05T15:44:35.060029+00:00 · Excel → BoM → PCB → Blender/GA_

## Verdict: **REJECT**

Counts: `{'FATAL': 7, 'HIGH': 11, 'MED': 7, 'LOW': 1, 'PASS': 2}` · **ship_ok remains false**

This is not a score-polish pass. Surfaces were attacked for **errors a human engineer would reject**.

---

## 1. Excel spreadsheet

### [FATAL] XLS-001 — Broken IFERROR formula corrupts FIA power-split feasible chain
- **Where:** Calculations!B295 = '=IFERROR(B294),"—")' → #VALUE!; C71=B295; H71 row-check #VALUE!
- **Why it matters:** IFERROR arity wrong (closing paren before comma). Live sheet shows formula errors on a USED duty chain row.
- **Evidence:** data_only #VALUE! at B295,C71,H71; F71 prose still claims feasible=1
- **Fix:** Replace B295 with honest boolean/1 matching fia_power_split_feasible (or correct IFERROR(expr,"—")); rebuild check col

### [HIGH] XLS-002 — FPK power/thermal LIVE trace disagrees with stamped twin values
- **Where:** Calculations ~B445–B452 vs column E twin stamps
- **Why it matters:** P_shaft live 238.89 vs stamp 244.49 (Δ−5.6 kW); T_shaft live 95.05 Nm vs stamp 119.7 (Δ−24.6 Nm); Q_loss 11.1 vs 12.5 kW. Sheet presents both as truth.
- **Evidence:** openpyxl data_only deltas on FPK LIVE block
- **Fix:** Single source: either live Inputs drive stamps, or stamps are inputs — eliminate dual columns that disagree without a FAIL flag

### [HIGH] XLS-003 — T_required deliberately =NA() while dual bars exist on twin
- **Where:** Calculations!B449 =NA(); G449 check #N/A
- **Why it matters:** Duty requirement is the programme spine (104.1 / 125.2). Blanking as NA() while T_shaft_FE=122.1 is published trains the wrong reading.
- **Evidence:** B449 formula =NA(); covering note dual bars
- **Fix:** Publish both bars as named rows (architecture_duty_nm, conservative_binding_nm) — not a single NA()

### [MED] XLS-004 — T_gap formula comment contradicts arithmetic
- **Where:** Calculations!B451 formula T_shaft/T_FE≈0.78; comment says requirement÷measured; E451=0.98
- **Why it matters:** Reader cannot tell which ratio is the screen
- **Evidence:** B451, D451, E451, F451
- **Fix:** Rename rows; one ratio definition only

### [MED] XLS-005 — GA Excel tab is a 5-row pointer, not an engineering surface
- **Where:** sheet 'GA — General Arrangement' max_row≈5
- **Why it matters:** Score can pass while GA image is weak; no live dimension table from quantities
- **Evidence:** openpyxl max_row=5; image on Drawings only
- **Fix:** Embed GA + dimension table bound to design_envelope_* quantities

### [LOW] XLS-006 — Lone '#' cells on several tabs
- **Where:** Contents!A4, Engineering Analysis A20/A25, Drawings A11, Audit/Risk multiple
- **Why it matters:** May be intentional markers or corruption; not #REF! but noisy
- **Evidence:** data_only value '#'
- **Fix:** Confirm intentional section markers vs export glitch

## 2. Bill of materials

### [FATAL] BOM-001 — Film capacitor MPN assigned to HV DC busbar
- **Where:** requirementsBom X-141 part=Vishay Roederstein MKP1848C66012JY5 requirement=Hv DC Busbar Link
- **Why it matters:** MKP1848C is a DC-link film capacitor family, not a busbar. Catalogue 'IDENTIFIED' is false identity.
- **Evidence:** state.json X-141; Excel ledger MPN column; X-145 correctly uses same MPN for capacitor bank
- **Fix:** Clear MPN on X-141; busbar = bespoke copper to drawing; keep MKP only on capacitor lines

### [FATAL] BOM-002 — Data-centre CoolIT rack manifold on FE front MGU coolant
- **Where:** EP-1 CoolIT Systems Rack Manifold / Coolant Manifold £18 IDENTIFIED
- **Why it matters:** Wrong product domain (rack CDU) for a 350 kW race cassette. Fake catalogue grounding.
- **Evidence:** requirementsBom EP-1
- **Fix:** TBD / bespoke manifold or motorsport QD manifold class — not CoolIT rack

### [FATAL] BOM-003 — Motor assembly cost triple-counted
- **Where:** lines: Traction Motor £18,566 + X-116 IPMSM £4,158 + X-154 casing £7,798 + X-156 jacket £7,798 + X-159 shaft £7,798
- **Why it matters:** Same 350 kW / 142×175×175 package appears as parent motor AND full-price structural children. Materials Σ forced to gold £52.5k after ×0.149 mask hides £349k parametric residue.
- **Evidence:** top cost lines; basis CALIBRATION-MASKED ×0.149 on 40+ lines
- **Fix:** One principal motor buy line; children £0 or SUB-COMPONENT only; remove gold-band mask or show unmasked + masked both

### [HIGH] BOM-004 — Cable/pipe language spammed onto nearly every line
- **Where:** 44/54 requirements contain 'DN8'; 47/54 contain '2×6 mm² Cu'
- **Why it matters:** Fuses, motor housings, SiC inverters, sensors all inherit interconnect CSA boilerplate — destroys sizing credibility
- **Evidence:** requirementsBom requirement strings
- **Fix:** Interconnect language only on actual cable/hose/bus lines

### [HIGH] BOM-005 — 38/54 parts literally named 'requirement stated'
- **Where:** part field
- **Why it matters:** State BoM unusable as buy list; Excel Item column re-derived but state is source of truth for many tools
- **Evidence:** count requirement stated = 38
- **Fix:** part := human noun from requirement head; never the sentinel

### [HIGH] BOM-006 — 35/54 status NOT FOUND while costs still sum
- **Where:** status field
- **Why it matters:** Buy-list claims money without catalogue identity
- **Evidence:** Counter status
- **Fix:** NOT FOUND ⇒ unit_gbp estimate class low + no IDENTIFIED badge

### [HIGH] BOM-007 — Current sensor HASS MPN vs HTFS footprint (BoM + PCB)
- **Where:** I-1/I-3 LEM HASS 100-S; pcb main.ato mpn HASS + footprint LEM_HTFS
- **Why it matters:** Different LEM families; mixed identity is a procurement and footprint lie
- **Evidence:** main.ato lines 3–5,13–15,23–25; BoM I-1/I-3
- **Fix:** Pick one family; align MPN, footprint, BoM, Excel

### [MED] BOM-008 — Duplicate blank tags '—'
- **Where:** tag '—' appears 3× including £18.5k motor and £2.7k inverter
- **Why it matters:** Cannot key lines; breaks traceability
- **Evidence:** duplicate tag counter
- **Fix:** Stable unique tags

### [MED] BOM-009 — Overview still flags BoM vs costStack materials band tension
- **Where:** Overview advisory / prior £31k vs £52k path
- **Why it matters:** After rebuild Overview 10 but cost narrative historically split; verify live Overview Σ matches £52,533.7
- **Evidence:** tab issues history; costStack.raw_materials_bom_gbp=52533.7
- **Fix:** One materials number on Overview, Cost waterfall, BoM foot

## 3. PCB

### [FATAL] PCB-001 — HASS MPN bolted to HTFS footprint (identity fracture)
- **Where:** pcb-project/traction_control/main.ato ×3 current sensors
- **Why it matters:** Same as BOM-007 on authoring surface — DRC0 does not catch wrong MPN family
- **Evidence:** mpn=LEM HASS 100-S footprint=Sensor_Current:LEM_HTFS
- **Fix:** Single curated identity; re-run densify if symbol changes

### [HIGH] PCB-002 — 26 package_family parts remain — gate-drive/desat not draft A
- **Where:** pcb_grade_card tiers package_family:26; still_open gate-driver/desat
- **Why it matters:** A- is correct ceiling; do not imply fab or A
- **Evidence:** grade card axes
- **Fix:** Curate isolated SiC gate-driver MPNs or keep A- with open list (current honesty OK if not overclaimed)

### [MED] PCB-003 — Board-3D images are low-detail tokens (~100–140 KB)
- **Where:** pcb-boards/*/pcb/board-3d.png
- **Why it matters:** Not review-grade for connector orientation / creepage storytelling
- **Evidence:** file sizes 106586 / 141940
- **Fix:** Higher-res KiCad raytrace or annotated orthographic plots

### [PASS] PCB-004 — Live DRC 0 / unconnected 0 on both boards (2026-08-05)
- **Where:** pcb-boards/*/pcb/drc-report.json
- **Why it matters:** Routing hygiene OK under ignored courtyard rules
- **Evidence:** violations=[], date 2026-08-05T12:55
- **Fix:** 

### [PASS] PCB-005 — Fab axis correctly PROTOTYPE_PACKAGE; ship_ok false
- **Where:** pcb_grade_card.json
- **Why it matters:** No greenwash on fab readiness in grade card
- **Evidence:** NOT_FABRICATION_READY true; banner present
- **Fix:** 

## 4. Blender renders & General Arrangement

### [FATAL] GA-001 — GA is not informed by Blender morphology — rectangular stack vs cylindrical concentric EDU
- **Where:** drawings/general-arrangement.png vs 00-hero / 08-ghost / 13-exploded
- **Why it matters:** Blender shows concentric black end-bells, copper end-windings, top PCB shelf, HV orange boom, dual coolant QD, shaft with star nut. GA shows nested axis-aligned boxes + abstract circles. Title block claims 'matches Blender' — false.
- **Evidence:** visual exam 2026-08-05; render-ga-coherence.json broken=true (dome missing from 2D)
- **Fix:** Regenerate GA from form-meshes / parts-ledger silhouette of current Blender; orthographic true outlines of housing, inverter tray, connectors, QDs

### [FATAL] GA-002 — Product envelope dimensions disagree twin quantities
- **Where:** GA title: 352×314×256 mm; quantities design_envelope 343×259×267 mm (W×D×H)
- **Why it matters:** Setting-out dims not single-sourced
- **Evidence:** GA PNG text; state quantities design_envelope_*_mm
- **Fix:** GA dims = live quantities; fail CI on drift >1 mm

### [HIGH] GA-003 — GA detail level far below requirement for highly detailed GA
- **Where:** general-arrangement.png 2160×2212 ~300 KB; 3 views; only 10 of 54 items listed
- **Why it matters:** User asked for GA as highly detailed as possible. Current is preliminary block diagram. Missing: connector callouts with orientation, QD ports, mounting feet, busbar R/Y/B, film-cap bank, PCB stack section, gear nest, section cuts, datums beyond FFL.
- **Evidence:** image size; principal equipment table top-10 only
- **Fix:** Multi-sheet GA: overall + inverter shelf detail + motor/gear section + interface ICD views; ≥4k export

### [HIGH] GA-004 — Prior automated coherence already FAIL — dome/end structure missing on GA
- **Where:** drawings/render-ga-coherence.json
- **Why it matters:** broken=true defect: solid dome metallic structure on right of 3D absent from all 2D views
- **Evidence:** render-ga-coherence.json
- **Fix:** Include end-bell OD on elevation B-B and plan; re-run coherence gate until ok

### [HIGH] GA-005 — Motor principal dims 142×175×175 ignore DEC-009 stack 130 mm language
- **Where:** GA equipment X-116 / BoM motor dims vs stack_length_mm=130
- **Why it matters:** Reader cannot reconcile active stack with package box
- **Evidence:** quantities stack_length_mm; GA principal list
- **Fix:** Annotate L_stk=130, package envelope separately

### [HIGH] BLN-001 — Blender PE region still schematic (coloured prisms / flat PCB)
- **Where:** 00-hero, 08-ghost, 13-exploded
- **Why it matters:** Film-cap cylinders partially present on exploded PCB; SiC modules still blocky; not supplier-like. Good architecture pedagogy, not GA-grade geometry source without cleanup.
- **Evidence:** visual exam hero/ghost/exploded
- **Fix:** If GA driven from Blender, first harden PE tray mesh to match electrical story

### [MED] BLN-002 — Studio pedestal base in Blender is not a vehicle ICD
- **Where:** hero/ghost base plate with bolts
- **Why it matters:** GA should show chassis pickups when claiming race kit; Blender show base is photography rig
- **Evidence:** visual
- **Fix:** Either remove pedestal from engineering views or label 'studio stand — not chassis ICD'

### [MED] BLN-003 — Floating bar / disconnected geometry cue on hero left
- **Where:** 00-hero upper-left thin bar
- **Why it matters:** Looks like stray mesh or incomplete harness
- **Evidence:** visual exam
- **Fix:** Delete or complete as harness/pipe

---

## Priority fix order (recommended)

1. **BOM-001 / BOM-002 / BOM-003** — false catalogue identities + motor double-count (poison Jack's buy list)
2. **GA-001 / GA-002 / GA-003 / GA-004** — regenerate GA from current Blender; single envelope dims; detail up
3. **XLS-001 / XLS-002 / XLS-003** — stop formula errors and dual torque/power truths in Calculations
4. **PCB-001 / BOM-007** — one LEM family (HASS *or* HTFS)
5. **BOM-004 / BOM-005** — stop DN8/2×6 spam and 'requirement stated' part names

## What is actually OK

- PCB **DRC 0** (live 5 Aug) and **PROTOTYPE_PACKAGE** honesty on grade card
- Blender cycle-3 composition is readable architecture (motor + PE shelf + QD + HV) even if PE is schematic
- Dual torque bars + ship_ok false discipline still holds outside these surfaces

_End of serial adversarial v9_
