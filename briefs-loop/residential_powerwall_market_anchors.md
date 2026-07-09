# Market Anchors — Tesla Powerwall 3 (Public Specs & Drawings)

**Purpose:** Competitive design targets and self-check table for the residential Powerwall-class experiment.  
**Legal:** Public Tesla Energy Library / installer datasheets only. **Not** Tesla IP, firmware, pack internals, or trademarks for manufacture. Use as **market-anchor performance and envelope** only.  
**Primary product under design:** see [`residential_powerwall_clone.md`](./residential_powerwall_clone.md).

---

## Canonical public sources (read these first)

| Doc | URL | Use for |
|-----|-----|---------|
| **UK / EN datasheet** | https://energylibrary.tesla.com/docs/Public/EnergyStorage/Powerwall/3/Datasheet/en-uk/Powerwall-3-Datasheet-EN.pdf | Electrical, PV, env, compliance (G98/G99) |
| **AU datasheet** (50 Hz, useful energy footnotes) | https://energylibrary.tesla.com/docs/Public/EnergyStorage/Powerwall/3/Datasheet/en-au/Powerwall-3-Datasheet-AU-EN.pdf | Total vs usable energy wording |
| **US datasheet** (60 Hz split-phase — do **not** copy grid type) | https://energylibrary.tesla.com/docs/Public/EnergyStorage/Powerwall/3/Datasheet/en-us/Powerwall-3-Datasheet.pdf | Mechanical envelope cross-check only |
| **Install manual (Backup Gateway 2)** | https://energylibrary.tesla.com/docs/Public/EnergyStorage/Powerwall/3/InstallManual/BackupGateway/2/en-us/index.html | Clearances, bracket, conduit, system topology drawings |
| **Wall-mount step (bracket geometry)** | https://energylibrary.tesla.com/docs/Public/EnergyStorage/Powerwall/3/InstallManual/BackupGateway/2/en-us/GUID-8B14B798-BDCE-434C-8E3E-A313FC00C2C1.html | Mounting heights, cleats, conduit knockouts |
| **UK reseller mirror (Segen)** | https://portal.segen.co.uk/reseller/docs/Powerwall_3_Datasheet_UK_en-US.pdf | Offline UK numbers if Energy Library is slow |

Installer PDF mirrors (same content family): McKercher / Segen “Powerwall 3 with Backup Gateway 2 Installation Manual”.

---

## Performance envelope (UK / 50 Hz — design to these)

Values below are the **public Powerwall 3 UK-class anchors**. Our clone brief matches them unless a row says “design-derived”.

| Parameter | Public Powerwall 3 (UK) | Clone brief target | Self-check |
|-----------|------------------------:|-------------------:|------------|
| Usable / nominal battery energy (AC) | **13.5 kWh** | 13.5 kWh | Exec + compliance `usable_energy_kwh` |
| Total battery energy (some regional sheets) | **~14 kWh** AC (AU footnote) | ~14.0 kWh nameplate | Do not equate usable = nameplate |
| Continuous AC power (max config @ 230 V) | **11.04 kW** | 11.04 kW | Electrical + Sense-check |
| Max continuous current | **48 A** | 48 A | Panel / OCPD story |
| Configurable power steps | 3.68 / 5 / 6 / 7 / 8 / 9 / 10 / 11.04 kW | Design for **max** 11.04; note software derate | G99 if >3.68 kW export/generation |
| OCPD at 11.04 kW | **63 A** | State matching breaker | Electrical tab |
| Max continuous charge (master only) | **5 kW** AC/DC class | ≤5 kW charge unless expansions | Do not claim 11 kW charge |
| Max continuous charge (with ≤3 expansions) | **8 kW** | Narrative only (baseline = master) | Expansion path |
| Load start / LRA | **185 A LRA** | 185 A LRA surge claim | PCS surge rating honest |
| Max output fault current (1 s) | **160 A** | State in design | Protection narrative |
| SCCR | **10 kA** | 10 kA | With gateway context |
| Round-trip (solar→battery→home/grid) | **89%** | ≥89% | Efficiency row |
| Solar→home/grid (PV pass-through) | **97.5%** | ≥97% class | Optional secondary metric |
| PV STC input | **20 kW** | 20 kW | `pv_stc_input_kw` |
| MPPTs | **3** | 3 | Hybrid inverter topology |
| PV DC input range | **60–550 V** | Same class | Emitter / PCS |
| MPPT operating window | **60–480 V** | Same class | |
| Max Imp / Isc per MPPT | **26 A / 30 A** (UK sheets; some regions 30/38) | Prefer UK 26/30 | Do not invent 40 A strings |
| PV withstand | **600 V DC** | 600 V | |
| Grid | **230 V 1φ, 50 Hz** | Same | **Never** US 120/240 split-phase |
| Islanding companion | **Backup Gateway 2** | Companion interface (not inside master BoM by default) | Topology drawing |
| Power scalability | Up to **4** masters | Document path | Baseline BoM = 1 |
| Energy scalability | Up to **3** expansion packs / master | Document path | Baseline BoM = 1 |
| Warranty (market) | **10 years** (internet-dependent terms) | State design-life / warranty assumption | Not Tesla warranty copy |

### UK grid-code note (important)

Public UK datasheets list **G98** and **G99** (and G100). At **11.04 kW / 48 A**, a real UK install is typically a **G99** application (G98 is the ≤3.68 kW / 16 A notification path). The clone brief should:

- Design the **hardware** for up to 11.04 kW continuous.
- State that **export / registered capacity** may be software-limited and DNO-approved (G99).
- Not pretend a full 11.04 kW unit is “G98-only” without the configurable lower steps.

---

## Mechanical / drawing anchors

| Parameter | Public Powerwall 3 | Clone must show |
|-----------|-------------------:|-----------------|
| Master envelope (H×W×D) | **1105 × 609 × 193 mm** (includes glass front cover) | Wall cabinet GA within ~same class |
| Master mass | **130 kg** (UK); US installed stack ~132 kg with cover+bracket | ~130 kg |
| Expansion envelope | **1105 × 609 × 168 mm** | Optional; not baseline BoM |
| Expansion mass | **110 kg** unit / ~118.5 kg wall-mounted with cover+bracket | Narrative |
| Backup Gateway 2 | **584 × 380 × 127 mm**, **11.4 kg** | Companion product on SLD / install GA |
| Mounting | Floor or wall; wall bracket required when wall-mounted | Bracket / cleat concept on GA |
| Orientation | Vertical only — not horizontal / upside down | Drawing note |

### Minimum clearances (from install manual Figure 5 — design check)

Use these as **drawing / install GA** acceptance criteria (not Tesla artwork):

| Clearance | Minimum |
|-----------|--------:|
| Left side | **100 mm** |
| Right side | **100 mm** |
| Above | **50 mm** |
| Below | **20 mm** |
| Between side-by-side units | **100 mm** |
| In front (service / airflow) | **300 mm** |

Rear and lower-front vents must stay clear. Prefer shaded / not direct sun (installer caution). Flood-aware siting.

### Bracket / switch height cues (install manual)

If On/Off must stay below ~2 m (6 ft 7 in):

- Lower bracket segment centre &lt; **1429 mm** from floor  
- Upper bracket segment centre &lt; **1905 mm** from floor  

Fasteners only in the **four horizontal** bracket slots (not the vertical centre segment).

---

## Environmental anchors

| Parameter | Public Powerwall 3 |
|-----------|-------------------|
| Operating ambient | **−20 °C to +50 °C** (performance may derate above **~40 °C**) |
| Humidity | Up to **100%** RH, condensing |
| Max elevation | **2000–3000 m** (sheet-dependent; use ≤2000 m UK conservative) |
| Enclosure rating | **IP55** overall |
| Battery & power electronics | **IP67** |
| Wiring compartment | **IP55** |
| Noise @ 1 m | **&lt;50 dB(A)** typical, **&lt;62 dB(A)** max |
| Indoor / outdoor | Both rated |

---

## Compliance citations seen on UK public sheets (cite families, don’t invent Tesla cert IDs)

Use as **jurisdiction-appropriate** checklist for the clone (UK/EU):

- IEC 62109-1 / 62109-2, IEC 62477-1  
- IEC 62933-5-2, IEC 62619  
- UL 9540A (unit-level fire test criteria — widely cited even outside US)  
- UN 38.3  
- EN 50549-1 / EN 50549-10  
- **G98**, **G99**, **G100** (UK)  
- EMC / RED as applicable  

Do **not** paste Tesla model numbers (`1707000-xx-y`) into the clone BoM.

---

## What drawings the dossier should produce (vs Tesla manuals)

Tesla publishes **install / clearance / bracket / gateway wiring** drawings — not a full competitive BoM GA. Our chain should still emit:

1. **Wall-cabinet GA** — envelope ≈ 1105×609×193 mm, mass ~130 kg, clearances above  
2. **Single-line diagram** — PV DC (3× MPPT) → hybrid PCS → home/grid; companion backup gateway interface  
3. **Panel / protection schedule** — 48 A continuous / 63 A OCPD class at max rating  
4. **Thermal concept** — outdoor −20…+50 °C, derate note above 40 °C, noise class  

**Fail the drawing self-check if** the set shows a 20 ft ISO container, MV transformer, or three-phase utility switchgear as the primary product.

---

## Sense-check / scorecard attack list (for Fable after a run)

Compare dossier claims to this table. Flag as defect if:

1. Continuous power ≠ **11.04 kW** (or unexplained software derate)  
2. Usable energy ≠ **13.5 kWh** or silently swapped with nameplate  
3. Envelope far from **1105×609×193 mm** / **~130 kg**  
4. PV story missing **3 MPPTs** or **20 kW STC**  
5. Grid is split-phase 120/240 or 1500 V container DC bus  
6. Charge power claimed as **11 kW** (public max charge is **5 kW** master / **8 kW** with expansions)  
7. Clearances ignored on install GA  
8. Cost band looks like utility BESS £/kWh, not residential wall ESS  

---

## Price context (market, not Tesla MSRP commitment)

UK retail / installer listings for Powerwall 3 + gateway often land roughly **£7.5k–£9k+** product-only (varies by package). Clone brief ceiling **£8,500 ex-works** for the master all-in-one is intentionally in that competitive band — use for cost-sanity, not as a Tesla quote.
