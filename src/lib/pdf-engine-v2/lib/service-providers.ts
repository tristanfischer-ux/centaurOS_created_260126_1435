export interface ServiceProvider {
  name: string
  serviceType: 'ul_testing' | 'emc_testing' | 'medical_certification' | 'maritime_classification' | 'grid_connection' | 'aviation_certification' | 'ce_marking' | 'transport_testing' | 'biocompatibility' | 'pressure_testing' | 'acoustic_testing' | 'environmental_testing'
  location: string
  website: string
  typicalCostRangeGbp: { min: number; max: number }
  typicalDurationWeeks: { min: number; max: number }
  certifications: string[] // what they can certify/test
  notes?: string
}

const SERVICE_PROVIDERS: ServiceProvider[] = [
  // UL / Safety testing
  { name: 'Intertek', serviceType: 'ul_testing', location: 'Leatherhead, Surrey', website: 'https://www.intertek.com', typicalCostRangeGbp: { min: 10000, max: 50000 }, typicalDurationWeeks: { min: 6, max: 16 }, certifications: ['UL 9540A', 'UL 1973', 'IEC 62619', 'IEC 60335'] },
  { name: 'TÜV SÜD UK', serviceType: 'ul_testing', location: 'Manchester', website: 'https://www.tuvsud.com', typicalCostRangeGbp: { min: 15000, max: 80000 }, typicalDurationWeeks: { min: 8, max: 20 }, certifications: ['IEC 62619', 'UN 38.3', 'EN 61439'] },
  { name: 'Element Materials Technology', serviceType: 'ul_testing', location: 'Wednesbury, West Midlands', website: 'https://www.element.com', typicalCostRangeGbp: { min: 8000, max: 40000 }, typicalDurationWeeks: { min: 4, max: 12 }, certifications: ['UL 9540A', 'UN 38.3', 'thermal runaway'] },
  
  // EMC testing
  { name: 'York EMC Services', serviceType: 'emc_testing', location: 'York', website: 'https://www.yorkemc.com', typicalCostRangeGbp: { min: 2000, max: 8000 }, typicalDurationWeeks: { min: 2, max: 4 }, certifications: ['EN 55032', 'EN 61000', 'EN 55035'] },
  { name: 'Eurofins E&E UK', serviceType: 'emc_testing', location: 'Hawarden, Flintshire', website: 'https://www.eurofins.com', typicalCostRangeGbp: { min: 3000, max: 10000 }, typicalDurationWeeks: { min: 2, max: 6 }, certifications: ['EMC Directive 2014/30', 'Radio Equipment Directive 2014/53'] },
  
  // Medical device certification
  { name: 'BSI', serviceType: 'medical_certification', location: 'Milton Keynes', website: 'https://www.bsigroup.com', typicalCostRangeGbp: { min: 50000, max: 150000 }, typicalDurationWeeks: { min: 12, max: 24 }, certifications: ['MDR 2017/745', 'ISO 13485', 'UKCA medical'] },
  { name: 'DEKRA Certification', serviceType: 'medical_certification', location: 'Hemel Hempstead', website: 'https://www.dekra.com', typicalCostRangeGbp: { min: 40000, max: 120000 }, typicalDurationWeeks: { min: 10, max: 20 }, certifications: ['MDR 2017/745', 'ISO 13485'] },
  
  // Maritime classification
  { name: 'Lloyd\'s Register', serviceType: 'maritime_classification', location: 'London', website: 'https://www.lr.org', typicalCostRangeGbp: { min: 20000, max: 50000 }, typicalDurationWeeks: { min: 8, max: 16 }, certifications: ['ShipRight UWT', 'autonomous vessels'] },
  { name: 'DNV UK', serviceType: 'maritime_classification', location: 'London', website: 'https://www.dnv.com', typicalCostRangeGbp: { min: 25000, max: 60000 }, typicalDurationWeeks: { min: 10, max: 18 }, certifications: ['DNV-RU-NAVAL', 'maritime autonomous'] },
  
  // Grid connection
  { name: 'ENA Energy Networks Association', serviceType: 'grid_connection', location: 'London', website: 'https://www.energynetworks.org', typicalCostRangeGbp: { min: 5000, max: 15000 }, typicalDurationWeeks: { min: 4, max: 8 }, certifications: ['G99', 'G100'] },
  
  // CE/UKCA marking
  { name: 'SGS United Kingdom', serviceType: 'ce_marking', location: 'Sunderland', website: 'https://www.sgs.com', typicalCostRangeGbp: { min: 5000, max: 20000 }, typicalDurationWeeks: { min: 4, max: 10 }, certifications: ['CE marking', 'UKCA marking', 'Low Voltage Directive'] },
  
  // Transport testing
  { name: 'TÜV Rheinland UK', serviceType: 'transport_testing', location: 'Birmingham', website: 'https://www.tuv.com', typicalCostRangeGbp: { min: 5000, max: 15000 }, typicalDurationWeeks: { min: 4, max: 6 }, certifications: ['UN 38.3', 'IATA DGR', 'ADR'] },
  
  // Biocompatibility
  { name: 'NAMSA UK', serviceType: 'biocompatibility', location: 'Cardiff', website: 'https://www.namsa.com', typicalCostRangeGbp: { min: 10000, max: 30000 }, typicalDurationWeeks: { min: 6, max: 12 }, certifications: ['ISO 10993', 'biocompatibility testing'] },
  
  // Pressure testing
  { name: 'SIRI Inspection Services', serviceType: 'pressure_testing', location: 'Sheffield', website: 'https://www.siri.co.uk', typicalCostRangeGbp: { min: 3000, max: 12000 }, typicalDurationWeeks: { min: 2, max: 6 }, certifications: ['PED 2014/68/EU', 'pressure vessel'] },
  
  // Aviation certification
  { name: 'CAA UK', serviceType: 'aviation_certification', location: 'London', website: 'https://www.caa.co.uk', typicalCostRangeGbp: { min: 50000, max: 200000 }, typicalDurationWeeks: { min: 12, max: 32 }, certifications: ['CAP 722', 'EASA SC-HAPS', 'drone certification'] },
]

export function findProvidersByService(serviceType: string): ServiceProvider[] {
  return SERVICE_PROVIDERS.filter(p => p.serviceType === serviceType)
}

export function findProvidersByCertification(certCode: string): ServiceProvider[] {
  const codeLower = certCode.toLowerCase()
  return SERVICE_PROVIDERS.filter(p => 
    p.certifications.some(c => c.toLowerCase().includes(codeLower))
  )
}

export function getProviderSummary(serviceType: string): { count: number; minCost: number; maxCost: number; minWeeks: number; maxWeeks: number } {
  const providers = findProvidersByService(serviceType)
  
  if (providers.length === 0) {
    return { count: 0, minCost: 0, maxCost: 0, minWeeks: 0, maxWeeks: 0 }
  }
  
  return {
    count: providers.length,
    minCost: Math.min(...providers.map(p => p.typicalCostRangeGbp.min)),
    maxCost: Math.max(...providers.map(p => p.typicalCostRangeGbp.max)),
    minWeeks: Math.min(...providers.map(p => p.typicalDurationWeeks.min)),
    maxWeeks: Math.max(...providers.map(p => p.typicalDurationWeeks.max)),
  }
}

export const _SERVICE_PROVIDERS = SERVICE_PROVIDERS // for testing