# HARDCODED_INVENTORY — Every numeric literal in the chain, categorised (2026-05-23)

For each archetype + emitter + cost-band, every hardcoded number is categorised:
- 🟢 **CORRECT (physics constant)** — universal physical truth (g=9.81, ρ_air=1.225, doSatMmolL=0.21, 5 kWh/Nm³ H2). Keep.
- 🟢 **CORRECT (industry default)** — calibrated industry baseline that doesn't vary with the brief (DoD=80%, inverter efficiency=98%, fill ratio=80%). Keep, label as `physics_constant` / `class_anchor`.
- 🟡 **FLAG (class anchor)** — embeds an assumption about a specific class variant (mammalian vs microbial, R290 vs R32) that the brief might contradict. Read but warn.
- 🔴 **BUG (should be brief-derived)** — value the brief carries (or should) but the code uses a hardcoded fallback. The fallback wins silently.

Evidence source: Seat A Q5 + Seat B Q3 + Seat D Cross-cuts 5,8.

## Engineering Contract archetypes (`scripts/lib/engineering-contract.ts`)

### BESS (`:415-612`)

| Quantity | Line | Value | Category |
|---|---|---|---|
| `dodFraction` | 454 | 0.80 | 🟢 industry default |
| `cellAh` | 458 | 280 | 🟡 CATL 280Ah class anchor — brief silently can't pick NMC/SSB |
| `cellVoltageV` | 459 | 3.2 | 🟡 LFP chemistry anchor |
| `cellMassKg` | 462 | 5.3 | 🟡 280Ah cell anchor |
| `eolMargin` | (in calc) | 1.025 | 🟢 industry default |
| **`continuousKw`** | **467** | **1000** | 🔴 **BUG — scale-determining**, brief might say "200 kW BESS"; silently overridden |
| **`peakKw`** | **468** | **1250** | 🔴 **BUG — scale-determining** |
| **`dcBusVoltage`** | **470** | **800** | 🔴 **BUG — brief might say "1500 V DC bus"** |
| `inverterEfficiency` | 474 | 0.98 | 🟢 industry default |
| `thermalRejectionMargin` | (in calc) | 1.5 | 🟢 industry default |

### Bioreactor (`:1823-2075`)

| Quantity | Line | Value | Category |
|---|---|---|---|
| `fillRatio` | 1868 | 0.80 | 🟢 industry default |
| `aspectRatioHD` | 1872 | 2.0 | 🟢 industry default |
| `vesselMassKg / totalVolumeL` | 1876 | 4 kg/L | 🟢 industry default (316L jacketed sanitary) |
| `agitationPowerPerLW` | 1879 | 5 W/L | 🟡 mammalian anchor — microbial culture takes 10+ W/L |
| `otrMmolLH` | 1882 | 40 | 🟡 class anchor (varies 30-50) |
| `doSaturationMmolL` | 1884 | 0.21 | 🟢 physics constant (1 mM O₂ at 25°C, 1 atm air) |
| `doSetpointFraction` | 1885 | 0.30 | 🟢 industry default |
| `vvm` | 1886 | 0.75 | 🟡 class anchor |
| `microbialHeat W/L` | 1893 | 0.005 | 🟢 industry default |
| `agitatorDissipation` | 1894 | 0.40 | 🟢 industry default |
| **`tempControlMinC`** | **1899** | **20** | 🔴 **BUG — marked source=brief but reads no brief field; always defaults** |
| **`tempControlMaxC`** | **1900** | **45** | 🔴 **BUG — same as above** |

### Heat pump residential (`:1068-1314`)

| Quantity | Line | Value | Category |
|---|---|---|---|
| `lineVoltageV` | (in calc) | 230 | 🟢 UK/EU residential mains |
| **`evapSatC`** | **1141** | **-12** | 🔴 **BUG — A2/W35 rating point hardcoded regardless of brief's stated operating envelope. Cold-climate brief: -25°C ambient needs evap <-12°C; the Contract is wrong from line 1** |
| **`condSatC`** | **1142** | **50** | 🔴 **BUG — same** |
| `pressureRatio` | 1144 | 3.8 | 🟢 R290 thermo |
| `0.15 kg/kW refrigerant charge` | (calc) | 0.15 | 🟢 industry default |
| `1.5 kW thermal cap per kg R290` | (calc) | 1.5 | 🟢 Annex CC limit |
| `3 cm³/kW compressor displacement` | (calc) | 3 | 🟢 industry default |
| `0.5 m²/kW outdoor HX` | (calc) | 0.5 | 🟢 industry default |
| `0.1 m²/kW indoor HX` | (calc) | 0.1 | 🟢 industry default |
| `0.02 fan power fraction` | (calc) | 0.02 | 🟢 industry default |
| `25 kg/kW total mass` | (calc) | 25 | 🟢 industry default |
| `sound = 50 + log2(kW)×3` | (calc) | — | 🟢 industry curve |
| `copRated` | (calc default) | 3.8 | 🟡 class anchor |
| `scop` | (calc default) | 4.5 | 🟡 class anchor |
| **`minAmbientC` — reads brief but WRONG KEY** | **1138** | **brief.constraints.min_ambient_c.value (DOES NOT EXIST IN SCHEMA — schema is operating_environment.temp_min_c) → always defaults -20** | 🔴 **BUG — brief operating envelope ALWAYS DISCARDED for heat pump** |
| **`maxAmbientC` — same wrong-key bug** | **1139** | **brief.constraints.max_ambient_c.value (DOES NOT EXIST) → always defaults 35** | 🔴 **BUG — same** |

### Wind turbine (`:2813-2834`) — MINIMAL STUB

| Quantity | Line | Value | Category |
|---|---|---|---|
| `ratedKw` fallback | 2816 | 2000 | 🔴 **BUG — fallthrough-to-assume-kW**: any non-MW unit silently → kW |
| `rotorDiameter` formula | 2818 | `sqrt(ratedKw) × 1.5` | 🟢 rule of thumb |
| `cutIn` | 2820 | 3.0 m/s | 🟡 IEC 61400-1 class anchor; tagged source: 'physics_constant' but cannot be overridden if brief gives site wind regime |
| `rated` | 2821 | 11.5 m/s | 🟡 same |
| `cutOut` | 2822 | 25.0 m/s | 🟡 same |
| **`macro_assembly_prices`** | — | **[] (empty via `buildMinimalContract`)** | 🔴 **CRITICAL — no cost anchors, no topology, no closures. Contract is essentially INERT for wind. Generator hallucinates** |

### Drone (`:1325-1554`)

| Quantity | Line | Value | Category |
|---|---|---|---|
| `gravityMs2` | (in calc) | 9.81 | 🟢 physics constant |
| `airDensityKgM3` | 1357 | 1.225 | 🟢 sea-level standard atmosphere |
| `figureOfMerit` | 1360 | 0.7 | 🟢 industry default |
| `etaPropulsion` | 1372 | 0.55 | 🟢 industry default |
| `usableBatteryFraction` | 1374 | 0.80 | 🟢 industry default |
| `airframe = mtow × 0.25` | 1389 | 0.25 | 🟢 CF airframe fraction |
| `motorMassKgEach` | 1382 | 0.08 | 🟡 prosumer anchor |
| `escMassKgEach` | 1383 | 0.04 | 🟡 prosumer anchor |
| `flightControllerKg` | 1384 | 0.05 | 🟡 prosumer anchor |
| **`rotorDiameterM`** | **1354** | **0.20 m (8-inch prosumer prop)** | 🔴 **BUG — for any drone >5 kg (agri, heavy-lift) needs 30+ inch props; cascades wrong hover power → battery → MTOW** |

### Solid State Battery (`:3633-3655`)

| Quantity | Line | Value | Category |
|---|---|---|---|
| `cell_capacity_ah` | 3658 | mis-tagged `family: 'energy'` | 🔴 **BUG — Ah is CHARGE not energy. Unit-family taxonomy violation; defeats `class-price-bands`-style family checks downstream** |

### The 7 archetypes with unsafe fallthrough-to-assume-unit (Seat A Q4)

These read `target_performance.value` and assume an unspecified unit silently:

| Archetype | Line | Pattern |
|---|---|---|
| solar_inverter | 2796 | `u === 'mw' ? ... : u === 'w' ? ... : Number(tp.value ?? 50)` — non-MW/non-W silently becomes kW |
| wind_turbine | 2816 | `u === 'mw' ? × 1000 : Number(tp.value ?? 2000)` — non-MW silently kW |
| ups_inverter | 2899 | `u === 'kva' ? × 0.9 : u === 'mw' ? × 1000 : Number(tp.value ?? 100)` — non-kVA/non-MW silently kW |
| cnc_machine | 2935 | `u === 'w' ? / 1000 : Number(tp.value ?? 15)` — rpm/mm·min silently kW |
| e_bike | 2953 | `u === 'kw' ? × 1000 : Number(tp.value ?? 250)` — silent fall through |
| pemfc | 3670 | `u === 'mw' ? × 1000 : Number(tp.value ?? 100)` — silent fall through |
| smr | 3690 | `u === 'mwt' / 'mw' / 'gw' : Number(tp.value ?? 50)` — % enrichment silently MWt |

Plus `dac` at line 3730 has partial unit checks but unknown unit returns raw value.

## Per-class Emitters (`scripts/lib/orchestrator/emitters/*.ts`)

Every emitter uses `q(c, key, FALLBACK)` to read contract.quantities, falling back to FALLBACK if absent. The FALLBACK is the bug-window. Selected scale-determining FALLBACKS from Seat B Q3:

### `bioreactor.ts` (18 calls)

| Line | q call | Fallback | Category |
|---|---|---|---|
| 111 | `q(c, 'working_volume_l', 1000)` | 1000 L | 🔴 **BUG — scale-determining**. Every bioreactor renders as 1,000 L if contract empty |
| 112 | `q(c, 'fill_ratio', 0.80)` | 0.80 | 🟢 |
| 113-128 | mostly derived | — | 🟢 OK |

### `h2-electrolyser.ts` (11 calls + 1 anti-pattern)

| Line | q call | Fallback | Category |
|---|---|---|---|
| 74 | `Math.max(100, q(contract, 'rated_power_kw', 1000))` | 1000 kW | 🔴 **BUG — scale-determining**. Default 1 MW regardless of brief's "5 MW" or "20 MW" |
| 82 | `membrane_active_area_m2` | 10 | 🔴 **BUG — should derive from cell_count + cell area, hardcoded only valid for ~1 MW** |
| 83 | `total_pt_loading_kg` | 1.2 | 🔴 **BUG — scales with active area** |
| **143** | **`q({ quantities: {} } as any, 'rectifier_efficiency_pct', 97)`** | 97 | 🔴 **CRITICAL anti-pattern: empty quantities object passed, so 97 is the only possible value. Paste-error; defeats the q() pattern** |

### `wind-turbine.ts` (13 calls)

| Line | q call | Fallback | Category |
|---|---|---|---|
| 82 | `Math.max(1, q(contract, 'rated_power_kw', 50))` | **50 kW** | 🔴 **BUG — scale-determining**. Default is "small" tier; offshore 8 MW brief reads as 50 kW if contract empty |
| 85-89 | wind speeds + Betz | 3 / 11.5 / 25 / 0.45 / 6.5 | 🟢 IEC anchors |
| 95 | `q(contract, 'generator_type', 1)` | 1 | 🟡 PMSG by convention; type-determining without docs |

### `vertical_farm.ts` (36 calls — most scale-determining of any emitter)

| Line | q call | Fallback | Category |
|---|---|---|---|
| 254 | `trolley_count` | 8 | 🔴 **BUG — scale-determining** |
| 255 | `tiers_per_trolley` | 5 | 🟡 standard 5-tier |
| 257 | `led_installed_power_kw` | 12 | 🔴 **BUG — 12 kW ≈ 24-30 m² canopy; brief might want 200 m²** |
| 280 | `annual_yield_kg` | 25,000 | 🔴 **BUG — the HEADLINE for the entire VF PDF** |
| 289 | `total_electrical_kw` | 30 | 🔴 **BUG — scale-determining** |
| 290 | `supply_kw_available` | nested q chain to 44 | 🔴 **BUG — nested q chain risks double-fallback** |
| 292 | `total_system_mass_kg` | 18,000 | 🔴 **BUG — scale-determining; ISO container mass cap is 30,480 kg** |
| 294 | `recommended_container_count` | 1 | 🔴 **BUG — scale-determining relative to mass overflow** |

VF has at least **6 critical scale-determining hardcoded fallbacks**.

## Cost-stack table (`src/lib/pdf-engine-v2/class-cost-structure.ts`)

The cost cascade ratios (labour, overhead, margin, channel markup, install) are **per-class constants**, not brief-derived. Schema at `:194+`. Used by Stage 47 G2 cost-reality + Stage 48 cover-page render.

| Field | Source | Notes |
|---|---|---|
| `assembly_labour_factor` | per-class literal | OK — industry calibrated |
| `factory_overhead_factor` | per-class literal | OK |
| `margin_factor` | per-class literal | OK |
| `channel_markup_factor` | per-class literal | OK |
| `installation_cost_factor` | per-class literal | 🔴 **CRITICAL** — default archetype (`ARCH_MID_VOLUME_PROFESSIONAL`) at `:599` uses 0.20 installation. A 6 MW wind turbine needs 50-70% civils install. Wrong by ~3× |

## Price bands (`src/lib/pdf-engine-v2/class-price-bands.ts`) — 37 entries

| Entry | Has band? |
|---|---|
| bess | ✓ (line 282-283: £190-550/kWh) |
| heatpump | ✓ |
| vertical_farm | ✓ |
| haps | ✓ |
| drone, auv, bioreactor, cgm, edge_ai, ev_charger | ✓ |
| **wind_turbine** | ❌ **MISSING** — zero matches per Seat C Q6 |
| solar_inverter | ❌ MISSING (likely) |
| ups_inverter | ❌ MISSING |
| h2_electrolyser | ❌ MISSING |
| pemfc, smr, dac, ssb, evtol, quantum_computer, cryostat, fso, phased_array, humanoid, all satellites, propulsion_thruster, ground_station, ventilator, dialysis_machine, cnc_machine, e_bike, 3d_printer_fdm | ❌ MOST MISSING |

When a band is missing, `resolvePriceBand` falls through to `null` → G2 band check skipped → cover-page badge null → cost-stack defaults to mid-volume professional (`:599`). For wind: 6 MW × £28k raw BoM × 1.7 cost-stack ratio = ~£42k installed ASP. User saw £73k after today's macro-append; industry £4-7M.

## LLM temperature (Cross-cut 16)

No central source. 10+ call sites use different temperatures:

| File:line | Temperature |
|---|---|
| `serial-design-chain-v2.tsx:331` | 0 |
| `serial-design-chain-v2.tsx:1225` | 0 |
| `serial-design-chain-v2.tsx:1391` | 0.1 |
| `serial-design-chain-v2.tsx:1480` | 0.1 |
| `serial-design-chain-v2.tsx:2354` | `i === 0 ? 0.2 : 0.4 + i * 0.1` (diversity scan) |
| `scripts/lib/illustration-i2i.ts:110` | `opts.temperature ?? 0.4` |
| `src/lib/pdf-engine-v2/brief-rl-iterate.ts:227` | default 0.3 |
| `src/lib/pdf-engine-v2/pure-search-feasibility-test.ts:124` | 0.1 |
| `src/lib/pdf-engine-v2/feasibility-rl-iterate.ts:262` | default 0.3 |
| `src/lib/pdf-engine-v2/decompose-rl-iterate.ts:264` | default 0.3 |
| `src/lib/pdf-engine-v2/stage-rl-iterate.ts:741` | 0.3 |
| `src/lib/pdf-engine-v2/stage-rl-council.ts:74` | 0.3 |
| `src/lib/pdf-engine-v2/council-scorer.ts:535` | 0 (greedy) |

`SCORER-AUDIT.md:204-226` flags non-zero judge temperature as a B3 bug: "scoring the same output twice will produce different scores".

## Hardcoded values that ARE correct (don't touch)

Per the user's "shipping container max mass" example — these MUST stay hardcoded:

- Physics constants: `g=9.81`, `ρ_air=1.225`, `doSatMmolL=0.21`, Faraday/Avogadro etc.
- IEC 60038 voltage tier boundaries (50V, 1000V, 66kV, 230kV)
- ISO container max mass (30,480 kg HC40, 24,000 kg 20ft)
- IEC 61400-1 wind-class anchors (3.0 / 11.5 / 25.0 m/s)
- Industry-typical efficiencies (98% inverter, 95% transformer, ~5 kWh/Nm³ H2 PEM stack)
- DoD anchors (80% Li-ion BESS, 30% DoD lead-acid)
- Cell-chemistry voltage anchors (3.2 V LFP, 3.65 V NMC, 3.7 V Na-ion)
- 80% fill ratio bioreactor stirred-tank
- 2:1 aspect ratio bioreactor H:D

## Summary

**🔴 BUG count: 18+ scale-determining hardcoded values** across engineering-contract.ts + emitters.

**🔴 RED cross-cuts:**
- BESS: 3 (continuous_power, peak_power, dc_bus_voltage)
- Bioreactor: 2 (temp_control_min/max, mislabelled source)
- Heat pump: 2 (wrong-key bug for ambient temps) + 2 (evap/cond saturation hardcoded)
- Drone: 1 (rotor diameter)
- SSB: 1 (cell_capacity_ah mis-tagged family)
- Wind turbine: 1 + ALL contract empty (minimal stub)
- 23 of 35 archetypes use `buildMinimalContract` (empty macros/topology/closures)
- **7 archetypes have unsafe fallthrough-to-assume-unit** (solar/wind/ups/cnc/e_bike/pemfc/smr)
- **6 critical emitter scale-fallbacks** in VF + 4 in wind/h2/bioreactor
- Wind turbine has **NO price band** (60-90× cost shortfall root cause)
- h2-electrolyser:143 anti-pattern (empty contract literal)
- Default `ARCH_MID_VOLUME_PROFESSIONAL` install ratio 0.20 (wrong for wind/utility scale)
- LLM temperature scatter across 13+ sites
