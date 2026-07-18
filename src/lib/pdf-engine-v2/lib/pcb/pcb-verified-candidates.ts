/**
 * @file Function-keyed verified PCB component candidates.
 * @description Converts frozen reference architecture evidence into reusable
 * role/package candidates, then requires DB-only cached identity confirmation.
 * Product names never participate in runtime selection.
 */

import type {
  DbCascadeResult,
  DbCascadeSource,
} from '../distributors/db-only-cascade'
import {
  resolveKicadFootprint,
  resolveKicadSymbol,
} from './pcb-kicad-library'
import { evaluatePcbComponentResolution } from './pcb-component-resolution'

import type {
  PcbComponentResolutionCandidate,
  PcbFootprintSpec,
  PcbPinSpec,
} from './pcb-component-resolution'

export interface VerifiedCandidateRequest {
  wordId: string
  nameHuman: string
  characterId: string
  functionClass: string | null
  requiredRatings?: {
    voltageV?: number
    currentA?: number
  }
}

export interface VerifiedCandidateFootprint {
  library: string
  footprint: string
}

export interface VerifiedFunctionCandidate {
  manufacturer: string
  partNumber: string
  compatibleFunctionClass: string
  footprint: VerifiedCandidateFootprint
  provenance: string
  roleCompatibility: string
  packageCompatibility: string
  cacheSource: DbCascadeSource
}

export interface VerifiedComponentIdentity extends VerifiedFunctionCandidate {
  symbolId: string
  pins: PcbPinSpec[]
  footprint: PcbFootprintSpec
  resolutionTier: 'mpn_symbol_footprint'
}

export interface UnresolvedComponentIdentity {
  status: 'unresolved'
  reason: string
}

export interface VerifiedIdentityLibraryRoots {
  symbolsRoot: string
  footprintsRoot: string
}

type CachedLookup = (manufacturer: string | null, mpn: string) => DbCascadeResult

interface CandidateRule {
  roleTest: RegExp
  excludedRoleTest?: RegExp
  functionClass: string
  manufacturer: string
  partNumber: string
  footprint: VerifiedCandidateFootprint
  symbol: {
    library: string
    symbol: string
  }
  ratings: {
    voltageV?: number
    currentA?: number
  }
  packageEvidence: string
  referenceEvidence: string
  pinoutEvidence?: string
}

const CANDIDATE_RULES: readonly CandidateRule[] = [
  {
    roleTest: /wi[_ -]?fi[_ -]?module|esp8266[_ -]?module/i,
    functionClass: 'connectivity_ic',
    manufacturer: 'Espressif Systems',
    partNumber: 'ESP-WROOM-02',
    footprint: { library: 'RF_Module', footprint: 'ESP-WROOM-02' },
    symbol: { library: 'RF_Module', symbol: 'ESP-WROOM-02' },
    ratings: { voltageV: 3.6, currentA: 0.5 },
    packageEvidence: 'Espressif ESP-WROOM-02: 18-pad 18 x 20 mm SMD Wi-Fi module with PCB antenna',
    referenceEvidence: 'NinjaPCR frozen schematic ESP2 exact ESP-WROOM-02 symbol and footprint, revision 181768d6ec068a6dd68593042167699285744768; Espressif ESP-WROOM-02 datasheet',
    pinoutEvidence: 'Espressif 18-pad pinout and antenna keepout; local KiCad RF_Module:ESP-WROOM-02 with RF_Module:ESP-WROOM-02',
  },
  {
    roleTest: /main[_ -]?controller|microcontroller|(^|[_ -])mcu($|[_ -])/i,
    functionClass: 'microcontroller',
    manufacturer: 'Microchip Technology',
    partNumber: 'ATSAMD21G18A-AU',
    footprint: { library: 'Package_QFP', footprint: 'TQFP-48_7x7mm_P0.5mm' },
    symbol: { library: 'MCU_Microchip_SAMD', symbol: 'ATSAMD21G18A-A' },
    ratings: { voltageV: 3.63 },
    packageEvidence: 'forge-truth cache: ATSAMD21G18A-AU, 48TQFP',
    referenceEvidence: 'OpenDrop frozen source manifest, revision 934a44db3ed41c24ae4dddb5b805a22e4166284b',
  },
  {
    roleTest: /photodiode[_ -]?(?:adc|converter)|optical[_ -]?(?:adc|measurement)/i,
    functionClass: 'sensor_ic',
    manufacturer: 'Texas Instruments',
    partNumber: 'ADS1114IDGSR',
    footprint: { library: 'Package_SO', footprint: 'TSSOP-10_3x3mm_P0.5mm' },
    symbol: { library: 'Analog_ADC', symbol: 'ADS1114IDGS' },
    ratings: { voltageV: 5.5 },
    packageEvidence: 'TI ADS1114IDGSR: 16-bit single-channel delta-sigma ADC in 10-pin VSSOP (DGS)',
    referenceEvidence: 'Pioreactor Eye-Spy frozen BOM U2 exact ADS1114IDGSR and schematic DGS package, revision ca40a91e728801b139b1086853f7cf74ce76def9; TI ADS111x datasheet SBAS444E',
    pinoutEvidence: 'TI DGS-10 pinout; local KiCad Analog_ADC:ADS1114IDGS with Package_SO:TSSOP-10_3x3mm_P0.5mm',
  },
  {
    roleTest: /analog[_ -]?to[_ -]?digital|(^|[_ -])adc($|[_ -])|thermal[_ -]?(?:adc|measurement)/i,
    functionClass: 'sensor_ic',
    manufacturer: 'Nuvoton Technology Corporation',
    partNumber: 'NAU7802SGI',
    footprint: { library: 'Package_SO', footprint: 'SOIC-16_3.9x9.9mm_P1.27mm' },
    symbol: { library: 'Sensor_Weight', symbol: 'NAU7802' },
    ratings: { voltageV: 5.5 },
    packageEvidence: 'forge-truth cache: NAU7802SGI, 24-bit ADC, 16-SOP',
    referenceEvidence: 'NinjaPCR frozen schematic, revision 181768d6ec068a6dd68593042167699285744768',
  },
  {
    roleTest: /dac[_ -]?(?:output|conditioning)|bipolar[_ -]?dac/i,
    functionClass: 'op_amp',
    manufacturer: 'Texas Instruments',
    partNumber: 'OP07CDR',
    footprint: { library: 'Package_SO', footprint: 'SOIC-8_3.9x4.9mm_P1.27mm' },
    symbol: { library: 'Amplifier_Operational', symbol: 'OP07' },
    ratings: { voltageV: 36 },
    packageEvidence: 'TI OP07CDR: single low-offset amplifier in 8-pin SOIC (D)',
    referenceEvidence: 'Rodeostat frozen high-current schematic U11/U13 DAC shift-and-scale stages and BOM LCSC C7433=OP07CDR, revision 86e4708fea84f8fc33bcbfc9a706b06f4b770efd; TI OP07x datasheet SLOS099H',
    pinoutEvidence: 'TI SOIC-8 pinout 1/5=offset null, 2=IN-, 3=IN+, 4=V-, 6=OUT, 7=V+, 8=NC; local KiCad Amplifier_Operational:OP07 with Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
  },
  {
    roleTest: /current[_ -]?measurement[_ -]?tia|selectable[_ -]?gain[_ -]?tia|transimpedance/i,
    functionClass: 'op_amp',
    manufacturer: 'STMicroelectronics',
    partNumber: 'TL072CDT',
    footprint: { library: 'Package_SO', footprint: 'SOIC-8_3.9x4.9mm_P1.27mm' },
    symbol: { library: 'Amplifier_Operational', symbol: 'TL072' },
    ratings: { voltageV: 36 },
    packageEvidence: 'ST TL072CDT: dual low-noise JFET-input amplifier in SO-8',
    referenceEvidence: 'Rodeostat frozen high-current schematic U9 directly connects WRK_ELECT to selectable-gain TIA_OUT_BIP and BOM LCSC C6961=TL072CDT, revision 86e4708fea84f8fc33bcbfc9a706b06f4b770efd; ST TL072 datasheet',
    pinoutEvidence: 'ST SO-8 pinout 1=OUT1, 2=IN1-, 3=IN1+, 4=VCC-, 5=IN2+, 6=IN2-, 7=OUT2, 8=VCC+; local KiCad Amplifier_Operational:TL072 with Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
  },
  {
    roleTest: /current[_ -]?measurement[_ -]?tia|(^|[_ -])tia($|[_ -])|signal[_ -]?conditioner|op[_ -]?amp/i,
    functionClass: 'op_amp',
    manufacturer: 'Texas Instruments',
    partNumber: 'OPA334AIDBVR',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23-5' },
    symbol: { library: 'Amplifier_Operational', symbol: 'OPA334' },
    ratings: { voltageV: 5.5 },
    packageEvidence: 'forge-truth distributor cache: OPA334AIDBVR, SOT-23-5',
    referenceEvidence: 'Rodeostat frozen role manifest, revision 86e4708fea84f8fc33bcbfc9a706b06f4b770efd',
  },
  {
    roleTest: /(?:stir|pump|brushed[_ -]?dc|motor)[_ -]?(?:channel|driver)|motor[_ -]?driver/i,
    excludedRoleTest: /(?:tec|peltier|heater|high[_ -]?voltage|electrode)/i,
    functionClass: 'gate_driver_ic',
    manufacturer: 'Texas Instruments',
    partNumber: 'DRV8876PWPR',
    footprint: {
      library: 'Package_SO',
      footprint: 'HTSSOP-16-1EP_4.4x5mm_P0.65mm_EP3.4x5mm',
    },
    symbol: { library: 'Driver_Motor', symbol: 'DRV8876' },
    ratings: { voltageV: 37, currentA: 3.5 },
    packageEvidence: 'forge-truth cache: DRV8876PWPR, 16-HTSSOP brushed-DC driver',
    referenceEvidence: 'Pioreactor frozen actuation role manifest, revision ca40a91e728801b139b1086853f7cf74ce76def9',
  },
  {
    roleTest: /decoupling[_ -]?capacitor|__decouple$/i,
    functionClass: 'passive_c',
    manufacturer: 'YAGEO',
    partNumber: 'CC0603KRX7R9BB104',
    footprint: { library: 'Capacitor_SMD', footprint: 'C_0603_1608Metric' },
    symbol: { library: 'Device', symbol: 'C' },
    ratings: { voltageV: 50 },
    packageEvidence: 'forge-truth cache: CC0603KRX7R9BB104, 100 nF 50 V X7R 0603',
    referenceEvidence: 'universal 100 nF IC decoupling role; frozen wet-science board sources',
  },
  {
    roleTest: /poly[_ -]?fuse|resettable[_ -]?fuse|current[_ -]?limit[_ -]?polyfuse/i,
    functionClass: 'fuse_protection',
    manufacturer: 'Littelfuse',
    partNumber: '0603L300/9SLYR',
    footprint: { library: 'Fuse', footprint: 'Fuse_0603_1608Metric' },
    symbol: { library: 'Device', symbol: 'Polyfuse' },
    ratings: { voltageV: 9, currentA: 3 },
    packageEvidence: 'forge-truth cache: 0603L300/9SLYR, 9 V 3 A 0603 PPTC',
    referenceEvidence: 'NinjaPCR frozen input-protection architecture, revision 181768d6ec068a6dd68593042167699285744768',
  },
  {
    roleTest: /reverse[_ -]?polarity/i,
    functionClass: 'diode_protection',
    manufacturer: 'Diodes Incorporated',
    partNumber: 'BSS84-7-F',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23' },
    symbol: { library: 'Transistor_FET', symbol: 'Q_PMOS_GSD' },
    ratings: { voltageV: 50, currentA: 0.13 },
    packageEvidence: 'forge-truth cache: BSS84-7-F, P-channel 50 V MOSFET, SOT-23-3',
    referenceEvidence: 'universal low-voltage reverse-polarity switch role; DB-only candidate evidence',
  },
  {
    roleTest: /high[_ -]?voltage[_ -]?(?:boost|step[_ -]?up)[_ -]?(?:controller|converter)|adjustable[_ -]?boost[_ -]?controller/i,
    functionClass: 'regulator',
    manufacturer: 'Maxim Integrated',
    partNumber: 'MAX1771ESA',
    footprint: { library: 'Package_SO', footprint: 'SO-8_3.9x4.9mm_P1.27mm' },
    symbol: { library: 'Regulator_Switching', symbol: 'MAX1771xSA' },
    ratings: { voltageV: 16.5 },
    packageEvidence: 'Maxim MAX1771ESA: adjustable step-up controller in 8-pin narrow SO package',
    referenceEvidence: 'OpenDrop V4 frozen schematic U1 exact MAX1771ESA high-voltage boost controller, revision 934a44db3ed41c24ae4dddb5b805a22e4166284b; Maxim MAX1771 datasheet 19-0263 Rev 2',
    pinoutEvidence: 'Maxim SO-8 pinout; local KiCad Regulator_Switching:MAX1771xSA with Package_SO:SO-8_3.9x4.9mm_P1.27mm',
  },
  {
    roleTest: /dc[_ -]?dc[_ -]?regulator|3\.3\s*v.*(?:regulator|ldo)|(?:regulator|ldo).*3\.3\s*v/i,
    functionClass: 'regulator',
    manufacturer: 'Microchip Technology',
    partNumber: 'MCP1700T-3302E/TT',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23' },
    symbol: { library: 'Regulator_Linear', symbol: 'MCP1700x-330xxTT' },
    ratings: { voltageV: 6, currentA: 0.25 },
    packageEvidence: 'Microchip MCP1700T-3302E/TT: fixed 3.3 V, 250 mA LDO in 3-lead SOT-23',
    referenceEvidence: 'Microchip MCP1700 datasheet DS20001826F and forge-truth distributor/spec-document cache',
    pinoutEvidence: 'Microchip SOT-23 pinout 1=GND, 2=VOUT, 3=VIN; local KiCad Regulator_Linear:MCP1700x-330xxTT with Package_TO_SOT_SMD:SOT-23',
  },
  {
    roleTest: /usb[_ -]?(?:c[_ -]?)?(?:power[_ -]?entry|receptacle)|type[_ -]?c[_ -]?receptacle/i,
    functionClass: 'usb_connector',
    manufacturer: 'Amphenol ICC',
    partNumber: '12401610E4#2A',
    footprint: {
      library: 'Connector_USB',
      footprint: 'USB_C_Receptacle_Amphenol_12401610E4-2A',
    },
    symbol: { library: 'Connector', symbol: 'USB_C_Receptacle' },
    ratings: { voltageV: 5, currentA: 5 },
    packageEvidence: 'Amphenol 12401610E4#2A: full-featured 24-contact right-angle SMT USB-C receptacle',
    referenceEvidence: 'OpenDrop V4 frozen schematic J1 exact Amphenol 12401610E4-2A footprint, revision 934a44db3ed41c24ae4dddb5b805a22e4166284b; Amphenol USB Type-C manufacturer data',
    pinoutEvidence: 'Amphenol contacts A1-A12/B1-B12 plus shield; local KiCad Connector:USB_C_Receptacle and exact Connector_USB footprint',
  },
  {
    roleTest: /fan[_ -]?(?:power[_ -]?)?(?:connector|header)|three[_ -]?(?:circuit|position)[_ -]?fan/i,
    functionClass: 'connector',
    manufacturer: 'Molex',
    partNumber: '22-23-2031',
    footprint: {
      library: 'Connector_Molex',
      footprint: 'Molex_KK-254_AE-6410-03A_1x03_P2.54mm_Vertical',
    },
    symbol: { library: 'Connector_Generic', symbol: 'Conn_01x03' },
    ratings: { voltageV: 250, currentA: 2.5 },
    packageEvidence: 'Molex 22-23-2031: KK 254 vertical friction-lock header, three circuits, 2.54 mm pitch',
    referenceEvidence: 'NinjaPCR frozen schematic FAN1 exact 22-23-2031 and matching footprint, revision 181768d6ec068a6dd68593042167699285744768; Molex KK 254 product specification PS-10-07-001',
    pinoutEvidence: 'Molex three through-hole contacts; local KiCad Connector_Generic:Conn_01x03 with exact 6410-03A footprint',
  },
  {
    roleTest: /source[_ -]?board[_ -]?connector|four[_ -]?(?:position|pin)[_ -]?(?:board[_ -]?to[_ -]?board[_ -]?)?connector/i,
    functionClass: 'connector',
    manufacturer: 'JST Sales America Inc.',
    partNumber: 'BM04B-SRSS-TB',
    footprint: {
      library: 'Connector_JST',
      footprint: 'JST_SH_BM04B-SRSS-TB_1x04-1MP_P1.00mm_Vertical',
    },
    symbol: { library: 'Connector_Generic', symbol: 'Conn_01x04' },
    ratings: { voltageV: 50, currentA: 1 },
    packageEvidence: 'JST SH BM04B-SRSS-TB: four SMD contacts, 1.00 mm pitch, vertical header',
    referenceEvidence: 'JST SH manufacturer data sheet https://www.jst-mfg.com/product/pdf/eng/eSH.pdf; Pioreactor Eye-Spy frozen BOM and schematic, revision ca40a91e728801b139b1086853f7cf74ce76def9; Digi-Key 455-BM04B-SRSS-TBTR-ND',
    pinoutEvidence: 'frozen Eye-Spy schematic J1/J2 pins 1-4; local KiCad Connector_Generic:Conn_01x04 and exact JST footprint',
  },
  {
    roleTest: /esd[_ -]?protection|(?:^|[_ -])tvs(?:$|[_ -])|transient[_ -]?protection/i,
    functionClass: 'diode_protection',
    manufacturer: 'Toshiba',
    partNumber: 'DF2S6.8MFS,L3M',
    footprint: { library: 'Diode_SMD', footprint: 'D_SOD-923' },
    symbol: { library: 'Device', symbol: 'D_TVS' },
    ratings: { voltageV: 5 },
    packageEvidence: 'Toshiba DF2S6.8MFS,L3M: 5 V working, 15 V clamp TVS in SOD-923',
    referenceEvidence: 'Toshiba TVS manufacturer catalogue ALQ00261; Pioreactor Eye-Spy frozen BOM and schematic, revision ca40a91e728801b139b1086853f7cf74ce76def9; Digi-Key DF2S6.8MFSL3MCT-ND',
    pinoutEvidence: 'frozen Eye-Spy schematic D2-D5 pins 1-2; local KiCad Device:D_TVS and Diode_SMD:D_SOD-923',
  },
]

function roleText(request: VerifiedCandidateRequest): string {
  return `${request.wordId} ${request.nameHuman} ${request.characterId}`
}

function normalized(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * @description Resolves one generic PCB function to a candidate whose role and
 * package are declared compatible and whose exact identity exists in the
 * DB-only component cache. Cache misses remain explicit upstream blockers.
 * @param request Generic word/function evidence from the architecture plan.
 * @param lookup DB-only cached lookup function.
 * @returns Verified identity, compatibility and provenance, or null.
 */
export function resolveVerifiedFunctionCandidate(
  request: VerifiedCandidateRequest,
  lookup: CachedLookup,
): VerifiedFunctionCandidate | null {
  // INTENT: Reference boards teach reusable function/package pairings. They do
  // not license product-slug branching or promotion of uncached-looking MPNs.
  const text = roleText(request)
  const rule = CANDIDATE_RULES.find((candidate) =>
    candidate.functionClass === request.functionClass
    && candidate.roleTest.test(text)
    && !candidate.excludedRoleTest?.test(text))
  if (!rule) return null

  const cached = lookup(rule.manufacturer, rule.partNumber)
  if (!cached.found || !cached.result) return null
  if (normalized(cached.result.mpn) !== normalized(rule.partNumber)) return null
  if (
    cached.result.manufacturer
    && !normalized(cached.result.manufacturer).includes(normalized(rule.manufacturer))
    && !normalized(rule.manufacturer).includes(normalized(cached.result.manufacturer))
  ) {
    return null
  }

  return {
    manufacturer: rule.manufacturer,
    partNumber: rule.partNumber,
    compatibleFunctionClass: rule.functionClass,
    footprint: rule.footprint,
    provenance: [
      rule.referenceEvidence,
      rule.pinoutEvidence,
      `forge-truth:${cached.source}`,
    ].filter(Boolean).join('; '),
    roleCompatibility: `${request.characterId} matches generic ${rule.functionClass} role`,
    packageCompatibility: rule.packageEvidence,
    cacheSource: cached.source,
  }
}

function candidateRuleForRequest(request: VerifiedCandidateRequest): CandidateRule | null {
  const text = roleText(request)
  return CANDIDATE_RULES.find((candidate) =>
    candidate.functionClass === request.functionClass
    && candidate.roleTest.test(text)
    && !candidate.excludedRoleTest?.test(text)) ?? null
}

function ratingBlocker(
  rule: CandidateRule,
  required: VerifiedCandidateRequest['requiredRatings'],
): string | null {
  if (
    required?.voltageV != null
    && (rule.ratings.voltageV == null || rule.ratings.voltageV < required.voltageV)
  ) {
    return `${rule.partNumber} voltage rating ${rule.ratings.voltageV ?? 'unknown'} V is below required ${required.voltageV} V`
  }
  if (
    required?.currentA != null
    && (rule.ratings.currentA == null || rule.ratings.currentA < required.currentA)
  ) {
    return `${rule.partNumber} current rating ${rule.ratings.currentA ?? 'unknown'} A is below required ${required.currentA} A`
  }
  return null
}

/**
 * @description Resolves a fabrication-credible generic component identity only
 * when DB provenance, functional role, required ratings, local KiCad symbol,
 * inherited full pinout, exact footprint, and pin/pad parity all agree.
 * @param request Functional role and required electrical ratings.
 * @param lookup DB-only cached identity lookup.
 * @param roots Local KiCad symbol and footprint roots.
 * @returns Fully verified identity or an explicit unresolved reason.
 */
export function resolveVerifiedComponentIdentity(
  request: VerifiedCandidateRequest,
  lookup: CachedLookup,
  roots: VerifiedIdentityLibraryRoots,
): VerifiedComponentIdentity | UnresolvedComponentIdentity {
  // INTENT: A curated MPN is only a candidate. Fabrication identity requires
  // independent agreement across procurement and the installed CAD libraries.
  const rule = candidateRuleForRequest(request)
  if (!rule) {
    return {
      status: 'unresolved',
      reason: `no curated role-compatible candidate for ${request.characterId}`,
    }
  }
  const candidate = resolveVerifiedFunctionCandidate(request, lookup)
  if (!candidate) {
    return {
      status: 'unresolved',
      reason: `${rule.partNumber} is not present in a verified forge-truth DB row`,
    }
  }
  const blockedByRating = ratingBlocker(rule, request.requiredRatings)
  if (blockedByRating) return { status: 'unresolved', reason: blockedByRating }

  const symbol = resolveKicadSymbol(roots.symbolsRoot, rule.symbol)
  if (!symbol) {
    return {
      status: 'unresolved',
      reason: `${rule.partNumber} has no complete local KiCad symbol ${rule.symbol.library}:${rule.symbol.symbol}`,
    }
  }
  const footprint = resolveKicadFootprint(roots.footprintsRoot, rule.footprint)
  if (!footprint) {
    return {
      status: 'unresolved',
      reason: `${rule.partNumber} has no exact local KiCad footprint ${rule.footprint.library}:${rule.footprint.footprint}`,
    }
  }
  const expectedFootprintId = `${rule.footprint.library}:${rule.footprint.footprint}`
  if (symbol.footprintId && symbol.footprintId !== expectedFootprintId) {
    return {
      status: 'unresolved',
      reason: `${rule.partNumber} symbol footprint ${symbol.footprintId} does not match ${expectedFootprintId}`,
    }
  }
  const electricalPads = footprint.electricalPadCount
  if (symbol.pins.length !== electricalPads) {
    return {
      status: 'unresolved',
      reason: `${rule.partNumber} symbol has ${symbol.pins.length} pins but footprint has ${electricalPads} electrical pads`,
    }
  }

  const resolutionCandidate: PcbComponentResolutionCandidate = {
    wordId: request.wordId,
    instanceName: request.wordId,
    requestedRole: rule.functionClass,
    manufacturer: candidate.manufacturer,
    partNumber: candidate.partNumber,
    mpnVerified: true,
    procurementProvenance: candidate.provenance,
    compatibleRoles: [rule.functionClass],
    symbolId: symbol.symbolId,
    footprint,
    pins: symbol.pins,
    resolutionTier: 'mpn_symbol_footprint',
    resolutionBasis: 'verified forge-truth identity and exact local KiCad symbol/footprint',
  }
  const evaluated = evaluatePcbComponentResolution(resolutionCandidate)
  if (!evaluated.isFabricationVerified) {
    return {
      status: 'unresolved',
      reason: evaluated.findings.map((finding) => finding.message).join('; '),
    }
  }
  return {
    ...candidate,
    symbolId: symbol.symbolId,
    pins: symbol.pins,
    footprint,
    resolutionTier: 'mpn_symbol_footprint',
  }
}
