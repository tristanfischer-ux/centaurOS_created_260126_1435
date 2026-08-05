# Handover — multiphysics capability: what we can actually run, and please run it

**Written 2026-08-05 by Claude Code (Terminal) for Grok Build.**
**Twin:** `out/formula-e-front-mgu-20260729-1432/` · branch `oxccu-efuel`
**Ask from Tristan:** *"go through all of the different types of analysis which we can do, the
software which we should be using, and ask it to actually run those tasks so we can actually see
what it is that is available."*

`ship_ok` stays false. None of this closes Bar A. This is capability discovery, not a ship push.

---

## 1. Why this exists

The engine has a strong electromagnetic story — FEMM magnetostatics, a 37-point rotor sweep, a
measured 122.1 N·m at the DEC-009 geometry, a voltage-feasibility screen. It has **almost no
thermal or structural story that anyone can see**, and Tristan has asked what a proper design
office would run alongside the EM.

The short answer is that **most of the tooling is already installed and unused**. That is the
finding worth acting on. What follows is the verified inventory and a set of concrete runs.

---

## 2. Verified tool inventory (checked 2026-08-05, not assumed)

| Tool | How it is reached | State |
|---|---|---|
| **FEMM** | `scripts/phantm/bin/femmcli` | ✅ in use for magnetics |
| **FEMM heat-flow solver** | **same binary** — FEMM ships steady-state conduction alongside magnetostatics | ✅ available, **never used** |
| **CalculiX** | **installed natively, twice, both arm64 and working** — `/Applications/FreeCAD.app/Contents/Resources/bin/ccx` and `/opt/homebrew/Cellar/micromamba/2.5.0_3/bin/ccx`. Neither is on PATH, so `shutil.which("ccx")` at `calculix_fia_rotor_screen.py:464` returns None and the code takes the **Docker** fallback | ✅ available — **put one on PATH and R4 needs no Docker at all** |
| **ParaView** | `/opt/homebrew/bin/paraview` | ✅ installed, **never used** |
| **PyVista** | `.venv`, **0.48.4, installed 2026-08-05** | ✅ headless verified (`pv.OFF_SCREEN=True`) |
| **VTK / meshio** | `.venv` — vtk 9.6.2, meshio 5.3.5 | ✅ meshio reads CalculiX `.frd` → VTK |
| **gmsh** | `/opt/homebrew/bin/gmsh` | ✅ installed, unused |
| **CoolProp / ht / fluids / thermo** | `.venv` | ✅ used in the LPTN |
| **pyleecan** | `.venv` 1.5.2 — has a thermal module | ◐ partly used |
| **OpenFOAM** | — | ❌ not installed |
| **ROSS** (rotordynamics) | — | ❌ not installed (pip) |
| **Elmer FEM** | — | ❌ not installed |

**Do not install Elmer.** It is the "correct" coupled EM+thermal+structural answer, and it
duplicates capability we already have. This repo's most expensive recurring defect is two
implementations of one rule; adding a second multiphysics stack would be that, at scale.

---

## 3. What we already know, so you don't re-derive it

From `_motor_stack/stator_iron_loss_from_lamination.json` and the contract:

```
tooth_loss_w   2249.4      tooth_mass_kg  2.9595    tooth_flux_t  1.799
yoke_loss_w    3785.7      yoke_mass_kg   3.6623    yoke_flux_t   2.104
iron_loss_w    6035.1      copper_loss_w  2180.49   magnet eddy   610 (8 segments)
M400-50A density 7650 kg/m3      coolant inlet 60 C      flow 12 L/min
magnet 99.4 C    winding 86.82 C (basis: tool:motor:thermal-lumped_pre_dec009_campaign)
```

⭐ **The yoke is the dominant heat source per unit volume, not the teeth:**

```
yoke   3785.7 W / (3.6623/7650) m3  =  7.91 MW/m3   at 2.10 T
teeth  2249.4 W / (2.9595/7650) m3  =  5.81 MW/m3   at 1.80 T
```

That inverts the usual intuition and it matters: the yoke sits against the cooling jacket, the
teeth sit behind the slot liner. If the thermal solve disagrees with this ordering, something is
wrong with the solve, not with the intuition.

A heat-**source** map is already rendered at
`scratchpad/heat-source-map.png` (PyVista, cutaway, coloured by MW/m³). It is **not** a
temperature field and says so on the image.

---

## 4. The analyses — what each answers, and its honest limits

### A. Thermal conduction → temperature FIELD  *(highest value, lowest cost)*
**Answers:** how hot is each part of the machine, not just the four LPTN nodes.
**Tool:** FEMM heat-flow solver, same `femmcli` binary.
**Inputs:** the regional loss densities above as volumetric sources; coolant jacket as a
convective boundary; slot-liner resistance between winding and iron.
**Limit to state:** 2-D planar with stack as depth — the same limitation the EM solves carry.
Axial gradients are NOT resolved. End-winding is not in the plane.

### B. Thermal stress  *(the "what does the heat do to it" question)*
**Answers:** stress caused by differential thermal expansion, on top of centrifugal.
**Tool:** CalculiX `*COUPLED TEMPERATURE-DISPLACEMENT` (via Docker).
**Inputs:** the temperature field from A, plus the existing rotor geometry and material cards.
**Limit:** the existing rotor screen is centrifugal-only at 24,000 rpm (FoS 2.635 recorded).
Thermal stress ADDS to that; do not report either in isolation.

### C. Material comparison  *(the "which material is weaker" question)*
**Answers:** how stress and loss change with lamination grade / magnet grade / housing alloy.
**Tool:** parametric sweep of B with different material cards. `machine_lamination.py` already
derives kh/ke from a grade designation — reuse it, do not hardcode coefficients.
**Limit:** a sweep is only as good as the material data. If a grade's properties are not in the
corpus, the row is a GAP, not an estimate.

### D. Cooling-system visualisation  *(the "show me the heat being removed" question)*
**Answers:** where heat leaves, and how much.
**Tool:** PyVista over the temperature field from A plus the jacket geometry; heat flux vectors.
**Limit:** without OpenFOAM this is conduction-to-a-boundary-condition, NOT conjugate heat
transfer. The jacket HTC remains the assumed `iron_to_jacket_k_per_w = 0.0077` screening
constant, which Bar B already flags as needing a flow bench. **Say so on the figure.**

### E. Rotordynamics *(optional, not asked for)*
ROSS is a pip install. Critical speeds at 24,000 rpm are a real question but nobody has asked it.
Do not start this without Tristan.

---

## 5. The runs — please do these, in this order

**R1 — prove the FEMM heat solver works at all.** Smallest possible case, a known analytic answer
(e.g. conduction through a slab or annulus with a fixed source and a fixed boundary). Report the
solved vs analytic value. **This is the Path A of thermal** — do not trust any machine result
until a case with a known answer reproduces.

**R2 — temperature field on the FE front stator.** Regional sources from §3, jacket boundary,
slot-liner resistance. Compare the resulting winding and magnet node temperatures against the
LPTN's 86.82 / 99.4. **Disagreement is the interesting result** — the LPTN is two nodes and this
is a field; if they agree closely, ask whether the field solve is really resolving anything.

**R3 — render R2 with PyVista.** Cutaway, temperature colourmap, node values annotated. The
figure must state on its face: the solver, the operating point, what boundary condition was
assumed, and that stack-axial gradients are not resolved.

**R4 — thermal stress.** Feed R2 into CalculiX coupled thermal-displacement. Report von Mises with
and without the thermal term so the contribution is visible. **You do not need Docker** — put
`/Applications/FreeCAD.app/Contents/Resources/bin` (or the micromamba one) on PATH and the native
arm64 `ccx` is used directly. Both were verified to run on 2026-08-05.

> ⚠️ **CORRECTION to the first version of this pack, and it is an instance of the discipline in §6.**
> I originally wrote "CalculiX is NOT on PATH — falls back to Docker". Literally true and
> misleading: it implied CalculiX was unavailable. It is installed twice, natively, both arm64,
> both working. `which ccx` returning nothing is a PATH problem, not an availability problem —
> the same "verified the surface, reported it as the substance" error that produced the claim
> that the Excel had no audit layer when it has ~11,200 lines of one. Check what a negative
> result actually means before reporting it.

**R5 — one material swap.** M400-50A vs one alternative grade, through `machine_lamination.py`.
Report loss, temperature and stress deltas together — the point is that they trade against each
other, not that one number moves.

**R6 — a capability index.** One page listing every analysis this engine can now run, the tool,
the last time it ran, and its honest limit. Tristan's actual question was "what is available" and
that page is the answer to it.

---

## 6. Discipline that applies to all of it

These are not optional and each has been paid for at least once in this campaign:

1. **A source map is not a solved field.** Label every figure with what it is. The heat-source
   render in §3 says "NOT a solved temperature field" on the image itself, not in a caption that
   can be separated from it.
2. **Do not invent an input to complete a picture.** Copper's 2180.49 W is missing from the source
   map because the slot volume is not on the twin and a fill factor would have to be assumed. That
   absence is correct. Fill it only if you can derive it, and say where from.
3. **A missing region is a GAP, not a zero.** The rotor shows zero heat because rotor iron loss was
   never resolved separately — the render should say so rather than implying the rotor is cold.
4. **Run the known-answer case first** (R1). This is the single lesson from yesterday: I produced
   three wrong diagnoses of a strange torque result before checking the geometry I had just written.
   Your own Path A/Path B protocol is the model here and it is why R1 exists.
5. **State every assumed boundary condition on the artefact.** The jacket HTC is assumed. The
   0.0077 K/W is a screening constant, not a measurement.
6. **`ship_ok` stays false. Bar A stays open.** Nothing here is homologation evidence.

---

## 7. What NOT to do

- Do not install Elmer or a second multiphysics stack (see §2).
- Do not re-run the EM campaign — Path B at 122.1 N·m is settled and is your own work.
- Do not touch `mgu_winding_temp_c` — your restamp to 86.82 with basis
  `tool:motor:thermal-lumped_pre_dec009_campaign` is the right handling and better than my
  blanking it. If R2 produces a DEC-009-era winding temperature, that supersedes it — with a
  named basis, not silently.
- Do not close any Bar B hold. The flow bench is still required regardless of what R2 shows.

---

## 8. What I would consider success

Not a green dossier. A one-page answer to "what can this engine actually analyse", where every
row is either **ran, here is the figure** or **cannot run, here is what is missing** — and nothing
in between. If R1 fails, that is a result worth having and worth reporting as such.

Terminal is hands-off the twin. Ping in `docs/plans/CURSOR-HARNESS-INBOX.md`.
