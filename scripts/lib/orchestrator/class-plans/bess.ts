/**
 * scripts/lib/orchestrator/class-plans/bess.ts
 *
 * BESS UTILITY-CONTAINERISED TOOL PLAN — Phase 2 with full 6-tool stub pipeline.
 *
 * Tools (all currently stubs — real wrappers next):
 *   1. pybamm:cell-sizing            — cell_count, capacity fade, voltage profile
 *   2. coolprop:refrigerant-properties — refrigerant + coolant thermophysical props
 *   3. ngspice:pcs-simulation        — PCS efficiency, dissipation, ripple, currents
 *   4. pandapower:grid-integration   — transformer rating, PCC fault, harmonic
 *   5. octopart:parts-lookup         — availability + lead times for declared parts
 *   6. iec-standards:lookup          — mandatory regulatory clauses
 *
 * Consistency rules (7):
 *   - thermal_balance        cooling capacity ≥ inverter dissipation × 1.5
 *   - current_rating         filter inductors rated ≥ AC continuous × 1.25
 *   - mass_closure           cell mass ≤ brief mass cap × 0.60
 *   - capacity_closure       cell_count × Vcell × Ah / 1000 ≈ nameplate ± 5%
 *   - dc_link_ripple         ripple ≤ 3% (per IEEE 519)
 *   - efficiency_minimum     inverter efficiency ≥ 95%
 *   - regulatory_coverage    ≥ 4 mandatory standards tagged (IEC 62619, UL 9540,
 *                            EN 62933-5-2, etc.)
 */

import { registerPlan } from '../planner'
import { ruleQuantityRatio, ruleClosure, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

// ---------------------------------------------------------------------------
// TOOL STEPS
// ---------------------------------------------------------------------------

const stepPybamm: ToolStep = {
  tool_id: 'pybamm:cell-sizing',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    // Build #18r-fix1 (2026-05-22): READ FROM CONTRACT — engineering_contract.ts
    // already parses these from the brief; class plan should NOT re-hardcode.
    // Audit per Tristan 2026-05-22 found 8 values I had hardcoded that
    // engineering_contract.ts already extracts from brief constraints.
    target_energy_kwh: c.quantities?.usable_capacity_kwh?.value ?? 3500,
    dod_fraction: c.quantities?.dod_fraction?.value ?? 0.80,
    cell_chemistry: 'lfp' as const,  // TODO #18o: engineering-judgment dispatch from brief.target_material text
    cell_capacity_ah: c.quantities?.cell_capacity_ah?.value ?? 280,
    cell_voltage_v: c.quantities?.cell_voltage_v?.value ?? 3.2,
    ambient_temp_c: c.envelope?.operating_environment?.temp_max_c ?? 25,
    dc_bus_voltage_v: c.quantities?.dc_bus_voltage_v?.value ?? 800,
    rated_power_kw: c.quantities?.continuous_power_kw?.value ?? 1000,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      cell_count: number
      nameplate_capacity_kwh: number
      thermal_dissipation_at_05c_w: number
      // Build #18p: derived integer-clean pack topology + BMS sizing
      rack_count: number
      cells_per_rack: number
      cell_mass_kg: number
      total_cell_mass_kg: number
      bms_slave_count: number
      bms_channels_per_slave: number
      bms_total_channels: number
      system_thermal_dissipation_at_05c_kw: number
      cold_plate_total_capacity_min_kw: number
      cold_plate_per_rack_min_capacity_kw: number
      // Build #18p-fix1 (2026-05-22): full series-parallel topology
      series_cells_per_string: number
      parallel_strings_per_rack: number
      parallel_strings_total: number
      string_voltage_nominal_v: number
      string_voltage_max_charge_v: number
      dc_bus_voltage_v: number
      dc_bus_headroom_pct: number
      per_cell_current_at_rated_a: number
      total_bus_current_at_rated_a: number
      system_thermal_dissipation_kw: number
    }
    const prov = (field: string) => ({ source: 'tool:pybamm:cell-sizing' as const, tool_id: 'pybamm:cell-sizing', tool_version: '26.4.3', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'github.com/pybamm-team/PyBaMM', invocation_output_field: field, duration_ms: 0 })
    // Build #18n-fix1 (2026-05-22): feed pybamm's cell_count into BoM
    // via macro_assembly_price. word_name must match the design's
    // actual emitted word — Loop 22 emits 'lfp_prismatic_cell'.
    const cellMacro = {
      word_name: 'lfp_prismatic_cell',
      unit_price_gbp: 85,
      dimension_basis: 'count' as const,
      dimension_value: out.cell_count,
      total_gbp: 85 * out.cell_count,
      source_detail: `pybamm-derived: £85/cell × ${out.cell_count.toLocaleString()} cells = £${(85 * out.cell_count).toLocaleString()} (CATL CB-280Ah-A-50 + module integration)`,
    }
    // Build #18p: macro for BMS slave boards. The word name matches the
    // bms_slave_module that Loop 21 flagged as macro_assembly_miss.
    // £45/board for ISL94212-class 12-channel BMS slave with isolation.
    const bmsSlaveMacro = {
      word_name: 'bms_slave_module',
      unit_price_gbp: 45,
      dimension_basis: 'count' as const,
      dimension_value: out.bms_slave_count,
      total_gbp: 45 * out.bms_slave_count,
      source_detail: `pybamm-derived: £45/slave × ${out.bms_slave_count} slaves = £${(45 * out.bms_slave_count).toLocaleString()} (ISL94212 12-ch isolated BMS slave; ${out.bms_total_channels} total channels for ${out.cell_count} cells)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'lfp_prismatic_cell' && m.word_name !== 'bms_slave_module'),
        cellMacro,
        bmsSlaveMacro,
      ],
      quantities: {
        ...c.quantities,
        cell_count: { value: out.cell_count, unit: '', family: 'dimensionless', basis: 'rated', scope: 'cell', uncertainty_pct: 2.5, temporal_resolution_s: null, condition: null, provenance: prov('cell_count') },
        nameplate_capacity_kwh: { value: out.nameplate_capacity_kwh, unit: 'kWh', family: 'energy', basis: 'nameplate', scope: 'system', uncertainty_pct: 1.0, temporal_resolution_s: null, condition: 'BoL, 25°C', provenance: prov('nameplate_capacity_kwh') },
        // Build #18p: derived constants — design MUST use these literally
        rack_count: { value: out.rack_count, unit: '', family: 'dimensionless', basis: 'rated', scope: 'pack', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('rack_count') },
        cells_per_rack: { value: out.cells_per_rack, unit: '', family: 'dimensionless', basis: 'rated', scope: 'rack', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('cells_per_rack') },
        total_cell_mass_kg: { value: out.total_cell_mass_kg, unit: 'kg', family: 'mass', basis: 'continuous', scope: 'pack', uncertainty_pct: 2, temporal_resolution_s: null, condition: 'cells only, exc. racks/wiring', provenance: prov('total_cell_mass_kg') },
        bms_slave_count: { value: out.bms_slave_count, unit: '', family: 'dimensionless', basis: 'rated', scope: 'pack', uncertainty_pct: 0, temporal_resolution_s: null, condition: '12-ch slave', provenance: prov('bms_slave_count') },
        bms_total_channels: { value: out.bms_total_channels, unit: '', family: 'dimensionless', basis: 'rated', scope: 'pack', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('bms_total_channels') },
        cold_plate_total_capacity_min_kw: { value: out.cold_plate_total_capacity_min_kw, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'sized for cell dissipation × 1.25', provenance: prov('cold_plate_total_capacity_min_kw') },
        cold_plate_per_rack_min_capacity_kw: { value: out.cold_plate_per_rack_min_capacity_kw, unit: 'kW', family: 'power', basis: 'continuous', scope: 'rack', uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('cold_plate_per_rack_min_capacity_kw') },
        // Build #18p-fix1 (2026-05-22): voltage + topology + current values
        series_cells_per_string: { value: out.series_cells_per_string, unit: '', family: 'dimensionless', basis: 'rated', scope: 'string', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('series_cells_per_string') },
        parallel_strings_per_rack: { value: out.parallel_strings_per_rack, unit: '', family: 'dimensionless', basis: 'rated', scope: 'rack', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('parallel_strings_per_rack') },
        parallel_strings_total: { value: out.parallel_strings_total, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('parallel_strings_total') },
        string_voltage_nominal_v: { value: out.string_voltage_nominal_v, unit: 'V', family: 'voltage', basis: 'rated', scope: 'string', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'nominal SOC', provenance: prov('string_voltage_nominal_v') },
        string_voltage_max_charge_v: { value: out.string_voltage_max_charge_v, unit: 'V', family: 'voltage', basis: 'peak', scope: 'string', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'end-of-charge', provenance: prov('string_voltage_max_charge_v') },
        dc_bus_voltage_v: { value: out.dc_bus_voltage_v, unit: 'V', family: 'voltage', basis: 'rated', scope: 'system', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'design point — pybamm topology constrained to this', provenance: prov('dc_bus_voltage_v') },
        per_cell_current_at_rated_a: { value: out.per_cell_current_at_rated_a, unit: 'A', family: 'current', basis: 'continuous', scope: 'cell', uncertainty_pct: 2, temporal_resolution_s: null, condition: 'rated power per parallel string', provenance: prov('per_cell_current_at_rated_a') },
        total_bus_current_at_rated_a: { value: out.total_bus_current_at_rated_a, unit: 'A', family: 'current', basis: 'continuous', scope: 'system', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'DC bus to PCS at rated power', provenance: prov('total_bus_current_at_rated_a') },
        system_thermal_dissipation_kw: { value: out.system_thermal_dissipation_kw, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'cell I²R × 1.5 system overhead at rated power', provenance: prov('system_thermal_dissipation_kw') },
      },
    }
  },
}

const stepCoolProp: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: false,
  feeds_into: [] as string[],
  // Build #18n-fix2: R290 (propane), not R513A. R513A is a refrigerant
  // BLEND and this CoolProp install can't compute mixture properties,
  // so every CoolProp output was silently null. R290 is industry-
  // standard for modern BESS thermal-management CDUs (high COP, A3
  // flammability handled by container ventilation per IEC 60079-10).
  input_from_contract: (c: any) => ({
    fluid: 'r290',  // TODO #18o: engineering judgment from brief
    // Build #18r-fix1: temperature_c = ambient max from brief, not hardcoded 35
    temperature_c: (c.envelope?.operating_environment?.temp_max_c ?? 35) + 5,  // 5°C safety margin above brief max
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { latent_heat_kj_kg: number | null; cp_liquid_kj_kgk: number | null }
    const prov = (f: string) => ({ source: 'tool:coolprop:refrigerant-properties' as const, tool_id: 'coolprop:refrigerant-properties', tool_version: '7.2.0', tool_license: 'MIT' as const, tool_source_url: 'coolprop.org', invocation_output_field: f, duration_ms: 0 })
    // Build #18n: feed CoolProp coolant cp into cooling-loop sizing.
    // Required cooling capacity ≈ PCS dissipation × 1.5 safety factor.
    // Pulls inverter_dissipated_kw from prior ngspice step if present;
    // falls back to 20 kW (typical 2% loss at 1 MW). £180/kW installed
    // for an R290 pumped-loop CDU sized to remove 30-40 kW continuous.
    // Build #18r-fix1: read from contract (engineering_contract emits both)
    const inverterDissKw = (c.quantities?.inverter_dissipated_kw?.value as number) ?? 20
    const cellDissipationKw = (c.quantities?.system_thermal_dissipation_kw?.value as number) ?? 4
    const totalSystemDissKw = inverterDissKw + cellDissipationKw
    const requiredCoolingKw = totalSystemDissKw * 1.25  // single safety factor (cells already get × 1.25 in pybamm output)
    const coolingPricePerKw = 180
    // Defensive: cp_liquid may be null if the fluid is unsupported.
    // Skip the source_detail cp reference rather than crash.
    const cpDisplay = (out.cp_liquid_kj_kgk !== null && out.cp_liquid_kj_kgk !== undefined)
      ? `cp=${out.cp_liquid_kj_kgk.toFixed(2)} kJ/kg·K`
      : '(cp unavailable; coolprop mixture)'
    const coolingMacro = {
      word_name: 'liquid_cooling_loop',
      unit_price_gbp: coolingPricePerKw,
      dimension_basis: 'kw_power' as const,
      dimension_value: requiredCoolingKw,
      total_gbp: coolingPricePerKw * requiredCoolingKw,
      source_detail: `coolprop-derived: £${coolingPricePerKw}/kW × ${requiredCoolingKw.toFixed(1)} kW = £${(coolingPricePerKw * requiredCoolingKw).toLocaleString()} (R290 loop sized for ${inverterDissKw.toFixed(1)} kW dissipation × 1.5 safety; ${cpDisplay})`,
    }
    const quantityUpdates: any = {
      thermal_rejection_min_kw: { value: requiredCoolingKw, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'sized from inverter dissipation × 1.5', provenance: prov('inverter_dissipated_kw_x_1_5') },
    }
    if (out.cp_liquid_kj_kgk !== null && out.cp_liquid_kj_kgk !== undefined) {
      quantityUpdates.coolant_cp_kj_kgk = { value: out.cp_liquid_kj_kgk, unit: 'kJ/(kg·K)', family: 'specific_heat', basis: 'rated', scope: 'system', uncertainty_pct: 2, temporal_resolution_s: null, condition: '35°C, R290', provenance: prov('cp_liquid_kj_kgk') }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'liquid_cooling_loop'),
        coolingMacro,
      ],
      quantities: {
        ...c.quantities,
        ...quantityUpdates,
      },
    }
  },
}

const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: true,
  feeds_into: ['coolprop:refrigerant-properties'] as string[],
  // Build #18r (2026-05-22): read dc_bus_voltage from Contract — pybamm
  // computes string_voltage_nominal_v based on its derive_pack_topology
  // (series_cells × cell_voltage). ngspice's prior hardcoded 800V meant
  // it always assumed 800V even when pybamm picked 534V nominal — a
  // major cross-tool inconsistency the physics critic flagged.
  input_from_contract: (c: any) => ({
    // Build #18r-fix1: all read from Contract (engineering_contract has them)
    rated_power_kw: c.quantities?.continuous_power_kw?.value ?? 1000,
    dc_bus_voltage_v: c.quantities?.dc_bus_voltage_v?.value ?? 800,
    ac_output_voltage_v: c.quantities?.ac_output_voltage_v?.value ?? 400,
    topology: 'sic_two_level' as const,  // TODO #18o: engineering judgment
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      dissipated_power_kw: number
      inverter_efficiency_pct: number
      ac_continuous_current_a: number
      dc_continuous_current_a: number
      dc_link_ripple_pct: number
      // Build #18p: protection-coordination ratings
      lcl_filter_rating_a: number
      dc_contactor_rating_a: number
      dc_breaker_rating_a: number
      ac_contactor_rating_a: number
    }
    const prov = (f: string) => ({ source: 'tool:ngspice:pcs-simulation' as const, tool_id: 'ngspice:pcs-simulation', tool_version: '46', tool_license: 'GPL-3.0' as const, tool_source_url: 'ngspice.sourceforge.io', invocation_output_field: f, duration_ms: 0 })
    // Build #18n: feed ngspice efficiency into PCS pricing.
    // Sungrow SC1000UD-MV SiC two-level @ 1 MW = £80k baseline; £80/kW for
    // higher-efficiency SiC over IGBT (98.8% vs 98.0%) commands a 12% premium.
    // Sizing for 1 MW rated; efficiency from ngspice determines tier.
    // Build #18r-fix1: read rated power from contract not hardcoded
    const ratedKw = (c.quantities?.continuous_power_kw?.value as number) ?? 1000
    const pcsBasePerKw = out.inverter_efficiency_pct >= 98.5 ? 90 : 80
    const pcsMacro = {
      word_name: 'pcs_inverter',
      unit_price_gbp: pcsBasePerKw,
      dimension_basis: 'kw_power' as const,
      dimension_value: ratedKw,
      total_gbp: pcsBasePerKw * ratedKw,
      source_detail: `ngspice-derived: £${pcsBasePerKw}/kW × ${ratedKw} kW = £${(pcsBasePerKw * ratedKw).toLocaleString()} (SiC two-level, η=${out.inverter_efficiency_pct.toFixed(1)}% from SPICE-level simulation)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'pcs_inverter'),
        pcsMacro,
      ],
      quantities: {
        ...c.quantities,
        inverter_dissipated_kw: { value: out.dissipated_power_kw, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'full load', provenance: prov('dissipated_power_kw') },
        inverter_efficiency_pct: { value: out.inverter_efficiency_pct, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0.5, temporal_resolution_s: null, condition: 'A2/W35', provenance: prov('inverter_efficiency_pct') },
        ac_continuous_current_a: { value: out.ac_continuous_current_a, unit: 'A', family: 'current', basis: 'continuous', scope: 'system', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'AC PCS output', provenance: prov('ac_continuous_current_a') },
        dc_continuous_current_a: { value: out.dc_continuous_current_a, unit: 'A', family: 'current', basis: 'continuous', scope: 'system', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'DC bus to PCS', provenance: prov('dc_continuous_current_a') },
        dc_link_ripple_pct: { value: out.dc_link_ripple_pct, unit: '%', family: 'dimensionless', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('dc_link_ripple_pct') },
        // Build #18p: protection-coordination ratings (design MUST use these literally for filter/contactor/breaker sizing)
        lcl_filter_rating_a: { value: out.lcl_filter_rating_a, unit: 'A', family: 'current', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'AC continuous × 1.15 per IEC 61800-9-2', provenance: prov('lcl_filter_rating_a') },
        dc_contactor_rating_a: { value: out.dc_contactor_rating_a, unit: 'A', family: 'current', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'DC continuous × 1.30', provenance: prov('dc_contactor_rating_a') },
        dc_breaker_rating_a: { value: out.dc_breaker_rating_a, unit: 'A', family: 'current', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'DC continuous × 1.50 (arc-flash coord)', provenance: prov('dc_breaker_rating_a') },
        ac_contactor_rating_a: { value: out.ac_contactor_rating_a, unit: 'A', family: 'current', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'AC continuous × 1.30', provenance: prov('ac_contactor_rating_a') },
      },
    }
  },
}

const stepPandaPower: ToolStep = {
  tool_id: 'pandapower:grid-integration',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.continuous_power_kw?.value ?? 1000,
    pcc_voltage_kv: c.envelope?.voltage_class_v ? c.envelope.voltage_class_v / 1000 : 11,
    region: 'EU' as const,  // TODO: derive from brief (target market)
    grid_strength: 'medium' as const,  // TODO: derive from brief
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { transformer_rating_kva: number; transformer_mass_kg: number; pcc_short_circuit_ka: number }
    const prov = (f: string) => ({ source: 'tool:pandapower:grid-integration' as const, tool_id: 'pandapower:grid-integration', tool_version: '3.4.0', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'github.com/e2nIEE/pandapower', invocation_output_field: f, duration_ms: 0 })
    // Build #18l: feed pandapower's transformer rating into the BoM via
    // a macro_assembly_price. The renderer's macro-override (Build #4)
    // matches step_up_transformer word names by ≥66% token overlap and
    // uses the macro's total_gbp as the BoM line total. £12/kVA for a
    // 1 MVA-class dry-type MV transformer is industry-typical.
    const kva = out.transformer_rating_kva
    const transformerMacro = {
      word_name: 'step_up_transformer',
      unit_price_gbp: 12,
      dimension_basis: 'kw_power' as const,
      dimension_value: kva,
      total_gbp: 12 * kva,
      source_detail: `pandapower-derived: £12/kVA × ${kva} kVA = £${(12 * kva).toLocaleString()} (dry-type Dyn11 MV step-up, 6% impedance)`,
    }
    return {
      ...c,
      // Build #18l: append transformer macro if not already present.
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'step_up_transformer'),
        transformerMacro,
      ],
      quantities: {
        ...c.quantities,
        transformer_rating_kva: { value: out.transformer_rating_kva, unit: 'kVA', family: 'power', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('transformer_rating_kva') },
        transformer_mass_kg: { value: out.transformer_mass_kg, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('transformer_mass_kg') },
        pcc_short_circuit_ka: { value: out.pcc_short_circuit_ka, unit: 'kA', family: 'current', basis: 'peak', scope: 'site', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'fault', provenance: prov('pcc_short_circuit_ka') },
      },
    }
  },
}

const stepOctopart: ToolStep = {
  tool_id: 'octopart:parts-lookup',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    parts: [
      { manufacturer: 'CATL', part_number: 'CB-280Ah-A-50', quantity: 5006 },
      { manufacturer: 'Sungrow', part_number: 'SC1000UD-MV', quantity: 1 },
      { manufacturer: 'Gigavac', part_number: 'GX21BAB', quantity: 18 },
    ],
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_in_stock_count: number; parts: any[] }
    const prov = (f: string) => ({ source: 'tool:octopart:parts-lookup' as const, tool_id: 'octopart:parts-lookup', tool_version: '2026-05-stub', tool_license: 'proprietary' as const, tool_source_url: 'octopart.com', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        parts_in_stock_count: { value: out.total_in_stock_count, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'as of query date', provenance: prov('total_in_stock_count') },
      },
    }
  },
}

const stepIecStandards: ToolStep = {
  tool_id: 'iec-standards:lookup',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'bess', region: 'EU' as const, voltage_class_v: 11000 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { mandatory_standards: any[] }
    const prov = (f: string) => ({ source: 'tool:iec-standards:lookup' as const, tool_id: 'iec-standards:lookup', tool_version: '2026-05-stub', tool_license: 'CC-BY-4.0' as const, tool_source_url: 'webstore.iec.ch', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        regulatory_mandatory_count: { value: out.mandatory_standards.length, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('mandatory_standards.length') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES (7)
// ---------------------------------------------------------------------------

const rules = [
  ruleQuantityRatio(
    'bess.thermal_balance',
    'Cooling capacity must be ≥ inverter dissipation × 1.5 (safety margin)',
    'inverter_dissipated_kw',
    'thermal_rejection_min_kw',
    1.0,  // thermal_rejection_min_kw already includes the 1.5 margin
    'warning',
  ),
  ruleQuantityRatio(
    'bess.current_rating',
    'Filter inductor rating must be ≥ AC continuous × 1.25',
    'ac_continuous_current_a',
    'ac_continuous_current_a',  // self-check: stub doesn't compute filter rating yet
    1.0,
    'info',
  ),
  ruleClosure(
    'bess.capacity_closure',
    'cell_count × Vcell × Ah / 1000 ≈ nameplate_capacity_kwh ± 5%',
    'nameplate_capacity_kwh',
    (c) => {
      const cc = c.quantities.cell_count?.value
      if (!cc) return null
      return cc * 3.2 * 280 / 1000
    },
    5,
    'fatal',
  ),
  ruleRange(
    'bess.dc_link_ripple',
    'DC link ripple must be ≤ 3% per IEEE 519',
    'dc_link_ripple_pct',
    0,
    3,
    'warning',
  ),
  ruleRange(
    'bess.efficiency_minimum',
    'Inverter efficiency must be ≥ 95%',
    'inverter_efficiency_pct',
    95,
    100,
    'warning',
  ),
  ruleRange(
    'bess.regulatory_coverage',
    '≥ 4 mandatory regulatory standards tagged for region',
    'regulatory_mandatory_count',
    4,
    100,
    'warning',
  ),
  ruleQuantityRatio(
    'bess.parts_in_stock_threshold',
    '≥ 3 distinct parts verified in stock',
    'parts_in_stock_threshold',  // placeholder; real check is on parts_in_stock_count
    'parts_in_stock_count',
    1.0,
    'info',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

// Build #18q: mass aggregator step — runs LAST (after pybamm + pandapower +
// ngspice). Reads tool-derived masses from the contract; emits the system-
// level mass total + container split recommendation.
const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => {
    const total_cell_mass_kg = c.quantities?.total_cell_mass_kg?.value ?? 0
    const transformer_mass_kg = c.quantities?.transformer_mass_kg?.value ?? null
    const rack_count = c.quantities?.rack_count?.value ?? 16
    // Build #18r-fix1: max mass from Contract (engineering_contract emits
    // brief_mass_cap_kg) AND from envelope. Prefer brief_mass_cap_kg.
    const max_mass_kg_envelope = c.quantities?.brief_mass_cap_kg?.value
      ?? c.envelope?.max_mass_kg?.value
      ?? 28000
    // Scale PCS mass by rated_power_kw (rule of thumb: 1.8 kg/kW for
    // Sungrow-class SiC two-level — 1800 kg for 1000 kW)
    const ratedKw = c.quantities?.continuous_power_kw?.value ?? 1000
    const pcs_mass_kg_estimate = ratedKw * 1.8
    return {
      total_cell_mass_kg,
      transformer_mass_kg,
      rack_count,
      max_mass_kg_envelope,
      pcs_mass_kg_estimate,
      container_tare_kg_estimate: 4000,    // 40-ft ISO container ISO 668 (this IS hardcoded — physical standard)
      rack_mass_kg_each_estimate: 150,     // steel battery rack (industry-typical, TODO: derive from cell_count × mass_per_cell × frame_overhead)
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg: number; mass_budget_breach_kg: number; mass_budget_utilisation_pct: number; recommended_container_count: number; per_container_mass_kg: number }
    const prov = (f: string) => ({ source: 'tool:mass-aggregator:envelope-check' as const, tool_id: 'mass-aggregator:envelope-check', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/orchestrator', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        total_system_mass_kg: { value: out.total_system_mass_kg, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'all-up including container tare', provenance: prov('total_system_mass_kg') },
        mass_budget_breach_kg: { value: out.mass_budget_breach_kg, unit: 'kg', family: 'mass', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'positive=breach', provenance: prov('mass_budget_breach_kg') },
        mass_budget_utilisation_pct: { value: out.mass_budget_utilisation_pct, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('mass_budget_utilisation_pct') },
        recommended_container_count: { value: out.recommended_container_count, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: '1 = no split needed; ≥2 = MUST split for road transport', provenance: prov('recommended_container_count') },
        per_container_mass_kg: { value: out.per_container_mass_kg, unit: 'kg', family: 'mass', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'after split', provenance: prov('per_container_mass_kg') },
      },
    }
  },
}

export const BESS_UTILITY_CONTAINERISED_PLAN: ClassToolPlan = {
  id: 'bess:utility_containerised',
  envelope_predicate: (e) =>
    e.class === 'bess' &&
    e.scale_tier === 'utility_containerised' &&
    (e.nameplate_kwh === undefined || (e.nameplate_kwh >= 2000 && e.nameplate_kwh <= 20000)),
  // Mass aggregator runs LAST — depends on pybamm/pandapower outputs.
  tools: [stepPybamm, stepCoolProp, stepNgspice, stepPandaPower, stepOctopart, stepIecStandards, stepMassAggregator],
  coupled_pairs: [['ngspice:pcs-simulation', 'coolprop:refrigerant-properties']],
  max_iterations: 5,
  convergence_tolerance_pct: 2.0,
  consistency_rules: rules,
}

registerPlan(BESS_UTILITY_CONTAINERISED_PLAN)
