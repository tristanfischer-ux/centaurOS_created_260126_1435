// Jest guard for Phase-3 universal sizing (runs in npm test / pre-push). The
// headline assertion: the emitted vessel dimension is GEOMETRICALLY consistent
// with the sized volume — i.e. geometry follows the calculation (the fix for the
// satellite "58.7 L tank drawn 450 × 300 mm" bug).
import { vesselDimsFromVolume, pipeBoreFromFlow, applyFamilySizing } from './sizing'

function parseCyl(dim: string): { D: number; L: number } | null {
  const m = dim.match(/Ø(\d+)\s*×\s*(\d+)\s*mm/)
  return m ? { D: +m[1], L: +m[2] } : null
}
/** Geometric volume (m³) of a cylinder given Ø,L in mm. */
function cylVol(D_mm: number, L_mm: number): number {
  return Math.PI * Math.pow(D_mm / 2000, 2) * (L_mm / 1000)
}

describe('Phase 3 — vessel dimensions are CONSISTENT with the sized volume', () => {
  it('emitted cylinder holds the stated volume (fixes the 58.7 L → 450×300 mm bug)', () => {
    const mods = vesselDimsFromVolume(0.0587) // 58.7 L
    const dim = mods.find((m) => m.kind === 'dimension')!.value as string
    const { D, L } = parseCyl(dim)!
    // the WHOLE point: the geometry holds the volume to within rounding
    expect(Math.abs(cylVol(D, L) - 0.0587) / 0.0587).toBeLessThan(0.02)
    // and it is NOT the buggy 450 × 300 (which holds only 47.7 L)
    expect(cylVol(450, 300)).toBeLessThan(0.05) // proves the old emitted dims were inconsistent
    expect(`${D}x${L}`).not.toBe('450x300')
    // capacity modifier carries the working volume
    expect(mods.find((m) => m.kind === 'capacity')!.value).toBe('0.059')
  })

  it('folds wall thickness into ONE dimension mod when a design pressure is given', () => {
    const mods = vesselDimsFromVolume(2.0, 3, 16) // 2 m³, 16 bar
    const dims = mods.filter((m) => m.kind === 'dimension')
    expect(dims).toHaveLength(1) // single value per kind (modifier-consistency gate)
    expect(dims[0].value).toMatch(/mm wall.*ASME UG-27 @ 16 bar/)
  })

  it('never invents geometry when no volume is supplied', () => {
    expect(vesselDimsFromVolume(undefined)).toHaveLength(0)
    expect(vesselDimsFromVolume(0)).toHaveLength(0)
  })

  it('pipe bore from flow: D = √(4Q/(π·v))  (36 m³/h @ 2 m/s ≈ DN80)', () => {
    expect(pipeBoreFromFlow(36)[0].value).toMatch(/DN(79|80|81) bore/)
    expect(pipeBoreFromFlow(undefined)).toHaveLength(0)
  })
})

describe('Phase 3 — applyFamilySizing reaches an UNSEEN class via the universal union', () => {
  it('sizes a vessel word with volume-derived dimensions for a class with NO family mapping', () => {
    const contract: any = { quantities: {
      carbonation_reactor_volume_m3: { value: 4 },
      design_pressure_bar: { value: 10 },
    } }
    const modules: any[] = [{ sub_modules: [{ words: [
      { id: 'reactor_word', name_human: 'carbonation reactor vessel', content_character: { character_id: 'stirred_reactor' }, modifier_characters: [] },
    ] }] }]
    const r = applyFamilySizing(modules, contract, 'novel_chemical_widget')
    expect(r.family).toBe('universal') // unmapped → union path
    expect(r.sized).toBe(1)
    const dim = modules[0].sub_modules[0].words[0].modifier_characters.find((m: any) => m.kind === 'dimension')
    expect(dim).toBeDefined()
    const { D, L } = parseCyl(dim.value)!
    expect(Math.abs(cylVol(D, L) - 4) / 4).toBeLessThan(0.02) // 4 m³ reactor, geometry consistent
  })

  it('an unseen class with NO matching contract params sizes nothing (never invents)', () => {
    const modules: any[] = [{ sub_modules: [{ words: [{ id: 'gizmo', name_human: 'flux capacitor', content_character: {}, modifier_characters: [] }] }] }]
    expect(applyFamilySizing(modules, { quantities: {} } as any, 'unknown_class').sized).toBe(0)
  })

  it('a registered battery class still uses the single battery family (prior behaviour preserved)', () => {
    const contract: any = { quantities: { cell_count: { value: 3920 }, cell_capacity_ah: { value: 280 } } }
    const modules: any[] = [{ sub_modules: [{ words: [
      { id: 'cell_word', name_human: 'LFP prismatic cell', content_character: { character_id: 'lfp_cell' }, modifier_characters: [] },
    ] }] }]
    const r = applyFamilySizing(modules, contract, 'bess')
    expect(r.family).toBe('battery')
    const qty = modules[0].sub_modules[0].words[0].modifier_characters.find((m: any) => m.kind === 'quantity')
    expect(qty.value).toBe('×3920')
  })
})
