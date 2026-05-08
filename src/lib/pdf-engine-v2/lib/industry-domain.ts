/**
 * @file industry-domain.ts — productClass → industryDomain mapping
 *
 * BLOCKER-1 fix (Phase B council): The PA path's dual-write to `state.research`
 * previously omitted `industryDomain`. Five downstream sites in index.ts use
 * `options?.domain || state.research.industryDomain` for domain-specific routing
 * and validation. On the PA path, with no `options.domain` override, all five
 * were receiving `undefined`.
 *
 * This helper maps the deterministic productClass from the product-classifier
 * to the `industryDomain` vocabulary used by the legacy `runResearch()` and by
 * the downstream validation sites. Extracted to a separate file so tests can
 * import it without pulling in the full index.ts → 7-pdf.tsx → @react-pdf chain.
 *
 * industryDomain vocabulary (from RESEARCH_SYNTHESIS_SYSTEM prompt schema):
 *   battery_energy_storage | heat_pump | vertical_farm | aerospace |
 *   medical_device | consumer_electronics | industrial_machine |
 *   fluid_processing | generic
 */
export function mapProductClassToIndustryDomain(productClass: string): string {
  switch (productClass) {
    case 'energy_storage':        return 'battery_energy_storage'
    case 'thermal_system':        return 'heat_pump'
    case 'vertical_farm':         return 'vertical_farm'
    case 'aerospace':
    case 'haps':
    case 'auv':
    case 'drone':                 return 'aerospace'
    case 'medical_device':
    case 'wearable_medical':      return 'medical_device'
    case 'consumer_electronics':
    case 'pcb_assembly':
    case 'edge_ai_server':        return 'consumer_electronics'
    case 'industrial_machine':
    case 'bioreactor':
    case 'ev_charger':
    case 'robotics':
    case 'vehicle':               return 'industrial_machine'
    case 'fluid_processing':      return 'fluid_processing'
    default:                      return 'generic'
  }
}
