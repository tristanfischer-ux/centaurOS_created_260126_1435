/**
 * @file Manufacturer-backed local PCB symbol mappings.
 * @description Curates exact pin names/numbers only when an authoritative
 * manufacturer datasheet identifies both the ordering-code package and pinout.
 */

import { resolve } from 'node:path'

import { resolveKicadFootprint } from './pcb-kicad-library'

import type {
  PcbFootprintSpec,
  PcbPinSpec,
} from './pcb-component-resolution'
import type { KicadFootprintRef } from './pcb-kicad-library'

interface CuratedManufacturerSymbol {
  manufacturer: string
  partNumber: string
  symbolId: string
  footprint: KicadFootprintRef
  pins: readonly PcbPinSpec[]
  provenance: string
}

const CURATED_FOOTPRINTS_ROOT = resolve(__dirname, 'footprints')

export interface VerifiedCuratedManufacturerIdentity {
  status: 'verified'
  symbolId: string
  pins: PcbPinSpec[]
  footprint: PcbFootprintSpec
  provenance: string
}

export interface UnsupportedCuratedManufacturerIdentity {
  status: 'unsupported'
  reason: string
}

export type CuratedManufacturerIdentity =
  | VerifiedCuratedManufacturerIdentity
  | UnsupportedCuratedManufacturerIdentity

const CURATED_MANUFACTURER_SYMBOLS: readonly CuratedManufacturerSymbol[] = [
  {
    manufacturer: 'Slkor',
    partNumber: 'BAS70-04',
    symbolId: 'Forge_Manufacturer:BAS70-04',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23' },
    pins: [
      { number: '1', name: 'A1', kind: 'passive' },
      { number: '2', name: 'K2', kind: 'passive' },
      { number: '3', name: 'K1/A2', kind: 'passive' },
    ],
    provenance: 'Slkor BAS70-04 manufacturer data distributed as LCSC C609810: dual series Schottky in SOT-23, pins 1=A1, 2=K2, 3=K1/A2; frozen Rodeostat D1/D2 identify BAS70-04, C609810 and Package_TO_SOT_SMD:SOT-23 at revision 86e4708fea84f8fc33bcbfc9a706b06f4b770efd; https://www.lcsc.com/product-detail/C609810.html',
  },
  {
    manufacturer: 'Panasonic Industry',
    partNumber: 'EEVFK1E102Q',
    symbolId: 'Forge_Manufacturer:EEVFK1E102Q',
    footprint: {
      library: 'Forge_Manufacturer',
      footprint: 'Panasonic_EEVFK1E102Q',
    },
    pins: [
      { number: '1', name: '+', kind: 'passive' },
      { number: '2', name: '-', kind: 'passive' },
    ],
    provenance: 'Panasonic EEVFK1E102Q product record: polar two-terminal 1000 uF 25 V SMD can, 12.5 x 13.5 mm; frozen NinjaPCR CAP_SMD_AL_D125 establishes the matching land geometry; https://industrial.panasonic.com/ww/products/pt/aluminum-cap-smd/models/EEVFK1E102Q',
  },
  {
    manufacturer: 'Panasonic Industry',
    partNumber: 'ACTP212',
    symbolId: 'Forge_Manufacturer:ACTP212',
    footprint: { library: 'Forge_Manufacturer', footprint: 'Panasonic_ACTP212' },
    pins: [
      { number: '1', name: 'COM1', kind: 'passive' },
      { number: '2', name: 'COM2', kind: 'passive' },
      { number: '3', name: 'NC1+NC2', kind: 'passive' },
      { number: '4', name: 'NO1+NO2', kind: 'passive' },
      { number: '5', name: 'COIL1+', kind: 'passive' },
      { number: '6', name: 'COIL1-', kind: 'passive' },
      { number: '7', name: 'COIL2+', kind: 'passive' },
      { number: '8', name: 'COIL2-', kind: 'passive' },
    ],
    provenance: 'Panasonic CT Relay Power Type ASCTB229E bottom-view eight-pin drawing plus frozen NinjaPCR v2.3 ACTP212 symbol/net map: 1/2 switched-load commons, 3/4 shared NC/NO feeds, 5/6 and 7/8 coils; https://www.industrypanasonic.com/datasheet/industrypanasonic/ACTP512.pdf',
  },
  {
    manufacturer: 'Infineon Technologies',
    partNumber: 'IRLB3813PBF',
    symbolId: 'Forge_Manufacturer:IRLB3813PBF',
    footprint: { library: 'Package_TO_SOT_THT', footprint: 'TO-220-3_Vertical' },
    pins: [
      { number: '1', name: 'G', kind: 'input' },
      { number: '2', name: 'D', kind: 'passive' },
      { number: '3', name: 'S', kind: 'passive' },
    ],
    provenance: 'Infineon IRLB3813PbF data sheet TO-220AB lead assignment: 1=Gate, 2=Drain, 3=Source, tab=Drain; https://www.infineon.com/assets/row/public/documents/24/49/infineon-irlb3813-datasheet-en.pdf',
  },
  {
    manufacturer: 'Jiangsu Changjing Electronics Technology',
    partNumber: 'CJT1117B-3.3-G',
    symbolId: 'Forge_Manufacturer:CJT1117B-3.3-G',
    footprint: {
      library: 'Package_TO_SOT_SMD',
      footprint: 'SOT-223-3_TabPin2',
    },
    pins: [
      { number: '1', name: 'GND', kind: 'power_in' },
      { number: '2', name: 'OUTPUT', kind: 'power_out' },
      { number: '3', name: 'INPUT', kind: 'power_in' },
    ],
    provenance: 'JSCJ CJT1117B manufacturer data: SOT-223 pin 1=ADJ/GND, 2=OUTPUT and tab, 3=INPUT; fixed 3.3 V ordering code CJT1117B-3.3-G distributed as LCSC C164899; https://www.jscj-elec.com/gallery/file/CJT1117B-XXX%20SOT-223%20V1.pdf',
  },
  {
    manufacturer: 'Microchip Technology',
    partNumber: 'MCP1700T-3302E/TT',
    symbolId: 'Forge_Manufacturer:MCP1700T-3302E-TT',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23' },
    pins: [
      { number: '1', name: 'GND', kind: 'power_in' },
      { number: '2', name: 'VOUT', kind: 'power_out' },
      { number: '3', name: 'VIN', kind: 'power_in' },
    ],
    provenance: 'Microchip MCP1700 Data Sheet DS20001826F, Table 3-1: TT ordering code is 3-lead SOT-23; pins 1=GND, 2=VOUT, 3=VIN; https://ww1.microchip.com/downloads/en/DeviceDoc/MCP1700-Data-Sheet-20001826F.pdf',
  },
  {
    manufacturer: 'Nuvoton Technology Corporation',
    partNumber: 'NAU7802SGI',
    symbolId: 'Forge_Manufacturer:NAU7802SGI',
    footprint: { library: 'Package_SO', footprint: 'SOIC-16_3.9x9.9mm_P1.27mm' },
    pins: [
      { number: '1', name: 'REFP', kind: 'input' },
      { number: '2', name: 'VIN1N', kind: 'input' },
      { number: '3', name: 'VIN1P', kind: 'input' },
      { number: '4', name: 'VIN2N', kind: 'input' },
      { number: '5', name: 'VIN2P', kind: 'input' },
      { number: '6', name: 'VBG', kind: 'output' },
      { number: '7', name: 'REFN', kind: 'input' },
      { number: '8', name: 'AVSS', kind: 'power_in' },
      { number: '9', name: 'DVSS', kind: 'power_in' },
      { number: '10', name: 'XIN', kind: 'input' },
      { number: '11', name: 'XOUT', kind: 'output' },
      { number: '12', name: 'DRDY', kind: 'output' },
      { number: '13', name: 'SCLK', kind: 'input' },
      { number: '14', name: 'SDIO', kind: 'bidirectional' },
      { number: '15', name: 'DVDD', kind: 'power_in' },
      { number: '16', name: 'AVDD/LDO', kind: 'power_in' },
    ],
    provenance: 'Nuvoton NAU7802 Data Sheet Rev2.6, SOP-16 pin configuration and pin-description table; NAU7802SGI product page specifies SOP-16; https://www.nuvoton.com/export/resource-files/en-us--DS_NAU7802_DataSheet_EN_Rev2.6.pdf',
  },
  {
    manufacturer: 'Texas Instruments',
    partNumber: 'OPA334AIDBVR',
    symbolId: 'Forge_Manufacturer:OPA334AIDBVR',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23-6' },
    pins: [
      { number: '1', name: 'OUT', kind: 'output' },
      { number: '2', name: 'V-', kind: 'power_in' },
      { number: '3', name: '+IN', kind: 'input' },
      { number: '4', name: '-IN', kind: 'input' },
      { number: '5', name: 'ENABLE', kind: 'input' },
      { number: '6', name: 'V+', kind: 'power_in' },
    ],
    provenance: 'Texas Instruments OPA334 Data Sheet SBOS213D: OPA334AIDBVR is shutdown version in 6-pin SOT-23 DBV; pins 1=OUT, 2=V-, 3=+IN, 4=-IN, 5=ENABLE, 6=V+; https://www.ti.com/lit/ds/symlink/opa334.pdf',
  },
] as const

function normalized(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * @description Reports whether an exact manufacturer/MPN pair has a curated
 * local pinout whose provenance is owned by this module.
 * @param manufacturer Manufacturer attached to the exact ordering code.
 * @param partNumber Exact manufacturer ordering code.
 * @returns True only for an exact curated manufacturer identity.
 */
export function hasCuratedManufacturerPinout(
  manufacturer: string,
  partNumber: string,
): boolean {
  return CURATED_MANUFACTURER_SYMBOLS.some((candidate) =>
    normalized(candidate.manufacturer) === normalized(manufacturer)
    && normalized(candidate.partNumber) === normalized(partNumber))
}

/**
 * @description Resolves an exact local manufacturer pinout and proves its
 * electrical-pin count against the selected local KiCad footprint.
 * @param manufacturer Manufacturer attached to the exact ordering code.
 * @param partNumber Exact manufacturer ordering code.
 * @param footprintsRoot Local KiCad footprint-library root.
 * @returns Verified symbol/footprint identity or an explicit unsupported reason.
 */
export function resolveCuratedManufacturerIdentity(
  manufacturer: string,
  partNumber: string,
  footprintsRoot: string,
): CuratedManufacturerIdentity {
  // INTENT: Local curation removes dependency on optional upstream KiCad
  // symbols without permitting a plausible-looking pinout to become evidence.
  if (normalized(partNumber) === normalized('4-2489541-7')) {
    return {
      status: 'unsupported',
      reason: '4-2489541-7 is evidenced only as a 110 V DC panel indicator; no authoritative PCB package and terminal pin geometry were found',
    }
  }
  const symbol = CURATED_MANUFACTURER_SYMBOLS.find((candidate) =>
    normalized(candidate.partNumber) === normalized(partNumber))
  if (!symbol) {
    return {
      status: 'unsupported',
      reason: `${partNumber} has no curated manufacturer pinout`,
    }
  }
  if (normalized(symbol.manufacturer) !== normalized(manufacturer)) {
    return {
      status: 'unsupported',
      reason: `${partNumber} manufacturer ${manufacturer} does not match curated ${symbol.manufacturer} evidence`,
    }
  }
  const footprint = resolveKicadFootprint(footprintsRoot, symbol.footprint)
    ?? resolveKicadFootprint(CURATED_FOOTPRINTS_ROOT, symbol.footprint)
  if (!footprint) {
    return {
      status: 'unsupported',
      reason: `${partNumber} exact footprint ${symbol.footprint.library}:${symbol.footprint.footprint} is unavailable`,
    }
  }
  if (symbol.pins.length !== footprint.electricalPadCount) {
    return {
      status: 'unsupported',
      reason: `${partNumber} manufacturer pinout has ${symbol.pins.length} pins but ${symbol.footprint.library}:${symbol.footprint.footprint} has ${footprint.electricalPadCount} electrical pads`,
    }
  }
  return {
    status: 'verified',
    symbolId: symbol.symbolId,
    pins: [...symbol.pins],
    footprint,
    provenance: symbol.provenance,
  }
}
