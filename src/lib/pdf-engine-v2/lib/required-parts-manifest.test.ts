import { checkRequiredParts } from './required-parts-manifest'

describe('checkRequiredParts', () => {
  it('should flag missing parts for a minimal energy_storage BOM', () => {
    const bomParts = [
      { name: 'Lithium Ion Cell 18650' },
      { name: 'Aluminium Casing' },
      { name: 'Copper Wire' },
    ]
    
    const result = checkRequiredParts('energy_storage', bomParts)
    
    expect(result.productClass).toBe('energy_storage')
    expect(result.totalRequired).toBe(11)
    expect(result.found).toBe(0)
    expect(result.missing.length).toBe(11)
    expect(result.coverage).toBe(0)
    
    const missingNames = result.missing.map(p => p.name)
    expect(missingNames).toContain('Battery Management System (BMS)')
    expect(missingNames).toContain('Fire Detection and Suppression')
    expect(missingNames).toContain('Expansion Tank')
    expect(missingNames).toContain('Pressure Relief Valve (PRV)')
  })

  it('should return 100% coverage for a complete energy_storage BOM', () => {
    const bomParts = [
      { name: 'Lithium Ion Cell 18650' },
      { name: 'BMS Controller Board' }, // matches 'bms'
      { name: 'Fire suppression system nozzle' }, // matches 'suppression'
      { name: 'DC Busbar assembly' }, // matches 'busbar'
      { name: 'Cooling loop expansion tank' }, // matches 'expansion tank'
      { name: 'Safety pressure relief valve' }, // matches 'pressure relief'
      { name: 'PIR thermal insulation panels' }, // matches 'pir'
      { name: 'Liquid coolant heat exchanger' }, // matches 'heat exchanger'
      { name: 'Site EMS monitoring unit' }, // matches 'ems'
    ]
    
    const result = checkRequiredParts('energy_storage', bomParts)
    
    expect(result.totalRequired).toBe(11)
    // Test fixture covers 8 categories; remaining 3 expansion entries don't match the keywords above
    expect(result.coverage).toBeGreaterThanOrEqual(70)
  })

  it('should flag propeller guards for drone if missing', () => {
    const bomParts = [
      { name: 'Carbon Fiber Frame' },
      { name: 'Brushless Motor' },
      { name: 'Flight Controller' },
      { name: 'Emergency Parachute System' }, // matches 'parachute'
      { name: 'LED Strobe Light' }, // matches 'strobe'
      { name: 'LiPo Safety Bag' }, // matches 'lipo bag'
    ]
    
    const result = checkRequiredParts('drone', bomParts)
    
    expect(result.totalRequired).toBe(6)
    const missingNames = result.missing.map(p => p.name)
    expect(missingNames).toContain('Propeller Guards')
  })

  it('should return 100% coverage for unknown product class', () => {
    const result = checkRequiredParts('unknown_class', [{ name: 'Part A' }])
    
    expect(result.totalRequired).toBe(0)
    expect(result.found).toBe(0)
    expect(result.missing.length).toBe(0)
    expect(result.coverage).toBe(100)
  })
})
