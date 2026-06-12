# Space-Sector Archetype + First-Principles Tool-Family Roadmap

**Compiled:** 2026-06-10 from 8 parallel Haiku researchers across Tristan's ~30 space-outreach technology categories (~150 companies). Companion to `UNIVERSAL-ENGINEERING-AND-BLENDER-BUILD-PLAN.md`. This is the grounded answer to **D1 ("add whatever tools first principles demand — could be 500").**

---

## 0. The core finding

Every one of these archetypes is governed by **known first-principles physics** (rocket equation, optical link budget, radar equation, Stefan-Boltzmann, Friis, Tsiolkovsky, Child-Langmuir, Hill-Clohessy-Wiltshire…). None needs an LLM to "decide" the physics. That means the right architecture is exactly the build plan's spine: **a library of deterministic first-principles physics tools + a universal composer that selects them by physical feature** — NOT 50 hand-wired classes.

**Scale answer:** the space sector alone implies **~75 new first-principles tool families** (≈150–200 concrete tools). Added to the existing 238, your "maybe 500 tools" instinct is correct — and it should keep growing per the self-generating-DB principle. The point is they are **composable physics modules**, so building one (e.g. "optical link budget") serves every archetype that has a `transmits_optical_link` feature — laser-comms terminal, optical ground station, SLR station, QKD downlink — at once.

---

## 1. STRATEGIC SCOPE BOUNDARY (read this first)

Not everything in the list is a fit for a **deterministic-physics hardware** engine. The software researcher was explicit and it matters:

| Class of company | Has a physical bill-of-materials? | Engine fit |
|---|---|---|
| **Physics-first hardware** (launchers, thrusters, satellites, payloads, antennas, RTGs, structures, sensors, capsules, HAPS, ocean robots) | ✅ Yes | **In scope — the engine's core.** ~45 archetypes. |
| **Onboard-AI / edge-compute payloads** (AIKO, Craft Prospect, Ubotica) | ⚠️ Partial — real hardware, but the binding constraint is power/thermal/latency co-design, not mechanical | **In scope with a new gate suite** — and notably **thermally-driven, like compute_heat.** |
| **EO data-analytics, mission-ops, imagery marketplaces** (Earth Blox, Kayrros, Leanspace, SkyFi) | ❌ No — pure software + data | **Out of scope for the physics engine.** A "dossier" here is a compute/data-architecture + unit-economics doc, not an engineering spec. ~3 archetype families. |

**Decision (Tristan, 2026-06-10): software/data is OUT of scope — this is a physics-first engine, full stop.** The engine targets the ~45 hardware archetypes + the edge-compute-payload class. For the pure software/data companies, decline — do not pretend the physics gates apply; tell those prospects honestly it is not a fit. No "separate data-platform mode" is planned.

---

## 2. Archetype universe (the ~45 hardware archetypes, 8 families)

1. **Launch & reusable vehicles (6):** expendable 2-stage liquid micro-launcher · reusable booster + expendable upper · hybrid (turbopump-free) micro-launcher · aerospike high-Isp engine · reusable hypersonic spaceplane · stratospheric balloon-launch (rockoon).
2. **In-space propulsion (7):** Hall-effect thruster · gridded-ion / electrospray · FEEP (liquid-metal) · pulsed-plasma / MPD · green chemical (hypergolic/catalytic) · air-breathing EP (VLEO) · solar sail.
3. **Earth-observation payloads (5):** thermal-IR imaging satellite (cooled detector) · folded/unfolding IR telescope · SAR satellite + deployable antenna · hyperspectral imager · high-res optical pushbroom imager.
4. **Comms / RF / antennas (6):** free-space optical laser-comms terminal · optical ground station (adaptive optics) · flat-panel/phased-array steerable antenna · RF MEMS beamsteering antenna · NB-IoT/L-band comms payload + constellation · passive RF-SIGINT geolocation payload.
5. **SSA / ISAM / logistics (6):** ground optical/radar surveillance station · satellite-laser-ranging station · space-traffic-management (conjunction) · debris-removal / servicing spacecraft (proximity ops + robotic arm) · in-space refuelling depot · orbital transfer vehicle.
6. **Microgravity & manufacturing (3):** returnable microgravity-manufacturing satellite + re-entry capsule · microgravity lab module · in-space materials furnace/bioreactor.
7. **Satellite platforms (3):** CubeSat bus (1U-6U) · small-satellite bus (50-500 kg) · RF/comms payload module.
8. **Power, structures, materials, sensors, environment (9):** space-based solar power satellite · deployable solar array · radioisotope thermoelectric generator (RTG) · deployable composite boom/antenna · smart thermal radiator · inertial measurement unit (gyro/accelerometer) · precision GNSS antenna · stratospheric HAPS balloon · autonomous ocean surface robot.
- **Quantum (4, cross-cutting):** chip-scale QKD module · quantum RNG · cold-atom quantum sensor (PNT/gravity) · trapped-ion quantum computer.

---

## 3. First-principles tool-family roadmap (the D1 build list)

Each is a deterministic physics module: governing equation in, sized quantities + worked-calc steps out. Built **family-applicable** (keyed on a physical feature), never class-gated. Grouped by domain; ~75 families.

### Propulsion — chemical (≈8)
staged-combustion cycle balance · turbopump + NPSH/cavitation margin · nozzle expansion & C_F (incl. **aerospike external-flow**) · **hybrid fuel-grain regression** (r˙ = a·G_ox^n) + combustion stability (Kn) · hypergolic/green decomposition kinetics (c* = f(T_c,γ)) · monopropellant catalyst bed · cold-gas/resistojet · injector mixing.

### Propulsion — electric (≈7)
**Hall-thruster scaling** (Isp ∝ √V_d) · gridded-ion Child-Langmuir (J ∝ V^{3/2}/d²) · **electrospray / Taylor-cone** (space-charge-limited) · FEEP liquid-metal field emission · pulsed-plasma / MPD Lorentz (F = ∫J×B) · **air-breathing EP** intake (free-molecular capture) + helicon ionisation · solar-sail radiation pressure (F = 2·A·ρ·L/c).

### Orbital mechanics & GNC (≈8)
ΔV budget / Tsiolkovsky · Hohmann & plane-change transfer planner · station-keeping & drag-decay (atmospheric density model) · **rendezvous / proximity ops (Hill-Clohessy-Wiltshire)** · **conjunction / collision-probability (Pc)** · constellation coverage (Walker geometry) · deorbit / re-entry targeting · ADCS momentum / reaction-wheel + CMG sizing.

### Aero, re-entry & atmospheric (≈7)
ascent-trajectory optimiser (max-Q, pitch program) · hypersonic aero database (DATCOM-class) · **re-entry aerothermodynamics (Lees-Fay stagnation heating)** · TPS recession / ablation (ablative + inflatable) · balloon buoyancy & float-altitude (US-76 atmosphere) · parachute / descent terminal velocity · marine hydrodynamics (ocean robots: drag + sail force).

### Optics & photonics (≈8)
**optical link budget** (P_rx = P_tx + G − path loss − L_atm) · diffraction-limited **GSD / MTF** (GSD = λ·H/D) · atmospheric turbulence (**Fried r₀**, adaptive optics) · radiometry / **NEDT** · **IR-detector cryocooler sizing** · **SAR radar equation** (range/azimuth resolution, antenna gain) · hyperspectral SNR / spectral binning · telescope / folded-optics layout.

### RF & antennas (≈7)
**RF link budget (Friis)** · antenna gain/aperture/beamwidth · **phased-array factor & beamsteering** (element spacing, grating lobes) · RF cascade noise figure (Friis cascade) · constellation RF coverage / access time · **SIGINT geolocation (TDOA/FDOA Cramér-Rao)** · GNSS antenna phase-centre / multipath.

### Thermal & power — space (≈8)
multi-junction solar array + eclipse cycle · battery depth-of-discharge sizing · **RTG decay-heat + thermoelectric (Seebeck, ZT)** + shielding · **space-solar microwave / rectenna** efficiency · radiator (Stefan-Boltzmann) incl. **graphene emissivity-switched** · heat-pipe / loop-heat-pipe · cryocooler (for IR + ion-trap) · **edge-compute heat rejection in vacuum** (ties to compute_heat).

### Structures & materials (≈6)
deployable boom/antenna stiffness + deployment kinematics · composite layup / **tow-steering (RTS) feasibility** · reflector surface-accuracy / RMS error (< λ/20) · launch vibration / quasi-static FEA · pressure-vessel hoop stress (tanks, depots) · gossamer/membrane dynamics (sails, large arrays).

### Quantum (≈4)
QKD secret-key-rate (SPDC source, QBER) · QRNG entropy / min-entropy · cold-atom MOT + atom-interferometer sensitivity (σ_g ≈ ℏ/(m·k_eff·T²)) · ion-trap (Paul-trap secular freq + cryo/vacuum + gate fidelity).

### Sensing & navigation (≈4)
IMU / Coriolis-vibratory-gyro + accelerometer bias · sun sensor / star tracker accuracy · debris-impact acoustic inverse model · retroreflector / SLR link budget.

### Microgravity, robotics & edge-compute (≈6)
convection-suppression / crystal-growth (Rayleigh number → 0) · furnace directional-solidification thermal gradient · bioreactor mass/thermal · robotic-arm dynamics + contact/capture loads (τ = Iα) · **edge-compute SWaP sizing** (model FLOPs → space-qualified hardware) · latency-vs-accuracy-vs-power Pareto.

**Estimated new families: ~75 → ~150-200 concrete tools.** With the existing 238, the catalogue heads toward **~400-450**, and continues self-generating per the growing-DB principle. Your 500 estimate is the right order of magnitude.

---

## 4. Recommended validation archetypes (D4) — a deliberate spread

Prove the universal spine on a set that stresses *different* physics, none yet hand-wired:
1. **Green chemical satellite thruster** (propulsion + combustion + ΔV) — well-documented, public specs (Dawn Aerospace).
2. **SAR Earth-observation satellite** (RF + radar equation + deployable antenna + power/thermal) — a hard multi-domain payload (ICEYE-class).
3. **Deployable composite antenna / boom** (structures + deployment kinematics) — pure mechanical, contrasts with the others.
4. **Onboard-AI edge-compute payload** (power + thermal + latency) — **thermally-driven like compute_heat**, and the bridge between your venture and the space sector (AIKO / Craft Prospect class).

If all four reach a ≥9 engineering section + a faithful Blender render **without hand-wiring their classes**, the universality claim is proven. compute_heat remains the worst-case forcing function.

---

## 5. How this feeds the build plan

- These tool families are built in **Phase 1-3** (grounding → feature-applicability → universal sizing). Each new tool declares its `output_keys` (so grounding works) and a physical-feature `applicable` predicate (so the composer selects it for any matching archetype).
- The **sizing families** (D2) expand from 6 to cover these domains: propulsion, orbital-mechanics, optics/RF, thermal/power, structures, aero/re-entry — call it **~10 families**, not 6, given the space breadth.
- The **edge-compute payload** archetype needs the new gate suite the software researcher identified (power-thermal co-design, latency-accuracy Pareto, certification-cost) — and reuses the existing thermal gates.
- **Blender (Phase 5):** these archetypes (a thruster, a folded telescope, a SAR antenna, a capsule) are exactly why the **universal component-type → geometry compiler** is needed — no one can hand-author 45 Blender templates. The compiler renders them from the Part 1 component tree + real dimensions.

*Full per-archetype specs (form factors, governing equations, real numbers, sources) are in the 8 researcher reports — synthesised here; raw detail recoverable from the session transcript if needed.*
