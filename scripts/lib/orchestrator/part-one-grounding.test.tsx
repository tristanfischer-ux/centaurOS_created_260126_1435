// Jest regression guard for the Phase-1 auto-planner grounding (runs in npm test
// / the pre-push gate). Pure functions — no I/O, no LLM.
import { inferQuantityMeta, readFiniteNumber, groundToolOutputs } from './part-one-grounding'

describe('part-one-grounding — unit/family inference', () => {
  it('maps unambiguous suffixes, most-specific first', () => {
    expect(inferQuantityMeta('nameplate_capacity_kwh')).toEqual({ unit: 'kWh', family: 'energy_storage' })
    expect(inferQuantityMeta('continuous_power_kw')).toEqual({ unit: 'kW', family: 'power' })
    expect(inferQuantityMeta('total_system_mass_kg')).toEqual({ unit: 'kg', family: 'mass' })
    expect(inferQuantityMeta('cost_estimate_gbp')).toEqual({ unit: '£', family: 'cost' })
    expect(inferQuantityMeta('dc_bus_voltage_kv')).toEqual({ unit: 'kV', family: 'voltage' })
    expect(inferQuantityMeta('canopy_area_m2')).toEqual({ unit: 'm²', family: 'area' })
    expect(inferQuantityMeta('tank_volume_m3')).toEqual({ unit: 'm³', family: 'volume' })
    expect(inferQuantityMeta('divergence_speed_m_s')).toEqual({ unit: 'm/s', family: 'velocity' })
    expect(inferQuantityMeta('flutter_margin_pct')).toEqual({ unit: '%', family: 'dimensionless' })
    expect(inferQuantityMeta('cell_count')).toEqual({ unit: '', family: 'dimensionless' })
    expect(inferQuantityMeta('storage_mwh')).toEqual({ unit: 'MWh', family: 'energy_storage' })
  })

  it('grounds ambiguous/unknown suffixes WITHOUT a unit claim (never a wrong unit)', () => {
    expect(inferQuantityMeta('depth_m')).toEqual({ unit: '', family: 'dimensionless' })
    expect(inferQuantityMeta('latency_ms')).toEqual({ unit: '', family: 'dimensionless' })
    expect(inferQuantityMeta('current_a')).toEqual({ unit: '', family: 'dimensionless' })
    expect(inferQuantityMeta('rated_v')).toEqual({ unit: '', family: 'dimensionless' })
    expect(inferQuantityMeta('unknown_blah')).toEqual({ unit: '', family: 'dimensionless' })
  })
})

describe('part-one-grounding — readFiniteNumber', () => {
  it('reads flat finite numbers and {value} wrappers, rejects everything else', () => {
    expect(readFiniteNumber({ x: 42 }, 'x')).toBe(42)
    expect(readFiniteNumber({ x: { value: 7 } }, 'x')).toBe(7)
    expect(readFiniteNumber({ x: 1 }, 'y')).toBeNull()
    expect(readFiniteNumber({ x: NaN }, 'x')).toBeNull()
    expect(readFiniteNumber({ x: Infinity }, 'x')).toBeNull()
    expect(readFiniteNumber({ x: '5' }, 'x')).toBeNull()
    expect(readFiniteNumber(null, 'x')).toBeNull()
  })
})

describe('part-one-grounding — groundToolOutputs', () => {
  it('grounds only declared finite-number outputs with inferred meta + provenance', () => {
    const out = { peak_power_kw: 150, soc_taper_pct: 80, label: 'ev', worked: [{}] }
    const g = groundToolOutputs('ev-charging-curve:taper', ['peak_power_kw', 'soc_taper_pct'], out)
    expect(Object.keys(g).sort()).toEqual(['peak_power_kw', 'soc_taper_pct'])
    expect(g.peak_power_kw.value).toBe(150)
    expect(g.peak_power_kw.unit).toBe('kW')
    expect(g.peak_power_kw.family).toBe('power')
    expect(g.soc_taper_pct.unit).toBe('%')
    expect(g.peak_power_kw.provenance).toEqual({
      source: 'tool:ev-charging-curve:taper',
      tool_id: 'ev-charging-curve:taper',
      invocation_output_field: 'peak_power_kw',
    })
  })

  it('NEVER invents an undeclared key and skips missing/non-number declared keys', () => {
    expect('label' in groundToolOutputs('t', ['peak_power_kw'], { peak_power_kw: 1, label: 'x' })).toBe(false)
    const g = groundToolOutputs('some:tool', ['a_kw', 'b_kg', 'c_missing'], { a_kw: 10, b_kg: 5 })
    expect(Object.keys(g).sort()).toEqual(['a_kw', 'b_kg'])
  })

  it('empty when no declared keys or non-object output', () => {
    expect(Object.keys(groundToolOutputs('t', [], { x: 1 }))).toHaveLength(0)
    expect(Object.keys(groundToolOutputs('t', ['x_kw'], null))).toHaveLength(0)
  })
})
