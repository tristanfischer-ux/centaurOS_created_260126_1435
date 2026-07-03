#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/test_deep_class_tools.py

Smoke tests for deep class tools added in subagent #1 dispatch
(2026-05-22 final tool-building round):

Universal tools (Group A, 6):
- regulatory_certification_cost
- lifecycle_co2
- supply_chain_risk
- reliability_fmea
- cybersecurity_threat_model
- transport_logistics

Per-class deep tools (Group B):
- BESS (6): cable_ampacity, arc_flash_analysis, fire_suppression_sizing,
  grounding_lightning, cell_balance_model, warranty_reliability_battery
- Vertical Farm (6): nutrient_solution_chemistry, water_treatment_ro,
  co2_enrichment_sizing, irrigation_pump_sizing, pest_control_uvc, yield_economics_npv
- HAPS (6): propeller_at_low_re, motor_at_altitude, aeroelastic_flutter,
  battery_lithium_sulphur, gust_response_atmospheric, regulatory_faa_airspace
- Heat Pump (5): defrost_cycle_model, noise_emission_dba, eer_seer_calculation,
  scop_seasonal_efficiency, building_envelope_heat_loss
- Drone (6): airframe_fea_landing, gimbal_balance_cog, gust_response_drone,
  obstacle_avoidance_sensor, battery_c_rate_thermal, regulatory_caa_part107
- AUV (6): mission_endurance_at_depth, acoustic_modem_link, ins_navigation_drift,
  corrosion_anode_sizing, recovery_method_logistics, regulatory_imo_maritime
- Bioreactor (6): monod_kinetics, ph_titration_sizing, dissolved_oxygen_control,
  clean_in_place_cip, downstream_chromatography, regulatory_fda_cgmp

Usage:
    .venv/bin/python3 scripts/lib/orchestrator/tools/python/test_deep_class_tools.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import traceback
from pathlib import Path

HERE = Path(__file__).parent
PYTHON = str(HERE.parents[4] / ".venv" / "bin" / "python3")

RESULTS = []


def run(script: str, payload: dict) -> dict:
    proc = subprocess.run(
        [PYTHON, str(HERE / script)],
        input=json.dumps(payload),
        capture_output=True, text=True, timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"{script} exit {proc.returncode}: {proc.stderr[:300]}")
    return json.loads(proc.stdout)


def case(name, expected_summary):
    def deco(fn):
        def wrap():
            t0 = time.time()
            entry = {"tool": name, "expected": expected_summary}
            try:
                v = fn()
                entry["status"] = "PASS"
                entry["value"] = v
            except AssertionError as exc:
                entry["status"] = "FAIL"
                entry["error_msg"] = str(exc)[:200]
            except Exception as exc:
                entry["status"] = "ERROR"
                entry["error_type"] = type(exc).__name__
                entry["error_msg"] = str(exc)[:200]
                entry["trace"] = traceback.format_exc().splitlines()[-1]
            entry["wall_time_s"] = round(time.time() - t0, 3)
            RESULTS.append(entry)
        return wrap
    return deco


# ============== UNIVERSAL TOOLS (GROUP A) ==============

@case("regulatory_certification_cost", "bess UK ~£375k, critical path 9 mo")
def t_reg_cost():
    r = run("regulatory_certification_cost.py", {
        "product_class": "bess", "region": "UK",
        "target_market_volume_units_per_year": 5000,
    })
    assert r["total_cost_gbp"] > 200000, f"cost too low: {r['total_cost_gbp']}"
    assert r["total_cost_gbp"] < 600000, f"cost too high: {r['total_cost_gbp']}"
    assert r["total_critical_path_months"] >= 5
    assert r["total_critical_path_months"] <= 18
    return f"£{r['total_cost_gbp']}, {r['total_critical_path_months']} months"


@case("lifecycle_co2", "1250kg + 10MWh × 15yr LFP ~30t total")
def t_lca():
    r = run("lifecycle_co2.py", {
        "bom_materials": [
            {"material": "steel", "mass_kg": 1000, "source_region": "EU"},
            {"material": "aluminium", "mass_kg": 200, "source_region": "GLOBAL"},
            {"material": "lithium", "mass_kg": 50, "source_region": "CN"},
        ],
        "operational_energy_kwh_per_year": 10000,
        "service_life_years": 15,
        "eol_pathway": "recycle",
        "grid_carbon_intensity_kgco2_kwh": 0.21,
    })
    assert 20000 < r["total_lifecycle_co2_kg"] < 50000, \
        f"total CO2 out of range: {r['total_lifecycle_co2_kg']}"
    assert r["compliance_eu_csrd"] is True
    return f"{r['total_lifecycle_co2_kg']/1000:.1f} t CO2 lifecycle"


@case("supply_chain_risk", "high CN concentration -> risk score > 75")
def t_scr():
    r = run("supply_chain_risk.py", {
        "bom_parts": [
            {"part_id": "LFP_cell", "manufacturer": "CATL", "manufacturer_country": "CN",
             "unit_cost_gbp": 80, "quantity": 280, "category": "battery"},
            {"part_id": "inverter", "manufacturer": "Huawei",
             "manufacturer_country": "CN", "unit_cost_gbp": 5000, "quantity": 1},
            {"part_id": "BMS", "manufacturer": "Bender",
             "manufacturer_country": "DE", "unit_cost_gbp": 800, "quantity": 1},
        ],
        "destination_country": "UK", "dual_sourcing_required": True,
    })
    assert r["risk_score"] > 75, f"risk score should be >75: {r['risk_score']}"
    assert r["china_concentration_pct"] > 50
    return f"risk {r['risk_score']:.0f}, China {r['china_concentration_pct']:.0f}%"


@case("reliability_fmea", "100-component 5yr warranty -> mtbf+claims")
def t_fmea():
    r = run("reliability_fmea.py", {
        "components": [
            {"category": "electrolytic_capacitor", "count": 12, "failure_severity": "minor"},
            {"category": "fan_ball", "count": 4, "failure_severity": "major"},
            {"category": "igbt", "count": 6, "failure_severity": "critical"},
            {"category": "mcu", "count": 2, "failure_severity": "critical"},
        ],
        "warranty_years": 5,
        "service_call_cost_gbp": 200,
        "replacement_cost_pct_of_unit": 5,
        "unit_cost_gbp": 50000,
    })
    assert r["system_mtbf_hours"] > 1000
    assert r["expected_warranty_claims_per_unit"] > 0
    return f"MTBF {r['system_mtbf_hours']}h, {r['expected_warranty_claims_per_unit']} claims/unit"


@case("cybersecurity_threat_model", "WiFi+cellular+OTA+PII+password -> high score")
def t_threat():
    r = run("cybersecurity_threat_model.py", {
        "connectivity_types": ["wifi", "cellular"],
        "data_sensitivity": "pii",
        "firmware_update_method": "ota",
        "authentication_method": "password",
    })
    assert r["severity_score"] > 50, f"severity_score should be high: {r['severity_score']}"
    assert len(r["stride_threats"]) > 5
    return f"severity {r['severity_score']}, {len(r['stride_threats'])} threats"


@case("transport_logistics", "3t/5m × 5 units UK->US 40ft container fits")
def t_logistics():
    r = run("transport_logistics.py", {
        "product_dimensions_mm": {"l": 5000, "w": 1200, "h": 2000},
        "product_mass_kg": 3000,
        "quantity_per_shipment": 5,
        "mode": "sea_40ft_container",
        "origin_country": "UK",
        "destination_country": "US",
    })
    assert r["fits_mode"] is True
    assert 1500 < r["shipping_cost_gbp"] < 20000
    return f"{r['shipping_cost_gbp']} cost, {r['units_per_container']} per container"


# ============== BESS ==============

@case("cable_ampacity", "300A copper tray cable in 30C")
def t_cable_ampacity():
    r = run("cable_ampacity.py", {
        "continuous_current_a": 300,
        "ambient_c": 30,
        "installation": "tray",
        "cable_material": "copper",
        "voltage_class_v": 800,
        "length_m": 50,
    })
    assert r["csa_mm2"] >= 50
    assert r["voltage_drop_pct"] < 3.5
    return f"{r['csa_mm2']}mm² Cu, vd={r['voltage_drop_pct']}%"


@case("arc_flash_analysis", "25kA fault, 480V, 100ms")
def t_arc_flash():
    r = run("arc_flash_analysis.py", {
        "prospective_fault_current_ka": 25,
        "voltage_v": 480,
        "gap_mm": 32,
        "working_distance_mm": 610,
        "clearing_time_s": 0.10,
    })
    assert r["incident_energy_cal_cm2"] > 0
    assert r["ppe_category"] in (0, 1, 2, 3, 4, -1)
    return f"E={r['incident_energy_cal_cm2']} cal/cm², PPE Cat {r['ppe_category']}"


@case("fire_suppression_sizing", "Novec 1230 for 86m³ BESS -> ~76kg")
def t_fire_supp():
    r = run("fire_suppression_sizing.py", {
        "agent": "novec_1230",
        "volume_m3": 86,
        "design_concentration_pct": 4.5,
    })
    assert 40 < r["agent_mass_kg"] < 120, f"mass out of range: {r['agent_mass_kg']}"
    return f"{r['agent_mass_kg']}kg agent, {r['total_cylinder_count']} cylinders"


@case("grounding_lightning", "100ohm-m soil, 4 rods, 3m each -> LPL II/III")
def t_grounding():
    r = run("grounding_lightning.py", {
        "site_soil_resistivity_ohm_m": 100,
        "container_dimensions_m": {"l": 12, "w": 2.5, "h": 2.6},
        "rod_count": 4,
        "rod_length_m": 3.0,
        "lpl_target": "II",
    })
    assert r["ground_resistance_ohm"] > 0
    assert r["lightning_protection_level"].startswith("LPL_")
    return f"{r['ground_resistance_ohm']}Ω, {r['lightning_protection_level']}"


@case("cell_balance_model", "100 LFP cells, 100mA passive shunt")
def t_balance():
    r = run("cell_balance_model.py", {
        "cell_count": 100,
        "cell_capacity_ah": 100,
        "cell_imbalance_pct_initial": 5.0,
        "balancing_type": "passive_shunt",
        "balancing_current_ma": 100,
        "chemistry": "lfp",
    })
    assert r["balancing_time_hours_per_cell"] > 0
    assert r["energy_lost_per_cycle_wh"] > 0
    return f"{r['balancing_time_hours_per_cell']}h/cell, {r['energy_lost_per_cycle_wh']}Wh"


@case("warranty_reliability_battery", "LFP 10yr 365 cycles 25C 80% DoD")
def t_warranty_battery():
    r = run("warranty_reliability_battery.py", {
        "cell_chemistry": "lfp",
        "cycle_count_per_year": 365,
        "average_dod_pct": 80,
        "average_temp_c": 25,
        "warranty_years": 10,
        "c_rate_average": 0.5,
        "battery_unit_cost_gbp": 100000,
    })
    assert 60 < r["expected_soh_at_warranty_end_pct"] < 95
    return f"SoH at EOW: {r['expected_soh_at_warranty_end_pct']}%"


# ============== Vertical Farm ==============

@case("nutrient_solution_chemistry", "Lettuce hydroponic recipe")
def t_nutrient():
    r = run("nutrient_solution_chemistry.py", {
        "target_crop": "lettuce",
        "water_source_ppm_dissolved": 100,
        "target_ec_ms_cm": 1.4,
        "target_ph": 6.0,
        "reservoir_volume_l": 1000,
    })
    assert r["target_crop"] == "lettuce"
    assert "Ca(NO3)2_4H2O" in r["salts_required_mg_per_l"]
    return f"{len(r['salts_required_mg_per_l'])} salts, EC={r['target_ec_ms_cm']}"


@case("water_treatment_ro", "1500 ppm TDS -> 50 ppm target")
def t_ro():
    r = run("water_treatment_ro.py", {
        "feed_water_tds_mg_l": 1500,
        "target_tds_mg_l": 50,
        "daily_water_demand_l": 10000,
        "recovery_target_pct": 70,
        "operating_hours_per_day": 16,
    })
    assert r["ro_membrane_area_m2"] > 0
    assert r["permeate_tds_mg_l"] < 150
    return f"{r['ro_membrane_area_m2']:.1f}m² membrane, {r['element_count']} elements"


@case("co2_enrichment_sizing", "100m² leafy greens at 1200 ppm")
def t_co2():
    r = run("co2_enrichment_sizing.py", {
        "growing_area_m2": 100,
        "target_co2_ppm": 1200,
        "photoperiod_hours": 16,
        "leaf_area_index": 4.0,
        "ach_air_changes_per_hour": 0.5,
        "room_height_m": 3.0,
        "crop": "leafy_greens",
    })
    assert r["co2_consumption_kg_day"] > 0
    return f"{r['co2_consumption_kg_day']}kg/day, {r['supply_method']}"


@case("irrigation_pump_sizing", "1000 drip emitters at 2L/h")
def t_irrigation():
    r = run("irrigation_pump_sizing.py", {
        "total_emitters": 1000,
        "flow_per_emitter_l_h": 2.0,
        "system_type": "drip",
        "pressure_loss_kpa": 100,
        "static_head_m": 2.0,
        "pipe_length_m": 50,
        "pipe_diameter_mm": 32,
    })
    assert r["motor_power_w"] > 0
    return f"{r['motor_power_w']}W motor, {r['pump_head_m']}m head"


@case("pest_control_uvc", "100m³ botrytis 4-log reduction")
def t_uvc():
    r = run("pest_control_uvc.py", {
        "room_volume_m3": 100,
        "target_kill_log_reduction": 4.0,
        "contaminant_type": "botrytis",
        "exposure_time_s": 600,
        "lamp_uvc_w": 30,
    })
    assert r["lamps_required"] > 0
    return f"{r['lamps_required']} lamps, {r['target_dose_mJ_cm2']} mJ/cm² target"


@case("yield_economics_npv", "VF 50t/yr at £6/kg")
def t_npv():
    r = run("yield_economics_npv.py", {
        "capex_gbp": 1000000,
        "opex_gbp_year": 250000,
        "annual_yield_kg": 50000,
        "market_price_gbp_kg": 6.0,
        "discount_rate_pct": 8.0,
        "project_life_years": 10,
        "annual_energy_kwh": 500000,
        "crop": "leafy_greens",
    })
    assert "npv_gbp" in r
    return f"NPV £{r['npv_gbp']}, IRR {r['irr_pct']}%"


# ============== HAPS ==============

@case("propeller_at_low_re", "4m HAPS prop at 20km altitude")
def t_prop_low_re():
    r = run("propeller_at_low_re.py", {
        "diameter_m": 4.0,
        "pitch_m": 2.4,
        "rpm": 800,
        "airspeed_ms": 25.0,
        "air_density_kg_m3": 0.0889,
        "num_blades": 2,
        "chord_m": 0.30,
    })
    assert r["thrust_n"] > 0
    return f"T={r['thrust_n']}N, P={r['power_w']}W, η={r['efficiency_pct']}%"


@case("motor_at_altitude", "5kW BLDC at 20km / passive cooling")
def t_motor_alt():
    r = run("motor_at_altitude.py", {
        "motor_power_w": 5000,
        "ambient_temp_c": -56.5,
        "ambient_pressure_kpa": 5.5,
        "cooling": "passive",
        "motor_efficiency_at_sl": 0.92,
        "motor_diameter_mm": 80,
        "motor_length_mm": 120,
    })
    assert r["continuous_power_w"] > 0
    return f"continuous {r['continuous_power_w']}W, junction {r['junction_temp_c']}°C"


@case("aeroelastic_flutter", "30m span HAPS wing")
def t_flutter():
    r = run("aeroelastic_flutter.py", {
        "wing_span_m": 30,
        "chord_m": 1.5,
        "mass_per_m_kg": 4.0,
        "ei_bending_nm2": 250000,
        "gj_torsion_nm2": 150000,
        "airspeed_ms": 25,
        "density_kg_m3": 0.0889,
    })
    assert r["flutter_speed_ms"] > 0
    return f"flutter {r['flutter_speed_ms']}m/s, margin {r['flutter_margin_pct']}%"


@case("battery_lithium_sulphur", "50 kWh LiS pack")
def t_li_s():
    r = run("battery_lithium_sulphur.py", {
        "target_energy_kwh": 50,
        "use_case": "haps",
        "target_lifetime_cycles": 300,
    })
    assert r["pack_mass_kg"] > 0
    assert r["pack_specific_energy_wh_kg"] > 200
    return f"{r['pack_mass_kg']}kg pack, {r['pack_specific_energy_wh_kg']} Wh/kg"


@case("gust_response_atmospheric", "20km altitude HAPS, mid-latitude")
def t_gust_atm():
    r = run("gust_response_atmospheric.py", {
        "altitude_km": 20,
        "wing_loading_pa": 30,
        "latitude_deg": 45,
        "season": "summer",
        "cl_alpha_per_rad": 6.0,
        "airspeed_ms": 25,
        "mission_duration_hours": 24,
        "wing_span_m": 30,
        "mass_kg": 75,
    })
    assert r["peak_gust_ms_statistical"] >= 0
    return f"peak gust {r['peak_gust_ms_statistical']}m/s, g={r['n_total_g']}"


@case("regulatory_faa_airspace", "UK HAPS 65000ft 24h ops")
def t_faa_airspace():
    r = run("regulatory_faa_airspace.py", {
        "country": "UK",
        "altitude_ceiling_ft": 65000,
        "mission_duration_hours": 24,
        "area_polygon_km2": 1000,
    })
    assert r["operating_permit_required"] is True
    return f"{r['operating_permit_form']}, £{r['estimated_cost_gbp']}"


# ============== Heat Pump ==============

@case("defrost_cycle_model", "0°C 80% RH reverse-cycle defrost")
def t_defrost():
    r = run("defrost_cycle_model.py", {
        "ambient_temp_c": 0.0,
        "rh_pct": 80,
        "evaporator_temp_c": -8.0,
        "defrost_method": "reverse_cycle",
        "rated_heating_capacity_kw": 8,
    })
    assert "defrost_frequency_per_hour" in r
    return f"defrost every {r['defrost_interval_minutes']}min, {r['energy_penalty_pct']}% penalty"


@case("noise_emission_dba", "8kW scroll heat pump 5m distance")
def t_noise():
    r = run("noise_emission_dba.py", {
        "compressor_kw": 3.0,
        "compressor_type": "scroll",
        "fan_diameter_mm": 500,
        "fan_rpm": 800,
        "distance_m": 5.0,
        "mounting": "ground",
    })
    assert r["sound_power_db_lw_total"] > 0
    return f"Lw={r['sound_power_db_lw_total']}dB, Lp@5m={r['sound_pressure_db_at_distance']}dB"


@case("eer_seer_calculation", "36k BTU/h, 3200W mini-split")
def t_seer():
    r = run("eer_seer_calculation.py", {
        "rated_cooling_btuh": 36000,
        "rated_power_w": 3200,
        "is_ducted": False,
    })
    assert r["seer"] > 10
    return f"EER={r['eer_btuh_per_w']}, SEER={r['seer']}, SEER2={r['seer2']}"


@case("scop_seasonal_efficiency", "Average climate, A7W35 COP 4.5")
def t_scop():
    r = run("scop_seasonal_efficiency.py", {
        "climate_zone": "average",
        "nominal_cop_at_a7w35": 4.5,
    })
    assert r["scop_average"] > 2.5
    return f"SCOP {r['scop_average']}, label {r['eu_label']}"


@case("building_envelope_heat_loss", "100m² UK Part L 2021 dwelling")
def t_envelope():
    r = run("building_envelope_heat_loss.py", {
        "wall_area_m2": 80,
        "wall_u_value": 0.18,
        "window_area_m2": 15,
        "window_u_value": 1.4,
        "roof_area_m2": 50,
        "roof_u_value": 0.13,
        "floor_area_m2": 50,
        "floor_u_value": 0.13,
        "infiltration_ach": 0.5,
        "indoor_set_c": 21,
        "outdoor_min_c": -3,
        "building_volume_m3": 125,
    })
    assert r["design_heat_loss_kw"] > 0
    return f"{r['design_heat_loss_kw']}kW design, recommend {r['recommended_heat_pump_kw']}kW HP"


# ============== Drone ==============

@case("airframe_fea_landing", "5kg drone sprung gear 3m/s descent CFRP")
def t_landing():
    r = run("airframe_fea_landing.py", {
        "drone_mass_kg": 5.0,
        "descent_velocity_ms": 3.0,
        "landing_gear": "sprung",
        "frame_material": "cfrp_woven",
        "frame_csa_mm2": 50,
    })
    assert r["peak_g"] > 0
    # HONEST-NAMING proveCatch (WAVE 1, 2026-07-03): the tool computes a CLOSED-FORM
    # energy method — no rendered surface (notes / provenance / worked calcs) may claim
    # bare "FEA" for its result. The only permitted occurrence is the "FEA-ready seam"
    # phrasing (a statement about what it is NOT, marking the future mesh-based slot).
    import re as _re
    _surface = json.dumps(r)
    _bare_fea = [m.group(0) for m in _re.finditer(r"FEA(?!-ready)", _surface)]
    assert not _bare_fea, f"closed-form result rendered as 'FEA': {_bare_fea}"
    assert "closed-form" in _surface.lower(), "method statement missing from surfaces"
    return f"peak {r['peak_g']}g, σ={r['peak_stress_mpa']}MPa, δ={r['max_deflection_mm']}mm"


@case("gimbal_balance_cog", "250g camera 3-axis")
def t_gimbal():
    r = run("gimbal_balance_cog.py", {
        "payload_mass_g": 250,
        "payload_dimensions_mm": {"x": 80, "y": 60, "z": 50},
        "mount_point_xyz_mm": {"x": 0, "y": 0, "z": 0},
        "gimbal_stage_count": 3,
    })
    assert r["motor_torque_specified_ncm"] > 0
    return f"motor τ={r['motor_torque_specified_ncm']}Ncm"


@case("gust_response_drone", "2kg multirotor 20m/s, 10m/s gust")
def t_gust_drone():
    r = run("gust_response_drone.py", {
        "drone_mass_kg": 2.0,
        "wing_area_m2": 0.5,
        "airspeed_ms": 20,
        "gust_speed_ms": 10,
        "is_multirotor": True,
    })
    assert "peak_g" in r
    return f"peak {r['peak_g']}g, attitude {r['attitude_excursion_deg_openloop']}°"


@case("obstacle_avoidance_sensor", "Lidar @ 10m/s drone")
def t_obstacle():
    r = run("obstacle_avoidance_sensor.py", {
        "sensor_type": "lidar",
        "max_range_m": 100,
        "fov_deg": 360,
        "frame_rate_hz": 20,
        "drone_max_speed_ms": 10,
    })
    assert r["safety_margin_ratio"] > 0
    return f"{r['braking_distance_at_max_speed_m']}m brake, margin {r['safety_margin_ratio']}"


@case("battery_c_rate_thermal", "1.5Ah cell at 30C with forced air")
def t_battery_thermal():
    r = run("battery_c_rate_thermal.py", {
        "cell_capacity_ah": 1.5,
        "c_rate": 30,
        "cooling": "forced_air",
        "ambient_c": 25,
        "flight_duration_min": 12,
        "cell_internal_resistance_mohm": 4,
    })
    assert r["cell_temp_at_end_flight_c"] > 25
    return f"cell T={r['cell_temp_at_end_flight_c']}°C, {r['safety_status']}"


@case("regulatory_caa_part107", "UK 2kg commercial drone")
def t_caa():
    r = run("regulatory_caa_part107.py", {
        "country": "UK",
        "mass_kg": 2.0,
        "operation": "VLOS",
        "urban_or_rural": "urban",
    })
    assert "category" in r
    assert "required_certification" in r
    return f"{r['category']}, £{r['licence_cost_gbp']}"


# ============== AUV ==============

@case("mission_endurance_at_depth", "1000m AUV 24h mission")
def t_auv_endurance():
    r = run("mission_endurance_at_depth.py", {
        "depth_rating_m": 1000,
        "mission_duration_hours": 24,
        "payload_power_w": 50,
        "vehicle_volume_l": 100,
        "cruise_speed_ms": 1.5,
        "housing_material": "titanium",
    })
    assert r["battery_capacity_required_kwh"] > 0
    return f"{r['battery_capacity_required_kwh']}kWh battery, hull {r['pressure_housing_thickness_mm']}mm"


@case("acoustic_modem_link", "25kHz 5km PSK underwater link")
def t_acoustic():
    r = run("acoustic_modem_link.py", {
        "frequency_khz": 25,
        "distance_km": 5,
        "depth_m": 100,
        "salinity_ppt": 35,
        "water_temp_c": 10,
        "modulation": "PSK",
        "source_level_db_re_1upa": 185,
    })
    assert "snr_db" in r
    return f"SNR {r['snr_db']}dB, {r['data_rate_bps']}bps, link={r['link_viable']}"


@case("ins_navigation_drift", "Tactical IMU + DVL 24h mission")
def t_ins():
    r = run("ins_navigation_drift.py", {
        "gyro_grade": "tactical",
        "accelerometer_grade": "tactical",
        "dvl_present": True,
        "mission_duration_hours": 24,
        "average_speed_ms": 1.5,
    })
    assert "position_drift_m_per_hour" in r
    return f"drift {r['position_drift_m_per_hour']}m/h, surface fix every {r['surface_fix_interval_minutes_recommended']}min"


@case("corrosion_anode_sizing", "5m² Al hull, 5yr life Al-Zn-In")
def t_corrosion():
    r = run("corrosion_anode_sizing.py", {
        "hull_material": "aluminium_5083",
        "hull_area_m2": 5,
        "salinity_ppt": 35,
        "water_temp_c": 10,
        "mission_life_years": 5,
        "anode_material": "aluminium_zinc_indium",
    })
    assert r["anode_mass_kg_calculated"] > 0
    return f"{r['anode_mass_kg_calculated']}kg anode required"


@case("recovery_method_logistics", "Crane recovery 200kg AUV SS3")
def t_recovery():
    r = run("recovery_method_logistics.py", {
        "recovery_method": "crane_off_ship",
        "vehicle_mass_kg": 200,
        "recovery_sea_state": 3,
        "mother_ship_class": "ROV-support_60m",
    })
    assert r["recovery_viable"] is True
    return f"viable, {r['recovery_time_minutes']}min, crew {r['crew_required']}"


@case("regulatory_imo_maritime", "UK USV 3m 500kg battery")
def t_imo():
    r = run("regulatory_imo_maritime.py", {
        "country_flag": "UK",
        "displacement_kg": 500,
        "propulsion_type": "battery",
        "area_of_operation": "territorial_uk",
        "hull_length_m": 3.0,
        "autonomy_degree": 4,
    })
    assert len(r["required_certifications"]) > 3
    return f"{len(r['required_certifications'])} cert reqs, £{r['registration_cost_gbp']}"


# ============== Bioreactor ==============

@case("monod_kinetics", "E.coli glucose, target 10 g/L biomass")
def t_monod():
    r = run("monod_kinetics.py", {
        "substrate": "glucose",
        "initial_biomass_g_l": 0.1,
        "working_volume_l": 100,
        "initial_substrate_g_l": 30,
        "target_biomass_g_l": 10,
    })
    assert r["time_to_target_biomass_h"] > 0
    return f"{r['time_to_target_biomass_h']}h to target, {r['biomass_final_g_l']}g/L final"


@case("ph_titration_sizing", "100L vessel pH 7.5->7.0")
def t_ph():
    r = run("ph_titration_sizing.py", {
        "starting_ph": 7.5,
        "target_ph": 7.0,
        "working_volume_l": 100,
        "organism_co2_production_g_h": 30,
        "acid_concentration_m": 1.0,
    })
    assert "acid_dose_rate_ml_min" in r
    return f"acid {r['acid_dose_rate_ml_min']}ml/min, drift {r['ph_swing_per_minute_uncontrolled']}/min"


@case("dissolved_oxygen_control", "100L E.coli OUR 15 mmol/L/h DO 30%")
def t_do():
    r = run("dissolved_oxygen_control.py", {
        "working_volume_l": 100,
        "kla_per_hour": 200,
        "do_setpoint_pct": 30,
        "organism_our_mmol_l_h": 15,
        "temperature_c": 30,
        "pressure_atm": 1.0,
    })
    assert r["kla_required_per_hour"] > 0
    return f"kLa req {r['kla_required_per_hour']}/h, {r['airflow_vvm_required']} VVM"


@case("clean_in_place_cip", "1000L vessel CIP biofilm")
def t_cip():
    r = run("clean_in_place_cip.py", {
        "vessel_volume_l": 1000,
        "vessel_surface_area_m2": 25,
        "soil_type": "biofilm",
        "cleaning_temp_c": 80,
    })
    assert r["water_consumption_l"] > 0
    return f"{r['cycle_time_min']}min, {r['water_consumption_l']}L H2O, £{r['cost_per_cycle_gbp']}"


@case("downstream_chromatography", "Protein A mAb 5g target")
def t_chrom():
    r = run("downstream_chromatography.py", {
        "feedstock_volume_l": 100,
        "target_protein_mass_g": 5.0,
        "resin_type": "protein_a",
        "column_diameter_cm": 14,
    })
    assert r["column_volume_l"] > 0
    return f"{r['column_volume_l']}L col, £{r['resin_cost_gbp']} resin"


@case("regulatory_fda_cgmp", "mAb US FDA 500L batch")
def t_fda():
    r = run("regulatory_fda_cgmp.py", {
        "product_type": "monoclonal_antibody",
        "market": "US",
        "batch_size_l": 500,
    })
    assert len(r["required_documentation"]) > 3
    return f"{r['fda_pathway']}, £{r['total_regulatory_cost_gbp']/1e6:.1f}M reg cost"


def main():
    # Universal tools
    t_reg_cost(); t_lca(); t_scr(); t_fmea(); t_threat(); t_logistics()
    # BESS
    t_cable_ampacity(); t_arc_flash(); t_fire_supp(); t_grounding(); t_balance(); t_warranty_battery()
    # VF
    t_nutrient(); t_ro(); t_co2(); t_irrigation(); t_uvc(); t_npv()
    # HAPS
    t_prop_low_re(); t_motor_alt(); t_flutter(); t_li_s(); t_gust_atm(); t_faa_airspace()
    # Heat Pump
    t_defrost(); t_noise(); t_seer(); t_scop(); t_envelope()
    # Drone
    t_landing(); t_gimbal(); t_gust_drone(); t_obstacle(); t_battery_thermal(); t_caa()
    # AUV
    t_auv_endurance(); t_acoustic(); t_ins(); t_corrosion(); t_recovery(); t_imo()
    # Bioreactor
    t_monod(); t_ph(); t_do(); t_cip(); t_chrom(); t_fda()

    print("=" * 92)
    print(f"{'Tool':<35} {'Status':<8} {'Time':<8} Result")
    print("=" * 92)
    passes = 0
    fails = 0
    for r in RESULTS:
        status = r["status"]
        tag = "OK" if status == "PASS" else "X "
        time_s = f"{r['wall_time_s']}s"
        val = str(r.get("value", r.get("error_msg", "")))[:50]
        print(f"{r['tool']:<35} {tag} {status:<5} {time_s:<8} {val}")
        if status == "PASS":
            passes += 1
        else:
            fails += 1
    print("=" * 92)
    print(f"Total: {len(RESULTS)} tests, {passes} PASS, {fails} FAIL")
    if fails > 0:
        print("\nFailed tests:")
        for r in RESULTS:
            if r["status"] != "PASS":
                print(f"  {r['tool']}: {r.get('error_msg', '?')[:120]}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
