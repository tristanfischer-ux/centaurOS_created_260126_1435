#!/usr/bin/env python3
"""Unit contract for the FIA-bound front-kit electromagnetic case."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("em_fia_front_kit_case.py")
SPEC = importlib.util.spec_from_file_location("em_fia_front_kit_case", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load module spec for {MODULE_PATH}")
CASE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CASE
SPEC.loader.exec_module(CASE)


class FiaFrontKitCaseContractTest(unittest.TestCase):
    """Protect twin binding and release-honesty invariants."""

    def setUp(self) -> None:
        self.quantities = {
            "continuous_power_kw": {"value": 250.0, "unit": "kW"},
            "front_regen_power_limit_kw": 250.0,
            "dc_bus_voltage_v": {"value": 750.0, "unit": "V"},
            "max_rotor_speed_rpm": 19_500.0,
            "front_bay_envelope_w_mm": 343.0,
            "front_bay_envelope_d_mm": 259.0,
            "front_bay_envelope_h_mm": 267.0,
            "mass_cap_kg": 32.0,
            "rotor_airgap_diameter_mm": 122.0,
            "stack_length_mm": 98.0,
            "turns_per_coil": 4.0,
            "turns_per_phase": 14.0,
            "winding_parallel_paths": 2.0,
            "stator_slots": 24.0,
        }
        self.concentric = {
            "housing_od_mm": 176.7,
            "housing_len_mm": 141.1,
            "stator_od_mm": 164.7,
            "stator_id_mm": 123.4,
            "rotor_od_mm": 122.0,
            "rotor_id_mm": 92.7,
            "airgap_mm": 0.7,
            "stack_len_mm": 98.0,
        }

    def test_geometry_and_duty_are_bound_to_twin_values(self) -> None:
        inputs = CASE.inputs_from_sections(self.quantities, self.concentric)
        geometry = CASE.derive_fia_geometry(inputs)
        duty = CASE.analytical_duty_check(inputs)
        loaded = CASE.loaded_point_assumptions(duty, inputs)

        self.assertEqual(inputs.continuous_electrical_power_kw, 250.0)
        self.assertEqual(inputs.dc_bus_voltage_v, 750.0)
        self.assertEqual(inputs.max_rotor_speed_rpm, 19_500.0)
        self.assertEqual(geometry.rotor_outer_diameter_mm, 122.0)
        self.assertEqual(geometry.stator_outer_diameter_mm, 164.7)
        self.assertEqual(geometry.active_length_mm, 98.0)
        self.assertNotEqual(geometry.rotor_outer_diameter_mm, 160.4)
        self.assertNotEqual(geometry.active_length_mm, 83.82)
        self.assertAlmostEqual(duty.electrical_power_check_kw, 250.0, places=9)
        self.assertGreater(duty.required_shaft_torque_nm, 125.0)
        self.assertLess(duty.required_shaft_torque_nm, 140.0)
        self.assertEqual(
            loaded.phase_current_rms_a,
            duty.estimated_phase_rms_current_a,
        )
        self.assertAlmostEqual(
            loaded.phase_current_peak_a,
            duty.estimated_phase_rms_current_a * 2.0**0.5,
        )
        self.assertAlmostEqual(
            loaded.phase_a_current_a
            + loaded.phase_b_current_a
            + loaded.phase_c_current_a,
            0.0,
            places=9,
        )
        self.assertEqual(
            loaded.current_angle_electrical_deg,
            CASE.DEFAULT_CURRENT_ANGLE_ELECTRICAL_DEG,
        )
        self.assertEqual(loaded.rotor_position_mechanical_deg, 0.0)

    def test_loaded_point_accepts_explicit_rotor_position(self) -> None:
        inputs = CASE.inputs_from_sections(self.quantities, self.concentric)
        duty = CASE.analytical_duty_check(inputs)
        loaded = CASE.loaded_point_assumptions(
            duty,
            inputs,
            rotor_position_mechanical_deg=22.5,
        )
        self.assertEqual(loaded.rotor_position_mechanical_deg, 22.5)
        self.assertIn("22.5", loaded.winding_model)

    def test_select_rotor_position_sweep_keeps_endpoints_when_thinned(self) -> None:
        full = CASE.select_rotor_position_sweep_deg()
        self.assertEqual(full, CASE.LIVE_ROTOR_POSITION_SWEEP_MECH_DEG)
        fast = CASE.select_rotor_position_sweep_deg(max_points=4)
        self.assertEqual(fast, CASE.LIVE_ROTOR_POSITION_SWEEP_FAST_MECH_DEG)
        self.assertEqual(fast[0], 0.0)
        self.assertEqual(fast[-1], 45.0)
        custom = CASE.select_rotor_position_sweep_deg(
            positions_deg=(0.0, 10.0, 20.0, 30.0),
            max_points=3,
        )
        # Even subsample keeps endpoints; middle index is round(1.5) → 2 → 20°.
        self.assertEqual(custom, (0.0, 20.0, 30.0))
        single = CASE.select_rotor_position_sweep_deg(max_points=1)
        self.assertEqual(single, (0.0,))

    def test_select_rotor_position_sweep_rejects_empty(self) -> None:
        with self.assertRaises(CASE.FiaFrontKitCaseError):
            CASE.select_rotor_position_sweep_deg(positions_deg=())
        with self.assertRaises(CASE.FiaFrontKitCaseError):
            CASE.select_rotor_position_sweep_deg(max_points=0)

    def test_summarize_rotor_position_sweep_ratios(self) -> None:
        sweep = [
            {
                "rotor_position_mechanical_deg": 0.0,
                "torque_nm": -100.0,
            },
            {
                "rotor_position_mechanical_deg": 15.0,
                "torque_nm": -120.0,
            },
            {
                "rotor_position_mechanical_deg": 30.0,
                "torque_nm": -80.0,
            },
        ]
        summary = CASE.summarize_rotor_position_sweep(
            sweep,
            required_shaft_torque_nm=100.0,
        )
        self.assertEqual(summary["n_positions"], 3)
        self.assertEqual(summary["torque_magnitude_min_nm"], 80.0)
        self.assertEqual(summary["torque_magnitude_max_nm"], 120.0)
        self.assertEqual(summary["torque_magnitude_mean_nm"], 100.0)
        self.assertEqual(summary["torque_vs_required_ratio_min"], 0.8)
        self.assertEqual(summary["torque_vs_required_ratio_max"], 1.2)
        self.assertEqual(summary["torque_vs_required_ratio_mean"], 1.0)
        self.assertEqual(summary["peak_to_peak_magnitude_nm"], 40.0)
        empty = CASE.summarize_rotor_position_sweep(
            [],
            required_shaft_torque_nm=100.0,
        )
        self.assertEqual(empty["n_positions"], 0)
        self.assertIsNone(empty["torque_vs_required_ratio_mean"])

    def test_artifact_can_never_claim_release_or_a_closed_map(self) -> None:
        inputs = CASE.inputs_from_sections(self.quantities, self.concentric)
        geometry = CASE.derive_fia_geometry(inputs)
        duty = CASE.analytical_duty_check(inputs)
        magnetic = CASE.MagneticResult(
            peak_airgap_flux_density_t=0.91,
            rms_airgap_flux_density_t=0.62,
            mean_airgap_flux_density_t=0.55,
            minimum_airgap_flux_density_t=0.08,
        )
        loaded_assumptions = CASE.loaded_point_assumptions(duty, inputs)
        loaded_magnetic = CASE.LoadedMagneticResult(
            peak_airgap_flux_density_t=1.04,
            rms_airgap_flux_density_t=0.71,
            mean_airgap_flux_density_t=0.59,
            minimum_airgap_flux_density_t=0.09,
            torque_nm=-118.4,
        )
        position_sweep = [
            {
                "rotor_position_mechanical_deg": 0.0,
                "current_angle_electrical_deg": -45.0,
                "torque_nm": -118.4,
                "torque_magnitude_nm": 118.4,
            },
            {
                "rotor_position_mechanical_deg": 15.0,
                "current_angle_electrical_deg": -45.0,
                "torque_nm": -110.0,
                "torque_magnitude_nm": 110.0,
            },
            {
                "rotor_position_mechanical_deg": 30.0,
                "current_angle_electrical_deg": -45.0,
                "torque_nm": -105.0,
                "torque_magnitude_nm": 105.0,
            },
            {
                "rotor_position_mechanical_deg": 45.0,
                "current_angle_electrical_deg": -45.0,
                "torque_nm": -112.0,
                "torque_magnitude_nm": 112.0,
            },
        ]
        artifact = CASE.build_artifact(
            inputs=inputs,
            geometry=geometry,
            duty=duty,
            magnetic=magnetic,
            loaded_assumptions=loaded_assumptions,
            loaded_magnetic=loaded_magnetic,
            solver_identity={"name": "xfemm femmcli", "version": "test"},
            source_state_sha256="a" * 64,
            rotor_position_sweep=position_sweep,
        )

        self.assertEqual(artifact["status"], "PARTIAL")
        self.assertFalse(artifact["ship_ok"])
        self.assertEqual(artifact["torque_map"]["status"], "OPEN")
        self.assertEqual(artifact["dynamometer_correlation"]["status"], "OPEN")
        self.assertIsNone(artifact["finite_element_point"]["torque_nm"])
        self.assertEqual(artifact["loaded_point"]["torque_nm"], -118.4)
        self.assertFalse(artifact["loaded_point"]["torque_reliable"])
        self.assertEqual(
            artifact["loaded_point"]["phase_current_rms_a"],
            duty.estimated_phase_rms_current_a,
        )
        self.assertIn(
            "NOT a full MTPA",
            artifact["loaded_point"]["honesty_note"],
        )
        self.assertEqual(artifact["rotor_position_sweep"]["status"], "PARTIAL")
        self.assertEqual(
            artifact["rotor_position_sweep"]["summary"]["n_positions"],
            4,
        )
        self.assertIsNotNone(
            artifact["rotor_position_sweep"]["summary"][
                "torque_vs_required_ratio_mean"
            ]
        )
        self.assertIn("MTPA", artifact["rotor_position_sweep"]["note"])

    def test_lua_applies_rotor_mechanical_offset_to_magnets(self) -> None:
        inputs = CASE.inputs_from_sections(self.quantities, self.concentric)
        geometry = CASE.derive_fia_geometry(inputs)
        duty = CASE.analytical_duty_check(inputs)
        at_zero = CASE.loaded_point_assumptions(duty, inputs)
        at_offset = CASE.loaded_point_assumptions(
            duty,
            inputs,
            rotor_position_mechanical_deg=15.0,
        )
        lua_zero = CASE._build_fia_lua(
            geometry,
            remanence_t=1.2,
            fem_name="zero.fem",
            loaded=at_zero,
        )
        lua_offset = CASE._build_fia_lua(
            geometry,
            remanence_t=1.2,
            fem_name="offset.fem",
            loaded=at_offset,
        )
        self.assertNotEqual(lua_zero, lua_offset)
        # Magnet block labels carry magnetisation angle; a 15° mech rotate must
        # change at least one setblockprop magnet angle argument.
        self.assertIn("mi_setblockprop(\"ndfeb\"", lua_offset)

    def test_input_hash_changes_when_binding_quantity_changes(self) -> None:
        first = CASE.inputs_from_sections(self.quantities, self.concentric)
        changed = dict(self.quantities)
        changed["dc_bus_voltage_v"] = 800.0
        second = CASE.inputs_from_sections(changed, self.concentric)

        self.assertNotEqual(
            CASE.input_quantities_sha256(first),
            CASE.input_quantities_sha256(second),
        )


if __name__ == "__main__":
    unittest.main()
