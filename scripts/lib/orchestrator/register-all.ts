/**
 * scripts/lib/orchestrator/register-all.ts
 *
 * Side-effect import: triggers auto-registration of every shipped
 * tool wrapper + every class plan. The chain orchestrator imports
 * this file at startup so the registry + planner are populated
 * before any orchestrateDesign() call.
 *
 * 2026-05-22: extended from 6 real wrappers + 3 stubs to the full
 * 125-tool inventory. Each `*-real`/`*-stub` from the original set
 * is preserved; the 119 auto-generated wrappers (snake-to-kebab from
 * `python/<name>.py`) provide subprocess marshalling for the rest.
 */

// ---------------------------------------------------------------------------
// CORE REAL WRAPPERS (pre-existing, hand-wired)
// ---------------------------------------------------------------------------
import './tools/pybamm-real'         // Build #18f  PyBaMM 26.4.3
import './tools/coolprop-real'       // Build #18e  CoolProp 7.2.0
import './tools/pandapower-real'     // Build #18g  pandapower 3.4.0
import './tools/ngspice-real'        // Build #18h  ngspice 46 direct CLI
import './tools/opendss-real'        // Build #18i  OpenDSS 0.9.4
import './tools/cantera-real'        // Build #18j  Cantera 3.2.0
// 2026-05-25: octopart-stub replaced by distributor-cascade-real which calls
// findSkuForPart (Mouser + Digi-Key + Farnell + LCSC + Nexar in parallel).
// Same tool ID 'octopart:parts-lookup' preserved so TOOL_INPUT_HINTS + mermaid
// downstream consumers do not need migration. Per mempalace tier-1 policy,
// distributor APIs are the authoritative source for parts catalogue data.
import './tools/distributor-cascade-real'
import './tools/iec-standards-stub'  // stub (needs scrape or local DB)
import './tools/mass-aggregator'     // Build #18q  pure-TS internal aggregator

// ---------------------------------------------------------------------------
// LAYER-1 LIBRARY WRAPPERS (peer-reviewed, 2026-05-22 batch)
// ---------------------------------------------------------------------------
import './tools/fluids-run'           // fluids 1.3.0 — pipe sizing
import './tools/ht-run'               // ht 1.2.0 — heat exchanger ε-NTU
import './tools/thermo-run'           // thermo 0.6.0 — DIPPR fluid properties
import './tools/control-systems-run'  // python-control 0.10.2 — PID tuning

// ---------------------------------------------------------------------------
// HAPS / AERO
// ---------------------------------------------------------------------------
import './tools/pvlib-run'
import './tools/aerosandbox-run'
import './tools/ambiance-run'
import './tools/propeller-at-low-re'
import './tools/motor-at-altitude'
import './tools/battery-lithium-sulphur'
import './tools/gust-response-atmospheric'
import './tools/aeroelastic-flutter'
import './tools/airframe-fea-landing'

// ---------------------------------------------------------------------------
// VERTICAL FARM
// ---------------------------------------------------------------------------
import './tools/psychrolib-run'
import './tools/led-par'
import './tools/plant-growth'
import './tools/co2-enrichment-sizing'
import './tools/nutrient-solution-chemistry'
import './tools/pest-control-uvc'
import './tools/irrigation-pump-sizing'

// ---------------------------------------------------------------------------
// HEAT PUMP + HVAC
// ---------------------------------------------------------------------------
import './tools/refrigeration-cycle'
import './tools/scop-seasonal-efficiency'
import './tools/eer-seer-calculation'
import './tools/defrost-cycle-model'
import './tools/noise-emission-dba'
import './tools/building-envelope-heat-loss'
import './tools/hvac-load-sizing'
import './tools/dehumidification-calc'
import './tools/fan-coil-sizing'

// ---------------------------------------------------------------------------
// AUV
// ---------------------------------------------------------------------------
import './tools/auv-hydro'
import './tools/pressure-vessel'
import './tools/sonar-acoustic'
import './tools/mission-endurance-at-depth'
import './tools/acoustic-modem-link'
import './tools/corrosion-anode-sizing'
import './tools/recovery-method-logistics'

// ---------------------------------------------------------------------------
// DRONE
// ---------------------------------------------------------------------------
import './tools/bemt-propeller'
import './tools/motor-prop-match'
import './tools/gust-response-drone'
import './tools/gimbal-balance-cog'
import './tools/obstacle-avoidance-sensor'
import './tools/ins-navigation-drift'

// ---------------------------------------------------------------------------
// BIOREACTOR
// ---------------------------------------------------------------------------
import './tools/biosteam-run'
import './tools/kla-oxygen'
import './tools/agitation-power'
import './tools/monod-kinetics'
import './tools/ph-titration-sizing'
import './tools/dissolved-oxygen-control'
import './tools/clean-in-place-cip'
import './tools/downstream-chromatography'

// ---------------------------------------------------------------------------
// CGM (continuous glucose monitor)
// ---------------------------------------------------------------------------
import './tools/glucose-sensor'
import './tools/wireless-link-budget'
import './tools/wearable-battery-life'
import './tools/biocompatibility-check'

// ---------------------------------------------------------------------------
// edge_ai
// ---------------------------------------------------------------------------
import './tools/inference-throughput'
import './tools/thermal-envelope'
import './tools/network-bandwidth'
import './tools/enclosure-emc'

// ---------------------------------------------------------------------------
// ev_charger
// ---------------------------------------------------------------------------
import './tools/ev-battery-charging-curve'
import './tools/ccs-protocol-compliance'
import './tools/power-module-sizing'
import './tools/cable-thermal'
import './tools/cable-ampacity'

// ---------------------------------------------------------------------------
// solar_inverter
// ---------------------------------------------------------------------------
import './tools/mppt-tracking-model'

// ---------------------------------------------------------------------------
// wind_turbine
// ---------------------------------------------------------------------------
import './tools/wind-resource-model'
import './tools/gearbox-load-spectrum'

// ---------------------------------------------------------------------------
// h2_electrolyser
// ---------------------------------------------------------------------------
import './tools/electrolyser-efficiency'
import './tools/pem-membrane-sizing'

// ---------------------------------------------------------------------------
// ups_inverter
// ---------------------------------------------------------------------------
import './tools/runtime-calc'

// ---------------------------------------------------------------------------
// 3d_printer_fdm + cnc_machine
// ---------------------------------------------------------------------------
import './tools/extruder-thermal'
import './tools/motion-kinematics'
import './tools/spindle-thermal'
import './tools/mrr-chip-load'

// ---------------------------------------------------------------------------
// e_bike
// ---------------------------------------------------------------------------
import './tools/rolling-resistance'
import './tools/gear-ratio'

// ---------------------------------------------------------------------------
// SATELLITES + spacecraft
// ---------------------------------------------------------------------------
import './tools/orbital-thermal'
import './tools/attitude-torque'
import './tools/nrlmsise00-run'
import './tools/radiator-sizing'
import './tools/heat-pipe-sizing'
import './tools/thermal-strap'
import './tools/mli-thermal'
import './tools/pcm-thermal-storage'
import './tools/cryocooler-sizing'
import './tools/tsiolkovsky-delta-v'
import './tools/chemical-propulsion-sizing'
import './tools/electric-propulsion-sizing'
import './tools/cold-gas-thruster'
import './tools/propellant-tank-sizing'
import './tools/reaction-wheel-sizing'
import './tools/magnetorquer-sizing'
import './tools/solar-array-sizing'
import './tools/battery-eclipse-cycle'
import './tools/link-budget-rf'
import './tools/orbit-propagator-j2'
import './tools/delta-v-budget'
import './tools/launch-vibration'

// ---------------------------------------------------------------------------
// ventilator
// ---------------------------------------------------------------------------
import './tools/flow-compliance'
import './tools/peep-valve-sizing'

// ---------------------------------------------------------------------------
// dialysis
// ---------------------------------------------------------------------------
import './tools/osmosis-membrane'
import './tools/blood-pump-sizing'
import './tools/water-treatment-ro'

// ---------------------------------------------------------------------------
// BESS specific (existing extras)
// ---------------------------------------------------------------------------
import './tools/battery-c-rate-thermal'
import './tools/cell-balance-model'
import './tools/warranty-reliability-battery'
import './tools/arc-flash-analysis'
import './tools/grounding-lightning'
import './tools/fire-suppression-sizing'
import './tools/yield-economics-npv'

// ---------------------------------------------------------------------------
// UNIVERSAL (apply to every class plan)
// ---------------------------------------------------------------------------
import './tools/regulatory-certification-cost'
import './tools/lifecycle-co2'
import './tools/supply-chain-risk'
import './tools/reliability-fmea'
import './tools/cybersecurity-threat-model'
import './tools/transport-logistics'

// ---------------------------------------------------------------------------
// REGIONAL REGULATORY (class-specific)
// ---------------------------------------------------------------------------
import './tools/regulatory-caa-part107'
import './tools/regulatory-faa-airspace'
import './tools/regulatory-fda-cgmp'
import './tools/regulatory-imo-maritime'

// ===========================================================================
// CLASS PLANS — auto-register on import
// ===========================================================================
import './class-plans/bess'
import './class-plans/haps'
import './class-plans/vertical-farm'
import './class-plans/heat-pump-residential'
import './class-plans/drone'
import './class-plans/auv'
import './class-plans/bioreactor'
import './class-plans/cgm'
import './class-plans/edge-ai'
import './class-plans/ev-charger'
import './class-plans/solar-inverter'
import './class-plans/wind-turbine'
import './class-plans/h2-electrolyser'
import './class-plans/ups-inverter'
import './class-plans/3d-printer-fdm'
import './class-plans/cnc-machine'
import './class-plans/e-bike'
import './class-plans/satellite-cubesat'
import './class-plans/satellite-smallsat'
import './class-plans/satellite-geo-comsat'
import './class-plans/satellite-interplanetary'
import './class-plans/propulsion-thruster-product'
import './class-plans/ground-station'
import './class-plans/ventilator'
import './class-plans/dialysis-machine'

// ---------------------------------------------------------------------------
// 2026-05-22 PRIORITY-CLASS ADDITIONS — 10 new classes
// (eVTOL / quantum / cryostat / FSO / phased-array / solid-state battery /
//  PEMFC / SMR / humanoid / DAC) and their 29 new Python tools.
// ---------------------------------------------------------------------------
// eVTOL
import './tools/rotor-tilt-transition'
import './tools/downwash-recirculation'
import './tools/pilot-workload'
import './tools/bvlos-part23-certification'
// Quantum
import './tools/qubit-count-to-logical'
import './tools/microwave-control-pulse'
import './tools/qubit-chip-thermal'
// Cryostat
import './tools/dilution-fridge-cooling-power'
import './tools/helium-circulation'
import './tools/magnetic-shielding'
// FSO
import './tools/optical-acquisition-tracking-pointing'
import './tools/coherent-optical-receiver'
// Phased array
import './tools/beamforming-codebook'
import './tools/calibration-imperfection'
// Solid-state battery
import './tools/li-metal-dendrite'
import './tools/ceramic-electrolyte-conductivity'
import './tools/stack-compression-pressure'
// PEMFC
import './tools/pemfc-polarisation-curve'
import './tools/membrane-humidification'
import './tools/pt-loading-optimisation'
// SMR
import './tools/neutron-physics-keff'
import './tools/decay-heat-loca'
import './tools/biological-shielding'
// Humanoid
import './tools/joint-actuator-torque'
import './tools/dynamic-walking-zmp'
import './tools/dexterity-kinematics'
// DAC
import './tools/sorbent-kinetics'
import './tools/regeneration-energy'
import './tools/contactor-geometry'

// Class plans for 10 priority new classes
import './class-plans/evtol'
import './class-plans/quantum-computer'
import './class-plans/cryostat'
import './class-plans/fso'
import './class-plans/phased-array'
import './class-plans/solid-state-battery'
import './class-plans/pemfc'
import './class-plans/smr'
import './class-plans/humanoid'
import './class-plans/dac'

// ===========================================================================
// 2026-05-22 — 6 satellite/ground-segment EMITTERS — BESS-quality
// Each emitter self-registers via registerAssembler() at module load.
// Class plans for these 6 classes were upgraded to BESS-quality at the same time.
// ===========================================================================
import './emitters/satellite_cubesat'
import './emitters/satellite_smallsat'
import './emitters/satellite_geo_comsat'
import './emitters/satellite_interplanetary'
import './emitters/propulsion_thruster_product'
import './emitters/ground_station'

// ===========================================================================
// PER-CLASS EMITTERS — auto-register at module load via registerAssembler().
//
// The orchestrator's `assembleDesign()` looks these up by envelope.class
// (or class/scale_tier) when a tool plan completes; without an emitter
// match the orchestrator falls back to the legacy LLM Generator path.
// Added 2026-05-22 with the vertical_farm emitter.
// ===========================================================================
import './emitters/vertical_farm'
import './emitters/quantum-computer'
import './emitters/cryostat'
import './emitters/fso'
import './emitters/phased-array'
import './emitters/auv'
import './emitters/3d-printer-fdm'
import './emitters/cnc-machine'
import './emitters/bioreactor'
// 2026-05-22 BESS-quality batch: edge_ai / humanoid / smr / dac / solid-state-battery
import './emitters/edge-ai'
import './emitters/humanoid'
import './emitters/smr'
import './emitters/dac'
import './emitters/solid-state-battery'
// 2026-05-22 HVAC + medical BESS-quality batch (Build #20b):
// heat_pump_residential / dialysis_machine / ventilator / cgm
import './emitters/heat-pump-residential'
import './emitters/dialysis-machine'
import './emitters/ventilator'
import './emitters/cgm'
// 2026-05-22 Mobility/aerial BESS-quality batch (Build #20a):
// haps / drone / evtol / e_bike
import './emitters/haps'
import './emitters/drone'
import './emitters/evtol'
import './emitters/e_bike'
// 2026-05-22 Power-conversion BESS-quality batch (Build #20c):
// solar_inverter / wind_turbine / h2_electrolyser / ups_inverter / ev_charger / pemfc
import './emitters/solar-inverter'
import './emitters/wind-turbine'
import './emitters/h2-electrolyser'
import './emitters/ups-inverter'
import './emitters/ev-charger'
import './emitters/pemfc'
