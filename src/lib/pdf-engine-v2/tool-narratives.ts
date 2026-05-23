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

  // ──────────────────────────────────────────────────────────────────────
  // AUV / Underwater-vehicle tools
  // ──────────────────────────────────────────────────────────────────────
  'acoustic-modem:link-budget': {
    description: 'Computes an underwater acoustic-modem link budget — SNR, transmission loss, ambient-noise level, and supported data rate — for an AUV-to-ship or AUV-to-AUV channel at a given range, depth, and modulation.',
    origin: 'In-tree implementation of the Urick (1983) "Principles of Underwater Sound" sonar-equation framework, with Mackenzie 1981 sound-speed and Francois-Garrison 1982 absorption. References Stojanovic & Preisig 2009 IEEE Comm Mag on UW channel capacity, plus WHOI Micromodem and Evologics S2C datasheets for modulation/data-rate envelopes.',
    results_interpretation: 'snr_db must exceed ~5 dB for a viable link; data_rate_bps depends on modulation (FSK 100 bps - 2 kbps; QPSK 1-5 kbps; OFDM 5-25 kbps). transmission_loss_db grows ~20·log10(R) + α(f)·R — high frequencies (>100 kHz) attenuate >10 dB/km so range is sharply limited. capacity_utilisation > 0.8 means the modulation is pushed to its Shannon limit and BER will degrade.',
    usage_pattern: 'Sizes the acoustic-comms line item of the AUV mission package. Reads frequency, range, depth, and water properties from the brief and produces SNR + viable-data-rate that drive the modem selection (WHOI Micromodem for low-rate, Evologics S2C for high-rate) plus the antenna/array geometry.',
  },

  'auv-hydro:drag-buoyancy': {
    description: 'Computes hydrostatic pressure, seawater density, drag force, drag power, and wetted area for an AUV hull at a given depth and forward speed.',
    origin: 'Open-source `python-seawater` v3.3.5 (MIT, pyoceans) implementing the UNESCO 1983 EOS-80 seawater equation of state. Drag uses the ITTC 1957 friction line + Hoerner form-factor correction for slender bodies, per Fossen "Handbook of Marine Craft Hydrodynamics and Motion Control" chapter 6 and Allmendinger "Submersible Vehicle Systems Design".',
    results_interpretation: 'hydrostatic_pressure_bar grows ~1 bar per 10 m depth; at 1000 m the pressure vessel must hold ~101 bar without buckling. drag_power_w drives the propulsion energy budget — a torpedo-form AUV at 2 m/s typically needs 30-80 W of hydrodynamic drag power. seawater_density_kg_m3 sits around 1025-1040 depending on temperature and salinity; lower density = lower buoyancy reserve.',
    usage_pattern: 'First tool the AUV chain invokes — it sets the hull form, depth rating, and propulsion power that feed pressure-vessel:design, mission-endurance:depth, and the battery/motor sizing downstream.',
  },

  'corrosion:anode-sizing': {
    description: 'Sizes the mass and surface area of sacrificial anodes (Zn, Al-Zn-In, Mg) required to provide cathodic protection of an AUV or marine structure for its design service life.',
    origin: 'In-tree implementation of Faraday\'s law combined with DNV-RP-B401 (2017) "Cathodic protection design" — the standard the offshore industry uses for sub-sea cathodic-protection sizing. Anode capacities (Zn 780 A-hr/kg, Al-Zn-In 2600 A-hr/kg, Mg 1230 A-hr/kg) and protection current densities are pulled from DNV-RP-B401 Table A-4.',
    results_interpretation: 'anode_mass_kg is the total sacrificial anode mass the design must carry; protection_current_a is the steady-state current the anodes deliver. Painted steel needs 5-15 mA/m²; bare steel 100-150 mA/m². If anode_mass exceeds 5 % of vehicle dry mass the design is corrosion-limited and a coating upgrade is cheaper than more zinc.',
    usage_pattern: 'Sizes the corrosion-protection BoM line item for any AUV / sub-sea structural design. Reads the wetted area and service life from auv-hydro and the brief, produces anode count + mass that propagate into the dry-mass budget.',
  },

  'mission-endurance:depth': {
    description: 'Computes AUV mission endurance vs depth, accounting for the pressure-housing mass penalty, propulsion energy, payload power, and hotel loads over the mission profile.',
    origin: 'In-tree implementation calibrated against Allen, Vorus & Prestero (2000) "Propulsion System Performance Enhancements on REMUS AUVs" (MTS/IEEE Oceans). Pressure-housing mass scales linearly with depth via Ti-6Al-4V hoop-stress sizing (σ_allow = 414 MPa, SF=2). Battery placement options (inside housing, oil-compensated, pressure-tolerant) modelled per Bluefin / REMUS technical literature.',
    results_interpretation: 'endurance_hours at design speed/depth is the total mission time before the battery is exhausted. propulsion_fraction (typically 70-90 %) tells you whether the design is propulsion-limited (slim the hull) or payload-limited (cut payload duty cycle). If the housing mass exceeds 25 % of dry mass the design is depth-limited; oil-compensated or pressure-tolerant cells unlock more capacity.',
    usage_pattern: 'Sizes the AUV mission package — battery kWh vs depth vs speed vs payload. Couples with battery-eclipse and runtime tools downstream, plus pressure-vessel:design upstream for the housing mass-vs-depth curve.',
  },

  'recovery-method:logistics': {
    description: 'Estimates AUV / USV recovery time, weather-window probability, crew count, and equipment for crane-off-ship, docking-buoy, underwater-dock, or beach-launch recovery methods.',
    origin: 'In-tree implementation against the Lloyd\'s Register Code for Lifting Appliances in a Marine Environment (CLAME 2022) plus Bourgault 2008 "Cost Estimation of Autonomous Underwater Vehicle Recovery Operations" (MTS J. 42(4)). Weather-window probabilities from historical Met Office hindcast for typical UK / North Sea operating areas.',
    results_interpretation: 'recovery_time_minutes is the realistic deck-to-deck retrieval time; crane lift takes 15-30 min, autonomous docking 30-60 min. sea_state_limit_beaufort caps the operating envelope (crane 4, docking buoy 5, underwater dock unlimited). monthly_weather_window_pct tells the operations team what fraction of the year the design can actually be recovered.',
    usage_pattern: 'Runs in the operational-design module after the AUV hardware is sized. Outputs feed the deployment-logistics section + the operating-cost line items (crew, vessel time, ship-day cost).',
  },

  'regulatory-imo:maritime': {
    description: 'Looks up IMO MARPOL, COLREGS, and class-society (DNV/Lloyd\'s/ABS) certification obligations for an autonomous maritime vessel — including MASS (Maritime Autonomous Surface Ship) category, ballast-water management, and discharge-zone restrictions.',
    origin: 'In-tree compilation of MARPOL 73/78 Annexes I-VI, COLREGS 1972 (Convention on the International Regulations for Preventing Collisions at Sea), and IMO MSC.1/Circ.1638 (MASS Code interim guidelines). Class society obligations cross-referenced against DNV / Lloyd\'s Register / ABS published rules.',
    results_interpretation: 'mass_category (1 through 4 — manned remote, manned automated, unmanned remote, fully autonomous) drives which IMO chapters apply. required_certifications enumerates the rule-books the design must satisfy before deployment in international waters. discharge_restrictions surfaces battery/hydraulic-fluid limits that cap the BoM\'s chemistry choices.',
    usage_pattern: 'Runs in the compliance gate for AUV / USV designs operating in international waters. Outputs feed the regulatory section + cap the operating envelope (e.g. no discharge in MARPOL Special Areas).',
  },

  'sonar:acoustic-attenuation': {
    description: 'Computes underwater acoustic attenuation (absorption + spreading loss) and sound speed for a sonar pulse at a given frequency, range, depth, salinity, and temperature.',
    origin: 'In-tree implementation of Francois & Garrison 1982 J. Acoust. Soc. Am. 72(6):1879-1890 ("Sound absorption based on ocean measurements") plus Mackenzie 1981 sound-speed equation. Below 400 Hz the Thorp equation provides a fallback. The sonar equation is per Urick "Principles of Underwater Sound" 3rd edition.',
    results_interpretation: 'path_loss_db = spreading_loss + absorption_loss; below 10 kHz absorption is negligible and 20·log10(R) spherical spreading dominates. attenuation_db_per_km grows rapidly above 100 kHz (~30 dB/km @ 200 kHz) — high-frequency imaging sonars are inherently short-range. sound_speed_m_s sits near 1490 m/s in temperate ocean water; cold polar water is ~1450, warm tropical ~1530.',
    usage_pattern: 'Sizes AUV sonar payload — imaging sonar (100-500 kHz, short range) vs side-scan (50-500 kHz) vs sub-bottom profiler (<10 kHz, deep penetration). Feeds the acoustic-comms link-budget tool and the obstacle-avoidance sensor selection.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Spacecraft / Satellite tools
  // ──────────────────────────────────────────────────────────────────────
  'attitude:disturbance-torque': {
    description: 'Computes the gravity-gradient, aerodynamic-drag, and solar-radiation-pressure disturbance torques on a CubeSat / SmallSat, then sizes the reaction-wheel angular-momentum capacity needed to counter them over one orbit.',
    origin: 'In-tree implementation of Wertz "Spacecraft Attitude Determination and Control" (Springer/Kluwer 1978) chapters 17-18 plus Larson/Wertz SMAD 3rd ed. §11.1. Gravity-gradient torque T_gg = (3μ/R³) × (I_z − I_x) × sin(2θ); aerodynamic torque uses NRLMSISE-00 atmospheric density.',
    results_interpretation: 'total_disturbance_nm is the worst-case torque the ADCS must counter; at LEO 400 km it sits near 10⁻⁶ N·m for a 3U CubeSat. actuator_required_nms is the reaction-wheel storage capacity — typically 3 × T_disturbance × T_orbit / 4 for a once-per-orbit unloading cycle. If the disturbance dominates at one altitude, that\'s the rate at which the wheels saturate and need a magnetorquer dump.',
    usage_pattern: 'Runs early in the SmallSat / CubeSat ADCS chain to set the reaction-wheel storage requirement, which then feeds reaction-wheel:sizing and magnetorquer:sizing for the desaturation system.',
  },

  'battery-eclipse:cycle': {
    description: 'Sizes a spacecraft battery for the orbital eclipse load — depth-of-discharge per orbit, total cycles over mission life, and capacity-fade against allowable end-of-life capacity.',
    origin: 'In-tree implementation based on Linden\'s Handbook of Batteries (4th ed., 2010) chapter 27 plus NASA/TM-2009-215617. LEO eclipse fraction ~35 % per 90-minute orbit; GEO eclipse fractions seasonally vary 0-72 minutes. Allowable DoD per chemistry: 15-25 % LEO 5-year, 40-60 % GEO.',
    results_interpretation: 'discharge_depth_pct_per_orbit must stay within the allowed envelope (15-25 % for LEO long-life, 40-60 % for GEO). total_cycles_lifetime is the count the battery sees over the mission — ~30,000 for a 5-year LEO mission. capacity_required_wh is the sized capacity including the oversize-factor (typically 2-3× the eclipse-load Wh).',
    usage_pattern: 'Sizes the spacecraft battery line item. Couples with solar-array:spacecraft (which generates power in sunlight) and orbital-thermal (which sets the temperature the cells operate at and therefore the fade rate).',
  },

  'chemical-propulsion:sizing': {
    description: 'Sizes a chemical-propulsion subsystem — bipropellant (MMH/NTO) or monopropellant (hydrazine) — for a target ΔV and dry mass, returning propellant mass, tank volume, thruster count, and burn time.',
    origin: 'In-tree implementation of Sutton & Biblarz "Rocket Propulsion Elements" 9th edition (Wiley 2016) Table 7.3 and Brown "Spacecraft Propulsion" (AIAA 2002) chapter 3. Standard Isp values: MMH/NTO 310 s, hydrazine 230 s, cold gas 60-80 s.',
    results_interpretation: 'propellant_mass_kg derived from Tsiolkovsky against assumed Isp; tank_volume_l includes ullage. burn_time_s_at_thrust tells the operations team whether the manoeuvre is short (impulsive) or long (continuous). If the propellant mass exceeds the dry mass the design is propellant-limited and electric propulsion may be a better fit.',
    usage_pattern: 'Sizes the propulsion-subsystem BoM for satellites and propulsion-thruster product designs. Reads ΔV requirements from delta-v-budget:mission and outputs tank + thruster specs that feed propellant-tank:sizing.',
  },

  'cold-gas-thruster:sizing': {
    description: 'Sizes cold-gas (N₂, butane) or warm-gas (resistojet NH₃) micro-thrusters for CubeSat / SmallSat fine pointing, formation flight, and small ΔV manoeuvres.',
    origin: 'In-tree implementation of Brown "Spacecraft Propulsion" chapter 6.10 (AIAA 2002) and Sutton "Rocket Propulsion Elements" chapter 18. Cold-gas Isp ≈ 50-80 s; warm-gas (resistojet) NH₃ ≈ 150-200 s. Gas properties at 300 K from standard reference tables.',
    results_interpretation: 'propellant_mass_kg is small (CubeSat-class total impulses of 100-500 N·s). tank_volume_l drives the propellant tank line item. lifetime_impulses tells you how many actuations the design supports — typically 10,000-100,000 over mission life. If tank pressure exceeds 200 bar, COPV (composite-overwrapped) construction is needed.',
    usage_pattern: 'Sizes the fine-pointing propulsion subsystem for CubeSats and SmallSats where chemical mono/biprop is overkill. Reads the total-impulse budget from delta-v-budget and produces thruster + tank specs.',
  },

  'cryocooler:sizing': {
    description: 'Sizes Stirling / pulse-tube / Joule-Thomson / sorption / TEC cryocoolers for IR-detector cooling, superconducting electronics, or cryogenic propellant pre-cool stages — outputs input power, mass, COP, and microphonic vibration.',
    origin: 'In-tree implementation referencing Ross ed. "Cryocoolers Vol 14" (Springer 2007) and Radebaugh 2003 "Cryocoolers: state of the art and recent developments" (J. Phys.: Condens. Matter). Carnot COP = T_cold / (T_hot − T_cold); real Stirling/PT/JT cryocoolers run at 5-25 % of Carnot.',
    results_interpretation: 'input_power_w is the wall-plug power required to lift cooling_load_w from target_temp_k to sink_temp_k. cop_actual / cop_carnot_max gives the efficiency-vs-ideal ratio. microphonic_vibration_n is critical for cooled-imager pointing — IR detectors sit on the cold finger and any vibration becomes a line-of-sight wobble.',
    usage_pattern: 'Sizes the cryogenic-thermal line item on satellites (IR sensor cooling) and quantum/interplanetary platforms. Couples with thermal-strap:conduction (which carries heat to the cold finger) and the dilution-fridge tools downstream for sub-kelvin systems.',
  },

  'delta-v-budget:mission': {
    description: 'Sums and classifies all spacecraft ΔV requirements over the mission profile — launch insertion, transfer manoeuvres, station-keeping, ADCS unloading, and end-of-life deorbit — then sizes the total propellant.',
    origin: 'In-tree implementation of Wertz/Larson "Space Mission Analysis and Design" (SMAD) 3rd ed., §7.6. Σ ΔV = transfer + station-keeping × lifetime + ADCS unloading + deorbit + margin. Each phase sized per mission profile and launch-vehicle injection accuracy.',
    results_interpretation: 'total_delta_v_ms is the lifetime ΔV the propulsion system must deliver. Typical LEO-SSO satellite: 50 m/s insertion + 12 m/s/yr stationkeeping + 150 m/s deorbit ≈ 260 m/s over 5 years. total_propellant_mass_kg from Tsiolkovsky — must fit inside the launch-vehicle envelope and the dry-mass-fraction budget.',
    usage_pattern: 'Runs early in the satellite-mission design to size the propulsion subsystem. Feeds propellant-tank:sizing, chemical-propulsion:sizing or electric-propulsion:sizing, and the dry-mass budget.',
  },

  'electric-propulsion:sizing': {
    description: 'Sizes an electric-propulsion subsystem — Hall thruster, gridded ion, pulsed-plasma, or colloidal — for a target ΔV given available power, mission duration, and dry mass.',
    origin: 'In-tree implementation of Goebel & Katz "Fundamentals of Electric Propulsion: Ion and Hall Thrusters" (JPL/Wiley 2008). Standard Isp values: Hall SPT-100 1500 s, gridded ion NSTAR 3100 s, T6 4400 s, PPT 1000 s. Thrust = 2 × P × η / (Isp × g0).',
    results_interpretation: 'thrust_mn is typically 20-200 mN — small compared to chemical, so total_burn_time_days runs into months. propellant_mass_kg is far lower than chemical for the same ΔV. PPU_efficiency_pct (typically 90-93 %) sizes the power-conditioning subsystem. If burn time exceeds the mission window the design is power-limited.',
    usage_pattern: 'Sizes the EP subsystem for GEO comsats (north-south station-keeping), interplanetary probes, and any platform where Isp matters more than thrust. Reads ΔV from delta-v-budget and the available power-bus from solar-array:spacecraft.',
  },

  'launch-vibration:miles-eqn': {
    description: 'Computes the random + sine vibration response of a spacecraft payload at its first natural frequency under launch-vehicle vibration spectra — outputs peak g-loading, fatigue cycles, and Miles-equation grms.',
    origin: 'In-tree implementation of Wijker "Mechanical Vibrations in Spacecraft Design" (Springer 2004) plus Miles 1954 "On Structural Fatigue Under Random Loading". Launch-vehicle envelopes from SpaceX Falcon-9 Payload User\'s Guide (2024), Arianespace A6 User Manual, and other LV manuals.',
    results_interpretation: 'random_grms_response is the RMS acceleration at the payload\'s first mode — typically 5-20 grms for SmallSats on Falcon-9. peak_load_factor under sine sweep is Q × g_input at resonance; designs aim for Q < 30 to keep loads survivable. fatigue_cycles_lifetime drives the Miner\'s-rule structural margin.',
    usage_pattern: 'Mandatory check in the structural-design gate for any launched spacecraft or propulsion product. Outputs feed launch-readiness reviews and the vibration-isolator (if required) BoM line item.',
  },

  'magnetorquer:sizing': {
    description: 'Sizes magnetic torque-rods (mag-rods / magnetorquers) — coil turns, current, mass — that use Earth\'s magnetic dipole field to apply attitude-control torque and unload reaction-wheel momentum.',
    origin: 'In-tree implementation of Wertz "Spacecraft Attitude Determination and Control" §6.6 + IGRF-13 Earth-magnetic-field model. Torque T = m × B (cross product); Earth dipole field |B| = (μ₀ M_E / 4π r³) × √(1 + 3 sin²λ) where M_E = 7.96 × 10²² A·m².',
    results_interpretation: 'magnetic_dipole_moment_am2 is the moment the coil must generate (typically 0.1-10 A·m² for CubeSats). coil_turns and coil_current_a set the power draw — must fit inside the ADCS power budget. time_to_unload_minutes tells how fast the magnetorquer can dump a saturated wheel; longer than the disturbance accumulation = persistent ADCS oversaturation.',
    usage_pattern: 'Sizes the reaction-wheel desaturation system for any LEO satellite. Reads required torque from attitude:disturbance-torque and produces coil specs that feed the BoM.',
  },

  'mli:multi-layer-insulation': {
    description: 'Computes the effective emissivity and conductive heat leak of a multi-layer-insulation blanket (aluminised Mylar / Kapton with Dacron net spacers) on a spacecraft surface or cryogenic tank.',
    origin: 'In-tree implementation of Cunnington & Tien 1971 "Heat-transfer mechanisms in multilayer insulation" (NASA SP-227 ch.6). ε_eff = (ε / (2 − ε)) / N for N layers; penetrations and edge effects multiplicatively degrade shielding.',
    results_interpretation: 'effective_emissivity drops with layer count (10-20 layers gives ε_eff ~ 0.01-0.03). heat_leak_w_m2 is the residual conductive + radiative loss — typical good blankets achieve 0.5-2 W/m² between 300 K and 100 K. penetration_penalty_pct surfaces the real-world degradation from stand-offs and edges, often 30-100 %.',
    usage_pattern: 'Sizes thermal blankets for any spacecraft thermal-control subsystem. Outputs feed orbital-thermal:sat-balance (it sets the conductive heat-leak boundary condition) and the BoM\'s blanket mass + area line items.',
  },

  'nrlmsise00:leo-density': {
    description: 'Returns atmospheric density, temperature, and pressure at LEO altitudes (80-1000 km) using the NRLMSISE-00 model — needed for satellite drag calculations beyond the 80 km cap of the `ambiance` library.',
    origin: 'In-tree implementation using tabulated NRLMSISE-00 values for low (F10.7 = 80), mean (F10.7 = 150), and high (F10.7 = 220) solar activity, per Picone, Hedin, Drob & Aikin 2002 J. Geophys. Res. 107(A12):1468. Extended above 1000 km with US Standard Atmosphere 1976.',
    results_interpretation: 'density_kg_m3 at 400 km LEO ranges from 1 × 10⁻¹² (solar minimum) to 1 × 10⁻¹¹ (solar maximum) — a 10× span that drives orbital decay rate. scale_height_m sets how fast density falls with altitude. If solar activity is high the mission needs more propellant for drag make-up.',
    usage_pattern: 'Feeds attitude:disturbance-torque (drag-torque component) and any orbital-decay / deorbit calculation. Doesn\'t set design decisions on its own — it\'s the atmosphere model the spacecraft tools depend on.',
  },

  'orbit-propagator:j2': {
    description: 'Propagates a Keplerian orbit including J2 secular drift (RAAN precession, argument-of-perigee rotation) plus eclipse fraction — uses astropy for constants/time and SGP4 when a TLE pair is supplied.',
    origin: 'Open-source astropy v6+ (BSD-3-Clause, NASA-supported) for constants/time/coordinates plus open-source `sgp4` (Brandon Rhodes, MIT) for TLE propagation. Vallado closed-form J2 secular formulas remain the analytical core. CODATA 2018 + IAU 2015 constants from astropy.constants.',
    results_interpretation: 'period_minutes from Kepler\'s third law (~90 min at 400 km LEO, 24 h at GEO). raan_drift_deg_per_day from J2 — typically 5-7°/day at LEO 400 km (drives sun-synchronous inclination). eclipse_fraction_pct sized via sphere-shadow geometry — 35 % at LEO 400 km, 0-12 % at GEO depending on season.',
    usage_pattern: 'Sizes mission-design parameters (orbit selection, ground-pass cadence). Couples with battery-eclipse:cycle (which needs eclipse_fraction) and solar-array:spacecraft (which needs the sunlit fraction).',
  },

  'orbital-thermal:sat-balance': {
    description: 'Computes equilibrium spacecraft skin temperature in sunlight and eclipse using a steady-state heat balance — solar input + Earth IR + albedo + internal dissipation vs radiative output.',
    origin: 'In-tree implementation of Gilmore "Spacecraft Thermal Control Handbook" Vol I (AIAA 2002). Steady-state balance: α × Q_solar + ε × Q_earth_IR + Q_internal = ε × σ × T⁴ × A. Solar constant 1361 W/m² at 1 AU.',
    results_interpretation: 'equilibrium_temp_c_sun is the sun-pointing temperature, typically -10 to +50 °C for a coated LEO satellite. equilibrium_temp_c_eclipse drops to -30 to -100 °C without internal dissipation. Designs control α/ε ratio via coatings — white paint ~0.22, OSR ~0.10, anodised aluminium ~0.5. If the design swings >100 °C between sun and eclipse the thermal-blanket coverage is insufficient.',
    usage_pattern: 'Sizes the thermal-control subsystem (radiators, MLI, heaters) for any spacecraft. Couples with radiator:spacecraft-sizing (which sets the radiator area) and mli:multi-layer-insulation (which sets the blanket heat-leak).',
  },

  'propellant-tank:sizing': {
    description: 'Sizes a spacecraft propellant tank — spherical or cylindrical — for a chosen propellant, mass, pressure, and feed type (blowdown / regulated / pump-fed), returning wall thickness, volume, and tank mass.',
    origin: 'In-tree implementation of ASME BPVC Section VIII Division 1 (2023) plus Roark\'s Formulas for Stress and Strain Table 13.1. Sutton "Rocket Propulsion Elements" chapter 6.7 for propulsion-specific design factors. Spherical hoop stress σ = P × r / (2t); safety factor 1.5-2.0 per ASME.',
    results_interpretation: 'tank_mass_kg drives the dry-mass budget; mass_fraction_pct (propellant / total) should sit at 80-90 % for an efficient design. Ti-6Al-4V is the workhorse material; CFRP overwrap gives 30-50 % mass reduction on high-pressure helium pressurant tanks. If safety factor falls below 1.5 the design is non-compliant and a thicker wall is mandatory.',
    usage_pattern: 'Sizes the tank line item for any propulsion subsystem. Reads propellant mass + pressure from chemical-propulsion:sizing or electric-propulsion:sizing and produces a tank spec.',
  },

  'radiator:spacecraft-sizing': {
    description: 'Sizes a spacecraft radiator using the Stefan-Boltzmann equation — radiator area, mass, and operating temperature for a given dissipation, sink temperature, surface absorptivity, and IR emissivity.',
    origin: 'In-tree implementation of Gilmore "Spacecraft Thermal Control Handbook" Vol I (AIAA 2002) chapter 4. Q = ε × σ × A × (T_rad⁴ − T_env⁴). White OSR (optical solar reflector) gives α ≈ 0.10 and ε ≈ 0.85, ratio ~0.12.',
    results_interpretation: 'radiator_area_m2 needed to reject the dissipation at the radiator operating temperature; 300 K radiator dumping to 3 K deep space achieves ~400 W/m². radiator_mass_kg adds 4-8 kg/m² for honeycomb-OSR construction. If radiator area exceeds 50 % of the spacecraft surface, deployable panels become necessary.',
    usage_pattern: 'Sizes the radiator BoM line item for any spacecraft or high-power edge-AI / HAPS thermal-control subsystem. Reads dissipation from the electronics + propulsion + payload budgets.',
  },

  'reaction-wheel:sizing': {
    description: 'Sizes the Reaction Wheel Assembly (RWA) — peak torque, angular-momentum capacity, saturation RPM, and mass — for a satellite slew agility requirement plus disturbance-torque budget.',
    origin: 'In-tree implementation of Wertz "Spacecraft Attitude Determination and Control" chapter 7 + Sidi "Spacecraft Dynamics and Control" §7.5 + Honeywell HR-Series datasheets. Required torque T_req = I × α + T_disturbance; momentum H = I_wheel × ω_wheel_max.',
    results_interpretation: 'torque_required_nm sized 2× peak; momentum_capacity_nms sized 10× the once-per-orbit disturbance integral. saturation_rpm tells you how fast the wheel approaches its mechanical limit — once saturated, magnetorquers or thrusters must unload it. wheel_count "3_pyramid" gives full 3-axis with no redundancy; "4_redundant_pyramid" survives a single-wheel failure.',
    usage_pattern: 'Sizes the ADCS reaction-wheel line item for any satellite. Couples with attitude:disturbance-torque (torque budget) and magnetorquer:sizing (desaturation system).',
  },

  'solar-array:spacecraft': {
    description: 'Sizes a spacecraft solar array for orbital-average power requirement — array area, mass, peak power, cell count, and string voltage — accounting for cell efficiency, packing factor, eclipse fraction, and end-of-life degradation.',
    origin: 'In-tree implementation of Wertz/Larson SMAD 3rd ed. §11.4 + Patel "Spacecraft Power Systems" chapter 6. Solar flux 1361 W/m² at 1 AU; triple-junction GaAs cells 28-32 % BOL; degradation 2-3 %/year in LEO from radiation + UV.',
    results_interpretation: 'array_area_m2 sized for EOL power requirement; peak_power_w at BOL noon is typically 1.4× the orbital-average. array_mass_kg adds 2-5 kg/m² for honeycomb-backed panels, 0.5-1 kg/m² for flexible thin-film. If the array area exceeds 6 m² per kW, deployable wings are needed.',
    usage_pattern: 'Sizes the power-generation subsystem for any spacecraft. Couples with battery-eclipse:cycle (eclipse fraction sets battery requirement) and orbit-propagator:j2 (which sets the eclipse + sunlit times).',
  },

  'thermal-strap:conduction': {
    description: 'Computes the thermal conductance of a flexible thermal strap (OFHC copper, pyrolytic graphite, K1100 CFRP) connecting a component to a radiator or cryocooler cold finger, including bolted-joint contact resistance.',
    origin: 'In-tree implementation of Gilmore "Spacecraft Thermal Control Handbook" Vol I chapter 8 plus ECSS-E-ST-31C (Thermal Control General Requirements). Bulk conduction R = L / (k × A); contact-conductance values from Marotta & Fletcher 1996 and ECSS-E-HB-31-01.',
    results_interpretation: 'thermal_resistance_k_w of a copper braid strap typically lands at 0.5-5 K/W; pyrolytic graphite is 2-3× better per gram. effective_conductance_w_k = 1 / R_total drives how much heat the strap can move at a given ΔT. flexibility_score tells you whether the strap can absorb thermal-cycling deformation without fatigue.',
    usage_pattern: 'Sizes component-to-radiator coupling for spacecraft thermal control. Reads heat load from electronics + payloads and outputs strap mass + length to the BoM.',
  },

  'tsiolkovsky:delta-v': {
    description: 'Solves the Tsiolkovsky rocket equation — computes ΔV from mass ratio and specific impulse, or back-solves propellant mass for a target ΔV.',
    origin: 'In-tree implementation of Tsiolkovsky (1903) "Issledovanie mirovykh prostranstv reaktivnymi priborami" — the foundational equation of rocketry. ΔV = Isp × g0 × ln(m_initial / m_final). Lossless rocket equation; gravity/atmosphere losses added separately.',
    results_interpretation: 'delta_v_ms is the achievable ΔV at the input Isp and mass ratio. mass_ratio = m_initial / m_final = exp(ΔV / (Isp × g0)). propellant_mass_fraction = (m_initial − m_final) / m_initial. A typical Hohmann LEO-to-GEO transfer needs ΔV ~ 3900 m/s.',
    usage_pattern: 'Foundation for delta-v-budget:mission and all propulsion-sizing tools. Doesn\'t set design decisions on its own — it\'s the equation other tools call.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Aero / Drone / HAPS / eVTOL tools
  // ──────────────────────────────────────────────────────────────────────
  'bemt-propeller:thrust': {
    description: 'Computes propeller thrust, torque, power, and efficiency using Blade-Element Momentum Theory (BEMT) — for drones, HAPS, AUVs, and small wind turbines.',
    origin: 'In-tree implementation of Glauert 1935 "Airplane Propellers" (in Aerodynamic Theory ed. Durand Vol IV Div L) plus Drela MIT 2006 "QPROP Formulation". Section lift/drag via thin-airfoil + UIUC Propeller Database (Selig et al.) empirical fits. McCormick "Aerodynamics, Aeronautics and Flight Mechanics" chapter 6.',
    results_interpretation: 'thrust_n at design RPM must exceed the platform weight (drone) or drag (AUV/wind). efficiency at design point (typically 0.6-0.8 for well-matched propellers) directly drives battery sizing. tip_speed_m_s above 0.7 × Mach 1 incurs compressibility losses — that\'s the limit for high-RPM small props.',
    usage_pattern: 'Sizes the propulsion module for any propeller-driven platform. Couples with motor-prop:matching (which finds the motor/prop intersection) and gust-response:drone (which checks gust-loading margin).',
  },

  'bvlos-part23:certification': {
    description: 'Estimates FAA Part 23 / EASA SC-VTOL / SFAR-88 certification cost, timeline, and design-assurance level (DAL-A/B/C) for an eVTOL or large drone certification programme.',
    origin: 'In-tree implementation against FAA Order 8110.4C "Type Certification" + EASA Special Condition SC-VTOL-01 (2019) + FAA SFAR-88 / Part 21.17(b). Industry-typical cost/timeline curves from Joby Aviation S-1 (2022) and Vertical Aerospace S-1 (2021) public filings.',
    results_interpretation: 'cost_estimate_gbp is the all-in cost from preliminary design to type certificate; typical 4-passenger commercial eVTOL: £400 M-£1 Bn. timeline_years (typically 5-8) is the schedule. design_assurance_level (DAL-A for life-critical, B for safety, C for less critical) drives every aspect of the V-model.',
    usage_pattern: 'Runs in the regulatory section for eVTOL and large-drone designs. Outputs feed the financial section + cap the operating envelope (Part 23 vs Part 25 vs SFAR).',
  },

  'downwash-recirculation:multirotor': {
    description: 'Computes multi-rotor downwash recirculation effects — induced velocity, ground-effect lift, hover-out-of-ground-effect penalty, and inter-rotor interference power loss.',
    origin: 'In-tree implementation of momentum theory (Leishman "Principles of Helicopter Aerodynamics" chapter 5) plus McAlister & Lehman 1997 and Conyers 2018 PhD U. Texas Austin. Ground effect T_IGE/T_OGE = 1 / (1 − (R/(4z))²) for z > R/2.',
    results_interpretation: 'power_loss_pct from recirculation grows with rotor proximity — 1.5 diameters apart loses ~10 %, 1.0 diameter loses 20 %+. HIGE_to_HOGE_ratio is the lift bonus in ground effect (1.05-1.25). recirculation_severity grades the design from low (clear of issues) to severe (must redesign).',
    usage_pattern: 'Sizes the rotor layout for multi-rotor drones and eVTOLs. Reads disk loading from bemt-propeller and produces inter-rotor spacing requirements that feed the airframe geometry.',
  },

  'gimbal:cog-balance': {
    description: 'Computes the centre-of-gravity offset and required motor torque for a camera gimbal (2- or 3-axis brushless) on a drone — sizes BLDC motor torque against payload moment.',
    origin: 'In-tree implementation of Gross, Hauger, Schroeder, Wall "Engineering Mechanics 1: Statics" 13th ed. (Springer 2018). BLDC gimbal motor torque constants 0.1-0.3 N·m/A from manufacturer datasheets.',
    results_interpretation: 'motor_torque_required_ncm at each axis must exceed payload_mass × lever_arm × g (worst case at horizontal). cog_offset_mm must be < 2 mm for unbalanced gimbal compensation; >5 mm and the motor saturates. Typical sub-200 g camera: 5-30 N·cm gimbal torque per axis.',
    usage_pattern: 'Sizes the gimbal subsystem for camera-carrying drones. Reads camera mass + dimensions from the brief and produces motor specs that feed the BoM.',
  },

  'gust-response:drone': {
    description: 'Computes a small UAV / drone\'s gust-load response per FAR 23.341 — gust load factor, attitude excursion, and recovery time for a derived equivalent gust velocity.',
    origin: 'In-tree implementation of Pamadi "Performance, Stability, Dynamics, and Control of Airplanes" (AIAA 1998) plus ASTM F3322-18 (Small Unmanned Aircraft Crashworthiness). Light-aircraft gust load Δn = ρ × V × CL_α × U_de / (2 × W/S).',
    results_interpretation: 'gust_load_factor is the multiplier on steady-state lift the gust applies; for ASTM F3322 it must withstand 50 ft/s gust at cruise. recovery_time_ms for a multi-rotor is dominated by attitude controller bandwidth — typically 200-400 ms after a 30 m/s gust on a 0.5 m drone. If the load factor exceeds 4.5 g the airframe needs structural reinforcement.',
    usage_pattern: 'Mandatory check for any drone or fixed-wing UAV design. Reads geometry from bemt-propeller / aerosandbox and produces gust-survival margins that feed the airframe stress analysis.',
  },

  'motor-prop:matching': {
    description: 'Matches a BLDC motor (Kv, Rm, idle current) against a propeller load curve to find the steady-state operating point — hover throttle, max thrust, current draw — for a multi-rotor drone or small UAS.',
    origin: 'In-tree implementation based on the standard DC motor model (I = (V − K_v·ω) / R, T = K_v·I) and the eCalc methodology that motor-prop matchers use commercially. Propeller load curve from BEMT.',
    results_interpretation: 'hover_throttle_pct is what fraction of motor capacity the platform consumes at hover — should sit at 40-60 % to leave climb/manoeuvre headroom. thrust_to_weight_ratio < 1.5 makes the platform sluggish; > 4 is over-designed for endurance. peak_current_a sets the ESC current rating.',
    usage_pattern: 'The matching tool between bemt-propeller (prop side) and the motor catalogue (T-Motor, KDE, etc.). Produces the operating point that drives ESC + battery sizing.',
  },

  'pilot-workload:cooper-harper': {
    description: 'Computes Cooper-Harper handling-qualities rating (1-10 scale) and MIL-STD-1797A pass/fail for an eVTOL or piloted-rotorcraft design from its response bandwidth, control force, and stability margin.',
    origin: 'In-tree implementation of Cooper & Harper 1969 NASA TN D-5153 + ADS-33E-PRF + MIL-STD-1797A. Empirical Cooper-Harper score from response-bandwidth criteria for rotorcraft per ADS-33.',
    results_interpretation: 'cooper_harper_rating ≤ 3 is satisfactory, 4-6 adequate but warrants improvement, 7+ deficient and unacceptable. MIL-STD-1797A pass requires bandwidth > 2.0 rad/s and control force < 35 N pitch / 25 N roll. If rating > 3 the design needs control-law tuning or airframe rework before piloted flight.',
    usage_pattern: 'Mandatory pre-flight check for piloted eVTOL designs. Reads dynamic-response numbers from the flight-control model and outputs a handling-qualities verdict that feeds the certification pack.',
  },

  'regulatory-caa:part107': {
    description: 'Looks up UK CAA / FAA Part 107 / EASA drone certification category, training requirements, and operating limits based on drone mass, range, and operational profile (VLOS / BVLOS / over crowds).',
    origin: 'In-tree compilation of UK CAA CAP 722 (UAS Operations in UK Airspace), 14 CFR Part 107 (USA Small UAS), EASA Implementing Regulation 2019/947, and CASA Part 101 MOS. Updated quarterly.',
    results_interpretation: 'category (Open A1/A2/A3, Specific, Certified) determines which permit regime applies. operating_limits enumerates the distance-from-people, altitude, and BVLOS caps. training_required tells the buyer whether their operators need A1/A3 online course (€20-100) or A2 CofC (€200-500) or full GVC + OSC for BVLOS.',
    usage_pattern: 'Runs in the regulatory section for any drone design. Outputs feed the operator-training section + cap the operating envelope.',
  },

  'rotor-tilt-transition:dynamics': {
    description: 'Computes eVTOL tilt-rotor / tilt-wing transition dynamics — total lift, required thrust, transition-corridor airspeed, and rotor-vs-wing lift split — at intermediate tilt angles.',
    origin: 'In-tree implementation of McDonald 2018 PhD U. Stuttgart + NASA TM-2018-219768 "Tiltrotor Conversion Corridor". Force balance: L = T·cos(tilt) + (½)·ρ·V²·S·CL. Momentum theory for hover/forward thrust.',
    results_interpretation: 'transition_corridor_speed_ms is the minimum forward speed at which the wing can fully support weight (typically 35-55 m/s for 4-pax eVTOLs). rotor_lift_n vs wing_lift_n splits the load during transition — if rotor_lift dominates above 45° tilt, the controllability gets fragile. thrust_required_n at each tilt angle drives the rotor/motor sizing curve.',
    usage_pattern: 'Mandatory check for tilt-rotor / tilt-wing eVTOLs (Joby, Archer, Lilium-class). Reads wing area + rotor count from the airframe geometry and outputs the transition-mode flight envelope.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // BESS / EV / Electrical tools
  // ──────────────────────────────────────────────────────────────────────
  'arc-flash:ieee-1584': {
    description: 'Computes arc-flash incident energy (cal/cm²), arc-flash boundary, and PPE category per IEEE 1584-2018 for an electrical work-point — given prospective fault current, voltage, gap, and enclosure type.',
    origin: 'In-tree implementation of IEEE 1584-2018 "Guide for Performing Arc-Flash Hazard Calculations" + NFPA 70E-2024 Table 130.7(C)(15)(c). E_arc = 4.184 × Cf × E_n × (t/0.2) × (610^x / D^x). PPE categories 0-4 from NFPA 70E.',
    results_interpretation: 'incident_energy_cal_cm2 puts the work-point in a PPE category: < 1.2 (basic FR), 1.2-4 (Cat 1), 4-8 (Cat 2), 8-25 (Cat 3), 25-40 (Cat 4). Above 40 cal/cm² no PPE is certified — the design must reduce arc duration via faster breakers or limit fault current with a reactor. arc_flash_boundary_m tells where bystanders must stay outside.',
    usage_pattern: 'Runs in the electrical-safety gate for BESS, EV chargers, electrolysers, and wind-turbine designs. Outputs feed the labelling and operator-training sections.',
  },

  'battery-c-rate-thermal:check': {
    description: 'Checks a battery cell\'s thermal viability under high C-rate discharge (drone / EV / power-tool duty cycles) — predicts temperature rise, cooling-mode adequacy, and thermal-runaway margin.',
    origin: 'In-tree implementation of Bandhauer, Garimella, Fuller 2011 "A Critical Review of Thermal Issues in Lithium-Ion Batteries" (J. Electrochem. Soc. 158(3):R1-R25). Cell heat Q = I² × R + |T × dV/dT| × I; thermal-runaway onset T_onset chemistry-dependent (NMC ~150 °C, LFP ~270 °C).',
    results_interpretation: 'temp_rise_per_cycle_c and max_safe_c_rate together determine whether the chosen cooling (passive air, forced air, liquid plate) can hold the cell below the thermal-runaway onset. Liquid cold-plate (h ~200-500 W/m²·K) enables 30C+ discharge; passive air (h ~5-10) caps at <5C without aggressive derating.',
    usage_pattern: 'Critical check in the BESS/EV/e-bike battery design. Reads C-rate from the discharge profile and produces a pass/fail on the cooling architecture before sizing the chiller / fans.',
  },

  'cable:ampacity': {
    description: 'Sizes DC and AC bus-bar / cable cross-sections per IEC 60364-5-52 — outputs current rating, voltage drop, and installation-method derating for a given current, length, and ambient temperature.',
    origin: 'In-tree implementation of IEC 60364-5-52:2009 (Wiring systems) plus IEEE 835-1994 (Standard Power Cable Ampacity Tables) and IEC 60287 cable rating. Steady-state thermal balance I² × R = h × A × (T_conductor − T_amb).',
    results_interpretation: 'cable_csa_mm2 sets the conductor size; voltage_drop_v_per_100m must stay under 3 % of nominal voltage per IEC 60364-5-52. ampacity_a is the de-rated current the cable can carry continuously in the chosen installation method (buried, in conduit, on tray, etc.). Aluminium needs ~1.6× the copper area for the same ampacity.',
    usage_pattern: 'Sizes every power-distribution cable in the BESS / EV / electrolyser / wind / solar BoM. Reads the operating current from the inverter / charger / electrolyser stack and produces a cable specification.',
  },

  'cable:thermal-rating': {
    description: 'Sizes EV charging cable + connector thermal rating per IEC 62893 — predicts cable temperature rise, required cross-section, and liquid-coolant flow rate for high-current DC fast-charging cables.',
    origin: 'In-tree implementation of IEC 62893-1:2017 (Charging cables for electric vehicles) + IEC 60364-5-52 + LBNL DC Charging Cable Cooling Study (2020). Cable temperature rise ΔT = I² × R × R_thermal; liquid coolant flow Q = Q_total / (ρ × Cp × ΔT_acceptable).',
    results_interpretation: 'cable_temp_rise_c must stay below the insulation rating (typically 90 °C conductor, 60 °C surface for human-contact safety). liquid_cooling_required_lpm enables 350+ kW charging through a flexible cable; > 500 A typically needs active cooling. ohmic_loss_w at 500 A is around 200-400 W per side — that\'s the heat the cooling system must dump.',
    usage_pattern: 'Sizes the EV-charger output cable + connector. Reads peak current from ev-charging-curve:taper and produces a cable + cooling spec that feeds the BoM.',
  },

  'cell-balance:model': {
    description: 'Models passive vs active battery cell balancing — energy loss, balancing time, and per-cell cost — for a multi-cell battery pack with a given imbalance.',
    origin: 'In-tree implementation of Daowd et al. 2011 IEEE VPPC "Passive and active battery balancing comparison based on MATLAB simulation" + Andrea "Battery Management Systems for Large Lithium-Ion Battery Packs" (Artech House 2010).',
    results_interpretation: 'balance_time_hours for passive (shunt-resistor) balancing typically runs 6-48 h for a 1 % imbalance; active balancing (charge-shuttle) does it in minutes. energy_loss_wh is dissipated as heat in passive (free to leak), recovered in active. balancing_cost_per_cell_gbp is £0.05 passive, £0.50-2.00 active — drives the BMS-architecture choice.',
    usage_pattern: 'Sizes the BMS line item for BESS / EV / e-bike packs. Outputs feed the BMS spec + the long-cycle warranty calculation.',
  },

  'enclosure-emc:margin': {
    description: 'Predicts EMC compliance margin (CISPR 22 / EN 55032 / FCC Part 15) for an electronic enclosure — radiated emissions in dBμV/m at 3 m, required shielding effectiveness, and material choice.',
    origin: 'In-tree implementation of CISPR 22 / EN 55032 + FCC Part 15 Subpart B + Ott "Electromagnetic Compatibility Engineering" 2nd ed. (Wiley 2009). Shielding effectiveness SE = A + R + B (absorption + reflection + multi-reflection).',
    results_interpretation: 'predicted_emissions_dbuv_m at 3 m must fall below the class limit (Class B = 30 dBμV/m for residential, Class A = 40 dBμV/m for industrial at 30 MHz). compliance_margin_db should be 6-10 dB to allow for unit-to-unit variation. required_shielding_db drives the enclosure material — plastic + metallisation gives 20-30 dB, die-cast aluminium 40-60 dB.',
    usage_pattern: 'Runs in the EMC pre-compliance gate for edge AI / BESS / EV / CGM products. Outputs feed the enclosure-material BoM line item.',
  },

  'fire-suppression:nfpa': {
    description: 'Sizes a clean-agent fire-suppression system (Novec 1230, FM-200, IG-541 Inergen) per NFPA 2001 / ISO 14520 for a protected volume — outputs agent mass, cylinder count, and discharge time.',
    origin: 'In-tree implementation of NFPA 2001:2022 "Standard on Clean Agent Fire Extinguishing Systems" + UL EX1741 listing data. Agent mass m = V_room × ρ_agent × (C_design / (100 − C_design)); safety factor + leakage allowance per NFPA 2001.',
    results_interpretation: 'agent_mass_kg is what each container must store; Novec 1230 needs 4.5 % concentration for Li-ion, FM-200 7 %, IG-541 37.5-43 %. cylinder_count drops with concentration efficiency — Novec is the best for Li-ion fires. discharge_time_seconds must hit 10 s per NFPA 2001 to flood before flame propagation.',
    usage_pattern: 'Sizes the fire-suppression line item for BESS containers and H2 electrolyser rooms. Reads the protected volume from the enclosure geometry and produces the agent + cylinder spec.',
  },

  'grounding-lightning:ieee-998': {
    description: 'Sizes earthing electrodes (rods, mats) + lightning-protection levels per IEC 62305 and BS 7430 — outputs earth resistance, rod count, and Lightning Protection Level (LPL I-IV).',
    origin: 'In-tree implementation of IEC 62305-1/2/3/4:2010 (Protection against lightning) + BS 7430:2011 (Earthing). Earth-electrode impedance from Dwight\'s formula R = ρ_soil / (2π·L) × ln(8L/d). LPL per IEC 62305-2.',
    results_interpretation: 'earth_resistance_ohm must sit below 10 Ω (general purpose) or 1 Ω (lightning-exposed installations); rod_count adjusts to bring it down. lpl_required (I-IV) drives the down-conductor count, bonding cross-section, and surge-protective device rating. If soil resistivity exceeds 500 Ω·m the design needs a mat instead of rods.',
    usage_pattern: 'Sizes the earthing + lightning-protection line items for BESS, wind-turbine, solar-inverter, and any outdoor electrical asset. Outputs feed the structural-electrical drawings.',
  },

  'opendss:feeder-flow': {
    description: 'Performs distribution-feeder load flow with OpenDSS — bus voltages, feeder losses, and statutory voltage-limit check for a BESS or EV-charger interconnection.',
    origin: 'Open-source OpenDSS (BSD-3-Clause, EPRI), Dugan & McDermott 2011 IEEE PES General Meeting "An open source platform for collaborating on smart grid research". Distribution-feeder power flow + radial/meshed analysis via current-injection nodal solver.',
    results_interpretation: 'bus_voltages_pu must stay within statutory limits (0.94-1.06 pu in the UK per ESQCR). feeder_losses_kw drives the round-trip-efficiency claim of the BESS or EV charger. If voltage limits are violated at peak export, the design needs a smart-inverter Q-V curve or a tap-changer transformer.',
    usage_pattern: 'Sizes the grid-side electrical interconnection for any grid-connected BESS or EV charger. Reads point-of-connection short-circuit data and outputs the distribution-network compliance verdict.',
  },

  'pcm:thermal-storage': {
    description: 'Sizes a phase-change-material (PCM) thermal-storage module — total absorption (kJ), melting temperature, latent heat, and solidification time — for transient peak heat absorption in spacecraft, HAPS, or BESS.',
    origin: 'In-tree implementation of ASHRAE Handbook of Fundamentals chapter 33 + Mehling & Cabeza "Heat and Cold Storage with PCM" (Springer 2008). Q = m × h_fusion; conduction-limited solidification time per Stefan-problem solution.',
    results_interpretation: 'total_absorption_kj is the heat the PCM can absorb during a peak event before fully melting; mass_efficiency_kj_per_kg of 150-250 is typical for paraffins, 200-300 for salt hydrates. solidification_time_minutes tells how long after the peak the PCM is ready to absorb again. If solidification time exceeds the duty cycle, the PCM gets stuck molten and stops working.',
    usage_pattern: 'Sizes transient thermal-storage for spacecraft (sun-eclipse swings), HAPS (turn-on transients), and BESS (peak C-rate events). Reads peak power and duration from the duty cycle.',
  },

  'power-module:sizing': {
    description: 'Sizes the number of DC-DC power modules (20/25/30/50 kW units) for a DC-fast EV charger — module count, redundancy (N+1 / N+2), cabinet size, and part-load efficiency.',
    origin: 'In-tree implementation calibrated against CharIN High-Power Charging White Paper (2022) + Phoenix Contact CCS Datasheets + ABB Terra HP + Tritium Veefil Series datasheets. Parallelised stack of fixed-rating DC-DC modules.',
    results_interpretation: 'module_count_with_redundancy includes the failure-tolerance margin (N+1 survives 1 failure; N+2 survives 2). efficiency_at_partial_load_pct typically 94-96 % at half load — drives the heat-management requirement. cabinet_size flips to "dual_cabinet" once module count exceeds ~10 — a major BoM cost step.',
    usage_pattern: 'Sizes the DC-DC stack in the EV-charger BoM. Reads total power from the charger spec and produces the per-module BoM line items.',
  },

  'warranty-reliability:battery': {
    description: 'Predicts battery calendar + cycle fade against warranty terms — expected failure rate, replacement-cost NPV, and warranty-survival probability over the warranty period.',
    origin: 'In-tree implementation calibrated against Bloomberg NEF Battery Price Survey 2024 + Wood Mackenzie Energy Storage Service + published warranty terms from Tesla, CATL, BYD, LG Chem. Combined Arrhenius (calendar) + Wöhler (cycle) fade model.',
    results_interpretation: 'survival_probability_pct at the warranty endpoint — designs aim for >95 %. expected_warranty_cost_gbp is the NPV the manufacturer must reserve. Typical LFP at 80 % DoD / 25 °C: 6000 cycles to 80 % capacity, ~15-year calendar life. Higher temperature halves life per 10 °C (Arrhenius).',
    usage_pattern: 'Runs in the financial-modelling gate for BESS / EV / e-bike products. Outputs feed the warranty-reserve line item + the LCOS (levelised cost of storage) calculation.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // EV charging / DC-fast tools
  // ──────────────────────────────────────────────────────────────────────
  'ccs-protocol:compliance': {
    description: 'Checks an EV-charger design against CCS Combo 1/2, ISO 15118-2/20, CHAdeMO, and NACS / SAE J3400 protocol limits — outputs max supported power, V2G capability, plug rating, and PnC / TLS feature support.',
    origin: 'In-tree implementation against ISO 15118-2:2014 + ISO 15118-20:2022 + IEC 61851-23:2014 + CHAdeMO Protocol IFC + SAE J3400 (NACS). Plug envelopes from each connector\'s published mechanical/electrical specification.',
    results_interpretation: 'compliance_pass = true if the design\'s declared voltage/current sit inside the plug + protocol envelope. max_power_supported_kw is the protocol-side cap (350 kW for CCS2 1000 V × 500 A, 250 kW for NACS, 400 kW for CHAdeMO 3.0). V2G_capable + PnC_supported flag whether the design unlocks vehicle-to-grid / Plug-and-Charge features.',
    usage_pattern: 'Runs in the EV-charger regulatory gate. Outputs feed the compatibility-matrix section of the report (which vehicles can charge at the declared rate).',
  },

  'ev-charging-curve:taper': {
    description: 'Models the CCS DC fast-charging curve — peak power plateau, taper knee, and constant-voltage end-stage — for an EV battery pack by SoC, chemistry, and temperature.',
    origin: 'In-tree implementation against Argonne National Lab FCEV technical data + Idaho National Lab BatteryPlus database + Wassiliadis et al. 2021 J. Energy Storage "Review of fast charging strategies for lithium-ion battery systems". Constant-current taper at SoC > knee until V_max, then constant-voltage.',
    results_interpretation: 'actual_max_power_per_soc_kw shows the per-SoC power envelope — NMC peaks 20-50 % SoC, LFP holds power until 70-80 %. total_charge_time_minutes for a 20→80 % charge on 60 kWh NMC at 150 kW: ~32 minutes. peak_c_rate above 2.5 C accelerates fade per the warranty model.',
    usage_pattern: 'Sizes the charger output spec + estimates the customer-facing charge-time claim. Couples with power-module:sizing and cable:thermal-rating downstream.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // VERTICAL FARM / Bioreactor / Process tools
  // ──────────────────────────────────────────────────────────────────────
  'agitation:power': {
    description: 'Computes stirred-tank bioreactor agitation power — impeller power number, Reynolds number, tip speed — for a chosen impeller type, RPM, and fluid properties, with gassed-power derating.',
    origin: 'In-tree implementation of Bates, Fondy, Corpstein 1963 Ind. Eng. Chem. Process Des. Dev. 2(4):310-314 "An Examination of Some Geometric Parameters of Impeller Power" + Doran "Bioprocess Engineering Principles" 2nd ed. chapter 8. P = N_p × ρ × N³ × D⁵.',
    results_interpretation: 'power_w is the mechanical power the agitator consumes; a Rushton turbine has N_p ≈ 5.0 in turbulent regime (Re > 10,000) — 3-5× higher than a marine prop. tip_speed_m_s above 2 m/s shears mammalian cells; bacterial fermentations tolerate 4-7 m/s. Gassed power drops 20-40 % below ungassed depending on vvm (volumetric gas flow per volume per minute).',
    usage_pattern: 'Sizes the agitator motor in a bioreactor BoM. Couples with kla-oxygen:transfer (which uses P/V as input) and dissolved-oxygen:control downstream.',
  },

  'biosteam:fermentation-stoich': {
    description: 'Computes fermentation mass + energy balance — substrate → product + CO₂ stoichiometry — for a chosen substrate/product pair (glucose→ethanol, sucrose→lactic acid, etc.) and yield factor.',
    origin: 'Open-source BioSTEAM (MIT, BioSTEAMDevelopmentGroup), Cortes-Pena, Kumar, Singh, Guest 2020 ACS Sustainable Chem. Eng. 8(8):3302-3310. Gibbs free-energy reactor modelling + DIPPR thermophysical properties (via Thermo). Mass/energy balances per Felder & Rousseau.',
    results_interpretation: 'product_mass_kg is what the bioreactor ships per batch; byproduct_co2_kg is the off-gas to capture or vent. theoretical_yield_pct (51.1 % glucose→ethanol mol fraction) is the upper bound; actual_yield_pct = theoretical × yield_factor (0.85-0.95 in well-run industrial fermentations).',
    usage_pattern: 'Sizes the bioreactor mass-balance, which feeds substrate feed-tank, product separation, and CO₂-handling line items in the BoM.',
  },

  'cantera:thermochemistry': {
    description: 'Provides chemical thermodynamics, reaction kinetics, and transport for combustion / fuel-cell / refrigerant-cycle calculations — used as a thermo backend alongside CoolProp.',
    origin: 'Open-source Cantera (BSD-3-Clause), Goodwin, Moffat, Schoegl, Speth, Weber 2024 "Cantera: An Object-oriented Software Toolkit for Chemical Kinetics, Thermodynamics, and Transport Processes". Mechanism files (GRI-Mech 3.0, USC II) provide species + reactions.',
    results_interpretation: 'Equilibrium composition, adiabatic flame temperature, ignition delays. For heat-pump cycles Cantera supplies the refrigerant EoS alongside CoolProp. Doesn\'t set design decisions on its own — it\'s the chemistry backend other tools consume.',
    usage_pattern: 'Currently used in the heat-pump refrigerant cycle and bioreactor metabolic-kinetics paths. Included for orchestrator breadth so domain-extensions (combustion, fuel cells) don\'t need a new wrapper.',
  },

  'clean-in-place:cip': {
    description: 'Sizes a bioreactor / process-vessel CIP (Clean-In-Place) cycle — water + chemical consumption, heating energy, and cycle time for the standard 5-step CIP (pre-rinse → alkaline → rinse → acid → final rinse).',
    origin: 'In-tree implementation against ASME BPE-2022 "Bioprocessing Equipment Standard" + ISPE Baseline Guide Vol 6 "Biopharmaceutical Manufacturing Facilities" (2018). 5-step CIP with NaOH 1-2 % + HNO₃ 0.5-1 % at 60-85 °C.',
    results_interpretation: 'water_consumption_l_per_cycle is 5-10× vessel volume; chemical_consumption_l combines NaOH + HNO₃ doses. heating_energy_kwh is the dominant utility cost. cycle_time_minutes (60-90 typical) sets the production loss per CIP — high-throughput biologics need to fit CIP inside scheduled downtime.',
    usage_pattern: 'Sizes the CIP utility module of any bioreactor design. Outputs feed the operating-cost section + the water/wastewater handling line items.',
  },

  'dissolved-oxygen:control': {
    description: 'Models bioreactor dissolved-oxygen control via cascade airflow + agitation — computes required kLa, OUR vs OTR balance, and the cascade controller response.',
    origin: 'In-tree implementation of Doran "Bioprocess Engineering Principles" 2nd ed. chapter 10 + Van \'t Riet 1979 Ind. Eng. Chem. correlation for kLa. OUR (oxygen uptake rate) vs OTR (oxygen transfer rate) balance: OTR = kLa × (C* − C_L) must ≥ OUR × X.',
    results_interpretation: 'required_kla_per_h must exceed OUR-based demand by 20-50 % to hold the DO setpoint. cascade_response_time_s tells whether the controller can keep DO above the cell\'s critical concentration (typically 20-30 % saturation) during exponential growth. If kLa exceeds 800 /h the design is air-injection-limited and needs pure O₂ supplementation.',
    usage_pattern: 'Sizes the bioreactor DO control loop — airflow sparger size, agitation cascade, controller PID. Couples with kla-oxygen:transfer and ph-titration:sizing.',
  },

  'downstream-chromatography:sizing': {
    description: 'Sizes downstream chromatography columns (Protein A, IEX, HIC, SEC) for a target protein purification — column volume, linear velocity, cycle count, and buffer consumption.',
    origin: 'In-tree implementation of Sofer & Hagel "Handbook of Process Chromatography" (Academic Press 1997) + Cytiva Application Note "AKTA Process Scaling". Column volume V = capacity_g / (load_g/L_resin); cycles = total_load / column_capacity.',
    results_interpretation: 'column_volume_l sized to handle target_protein_g per cycle within DBC. cycles_per_batch determines how many runs per batch — Protein A handles 100-300 cycles before resin replacement. buffer_consumption_l_per_cycle is 8-15× column volume — a major operating-cost driver.',
    usage_pattern: 'Sizes the downstream-processing line items for any bioreactor / biologics design. Reads target protein output from the fermentation mass balance.',
  },

  'kla-oxygen:transfer': {
    description: 'Computes the volumetric oxygen-mass-transfer coefficient (kLa) for a stirred-tank bioreactor at given power-per-volume and superficial gas velocity, using the Van \'t Riet correlation.',
    origin: 'In-tree implementation of Van \'t Riet 1979 Ind. Eng. Chem. Process Des. Dev. 18(3):357-364 "Review of measuring methods and results in nonviscous gas-liquid mass transfer in stirred vessels". kLa = 0.026 (P/V)^0.4 × Ug^0.5 for coalescing water; 0.002 (P/V)^0.7 × Ug^0.2 for non-coalescing.',
    results_interpretation: 'kla_per_hour of 100-400 is typical for industrial-scale aerobic fermentations; > 800 needs O₂-enriched air. max_otr_kg_m3_hr tells whether the design can sustain the cell density × specific oxygen uptake rate without DO crashing.',
    usage_pattern: 'Reads P/V from agitation:power and gas flow from the sparger spec, outputs the kLa that dissolved-oxygen:control needs to verify the DO setpoint can be held.',
  },

  'monod:growth-kinetics': {
    description: 'Solves Monod growth kinetics for a bioreactor — μ_max, K_s, biomass yield Y_x/s — and predicts biomass + substrate trajectories vs time for a chosen organism on a chosen substrate.',
    origin: 'In-tree implementation of Monod 1949 Annual Review of Microbiology 3:371-394 "The Growth of Bacterial Cultures" + Doran "Bioprocess Engineering Principles" 2nd ed. chapter 12. μ = μ_max × S / (K_s + S); dX/dt = μ × X.',
    results_interpretation: 'batch_time_h to complete fermentation; final_biomass_g_L drives the downstream-processing throughput; substrate_residual_g_L should approach zero for full conversion. E. coli on glucose: μ_max 0.9 /h, K_s 0.18 g/L, Y_x/s 0.4. Doubling time ≈ 0.7 / μ.',
    usage_pattern: 'Drives the bioreactor sizing — vessel volume, batch time, substrate feed strategy. Couples with dissolved-oxygen:control (μ drives OUR) and downstream-chromatography:sizing.',
  },

  'ph-titration:sizing': {
    description: 'Sizes bioreactor pH-control acid/base dose rate, stock tank volume, and chemical consumption per batch — for the organism\'s acid/base production profile.',
    origin: 'In-tree implementation of Doran "Bioprocess Engineering Principles" 2nd ed. chapter 8 + Sigma-Aldrich Buffer Reference. Acid/base dose = ΔpH × buffer_capacity × volume; Henderson-Hasselbalch for the steady-state.',
    results_interpretation: 'acid_dose_l_per_batch and base_dose_l_per_batch size the stock-tank capacity. titrant_choice (HCl vs H₃PO₄ vs NH₄OH) trades cost vs side-effects — H₃PO₄ adds phosphate (a nutrient), NH₄OH adds nitrogen. If pH drift exceeds the controller bandwidth, the design needs buffered media.',
    usage_pattern: 'Sizes the pH-control line item — dosing pumps, stock tanks, sensors — for any bioreactor. Reads organism + substrate from the brief and produces a chemistry-handling spec.',
  },

  'regulatory-fda:cgmp': {
    description: 'Estimates FDA cGMP (21 CFR 211) / EMA / PMDA compliance cost + timeline for a bioproduct, CGM, ventilator, or dialysis design — IND/BLA filing fees, validation lots, and audit cadence.',
    origin: 'In-tree compilation of FDA 21 CFR Part 211 (cGMP Finished Pharmaceuticals) + FDA PDUFA-VII fee schedule (FY2023-2027) + EMA Guideline for GMP Inspectors EMA/INS/GMP/79766/2011. Updated annually.',
    results_interpretation: 'estimated_cost_gbp is the all-in regulatory cost from IND through BLA approval — $4M+ BLA filing fee alone. timeline_years (typically 3-8 for a Phase 1-3 biologic) drives the financial model. process_validation_lots (15+ for PPQ) sizes the manufacturing capacity needed pre-launch.',
    usage_pattern: 'Runs in the regulatory section for biotech / medical-device designs. Outputs feed the financial-section + cap the time-to-market claim.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Heat Pump / HVAC tools
  // ──────────────────────────────────────────────────────────────────────
  'building-envelope:heat-loss': {
    description: 'Computes whole-house design heat loss per BS EN 12831 — fabric transmission, ventilation, and thermal-bridge losses against outdoor design temperature and indoor setpoint.',
    origin: 'In-tree implementation of BS EN 12831-1:2017 "Energy performance of buildings — Method for calculation of the design heat load" + CIBSE Guide A: Environmental Design. Q = Σ(U × A × ΔT) + ventilation losses.',
    results_interpretation: 'design_heat_loss_kw is the worst-case heat the heat pump must deliver at outdoor design temperature (e.g. -3 °C London). UK Part L 2021 targets: walls 0.16-0.18 W/m²·K, windows 1.2-1.4. annual_heating_kwh sizes the running cost. If heat loss exceeds 6 kW for a 100 m² home the fabric is sub-Part-L and needs an upgrade before a heat pump.',
    usage_pattern: 'First step in residential heat-pump sizing — sets the kW target that drives compressor, refrigerant, and electrical-supply sizing.',
  },

  'defrost-cycle:model': {
    description: 'Models a heat-pump outdoor-unit defrost cycle in cold/humid conditions — frost-formation rate, defrost frequency, defrost-energy penalty, and net SCOP impact.',
    origin: 'In-tree implementation of O\'Neal & Peterson 1990 ASHRAE Transactions 96(2) "Mass and Heat Transfer Effects During Air-Source Heat Pump Operation" + Yang & Zhang 2014 Int. J. Refrig. 46:155-164. Frost mass-growth per O\'Neal-Peterson; reverse-cycle defrost energy = m_frost × h_fusion + sensible cooling.',
    results_interpretation: 'defrost_frequency_per_hour during frost-forming conditions (T_amb < 7 °C AND RH > 65 %). defrost_energy_penalty_pct typically 10-15 % of the heating output. If defrost frequency exceeds 1/30 min the unit\'s output collapses and the auxiliary heater dominates — bad SCOP.',
    usage_pattern: 'Sizes the defrost-strategy choice (reverse-cycle, electric, hot-gas-bypass) for air-source heat pumps in cold climates. Couples with scop:seasonal (which folds defrost loss into the annual rating).',
  },

  'eer-seer:calc': {
    description: 'Computes EER (Energy Efficiency Ratio) and SEER / SEER2 (Seasonal EER) per AHRI 210/240 — outputs the kW-cooling per kW-electric metric and Energy Star tier.',
    origin: 'In-tree implementation of AHRI Standard 210/240-2023 "Performance Rating of Unitary Air-Conditioning & Air-Source Heat Pump Equipment". EER at steady-state 95 °F outdoor / 80 °F indoor; SEER weighted across temperature bins per Table 6.',
    results_interpretation: 'seer2 above 13.4-14.3 hits Energy Star "Standard"; > 16-17 hits "Most Efficient". SEER2 = SEER × 0.95 for ducted, equal for ductless mini-split (the 2023 update increased static-pressure assumptions). EER below 10 is non-compliant for new US installations.',
    usage_pattern: 'Sizes the seasonal-efficiency rating that drives Energy Star / SEER2 labelling for any AC / heat-pump product sold in the US market.',
  },

  'scop:seasonal': {
    description: 'Computes the Seasonal Coefficient of Performance (SCOP) per EU 813/2013 / EN 14825 — heating-bin-weighted COP for cold / average / warm climate zones.',
    origin: 'In-tree implementation of EU Regulation 813/2013 (Ecodesign for space heaters) + EN 14825:2018 "Air conditioners, liquid chilling packages and heat pumps... testing and rating at part-load conditions". Three climate zones (Helsinki / Strasbourg / Athens) per EN 14825 Annex B.',
    results_interpretation: 'scop_average is the headline rating — 4.0+ for A++ class, 3.4+ for A+. The bin breakdown shows where the unit struggles: typically +12 °C carries 59 % weight in warm climates, but cold-climate -7 °C and +2 °C dominate. SCOP determines the EU energy label (A+++ to G).',
    usage_pattern: 'Sizes the seasonal-rating claim for any heat-pump product sold in EU/UK markets. Couples with defrost-cycle:model (which feeds the cold-bin COP) and the manufacturer\'s test data.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Quantum / Cryogenic tools
  // ──────────────────────────────────────────────────────────────────────
  'dilution-fridge:cooling-power': {
    description: 'Computes the cooling power of a pulse-tube + ³He/⁴He dilution refrigerator at base temperature (typically 10-100 mK) and the cool-down time from room temperature.',
    origin: 'In-tree implementation of Pobell "Matter and Methods at Low Temperatures" 3rd ed. (Springer 2007) chapter 7 plus Bluefors LD-400 spec. Dilution cooling Q = 84 × n₃ × T² (Pobell Eq. 7.45); Kapitza limit at low T.',
    results_interpretation: 'cooling_power_uw_at_100mk at typical n₃ = 600 µmol/s is ~500 µW — drops sharply below 10 mK due to Kapitza resistance + viscous loss. cool_down_time_hours from 300 K to base typically runs 24-72 h. If the experiment heat load exceeds cooling power at base, the system locks at a higher temperature.',
    usage_pattern: 'Sizes the dilution-refrigerator line item for quantum-computer and cryostat products. Couples with qubit-chip-thermal:base-plate (which sets the heat load) and helium-circulation:dilution.',
  },

  'helium-circulation:dilution': {
    description: 'Sizes the ³He/⁴He gas-handling system for a dilution refrigerator — ³He inventory, gas-handling pressure, leak-tightness, and pumping speed.',
    origin: 'In-tree implementation of Pobell §7.5-7.6 plus Bluefors gas-handling manuals. Inventory scaling with n₃ flow rate; PV = nRT for gas-handling pressure; leak rate budget.',
    results_interpretation: '3he_inventory_required_l of 20-30 L STP is typical for 600 µmol/s flow. leak_tightness_required must be << 10⁻⁹ mbar·L/s — ³He is expensive (~£15,000/L STP) and irreplaceable on the timescale of years. If gas-handling pressure exceeds 500 mbar the design needs higher-rated components.',
    usage_pattern: 'Sizes the gas-handling and pumping line items for any dilution-refrigerator system. Reads flow rate from dilution-fridge:cooling-power and produces inventory + pumping specs.',
  },

  'magnetic-shielding:mu-metal': {
    description: 'Designs a multi-layer mu-metal magnetic shield — thickness, mass, shielding factor — to attenuate an external field by the target dB at a chosen layer count and aspect ratio.',
    origin: 'In-tree implementation of Mager 1968 IEEE Trans. Magnetics MAG-4 410 + Wills 2003 Cryogenics 43 365. Multi-layer S_total = S_1 × S_2 × ... × (1 + d/D)^(n-1); open-end leakage degrades by L_end/D.',
    results_interpretation: 'actual_attenuation_db must meet the target (typically 60-80 dB for sensitive quantum / atomic-clock setups). mu_metal_thickness_mm of 1-2 mm per layer is typical. mass_kg grows quickly with layer count. If saturation is approached (B_sat ~ 0.8 T for mu-metal) the inner layer becomes ineffective — usually solved by adding an outer iron-shroud pre-attenuator.',
    usage_pattern: 'Sizes the magnetic-shielding line item for quantum / cryostat / NMR / atomic-clock products. Couples with qubit-chip-thermal (which lives inside the shield) and the structural-containment BoM.',
  },

  'microwave-control-pulse:drag': {
    description: 'Models qubit-control microwave pulse (DRAG / Gaussian) — rotation angle, |2⟩-state leakage, and single-qubit-gate fidelity — for a superconducting qubit.',
    origin: 'In-tree implementation of Motzoi et al. 2009 PRL 103 110501 (DRAG technique) + Chow et al. 2010 PRA 82 040305. Rabi rotation Ω = γ·A_drive; DRAG pulse reduces |2⟩ leakage to O((Ω/Δ)²·(Δ·t)⁻²).',
    results_interpretation: 'gate_fidelity above 99.9 % is required for fault-tolerant quantum computing; > 99.99 % is the surface-code threshold. leakage_pct to |2⟩ should sit below 0.01 % per gate. If pulse duration is too short, the Rabi rate exceeds anharmonicity and leakage dominates; too long and decoherence eats fidelity.',
    usage_pattern: 'Sizes the control-electronics specification for quantum-computer products. Reads qubit frequency + anharmonicity from the chip spec and produces the AWG (arbitrary-waveform generator) bandwidth requirement.',
  },

  'qubit-chip-thermal:base-plate': {
    description: 'Computes the heat load on the dilution-refrigerator base plate from a qubit chip — total dissipated power from coaxial control lines, attenuator stack, and microwave readout.',
    origin: 'In-tree implementation of Krinner et al. 2019 EPJ Quantum Technology 6:2 + Pop et al. 2014 Nature 508:369. Heat load = sum of attenuated line powers; T1 degrades when load > base-plate cooling power.',
    results_interpretation: 'heat_load_uw at base plate (20 mK) is dominated by attenuator dissipation; 0.1-1 µW per line is typical. max_supportable_qubits_at_this_temp is bounded by the dilution-fridge\'s cooling power at 20 mK (~500 µW). If load exceeds cooling, T1 drops and gate fidelity collapses.',
    usage_pattern: 'Mandatory check for quantum-computer scale-up. Reads qubit count + line count and produces the heat budget that dilution-fridge:cooling-power must accommodate.',
  },

  'qubit-count-to-logical:error-correction': {
    description: 'Computes the physical-to-logical qubit overhead under surface-code or IBM BB-code error correction — given physical error rate, target logical error rate, and code distance.',
    origin: 'In-tree implementation of Fowler et al. 2012 PRA 86 032324 (surface code) + IBM Quantum 2024 Nature 627 778-782 (BB code). Threshold theorem p_L ≈ A × (p/p_th)^((d+1)/2); surface code uses 2d² physical qubits per logical, BB code halves this.',
    results_interpretation: 'logical_qubit_count = physical / overhead_ratio; for physical p = 10⁻³ and target p_L = 10⁻¹², code distance d = 11 needs ~2 × 121 ≈ 240 physical qubits per logical. threshold_required tells the chip team how low p_physical must drop.',
    usage_pattern: 'Sizes the qubit-count target for fault-tolerant quantum-computing products. Outputs feed the chip-fabrication BoM + the marketing claim (e.g. "100 logical qubits" = ~24,000 physical).',
  },

  // ──────────────────────────────────────────────────────────────────────
  // PEMFC / Electrolyser / H2 tools
  // ──────────────────────────────────────────────────────────────────────
  'electrolyser:efficiency': {
    description: 'Models PEM / AEM / alkaline water electrolyser cell efficiency — outputs cell voltage, LHV/HHV efficiency, and H₂ production rate at the operating current density and temperature.',
    origin: 'In-tree implementation of Carmo, Fritz, Mergel & Stolten 2013 Int. J. Hydrogen Energy 38(12):4901-4934 "A comprehensive review on PEM water electrolysis". Cell-voltage decomposition V = V_oc + V_act + V_ohm + V_conc; Butler-Volmer kinetics; Bruggeman for ohmic.',
    results_interpretation: 'efficiency_lhv_pct of 65-72 % is typical for PEM at 2 A/cm²; HHV equivalent 80-85 %. cell_voltage_v at 1.85 V means 1.85 V × current = power; an ideal cell needs 1.23 V (the thermodynamic minimum). If efficiency falls below 60 % the design is membrane-resistance or catalyst-poisoning limited.',
    usage_pattern: 'Sizes the H₂ production rate per cell, which scales to stack count via pem-membrane:sizing. Drives the electrical-supply requirement.',
  },

  'pem-membrane:sizing': {
    description: 'Sizes a PEM electrolyser stack for target H₂ output — cell count, total area, stack count, and power consumption — given current density, voltage, and faradaic efficiency.',
    origin: 'In-tree implementation of Bessarabov, Wang, Li & Zhao eds. 2016 "PEM Electrolysis for Hydrogen Production: Principles and Applications" (CRC Press). Faraday\'s law m_dot_H2 = I × M_H2 / (2F); membrane sizing from current density × area.',
    results_interpretation: 'active_area_m2 grows with target output; cell_count is active_area / per-cell-area. total_power_kw of ~50 kWh/kg of H₂ is typical (1 kg H₂ contains 33.3 kWh chemical energy → ~67 % LHV). If the stack count exceeds 10 the design needs split balance-of-plant skids.',
    usage_pattern: 'Sizes the membrane-stack line item for any H₂ electrolyser. Reads efficiency from electrolyser:efficiency and produces the full stack BoM.',
  },

  'pemfc:membrane-humidification': {
    description: 'Computes Nafion membrane water content (λ) and ohmic resistance for a PEM fuel cell at given temperature, RH, and current density.',
    origin: 'In-tree implementation of Springer, Zawodzinski, Gottesfeld 1991 J. Electrochem. Soc. 138 2334 + Barbir "PEM Fuel Cells" chapter 4. Springer water-uptake isotherm + Springer-Rowland conductivity correlation σ = (5.14 × 10⁻³·λ − 3.26 × 10⁻³)·exp(1268·(1/303 − 1/T)).',
    results_interpretation: 'water_content_lambda of 14 (vapour-saturated) to 22 (liquid-saturated). ohmic_resistance_ohm_cm2 drops with hydration — dry membrane at λ ~ 6 has 2-5× the resistance of saturated. If λ falls below 8 the membrane dehydrates and the cell shuts down.',
    usage_pattern: 'Sizes the humidification system for PEMFC stacks. Couples with pemfc:polarisation-curve (which uses ohmic resistance) and the air-supply system.',
  },

  'pemfc:polarisation-curve': {
    description: 'Computes the PEM-fuel-cell polarisation curve — voltage vs current density, peak power density, and the activation / ohmic / mass-transport loss decomposition.',
    origin: 'In-tree implementation of Larminie & Dicks "Fuel Cell Systems Explained" 2nd ed. chapter 3 + Barbir "PEM Fuel Cells" 2nd ed. V(i) = E_OCV − V_act(Tafel) − V_ohm(iR) − V_conc(mass-transport).',
    results_interpretation: 'peak_power_density_w_cm2 of 1.0-1.5 is typical for state-of-the-art automotive PEMFC; voltage_at_peak_efficiency near 0.7 V (50 % efficiency at the HHV). If V drops sharply past i_L (limiting current), the cell is mass-transport-limited — usually because flooding has shut off oxygen access.',
    usage_pattern: 'Foundation tool for PEMFC stack sizing. Couples with pt-loading-optimisation (which adjusts catalyst loading vs power density) and the cooling-system spec.',
  },

  'pemfc:pt-loading-optimisation': {
    description: 'Optimises platinum catalyst loading vs power density vs durability for a PEMFC — outputs Pt loading (mg/cm²), cost per kW, and total Pt mass for the stack.',
    origin: 'In-tree implementation against DOE 2026 EERE FCTO technical targets + Borup et al. 2007 Chem. Rev. 107 3904. Power density P ∝ √(loading); durability ∝ loading × inverse stress. DOE 2026 targets 0.125 g/kW.',
    results_interpretation: 'pt_mg_cm2 of 0.4-0.6 hits 10,000-hour durability targets for medium-duty; > 0.6 for heavy-duty truck. cost_per_kw_gbp driven by Pt price (~£25/g) — a 0.4 mg/cm² stack at 1 W/cm² needs ~0.4 g Pt/kW = £10/kW just in catalyst. Below 0.2 mg/cm² the dissolution rate dominates and durability collapses.',
    usage_pattern: 'Sizes the catalyst-cost line item in the PEMFC BoM. Reads power-density target from pemfc:polarisation-curve and produces the loading × area = total Pt spec.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Solid-state battery tools
  // ──────────────────────────────────────────────────────────────────────
  'ceramic-electrolyte:conductivity': {
    description: 'Predicts solid-state-battery electrolyte ionic conductivity vs temperature for LLZO / LiPON / sulphide / LATP / LISICON ceramics — Arrhenius behaviour with grain-boundary impedance mix.',
    origin: 'In-tree implementation of Knauth 2009 Solid State Ionics 180 911 + Bachman et al. 2016 Chem. Rev. 116 140. Arrhenius σ(T) = σ_0 × exp(-Ea/kT); grain-boundary impedance mix.',
    results_interpretation: 'ionic_conductivity_s_cm at 25 °C: LLZO ~10⁻³, sulphide LPSCl ~10⁻², LiPON thin-film ~3 × 10⁻⁶. activation_energy_ev of 0.2-0.4 eV — lower is better (less drop at low T). If grain-boundary fraction exceeds 30 % the bulk-vs-GB conductivity gap closes and the cell barely conducts.',
    usage_pattern: 'Sizes the electrolyte choice for solid-state-battery designs. Couples with li-metal-dendrite:monroe-newman (which sets the mechanical-shear-modulus requirement) and stack-compression:pressure.',
  },

  'li-metal-dendrite:monroe-newman': {
    description: 'Predicts Li-metal dendrite-growth suppression in solid-state batteries using the Monroe-Newman criterion — separator shear modulus must exceed 2× lithium\'s for stable plating.',
    origin: 'In-tree implementation of Monroe & Newman 2005 J. Electrochem. Soc. 152 A396 + Porz et al. 2017 Adv. Energy Mat. 7 1701003. Monroe-Newman shear-modulus criterion G_sep > 2·G_Li; Sand\'s-time depletion.',
    results_interpretation: 'critical_current_density_ma_cm2 is the maximum stable Li-plating current; > 5 mA/cm² is the commercial target. dendrite_growth_rate_um_per_hr above critical conditions tells how long until the cell short-circuits. If safe_operating_window = "hazard", the design fails dendrite suppression and needs either a stiffer electrolyte or higher stack pressure.',
    usage_pattern: 'Critical safety check for any solid-state Li-metal-anode design. Outputs feed the stack-compression and electrolyte-choice decisions.',
  },

  'stack-compression:pressure': {
    description: 'Sizes solid-state-battery stack compression — clamp force, frame stress, frame mass — to maintain contact pressure across all cells in the stack.',
    origin: 'In-tree implementation of Doux et al. 2020 Adv. Energy Mater. 10 1903253 + QuantumScape technical filings. F = P × A × N stack force balance; frame stress vs yield strength.',
    results_interpretation: 'clamp_force_n driven by target_contact_pressure_mpa × cell_area × stack_count; 2-10 MPa is typical for Li-metal cells per Toyota / SCiB / QuantumScape literature. frame_mass_kg adds 10-30 % to dry mass of the stack. If frame stress exceeds yield with SF 1.5 the frame buckles in service.',
    usage_pattern: 'Sizes the structural-containment line item for solid-state battery products. Couples with ceramic-electrolyte:conductivity and li-metal-dendrite:monroe-newman.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Medical device tools
  // ──────────────────────────────────────────────────────────────────────
  'biocompatibility:iso-10993': {
    description: 'Classifies materials per ISO 10993 biocompatibility — contact-type × duration matrix produces a list of mandatory ISO 10993 parts and per-material pass/fail with rationale.',
    origin: 'In-tree implementation against ISO 10993-1:2018 "Biological evaluation of medical devices Part 1" + Ratner et al. eds. 2020 "Biomaterials Science" 4th ed. (Academic Press). Per-material records for Pt, Ti, SS316L, PDMS, PTFE, polyimide, etc.',
    results_interpretation: 'overall_pass = true only if every contacting material passes the relevant ISO 10993 family (-5 cytotoxicity, -6 implantation, -10 irritation/sensitisation, -11 systemic toxicity). required_iso10993_parts enumerates the tests the design must commission. If a material flags non-compliant for chronic implantation it needs a coating or substitution.',
    usage_pattern: 'Mandatory check for any patient-contacting medical device (CGM, dialysis, ventilator). Reads the material list from the BoM and outputs the regulatory-test plan.',
  },

  'blood-pump:sizing': {
    description: 'Sizes a peristaltic blood pump for hemodialysis / ECMO / CRRT — pump RPM, motor torque, and hemolysis risk score for target flow rate, tubing geometry, and pressure head.',
    origin: 'In-tree implementation of Giersiepen, Wurzinger, Opitz & Reul 1990 Int. J. Artif. Organs 13(5):300-306 + FDA Blood Pump Premarket Notification Guidance (2013). Volumetric flow Q = ω × V_swept × η_v; hemolysis index from Giersiepen Σ(τ^2.416 × t^0.785).',
    results_interpretation: 'pump_rpm of 50-200 typical for dialysis blood-side flow (200-500 ml/min). motor_torque_ncm sized for the worst-case tubing compression. hemolysis_risk_score must read "low" — any "high" risk fails FDA pre-market notification.',
    usage_pattern: 'Sizes the blood-side pump for dialysis-machine designs. Couples with osmosis-membrane:dialyser (which sets the dialysis dose) and the BMS-style flow controller.',
  },

  'flow-compliance:respiratory': {
    description: 'Models ventilator patient-side flow + pressure waveform from tidal volume, PEEP, compliance, and resistance — outputs peak airway pressure, mean pressure, and tidal flow profile.',
    origin: 'In-tree implementation of West "Respiratory Physiology: The Essentials" 11th ed. (Lippincott 2012). Equation of motion: P_aw = V/C + R × V_dot + PEEP. PIP = P_plat + R × flow_peak.',
    results_interpretation: 'peak_pressure_cmh2o must stay below 30-35 cmH₂O to avoid barotrauma. mean_airway_pressure_cmh2o drives oxygenation; plateau_pressure_cmh2o (post-pause) reflects alveolar pressure. If PIP exceeds the safety pressure relief setting (typically 40-60 cmH₂O), the valve vents and the breath fails.',
    usage_pattern: 'Sizes the ventilator delivery profile for ICU ventilator designs. Couples with peep-valve:sizing and the patient-side circuit.',
  },

  'glucose-sensor:amperometric': {
    description: 'Models an amperometric glucose biosensor (GOx / GDH-FAD / GDH-NAD) — current response per mM glucose, response time, drift rate, and saturation glucose level.',
    origin: 'In-tree implementation of Heller & Feldman 2008 Chem. Rev. 108(7):2482-2505 + Wang 2008 Chem. Rev. 108(2):814-825. Michaelis-Menten enzyme kinetics i = (n × F × A × k_cat × [GOx] × [S]) / (K_M + [S]); outer-membrane diffusion limitation.',
    results_interpretation: 'current_density_na_per_mm of 10-20 is typical for commercial CGM. drift_at_day_n_pct accumulates linearly — < 10 % at day 14 is the Dexcom-class target. saturation_glucose_mm above 30 means linear response across the clinical range (2-25 mM). If drift exceeds 1 % per day the sensor needs calibration touch-points.',
    usage_pattern: 'Sizes the sensor electrochemistry for CGM products. Outputs feed the calibration-algorithm spec and the warranty/usable-life claim.',
  },

  'osmosis-membrane:dialyser': {
    description: 'Models hemodialysis-membrane clearance of urea / creatinine / phosphate / β2-microglobulin from blood-side flow, dialysate-flow, KoA, and membrane area — outputs Kt/V (dose).',
    origin: 'In-tree implementation of Daugirdas, Blake & Ing eds. "Handbook of Dialysis" 5th ed. (Wolters Kluwer 2014) + Michaels 1966 AIChE J. 12(5):1006-1010. Dialyser clearance K = Q_b × (1 − exp(−NTU)); Kt/V per Daugirdas single-pool model.',
    results_interpretation: 'urea_clearance_ml_min above 200 is the modern high-flux dialyser target. kt_v_per_session > 1.2 is the minimum US/EU adequacy target; > 1.4 for chronic ESRD. If clearance falls below 150 ml/min the session must lengthen or dialyser area increase.',
    usage_pattern: 'Sizes the dialyser cartridge for dialysis-machine designs. Reads blood-flow target from blood-pump:sizing and produces the membrane-area + KoA spec.',
  },

  'peep-valve:sizing': {
    description: 'Sizes the PEEP (positive end-expiratory pressure) valve + safety pressure relief for an ICU ventilator — valve Cv, relief setpoint, and dead-space volume.',
    origin: 'In-tree implementation of ISO 80601-2-12:2020 "Medical electrical equipment Part 2-12: Particular requirements for ICU ventilators" + ISA S75.01.01-2007. Valve Cv: Q = Cv × √(ΔP / SG); PEEP-relief sizing per ISO 80601-2-12 max-pressure protocol.',
    results_interpretation: 'valve_cv_required must match the peak expiratory flow at PEEP target with < 1 cmH₂O drop. relief_pressure_setting_cmh2o (typically 40 cmH₂O for adult, 30 for paediatric) is the hard cap above which the safety vents. dead_space_ml < 10 keeps re-breathing minimal.',
    usage_pattern: 'Sizes the expiratory-valve assembly for ICU ventilators. Couples with flow-compliance:respiratory (which sets the flow targets).',
  },

  'water-treatment-ro:sizing': {
    description: 'Sizes a reverse-osmosis water-treatment system — membrane area, recovery rate, operating pressure, specific energy — for dialysis-grade or vertical-farm-irrigation water purity.',
    origin: 'In-tree implementation of Dow FILMTEC Reverse Osmosis Membranes Technical Manual + AWWA M46 (2007) "Reverse Osmosis and Nanofiltration Manual of Water Supply Practices". Solution-diffusion model J_w = A × (ΔP − Δπ); specific energy = (ΔP × Q_permeate) / η_pump.',
    results_interpretation: 'membrane_area_m2 = Q_p / (J × LMH/3600). recovery_pct of 50-75 % brackish, 35-50 % seawater. specific_energy_kwh_per_m3 of 0.5-1.5 for brackish, 3-5 for seawater — drives the operating cost. If reject TDS rises above 100,000 ppm scaling becomes inevitable and the recovery rate drops.',
    usage_pattern: 'Sizes the RO subsystem for dialysis-grade water (AAMI/ISO 23500 compliant) and vertical-farm irrigation. Reads feed-water TDS and outputs the membrane + pump BoM.',
  },

  'wearable-battery:life': {
    description: 'Computes coin-cell / micro-LiPo battery life for a wearable medical device (CGM, hearing aid, patch) — outputs estimated days from current draw profile.',
    origin: 'In-tree implementation against Energizer CR2032 Product Datasheet + Panasonic CR-Series datasheets + IEC 60086-3:2021. Battery life = capacity / mean current; mean = sleep + active × duty cycle.',
    results_interpretation: 'estimated_days of 1000+ (3 years) is typical for a CR2032-powered CGM; LiPo packs deliver 10-30 days at higher transmit duty. If transmit duty exceeds 1 % the design needs a larger battery or aggressive BLE scheduling.',
    usage_pattern: 'Sizes the battery line item for any wearable medical device. Reads sensor + MCU + radio current profile from the electronics design and produces the battery capacity requirement.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // 3D Printer / CNC tools
  // ──────────────────────────────────────────────────────────────────────
  'extruder:thermal': {
    description: 'Models an FDM 3D-printer hot-end thermal envelope — steady-state temperature, time lag, melt-zone length, and cooling-fan requirement for PLA / ABS / PETG / Nylon / TPU at a given flow rate.',
    origin: 'In-tree implementation against the E3D-Online V6 Hotend datasheet + Polymaker filament TDS series. Lumped thermal capacitance dT/dt = (Q_in − Q_loss) / (m × Cp); time constant τ = m × Cp / (h × A); melt-zone length L = v × τ.',
    results_interpretation: 'steady_state_temp_c must hit the material setpoint (PLA 200-220, ABS 230-250, Nylon 250-280); time_lag_s of 3-10 s sets how fast the firmware can swing temperature for retraction / pause. melt_zone_length_mm of 4-8 mm is healthy; longer means heat creep up the cold zone and jamming.',
    usage_pattern: 'Sizes the hot-end + heat-break + heater-cartridge selection for FDM 3D-printer designs. Reads target flow rate from the print-speed brief.',
  },

  'motion-kinematics:steps-per-mm': {
    description: 'Computes 3D-printer / CNC motion-axis kinematics — steps per mm, max acceleration, motor torque, and max step frequency — from belt + pulley + stepper geometry.',
    origin: 'In-tree implementation based on Klipper firmware documentation (klipper3d.org) + NEMA ICS 23 (stepper-motor classifications). steps/mm = (motor_steps × microstep) / lead_per_rev; torque margin = available / required at speed.',
    results_interpretation: 'steps_per_mm of 80 (GT2 belt + 20T pulley + NEMA17 1.8°/step + 16× microstepping) is standard for desktop FDM. max_step_freq_hz < 30 kHz typical for TMC2209 driver class. motor_torque_required_ncm must sit below the stepper\'s holding torque × 0.7 (the safe pull-out region).',
    usage_pattern: 'Sizes the motor + driver + belt selection for 3D-printer and CNC motion stages. Outputs feed the firmware configuration + BoM.',
  },

  'mrr-chip-load:milling': {
    description: 'Computes CNC milling material-removal rate (MRR), cutting force, spindle torque, and tool life from tool diameter, material, cutting speed, feed-per-tooth, and depth-of-cut.',
    origin: 'In-tree implementation against Sandvik Coromant Training Handbook + Kennametal Master Catalog + ASM Handbook Vol 16: Machining. MRR = a_e × a_p × v_f; cutting torque T = F_c × D/2 = K_c × MRR / (π × D × n).',
    results_interpretation: 'mrr_cm3_min drives the productivity claim; cutting_force_n drives the workpiece-clamping requirement. spindle_torque_nm must sit below the spindle\'s S1 torque rating; spindle_power_kw drives the supply. tool_life_minutes of 60-300 is typical for hard materials; aluminium can run >1000.',
    usage_pattern: 'Sizes the spindle + drive + clamping for CNC-machine product designs. Couples with spindle:thermal (heat at max MRR) and the cutting-tool BoM.',
  },

  'spindle:thermal': {
    description: 'Models CNC spindle thermal balance — bearing heat dissipation, cooling-oil flow, bearing temperature — for ceramic-hybrid, angular-contact, or air-bearing spindles at given RPM and load.',
    origin: 'In-tree implementation against SKF Bearing Reference Catalogue + Setco Spindle Engineering Application Notes. Bearing loss Q = M × ω per SKF Catalogue General; oil flow Q_oil = Q_bearing / (ρ × Cp × ΔT_acceptable).',
    results_interpretation: 'heat_dissipation_kw of 0.5-3 % of rated spindle power for ceramic hybrid; 3-5 % for steel ball bearings. bearing_temp_c above 80 °C means short bearing life — typical limit. cooling_oil_lpm sized to keep bearings under that. If air-bearing the cooling is negligible but the bearing capacity is limited.',
    usage_pattern: 'Sizes the spindle cooling system for CNC machines. Reads MRR and duty cycle from mrr-chip-load:milling and produces the chiller + oil-circuit BoM.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Humanoid / Robotics tools
  // ──────────────────────────────────────────────────────────────────────
  'humanoid:dexterity-kinematics': {
    description: 'Sizes humanoid-robot finger kinematics + grasp force — actuator count, total motor torque, and dexterity index — for a chosen finger count, DOF per finger, and target pinch force.',
    origin: 'In-tree implementation of Salisbury & Craig 1982 IJRR 1 4 "Articulated Hands: Force Control and Kinematic Issues" + Shadow Robot / Allegro Hand published specs. Dexterity D = independent_DOF / 6 (SE(3) full pose); grasp force = sum(τ/L) at fingertip.',
    results_interpretation: 'dexterity_index of 1.0 means the hand can match an SE(3) target trajectory; > 1 redundant; < 1 the hand under-actuates. total_motor_torque_nm sized for worst-case fingertip lever arm. If grasp force exceeds 60 N per finger the design needs reduction gearing.',
    usage_pattern: 'Sizes the hand subsystem for humanoid-robot designs. Outputs feed the manipulator BoM + the task envelope (object size, pinch vs power grasp).',
  },

  'humanoid:dynamic-walking-zmp': {
    description: 'Models humanoid-robot dynamic walking via the Zero Moment Point (ZMP) trajectory — ZMP margin within support polygon, stability classification, and control-bandwidth requirement.',
    origin: 'In-tree implementation of Vukobratovic & Stepanenko 1972 (ZMP foundation) + Kajita et al. 2003 IEEE ICRA 1620 (cart-table LIPM). ZMP must remain in support polygon; LIPM ω_c = √(g/h_com); cart-table ẍ feedback.',
    results_interpretation: 'zmp_margin_mm > 30 is stable for a typical 60 kg humanoid; < 10 marginal; negative = the robot tips. control_bandwidth_required_hz of 100-300 needed to actively keep ZMP in foot — drives the IMU + actuator bandwidth requirements.',
    usage_pattern: 'Mandatory stability check for humanoid-robot designs. Reads body geometry + walking speed and outputs the control-system + sensor bandwidth requirements.',
  },

  'humanoid:joint-actuator-torque': {
    description: 'Sizes humanoid-robot joint actuator torque + peak current — for hip / knee / ankle / shoulder / elbow / wrist joints — from payload, lever arm, and dynamic acceleration.',
    origin: 'In-tree implementation of Featherstone 2008 "Rigid Body Dynamics Algorithms" (Springer) + Wensing et al. 2017 IEEE T-RO 33 509 + Boston Dynamics Atlas patent US 9,517,567. τ = m × (g + a) × L with SF 1.5-2.5; motor torque = output / gear_ratio / efficiency.',
    results_interpretation: 'required_torque_nm of 100-300 typical for human-scale knee/hip; > 500 for heavy-payload manipulation. peak_current_a sized through the motor torque constant Kt. actuator_mass_kg drives the limb mass which then drives upstream joints — recursive effect.',
    usage_pattern: 'Sizes the per-joint actuator (BLDC + harmonic drive / cycloidal) for humanoid-robot designs. Reads task spec (payload, speed) and outputs the actuator BoM.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // DAC / Carbon Capture tools
  // ──────────────────────────────────────────────────────────────────────
  'dac:contactor-geometry': {
    description: 'Sizes the air-contactor for a Direct Air Capture (DAC) plant — contactor area, fan power, footprint — to hit a target CO₂ capture rate per year at a given sorbent kinetic rate.',
    origin: 'In-tree implementation based on Keith et al. 2018 Joule 2 1573 (Carbon Engineering 1 MtCO₂/yr plant) + Climeworks Orca / Carbon Engineering technical disclosures. Mass balance: target = capture_rate × A × hr/year × η; fan power = V_dot × ΔP / η_fan.',
    results_interpretation: 'contactor_area_m2 grows linearly with capture target; 1 kt CO₂/yr ≈ 14,000 m² (Carbon Engineering scale-up). fan_power_kw is the single largest electrical line — drives the operating-cost claim. If ΔP exceeds 100 Pa the fan power dominates and the design needs a lower face velocity.',
    usage_pattern: 'Sizes the contactor BoM line item for DAC plant designs. Couples with sorbent-kinetics (which sets capture rate) and regeneration-energy (which sets the thermal-energy demand).',
  },

  'dac:regeneration-energy': {
    description: 'Computes sorbent regeneration energy per ton CO₂ — for amine-silica / KOH-solution / MOF / zeolite sorbents — given regeneration temperature, heat source, and capture capacity.',
    origin: 'In-tree implementation of Sanz-Pérez et al. 2016 Chem. Rev. 116 11840 + Keith et al. 2018 Joule 2 1573. Energy = ΔH_desorption + sensible_heat + steam_stripping; ΔH ≈ 80 kJ/mol for amines.',
    results_interpretation: 'regen_energy_kwh_per_ton_co2 of 1000-2000 for amine-silica TSA (Climeworks-class), 5000+ for KOH calcination (Carbon Engineering). The split between thermal vs electrical drives whether waste heat or grid power is the limiting cost. If energy exceeds 3 GJ_th/ton the design is uncompetitive vs alternative sequestration paths.',
    usage_pattern: 'Sizes the energy-side of DAC plant economics. Couples with dac:sorbent-kinetics (which sets the kinetic capacity) and the heat-source selection (waste heat, electric resistance, heat pump).',
  },

  'dac:sorbent-kinetics': {
    description: 'Models DAC sorbent CO₂ adsorption kinetics — capture rate, breakthrough time, and capacity at equilibrium — for amine-silica / KOH / MOF / zeolite at given ppm, contact time, T, and humidity.',
    origin: 'In-tree implementation of Sanz-Pérez et al. 2016 Chem. Rev. 116 11840 + Bui et al. 2018 EES 11 1062. Langmuir isotherm equilibrium + LDF kinetics dq/dt = k_LDF·(q_eq − q). Sorbent-specific q_max and k.',
    results_interpretation: 'capture_rate_kg_co2_per_kg_sorbent_per_hr is the per-pass rate; Climeworks amine-silica achieves ~0.001 kg/kg/hr. capacity_g_co2_g_sorbent of 0.05-0.12 typical for amines; 0.5+ for KOH (chemisorbing). If capture rate is too slow, the contactor area must grow to compensate.',
    usage_pattern: 'Sizes the sorbent mass + cycle time for DAC plant designs. Couples with dac:contactor-geometry (which uses the rate to size area) and dac:regeneration-energy (which uses the capacity to size the regeneration cycle).',
  },

  // ──────────────────────────────────────────────────────────────────────
  // SMR / Nuclear tools
  // ──────────────────────────────────────────────────────────────────────
  'smr:biological-shielding': {
    description: 'Sizes biological neutron + gamma shielding for a Small Modular Reactor — shield thickness, mass, and attenuated dose at the outer surface for concrete / borated water / lead / borated polyethylene.',
    origin: 'In-tree implementation of Shultis & Faw 2002 "Radiation Shielding" 2nd ed. + ICRP 103 (2007). Exponential attenuation D(x) = D_0 × exp(−μx); TVL = ln(10)/μ. Source strength scales with reactor power.',
    results_interpretation: 'shield_thickness_m of 2-4 m of concrete typical for 300 MWt SMR; borated polyethylene halves it. shield_mass_tons drives the structural-foundation load. attenuated_dose_usv_h must sit below 10 µSv/h at the controlled-area boundary; > 100 fails radiological compliance.',
    usage_pattern: 'Sizes the shielding line item for SMR designs. Reads reactor power and target outer dose and produces a shield spec the civil-engineering team can detail.',
  },

  'smr:decay-heat-loca': {
    description: 'Computes SMR decay-heat removal during a Loss-of-Coolant Accident (LOCA) per ANSI/ANS-5.1-2014 — outputs decay heat vs time, required passive cooling capacity, and containment-pressure response.',
    origin: 'In-tree implementation of ANSI/ANS-5.1-2014 + Glasstone & Sesonske 1994 chapter 8 + NUREG-0800 §15.6.5. Wigner-Way decay heat: P_d/P_0 = 6.21 × 10⁻³ × (t^-0.2 − (t+T_op)^-0.2).',
    results_interpretation: 'decay_heat_mw at t=1 s is 6 % of rated, at t=1 hr 1 %, at t=1 day 0.3 %. passive_cooling_required_capacity_mw must exceed the peak decay heat for the design-basis LOCA window. containment_pressure_bar must stay below the design-pressure rating; exceedance triggers core damage.',
    usage_pattern: 'Mandatory safety check in the SMR licensing gate. Reads reactor power + operating history and produces the decay-heat curve the passive-safety system must handle.',
  },

  'smr:neutron-physics-keff': {
    description: 'Computes SMR criticality (k_eff) using textbook two-group diffusion theory — four/six-factor formula for the fuel + moderator + reflector geometry and enrichment.',
    origin: 'In-tree implementation of Lamarsh & Baratta 2018 "Introduction to Nuclear Engineering" 4th ed. + Glasstone & Sesonske 1994. Four-factor k_inf = η·ε·p·f; finite reactor k_eff = k_inf × P_NL × P_TL via geometric buckling.',
    results_interpretation: 'keff must equal 1.0 ± 0.01 at hot full power for steady operation. doppler_coefficient_pcm_K must be negative for inherent safety (typical -2 to -5 pcm/K). neutron_lifetime_us of ~50 µs for water-moderated thermal reactors. If k_eff < 0.99 the reactor cannot reach criticality with the chosen enrichment + geometry.',
    usage_pattern: 'Foundation tool for SMR core design. Outputs feed the safety analysis + the fuel-loading specification.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Wind turbine tools
  // ──────────────────────────────────────────────────────────────────────
  'gearbox-load:spectrum': {
    description: 'Computes a wind-turbine gearbox fatigue load spectrum — load cycles, peak torque, fatigue damage equivalent — from mean wind speed, turbulence intensity, and 20-year design life.',
    origin: 'In-tree implementation of IEC 61400-1:2019 (turbulence classes) + DIN 743:2012 (shaft fatigue). Miner\'s linear damage rule applied to gearbox torque time-series; rainflow counting on torque cycles; ISO 6336 for gear pitting + bending capacity.',
    results_interpretation: 'load_cycles_per_lifetime in the 10⁸ range over 20 years. peak_torque_nm at Class IIA turbulence sits at ~1.5× rated for typical 7.5 m/s mean wind. fatigue_damage_eq < 1 = the gearbox survives design life; > 1 = early failure.',
    usage_pattern: 'Mandatory durability check for wind-turbine gearbox sizing. Outputs feed the gearbox warranty + maintenance-cost estimate.',
  },

  'wind-resource:iec61400': {
    description: 'Computes wind-turbine annual energy production (AEP) per IEC 61400-12-1 — Weibull-distributed wind resource × manufacturer power curve, plus IEC 61400-1 logarithmic shear correction.',
    origin: 'Open-source `windpowerlib` (MIT, KTH/TU Berlin), Reiniger, Krien, Stomberg & Kaldemeyer 2017-2024 "windpowerlib - A library to model wind power plants". IEC 61400-12-1 power-curve method + IEC 61400-1 logarithmic wind-shear. Power curves from the Open Energy Database (oedb) — 100+ commercial turbines (Enercon, Vestas, GE, Siemens).',
    results_interpretation: 'aep_kwh_per_year drives the LCOE claim; capacity_factor (AEP / nameplate × 8760) of 0.30-0.45 onshore, 0.45-0.55 offshore. If capacity factor falls below 0.25 the site is sub-economic for the chosen turbine model.',
    usage_pattern: 'Sizes the AEP for any wind-turbine product. Couples with gearbox-load:spectrum (which uses the wind distribution for fatigue) and the financial section.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Edge AI / IoT tools
  // ──────────────────────────────────────────────────────────────────────
  'inference-throughput:edge': {
    description: 'Estimates edge-AI inference throughput (inferences/sec), memory use, and power for a chosen model size, quantisation level, accelerator class, and batch size.',
    origin: 'In-tree implementation against NVIDIA Jetson Datasheets + Coral Edge TPU Datasheet + MLPerf Inference: Edge v3.0 Results (2024). Throughput = utilisation × peak_TOPS / GOps_per_inference; end-to-end utilisation ~15-40 % of theoretical peak.',
    results_interpretation: 'inferences_per_sec must meet the application\'s real-time budget (30 fps for vision, 100+ Hz for sensor fusion). memory_used_mb must fit in the accelerator\'s on-chip memory or the design has DRAM-bandwidth penalty. effective_tops shows how much of peak TOPS the model actually uses.',
    usage_pattern: 'Sizes the accelerator choice (Jetson Orin / Coral / Hailo / SnapDragon) for edge-AI products. Couples with network-bandwidth:budget and thermal-envelope:ladder.',
  },

  'network-bandwidth:budget': {
    description: 'Computes the edge-AI uplink bandwidth budget — required Mbps, link feasibility, monthly data volume — for a chosen inference rate, output size per inference, and link type (4G / 5G / Wi-Fi / Ethernet / LoRa).',
    origin: 'In-tree implementation against 3GPP TS 36.211 / 38.211 (LTE/5G) + IEEE 802.11ax (Wi-Fi 6) + LoRa Alliance RP002. Required bandwidth = inferences/s × bytes/inference × 8 × overhead.',
    results_interpretation: 'link_feasibility = "OK" if required < available with 50 % headroom. monthly_data_gb drives the data-plan cost (4G/5G mobile data, satellite). If LoRa is the only link, the design must aggregate inferences before uplink (1 inference per minute, not per second).',
    usage_pattern: 'Sizes the communication link for edge-AI / IoT product designs. Reads inference rate from inference-throughput:edge.',
  },

  'thermal-envelope:ladder': {
    description: 'Computes the CPU/SoC thermal envelope for an edge-AI / industrial enclosure — junction temperature, case temperature, throttle risk, and required airflow — using a series thermal-resistance ladder.',
    origin: 'In-tree implementation against NVIDIA Jetson Thermal Design Guide + Aavid Thermal Solutions Heatsink Catalogue + TI Application Note AN-2020. Series ladder: T_j = T_amb + Q × (R_jc + R_cs + R_sa + R_enclosure); natural-convection NTU for enclosure rise.',
    results_interpretation: 'junction_temp_c must sit below T_j_max (typically 95-105 °C for ARM Cortex SoCs). throttle_risk flags whether the design hits the thermal-throttle threshold under sustained load. required_airflow_cfm sizes the fan, if any. If passive can\'t handle it, active or liquid cooling becomes mandatory.',
    usage_pattern: 'Sizes the cooling solution for edge-AI / industrial-enclosure products. Couples with inference-throughput:edge (which sets dissipation) and the enclosure ingress-protection rating.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // FSO / RF / Phased Array / Optical tools
  // ──────────────────────────────────────────────────────────────────────
  'beamforming-codebook:dft-hybrid': {
    description: 'Designs a phased-array beamforming codebook (DFT / hybrid analog-digital / MMSE) — codebook size, scan loss at boresight + edge, and computational complexity.',
    origin: 'In-tree implementation of Balanis 2005 "Antenna Theory: Analysis and Design" chapter 6 + Hur, Kim, Love 2013 IEEE Comm. Mag. 51 106 + Heath et al. 2016 JSTSP 10 436. DFT codebook M codewords for M-element ULA; hybrid uses N_RF < M.',
    results_interpretation: 'codebook_size of 64 for a 256-element array (4:1 reduction is hybrid). scan_loss_db at 60° edge typically -1.5 dB (cosine taper). If grating lobes appear at <90° the element spacing exceeds λ/2 and needs redesign.',
    usage_pattern: 'Sizes the phased-array digital backend for satellite ground stations + 5G/6G mm-wave designs. Couples with calibration-imperfection:phase-gain.',
  },

  'calibration-imperfection:phase-gain': {
    description: 'Predicts phased-array beam-pattern degradation from random phase + gain calibration errors — sidelobe rise, gain loss, and pointing error vs RMS error per element.',
    origin: 'In-tree implementation of Mailloux 2005 "Phased Array Antenna Handbook" 2nd ed. + Skolnik 2008 "Radar Handbook" 3rd ed. Gain loss ΔG = -4.343·σ_φ² dB; sidelobe rise = 10·log10(σ_φ²·M).',
    results_interpretation: 'gain_loss_db < 0.5 needs σ_φ < 5° RMS; sidelobe_level_db rises -3 dB above design with σ_φ ~ 10°. pointing_error_arcmin drives the ATP loop bandwidth. If calibration drifts above 15° RMS the beam falls apart.',
    usage_pattern: 'Sizes the calibration tolerance for phased-array designs (satellite ground stations, radar). Outputs feed the calibration-procedure specification.',
  },

  'coherent-optical-receiver:dpsk-qpsk': {
    description: 'Models a coherent optical receiver (OOK / DPSK / QPSK / 16QAM) — BER, receiver sensitivity, shot-noise limit, and SNR — for free-space optics (FSO) or fibre links.',
    origin: 'In-tree implementation of Agrawal 2010 "Fiber-Optic Communication Systems" 4th ed. chapters 4-5 + Kazovsky et al. 2006. Shot-noise-limited BER: BPSK = (½)·erfc(√N_photons); DPSK adds 0.5 dB penalty.',
    results_interpretation: 'ber below 1e-3 enables hard-decision FEC down to 1e-15; below 1e-9 raw. receiver_sensitivity_dbm sets the minimum input power. shot_noise_limit_dbm is the absolute floor — any noise above that is detector or local-oscillator noise that needs reducing.',
    usage_pattern: 'Sizes the FSO modulation choice for ground-station-to-satellite or inter-satellite optical links. Couples with optical-atp:closed-loop (which sets the jitter envelope).',
  },

  'optical-atp:closed-loop': {
    description: 'Sizes a free-space-optics (FSO) Acquisition / Tracking / Pointing closed-loop bandwidth + fade margin from transmit jitter, aperture, link range, and platform vibration spectrum.',
    origin: 'In-tree implementation of Andrews & Phillips 2005 "Laser Beam Propagation Through Random Media" + Kaymak et al. 2018 IEEE Comm. Surv. Tut. 20 1104. Diffraction-limited divergence θ = λ/D_tx; closed-loop BW must exceed jitter spectrum.',
    results_interpretation: 'atp_bandwidth_hz typically 100-1000 Hz to track platform vibration with margin. fade_margin_db < 3 means the link drops on a vibration spike. required_disturbance_rejection_db drives the FPGA controller order + fast-steering-mirror bandwidth.',
    usage_pattern: 'Sizes the ATP electronics for FSO product designs. Couples with coherent-optical-receiver:dpsk-qpsk (which uses the pointing-loss margin).',
  },

  'wireless-link-budget:friis': {
    description: 'Computes BLE / NFC / Sub-GHz wireless link budget — path loss, received power, link margin, and max range — using the Friis transmission equation plus body-absorption correction.',
    origin: 'In-tree implementation of Hall & Hao eds. 2012 "Antennas and Propagation for Body-Centric Wireless Communications" (Artech House) + IEEE 802.15.6-2012. Friis P_r = P_t × G_t × G_r × (λ/(4πd))²; body absorption per Hall-Hao chapter 4.',
    results_interpretation: 'link_margin_db > 10 is robust; 0-10 is marginal (occasional drops); < 0 the link fails. max_range_m of 10-30 m typical for BLE on-body to phone; sub-GHz extends to hundreds of metres. Body-worn devices lose 3-6 dB to body absorption at 2.4 GHz.',
    usage_pattern: 'Sizes the wireless radio + antenna for CGM and wearable medical products. Outputs feed the BLE/sub-GHz module BoM.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // E-bike / Ground-vehicle tools
  // ──────────────────────────────────────────────────────────────────────
  'gear-ratio:bicycle': {
    description: 'Computes e-bike / EV motor-to-wheel gear ratio + top speed from motor Kv, battery voltage, wheel diameter, and pulley teeth — outputs max RPM, max speed, and torque at wheel.',
    origin: 'In-tree implementation against Bosch CX Drive Unit Technical Data + Bafang BBSHD service manual. Motor RPM = Kv × V; wheel RPM = motor / gear_ratio; speed = wheel RPM × π × D_wheel.',
    results_interpretation: 'max_speed_kmh capped at 25 km/h in EU pedelec mode; 45 km/h in S-pedelec; >50 km/h in unrestricted. torque_at_wheel_nm of 150-300 N·m at the wheel hub is typical for e-bike hub motors with mid-drive reduction. If gear ratio is wrong the motor lives in inefficient zones.',
    usage_pattern: 'Sizes the drive-train selection for e-bike and small-EV products. Outputs feed the legal-classification gate (pedelec vs S-pedelec).',
  },

  'rolling-resistance:cycling': {
    description: 'Computes e-bike / cyclist power demand — rolling drag, aero drag, gradient power — for a chosen mass, velocity, road grade, tire pressure, and rider position.',
    origin: 'In-tree implementation of Wilson & Papadopoulos 2004 "Bicycling Science" 3rd ed. (MIT Press). P_total = (C_rr × m × g + 0.5 × ρ × C_d × A × v² + m × g × sin(θ)) × v / η.',
    results_interpretation: 'total_power_required_w of 150-250 W at 30 km/h flat road for a 95 kg rider+bike — aero drag dominates at speed, rolling at low speed. battery_power_required_w includes drivetrain losses (motor + controller ~90 % efficiency). Steep grade (>5 %) inverts the dominance to gradient power.',
    usage_pattern: 'Sizes the motor + battery for e-bike products. Reads ride profile (urban / commuter / mountain) and produces the power budget that the battery + motor must deliver.',
  },

  'runtime:peukert-discharge': {
    description: 'Computes UPS or e-bike battery runtime at variable load — usable kWh, effective load with Peukert correction, runtime in minutes — for the chosen chemistry (LFP / NMC / lead-acid / NiCd).',
    origin: 'In-tree implementation against IEEE 1184-2006 "IEEE Guide for Batteries for Uninterruptible Power Supply Systems" + Peukert 1897 (for lead-acid). Runtime = (capacity × DoD × η_inv) / load_kW; Peukert exponent corrects non-LFP chemistries.',
    results_interpretation: 'runtime_minutes is the headline number — UPS needs to bridge utility outage until generator starts (~5-15 min) or until graceful shutdown. usable_capacity_kwh sized by DoD (80 % LFP, 50 % lead-acid). LFP Peukert exponent ~1.0; lead-acid 1.1-1.3 (high discharge derates capacity).',
    usage_pattern: 'Sizes the battery for UPS and e-bike products. Reads load profile and produces the battery-capacity spec that the chemistry × cycle-life curve must support.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Spacecraft thermal & components (continued)
  // ──────────────────────────────────────────────────────────────────────
  'heat-pipe:sizing': {
    description: 'Sizes a constant-conductance (CCHP), variable-conductance (VCHP), or loop-heat-pipe (LHP/CPL) for spacecraft thermal transport — pipe diameter, wick pore size, capillary limit, and mass.',
    origin: 'In-tree implementation of Chi 1976 "Heat Pipe Theory and Practice" (Hemisphere) + Brennan & Kroliczek 1979 "Heat Pipe Design Handbook" (NASA). Capillary, sonic, entrainment, boiling limits per Chi. Working-fluid figure-of-merit M = ρ_L × σ × h_fg / μ_L.',
    results_interpretation: 'max_heat_transport_w_m above the design load gives margin; below it means the pipe dries out. pressure_drop_pa drives the working-fluid pump (for LHP) or capillary pressure (for CCHP). Ammonia is the spacecraft standard; water for sub-100 °C; acetone for cryogenic.',
    usage_pattern: 'Sizes thermal-transport line items for spacecraft + edge-AI + CNC + any high-flux thermal subsystem. Couples with orbital-thermal:sat-balance and radiator:spacecraft-sizing.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // INS / Sensors tools
  // ──────────────────────────────────────────────────────────────────────
  'ins:navigation-drift': {
    description: 'Estimates inertial-navigation-system (INS) position + velocity drift over time for MEMS / FOG / RLG gyro grades, optionally aided by DVL or USBL/LBL acoustic positioning.',
    origin: 'In-tree implementation of Groves 2013 "Principles of GNSS, Inertial, and Multisensor Integrated Navigation Systems" 2nd ed. (Artech House). Position drift σ_pos(t) = σ_accel × t²/2 + σ_gyro × t³/6; DVL-aided drift reduced to 0.1-1 % of distance.',
    results_interpretation: 'position_error_m grows fast (t² or t³ unaided) — a MEMS-class IMU drifts > 1 km after an hour. DVL or USBL bounds it to 0.1-1 % of range. Choose gyro grade based on mission window: MEMS for short missions with GPS aiding, FOG/RLG for long unaided.',
    usage_pattern: 'Sizes the IMU + aiding-sensor combination for AUV / drone / satellite navigation. Reads mission profile and produces the IMU grade + aiding-sensor choice.',
  },

  'obstacle-avoidance:sensor': {
    description: 'Sizes obstacle-avoidance sensors (LiDAR / mmWave radar / stereo vision / ultrasonic / ToF / event camera) for drone / AUV safety envelopes — outputs stopping distance, sensor range, FoV, and bill-of-materials cost.',
    origin: 'In-tree implementation of Bachrach et al. 2012 Int. J. Robotics Research "Estimation, planning and mapping for autonomous flight using an RGB-D camera in GPS-denied environments" + Ouster / Velodyne LiDAR datasheets. Braking envelope = v²/(2·a_max) + v·t_response.',
    results_interpretation: 'stopping_distance_m must fit inside the chosen sensor\'s reliable range. LiDAR for long range (10-300 m, £500-15,000); stereo vision for short cluttered (0.5-25 m, £50-1,500); ultrasonic for close-in (0.2-4 m, £20-200). If chosen sensor\'s range is below stopping distance the design fails the safety case.',
    usage_pattern: 'Sizes the perception-sensor suite for drone + AUV designs. Reads operating speed and outputs the sensor BoM + the perception SoC requirement.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Solar / MPPT tools
  // ──────────────────────────────────────────────────────────────────────
  'mppt:sandia-tracking': {
    description: 'Models a grid-tied solar inverter\'s maximum-power-point tracker (MPPT) — operating voltage, current, power, and tracking efficiency at a given irradiance + cell temperature.',
    origin: 'In-tree implementation of King, Boyson & Kratochvil 2004 "Photovoltaic Array Performance Model" (Sandia Report SAND2004-3535). Sandia model for I_mp/V_mp at MPP from irradiance, temperature, air-mass corrections; perturb-and-observe MPPT.',
    results_interpretation: 'mppt_efficiency_pct typically 99-99.5 % for modern MPPT (lab-tested). mpp_voltage_v drops with temperature (~-0.3 %/°C); mpp_current_a scales with irradiance. If mppt_efficiency falls below 98 % the tracking algorithm needs faster updates or P&O step-size tuning.',
    usage_pattern: 'Sizes the MPPT module for solar-inverter, HAPS, and small-satellite designs. Reads the PV string V_oc + I_sc from the array spec.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Noise / Acoustics
  // ──────────────────────────────────────────────────────────────────────
  'noise-emission:dba': {
    description: 'Computes acoustic emission (sound power and sound pressure at distance) per BS EN 12102 — for heat-pump outdoor units, drones, e-bikes, and wind turbines.',
    origin: 'In-tree implementation of BS EN 12102-1:2022 "Air conditioners, liquid chilling packages — Part 1: Determination of sound power level" + UK Town and Country Planning General Permitted Development Order 2015. L_p = L_w − 20 log10(r) − 11 (point source).',
    results_interpretation: 'sound_pressure_dba_at_1m at the property boundary must sit below 42 dB(A) for UK heat-pump PDR. drone noise above 65 dB(A) at 10 m makes urban operation difficult. wind-turbine 45 dB(A) at 500 m boundary is the planning-typical limit.',
    usage_pattern: 'Runs in the regulatory section for noise-emitting products (heat pump, drone, e-bike, wind turbine). Outputs feed the planning-application section + cap the design envelope.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Pressure vessel / Structural tools
  // ──────────────────────────────────────────────────────────────────────
  'pressure-vessel:design': {
    description: 'Sizes a pressure vessel (AUV housing, BESS enclosure, electrolyser, satellite tank) per ASME BPVC Section VIII — wall thickness, hoop stress, buckling pressure, and safety factor.',
    origin: 'In-tree implementation of ASME BPVC Section VIII Division 1 (2023). Thin-wall hoop stress σ_h = pD/(2t); Roark\'s Formulas for Stress and Strain Table 13.1 for thick-wall corrections; external-pressure buckling per ASME Code Case 2286.',
    results_interpretation: 'safety_factor must exceed 2.0 for life-safety vessels; > 1.5 for industrial. hoop_stress_mpa vs yield strength shows margin. buckling_pressure_critical_mpa must exceed the design pressure with margin. mass_kg drives the dry-mass budget — Ti-6Al-4V vs aluminium 7075 vs steel 316L vs CFRP all trade weight against cost.',
    usage_pattern: 'Mandatory check for any pressurised component in the design — AUV housings, BESS containers, satellite tanks, ventilator manifolds. Drives the material + wall-thickness BoM.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Thermo / Properties libraries
  // ──────────────────────────────────────────────────────────────────────
  'thermo:fluid-properties': {
    description: 'Provides pure-component and mixture thermodynamic properties (density, viscosity, heat capacity, surface tension, vapour pressure) at given temperature and pressure using Caleb Bell\'s `thermo` library.',
    origin: 'Open-source `thermo` library (MIT, Caleb Bell). Pure-component property regressions from DIPPR 801 and CoolProp REFPROP-equivalent equations of state (Peng-Robinson, SRK, IAPWS-IF97 for water). Mixture properties via Lee-Kesler-Plocker, Chao-Seader, and Helmholtz-EoS.',
    results_interpretation: 'Returns the requested property at the input T, P state point. Phase identification (liquid / vapour / supercritical) tells whether the design point is single- or two-phase. Use as the Layer-1 property database for chemistry-heavy designs.',
    usage_pattern: 'Called wherever a non-refrigerant pure-component or mixture property is needed — bioreactor process engineering, electrolyser balance-of-plant. Doesn\'t set design decisions on its own — it\'s the property database other tools consume.',
  },

  // ──────────────────────────────────────────────────────────────────────
  // Cross-class security / IT tools
  // ──────────────────────────────────────────────────────────────────────
  'cybersecurity-threat-model:stride': {
    description: 'Builds a STRIDE + DREAD threat model for a connected product — enumerates threats by category, scores by damage × reproducibility × exploitability × affected users × discoverability, plus compliance gap analysis vs ETSI EN 303 645 + ISO 27001.',
    origin: 'In-tree implementation of STRIDE/DREAD per Microsoft Security Development Lifecycle + ETSI EN 303 645:2020 (Consumer IoT Cybersecurity) + ISO/IEC 27001:2022. Threat library from OWASP IoT Top 10 (2018), NIST SP 800-30 Rev 1, NIST IR 8259A, and Microsoft Threat Modeling Tool catalogue.',
    results_interpretation: 'stride_threats enumerates Spoofing/Tampering/Repudiation/Information-disclosure/DoS/Elevation-of-privilege risks specific to the design. dread_score per threat (0-50 scale) prioritises which to mitigate first. compliance_gap_count tells how far the design is from passing ETSI EN 303 645 or ISO 27001.',
    usage_pattern: 'Runs in the security gate for any connected product. Outputs feed the security-controls section + the firmware update + crypto BoM line items.',
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
