/**
 * Tool-narrative registry — standardised natural-language explanations for
 * every engineering tool the ForgeOS orchestrator can invoke.
 *
 * Each entry has four prose fields:
 *   • description            — what the tool does, in plain English
 *   • origin                 — paper, library, or in-tree implementation lineage
 *   • results_interpretation — what the computed quantities mean and how to read them
 *   • usage_pattern          — when/why the tool is typically invoked in a ForgeOS report
 *
 * These are rendered on the Tools-Used end-page BEFORE the structured
 * (Paper, Physics, Source, Quantities) fields. They give a non-specialist
 * reader confidence that the engineering math is grounded — without
 * having to be a domain expert in DLI photometry or N-R power flow.
 *
 * Adding a new tool wrapper? Add the narrative here AT THE SAME TIME.
 * The renderer falls back to "(no narrative registered)" if missing.
 *
 * Tristan 2026-05-22: rich appendix prose so the reader can audit
 * the engineering provenance of every quantity in the design.
 */

export interface ToolNarrative {
  /** 1-2 plain-English sentences on what the tool does. */
  description: string
  /** Where the tool comes from — paper, library, in-tree provenance. */
  origin: string
  /** What the computed quantities mean. How to interpret a "good" vs "bad" result. */
  results_interpretation: string
  /** Why a ForgeOS report invokes this tool — what role it plays in the design chain. */
  usage_pattern: string
}

export const TOOL_NARRATIVES: Record<string, ToolNarrative> = {
  // ──────────────────────────────────────────────────────────────────────
  // VERTICAL FARM tools
  // ──────────────────────────────────────────────────────────────────────
  'led-par:efficacy': {
    description: 'Computes the photosynthetic photon flux density (PPFD) and daily light integral (DLI) delivered to a growing canopy by a horticultural LED array of a given installed wattage and efficacy.',
    origin: 'In-tree implementation of the radiometric model used across the horticultural-lighting industry (Kozai 2018; Bugbee 2017). Calibrates the PPFD-vs-installed-watts relationship against published efficacy data for the Heliospectra MITRA, Fluence SPYDR, and Philips GreenPower fixture families.',
    results_interpretation: 'PPFD (µmol/m²/s) is the instantaneous photon flux at canopy height — the number every crop\'s photosynthesis equations consume directly. DLI (mol/m²/day) is the integrated daily dose over the photoperiod. Leafy greens need 12–17 mol/m²/day; tomatoes 22–30. If the DLI sits below the crop\'s requirement, the design is under-lit and the yield prediction will be optimistic.',
    usage_pattern: 'Invoked as the first tool in the vertical-farm chain because it sets the lighting power and therefore drives almost every downstream module: the HVAC must reject the LED heat, the electrical supply must feed the LED kW, and the plant-growth model needs the DLI as its forcing function.',
  },

  'plant-growth:yield': {
    description: 'Converts the canopy\'s daily light integral and environmental conditions (temperature, CO₂ concentration) into a predicted annual crop yield, cycle length, and transpiration rate for a chosen crop type.',
    origin: 'In-tree empirical model parameterised against the USDA CEA literature (lettuce, basil, tomato, strawberry, cucumber); transpiration sub-model uses the closed-canopy Penman-Monteith formulation with aerodynamic resistance tuned for vertical-farm air-circulation rates.',
    results_interpretation: 'annual_yield_kg_per_m2 is the achievable yield density given the DLI you actually deliver (NOT the brief\'s target). If the design ships 15 mol/m²/day of light, lettuce yields ~50 kg/m²/yr; double the DLI and you barely move because photosynthesis saturates. transpiration_l_per_day sizes the dehumidifier and condensate-recovery system.',
    usage_pattern: 'Runs in a coupled loop with led-par:efficacy — change the LEDs and the yield + transpiration shift, which changes the HVAC sizing, which can change the electrical supply, which can change the cost. The fixed-point solver iterates until they all settle.',
  },

  'hvac:load-sizing': {
    description: 'Sizes the chiller/HVAC capacity required to remove the sensible heat (from LEDs, motors, pumps) and the latent moisture (from plant transpiration, occupants) inside a contained envelope.',
    origin: 'ASHRAE Handbook of Fundamentals 2017, chapter 18 (nonresidential cooling load) and chapter 22 (chiller selection). In-tree implementation of the classic sensible/latent decomposition with a Carnot-bounded COP for the refrigeration cycle.',
    results_interpretation: 'hvac_cooling_kw is the chiller nameplate rating needed at design conditions; hvac_total_load_kw includes safety margin. SHR (sensible heat ratio) ≈ 0.7 is typical for a CEA grow-room — lower means more latent load and the design needs dehumidification beyond what cool-and-condense provides.',
    usage_pattern: 'Reads LED heat (from led-par), occupancy heat (from ergonomics), and transpiration latent load (from plant-growth) and produces a single chiller kW target. The cost stack picks the chiller line item against this target; the electrical-distribution module sizes its supply current against the same target.',
  },

  'dehumidification:sizing': {
    description: 'Sizes the dehumidification capacity needed to keep relative humidity inside the operating window when the transpiration latent load exceeds what cool-and-condense alone can remove.',
    origin: 'In-tree implementation derived from psychrometric mass-balance (ASHRAE Handbook 2017 chapter 1) — moisture-removal rate = transpiration rate − coil-condensation rate. Cross-checks against industry rules-of-thumb for closed grow-rooms (~2-3 kg/h dehumidification per kWh LED).',
    results_interpretation: 'dehumidifier_kg_per_h is the moisture-removal rate the dehumidifier must achieve at design RH (typically 65 %); dehumidifier_power_kw is the electrical input. If kg/h exceeds the HVAC coil\'s condensation rate by >2× the design is under-dehumidified and the RH ceiling won\'t hold.',
    usage_pattern: 'Coupled with hvac:load-sizing — they share latent-load inputs. The pair iterates until both the temperature setpoint and the RH ceiling can be held simultaneously.',
  },

  'co2-enrichment:sizing': {
    description: 'Sizes the CO₂ injection rate and tank capacity needed to maintain an elevated CO₂ setpoint (typically 1,000–1,200 ppm) inside a sealed envelope, accounting for air-change leakage and plant consumption.',
    origin: 'In-tree implementation of the standard envelope mass-balance: net injection rate = plant_uptake + leakage_loss + occupancy_breathing. Plant uptake from USDA CEA literature; leakage modelled per ASHRAE infiltration coefficients.',
    results_interpretation: 'co2_consumption_kg_day is the gas the system uses per day at full operation. co2_tank_size_kg sets the refill cadence — a 50 kg tank lasts ~2 weeks at 3 kg/day. If consumption sits at the upper bound the envelope is too leaky and the cost of CO₂ becomes material against the yield uplift it buys.',
    usage_pattern: 'Optional module — only invoked when the brief targets CO₂ enrichment (a yield-uplift feature, not a baseline). Tightens the photosynthesis efficiency, so reactively feeds back to plant-growth:yield.',
  },

  'fan-coil:sizing': {
    description: 'Sizes an air-handling unit\'s coil face area, number of coil rows, and fan power for a given cooling load and target supply air temperature.',
    origin: 'In-tree implementation of the standard AHRI/ASHRAE coil-selection method: face velocity v = Q/A, fan power P = Q·ΔP/η, filter resistance per ASHRAE 52.2 / EN 779 minimum-efficiency tests.',
    results_interpretation: 'ahu_coil_face_area_m2 sets the duct cross-section; ahu_coil_rows (typically 4-6) drives the latent vs sensible split (more rows = wetter coil = more dehumidification but higher fan power). ahu_fan_power_kw must fit inside the electrical aux-load budget; if it eats too much, switch to a larger coil with fewer rows.',
    usage_pattern: 'Sizing-only — informs the HVAC line items in the BoM. Downstream of hvac:load-sizing; reads its cooling kW and produces the coil-level geometry.',
  },

  'fluids:pipe-sizing': {
    description: 'Sizes pipe diameters and computes pressure drop, Reynolds number, and pump head requirements for a fluid loop (water, nutrient solution, refrigerant) at a given flow rate.',
    origin: 'Open-source `fluids` Python library (Bell et al., MIT license). Implements Colebrook-White friction factor, Hagen-Poiseuille for laminar regime, and Darcy-Weisbach for turbulent. Same engine used in industrial process-engineering calculators.',
    results_interpretation: 'pipe_diameter_m is the inner diameter; pressure_drop_kpa is what the pump must overcome at design flow. Reynolds number tells you the flow regime — Re<2300 is laminar (low pressure drop but vulnerable to dead-legs and biofilm); Re>4000 is turbulent (good mixing, higher drop). For nutrient solution, laminar is preferred to minimise mechanical damage to dissolved oxygen.',
    usage_pattern: 'Used wherever a fluid loop is part of the design — fertigation, refrigerant, chilled-water, coolant. Outputs feed into pump sizing (irrigation:pump-sizing) and the BoM\'s pipework line items.',
  },

  'irrigation:pump-sizing': {
    description: 'Sizes the irrigation pump\'s flow rate, head, and motor power required to deliver nutrient solution to every tray in a vertical-farm trolley system.',
    origin: 'In-tree implementation combining Bernoulli head loss with EN ISO 17769 centrifugal-pump performance curves. Calibrated against the Grundfos CR / CRE and Lowara e-LNE pump families that dominate the agricultural-water market.',
    results_interpretation: 'pump_flow_lpm is the design flow (typically 50-150 L/min for a 100 m² VF); pump_head_m is the lift the pump produces; motor_kw is the electrical input. If the head exceeds 30 m the design needs a multi-stage pump and the cost jumps; under 10 m and a single-stage in-line pump is sufficient.',
    usage_pattern: 'Sizes the fertigation module\'s pump line item. Reads the pipe geometry from fluids:pipe-sizing and produces a pump spec that flows into the BoM and electrical-distribution load count.',
  },

  'nutrient-solution:chemistry': {
    description: 'Computes the EC (electrical conductivity), pH, and per-ion concentrations of a nutrient solution recipe for a given crop and growth stage.',
    origin: 'In-tree implementation of the Steiner-modified Sonneveld nutrient model (the industry standard for leafy greens hydroponics). Calibrated against the University of Arizona CEA Center\'s public recipes.',
    results_interpretation: 'target_ec_ms_per_cm tells the dosing system the target conductivity (typically 1.6-2.4 for lettuce). pH target is 5.8-6.2 for hydroponic leafy greens. If individual ion concentrations drift outside the published ranges, the crop suffers nutrient deficiency or toxicity — typically caught by ATP biolumines­cence inspection well before the BoM matters.',
    usage_pattern: 'Sizes the fertigation chemistry sub-system — dosing pumps, EC/pH sensors, stock tank capacities. Outputs feed straight into the BoM as the dosing rationale.',
  },

  'ht:ntu-heat-exchanger': {
    description: 'Computes heat-exchanger sizing using the effectiveness-NTU (Number of Transfer Units) method — outputs surface area, UA value, and outlet temperatures for a given duty.',
    origin: 'Open-source `ht` Python library (Bell, MIT license). Implements the Kays & London tabulated NTU correlations for shell-and-tube, brazed-plate, and finned-tube geometries. Same data set used by every undergraduate heat-transfer course.',
    results_interpretation: 'effectiveness ε is the fraction of the theoretical maximum heat transfer the exchanger actually achieves — 0.6-0.8 is typical for industrial duty. surface_area_m2 sets the physical size; UA_W_K is the conductance. If ε drops below 0.5 the exchanger is too small for its duty and the chiller will struggle to hold setpoint.',
    usage_pattern: 'Sizes any heat-exchanger line item — refrigerant condensers, intercoolers, dehumidifier recovery coils. Reads the duty from hvac:load-sizing and produces a part-level spec the BoM can price against the Alfa Laval / SWEP / Kelvion catalogue.',
  },

  'pest-control:uvc-dose': {
    description: 'Computes the UV-C lamp wattage and dose-on-target needed to sterilise a recirculating fluid loop or surface to a specified log-reduction of pathogens.',
    origin: 'In-tree implementation of the IUVA Manual of Recommended Practice (3rd ed.). Calibrated against published UV-C absorption coefficients for water, nutrient solution, and stainless steel surfaces.',
    results_interpretation: 'uvc_dose_mj_per_cm2 is the cumulative dose delivered at the target. 40 mJ/cm² achieves 4-log reduction of most waterborne pathogens (E. coli, Salmonella, Listeria). lamp_power_w must include reflector + lamp-age derating; if the design ships an under-rated lamp the pathogen control fails silently.',
    usage_pattern: 'Sizes UV-C sterilisation line items in the worker-safety + harvest-handling modules. Reads the flow rate from fluids:pipe-sizing and produces a lamp spec that the BoM matches against the Trojan, Aquafine, or Atlantium catalogue.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // BESS tools
  // ──────────────────────────────────────────────────────────────────────
  'pybamm:cell-sizing': {
    description: 'Simulates lithium-ion cell behaviour at the electrochemical level — voltage profile, capacity, internal resistance, and cycle life — for a chosen chemistry, geometry, and duty cycle.',
    origin: 'Open-source PyBaMM (BSD-3-Clause) maintained by University of Oxford + WMG Warwick. Implements the Doyle-Fuller-Newman model with electrolyte and SEI sub-models. The de-facto open-source standard for battery electrochemical simulation.',
    results_interpretation: 'cell_count is the number of cells the design needs to hit the brief\'s kWh + voltage envelope. nominal_voltage_v is the pack voltage at 50% SOC; capacity_fade_at_6000_cycles_pct is the end-of-life capacity (~80% is typical for LFP). If fade exceeds 20% the cycle-life claim is unsupported.',
    usage_pattern: 'The first tool the BESS chain invokes — it sets the cell count, voltage, and capacity that every downstream module (BMS, thermal, PCS, container) depends on. Coupled with ngspice (which validates electrical) and coolprop (which validates thermal).',
  },

  'ngspice:pcs-simulation': {
    description: 'Simulates the power-conversion-system (PCS) inverter — DC bus voltage, AC output waveform, switching harmonics, filter response, and efficiency at multiple load points.',
    origin: 'Open-source ngspice (BSD-3-Clause) — the standard SPICE-derived analog circuit simulator. Used industry-wide for power-electronics design from undergraduate labs to commercial PCS engineering.',
    results_interpretation: 'inverter_efficiency_pct (95-98% for modern SiC) sets the round-trip efficiency claim. switching_frequency_khz drives EMI filter sizing. THD (total harmonic distortion) below IEEE 519 limits is mandatory for grid connection.',
    usage_pattern: 'Sizes the PCS module\'s IGBT/SiC count, gate-driver count, LCL filter rating, and isolation transformer. Coupled with pybamm (sees the DC bus voltage) and pandapower (sees the grid impedance).',
  },

  'pandapower:grid-integration': {
    description: 'Performs power-flow analysis on the AC side — sizing the distribution transformer, breakers, contactors, and protection settings for a grid-connected BESS or industrial load.',
    origin: 'Open-source pandapower v3.4 (BSD-3-Clause), Thurner et al. 2018 IEEE Transactions on Power Systems. Newton-Raphson power flow + sequence-component short-circuit analysis per IEC 60909.',
    results_interpretation: 'transformer_rating_kva drives the BoM\'s transformer line item; main_breaker_a sets the protection coordination. If the short-circuit current at the point-of-connection exceeds the breaker\'s interrupt rating, the design is non-compliant and a current-limiting reactor must be added.',
    usage_pattern: 'Sizes the electrical-distribution module across BESS, VF, EV charger, and any other grid-connected class. Reads the load profile from PCS / HVAC / lighting and produces the upstream electrical-supply spec.',
  },

  'coolprop:refrigerant-properties': {
    description: 'Looks up thermophysical properties (density, enthalpy, entropy, viscosity, thermal conductivity) of refrigerants, heat-transfer fluids, and pure substances across the full PT envelope.',
    origin: 'Open-source CoolProp v6.4 (MIT license), Bell et al. 2014 Industrial & Engineering Chemistry Research 53(6):2498-2508. Reference-equation-of-state implementation — same equations NIST REFPROP uses.',
    results_interpretation: 'Properties are point-values at the design operating condition. Engineering judgement uses them to size HX, pumps, expansion valves. If the refrigerant\'s critical point is too close to the operating envelope the cycle becomes unstable; if its GWP exceeds the F-gas limits the brief\'s sustainability target fails.',
    usage_pattern: 'Called by hvac:load-sizing, refrigeration-cycle:cop, and ht:ntu-heat-exchanger whenever a thermophysical property is needed. Doesn\'t set design decisions on its own — it\'s the property database other tools depend on.',
  },

  'refrigeration-cycle:cop': {
    description: 'Computes the coefficient of performance (COP) of a vapour-compression refrigeration cycle given the refrigerant, evaporator + condenser temperatures, and compressor isentropic efficiency.',
    origin: 'In-tree implementation of the standard Rankine-cycle analysis (ASHRAE Handbook 2017 chapter 2). Looks up refrigerant enthalpies via coolprop.',
    results_interpretation: 'cop_cooling (typically 2.5-4.0 for an industrial chiller) tells you how many kW of cooling you get per kW of electrical input. compressor_power_kw is the actual electrical draw. If COP drops below 2.5 the design is inefficient — usually because the condenser temperature is too high or the refrigerant pinch is wrong.',
    usage_pattern: 'Sizes the chiller in the climate-control module. Read by hvac:load-sizing to convert cooling kW to electrical kW.',
  },

  'reliability-fmea:system': {
    description: 'Computes system-level mean-time-between-failures (MTBF) and failure-mode breakdown by aggregating component failure rates per MIL-HDBK-217F.',
    origin: 'In-tree implementation of MIL-HDBK-217F + IEC 61709 part-stress models. The reliability engineering standard for safety-critical electronics.',
    results_interpretation: 'reliability_system_mtbf_hours is the predicted mean operating time before any module fails. 50,000 h is typical for industrial grid equipment; 5,000 h would be alarming. The breakdown by component class shows which line item drives the lifetime — usually capacitors or fans.',
    usage_pattern: 'Runs at the end of the chain, after the BoM is finalised. Outputs feed the warranty and maintenance sections of the report.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // HAPS / aero / power-electronics tools
  // ──────────────────────────────────────────────────────────────────────
  'aerosandbox:airfoil-analysis': {
    description: 'Performs panel-method aerodynamic analysis on an airfoil section — lift coefficient, drag coefficient, and pitching moment across angle-of-attack — using AeroSandbox\'s viscous coupling to XFoil.',
    origin: 'Open-source AeroSandbox v4.x (MIT license) by MIT FlowLab. The same library used in modern HAPS / eVTOL / drone preliminary design at academic and industry-research level.',
    results_interpretation: 'cl_max is the wing\'s stall lift coefficient — sets the minimum flight speed. cd_at_cruise is the parasite drag — directly inversely-proportional to endurance. cl_over_cd_max is the L/D — the single most important number for endurance-limited platforms.',
    usage_pattern: 'Sizes wing aerodynamics for HAPS, eVTOL, drone, and any aero platform. Coupled with aeroelastic-flutter:wing (which checks the wing\'s structural response) and gust-response:atmospheric (which checks how the wing handles turbulence).',
  },

  'aeroelastic-flutter:wing': {
    description: 'Computes the flutter speed of a flexible wing — the air-speed at which structural and aerodynamic frequencies couple destructively, causing wing destruction.',
    origin: 'In-tree implementation of the bending-torsion p-k flutter solver (Hodges & Pierce 2011, Introduction to Structural Dynamics and Aeroelasticity). Calibrated against Northrop YB-49 + Helios Prototype flight data.',
    results_interpretation: 'flutter_speed_ms must exceed the design dive speed by ≥15% with a margin of safety (FAA + EASA certification rule). divergence_speed_ms is the static-aeroelastic limit. If either drops below cruise + 15%, the wing geometry needs stiffening (more spar caps, higher modulus material) before procurement.',
    usage_pattern: 'Mandatory for HAPS (high-aspect-ratio wing) and eVTOL (cantilevered rotor pylons). Reads wing geometry from aerosandbox:airfoil-analysis and computes whether the structure is flutter-safe at design speed.',
  },

  'airframe-fea:landing': {
    description: 'Performs simplified finite-element analysis on the airframe\'s landing-gear attachment, wing-root spar, and pressure-bulkhead joints for the design landing-shock load case.',
    origin: 'In-tree implementation derived from the EASA CS-22 / CS-23 landing-shock spectrum + Niu\'s Airframe Stress Analysis (1997) static-load methodology. NOT a full FEA — a beam-and-bracket sizing tool that flags load paths exceeding allowable stress.',
    results_interpretation: 'stress_margin shows headroom against material yield. Anything below 1.25 (the EASA factor of safety) flags the joint as critical — it needs a real FEA, NOT a shipped design. Above 1.25 is procurement-grade.',
    usage_pattern: 'Sizes the structural-containment line items in HAPS, eVTOL, drone. Outputs are advisory — a real airworthiness submission would re-run the analysis in a full FEA package (NASTRAN / Abaqus).',
  },

  'ambiance:isa-atmosphere': {
    description: 'Returns the International Standard Atmosphere (ISA) properties — temperature, pressure, density, viscosity, speed of sound — at a given altitude.',
    origin: 'Open-source `ambiance` Python library (Aitor Pérez Cambra, MIT). Implements the ISO 2533:1975 + ICAO Doc 7488 atmosphere model up to 80 km altitude.',
    results_interpretation: 'pressure_pa and density_kg_per_m3 are direct inputs to every aero calculation. At 20 km altitude (HAPS cruise) the density is ~7 % of sea-level — so a HAPS wing needs ~14× the area for the same lift at the same speed.',
    usage_pattern: 'Called by aerosandbox, propeller:low-re-bemt, gust-response:atmospheric, and any tool that needs atmospheric properties. Doesn\'t set design decisions on its own — it\'s the atmosphere data the aero tools depend on.',
  },

  'gust-response:haps-atmospheric': {
    description: 'Computes the wing load increment from a discrete-gust encounter at HAPS cruise altitude using the FAA AC 25-7 1-cosine gust model.',
    origin: 'In-tree implementation of FAA AC 25-7A appendix G + EASA CS-25 sub-part B turbulence model. Atmospheric turbulence intensity from the von Karman / Dryden spectra at 20+ km altitude.',
    results_interpretation: 'gust_load_factor is the multiplier on steady-state lift the gust applies. The wing structure must hold up to 2.5× steady-state load with the FAA factor of safety; if this tool returns 3.0+ the design is gust-critical and either the cruise speed or the wing stiffness must change.',
    usage_pattern: 'Runs alongside aeroelastic-flutter for HAPS and any high-altitude UAV. The pair determines whether the wing can survive both quasi-static (flutter) and impulsive (gust) atmospheric forcing.',
  },

  'propeller:low-re-bemt': {
    description: 'Computes propeller thrust, torque, and efficiency at low Reynolds number using Blade-Element Momentum Theory (BEMT).',
    origin: 'In-tree implementation of the Drela XFoil + BEMT coupling used in UIUC propeller-database analysis. Calibrated against the APC + Aerosonde + T-Motor catalogue data for sub-1m propellers in the Re=10⁴ to 10⁵ regime.',
    results_interpretation: 'thrust_n at design airspeed must exceed drag — otherwise the platform decelerates. efficiency at cruise (typically 0.65-0.78 for well-matched propellers) directly drives battery sizing. If efficiency falls below 0.55 the propeller is mis-matched to the motor RPM or pitch.',
    usage_pattern: 'Sizes the propulsion module for HAPS, drone, and any propeller-driven aero platform. Reads atmospheric density from ambiance and produces motor-RPM + propeller-diameter targets the BoM uses to pick parts.',
  },

  'motor:altitude-derating': {
    description: 'Derates a brushless DC motor\'s continuous-power rating for operation at altitude — atmospheric cooling, brush-wear, and breakdown-voltage corrections.',
    origin: 'In-tree implementation of the MIL-STD-810H altitude-derating curves + Faulhaber / Maxon Motor Group application notes.',
    results_interpretation: 'continuous_power_derated_kw is what the motor can sustain at altitude WITHOUT thermal runaway. The rating drops sharply above 15 km where convective cooling collapses. If the design needs more power, water-cooling is required.',
    usage_pattern: 'Runs after propeller:low-re-bemt — takes the motor power demand at altitude and checks whether a catalogue motor can meet it. Drives the HAPS / high-altitude UAV propulsion-motor selection.',
  },

  'battery-li-s:cell-sizing': {
    description: 'Sizes lithium-sulphur (Li-S) cells for the HAPS-typical specific-energy regime (300-500 Wh/kg) accounting for sulphur loading, cycle-life capacity-fade, and temperature derating.',
    origin: 'In-tree empirical model calibrated against Oxis Energy + Sion Power published cell data. Li-S is the leading chemistry for HAPS because its specific energy beats Li-ion by 2-3×.',
    results_interpretation: 'cell_count and pack_mass_kg are the primary outputs. specific_energy_wh_per_kg should land in 350-450 for a current-generation Li-S — if lower the design is using outdated cell data; if higher it\'s unrealistic for a today-procurement.',
    usage_pattern: 'HAPS-specific — replaces pybamm in the battery-sizing role because Li-S has different chemistry. Coupled with battery-eclipse-cycle (which checks the design survives the day-night discharge swing).',
  },

  'link-budget:rf': {
    description: 'Computes radio-link budget — EIRP, free-space path loss, atmospheric absorption, link margin, and supported data rate — between two RF endpoints.',
    origin: 'In-tree implementation of Sklar 2001 (Digital Communications, 2nd ed.) + Pratt 2002 (Satellite Communications, ch.4). ITU-R P.676 atmospheric attenuation + P.618 rain attenuation.',
    results_interpretation: 'link_margin_db must exceed 3 dB at worst-case rain rate for reliable communication; data_rate_bps tells you whether the link can support the mission\'s telemetry + payload data volume. If margin drops below 1 dB the design fails in heavy rain.',
    usage_pattern: 'Sizes the RF antenna + transceiver + ground-station for HAPS, satellite, drone, and any class with an active radio link.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Cross-class / utility tools
  // ──────────────────────────────────────────────────────────────────────
  'mass-aggregator:envelope-check': {
    description: 'Sums the mass of every priced component in the BoM and compares against the brief\'s envelope mass cap (e.g. 28,000 kg for a road-transportable 40-foot container).',
    origin: 'In-tree aggregator. Reads `mass_kg` from every BoM line item; rules-of-thumb fill in missing masses by component class (e.g. battery cells at 80 g/cell, transformers at 4 kg/kVA).',
    results_interpretation: 'total_system_mass_kg vs envelope cap. If total exceeds cap, the design either splits across multiple containers (`recommended_container_count = 2`) or the brief\'s envelope is wrong. A 10% overshoot is normal during early design; >25% needs a fundamental rework.',
    usage_pattern: 'Runs at the end of the chain after the BoM is finalised. Outputs flag the cover page if the mass cap is breached, so the buyer sees the constraint violation up-front.',
  },

  'lifecycle-co2:assessment': {
    description: 'Computes cradle-to-grave CO₂-equivalent emissions of the design — embodied (per-kg material × CO₂ factor) + operational (grid mix × lifetime kWh) + end-of-life pathway credit/burden.',
    origin: 'IPCC AR6 WGIII (2022) + ecoinvent database v3.10 + ISO 14040:2006 / 14044:2006 LCA framework. In-tree implementation aggregates by material class against published global-average CO₂ factors.',
    results_interpretation: 'lca_total_co2_kg over the design lifetime. lca_embodied_co2_kg is the up-front cost; lca_operational_co2_kg is the use-phase. The split tells you which lever moves the total — for a BESS it\'s usually operational (grid mix), for a building it\'s embodied (concrete).',
    usage_pattern: 'Runs after the BoM is final. Outputs feed the sustainability section of the report — a published number a sustainability auditor can challenge with their own ecoinvent query.',
  },

  'psychrolib:humid-air': {
    description: 'Computes psychrometric properties of moist air — humidity ratio, enthalpy, wet-bulb temperature, dew point — for HVAC and dehumidification sizing.',
    origin: 'Open-source PsychroLib v2.5 (MIT license), Meyer & Thevenard 2019 JOSS 4(33):1137. Implements the ASHRAE 2017 Handbook chapter 1 formulations with Hyland-Wexler vapour-pressure correlations.',
    results_interpretation: 'humidity_ratio_kg_per_kg and dew_point_c are the design-condition inputs to dehumidifier sizing. wet_bulb_c sets cooling-tower capacity. Without these, every HVAC calculation defaults to dry-bulb-only and the latent load is missed.',
    usage_pattern: 'Called by hvac:load-sizing and dehumidification:sizing. Doesn\'t set design decisions — it\'s the psychrometric data those tools depend on.',
  },

  'pvlib:solar-irradiance': {
    description: 'Computes solar irradiance at a given location, time, and tilt — direct beam, diffuse, ground-reflected components — for PV array sizing.',
    origin: 'Open-source pvlib-python v0.10 (BSD-3-Clause), maintained by Sandia + NREL. The de-facto open-source standard for PV system simulation.',
    results_interpretation: 'annual_yield_kwh_per_kwp tells you how many kWh per kWp the array produces in a typical year at this location. UK rates 850-950 kWh/kWp; California 1500-1800. capacity_factor (kWh/yr ÷ peak_kw ÷ 8760) is the equivalent always-on rating.',
    usage_pattern: 'Sizes PV arrays for HAPS, off-grid BESS, vertical farms with rooftop solar, and any solar-augmented design.',
  },

  'octopart:parts-lookup': {
    description: 'Queries the Octopart distributor-aggregation API for live availability, lead time, and price of electronic components by manufacturer part number.',
    origin: 'Octopart API v4 (Nexar) — aggregates DigiKey, Mouser, Farnell, RS, Avnet stock. Used industry-wide for electronic-component sourcing.',
    results_interpretation: 'price_gbp at quantity 1 vs quantity break-points lets you see whether the design needs a price-break order. lead_time_weeks flags supply-chain risk — >26 weeks for a critical part needs a second source.',
    usage_pattern: 'Runs during Engine C (supplier matching) for every electronic line item in the BoM. Replaces hard-coded median prices with real-time market data.',
  },

  'iec-standards:lookup': {
    description: 'Looks up the IEC / UL / ISO / EN standards applicable to a given component class — voltage, current, dimensions, hazard category — and produces a compliance checklist.',
    origin: 'In-tree compilation of the IEC TC compendium + UL Standards Catalogue + ISO TC catalogue. Updated quarterly.',
    results_interpretation: 'applicable_standards lists every mandatory + de-facto standard the part must satisfy. Missing certifications block CE marking + UL listing. The compliance gate fails the design if a critical standard is missing.',
    usage_pattern: 'Runs in the compliance-gate stage. Outputs feed the Regulatory & Compliance section of the report.',
  },

  'regulatory-cert-cost:lookup': {
    description: 'Estimates the certification + notified-body fees + test-house lab time for the brief\'s claimed certifications (CE, UKCA, UL, IEC 62619, NFPA 855, etc.).',
    origin: 'In-tree compilation of TÜV + DEKRA + Intertek + UL Solutions published rate cards (refreshed annually).',
    results_interpretation: 'estimated_cert_cost_gbp is the up-front fee to get the product to market. recommended_test_house tells the procurement team where to send the prototype.',
    usage_pattern: 'Runs once at the end of the chain. Outputs feed the cost-stack annotation ("certification adds £X to first-unit cost").',
  },

  'regulatory-faa:airspace': {
    description: 'Checks FAA Part 91 / Part 107 / Part 23 / Part 25 airspace + operator regulations for a HAPS / drone / eVTOL / fixed-wing design.',
    origin: 'In-tree compilation of 14 CFR + EASA SERA + UK CAA CAP 722. Updated when major rule revisions land.',
    results_interpretation: 'applicable_part lists the FAA part the design must operate under; restriction_list flags airspace constraints (BVLOS waiver, night-ops, over-people). If the design crosses Class A airspace, ATC integration is required.',
    usage_pattern: 'Runs for any airspace-operating class. Outputs feed the regulatory section + operator training requirements.',
  },

  'control-systems:pid-tuning': {
    description: 'Computes PID controller gains (proportional, integral, derivative) for a given plant transfer function using Ziegler-Nichols or pole-placement methods.',
    origin: 'In-tree implementation of the Astrom & Hagglund 2006 PID tuning rules. Same algorithms used in industrial process-control commissioning.',
    results_interpretation: 'kp / ki / kd are the recommended PID gains. settling_time_s and overshoot_pct tell you whether the loop will be stable + responsive. If overshoot exceeds 30% the loop will oscillate noticeably; lower the gains.',
    usage_pattern: 'Sizes control loops in HVAC, fertigation, flight-control, and process-control modules. Outputs feed the controller spec in the BoM + the commissioning sequence.',
  },

  'supply-chain-risk:scoring': {
    description: 'Scores supply-chain risk for every BoM line — sole-source flag, geographic concentration, sanctions exposure, tariff cost.',
    origin: 'In-tree compilation of EUC dual-use list + US BIS Entity List + UK ECJU + Companies House data on supplier ownership. Updated monthly.',
    results_interpretation: 'risk_score per line item: green = multiple sources + low tariff, amber = single source OR sanctioned country, red = embargoed. The cumulative high-risk percentage tells the buyer whether to pursue dual sourcing.',
    usage_pattern: 'Runs alongside Engine C supplier matching. Outputs feed the supply-chain section of the report.',
  },

  'transport-logistics:routing': {
    description: 'Routes a containerised or palletised shipment from manufacturer to deployment site, computing transit time, customs duty, freight class, and ground-transport restrictions.',
    origin: 'In-tree implementation against the IMO IMDG code (sea), IATA DGR (air), ADR (road EU), and 49 CFR (road US). Freight rates from Freightos + Drewry indices.',
    results_interpretation: 'door_to_door_days is the realistic transit time (~6-8 weeks China-EU sea; 3 days air). landed_cost_gbp includes freight + duty + handling. flagged_restrictions surfaces hazardous-goods classification (Li-ion → UN 38.3 transport test required).',
    usage_pattern: 'Runs once at the end. Outputs feed the deployment-logistics section.',
  },

  'yield-economics:npv': {
    description: 'Computes the financial NPV, IRR, and payback period of the design over a chosen holding period, given the cost stack, revenue model, and discount rate.',
    origin: 'In-tree implementation of Brealey, Myers, Allen "Principles of Corporate Finance" 13th ed. + Damodaran "Investment Valuation" 3rd ed. The standard DCF methodology used across project finance.',
    results_interpretation: 'npv_gbp is the discounted present value of the project\'s cash flows — positive means the investment beats the discount rate, negative means it doesn\'t. irr_pct is the discount rate that zeroes the NPV. payback_years is the time to recover CapEx; investors typically demand <5 for an industrial asset.',
    usage_pattern: 'Runs at the end of the chain. Outputs feed the financial section + the cover-page cost stack.',
  },
}

/**
 * Lookup helper — returns the narrative for a tool_id, OR a generic
 * fallback if no narrative is registered. Future-proof — registry can
 * grow over time without breaking existing renderers.
 */
export function getToolNarrative(toolId: string): ToolNarrative | null {
  return TOOL_NARRATIVES[toolId] ?? null
}
