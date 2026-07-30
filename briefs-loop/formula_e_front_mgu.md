# Formula E Gen3 / Gen3 Evo Front Powertrain Kit (FPK) — Demo Brief

**Product class (Anvil):** `formula_e_front_mgu` — the deliverable is the **spec front MGU + inverter + single-speed reduction + differential** as one unit (Front Powertrain Kit / FPK). This is **not** the rear manufacturer MGU, not a full race car, and not a road-car EDU paste.

**Demo role:** This class is the **JLR / Formula E demo artefact** to zip. The rear class (`formula_e_rear_mgu`) remains a process artefact.

---

## Form follows the front-axle bay (load-bearing)

The shape of this system is **not free**. It is forced by the **available packaging volume where the FPK must live on the front axle** of the Spark Gen3 / Gen3 Evo car:

- Wishbone / upright / steering clearance
- Crash structure and nose box behind
- Halfshaft exit height and track
- Cooling / HV / LV routing corridors to the front of the car
- Ground clearance and aero floor above

**Morphology rule:** size and silhouette are set by that **front-axle bay envelope** first; internal motor / inverter / gear volumes then pack into that bay. Lucid/Atieva gold imagery is a **TRAINING CHECK** that a bay-constrained unitised pack looks like real race hardware — never a mesh paste of proprietary CAD.

Public press envelope (Lucid IR / media; inch→mm checked):

| Axis | Press (in) | mm | Role in bay |
|---|---:|---:|---|
| A | 10.2 | **259** | Compact axis in bay |
| B | 13.5 | **343** | Lateral / track-related span |
| C | 10.5 | **267** | Vertical / package height (press often rounded 266) |

Treat `max_dimensions_mm` as the **homologated front bay box the unit must fit**. Do not invent a larger free-form silhouette.

---

## System description

- One front MGU (primarily generating on Gen3; Gen3 Evo adds limited AWD traction windows), liquid-cooled PMSM class
- Integrated SiC inverter / MCU in the same unitised housing
- Single-speed reduction + differential; halfshaft exits toward the front wheels
- Spec / common kit for all teams (Lucid / Atieva supplier lineage) — not manufacturer-free like the rear
- Cooling, HV DC, and control interfaces face the corridors available in the front bay

---

## Key constraints (public Gen3 / Gen3 Evo + press)

Fact-checked 2026-07-29 via OpenRouter (Kimi K3 + GLM 5.2 + SOL) against public FIA / Formula E / Lucid press. Caveats retained.

| Constraint | Value | Provenance / note |
|---|---|---|
| Supplier | Lucid / Atieva FPK | CONFIRM — Gen3 front powertrain tender / Lucid IR |
| Unit dry mass (press) | **~32 kg** | CONFIRM press; boundary of fluids/harness unclear |
| Bay envelope | **259 × 343 × 267 mm** | CONFIRM inch conversion; press-derived |
| Peak motor speed (press) | **~19,500 rpm** | Press-repeat; FIA allows up to ~20,000 rpm class |
| Front regen (Gen3) | **≤ 250 kW** electrical | CONFIRM — pairs with ≤350 kW rear → ≤600 kW total regen |
| Hardware power class (press) | **~350 kW** cited | Press / density PR (14.7 hp/kg @ 32 kg); clarify electrical vs mechanical in tools |
| Gen3 front role | Regen / energy recovery | CONFIRM — no traction |
| Gen3 Evo front role | Regen + limited AWD traction windows | CONFIRM — starts / Attack Mode / qualifying duels (split kW not always public) |
| Public STEP/CAD | **None** | CONFIRM — gold = sealed-unit press photography |
| Road-car Lucid Tech Talk / patents | Physics training only | CONFIRM — cooling/winding principles, not FE mesh |

### Brief metrics (exact keys for compliance)

| key_metric | value | unit |
|---|---:|---|
| `front_regen_electrical_cap_kw` | 250 | kW |
| `front_hardware_power_class_kw` | 350 | kW |
| `max_rotor_speed_rpm` | 19500 | rpm |
| `fpk_mass_cap_kg` | 32 | kg |
| `front_bay_envelope_w_mm` | 343 | mm |
| `front_bay_envelope_d_mm` | 259 | mm |
| `front_bay_envelope_h_mm` | 267 | mm |
| `assumed_vdc_min_v` | 600 | V |
| `assumed_vdc_max_v` | 900 | V |
| `assumed_coolant_inlet_c` | 60 | °C |
| `winding_temp_limit_c` | 180 | °C |
| `magnet_temp_limit_c` | 150 | °C |

### Envelope (hard packaging)

```
max_dimensions_mm:
  width:  343   # lateral — halfshaft / track axis class
  depth:  259   # fore-aft in bay
  height: 267   # vertical package
max_mass_kg: 32
```

Orientation note for twin: treat **width as car-lateral** (shaft exits ±X) so exterior cameras see barrel + unitised brick faces, consistent with bay packing.

---

## Morphology / FFF (universal, bay-first)

1. **Bay box wins** — every exterior volume must fit inside `max_dimensions_mm`; no apron larger than the bay.
2. **Concentric integrated stack** (public FE FPK packaging grammar — Lucid/Atieva press = TRAINING CHECK, never CAD paste):
   - **L1 MCU/SiC** — bolts to flat upper shelf; solid phase busbars pierce into stator (no long HV AC cables).
   - **L2 Stator** — outer cylindrical ring; wave-wound copper class; end-winding microjet oil cooling for extreme regen.
   - **L3 Hollow rotor** — PM barrel nested in stator ID; bore hosts the transmission.
   - **L4 Planetary + mini-diff** — inside the rotor cavity; torque out to ±X axle sockets.
3. **Unitised sealed exterior** — one cassette silhouette; reduction/diff are *inside* the rotor, not a separate side box.
4. **Shaft ends** — halfshaft exits define lateral width and case splits.
5. **Service faces** — coolant bosses + HV/LV on faces that reach front-bay corridors.
6. **Gold check** — Lucid sealed-unit press photos / anatomy write-ups: if function + bay + concentric stack are right, morphology should look *very similar*; never STEP/mesh paste.
7. **PCB / windings / planetary guts** — cutaway / ghost only on sealed exterior views.

---

## Out of scope

- Rear manufacturer MGU/MCU (see `formula_e_rear_mgu`)
- Full car, battery, chassis crash structure detail
- Copying Lucid proprietary CAD or road Air EDU silhouette as a paste target
- Separate "sources → search → formulas" demo report — result is better images in the design-pack zip
