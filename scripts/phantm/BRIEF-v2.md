# BRIEF FOR TERMINAL — Anvil specification for the PHANTM actuator (v2, built on Tony's exact geometry, 23 Jul 2026)

**CONFIDENTIAL — core IP.** Scope: the actuator only — its magnetics, mechanics, manufacture and cost. Nothing about the RF, the aperture, the beam or the feed. If you find yourself modelling those, stop.

This version supersedes v1: the geometry below is Dr Tony Hooley's exact specification. Reproduce it precisely as the baseline. The engine's job is to compute the five numbers Tony asks for (Section 4), then check the design against the requirements PHANTM imposes (Section 5) and tell us if it works.

---

## 1. Purpose
Model the magnetic physics of one PHANTM beam-steering actuator to the depth needed to predict force, holding (detent) force, step size, coil drive and power; model how it is manufactured at scale and cost; and return a plain verdict on whether the design as specified meets PHANTM's needs. The force physics is deliberately beyond closed-form: the ~77 µm gaps and toothed pole tips will saturate once permanent-magnet and coil flux combine, so a nonlinear magnetostatic field solver is required for the force numbers (Section 6).

The actuator sets the reflection depth in one hex waveguide cell of PHANTM (reflective phase-shifting). There are thousands per aperture. Two properties dominate: **zero-power hold** (a PM detent holds each cell's phase with no continuous current) and **size + cost** (fit behind a sub-2 mm cell; target ~USD 0.10 each at volume; 15-year outdoor life).

---

## 2. The actuator — exact specification (baseline; all four sub-assemblies)
A linear electromagnetic variable-reluctance stepper with permanent-magnet detent, comprising: (1) a **stator** (electromagnetic driver), (2) a **translator** (moving part), (3) a **linear bearing** (low-friction, high-precision straight-line guide), (4) a **frame** holding the stator rigid relative to the bearing (and thus slidingly relative to the translator).

### 2.1 Translator
- Bar of **Soft Magnetic Composite (SMC — Somaloy-type pure-iron powder)**.
- Dimensions **1.55 mm × 1.55 mm × 12.5 mm** long.
- Two **opposite** faces each carry a series of rectangular slots moulded across the full width of the bar, identical on both faces. Slots: **0.465 mm deep, 0.232 mm wide, spaced 0.232 mm apart** along the bar ⇒ **tooth pitch = 0.464 mm** (Tony's 0.465). These form the variable-reluctance tooth set.

### 2.2 Stator — three identical pole-pieces
Spaced slightly apart along and around the translator. Each pole-piece is **three SMC sections**:
- **Two slot-sections** (identical): bar **1.16 mm × 0.465 mm × 1.708 mm** long, with **2 rectangular slots** along one long face (the slot-face), **0.232 mm wide, 0.155 mm deep**, each set 0.232 mm in from opposite long edges (⇒ 0.232 mm apart). The two slot-sections are held **symmetrically 1.704 mm apart**, slot-faces facing each other, so the high parts of the slot-faces leave a gap **wider than the 1.549 mm translator width**; with the translator centred, its slots line up with the slot-face slots, leaving a **~77 µm gap** between translator faces and slot-faces.
- **One bridge-section** joining one pair of ends of the slot-sections into a single magnetic path: rectangular **0.232 mm × 1.162 mm × 2.634 mm** long, but with its **centre portion (0.792 mm long) displaced 0.263 mm away from the translator path** to clear the coil — an angled section at each end plus a central section (0.729 mm long), giving a "linearised horseshoe."
- **Coil:** Nc turns of enamelled copper, wire diameter Dc, wound around the centre of the bridge; drive pulse of width tc, magnitude Ic.
- **Permanent magnet:** a small **NdFeB** magnet inserted along the pole-piece magnetic path, axial length **Pm** (along the path), cross-section matching the section it sits in; **Pm chosen to give the required detent force Fd**.

### 2.3 Three-phase offset
The three pole-pieces are spaced **0.374 mm** apart along the translator, putting their teeth out of phase with the translator teeth by exactly **one third of the tooth pitch (0.465/3 = 0.155 mm)** — the two non-aligned poles offset in opposite directions.

### 2.4 Operation
Zero current: the PM detent flux pulls the translator to the position where **one** pole-piece is exactly tooth-aligned, and holds it there with no power. Pulsing sufficient current through **one of the other two** poles re-aligns the translator to that pole — a step of **0.155 mm** (1/3 tooth). Sequencing Left-Centre-Right (or the reverse) walks it continuously in either direction. Motion is millisecond-scale.

---

## 3. Materials & physical constants (use these; expose as variables)
- SMC (translator + pole-pieces): density ~7.3–7.6 g/cm³; nonlinear B–H (Somaloy-type: saturation ~1.0–1.5 T, relative permeability a few hundred to ~1000, low eddy loss).
- NdFeB: fully magnetised, Br ~1.0–1.4 T, on its demagnetisation load line; include temperature coefficients.
- Copper: resistivity 1.72×10⁻⁸ Ω·m at 20 °C.
- Magnetic gap (each side) from geometry: (1.704 − 1.549)/2 = **~0.0775 mm (77.5 µm)** — confirm this is Wm in task 2.

---

## 4. PRIMARY DELIVERABLES — the five numbers Tony wants (compute these first)
Compute analytically for speed, then **validate items 3 and 4 (the force items) with the nonlinear field solver**, because saturation at the 77 µm gap and tooth tips will bend the linear answer.

1. **Mt** — mass (kg) of the translator (solid bar minus the slot volume on both faces; use SMC density; state the density used). *[Hand-check for calibration: ≈ 0.16 g with 26 slots/face at 7.4 g/cm³ — the model should reproduce and refine this.]*
2. **Wm** — the magnetic gap width (mm) between translator teeth and pole teeth. *[Expect ~77.5 µm from §3; confirm from geometry.]*
3. **Pm** — the NdFeB magnet thickness (length along the path) needed to produce a static detent force **Fd = 5·g·Mt N** (assume fully-magnetised NdFeB). *[With Mt≈0.16 g, Fd≈7.7 mN.]* Give the magnet operating point on its load line and the detent-force-vs-displacement curve that yields Fd at the aligned position.
4. **Ic** — with **Nc = 20 turns** and **Dc = 50 µm** wire, the current (A) in **one** coil needed to produce a **maximum axial force on the translator of 2·Fd N** (≈15.5 mN). Show force-vs-position over one tooth pitch and the peak.
5. **Lc, Rc, tr** — the inductance and resistance of each coil, and the **current rise time tr** when switched onto a **1 V** supply. (Rc from wire length/gauge; Lc from the magnetic circuit including the gap and any saturation; tr from L/R and the supply, noting the back-emf of motion is negligible over a step.)

Report each with the formula/method used and the assumptions, so Tony can reconcile with his own force modelling.

---

## 5. Requirements the actuator must meet (PHANTM boundary conditions — score pass/fail with numbers)
1. **Cross-section fits the cell.** Cells sit on a ~λ/2 grid: ~1.9 mm at 80 GHz (E-band), ~3.0 mm at 50 GHz, ~0.94 mm at 160 GHz. The translator is 1.55×1.55 mm but the **stator envelope** (two slot-sections held 1.704 mm apart + bridge + coil) is wider — compute the actual cross-section perpendicular to the beam and state whether one actuator fits behind a ~1.9 mm E-band cell. **This is expected to be tight/marginal — quantify it.**
2. **Stroke ≥ λ/2 at the lowest band** (~3.0 mm at 50 GHz). The 12.5 mm toothed translator gives ample stroke — confirm usable travel.
3. **Phase quantisation.** Step = 0.155 mm ⇒ ≈19° at 50 GHz, ≈30° at 80 GHz, ≈59° at 160 GHz (4πΔd/λ). Adequate (~4 bits) at E-band, coarse at the top of the band. Flag whether analog micro-positioning between detents is feasible/needed for 120–160 GHz.
4. **Zero-power hold with margin** = task 4.3; state the g-margin the Fd = 5·g·Mt detent gives against 10–30 g vibration/shock (note this holds the translator's own weight — confirm the moving reflector mass is included, or add it).
5. **Drive/step time ≤ a few ms**; **energy per step** and peak coil temperature negligible on average given passive hold.
6. **Cost ~USD 0.10** at volume (Section 7).
7. **Reliability** over 15 years outdoors — flag MTBF and the dominant failure mode (tooth wear, magnet demag, coil fatigue).

---

## 6. Physics method — where a field solver is mandatory
- **Magnetic circuit / magnetostatics:** NdFeB source(s) on load line + SMC reluctances + the two 77 µm working gaps + toothed overlap. Flux vs translator position x over one tooth pitch and vs coil current i.
- **Force by co-energy / virtual work:** F(x,i) = ∂W'(i,x)/∂x including the PM term. Two fidelities — a fast reluctance-network / permeance-vs-overlap model for sweeps, and **nonlinear finite-element magnetostatics for the truthful force**, because SMC pole tips saturate (~1–1.5 T) once PM+coil flux combine.
- **Detent (task 3) and drive (task 4)** both come from this: detent = zero-current force-vs-x from the PM; drive = force-vs-x with one coil energised.
- **Three-phase step dynamics:** couple F(x,i(t)) to the mechanical ODE (mass Mt + reflector, guide friction, PM-detent restoring stiffness) to get step time and settling — confirm ms-scale.
- **Coil electrical (task 5):** Rc from wire; Lc from the circuit (position/saturation-dependent — take an operating value); tr = f(Lc, Rc, 1 V).
- **Nonlinear materials:** real SMC B–H (saturation, permeability roll-off), eddy/hysteresis loss estimate, NdFeB temperature demag check.
- **Scaling / miniaturisation crux:** reluctance force ∝ pole-face area × (B²/2µ₀); B capped by saturation ⇒ force ∝ (scale)². Stroke (~mm) is fixed by wavelength and won't shrink; hold force is fixed by mass and g. So the sub-2 mm cell fights the force budget. **Quantify: at the E-band cross-section, is there enough force for both stepping and zero-power hold? If short, by how much, and what recovers it (higher-Br magnet, tighter gap, more teeth in overlap, tooth-geometry change, gearing, per-band designs)?** Make-or-break.

**Tooling:** nonlinear 2D magnetostatics via **FEMM** driven from Python (`pyFEMM`/`femm`) — native PM and nonlinear B–H, force via Maxwell stress tensor; sweep (x,i)→co-energy→force. Escalate to 3D (Elmer FEM) only if the inverted centre pole / finite depth / fringing prove material. Use **magpylib** for linear sanity only — never for the force headline. Validate the FE loop against a simple gapped C-core analytic limit before trusting it on this geometry.

---

## 7. Manufacture & cost to model (tightly coupled to the physics)
- **SMC choice & process:** pressed/sintered Somaloy-type (net-shape, cheap at volume, ~1–1.5 T saturation, low eddy loss) — feeds Section 6's saturation limit. Trade against silicon-steel laminations (higher B, hard to form this small).
- **Sub-mm tooth fabrication:** 0.232 mm-wide, 0.155–0.465 mm-deep slots to tight tolerance — direct pressing/sintering, micro-machining, wire-EDM, photochemical etch, or MIM. Tooth-pitch and gap tolerance is the yield driver.
- **Coil:** 20t of 50 µm enamelled copper in the offset coil window (check it fits the 0.263 mm clearance) vs planar/PCB alternatives.
- **NdFeB:** sintered vs bonded; insertion into the path; magnetise before/after assembly.
- **Assembly/tolerance stack-up:** the two 77 µm gaps and the 0.374 mm inter-pole registration are the critical tolerances — model their effect on force and on step (hence phase) accuracy.
- **Cost to ~USD 0.10:** bottom-up BOM (SMC + NdFeB + copper masses) + volume process cost; identify cost-dominant items and the volume needed.

---

## 8. Outputs
1. The five numbers (Section 4) with method and assumptions.
2. A parametric model returning holding force, drive-force curve, step size, stroke, power/step, step time, mass, cost from geometry + materials.
3. Requirements scorecard (Section 5) — pass/fail with numbers.
4. Force–displacement curves (detent and driven) + holding-force g-margin.
5. Sensitivity + tolerance analysis (expect gap, pole area, PM grade, saturation dominant).
6. Optimisation to meet Section 5 at minimum cost, or the closest point + shortfall.
7. The explicit "where the linear model breaks and FE is mandatory" statement with FE results for the baseline.
8. Plain-English verdict: can the actuator as specified meet PHANTM's needs, and if not the smallest change set that makes it work — reconciled against Tony's force modelling.

---

## 9. Open questions to put back to Tony
1. Is the "reflector" a face of the translator itself (so Mt is the full moving mass), or a separate attached mass to add to Mt for the hold/step budget?
2. Detent target Fd = 5·g·Mt is 5× the translator's own weight (~7.7 mN) — is that the intended spec, or should it hold against a specified external vibration/shock g-load?
3. Confirm the actuator orientation: translator long axis (12.5 mm) runs in the beam-depth direction, cross-section faces the cell — correct?
4. Peak operating temperature (for the NdFeB demag check) and the wire supply/driver voltage beyond the 1 V rise-time case.
