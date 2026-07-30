# Formula E front kit — first-principles explainer

**Date:** 2026-07-30  
**Twin:** `out/formula-e-front-mgu-20260729-1432`  
**Assembly revision stamp:** `front-drive-concept-stub-2026-07-30`  
**Release verdict on the twin:** `ship_ok = false` — not race-ready.

---

## 1. What this is / is not

### What this is

A plain-language first-principles sizing story for **this** front powertrain kit concept: how 250 kilowatts (kW) of front regenerative electrical duty, a ~750 volt (V) direct-current (DC) bus, and a ~19,500 revolutions-per-minute (rpm) rotor turn into currents, shaft torque, gear loads, magnetics, cooling, and the software checks we run against them.

It is meant to be readable with a calculator beside you. Every arithmetic step that matters is written out.

### What this is not

| Not this | Why |
|---|---|
| Fédération Internationale de l’Automobile (FIA) homologation | Public rule citations and twin screens do not mint a stamped pack (`regs_on_disk = false` in the binding doc) |
| Copy-paste of supplier computer-aided design (CAD) | No Lucid / proprietary mesh paste; geometry is parametric or communication-only |
| A claim that the kit “works” because a smoke test ran | Smoke ≠ twin-bound evidence ≠ `ship_ok` |
| A closed materials bill of materials (BOM) | Many alloys and magnet grades are still seeds |

**Binding numbers live in:** [`FIA-FRONT-POWERTRAIN-KIT-BINDING-REQUIREMENTS-2026-07-30.md`](./FIA-FRONT-POWERTRAIN-KIT-BINDING-REQUIREMENTS-2026-07-30.md)  
**Gap / closure plan:** [`MOTOR-MULTIPHYSICS-AND-CAD-PLAIN-LANGUAGE-2026-07-30.md`](./MOTOR-MULTIPHYSICS-AND-CAD-PLAIN-LANGUAGE-2026-07-30.md)

---

## 2. One worked numerical spine (the example)

We carry **one** example end-to-end. Binding seeds from the twin:

| Quantity | Twin value |
|---|---:|
| Front regen / continuous design electrical power | **250 kW** |
| DC bus design seed | **750 V** (window 600–900 V) |
| Peak rotor speed | **19,500 rpm** |
| Bay (width × depth × height) | **343 × 259 × 267 mm** |
| Mass aspiration | **~32 kg** |
| Coolant | **60 °C**, **12 L/min** |
| Trial gear ratio | **8.0** |
| Twin analytical efficiencies (EM duty check) | machine **0.98995**, inverter **0.98766** |
| Analytical required shaft torque | **125.215 N·m** |
| Live magnetic screen | **~96.3 N·m** at −45° elec / **535 A** rms / `turns_per_coil=4` → **~76.9%** of duty |

**Efficiency honesty:** a casual briefing sometimes says η_motor ≈ 0.96 and η_inv ≈ 0.98. The **live twin analytical duty check does not use those**. It uses `machine_efficiency_assumption = 0.98995` and `inverter_efficiency_assumption = 0.98766` (product ≈ 0.97773). The engineering contract also carries softer brief seeds (`mgu_efficiency = 0.97`, `inverter_efficiency = 0.985`). Below we follow the **EM analytical duty check**, because that is what produced the 125.2 N·m figure stamped on the twin.

### Step 1 — Electrical power → DC current estimate

Electrical power at the DC bus for the continuous front-regen design duty:

\[
P_{\mathrm{elec}} = 250~\mathrm{kW} = 250 \times 1000 = 250000~\mathrm{W}
\]

At the design bus voltage:

\[
I_{\mathrm{DC}} = \frac{P_{\mathrm{elec}}}{V_{\mathrm{DC}}} = \frac{250000}{750} = 333.\overline{3}~\mathrm{A}
\]

Twin stamp: `dc_current_a = 333.333333`.  
So the cable / connector / bus class must be comfortable around **~333 A DC** at 750 V for this duty (peak events and voltage sag can push higher — not closed here).

### Step 2 — Assumed efficiencies → shaft power → shaft torque at 19,500 rpm

In regenerative braking, mechanical shaft power comes **in**, and electrical power goes **out**. Losses mean the shaft must supply more power than the electrical output:

\[
\eta_{\mathrm{combined}} = \eta_{\mathrm{machine}} \times \eta_{\mathrm{inverter}}
\]

\[
\eta_{\mathrm{combined}} = 0.98995 \times 0.98766 = 0.977734\ldots
\]

Twin reports `combined_regen_efficiency = 0.977734`.

Shaft power required for 250 kW electrical out:

\[
P_{\mathrm{shaft}} = \frac{P_{\mathrm{elec}}}{\eta_{\mathrm{combined}}} = \frac{250000}{0.977734} = 255693.26~\mathrm{W} = 255.693~\mathrm{kW}
\]

Twin: `shaft_power_kw = 255.693262`.

Angular speed of the rotor:

\[
\omega = \frac{2\pi n}{60} = \frac{2\pi \times 19500}{60}
\]

First \(2\pi \approx 6.283185307\):

\[
2\pi \times 19500 = 6.283185307 \times 19500 = 122522.1135
\]

\[
\omega = \frac{122522.1135}{60} = 2042.035225~\mathrm{rad/s}
\]

Shaft torque:

\[
T_{\mathrm{shaft}} = \frac{P_{\mathrm{shaft}}}{\omega} = \frac{255693.26}{2042.035225} = 125.215~\mathrm{N\cdot m}
\]

Twin: `required_shaft_torque_nm = 125.214912` ≈ **125.2 N·m**.

That is the analytical **target** the magnetic screen is measured against.

**Quick cross-check without efficiencies (order of magnitude only):**  
If you wrongly treated 250 kW as shaft power at 19,500 rpm:

\[
T_{\mathrm{naive}} = \frac{250000}{2042.035225} = 122.427~\mathrm{N\cdot m}
\]

The ~3 N·m gap to 125.2 N·m is exactly the regen-loss uplift. Do not skip the efficiency step.

### Step 3 — Gear ratio 8 → approximate output torque / speed

Trial single-speed reduction (Decision Register seed; not homologated):

\[
i = 8.0
\]

Ideal kinematic speeds (ignoring slip):

\[
n_{\mathrm{out}} = \frac{n_{\mathrm{rotor}}}{i} = \frac{19500}{8} = 2437.5~\mathrm{rpm}
\]

Ideal torque multiplication (100% gear efficiency — upper bound):

\[
T_{\mathrm{out,ideal}} = T_{\mathrm{shaft}} \times i = 125.215 \times 8 = 1001.72~\mathrm{N\cdot m}
\]

With the contract’s trial gear efficiency 0.97 (seed, not measured):

\[
T_{\mathrm{out,approx}} = 125.215 \times 8 \times 0.97 = 125.215 \times 7.76 = 971.67~\mathrm{N\cdot m}
\]

So the differential / halfshaft side is in the **~1 kN·m class** at this corner of the map — not something a visual gear cue can “prove.” ISO gear strength is still **OPEN**.

### Step 4 — Rough air-gap shear: why Ø122 mm × ~98 mm can aim at ~125 N·m

Twin rotor outer diameter and active length:

\[
D = 122~\mathrm{mm} = 0.122~\mathrm{m},\quad L = 97.58~\mathrm{mm} = 0.09758~\mathrm{m}
\]

Air-gap tangential shear stress estimate from shaft torque (standard cylindrical machine estimate):

\[
\tau_{\mathrm{gap}} \approx \frac{2\,T}{\pi\,D^{2}\,L}
\]

Compute \(D^{2}\):

\[
D^{2} = 0.122 \times 0.122 = 0.014884~\mathrm{m}^{2}
\]

\[
\pi D^{2} = 3.14159265 \times 0.014884 = 0.046758~\mathrm{m}^{2}
\]

\[
\pi D^{2} L = 0.046758 \times 0.09758 = 0.004563~\mathrm{m}^{3}
\]

\[
2T = 2 \times 125.215 = 250.43
\]

\[
\tau_{\mathrm{gap}} = \frac{250.43}{0.004563} = 54883~\mathrm{Pa} \approx 54.9~\mathrm{kPa}
\]

**Reading:** ~55 kPa average air-gap shear is aggressive but in the ballpark of high-performance traction interior permanent-magnet (IPM) machines. It does **not** prove the winding / magnet design closes 125 N·m — it only says the **envelope** is not absurd for the torque target.

Rotor surface speed (twin also stamps this):

\[
v = \omega \times \frac{D}{2} = 2042.035225 \times 0.061 = 124.564~\mathrm{m/s}
\]

Twin: `rotor_surface_speed_m_s = 124.564149`. Tip speed ~125 m/s is a retention / burst concern — another reason CalculiX rotor screens exist.

### Step 5 — Phase current estimate vs twin design ~535 A

A rough three-phase line estimate from DC power (ideal inverter, power invariant):

\[
P \approx \sqrt{3}\, V_{\mathrm{LL,rms}}\, I_{\mathrm{ph,rms}} \times \text{(power factor terms)}
\]

The twin’s analytical duty check already reports:

- `estimated_phase_rms_current_a = 334.943391` (power-side estimate near the DC current scale)
- `phase_current_design_a = 535.0` (design seed used for the loaded magnetic point)

Peak for a sine wave at 535 A rms:

\[
I_{\mathrm{peak}} = 535 \times \sqrt{2} = 535 \times 1.41421356 = 756.60~\mathrm{A}
\]

Twin loaded point: `phase_current_peak_a = 756.604…`, `phase_current_rms_a = 535.0`.

**Why design current > simple power estimate:** voltage headroom, power factor, field orientation, copper temperature, and the fact that torque capability is set by **ampere-turns and flux**, not by DC watts alone. The magnetic finite-element (FE) screen uses **535 A rms**, not 335 A.

### Step 6 — Where live FE sits vs target (honest gap)

| Item | Value |
|---|---:|
| Analytical required shaft torque | **125.215 N·m** |
| FE loaded magnitude (best screened angle −45° elec) | **96.293 N·m** |
| Ratio | \(96.293 / 125.215 = 0.769\) → **76.9%** |
| Duty screen threshold on twin | ≥ 75% → `duty_torque_screen_ok = true` |
| `works_in_kit_context` | **true** (duty screen only) |
| Torque map / demagnetisation / dyno | **OPEN** |
| `ship_ok` | **false** |

So: the machine **screens** in kit context (~77% of analytical duty at one angle / one rotor position). It does **not** close the magnetic map. Do not read `works_in_kit_context` as finished engineering.

---

## 3. Magnetics (recap + more maths)

### What the machine is, in plain English

The twin FE geometry is a **48-slot / 8-pole twin-V interior permanent-magnet synchronous machine** (IPMSM):

- **Stator:** stacked electrical-steel sheets with slots; copper windings in the slots make a rotating magnetic field when fed with three-phase alternating current (AC).
- **Rotor:** steel carrier with **buried** neodymium-iron-boron (NdFeB) magnets arranged in V-pairs (twin-V). Magnets provide field without rotor copper.
- **Air gap:** ~0.7 mm radial (`radial_airgap_mm = 0.7`).

Physics-tree analytical winding seeds (checklist, not FE mesh):

- `turns_per_phase = 14`
- `turns_per_coil = 4` (also the FE conductor-per-slot seed)
- `conductor_area_mm2 = 26.775`
- `phase_resistance_ohm_20c = 0.00623`
- Twin also records `twin_stator_slots = 24` alongside the FE **48-slot** map — **24-vs-48 reconciliation is still OPEN**.

### Poles, slots, turns — the small maths

Electrical frequency at 19,500 rpm with \(p = 8\) poles (\(p/2 = 4\) pole-pairs):

\[
f_{\mathrm{elec}} = \frac{n}{60} \times \frac{p}{2} = \frac{19500}{60} \times 4 = 325 \times 4 = 1300~\mathrm{Hz}
\]

Rough copper \(I^{2}R\) loss at design current (order of magnitude, three phases, 20 °C resistance seed — real hot resistance is higher):

\[
P_{\mathrm{Cu,cold}} \approx 3 \times I_{\mathrm{rms}}^{2} \times R_{\mathrm{ph}}
= 3 \times 535^{2} \times 0.00623
\]

\[
535^{2} = 286225
\]

\[
286225 \times 0.00623 = 1783.18
\]

\[
3 \times 1783.18 = 5349.5~\mathrm{W} \approx 5.35~\mathrm{kW}
\]

That is only the **cold ohmic** estimate. Core loss, AC copper (skin/proximity), magnet loss, and inverter loss are separate — and still largely map-OPEN.

### Torque from fields (intuition + FE result)

Electromagnetic torque comes from interaction of stator current and air-gap flux. The twin FE uses a FEMM weighted-stress-tensor integral at one rotor position after a coarse current-angle screen. Best screened point:

- Angle: **−45° electrical** (the −90° choice was a torque-null — that bug is what produced the earlier ~9 N·m nonsense)
- Torque magnitude: **96.3 N·m**
- Peak air-gap flux density at that point: ~**1.36 T**
- Still **not** a maximum-torque-per-ampere (MTPA) map, not a demagnetisation map

Ampere-turns per slot (screen seed):

\[
\mathrm{AT}_{\mathrm{slot}} \approx N_{\mathrm{cond/slot}} \times I_{\mathrm{slot\ path}}
\]

With `effective_turns_per_slot = 4` and phase current 535 A rms (exact path sharing depends on parallel paths = 2 — treat as order-of-magnitude):

\[
4 \times 535 = 2140~\mathrm{A\cdot turns\ (rms\ scale)}
\]

Enough to say “we are not running a toy current,” not enough to freeze a hairpin schedule.

---

## 4. Permanent magnets vs electromagnets (field excitation)

### Two ways to make the rotor field

| Approach | How the rotor field is made | Typical cost |
|---|---|---|
| **Electromagnet (wound-field)** | Copper coils on the rotor, fed through slip rings or a brushless exciter | Rotor copper + cooling + excitation hardware |
| **Permanent magnet (this kit concept)** | Sintered NdFeB magnets buried in the rotor iron | Magnet material + retention + demagnetisation risk |

This kit concept uses **interior permanent magnets on the rotor** + **copper electromagnet windings on the stator**. That is the standard high-power-density traction IPM pattern: field “built in” to the rotor; stator copper does the controllable work.

### What remanence means

Remanent flux density \(B_r\) is the flux density the magnet would show in a closed magnetic circuit after magnetisation — a material figure of merit.

| Source | \(B_r\) seed | Status |
|---|---:|---|
| Pyleecan IPMSM_B educational magnet record (FE training material) | **~1.24 T** | Training / screen material — **not** a purchase order |
| Physics-tree NdFeB **N42UH-class** seed | **1.28 T** | Seed — **supplier grade OPEN** |

Neither freezes N42UH vs N48H vs a race-temperature UH/EH grade. Hot demagnetisation maps are **OPEN**.

### Why IPM for a Formula E front kit (pros / cons)

**Pros (why the concept leans this way)**

- High torque density in a short stack (bay is only 343 × 259 × 267 mm)
- No rotor copper loss (helps the ~32 kg / thermal story)
- Good efficiency at the regen duty if the magnetic design closes

**Cons (why we stay humble)**

- Magnets can **demagnetise** under hot opposing field — needs maps, not one FE point
- Retention bridges / sleeves must survive ~125 m/s tip speed — CalculiX pocket burst still **OPEN**
- Magnet grade, coating, and adhesive/sleeve are supply-chain decisions, not software outputs

**No supplier silhouette paste.** Geometry families are educational / parametric seeds.

---

## 5. Materials — what we assume today vs what a release needs

Be explicit: **screening seeds ≠ purchase-spec alloys**.

### Copper (stator windings)

| Topic | Today on the twin / tree | Release still needs |
|---|---|---|
| Conductivity | Physics tree OFHC copper: `copper_electrical_conductivity_s_m = 58000000` (5.8×10⁷ S/m @ 20 °C handbook) | Named temper + measured resistivity at process |
| Chemistry | OFHC (≥99.99% Cu) for windings seed; ETP (≥99.9%) for busbar seed | Exact alloy designation on the drawing |
| Insulation | `enamel_polyimide` named in the materials list | Enamel system (e.g. PEI/PAI stack), thermal class cert |
| Geometry | Analytical area 26.775 mm²; FE uses turns seeds | Hairpin vs round, bend radii, weld schedule |

Purity / temper / enamel grade matter because resistivity sets copper loss and enamel sets thermal / voltage class. **Not frozen:** alloy designation, enamel stack, hairpin vs round.

### Electrical steel (stator / rotor laminations)

**Why laminated at all:** alternating flux in solid iron would drive large eddy currents (like a shorted transformer turn). Thin sheets with insulation between them break those loops.

**What the names mean (plain language):**

| Grade style | How to read it |
|---|---|
| **M400-50A** (FE B–H curve source: Pyleecan IPMSM_B training record) | Loss grade / thickness class in the IEC naming family: roughly “specific loss class” + **0.50 mm** sheet thickness, annealed condition |
| **M250-35A** (physics-tree material id `electrical_steel_M250_35A`) | Lower-loss / thinner class seed: **0.35 mm** laminations, Fe–Si ~3% silicon |

So: the FE nonlinear curve is **M400-50A-class training data**; the checklist currently names **M250-35A-class** as a materials aspiration. That mismatch is honest unfinished business — **release needs one named grade, thickness, coating, and anneal**, purchased and correlated.

Laminated stack = a **composite of insulated steel sheets**, not carbon-fibre composite.

### Permanent magnets

| Topic | Today | Release |
|---|---|---|
| Class | NdFeB | Still NdFeB class |
| Remanence seeds | ~1.24 T (FE training) / 1.28 T (N42UH-class tree) | Supplier curve at temperature |
| Grade | N42UH-class **seed** | Frozen grade (UH/EH as needed), coating, glue/sleeve |
| Demag / temp | Limits assumed (e.g. magnet ~150 °C class seeds elsewhere) | Hot demag map + dyno |

### Structural / case / gears

| Domain | Screening assumption | Release |
|---|---|---|
| CalculiX rotor ring | Generic isotropic steel, yield seed **355 MPa** → FoS screen ~3.44 vs ~103 MPa von Mises | Named rotor alloy + pocket geometry |
| ROSS shaft / disk | Assumed steel + assumed bearing stiffness | Catalogue bearing k/c + modal test |
| Case | Blender / Al_ADC12 seed in tree | Castable case CAD + mount FEA |
| Gears | Visual / parametric teeth; oil `gear_oil_75W90` seed | Case-hardened gear steel TBD; oil TBD; ISO 6336 |

Label all of the above as **screening**, not BOM alloy.

---

## 6. Inverter — how it works in this story

### Plain story

1. Battery / car DC bus arrives at ~**750 V** (seed window 600–900 V; car absolute max class ≤ 1000 V except phase conductors).
2. **Silicon-carbide (SiC)** power switches in three half-bridges chop that DC into three-phase AC for the stator.
3. **DC-link film capacitors** sit across the bus to supply the fast current pulses the switches demand and to limit voltage ripple.
4. A **cold plate** under the modules takes away switching + conduction heat into the same 60 °C / 12 L/min coolant perimeter.
5. **Gate-drive** boards turn the SiC devices on/off safely (isolation, Miller clamp, desaturation — identity still OPEN).

### Numbers already in the spine

\[
P = 250~\mathrm{kW},\quad V = 750~\mathrm{V},\quad I_{\mathrm{DC}} = 333.3~\mathrm{A}
\]

Physics-tree cold-plate heat seed: ~**4.318 kW** inverter heat load into the plate (analytical split of switching/conduction — not a supplier loss map).

Capacitor seed: four generic film capacitors totalling ~**223 µF** from ripple screening — **no manufacturer part number (MPN) frozen**.

### What “packaging still OPEN” means

| Open item | Why it matters |
|---|---|
| Module MPN / STEP | Terminal geometry drives laminated-bus design |
| Bus inductance (3D + measured) | Sets voltage overshoot at turn-off |
| Double-pulse bench | Correlates switching energy and equivalent series inductance |
| Module temperatures | Cold-plate duct Δp alone does not prove junction temperature |

Inverter packaging status on the twin multiphysics plan: **NOT STARTED** as a closed evidence row (module volumes exist in Blender / tree only).

---

## 7. Rotating mechanics, gears / differential, structure, cooling

### Rotating mechanics (ROSS)

Question: are shaft **critical speeds** clear of 19,500 rpm?

Twin kit-sized ROSS screen:

| Item | Value |
|---|---:|
| Operating speed | 19,500 rpm |
| First critical (screen) | **28,156.8 rpm** |
| Margin ratio | \(28156.8 / 19500 = 1.444\) |

**Idea of margin:** if the first bending critical were at 20,000 rpm on a 19,500 rpm machine, you would be living on the resonance. ~1.44× is a comfortable **screen**, not a correlated modal test. Bearings are **assumed**, not catalogue parts.

### Gears and differential

- Trial ratio **8.0** (see §2 step 3): ~2437.5 rpm out, ~1 kN·m class torque out.
- Planetary seeds in the tree (tooth counts such as 18 / 54 / 126) are **architecture cues**.
- Differential exists as communication geometry; bias, bevel contact, fatigue **OPEN**.
- Gear oil delivery / churning CFD **OPEN**.

### Structure (CalculiX)

Twin centrifugal **steel-ring** screen at 19,500 rpm:

| Item | Value |
|---|---:|
| Max von Mises | **103.1 MPa** |
| Assumed yield | **355 MPa** |
| Screening FoS | \(355 / 103.1 ≈ 3.44\) |

This is **not** magnet-pocket burst, not case/mount FEA, not joint separation. It answers “is a solid ring at this radius/speed obviously exploding?” — useful, incomplete.

### Cooling

Coolant perimeter: **60 °C inlet**, **12 L/min** total.

If the cold plate has **8** parallel passes (twin OpenFOAM duct screen):

\[
\dot{V}_{\mathrm{total}} = 12~\mathrm{L/min} = \frac{12}{1000\times 60} = 0.0002~\mathrm{m}^{3}/\mathrm{s}
\]

\[
\dot{V}_{\mathrm{per\ pass}} = \frac{0.0002}{8} = 0.000025~\mathrm{m}^{3}/\mathrm{s} = 1.5~\mathrm{L/min\ per\ pass}
\]

Twin OpenFOAM rectangular-duct screen headline pressure drop ≈ **25 kPa** (PARTIAL). Module temperatures and full serpentine conjugate heat transfer (CHT) remain **OPEN**. Motor water jacket CFD is **OPEN** (smoke only).

Lumped coolant temperature-rise class check (binding doc seed ≤ 25 K) is a perimeter consistency rule — not a solved winding hotspot.

---

## 8. What each software package is asked to do + status

Ruthless reading rule: **smoke ≠ working in kit context ≠ map closed ≠ `ship_ok`.**

| Package | Question we ask it | What PASS would mean | Status on THIS twin | Works in kit context yet? |
|---|---|---|---|---|
| **Pyleecan + xfemm (FEMM)** | Can the IPM deliver the 250 kW / ~125 N·m shaft duty inside voltage, current, thermal and demag limits? | Twin-bound torque / loss / demag **maps** correlated later on dyno | Twin-bound loaded point **PARTIAL**: ~96 N·m (~77%); map OPEN; `ship_ok` false | **Duty screen yes** (~77% ≥ 75% threshold) — **not** map closed |
| **ROSS** | Are critical speeds clear of 19,500 rpm with margin? | Catalogue bearings + correlated Campbell / unbalance response | Twin-bound beam screen **PARTIAL**: first critical ~28.2k rpm, margin ~1.44; bearings assumed | **Partial screen** — not release |
| **Gmsh + CalculiX** | Do rotor retention, case, mounts survive speed and torque in the bay/mass box? | Pocket burst + case/mount load cases with named materials and FoS policy | Twin-bound **ring** centrifugal screen **PARTIAL**: ~103 MPa, FoS~3.4 vs 355 MPa yield seed; pocket/case OPEN | **Partial screen** only |
| **OpenFOAM** | Do jacket / cold plate / oil reject heat and deliver oil at 12 L/min / 60 °C without boiling or starve? | CHT + module temps + jacket + oil free-surface, then flow-bench correlation | Cold-plate **duct** Δp ~25 kPa **PARTIAL**; jacket **OPEN**; oil **OPEN** | Cold-plate duct screen only |
| **CadQuery families** | Is geometry controlled enough to mesh, draw, and mass-check? | Revision-locked STEP for solvers + drawings | **4 / 13** parametric (stator, rotor carrier, planetary, cold-plate serpentine); **0** supplier/team release | Library started — **release coverage 0%** |
| **Blender** | Can a human read packaging, cutaway, service access? | Communication only — never flips solver rows alone | Useful cassette / cutaway communication geometry | Explains package — **does not prove physics** |
| **Physics tree → Excel stamp** | Is every claim tied to a checklist row with OPEN/PARTIAL honesty? | All mandatory leaves closed or explicitly waived with evidence | **256 nodes / 207 leaves**; many OPEN holds listed | Strong checklist — **not** FE mesh; `ship_ok` false |

Toolchain smokes (generic cantilever, cavity tutorial, training IPMSM_B sector, etc.) prove executables run. They are recorded separately and **must not** be mistaken for the twin-bound PARTIAL rows above.

---

## 9. Physics tree nodes / leaves (short)

The FPK physics tree is a **hierarchical engineering checklist**, not a finite-element mesh.

| Count | Meaning |
|---:|---|
| **256 nodes** | Nested checklist rows (assemblies → parts → materials → claims) |
| **207 leaves** | End items that must eventually carry a number, a test, or an explicit OPEN |

Example (tiny slice of the real tree):

```
front_fpk
  └─ cassette_assembly
       └─ traction_drive_housing   [Al_ADC12 seed]  OPEN: structural_FEA
  └─ … motor …
       └─ stator_windings
            {turns_per_phase=14; R_ph(20°C)=0.00623 Ω; area=26.775 mm²}
            OPEN: FEA_em, dyno_resistance
```

When Excel or Quality & Audit says a leaf is OPEN, it means that **proof hold** is empty — not that Blender forgot to draw a bolt.

---

## 10. What is still OPEN / cannot be closed in software alone

Software can prepare evidence packages. It cannot mint homologation or replace hardware.

| Hold | Why software alone fails |
|---|---|
| Dynamometer correlation | Real torque, efficiency, thermal maps vs FE |
| Hardware-in-the-loop (HIL) on populated boards | Control + power stage behaviour in the loop |
| Flow bench (jacket / cold plate) | Measured Δp and heat transfer vs CFD |
| FIA / team port XYZ + mounts | Interface control document coordinates |
| Signed materials / MPNs | Purchase specs, not handbook seeds |
| Double-pulse + bus ESL measurement | Switching energy and stray inductance |
| Magnet retention / burst test | Hot overspeed reality |
| Gear oil / tooth life under race spectrum | Bench and track loads |
| Energy / lap duty authority (DEC-007) | Championship metering, not a twin seed |
| `ship_ok = true` | Explicitly false until race evidence exists |

---

## 11. Link back

| Document | Role |
|---|---|
| [`FIA-FRONT-POWERTRAIN-KIT-BINDING-REQUIREMENTS-2026-07-30.md`](./FIA-FRONT-POWERTRAIN-KIT-BINDING-REQUIREMENTS-2026-07-30.md) | Hard duty / bay / mass / speed / coolant rows every solver must serve |
| [`MOTOR-MULTIPHYSICS-AND-CAD-PLAIN-LANGUAGE-2026-07-30.md`](./MOTOR-MULTIPHYSICS-AND-CAD-PLAIN-LANGUAGE-2026-07-30.md) | Ordered closure plan, scoreboard, CAD authority ladder |
| Twin stamp | `out/formula-e-front-mgu-20260729-1432/JLR-FE-FRONT-FPK-MOTOR-MULTIPHYSICS.md` |
| Twin EM case | `out/formula-e-front-mgu-20260729-1432/_motor_stack/em_fia_front_kit_case.json` |

---

## Appendix A — Spine numbers on one page

```
P_elec          = 250000 W
V_DC            = 750 V
I_DC            = 250000 / 750 = 333.333 A

η_machine       = 0.98995          (twin EM duty — not 0.96)
η_inverter      = 0.98766          (twin EM duty — not 0.98)
η_combined      = 0.98995 × 0.98766 = 0.977734

P_shaft         = 250000 / 0.977734 = 255693 W = 255.693 kW
ω               = 2π × 19500 / 60 = 2042.035 rad/s
T_shaft         = 255693 / 2042.035 = 125.215 N·m

i_gear          = 8
n_out           = 19500 / 8 = 2437.5 rpm
T_out_ideal     = 125.215 × 8 = 1001.7 N·m

D_rotor         = 0.122 m
L_active        = 0.09758 m
τ_gap           ≈ 2T / (π D² L) ≈ 54.9 kPa

I_ph_design     = 535 A rms
I_ph_peak       = 535 × √2 = 756.6 A

T_FE (−45° elec)= 96.293 N·m
ratio           = 96.293 / 125.215 = 0.769 (76.9%)
ship_ok         = false
```

## Appendix B — Numbers deliberately not over-claimed

| Tempting claim | Honest status |
|---|---|
| “96 N·m means the motor works” | Duty **screen** only; map / demag / dyno OPEN |
| “ROSS margin 1.44 → rotor dynamics done” | Assumed bearings; no modal correlation |
| “103 MPa FEA → structure done” | Steel ring screen; pockets/case OPEN |
| “25 kPa CFD → cooling done” | One duct geometry; module temps OPEN |
| “Blender cutaway → design complete” | Communication ≠ evidence |
| “Materials list → BOM frozen” | Seeds (M250 vs M400, Br 1.24 vs 1.28, N42UH-class) |

---

*End of explainer. `ship_ok` remains false.*
