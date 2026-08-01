# Email draft — Jack / JLR (show the physics engine → then five precise asks)

**To:** Jack (JLR Formula E technology)  
**From:** Tristan / Fractional Forge  
**Subject:** We built a first-principles front powertrain kit in Anvil — FEMM, OpenFOAM, CalculiX, ISO 6336, and CAD from the same millimetres

**Attachments / links to send with the email**
- **Fill-in workbook (primary ask vehicle):** `out/formula-e-front-mgu-20260729-1432/JLR-FE-FRONT-FPK-ASSUMPTIONS-FOR-JACK.xlsx` — yellow cells = Jack confirms/replaces; Asks sheet for attachments  
- 2–3 Blender stills (hero + ghost / cutaway + exterior) — geometry driven by the solvers below, not “artist CAD”  
- One-pager: `docs/plans/JLR-FE-FRONT-FPK-ASSUMPTION-BASED-RESULTS-FOR-JACK-2026-07-31.md`  
- Optional: engineering `dossier.xlsx` + Bar B readiness table  

---

Hi Jack,

I wanted to show you something we have actually **run**, not a mood board.

We put **Anvil** (our design engine) on a Formula E–class **front powertrain kit** — motor + SiC inverter + reduction + differential — and drove it from **first-principles physics** into a full concept pack: numbers, thermal network, gear screens, FEA, CFD pressure drops, and Blender geometry that shares the **same millimetres** as the solvers.

Where public Gen3 data stopped, we **froze named assumptions** and kept going so you can see a closed kit story. This is **not** a homologated or dyno-correlated race release (`ship_ok` stays false until real benches). It **is** the kind of pack you can open, attack, and overwrite with your ICD.

---

### What we built (and how — the exciting bit)

**One geometry spine.** Rotor bore, stator OD, planetary nest, cold-plate footprint, and housing envelope are not separate PowerPoint numbers. Packaging, EM, gears, cooling, and the Blender cassette all read the **same quantities**. Cutaways are **physics-linked morphology under assumptions** — useful for review, not a claim that every solid is CAD-family authentic or that screens have cleared.

**Electromagnetics — FEMM (finite-element magnetics)**  
- Duty locked to public front regen: **250 kW** at **19,500 rpm** ⇒ required shaft torque ≈ **122–125 N·m** from T = P/ω (hard arithmetic, not a marketing curve).  
- Loaded FEMM point: peak torque estimate ≈ **207 N·m** at best rotor position; **mean** over the position sweep ≈ **119 N·m** (`torque_reliable=false` — we refuse to pretend a single angle is a dyno map).  
- Peak air-gap flux on the loaded point ~**1.4 T**; phase current peak ~**757 A**; parallel paths and winding factor carried through the machine geometry.  
- Demag screen at elevated magnet temperature (screening map, not a release magnetics sign-off).

**Heat — losses → thermal network → jacket & cold plate (OpenFOAM + analytical)**  
This is the part that usually stays hand-wavy. We closed a loop:

1. **Loss split** from the EM/inverter model: copper ≈ **2.18 kW**, iron ≈ **0.14 kW**, inverter dissipation ≈ **4.3 kW**.  
2. **Lumped thermal network** (winding ↔ magnet ↔ module ↔ coolant) with explicit thermal resistances — so winding and module temperatures are *consequences* of those losses, not painted numbers.  
3. **Hydraulic network** at the frozen loop seed (**60 °C** inlet, **12 L/min**): jacket Δp ≈ **18 kPa**, cold-plate Δp ≈ **25 kPa**, total ≈ **43 kPa** against a **150 kPa** pump budget.  
4. **OpenFOAM** channel cases on the **water jacket** and **inverter cold plate** (same CAD-family geometry the Blender “heat box” / cold-plate story uses) — CFD pressure drops feeding the network, not a random Δp guess.  
5. Screening temperatures under that stack: windings / magnets in the ~**90 °C** band on the analytical screen; module higher (~**110 °C** class) — all **assumption-bound**, labelled as screens, not heater-plate / flow-bench correlation.

So when the dossier talks about the stator winding and the coolant jacket, it is because the **copper loss heated the winding node** and the **jacket CFD paid the pressure** — not because someone wrote “liquid cooled” on a slide.

**Gears — ISO 6336 + bevel screen (with independent check hooks)**  
- Planetary nest sized to live **inside** the hollow rotor (ID **130.5** / OD **197.1** mm).  
- Contact / bending screening floors: planetary contact FoS ≈ **1.21**, bending ≈ **1.82**; bevel nest contact FoS ≈ **1.22** (screening floors, not a released KISSsoft sign-off — though we keep the independent-check path honest).  
- Carrier / ring reaction torques tracked from the shaft duty (~**125 N·m** motor → ~**1 kN·m** class carrier).  
- Gear-oil cornering screen still **fails** under the frozen oil assumption — we leave that red on purpose so nobody greenwashes lubrication.

**Structure & rotor dynamics**  
- **CalculiX** rotor centrifugal **screening** FoS ≈ **3.44** vs assumed steel yield at 19.5k (screening mesh — not an instrumented overspeed / retention test).  
- **Magnet-pocket** CalculiX screen on the same rotor family.  
- **Ross**-class critical-speed screen: first critical ≈ **28.2k rpm** vs **19.5k** operating (modal/dyno correlation still open).

**Inverter packaging**  
- SiC half-bridge class volume, ESL seed, loss model, and cold-plate footprint tied into the same cassette — generic automotive SiC physics, **not** a claimed Lucid/Marelli MPN.

**Why the images matter**  
Blender / Excel cutaways are **downstream of that stack**. Stator ring, hollow rotor bore, planetary nest, diff, PE bricks, jacket and cold-plate channels are placed from the same millimetre contracts the solvers used. We are not pasting a gold product silhouette and inventing internals afterward.

---

### What that means in one sentence

You get a **closed, attackable front-kit concept**: public envelope + frozen guesses → FEMM + thermal/hydraulic network + OpenFOAM jacket/cold-plate + CalculiX rotor + ISO 6336 gears + Ross critical speed → CAD and dossier that **cannot disagree with themselves** on the millimetres.

**What it is not:** homologated. No HIL, no dyno map, no chassis XYZ, no race Gerbers. `ship_ok` stays false until those exist.

---

### Educated guesses we already made (overwrite these)

We scavenged everything safe and public first (FIA / FE press, Lucid Gen3 FPK unveil, Gen4 FPK ITT shopping list). That closed the **class envelope**. It does **not** close *your* car.

| We froze | Value | Public source | Still a guess because… |
|---|---|---|---|
| Front regen duty | **250 kW** | FIA / FE Gen3 | Your season energy-tool authority |
| Bay + dry mass | **343 × 259 × 267 mm**, ~**32 kg** | Lucid / press | Survival-cell mount volume for *your* integration |
| Max rotor speed | **19,500 rpm** | Lucid public | Overspeed policy / used speed |
| DC bus seed | **750 V** (600–900 window) | Common FE HV practice | Your HV ICD |
| Coolant seed | **60 °C**, **12 L/min** | Class cooling seed | Your fluid / flow / ΔT / Δp budget |
| Overall ratio | **8.0** | Packaging / torque-map seed | Vehicle model final ratio |
| SiC class | 3× half-bridge; ~**4.3 kW** loss; ESL ~**6.4 nH** | Topology + analytical | **Not** the race module MPN |
| Interfaces | Connector **types** only | FIA tender lists *what* must be specified | **XYZ / CAD / pinout** are NDA |

**Public vs not:** bay / mass / rpm / 250 kW — yes, used. Chassis mount XYZ, race SiC MPN, Gerbers, lap CSV, dyno/HIL — **not** on the open web. That is what we are asking for.

---

### Five precise asks (so the next Anvil pass is *your* kit)

1. **Interface ICD** — STEP/2D with **XYZ** for HV DC, coolant in/out, LV/CAN, halfshaft flanges, mount ears.  
2. **Power module identity** — manufacturer + **MPN** + datasheet (+ STEP if you have it).  
3. **Coolant loop** — fluid, inlet T, design flow, allowable Δp/ΔT (if not 60 °C / 12 L/min).  
4. **Ratio + speed authority** — confirm/replace **8.0** and **19,500 rpm** (plus overspeed target).  
5. **Any measured fragment** — dyno / HIL / flow-bench / heater-plate / double-pulse on a comparable front-kit revision.

Attached is a spreadsheet — **Assumptions (fill)** and **Asks (fill)** — with our frozen values in grey and **yellow blank columns for you**. Tick CONFIRM / REPLACE / UNKNOWN per row (or drop STEP / datasheet links on the Asks sheet). A 30-minute call to walk that sheet is enough for us to re-stamp the pack on your numbers.

Happy to send the solver artefacts and the latest physics-linked cutaways ahead of a meeting — I think you will find the winding → heat-box → jacket chain the most fun part to tear apart.

Best,  
Tristan

---

## Short Slack / Teams version

We ran a FE front-kit **concept** end-to-end in Anvil from first principles: **FEMM** (250 kW @ 19.5k → ~125 N·m duty; peak ~207 / mean ~119 N·m, `torque_reliable=false`), **loss-driven thermal network** (Cu ~2.2 kW + inv ~4.3 kW → winding/module screens), **OpenFOAM** jacket + cold-plate Δp (~43 kPa total @ 12 L/min), **CalculiX** rotor FoS~3.4, **ISO 6336** planetary/bevel screens ~1.2, **Ross** first critical ~28k rpm — Blender/Excel geometry on the **same millimetres**.  
**ship_ok=false · NOT_HOMOLOGATED.**  
Need from you to make it *yours*: ICD XYZ, SiC MPN, coolant loop, ratio/speed, any bench scrap.

---

## Appendix — internet scavenger note (internal; optional attach)

**Already ingested into Anvil assumptions from public sources**
- Gen3 front regen **250 kW**; total regen context **600 kW** (FIA / FE press)
- Lucid Gen3 FPK unveil: **~32 kg**, **~19,500 rpm**, package **~259×343×266 mm**, regen-focused front unit
- FIA Gen4 FPK ITT (legal.fia.com): tender mass targets, cooling/electrical interface *obligations*, and the document set that goes to **registered manufacturers** (CAD, efficiency/loss maps, LV pinout, CAN dbc, etc.) — **not** the files themselves
- Marelli named as next-gen front powertrain supplier (FE.com) — still no public module BOM

**Solver / method stack (this twin)**
| Domain | Tool / method | Twin artefact (examples) |
|---|---|---|
| Magnetics | **FEMM** FE + analytical duty T=P/ω | `em_fia_front_kit_case.json`, demag / MTPA / torque-map screens |
| Thermal | Lumped network from Cu/Fe/inv losses | `analytical_fia_cooling_thermal_screen.json` |
| Hydraulics | Branch network + pump budget | `analytical_fia_cooling_network_screen.json` |
| CFD | **OpenFOAM** jacket + cold plate | `openfoam_fia_water_jacket_case.json`, `openfoam_fia_cold_plate_case.json` |
| Rotor FEA | **CalculiX** centrifugal / magnet pocket | `calculix_fia_rotor_screen.json`, `calculix_fia_magnet_pocket_screen.json` |
| Gears | **ISO 6336** + bevel screen | `iso6336_fia_front_kit_case.json`, `iso_bevel_fia_front_kit_case.json` |
| Dynamics | **Ross**-class critical speed | `ross_fia_front_kit_case.json` |
| Morphology | Parametric Blender from same mm | design-pack renders / cutaways |

**Deliberately not scraped / not invented**
- Chassis survival-cell ICD coordinates  
- Race SiC MPN / Gerbers  
- Team energy CSV / dyno / HIL  

Generic Infineon / onsemi / Wolfspeed SiC datasheets are useful for **class physics**, not for claiming “this is the part in the FPK.”
