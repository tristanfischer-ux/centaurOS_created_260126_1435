import { describe, it, expect } from 'vitest'
import { getRequiredFields, getRecommendedFields } from './product-classifier'

describe('getRequiredFields', () => {
  it('returns only product_type for unknown class', () => {
    expect(getRequiredFields('unknown')).toEqual(['product_type'])
  })

  it('returns only product_type for a class not in the specific map', () => {
    expect(getRequiredFields('robotics')).toEqual(['product_type'])
  })

  it('returns full list (common + specific) for thermal_system', () => {
    const fields = getRequiredFields('thermal_system')
    expect(fields).toContain('product_type')
    expect(fields).toContain('target_cost')
    expect(fields).toContain('production_volume')
    expect(fields).toContain('jurisdiction')
    expect(fields).toContain('thermal_capacity_kw')
    expect(fields).toContain('cop_target')
    expect(fields).toContain('refrigerant_type')
    expect(fields).toContain('acoustic_target_dba')
    expect(fields).toContain('architecture_type')
  })

  it('returns full list (common + specific) for energy_storage', () => {
    const fields = getRequiredFields('energy_storage')
    expect(fields).toContain('product_type')
    expect(fields).toContain('energy_kwh')
    expect(fields).toContain('power_kw')
    expect(fields).toContain('voltage')
    expect(fields).toContain('chemistry')
    expect(fields).toContain('cycle_life')
  })

  it('returns full list for every known class in the specific map', () => {
    const knownClasses = [
      'thermal_system',
      'energy_storage',
      'vertical_farm',
      'aerospace',
      'vehicle',
      'consumer_electronics',
      'medical_device',
      'fluid_processing',
    ]
    for (const cls of knownClasses) {
      const fields = getRequiredFields(cls)
      expect(fields.length).toBeGreaterThanOrEqual(5)
      expect(fields).toContain('product_type')
    }
  })
})

describe('getRecommendedFields', () => {
  it('returns cost, volume, jurisdiction, max_mass for unknown', () => {
    expect(getRecommendedFields('unknown')).toEqual([
      'target_cost',
      'production_volume',
      'jurisdiction',
      'max_mass',
    ])
  })

  it('returns same as unknown for a class not in the specific map', () => {
    expect(getRecommendedFields('robotics')).toEqual([
      'target_cost',
      'production_volume',
      'jurisdiction',
      'max_mass',
    ])
  })

  it('does NOT duplicate fields already in required for energy_storage', () => {
    const required = getRequiredFields('energy_storage')
    const recommended = getRecommendedFields('energy_storage')
    for (const field of recommended) {
      expect(required).not.toContain(field)
    }
  })

  it('does NOT duplicate fields already in required for thermal_system', () => {
    const required = getRequiredFields('thermal_system')
    const recommended = getRecommendedFields('thermal_system')
    for (const field of recommended) {
      expect(required).not.toContain(field)
    }
  })

  it('includes max_mass for known classes', () => {
    expect(getRecommendedFields('energy_storage')).toContain('max_mass')
    expect(getRecommendedFields('thermal_system')).toContain('max_mass')
  })
})
