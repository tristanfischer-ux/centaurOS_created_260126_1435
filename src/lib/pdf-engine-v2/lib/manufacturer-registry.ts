export interface ManufacturerEntry {
  name: string
  aliases: string[] // common abbreviations
  productType: string // e.g. 'battery cells', 'compressors', 'inverters'
  ukResellers: Array<{ name: string; website: string }>
}

export const MANUFACTURERS: ManufacturerEntry[] = [
  { name: 'CATL', aliases: ['catl'], productType: 'battery cells', ukResellers: [{ name: 'Shenzhen Luyuan Technology', website: 'https://www.lytepower.com' }, { name: 'Trina Storage', website: 'https://www.trinasolar.com' }] },
  { name: 'Sungrow', aliases: ['sungrow'], productType: 'inverters', ukResellers: [{ name: 'SegenSolar', website: 'https://www.segensolar.co.uk' }, { name: 'Viridian Solar', website: 'https://www.viridiansolar.co.uk' }] },
  { name: 'Copeland', aliases: ['copeland', 'emerson'], productType: 'compressors', ukResellers: [{ name: 'Bitzer UK', website: 'https://www.bitzer.de' }, { name: 'AWECO', website: 'https://www.aweco.co.uk' }] },
  { name: 'Schneider Electric', aliases: ['schneider'], productType: 'switchgear', ukResellers: [{ name: 'Schneider Electric UK', website: 'https://www.se.com/uk' }] },
  { name: 'Siemens', aliases: ['siemens'], productType: 'automation', ukResellers: [{ name: 'Siemens UK', website: 'https://www.siemens.co.uk' }] },
  { name: 'Danfoss', aliases: ['danfoss'], productType: 'refrigeration', ukResellers: [{ name: 'Danfoss UK', website: 'https://www.danfoss.com' }] },
  { name: 'ABB', aliases: ['abb'], productType: 'motors', ukResellers: [{ name: 'ABB UK', website: 'https://new.abb.com/uk' }] },
  { name: 'BYD', aliases: ['byd'], productType: 'battery modules', ukResellers: [{ name: 'BYD UK', website: 'https://www.byd.com/uk' }] },
  { name: 'LG Energy Solution', aliases: ['lg chem', 'lg energy'], productType: 'battery cells', ukResellers: [{ name: 'LG Energy Solution UK', website: 'https://www.lgensol.com' }] },
  { name: 'Samsung SDI', aliases: ['samsung sdi'], productType: 'battery cells', ukResellers: [{ name: 'Samsung SDI Europe', website: 'https://www.samsungsdi.com' }] },
  { name: 'Panasonic', aliases: ['panasonic'], productType: 'battery cells', ukResellers: [{ name: 'Panasonic Industry Europe', website: 'https://industry.panasonic.eu' }] },
  { name: 'Mitsubishi Electric', aliases: ['mitsubishi'], productType: 'heat pumps', ukResellers: [{ name: 'Mitsubishi Electric UK', website: 'https://les.mitsubishielectric.co.uk' }] },
  { name: 'Daikin', aliases: ['daikin'], productType: 'heat pumps', ukResellers: [{ name: 'Daikin UK', website: 'https://www.daikin.co.uk' }] },
  { name: 'Vaillant', aliases: ['vaillant'], productType: 'heat pumps', ukResellers: [{ name: 'Vaillant UK', website: 'https://www.vaillant.co.uk' }] },
  { name: 'Bosch', aliases: ['bosch'], productType: 'heat pumps', ukResellers: [{ name: 'Bosch Thermotechnology UK', website: 'https://www.bosch-thermotechnology.com' }] },
  { name: 'CATL', aliases: ['catl'], productType: 'battery cells', ukResellers: [{ name: 'Contemporary Amperex Technology UK', website: 'https://www.catl.com' }] },
  { name: 'SMA Solar', aliases: ['sma'], productType: 'inverters', ukResellers: [{ name: 'SMA Solar Technology UK', website: 'https://www.sma.de/uk' }] },
  { name: 'Fronius', aliases: ['fronius'], productType: 'inverters', ukResellers: [{ name: 'Fronius UK', website: 'https://www.fronius.com/uk' }] },
  { name: 'Victron Energy', aliases: ['victron'], productType: 'power electronics', ukResellers: [{ name: 'Victron Energy UK', website: 'https://www.victronenergy.com' }] },
  { name: 'Murata', aliases: ['murata'], productType: 'passive components', ukResellers: [{ name: 'Murata Electronics UK', website: 'https://www.murata.com' }] },
  { name: 'Texas Instruments', aliases: ['ti', 'texas instruments'], productType: 'semiconductors', ukResellers: [{ name: 'Farnell', website: 'https://www.farnell.com' }, { name: 'Mouser', website: 'https://www.mouser.co.uk' }] },
  { name: 'STMicroelectronics', aliases: ['stm', 'stmicro'], productType: 'microcontrollers', ukResellers: [{ name: 'Farnell', website: 'https://www.farnell.com' }, { name: 'Mouser', website: 'https://www.mouser.co.uk' }] },
  { name: 'Infineon', aliases: ['infineon'], productType: 'power semiconductors', ukResellers: [{ name: 'Farnell', website: 'https://www.farnell.com' }, { name: 'Mouser', website: 'https://www.mouser.co.uk' }] },
  { name: 'NXP', aliases: ['nxp'], productType: 'microcontrollers', ukResellers: [{ name: 'Farnell', website: 'https://www.farnell.com' }, { name: 'Mouser', website: 'https://www.mouser.co.uk' }] },
  { name: 'Analog Devices', aliases: ['adi', 'analog devices'], productType: 'analog ICs', ukResellers: [{ name: 'Farnell', website: 'https://www.farnell.com' }, { name: 'Mouser', website: 'https://www.mouser.co.uk' }] },
]

export function findManufacturer(query: string): ManufacturerEntry | null {
  const lowerQuery = query.toLowerCase().trim()
  return MANUFACTURERS.find(m => 
    m.name.toLowerCase() === lowerQuery || 
    m.aliases.some(alias => alias.toLowerCase() === lowerQuery)
  ) || null
}

export function getResellers(query: string): Array<{ manufacturer: string; reseller: string; website: string }> {
  const match = findManufacturer(query)
  if (!match) return []
  return match.ukResellers.map(r => ({
    manufacturer: match.name,
    reseller: r.name,
    website: r.website
  }))
}
