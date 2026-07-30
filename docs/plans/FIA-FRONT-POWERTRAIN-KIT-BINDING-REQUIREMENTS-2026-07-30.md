# Binding requirements for the Formula E front powertrain kit

**Date:** 2026-07-30  
**Twin:** `out/formula-e-front-mgu-20260729-1432`  
**Standing rule:** Magnetics, rotor dynamics, structural analysis, fluid flow, gear strength, computer-aided design, and Blender pictures exist to **fulfil these requirements**. They are not a separate science project. If a calculation does not help prove or size against a row below, it is optional colour.

**Release honesty:** `ship_ok = false` until race evidence exists. Public rule citations in this repo are **not** a stamped Fédération Internationale de l’Automobile (FIA) homologation pack (`regs_on_disk = false`).

---

## What the kit must do (championship / public)

These are the hard duty constraints ForgeOS is allowed to treat as championship-facing:

| Requirement | Binding number | Why it matters |
|---|---:|---|
| Front axle regenerative braking electrical power | **≤ 250 kW** | The front kit’s primary race job under Gen3 / Gen3 Evo rules |
| Continuous design duty used for sizing | **250 kW** electrical | Frozen as the kit design duty (Decision Register DEC-002) |
| Rear / car context (not this kit’s free budget) | rear regen ≤ 350 kW; total regen ≤ 600 kW | Keeps front work inside the car power split |
| Net usable energy accounting | **E_net = E_discharge − 0.93 × E_regen** | Championship energy meter; lap CSV still OPEN (DEC-007) |
| Car maximum voltage (except phase conductors) | **≤ 1000 V** | Electrical insulation and connector class |
| Gen3 Evo front traction windows | limited; tool profile ≤ 250 kW front traction | Do not size as a free all-wheel-drive tractor |

Sources: `briefs-loop/formula_e_front_mgu.md`, `scripts/ingest/class-reference-seeds/formula_e_front_mgu.json`, `scripts/lib/orchestrator/tools/python/fia_power_regen_split.py`, Decision Register DEC-002.

---

## Packaging box the kit must fit (press-derived hard envelope)

The FIA / Spark car gives a **bay the unit must live in**. Public press numbers are treated as the hard box until a team Interface Control Document replaces them:

| Envelope item | Number |
|---|---:|
| Width × depth × height | **343 × 259 × 267 mm** |
| Dry mass aspiration / cap | **~32 kg** |
| Peak rotor speed (press; FIA class ~20,000) | **~19,500 rpm** |
| Hardware power *class* (capability, not race software cap) | **~350 kW** |

Shape follows the bay. Do not invent a larger free-form silhouette.

---

## Team-assumed seeds (replace with signed team data)

| Item | Current seed | Status |
|---|---:|---|
| Direct-current bus window | 600–900 V (design 750 V) | Assumed |
| Coolant inlet / flow | 60 °C, 12 L/min | Assumed manufacturer perimeter |
| Coolant temperature rise (lump) | ≤ 25 K | Class consistency |
| Winding / magnet temperature limits | 180 °C / 150 °C | Assumed |
| Gear ratio | 8.0 trial | Assumed (DEC-003) |
| Chassis port / mount coordinates | unknown | **OPEN** — needs FIA or team interface document |

---

## How every workstream must serve these rows

| Workstream | Must answer |
|---|---|
| Magnetic finite-element solve (Pyleecan + xfemm) | Can the machine deliver the **250 kW front regen duty** (and limited traction windows) inside voltage, current, temperature and demagnetisation limits? |
| Rotor dynamics (ROSS) | Are critical speeds clear of the **19,500 rpm** operating band with margin? |
| Structural finite-element (CalculiX) | Do rotor retention, case, mounts and joints survive that speed and torque reaction inside the **32 kg / bay** box? |
| Fluid flow (OpenFOAM) | Do jacket and cold-plate channels reject losses at **12 L/min / 60 °C** inlet without boiling or choking the package? |
| Gear strength | Does the reduction + differential transmit the reconciled shaft/wheel torque for that duty without tooth failure? |
| Parametric CAD + Blender | Does geometry still **fit the bay**, hit mass, and expose the interfaces the car needs — while matching the same revision the solvers used? |

Pretty pictures and generic motor science that ignore the 250 kW / bay / mass / speed / interface rows are out of scope.

---

## Still OPEN (cannot be closed by software alone)

- Hardware-in-the-loop on the populated board  
- Supplier circuit-board manufacturing data  
- Dynamometer correlation of torque, efficiency and thermal maps  
- Cold-plate / jacket flow-bench correlation  
- FIA or team **port and mount coordinates**  
- Signed energy / lap duty authority (DEC-007)  

Solvers may prepare evidence packages; they do not mint homologation.

---

## Twin check (live concept numbers)

As of the 2026-07-30 twin stamp: continuous / front regen cap **250 kW**, hardware class **350 kW**, bay **343×259×267**, mass cap **32 kg**, rotor **19,500 rpm**, bus **750 V**, coolant **60 °C / 12 L/min**, power-split tool feasible. Interface XYZ still null. `ship_ok` remains false.
