// Jest guard for Phase-4.1 universal mass/energy balance selection (npm test / pre-push).
import { classifyBalanceRole, stripUnitTokens, selectUniversalBalanceRows } from './eng-basis-balance'

describe('Phase 4.1 — classifyBalanceRole keeps balance terms, drops spec-sheet terms', () => {
  it('classifies flows by feed/product/internal keyword', () => {
    expect(classifyBalanceRole('flue_gas_feed_m3_per_hour', 'm³/h')).toBe('input')
    expect(classifyBalanceRole('caco3_product_t_per_day', 't/day')).toBe('output')
    expect(classifyBalanceRole('mea_circulation_m3_per_hour', 'm³/h')).toBe('flow')
    expect(classifyBalanceRole('h2_feed_kg_per_hour', 'kg/h')).toBe('input')
  })
  it('splits kW terms into thermal duty vs electrical power by keyword', () => {
    expect(classifyBalanceRole('reboiler_duty_kw', 'kW')).toBe('duty')
    expect(classifyBalanceRole('condenser_cooling_duty_kw', 'kW')).toBe('duty')
    expect(classifyBalanceRole('heat_dissipation_kw', 'kW')).toBe('duty')
    expect(classifyBalanceRole('connected_electrical_load_kw', 'kW')).toBe('power')
    expect(classifyBalanceRole('compressor_consumption_kw', 'kW')).toBe('power')
  })
  it('classifies energy + efficiency (incl. COP)', () => {
    expect(classifyBalanceRole('annual_energy_kwh', 'kWh')).toBe('energy')
    expect(classifyBalanceRole('battery_capacity_wh', 'Wh')).toBe('energy')
    expect(classifyBalanceRole('capture_efficiency_pct', '%')).toBe('efficiency')
    expect(classifyBalanceRole('per_pass_conversion_pct', '%')).toBe('efficiency')
    expect(classifyBalanceRole('rankine_cop', 'COP')).toBe('efficiency') // COP is a real efficiency metric
  })
  it('EXCLUDES voltages, currents, pressures, dimensions, counts, areas, thrust (NOT balance terms)', () => {
    expect(classifyBalanceRole('dc_bus_voltage_v', 'V')).toBeNull()
    expect(classifyBalanceRole('bus_continuous_current_a', 'A')).toBeNull()
    expect(classifyBalanceRole('design_pressure_bar', 'bar')).toBeNull()
    expect(classifyBalanceRole('absorber_packed_height_m', 'm')).toBeNull()
    expect(classifyBalanceRole('cell_count', '')).toBeNull()
    expect(classifyBalanceRole('radiating_area_m2', 'm²')).toBeNull()
    expect(classifyBalanceRole('rated_thrust_n', 'N')).toBeNull()
    expect(classifyBalanceRole('reactor_volume_m3', 'm³')).toBeNull() // static volume, not a rate
  })
  it('EXCLUDES velocities, intensities + data rates (real-data false-positives from satellite/HAPS/VF)', () => {
    // velocities — a length/time is NOT a mass or energy flow
    expect(classifyBalanceRole('delta_v_budget_ms', 'm/s')).toBeNull()
    expect(classifyBalanceRole('flutter_speed_ms', 'm/s')).toBeNull()
    expect(classifyBalanceRole('altitude_decay_km', 'km/yr')).toBeNull()
    expect(classifyBalanceRole('irrigation_pipe_velocity_m', 'm/s')).toBeNull()
    // intensities — per-area / irradiance / yield-density are normalised, not absolute
    expect(classifyBalanceRole('solar_constant_w_m2', 'W/m²')).toBeNull()
    expect(classifyBalanceRole('crop_annual_yield_kg_m2', 'kg/m²/yr')).toBeNull()
    expect(classifyBalanceRole('ppfd_target_umol', 'µmol/m²/s')).toBeNull()
    // data rate + per-watt
    expect(classifyBalanceRole('network_throughput_gbe', 'Gbe')).toBeNull()
    expect(classifyBalanceRole('tps_per_watt', 'tps/W')).toBeNull()
    // key-encoded intensity with a BLANK unit — the `_kwh` suffix must NOT read as
    // energy (real-data: satellite carbon intensity 0.21 kgCO2/kWh leaked in)
    expect(classifyBalanceRole('lifecycle_co2_assessment__grid_intensity_kgco2_kwh', '')).toBeNull()
    expect(classifyBalanceRole('carbon_intensity_g_kwh', 'g/kWh')).toBeNull()
    expect(classifyBalanceRole('annual_energy_kwh', 'kWh')).toBe('energy') // but a real energy term still passes
  })
})

describe('Phase 4.1 — stripUnitTokens cleans the label (unit shown separately)', () => {
  it('pops trailing unit tokens only', () => {
    expect(stripUnitTokens('reboiler_duty_kw')).toBe('reboiler_duty')
    expect(stripUnitTokens('co2_capture_rate_kg_per_hour')).toBe('co2_capture_rate')
    expect(stripUnitTokens('connected_electrical_load_kw')).toBe('connected_electrical_load')
    expect(stripUnitTokens('capture_efficiency_pct')).toBe('capture_efficiency')
  })
})

describe('Phase 4.1 — selectUniversalBalanceRows derives a balance for ANY class (no per-class wiring)', () => {
  // A realistic e-fuel-style contract — NONE of the 13 hardcoded CO2 keys present.
  const efuel: any = {
    h2_feed_kg_per_hour: { value: 140, unit: 'kg/h' },
    saf_product_kg_per_hour: { value: 95, unit: 'kg/h' },
    recycle_gas_m3_per_hour: { value: 1200, unit: 'm³/h' },
    reboiler_duty_kw: { value: 850, unit: 'kW' },
    ft_reactor_cooling_duty_kw: { value: 1200, unit: 'kW' },
    connected_electrical_load_kw: { value: 600, unit: 'kW' },
    per_pass_conversion_pct: { value: 40, unit: '%' },
    // not balance terms — must be excluded:
    reactor_volume_m3: { value: 4, unit: 'm³' },
    design_pressure_bar: { value: 25, unit: 'bar' },
    compressor_count: { value: 3, unit: '' },
    auto_planned_tool_ran__gas_compressor: { value: 1 },
  }

  it('pulls the 7 real balance terms and excludes volume/pressure/count/breadcrumb', () => {
    const rows = selectUniversalBalanceRows(efuel) // identity humanise → labels are stripped keys
    const labels = rows.map((r) => r.label)
    expect(rows).toHaveLength(7)
    expect(labels).toEqual(expect.arrayContaining([
      'h2_feed', 'saf_product', 'recycle_gas', 'reboiler_duty', 'ft_reactor_cooling_duty', 'connected_electrical_load', 'per_pass_conversion',
    ]))
    expect(labels).not.toContain('reactor_volume')
    expect(labels).not.toContain('design_pressure')
    expect(labels).not.toContain('compressor_count')
    expect(labels.some((l) => l.startsWith('auto_planned'))).toBe(false)
  })

  it('orders inputs → outputs → flows → duties → power → efficiency', () => {
    const roles = selectUniversalBalanceRows(efuel).map((r) => r.label)
    expect(roles[0]).toBe('h2_feed') // input first
    expect(roles.indexOf('reboiler_duty')).toBeGreaterThan(roles.indexOf('saf_product')) // duty after product
    expect(roles[roles.length - 1]).toBe('per_pass_conversion') // efficiency last
  })

  it('preserves the original quantity object so value + unit still render', () => {
    const row = selectUniversalBalanceRows(efuel).find((r) => r.label === 'reboiler_duty')!
    expect((row.q as any).value).toBe(850)
    expect((row.q as any).unit).toBe('kW')
  })

  it('de-dupes by label (system + module-scope variants of one duty)', () => {
    const dup: any = {
      connected_electrical_load_kw: { value: 600, unit: 'kW' },
      connected_electrical_load_mw: { value: 0.6, unit: 'MW' }, // same stripped label
    }
    expect(selectUniversalBalanceRows(dup)).toHaveLength(1)
  })

  it('passes the humaniser through to the label', () => {
    const rows = selectUniversalBalanceRows({ reboiler_duty_kw: { value: 850, unit: 'kW' } }, (k) => k.replace(/_/g, ' '))
    expect(rows[0].label).toBe('reboiler duty')
  })

  it('returns [] for empty / all-excluded / null input (honest blank, never fabricated)', () => {
    expect(selectUniversalBalanceRows({})).toHaveLength(0)
    expect(selectUniversalBalanceRows(null)).toHaveLength(0)
    expect(selectUniversalBalanceRows({ cell_count: { value: 100, unit: '' }, dc_bus_voltage_v: { value: 800, unit: 'V' } })).toHaveLength(0)
  })

  it('handles bare-number quantity values (no wrapper object)', () => {
    const rows = selectUniversalBalanceRows({ reboiler_duty_kw: 850, cell_count: 100 } as any)
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('reboiler_duty')
  })
})
