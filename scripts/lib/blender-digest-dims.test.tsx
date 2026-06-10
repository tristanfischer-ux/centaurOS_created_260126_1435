// Jest guard for Phase-5 geometry-from-calc → Blender digest link (npm test / pre-push).
import { isGeometryDimension, pickGeometryDim } from './blender-digest-dims'

describe('Phase 5 — isGeometryDimension keeps real geometry, drops scalar specs', () => {
  it('plural "dimensions" is always geometry (the registered-class 3-axis bbox)', () => {
    expect(isGeometryDimension('dimensions', '2000×600×2200', '')).toBe(true)
    expect(isGeometryDimension('dimensions', '1.50 m x 1.00 m per wing', '')).toBe(true)
    expect(isGeometryDimension('dimensions', '1.60 m deployed length', '')).toBe(true)
  })
  it('singular "dimension" is geometry ONLY when it shows a geometric signature', () => {
    // every Phase-3 sizing output (all singular) must pass:
    expect(isGeometryDimension('dimension', 'Ø450 × 1350 mm (cylinder, L/D 3, sized from 0.214 m³)', '')).toBe(true)
    expect(isGeometryDimension('dimension', 'Ø206 mm impeller (ψ 0.5, 2900 rpm, tip 31 m/s)', '')).toBe(true)
    expect(isGeometryDimension('dimension', 'DN80 bore (2 m/s design velocity)', '')).toBe(true)
    expect(isGeometryDimension('dimension', '500 × 500 mm panel (terrestrial, sized from 8 kW)', '')).toBe(true)
    expect(isGeometryDimension('dimension', '2.7', 'm aperture')).toBe(true)
    expect(isGeometryDimension('dimension', '5', 'm deployed')).toBe(true)
    expect(isGeometryDimension('dimension', '40×80', 'mm')).toBe(true) // mixed-class singular geometry
    expect(isGeometryDimension('dimension', '120', 'm')).toBe(true) // bare-metre length (tower section)
  })
  it('singular "dimension" carrying a SCALAR SPEC is NOT geometry (the overload)', () => {
    expect(isGeometryDimension('dimension', '3.2', 'V')).toBe(false)
    expect(isGeometryDimension('dimension', '22', 'AWG')).toBe(false)
    expect(isGeometryDimension('dimension', '0.5-1.0', 'mm²')).toBe(false)
    expect(isGeometryDimension('dimension', '50', 'µH')).toBe(false)
    expect(isGeometryDimension('dimension', '1000', 'V')).toBe(false)
    expect(isGeometryDimension('dimension', '3.5', 'kN preload')).toBe(false)
    expect(isGeometryDimension('dimension', '120 kg/m³ ratio', '')).toBe(false) // a ratio, not a length
  })
  it('non-dimension kinds are never geometry', () => {
    expect(isGeometryDimension('quantity', '×3750', '')).toBe(false)
    expect(isGeometryDimension('performance', '5', 's Isp')).toBe(false)
    expect(isGeometryDimension('rating_primary', '400', 'kW continuous')).toBe(false)
  })
})

describe('Phase 5 — pickGeometryDim prefers the true bbox, falls back to sized singular', () => {
  it('prefers plural "dimensions" over a singular scalar on the same word', () => {
    const mods = [
      { kind: 'quantity', value: '×3750' },
      { kind: 'dimension', value: '3.2', unit: 'V' }, // scalar — must be ignored
      { kind: 'dimensions', value: '2000×600×2200', unit: 'mm' }, // the real bbox
    ]
    expect(pickGeometryDim(mods)).toBe('2000×600×2200 mm')
  })
  it('falls back to a GEOMETRIC singular when no plural exists (the Phase-3 generic path)', () => {
    const mods = [
      { kind: 'capacity', value: '0.214', unit: 'm³ working volume' },
      { kind: 'dimension', value: 'Ø450 × 1350 mm (cylinder, L/D 3, sized from 0.214 m³)' },
    ]
    expect(pickGeometryDim(mods)).toMatch(/^Ø450 × 1350 mm/)
  })
  it('appends the unit only when not already embedded in the value', () => {
    expect(pickGeometryDim([{ kind: 'dimension', value: '2.7', unit: 'm aperture' }])).toBe('2.7 m aperture')
    expect(pickGeometryDim([{ kind: 'dimensions', value: '40×80 mm', unit: 'mm' }])).toBe('40×80 mm') // unit already present
  })
  it('returns null when the word has no geometry (only scalar specs)', () => {
    expect(pickGeometryDim([
      { kind: 'dimension', value: '3.2', unit: 'V' },
      { kind: 'rating_primary', value: '280', unit: 'Ah' },
    ])).toBeNull()
    expect(pickGeometryDim([])).toBeNull()
    expect(pickGeometryDim(undefined)).toBeNull()
  })
})
