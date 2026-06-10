// Jest guard for Phase-2 feature-derived applicability (runs in npm test / pre-push).
import { designFeatures, toolDomainRelevant } from './design-features'
import { composeFallbackPlan } from './auto-plan-fallback'

describe('Phase 2 — designFeatures infers relevant domains from the envelope', () => {
  it('compute_heat keeps universal domains but EXCLUDES process/aero/battery/photonics', () => {
    const f = designFeatures({ class: 'compute_heat_module', application: 'data centre heat' })
    expect(f.domains.has('thermal')).toBe(true) // always
    expect(f.domains.has('power_electronics')).toBe(true)
    expect(f.domains.has('process')).toBe(false) // the electrolyser domain — excluded
    expect(f.domains.has('aero')).toBe(false) // the drone domain — excluded
    expect(f.domains.has('battery')).toBe(false)
    expect(f.domains.has('photonics')).toBe(false)
  })

  it('satellite/thruster→aero, chemical→process, bess→battery, SAR→photonics', () => {
    expect(designFeatures({ class: 'satellite_smallsat' }).domains.has('aero')).toBe(true)
    expect(designFeatures({ class: 'propulsion_thruster_product' }).domains.has('aero')).toBe(true)
    expect(designFeatures({ class: 'novel_chemical_plant' }).domains.has('process')).toBe(true)
    expect(designFeatures({ class: 'bess' }).domains.has('battery')).toBe(true)
    expect(designFeatures({ class: 'sar_imaging' }).domains.has('photonics')).toBe(true)
  })

  it('toolDomainRelevant: domain-agnostic always allowed; else must be in the set', () => {
    const f = designFeatures({ class: 'compute_heat_module' })
    expect(toolDomainRelevant(undefined, f)).toBe(true)
    expect(toolDomainRelevant('thermal', f)).toBe(true)
    expect(toolDomainRelevant('process', f)).toBe(false)
  })
})

describe('Phase 2 — composeFallbackPlan excludes domain-wrong tools when the filter is ON', () => {
  // enough tools that excluding `process` still clears the "don't starve" guard
  const filler = Array.from({ length: 9 }, (_, i) => ({ tool_id: `therm:${i}`, input_keys: [], output_keys: [] as string[], domain: 'thermal' }))
  const registry: any = [
    { tool_id: 'electro:x', input_keys: [], output_keys: ['total_system_mass_kg'], domain: 'process' },
    { tool_id: 'rad:y', input_keys: [], output_keys: ['total_system_mass_kg'], domain: 'thermal' },
    ...filler,
  ]
  const env: any = { class: 'compute_heat_module', scale_tier: 'small', voltage_tier: 'lv', form_factor: 'module', application: 'data centre heat' }
  afterEach(() => { delete process.env.UNIVERSAL_FEATURE_FILTER })

  it('filter ON → the process electrolyser is dropped, the thermal tool kept', () => {
    process.env.UNIVERSAL_FEATURE_FILTER = '1'
    const ids = (composeFallbackPlan(env, {} as any, registry)?.plan.tools ?? []).map((t: any) => t.tool_id)
    expect(ids).not.toContain('electro:x') // process domain, compute_heat has none → excluded
    expect(ids).toContain('rad:y') // thermal → kept + selected as the mass producer
  })

  it('filter OFF (default) → the process tool is still eligible (prior behaviour)', () => {
    const ids = (composeFallbackPlan(env, {} as any, registry)?.plan.tools ?? []).map((t: any) => t.tool_id)
    expect(ids).toContain('electro:x')
  })
})
