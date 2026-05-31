#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/test_space_sector_tools.py

Smoke tests for the 55 space-sector tools built 2026-05-22.

Runs every wrapper with a representative input and verifies that:
1. The wrapper exits zero
2. The JSON output contains key engineering metrics
3. Those metrics fall within engineering-credible ranges

Run:
    .venv/bin/python3 scripts/lib/orchestrator/tools/python/test_space_sector_tools.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = THIS_DIR.parents[4]
PY = str(PROJECT_ROOT / ".venv" / "bin" / "python3")


def run_tool(tool_name: str, payload: dict) -> dict:
    """Run a tool wrapper, return parsed JSON."""
    tool_path = THIS_DIR / f"{tool_name}.py"
    if not tool_path.exists():
        raise FileNotFoundError(f"tool not found: {tool_path}")
    proc = subprocess.run(
        [PY, str(tool_path)],
        input=json.dumps(payload).encode(),
        capture_output=True,
        timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"{tool_name} exited {proc.returncode}: {proc.stderr.decode()}")
    return json.loads(proc.stdout.decode())


# Each test case: (tool_name, payload, lambda result: result_meets_range_check, description)
TESTS = [
    # ----------------------------------------------------------------
    # Cluster 1 — Optical/Laser Communications
    # ----------------------------------------------------------------
    ("fso_link_budget",
     {"tx_power_w": 1.0, "tx_aperture_mm": 80, "wavelength_nm": 1550,
      "rx_aperture_mm": 80, "range_km": 1000, "atmospheric_loss_db": 3.0,
      "pointing_error_arcsec": 0.5, "detector_type": "APD",
      "receiver_bandwidth_ghz": 10, "required_ber": 1e-9},
     lambda r: r["tx_antenna_gain_db"] > 100 and r["max_data_rate_gbps"] > 0.01,
     "FSO link 1W @ 1550 nm 1000 km: TX gain >100 dB, data rate >10 Mbps"),

    ("atmospheric_scintillation",
     {"elevation_angle_deg": 30, "wavelength_nm": 1550, "Cn2_profile": "moderate",
      "aperture_mm": 100, "zenith_path_length_km": 20},
     lambda r: 0 < r["scintillation_index"] < 5 and r["coherence_length_r0_cm"] > 0,
     "Atmospheric scintillation moderate 30 deg: si 0-5, r0 > 0"),

    ("mplc_turbulence_compensation",
     {"D_over_r0": 5.0, "num_modes": 45, "wavelength_nm": 1550, "aperture_mm": 100,
      "elevation_angle_deg": 30},
     lambda r: 0 < r["strehl_ratio_corrected"] < 1 and r["fade_reduction_db"] > 0,
     "MPLC 45-mode: Strehl 0-1, fade reduction > 0 dB"),

    ("electro_absorption_modulator",
     {"wavelength_nm": 1550, "modulator_length_um": 200, "applied_voltage_v": 2.0,
      "bias_voltage_v": -1.0, "material": "InGaAsP",
      "active_region_thickness_nm": 200, "confinement_factor": 0.3},
     lambda r: r["extinction_ratio_db"] > 0 and 1 < r["three_db_bandwidth_ghz"] < 200,
     "EAM 200 um InGaAsP 2V: ER > 0 dB, BW 1-200 GHz"),

    ("pcsel_laser_design",
     {"target_wavelength_nm": 940, "target_output_power_w": 1.0,
      "lattice_constant_nm": 280, "device_area_mm2": 1.0,
      "current_density_kA_cm2": 0.5},
     lambda r: r["threshold_current_a"] > 0 and 0 < r["beam_divergence_fwhm_mrad"] < 100,
     "PCSEL 940 nm 1 mm^2: I_th > 0, beam divergence 0-100 mrad"),

    ("pointing_acquisition_tracking",
     {"target_pointing_arcsec_rms": 1.0, "satellite_jitter_arcsec_rms": 5.0,
      "link_distance_km": 1000, "beam_divergence_mrad": 0.05,
      "controller_type": "PID", "sensor_update_rate_hz": 1000,
      "acquisition_uncertainty_arcsec": 1000},
     lambda r: r["closed_loop_bandwidth_hz_achievable"] > 0 and r["acquisition_time_s"] > 0,
     "PAT 1 arcsec pointing 5 arcsec jitter: BW > 0, t_acq > 0"),

    # ----------------------------------------------------------------
    # Cluster 2 — Quantum
    # ----------------------------------------------------------------
    ("qkd_link_budget",
     {"protocol": "BB84", "source_rate_mhz": 1000, "channel_loss_db": 10,
      "detector_efficiency_pct": 25, "dark_count_per_second": 100,
      "decoy_state": True, "mean_photon_number_mu": 0.5},
     lambda r: r["secret_key_rate_bps"] >= 0 and r["qber_pct"] >= 0,
     "QKD BB84 10 dB loss: SKR >= 0, QBER >= 0"),

    ("cold_atom_interferometer",
     {"atom_species": "Rb87", "interrogation_time_ms": 100,
      "fringe_contrast_pct": 80, "atom_number": 1e7,
      "shot_to_shot_rate_hz": 1.0, "temperature_uK": 1.0},
     lambda r: 1e-12 < r["sensitivity_g_per_sqrthz"] < 1e-3 and r["recoil_velocity_mm_s"] > 0,
     "Cold-atom Rb87 100 ms: sensitivity 1e-12 to 1e-3 g/sqrt(Hz), v_rec > 0"),

    ("trapped_ion_qubit",
     {"ion_species": "Yb171", "trap_frequency_mhz": 1.0,
      "magnetic_field_gauss": 5.0, "laser_power_mw": 1.0,
      "trap_geometry": "linear_rf", "trap_depth_ev": 0.1,
      "heating_rate_quanta_per_s": 100},
     lambda r: r["T1_coherence_s"] > 0 and r["gate_fidelity_pct"] > 0,
     "Yb171 trapped ion: T1 > 0, gate F > 0"),

    ("qrng_entropy_rate",
     {"source_type": "vacuum_fluctuation", "detector_bandwidth_ghz": 1.0,
      "sampling_rate_gsps": 2.0, "adc_resolution_bits": 8, "snr_db": 20.0,
      "post_processing": "Toeplitz"},
     lambda r: r["certified_entropy_rate_gbps"] > 0 and r["min_entropy_per_sample"] > 0,
     "QRNG vacuum fluctuation 2 Gsps: entropy rate > 0, H_min > 0"),

    ("qkd_satellite_pass_geometry",
     {"satellite_altitude_km": 500, "ground_station_lat_deg": 51.5,
      "secret_key_rate_bps": 1000, "weather_availability_pct": 70,
      "min_elevation_deg": 20, "num_satellites": 1, "inclination_deg": 97.4},
     lambda r: r["orbits_per_day"] > 10 and r["passes_per_day"] >= 0,
     "QKD pass 500 km: orbits 10-16/day, passes >= 0"),

    ("quantum_chip_packaging",
     {"chip_size_mm2": 25, "num_components": 100, "wafer_material": "Si",
      "yield_pct": 70, "wafer_size_inch": 6.0, "wafer_cost_gbp": 5000,
      "fibre_facet_count": 4},
     lambda r: r["yielded_chips_per_wafer"] > 0 and r["cost_per_chip_gbp"] > 0,
     "Quantum chip 25 mm^2 Si: yielded > 0, cost > 0"),

    # ----------------------------------------------------------------
    # Cluster 3 — Earth Observation Sensors
    # ----------------------------------------------------------------
    ("thermal_ir_detector",
     {"wavelength_band_um": "LWIR_8_14", "detector_pixel_size_um": 18,
      "detector_array_pixels": 1024, "integration_time_ms": 10,
      "target_NETD_mK": 50, "satellite_altitude_km": 500,
      "scene_temperature_k": 290},
     lambda r: r["required_aperture_mm"] > 0 and r["GSD_at_500km_m"] > 0,
     "LWIR detector 500 km: aperture > 0, GSD > 0"),

    ("folded_optics_telescope",
     {"aperture_mm": 350, "num_fold_mirrors": 3, "primary_mirror_curvature_m": 1.5,
      "focal_length_m": 5.0, "config": "Cassegrain", "wavelength_nm": 550,
      "secondary_obscuration_pct": 25},
     lambda r: r["stowed_length_mm"] > 0 and 0 < r["MTF_at_nyquist"] < 1,
     "Folded telescope 350 mm: stowed > 0, MTF 0-1"),

    ("methane_absorption_spectroscopy",
     {"wavelength_band_nm": 2370, "spectral_resolution_nm": 0.5,
      "ground_pixel_size_m": 25, "integration_time_ms": 200,
      "satellite_altitude_km": 500, "surface_albedo": 0.2},
     lambda r: r["detection_threshold_ppm_m"] > 0 and r["expected_snr"] > 0,
     "Methane spec 2370 nm: detection threshold > 0, SNR > 0"),

    ("sar_antenna_sizing",
     {"frequency_ghz": 9.6, "peak_power_kw": 1.0, "satellite_altitude_km": 500,
      "look_angle_deg": 30, "prf_hz": 1500, "pulse_duration_us": 30,
      "incidence_angle_deg": 35, "chirp_bandwidth_mhz": 150},
     lambda r: r["antenna_length_m"] > 1 and r["range_resolution_ground_m"] < 10,
     "X-band SAR 500 km: antenna > 1 m, range res < 10 m"),

    # insar_coherence DELETED 2026-05-22 — replaced by mintpy_insar_processing (real Caltech library)
    ("mintpy_insar_processing",
     {"temporal_baseline_days": 12, "perpendicular_baseline_m": 200,
      "ground_type": "urban", "stack_count": 1,
      "wavelength_band": "C", "looks_L": 32, "critical_baseline_m": 1100.0},
     lambda r: 0 < r["total_coherence"] <= 1 and r["los_precision_mm_per_acq"] > 0,
     "InSAR urban 12d (mintpy library): coherence 0-1, mm precision > 0"),

    ("hyperspectral_imager",
     {"wavelength_start_nm": 400, "wavelength_end_nm": 2500, "num_bands": 200,
      "spectral_resolution_nm": 10, "target_GSD_m": 30,
      "satellite_altitude_km": 500, "swath_pixels": 1000, "target_snr": 100},
     lambda r: r["required_aperture_mm"] > 0 and r["data_rate_mbps"] > 1,
     "Hyperspectral 400-2500 nm: aperture > 0, data rate > 1 Mbps"),

    ("onboard_ai_inference",
     {"model_size_M_params": 25, "image_resolution_mp": 12,
      "target_inferences_per_second": 5,
      "accelerator": "Jetson_Xavier_NX", "quantization": "INT8",
      "input_channels": 3},
     lambda r: r["throughput_fps"] > 0 and r["power_w"] > 0,
     "On-orbit AI Jetson NX 25M params: FPS > 0, power > 0"),

    # ----------------------------------------------------------------
    # Cluster 4 — SSA / Surveillance / Debris
    # ----------------------------------------------------------------
    ("satellite_laser_ranging",
     {"target_satellite_altitude_km": 500, "laser_pulse_energy_mj": 100,
      "repetition_rate_hz": 1000, "telescope_aperture_mm": 1000,
      "target_retroreflector_size_mm": 100, "wavelength_nm": 532,
      "atmospheric_loss_one_way_db": 1.0, "pulse_duration_ps": 50},
     lambda r: r["photons_returned_per_pulse"] > 0,
     "SLR 500 km: photons returned > 0"),

    ("debris_radar_cross_section",
     {"debris_diameter_mm": 10, "material": "aluminum",
      "radar_frequency_ghz": 10, "polarization": "VV", "shape": "sphere"},
     lambda r: -100 < r["rcs_dbsm"] < 50 and r["detection_range_km_for_p1_radar"] > 0,
     "Debris 10 mm Al X-band: RCS reasonable, detection range > 0"),

    ("conjunction_probability",
     {"position_1_km": [7000, 0, 0], "velocity_1_km_s": [0, 7.5, 0],
      "covariance_1_diag_m2": [100, 100, 100],
      "position_2_km": [7000.05, 0, 0], "velocity_2_km_s": [0, -7.4, 0],
      "covariance_2_diag_m2": [100, 100, 100],
      "combined_object_radius_m": 5.0},
     lambda r: 0 <= r["collision_probability"] <= 1 and r["miss_distance_m"] >= 0,
     "Conjunction: P_c 0-1, miss >= 0"),

    ("space_weather_sensor",
     {"orbit_altitude_km": 500, "latitude_band": "low_LEO",
      "mission_duration_years": 5, "detector_type": "SEU",
      "shielding_thickness_mm_al": 5, "energy_range_mev": [0.1, 100]},
     lambda r: r["expected_radiation_dose_krad"] > 0 and r["detector_mass_kg"] > 0,
     "SEU detector 500 km 5 yr: dose > 0, mass > 0"),

    # ----------------------------------------------------------------
    # Cluster 5 — ISAM
    # ----------------------------------------------------------------
    ("proximity_operations",
     {"chaser_mass_kg": 500, "target_mass_kg": 2000, "initial_separation_m": 100,
      "target_tumbling_rate_deg_s": 5, "approach_speed_m_s": 0.05,
      "thruster_isp_s": 220, "target_orbit_altitude_km": 500,
      "plume_chamber_pressure_bar": 10},
     lambda r: r["delta_v_budget_ms"] > 0 and r["time_to_capture_minutes"] > 0,
     "Proximity ops 500 kg chaser: dv > 0, t_capture > 0"),

    ("robotic_capture_mechanics",
     {"arm_reach_m": 2.0, "arm_dof": 7, "payload_inertia_kgm2": 50,
      "target_grapple_point_type": "LAR",
      "target_velocity_at_grapple_m_s": 0.05,
      "joint_friction_nm_per_joint": 0.5, "max_joint_speed_deg_s": 10},
     lambda r: r["required_motor_torque_nm"] > 0 and r["capture_window_seconds"] > 0,
     "Robotic capture 7-DoF 2m: torque > 0, t_window > 0"),

    ("refuelling_interface",
     {"propellant_type": "n2h4", "transfer_pressure_bar": 50,
      "mass_to_transfer_kg": 50, "mating_misalignment_mm": 5,
      "interface_diameter_mm": 25, "supply_tank_pressure_bar": 60},
     lambda r: r["mass_flow_rate_g_s"] > 0 and r["transfer_time_minutes"] >= 0,
     "Refueling N2H4 50 kg: m_dot > 0, transfer time >= 0"),

    ("machine_vision_inspection",
     {"target_distance_m": 5, "illumination": "solar_only",
      "camera_resolution_mp": 12, "defect_detection_target_mm": 1.0,
      "field_of_view_deg": 30, "frame_rate_fps": 10,
      "compute_accelerator": "Jetson_Xavier_NX", "exposure_time_ms": 5},
     lambda r: r["required_compute_TOPS"] > 0 and 0 <= r["detection_probability"] <= 1,
     "ISAM inspection 5 m: compute > 0, detection 0-1"),

    ("digital_metal_forming",
     {"feedstock_material": "Ti_6Al_4V", "part_volume_cm3": 100,
      "target_strength_mpa": 900, "layer_thickness_um": 30,
      "laser_power_w": 400, "process": "LPBF"},
     lambda r: r["build_time_hours"] > 0 and r["mass_kg"] > 0,
     "DMF Ti-6Al-4V 100 cm^3: time > 0, mass > 0"),

    # ----------------------------------------------------------------
    # Cluster 6 — In-Space Manufacturing & Microgravity
    # ----------------------------------------------------------------
    ("microgravity_alloy_solidification",
     {"alloy": "CMSX-4", "volume_cm3": 1000,
      "target_grain_orientation": "100", "cooling_rate_k_s": 5,
      "g_level": 1e-5, "container_material": "ceramic_alumina"},
     lambda r: r["yield_pct"] > 0 and r["microstructure_score"] >= 1,
     "Microgravity CMSX-4: yield > 0, microstructure 1-10"),

    ("microgravity_semiconductor",
     {"material": "GaAs", "boule_diameter_mm": 100,
      "growth_method": "floating_zone", "growth_temperature_c": 1248,
      "growth_rate_mm_per_hr": 5, "g_level": 1e-5},
     lambda r: r["defect_density_per_cm2"] >= 0 and r["growth_time_hours"] > 0,
     "Microgravity GaAs FZ: defects >= 0, growth time > 0"),

    ("microgravity_fibre_optic",
     {"preform_material": "ZBLAN", "draw_speed_m_s": 0.01,
      "target_diameter_um": 125, "preform_diameter_mm": 20,
      "furnace_temperature_c": 350, "atmosphere": "argon", "g_level": 1e-5},
     lambda r: r["attenuation_db_per_km"] > 0 and r["yield_pct"] > 0,
     "Microgravity ZBLAN: atten > 0, yield > 0"),

    ("reentry_capsule_heating",
     {"entry_velocity_m_s": 7800, "entry_angle_deg": -5,
      "capsule_mass_kg": 200, "ballistic_coefficient_kg_m2": 300,
      "TPS_material": "PICA", "nose_radius_m": 0.5},
     lambda r: r["peak_heat_flux_w_m2"] > 0 and r["peak_load_g"] > 0,
     "Reentry capsule 7.8 km/s: heat flux > 0, g > 0"),

    # ----------------------------------------------------------------
    # Cluster 7 — Satellite Comms
    # ----------------------------------------------------------------
    ("phased_array_antenna",
     {"frequency_ghz": 30, "num_elements": 1024,
      "element_spacing_lambda": 0.5, "scan_angle_deg": 60,
      "element_efficiency_pct": 70, "amplitude_taper": "uniform",
      "target_eirp_dbw": 50},
     lambda r: r["gain_dbi"] > 25 and r["num_TR_modules"] > 0,
     "Phased array 1024 el Ka: gain > 25 dBi, modules > 0"),

    ("rf_mems_beamsteering",
     {"frequency_ghz": 12, "num_MEMS_switches": 32,
      "switch_loss_db_per": 0.2, "packaging_loss_db": 1.0,
      "switch_type": "ohmic", "duty_cycle_pct": 50},
     lambda r: r["total_insertion_loss_db"] > 0 and r["switching_speed_us"] > 0,
     "RF MEMS 32 switches Ku: IL > 0, t_sw > 0"),

    ("nb_iot_satellite_link",
     {"user_terminal_eirp_dbm": 20, "satellite_g_t_db_k": 10,
      "frequency_band": "S", "data_rate_required_bps": 240,
      "sat_altitude_km": 500, "elevation_deg": 30},
     lambda r: "link_margin_db" in r and "doppler_offset_khz" in r,
     "NB-IoT NTN: link margin computed, Doppler computed"),

    ("l_band_iot_link",
     {"device_tx_power_dbm": 27, "antenna_gain_dbi": 2.0,
      "sat_altitude_km": 500, "data_rate_bps": 200,
      "messages_per_day_target": 12, "battery_capacity_mah": 19000,
      "elevation_deg": 30, "freq_ghz": 1.6},
     lambda r: r["coverage_km2_per_sat"] > 0 and r["battery_life_years"] > 0,
     "L-band IoT Astrocast-like: coverage > 0, batt > 0"),

    ("vdes_maritime",
     {"vessel_density_per_km2": 0.05, "message_rate_per_vessel_per_hour": 4,
      "freq_band": "161_MHz", "sat_altitude_km": 500,
      "channel_bandwidth_khz": 25, "modulation": "GMSK", "elevation_deg": 10},
     lambda r: r["data_throughput_kbps"] > 0 and r["max_vessels_per_satellite"] > 0,
     "VDES 161 MHz: throughput > 0, max vessels > 0"),

    # ----------------------------------------------------------------
    # Cluster 8 — Hybrid + Aerospike + Specialist Propulsion
    # ----------------------------------------------------------------
    ("hybrid_propulsion_combustion",
     {"fuel": "HDPE", "oxidizer": "LOX", "o_f_ratio": 2.5,
      "chamber_pressure_bar": 30, "fuel_grain_diameter_mm": 200,
      "length_mm": 1000, "expansion_ratio": 30},
     lambda r: r["thrust_n"] > 0 and r["isp_s"] > 0,
     "Hybrid HDPE/LOX: thrust > 0, Isp > 0"),

    ("aerospike_engine",
     {"chamber_pressure_bar": 100, "expansion_ratio": 100,
      "fuel": "LOX_CH4", "throat_diameter_mm": 150,
      "primary_to_secondary_ratio": 1.0},
     lambda r: r["vacuum_isp_s"] > 200 and r["sea_level_isp_s"] > 100,
     "Aerospike LOX/CH4: vac Isp > 200, SL > 100"),

    ("staged_combustion_engine",
     {"power_cycle": "FFSC", "propellants": "LOX_CH4",
      "chamber_pressure_bar": 200, "throat_area_cm2": 100,
      "expansion_ratio": 80},
     lambda r: r["vacuum_isp_s"] > 250 and r["thrust_n"] > 0,
     "FFSC LOX/CH4: Isp > 250, thrust > 0"),

    ("electric_pump_fed",
     {"chamber_pressure_bar": 80, "propellant_mass_flow_kg_s": 5,
      "battery_voltage": 800, "motor_efficiency": 0.95,
      "burn_time_s": 200},
     lambda r: r["pump_power_kw"] > 0 and r["battery_mass_kg"] > 0,
     "Electric pump 80 bar: pump kW > 0, battery > 0"),

    # ----------------------------------------------------------------
    # Cluster 9 — Solar Sail + Air-Breathing + Specialist EP + CMG
    # ----------------------------------------------------------------
    ("solar_sail",
     {"sail_area_m2": 73, "sail_density_g_m2": 5.0,
      "distance_from_sun_au": 1.0, "sail_reflectivity": 0.85,
      "spacecraft_mass_kg": 100},
     lambda r: r["thrust_n"] > 0 and r["delta_v_per_year_ms"] > 0,
     "Solar sail 73 m^2 IKAROS-class: thrust > 0, dv/yr > 0"),

    ("air_breathing_ep",
     {"altitude_km": 180, "satellite_cross_section_m2": 0.3,
      "intake_efficiency": 0.4, "ionization_efficiency": 0.6,
      "available_power_w": 200},
     lambda r: r["thrust_n"] >= 0 and r["drag_force_n"] > 0,
     "Air-breathing EP 180 km: thrust >= 0, drag > 0"),

    ("iodine_hall_thruster",
     {"power_w": 200, "mass_flow_mg_s": 1.0, "voltage_v": 300,
      "magnetic_field_g": 100, "propellant": "I"},
     lambda r: r["thrust_mn"] > 0 and r["isp_s"] > 500,
     "Iodine Hall 200 W: thrust > 0, Isp > 500"),

    ("electrospray_thruster",
     {"emitter_count": 480, "voltage_kv": 1.5,
      "ionic_liquid_type": "EMI-BF4", "flow_rate_pl_s": 1.0},
     lambda r: r["thrust_un"] > 0 and r["isp_s"] > 500,
     "Electrospray 480 emitters: thrust uN > 0, Isp > 500"),

    ("cmg_control_moment_gyro",
     {"rotor_inertia_kgm2": 0.01, "rotor_speed_rpm": 10000,
      "gimbal_rate_deg_s": 10, "num_CMGs": 4,
      "satellite_inertia_kgm2": 100, "satellite_mass_kg": 100},
     lambda r: r["torque_nm"] > 0 and r["momentum_nms"] > 0,
     "CMG pyramid 4 units: torque > 0, momentum > 0"),

    # ----------------------------------------------------------------
    # Cluster 10 — Power, RTG, SBSP, Materials
    # ----------------------------------------------------------------
    ("rtg_radioisotope",
     {"fuel": "Pu-238", "fuel_mass_g": 100, "mission_duration_years": 10,
      "hot_end_temp_k": 1200, "cold_end_temp_k": 500,
      "thermoelectric_module": "SiGe"},
     lambda r: 50 < r["thermal_power_w"] < 80 and r["electrical_power_w_eol"] > 1,
     "RTG Pu-238 100g SiGe: thermal ~56 W (BOL @ 0.566 W/g), elec > 1 W"),

    ("wireless_power_microwave",
     {"transmit_power_mw": 1000, "frequency_ghz": 5.8,
      "transmit_array_size_km": 1.0, "distance_km": 36000,
      "rectenna_efficiency_pct": 80},
     lambda r: r["rectenna_size_km"] > 0 and r["transmission_efficiency_pct"] > 0,
     "SBSP 1 GW @ GEO: rectenna > 0, efficiency > 0"),

    ("opv_solar_cell",
     {"irradiance_w_m2": 1361, "cell_area_m2": 1.0,
      "cell_efficiency_pct": 12, "beginning_of_life_eol_factor": 0.7,
      "mission_duration_years": 5, "operating_temperature_c": 50},
     lambda r: r["power_w"] > 0 and r["area_specific_mass_g_m2"] > 0,
     "OPV cell 1 m^2 LEO: power > 0, areal mass > 0"),

    ("composite_tow_steering",
     {"tow_width_mm": 3.0, "steering_radius_mm": 100,
      "layer_count": 8, "fibre_volume_fraction": 0.6, "material": "T800S"},
     lambda r: r["structural_efficiency_factor"] > 0 and r["defect_count_per_m2_laminate"] >= 0,
     "iCOMAT tow 3mm R100mm: eff factor > 0, defects >= 0"),

    ("smart_thermal_coating",
     {"temperature_range_k": [200, 350], "switching_voltage_v": 3.0,
      "device_area_cm2": 100},
     lambda r: r["emissivity_range"]["high"] > r["emissivity_range"]["low"]
               and r["lifetime_cycles"] > 0,
     "Smart IR coating: eps_high > eps_low, lifetime > 0"),

    # ----------------------------------------------------------------
    # Cluster 11 — Sensors / GNSS / Reentry
    # ----------------------------------------------------------------
    ("coriolis_gyroscope",
     {"resonator_type": "quartz", "drive_frequency_khz": 10, "Q_factor": 1e6},
     lambda r: r["bias_stability_deg_hr"] > 0 and r["ARW_deg_sqrthr"] > 0,
     "Quartz CVG Q=1e6: bias > 0, ARW > 0"),

    ("multi_constellation_gnss_antenna",
     {"frequencies_supported": ["L1", "L2", "L5", "E1", "E5"],
      "antenna_diameter_mm": 100, "antenna_type": "patch"},
     lambda r: r["num_bands_supported"] == 5 and r["average_gain_dbi"] >= 0,
     "Multi-band GNSS 100 mm: 5 bands, gain >= 0"),

    ("debris_impact_detector",
     {"detection_area_cm2": 100, "particle_size_range_um": [5, 500],
      "impact_velocity_km_s": 10, "sensor_thickness_um": 10},
     lambda r: 0 <= r["detection_efficiency_pct"] <= 100 and r["mass_kg"] > 0,
     "ODIN debris sensor 100 cm^2: detect 0-100%, mass > 0"),

    ("sun_sensor_accuracy",
     {"sensor_type": "digital", "FOV_deg": 120, "detector_resolution_bits": 14},
     lambda r: r["accuracy_arcsec"] > 0 and r["update_rate_hz"] > 0,
     "Digital sun sensor 120 deg 14-bit: accuracy > 0, rate > 0"),
]


def main():
    """Run all tests; report PASS / FAIL count."""
    n_pass = 0
    n_fail = 0
    t0 = time.time()
    results = []
    for tool_name, payload, validator, description in TESTS:
        try:
            r = run_tool(tool_name, payload)
            if "error" in r:
                results.append(("FAIL", tool_name, description, f"tool error: {r['error']}"))
                n_fail += 1
                continue
            if validator(r):
                results.append(("PASS", tool_name, description, ""))
                n_pass += 1
            else:
                # Find key fields for diagnostic
                hint = ", ".join(f"{k}={v}" for k, v in list(r.items())[:5])
                results.append(("FAIL", tool_name, description, f"validator False — head: {hint}"))
                n_fail += 1
        except Exception as exc:
            results.append(("FAIL", tool_name, description, f"exception: {type(exc).__name__}: {exc}"))
            n_fail += 1

    print("=" * 80)
    print(f"SMOKE TEST RESULTS — {n_pass + n_fail} tests, {time.time() - t0:.1f}s")
    print("=" * 80)
    for status, tool, desc, err in results:
        marker = "✓" if status == "PASS" else "✗"
        print(f"[{marker}] {status:4s} | {tool:42s} | {desc}")
        if err:
            print(f"             | {err}")
    print("=" * 80)
    print(f"TOTAL: {n_pass}/{n_pass + n_fail} PASS")
    print("=" * 80)
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
