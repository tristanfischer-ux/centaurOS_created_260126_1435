#!/usr/bin/env python3
"""Regression tests for PCS current/rating derivation."""

import unittest

import ngspice_run as subject


class NgspicePcsSizingTest(unittest.TestCase):
    def setUp(self):
        self.original = subject.run_ngspice
        subject.run_ngspice = lambda _netlist: ""

    def tearDown(self):
        subject.run_ngspice = self.original

    def test_residential_single_phase_uses_230v_current(self):
        result = subject.pcs_dc_operating_point(
            rated_kw=11.04,
            dc_bus_v=281.6,
            efficiency=0.985,
            ac_output_v=230.0,
            ac_phases=1,
        )
        self.assertAlmostEqual(result["ac_continuous_current_a"], 48.0, delta=0.1)
        self.assertGreaterEqual(result["lcl_filter_rating_a"], 55.0)
        self.assertEqual(result["dc_contactor_rating_a"], 51.0)

    def test_utility_three_phase_keeps_line_current_formula(self):
        result = subject.pcs_dc_operating_point(
            rated_kw=1000.0,
            dc_bus_v=800.0,
            efficiency=0.985,
            ac_output_v=400.0,
            ac_phases=3,
        )
        self.assertAlmostEqual(result["ac_continuous_current_a"], 1443.4, delta=0.5)
        self.assertGreaterEqual(result["lcl_filter_rating_a"], 1659.0)


if __name__ == "__main__":
    unittest.main()
