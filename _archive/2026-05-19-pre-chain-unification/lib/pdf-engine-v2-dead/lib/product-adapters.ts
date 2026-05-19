export interface ProductAdapter {
  name: string
  requiredFields: string[]
  calculatorModules: string[]
  standardsDomains: string[]
  componentCategories: string[]
}

export const ADAPTERS: Record<string, ProductAdapter> = {
  thermal_system: {
    name: 'Thermal System (Heat Pump / Chiller)',
    requiredFields: ['capacity_kw', 'cop_target', 'refrigerant_type', 'architecture_type'],
    calculatorModules: ['thermodynamic_cycle', 'refrigerant_charge', 'zone_sizing'],
    standardsDomains: ['refrigeration', 'electrical_safety', 'pressure_equipment'],
    componentCategories: ['compressors', 'heat_exchangers', 'fans', 'controls', 'valves'],
  },
  battery_storage: {
    name: 'Battery Energy Storage System',
    requiredFields: ['energy_kwh', 'power_kw', 'chemistry', 'voltage'],
    calculatorModules: ['thermal_runaway', 'grid_connection', 'fire_suppression'],
    standardsDomains: ['electrical_safety', 'fire', 'grid_connection', 'transport'],
    componentCategories: ['cells', 'bms', 'pcs', 'cooling', 'enclosure'],
  },
  drone: {
    name: 'Unmanned Aerial Vehicle',
    requiredFields: ['payload_kg', 'flight_time_min', 'range_km'],
    calculatorModules: ['thrust_vectors', 'battery_weight', 'cg_position'],
    standardsDomains: ['aviation', 'electrical_safety', 'battery_safety'],
    componentCategories: ['motors', 'propellers', 'batteries', 'controllers', 'sensors'],
  },
  vertical_farm: {
    name: 'Vertical Farming System',
    requiredFields: ['canopy_m2', 'crop_type', 'growth_cycles_per_year'],
    calculatorModules: ['lighting', 'irrigation', 'climate_control'],
    standardsDomains: ['food_safety', 'electrical', 'structural'],
    componentCategories: ['lighting', 'irrigation', 'climate', 'racking', 'controls'],
  },
  generic: {
    name: 'Generic Engineered Product',
    requiredFields: ['product_type', 'target_cost'],
    calculatorModules: [],
    standardsDomains: [],
    componentCategories: [],
  },
}

export function getAdapter(productClass: string): ProductAdapter {
  return ADAPTERS[productClass] || ADAPTERS.generic
}
