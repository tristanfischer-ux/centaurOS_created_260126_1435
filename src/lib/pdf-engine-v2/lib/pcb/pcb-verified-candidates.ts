/**
 * @file Function-keyed verified PCB component candidates.
 * @description Converts frozen reference architecture evidence into reusable
 * role/package candidates, then requires DB-only cached identity confirmation.
 * Product names never participate in runtime selection.
 */

import { resolve } from 'node:path'

import type {
  DbCascadeResult,
  DbCascadeSource,
} from '../distributors/db-only-cascade'
import {
  resolveKicadFootprint,
  resolveKicadSymbol,
} from './pcb-kicad-library'
import {
  hasCuratedManufacturerPinout,
  resolveCuratedManufacturerIdentity,
} from './pcb-manufacturer-pinouts'
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

const CURATED_FOOTPRINTS_ROOT = resolve(__dirname, 'footprints')

const CANDIDATE_RULES: readonly CandidateRule[] = [
  {
    roleTest: /(?=.*470\s*nm)(?=.*(?:led|optical[_ -]?source))/i,
    functionClass: 'led',
    manufacturer: 'Yongyu Photoelectric',
    partNumber: 'SZYY0603B',
    footprint: { library: 'LED_SMD', footprint: 'LED_0603_1608Metric' },
    symbol: { library: 'Device', symbol: 'LED' },
    ratings: { voltageV: 3.3, currentA: 0.03 },
    packageEvidence: 'Yongyu SZYY0603B: blue water-clear LED in 0603 (1.6 x 0.8 x 0.6 mm), 469 nm peak, 460-475 nm dominant wavelength',
    referenceEvidence: 'Open Colorimeter frozen 470 nm source board specifies one 0603 LED at 3.1 V / 15 mA, revision b7f37ae1d1f6d254e37b1a89ee1e2aac75eb5fb7; Yongyu SZYY0603B manufacturer data distributed as LCSC C434421',
    pinoutEvidence: 'Yongyu 0603 polarity drawing; local KiCad Device:LED with LED_SMD:LED_0603_1608Metric',
  },
  {
    // INTENT (2026-07-21): OD source LED without a brief-pinned 470 nm token —
    // sensing_instrumentation_subcomponent proxies synthesize od_source_led.
    // GOTCHA: do NOT match bare "optical source LED" / led_source — that is the
    // underspecified generic role the harness keeps null until wavelength is pinned.
    roleTest: /(?:^|[_ -])od[_ -]?source(?:[_ -]?led)?(?:$|[_ -])|optical[_ -]?density[_ -]?(?:source|emitter|led)|\bod600\b.*(?:led|emitter|source)/i,
    excludedRoleTest: /power[_ -]?indicator|status[_ -]?indicator|annunciator|(?:^|[_ -])led[_ -]?source(?:$|[_ -])/,
    functionClass: 'led',
    manufacturer: 'Yongyu Photoelectric',
    partNumber: 'SZYY0603B',
    footprint: { library: 'LED_SMD', footprint: 'LED_0603_1608Metric' },
    symbol: { library: 'Device', symbol: 'LED' },
    ratings: { voltageV: 3.3, currentA: 0.03 },
    packageEvidence: 'Yongyu SZYY0603B: blue water-clear LED in 0603 (1.6 x 0.8 x 0.6 mm), 469 nm peak, 460-475 nm dominant wavelength',
    referenceEvidence: 'Open Colorimeter frozen 470 nm source board specifies one 0603 LED at 3.1 V / 15 mA, revision b7f37ae1d1f6d254e37b1a89ee1e2aac75eb5fb7; Yongyu SZYY0603B manufacturer data distributed as LCSC C434421',
    pinoutEvidence: 'Yongyu 0603 polarity drawing; local KiCad Device:LED with LED_SMD:LED_0603_1608Metric',
  },
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
    // INTENT: Gold heater_20ml temperature sense — function-keyed, never product-named.
    roleTest: /(?:culture[_ -]?)?temperature[_ -]?(?:sensor|probe|ic)|tmp1075/i,
    excludedRoleTest: /(?:stir|pump|motor|photodiode|optical)/i,
    functionClass: 'sensor_ic',
    manufacturer: 'Texas Instruments',
    partNumber: 'TMP1075DSGR',
    footprint: {
      library: 'Package_SON',
      footprint: 'WSON-8-1EP_2x2mm_P0.5mm_EP0.9x1.6mm',
    },
    symbol: { library: 'Sensor_Temperature', symbol: 'TMP1075' },
    ratings: { voltageV: 5.5 },
    packageEvidence: 'TI TMP1075DSGR: digital temperature sensor in 8-pin WSON (DSG)',
    referenceEvidence: 'Pioreactor heater_20ml frozen BOM U1 exact TMP1075DSGR, revision ca40a91e728801b139b1086853f7cf74ce76def9; TI TMP1075 datasheet SBOS858',
    pinoutEvidence: 'TI DSG-8 pins; curated Forge_Manufacturer:TMP1075DSGR with Package_SON:WSON-8-1EP_2x2mm_P0.5mm_EP0.9x1.6mm',
  },
  {
    roleTest: /(?:magnetic[_ -]?)?(?:lid[_ -]?)?(?:hall|lid[_ -]?sense)|drv5021/i,
    excludedRoleTest: /(?:stir|pump|motor[_ -]?driver|heater[_ -]?element)/i,
    functionClass: 'sensor_ic',
    manufacturer: 'Texas Instruments',
    partNumber: 'DRV5021A3QDBZR',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23' },
    symbol: { library: 'Sensor_Magnetic', symbol: 'DRV5021' },
    ratings: { voltageV: 5.5 },
    packageEvidence: 'TI DRV5021A3QDBZR: unipolar Hall-effect switch in SOT-23 (DBZ)',
    referenceEvidence: 'Pioreactor heater_20ml frozen BOM U2 exact DRV5021A3QDBZR, revision ca40a91e728801b139b1086853f7cf74ce76def9; TI DRV5021 datasheet SLVSE41',
    pinoutEvidence: 'TI DBZ-3 pins 1=OUT, 2=VCC, 3=GND; curated Forge_Manufacturer:DRV5021A3QDBZR with Package_TO_SOT_SMD:SOT-23',
  },
  {
    roleTest: /(?:cartridge|resistive)[_ -]?heater|heater[_ -]?element|esr18ezpj3r9/i,
    excludedRoleTest: /(?:driver|mosfet|h[_ -]?bridge|stir|pump)/i,
    functionClass: 'passive_r',
    manufacturer: 'Rohm',
    partNumber: 'ESR18EZPJ3R9',
    footprint: { library: 'Resistor_SMD', footprint: 'R_1206_3216Metric' },
    symbol: { library: 'Device', symbol: 'R' },
    ratings: { voltageV: 200, currentA: 0.35 },
    packageEvidence: 'Rohm ESR18EZPJ3R9: 3.9 ohm 0.5 W anti-surge thick-film resistor in 1206',
    referenceEvidence: 'Pioreactor heater_20ml frozen BOM R12–R28 (15×) exact ESR18EZPJ3R9, revision ca40a91e728801b139b1086853f7cf74ce76def9; Rohm ESR18 datasheet',
    pinoutEvidence: 'two-terminal 1206; local KiCad Device:R with Resistor_SMD:R_1206_3216Metric',
  },
  {
    // DECISION: exact Molex 52207-0760 land is not in stock KiCad; use the same
    // 1.00 mm / 7-pos horizontal Molex Easy-On family footprint (200528-0070)
    // as a package-compatible stand-in until a curated Forge footprint lands.
    roleTest: /(?:host[_ -]?)?ffc[_ -]?connector|heater[_ -]?ffc|52207[_ -]?0760/i,
    functionClass: 'connector',
    manufacturer: 'Molex',
    partNumber: '52207-0760',
    footprint: {
      library: 'Connector_FFC-FPC',
      footprint: 'Molex_200528-0070_1x07-1MP_P1.00mm_Horizontal',
    },
    symbol: { library: 'Connector_Generic', symbol: 'Conn_01x07' },
    ratings: { voltageV: 50, currentA: 0.5 },
    packageEvidence: 'Molex 52207-0760: 7-position 1.00 mm FFC/FPC right-angle top-contact SMT; land geometry closed via Molex_200528-0070 1x07 P1.00mm family footprint',
    referenceEvidence: 'Pioreactor heater_20ml frozen BOM J1 exact 52207-0760, revision ca40a91e728801b139b1086853f7cf74ce76def9; Molex 52207 / 200528 Easy-On family',
    pinoutEvidence: '7 signal contacts; Molex_200528-0070_1x07-1MP_P1.00mm_Horizontal electrical pads',
  },
  {
    roleTest: /(?:load[_ -]?cell|strain[_ -]?gauge|weigh(?:t|ing)?[_ -]?scale|bridge[_ -]?sensor)[_ -]?(?:adc|converter|measurement)?/i,
    functionClass: 'sensor_ic',
    manufacturer: 'Nuvoton Technology Corporation',
    partNumber: 'NAU7802SGI',
    footprint: { library: 'Package_SO', footprint: 'SOIC-16_3.9x9.9mm_P1.27mm' },
    symbol: { library: 'Sensor_Weight', symbol: 'NAU7802' },
    ratings: { voltageV: 5.5 },
    packageEvidence: 'Nuvoton NAU7802SGI: 24-bit bridge-sensor ADC in 16-pin SOP, 150 mil',
    referenceEvidence: 'Nuvoton NAU7802SGI product page and NAU7802 Data Sheet Rev2.6',
    pinoutEvidence: 'Nuvoton SOP-16 pins 1-16; curated local Forge_Manufacturer:NAU7802SGI with Package_SO:SOIC-16_3.9x9.9mm_P1.27mm',
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
    roleTest: /programmable[_ -]?(?:hv|high[_ -]?voltage)[_ -]?setpoint|50\s*k(?:ohm|Ω).*setpoint/i,
    functionClass: 'programmable_resistor',
    manufacturer: 'Microchip Technology',
    partNumber: 'MCP41050-I/SN',
    footprint: { library: 'Package_SO', footprint: 'SOIC-8_3.9x4.9mm_P1.27mm' },
    symbol: { library: 'Potentiometer_Digital', symbol: 'MCP41050' },
    ratings: { voltageV: 5.5, currentA: 0.001 },
    packageEvidence: 'Microchip MCP41050-I/SN: 50 kohm, 256-position SPI digital potentiometer in 8-lead SOIC (SN)',
    referenceEvidence: 'OpenDrop V4 frozen schematic U15 value MCP41050 and GaudiLabsFootPrints:SO08 on the MAX1771 VSENS setpoint path, revision 934a44db3ed41c24ae4dddb5b805a22e4166284b; Microchip MCP41XXX/42XXX datasheet DS11195C',
    pinoutEvidence: 'Microchip SOIC-8 pins 1=CS, 2=SCK, 3=SI, 4=VSS, 5=PA0, 6=PW0, 7=PB0, 8=VDD; local KiCad Potentiometer_Digital:MCP41050 with Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
  },
  {
    roleTest: /droplet[_ -]?feedback[_ -]?(?:amplifier|sense)|feedback[_ -]?amplifier.*droplet/i,
    functionClass: 'op_amp',
    manufacturer: 'Microchip Technology',
    partNumber: 'MCP6002-I/SN',
    footprint: { library: 'Package_SO', footprint: 'SOIC-8_3.9x4.9mm_P1.27mm' },
    symbol: { library: 'Amplifier_Operational', symbol: 'MCP6002-xSN' },
    ratings: { voltageV: 6, currentA: 0.006 },
    packageEvidence: 'Microchip MCP6002-I/SN: dual 1 MHz rail-to-rail op amp in 8-lead SOIC (SN), industrial temperature grade',
    referenceEvidence: 'OpenDrop V4 frozen schematic U6 exact MCP6002 value and GaudiLabsFootPrints:SO08 in the named FEEDBACK AMPLIFIER, revision 934a44db3ed41c24ae4dddb5b805a22e4166284b; Microchip MCP6001/2/4 datasheet DS20001733L',
    pinoutEvidence: 'Microchip SOIC-8 pins 1=VOUTA, 2=VINA-, 3=VINA+, 4=VSS, 5=VINB+, 6=VINB-, 7=VOUTB, 8=VDD; local KiCad Amplifier_Operational:MCP6002-xSN with Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
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
    roleTest: /opa334|zero[_ -]?drift[_ -]?(?:shutdown[_ -]?)?(?:op[_ -]?amp|amplifier)/i,
    functionClass: 'op_amp',
    manufacturer: 'Texas Instruments',
    partNumber: 'OPA334AIDBVR',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23-6' },
    symbol: { library: 'Amplifier_Operational', symbol: 'OPA334' },
    ratings: { voltageV: 5.5 },
    packageEvidence: 'TI OPA334AIDBVR: shutdown version in 6-pin SOT-23 DBV',
    referenceEvidence: 'Texas Instruments OPA334 Data Sheet SBOS213D and active OPA334AIDBVR product record',
    pinoutEvidence: 'TI DBV-6 pins 1=OUT, 2=V-, 3=+IN, 4=-IN, 5=ENABLE, 6=V+; curated local Forge_Manufacturer:OPA334AIDBVR with Package_TO_SOT_SMD:SOT-23-6',
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
    roleTest: /bulk[_ -]?capacitor[_ -]?word|cs1e102m[_ -]?cri13/i,
    excludedRoleTest: /eevfk1e102q|reference[_ -]?1000/i,
    functionClass: 'passive_c',
    manufacturer: 'ST (Xianke / 先科)',
    partNumber: 'CS1E102M-CRI13',
    footprint: {
      library: 'Forge_Manufacturer',
      footprint: 'Panasonic_EEVFK1E102Q',
    },
    symbol: { library: 'Device', symbol: 'C_Polarized' },
    ratings: { voltageV: 25, currentA: 0.9 },
    packageEvidence: 'CS1E102M-CRI13: polar 1000 uF 25 V SMD aluminium can, 12.5 x 13.5 mm',
    referenceEvidence: 'Seeed OPL 302030098 / LCSC C123705 and frozen NinjaPCR C3 CAP_SMDAL_1000UF_25V, revision 181768d6ec068a6dd68593042167699285744768; heater-path RMS closed at <1 A',
    pinoutEvidence: 'polar terminal marking; footprint preserves frozen CAP_SMD_AL_D125 positive/negative land geometry',
  },
  {
    roleTest: /(?:reference|candidate|alternate)[_ -]?1000\s*(?:u|µ)f[_ -]?25\s*v[_ -]?bulk[_ -]?capacitor|eevfk1e102q/i,
    excludedRoleTest: /(?:^|[_ -])bulk[_ -]?capacitor[_ -]?word(?:$|[_ -])/i,
    functionClass: 'passive_c',
    manufacturer: 'Panasonic Industry',
    partNumber: 'EEVFK1E102Q',
    footprint: {
      library: 'Forge_Manufacturer',
      footprint: 'Panasonic_EEVFK1E102Q',
    },
    symbol: { library: 'Device', symbol: 'C_Polarized' },
    ratings: { voltageV: 25, currentA: 1.1 },
    packageEvidence: 'Panasonic EEVFK1E102Q: polar 1000 uF 25 V SMD aluminium can, 12.5 x 13.5 mm',
    referenceEvidence: 'Panasonic EEVFK1E102Q alternate for frozen NinjaPCR C3 D12.5 envelope; gold OPL identity remains CS1E102M-CRI13',
    pinoutEvidence: 'Panasonic polar terminal marking; candidate footprint preserves frozen CAP_SMD_AL_D125 positive/negative land geometry',
  },
  {
    roleTest: /terminal[_ -]?block[_ -]?word|gs012s[_ -]?3\.5[_ -]?02p[_ -]?11/i,
    functionClass: 'connector',
    manufacturer: 'GOOSVN (Ningbo Gosun Technology)',
    partNumber: 'GS012S-3.5-02P-11',
    footprint: {
      library: 'Forge_Manufacturer',
      footprint: 'GOOSVN_GS012S_3.5_02P',
    },
    symbol: { library: 'Connector', symbol: 'Screw_Terminal_01x02' },
    ratings: { voltageV: 300, currentA: 7 },
    packageEvidence: 'GS012S-3.5-02P-11: 2P 3.5 mm green screw terminal, ~7x7 mm',
    referenceEvidence: 'Seeed OPL 320110028 and frozen NinjaPCR HEATER_POWER/HEATER_TEMP/PELTIER H2-3.5-7.0X7.0MM, revision 181768d6ec068a6dd68593042167699285744768',
    pinoutEvidence: 'two screw contacts A/B on the 3.5 mm pitch land',
  },
  {
    roleTest: /h[_ -]?bridge[_ -]?tec[_ -]?driver[_ -]?word|tec[_ -]?(?:direction|polarity)[_ -]?relay[_ -]?constituent|actp212/i,
    functionClass: 'relay',
    manufacturer: 'Panasonic Industry',
    partNumber: 'ACTP212',
    footprint: { library: 'Forge_Manufacturer', footprint: 'Panasonic_ACTP212' },
    symbol: { library: 'Forge_Manufacturer', symbol: 'ACTP212' },
    ratings: { voltageV: 14, currentA: 20 },
    packageEvidence: 'Panasonic ACTP212: sealed twin Form-C eight-pin through-hole PCB relay, 17.4 x 14 x 13.5 mm',
    referenceEvidence: 'Frozen NinjaPCR v2.3 ACTP212+IRLB3813 thermal power stage with heater_film1 1.79 A closure, revision 181768d6ec068a6dd68593042167699285744768',
    pinoutEvidence: 'frozen NinjaPCR eight-pin symbol maps load commons 1/2, shared feeds 3/4 and coils 5/6 plus 7/8 against the Panasonic bottom-view drawing',
  },
  {
    roleTest: /tec[_ -]?power[_ -]?mosfet[_ -]?constituent|irlb3813pbf/i,
    excludedRoleTest: /h[_ -]?bridge[_ -]?tec[_ -]?driver[_ -]?word/i,
    functionClass: 'power_mosfet',
    manufacturer: 'Infineon Technologies',
    partNumber: 'IRLB3813PBF',
    footprint: { library: 'Package_TO_SOT_THT', footprint: 'TO-220-3_Vertical' },
    symbol: { library: 'Transistor_FET', symbol: 'Q_NMOS_GDS' },
    ratings: { voltageV: 30, currentA: 120 },
    packageEvidence: 'Infineon IRLB3813PBF: three-lead TO-220AB, package-limited 120 A continuous current',
    referenceEvidence: 'Infineon IRLB3813PbF and frozen NinjaPCR Q1 TO220BV land pattern, revision 181768d6ec068a6dd68593042167699285744768',
    pinoutEvidence: 'Infineon TO-220AB leads 1=Gate, 2=Drain, 3=Source, tab=Drain',
  },
  {
    // DECISION: Do not match bare dc_dc_regulator_word — that role is owned by
    // MCP1700 for ≤6 V instrument rails. CJT1117 only matches gold NinjaPCR
    // 12 V→3.3 V / CJT / ESP-WROOM evidence so the two LDOs cannot steal each other.
    roleTest: /cjt1117b?[_ -]?3\.3(?:[_ -]?g)?|(?:gold|reference)[_ -]?cjt1117[_ -]?3\.3[_ -]?ldo[_ -]?constituent|12\s*v(?:\s*to\s*|\s*[→\-]+\s*)3\.3\s*v.*(?:regulator|ldo)|(?:esp[_ -]?wroom|ninjapcr).*(?:cjt|1117|sot[_ -]?223).*(?:regulator|ldo)/i,
    functionClass: 'regulator',
    manufacturer: 'Jiangsu Changjing Electronics Technology',
    partNumber: 'CJT1117B-3.3-G',
    footprint: {
      library: 'Package_TO_SOT_SMD',
      footprint: 'SOT-223-3_TabPin2',
    },
    symbol: { library: 'Regulator_Linear', symbol: 'AMS1117-3.3' },
    ratings: { voltageV: 12, currentA: 0.17 },
    packageEvidence: 'JSCJ CJT1117B-3.3-G: fixed 3.3 V 1 A LDO in SOT-223',
    referenceEvidence: 'Seeed OPL 310030097 / LCSC C164899 and frozen NinjaPCR REG with ESP8266 ≤170 mA TX peak on 2 oz copper, revision 181768d6ec068a6dd68593042167699285744768',
    pinoutEvidence: 'JSCJ SOT-223 pins 1=GND, 2=OUTPUT, 3=INPUT, tab=OUTPUT',
  },
  {
    roleTest: /debug[_ -]?uart[_ -]?word|tsw[_ -]?104[_ -]?07[_ -]?t[_ -]?s/i,
    functionClass: 'connector',
    manufacturer: 'Samtec',
    partNumber: 'TSW-104-07-T-S',
    footprint: {
      library: 'Connector_PinHeader_2.54mm',
      footprint: 'PinHeader_1x04_P2.54mm_Vertical',
    },
    symbol: { library: 'Connector_Generic', symbol: 'Conn_01x04' },
    ratings: { voltageV: 3.3 },
    packageEvidence: 'Samtec TSW-104-07-T-S: 1x4 2.54 mm through-hole header',
    referenceEvidence: 'Frozen NinjaPCR SERIAL4 PINHD-1X4 TXD/RXD/GND/3V3, revision 181768d6ec068a6dd68593042167699285744768',
    pinoutEvidence: 'pins 1=TXD, 2=RXD, 3=GND, 4=3V3',
  },
  {
    roleTest: /ferrite[_ -]?emc[_ -]?bead[_ -]?word|blm18pg121sn1d/i,
    excludedRoleTest: /pioreactor|rodeostat|od[_ -]?optics|analog[_ -]?afe/i,
    functionClass: 'passive_l',
    manufacturer: 'Murata Manufacturing',
    partNumber: 'BLM18PG121SN1D',
    footprint: { library: 'Inductor_SMD', footprint: 'L_0603_1608Metric' },
    symbol: { library: 'Device', symbol: 'Ferrite_Bead' },
    ratings: { currentA: 2 },
    packageEvidence: 'Murata BLM18PG121SN1D: 0603 120 ohm@100 MHz / 2 A ferrite',
    referenceEvidence: 'OpenDrop V4 FB1-FB8 Ferrite_Bead_Small on L_0603_1608Metric, revision 934a44db3ed41c24ae4dddb5b805a22e4166284b',
    pinoutEvidence: 'two-terminal series bead',
  },
  {
    roleTest: /power[_ -]?indicator[_ -]?led[_ -]?word|kpt[_ -]?1608cgck/i,
    excludedRoleTest: /pioreactor|rodeostat|status[_ -]?indicator/i,
    functionClass: 'led',
    manufacturer: 'Kingbright',
    partNumber: 'KPT-1608CGCK',
    footprint: { library: 'LED_SMD', footprint: 'LED_0603_1608Metric' },
    symbol: { library: 'Device', symbol: 'LED' },
    ratings: { voltageV: 3.3, currentA: 0.0031 },
    packageEvidence: 'Kingbright KPT-1608CGCK: 0603 green LED',
    referenceEvidence: 'OpenDrop LED1 + 390 ohm ballast, revision 934a44db3ed41c24ae4dddb5b805a22e4166284b',
    pinoutEvidence: 'pads 1=K, 2=A on LED_0603_1608Metric',
  },
  {
    roleTest: /status[_ -]?indicator[_ -]?word|kpt[_ -]?1608seck/i,
    excludedRoleTest: /pioreactor|rodeostat|power[_ -]?indicator/i,
    functionClass: 'led',
    manufacturer: 'Kingbright',
    partNumber: 'KPT-1608SECK',
    footprint: { library: 'LED_SMD', footprint: 'LED_0603_1608Metric' },
    symbol: { library: 'Device', symbol: 'LED' },
    ratings: { voltageV: 3.3, currentA: 0.003 },
    packageEvidence: 'Kingbright KPT-1608SECK: 0603 orange/amber LED',
    referenceEvidence: 'OpenDrop LED2/LED3 / RX_LED nets, revision 934a44db3ed41c24ae4dddb5b805a22e4166284b',
    pinoutEvidence: 'pads 1=K, 2=A on LED_0603_1608Metric',
  },
  {
    roleTest: /(?:^|[_ -])debug[_ -]?header[_ -]?word(?:$|[_ -])|ftsh[_ -]?105[_ -]?01[_ -]?l[_ -]?dv/i,
    excludedRoleTest: /pioreactor|wet[_ -]?lab[_ -]?hat|debug[_ -]?uart/i,
    functionClass: 'connector',
    manufacturer: 'Samtec',
    partNumber: 'FTSH-105-01-L-DV',
    footprint: {
      library: 'Connector_PinHeader_1.27mm',
      footprint: 'PinHeader_2x05_P1.27mm_Vertical_SMD',
    },
    symbol: { library: 'Connector_Generic', symbol: 'Conn_02x05_Odd_Even' },
    ratings: { voltageV: 3.3 },
    packageEvidence: 'Samtec FTSH-105-01-L-DV: 2x5 1.27 mm SMD header',
    referenceEvidence: 'OpenDrop J2 Conn_02x05_Odd_Even SWD header, revision 934a44db3ed41c24ae4dddb5b805a22e4166284b',
    pinoutEvidence: 'SWDIO/SWCLK/RESET/+3V3/GND on frozen J2 nets',
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
    roleTest: /source[_ -]?board[_ -]?connector/i,
    functionClass: 'connector',
    manufacturer: 'BOOMELE (Boom Precision Elec)',
    partNumber: '1.0T-4P',
    footprint: {
      library: 'Forge_Manufacturer',
      footprint: 'BOOMELE_1.0T-4P',
    },
    symbol: { library: 'Connector_Generic', symbol: 'Conn_01x04' },
    ratings: { voltageV: 50, currentA: 1 },
    packageEvidence: 'BOOMELE 1.0T-4P: four-contact, 1.00 mm-pitch, right-angle SMD SH-compatible header',
    referenceEvidence: 'Open Colorimeter frozen source-board J1/J2 use BOOMELE_SH_SMD:BOOMELE_SMD_SH_4PIN_RT and identify LCSC C145956, revision b7f37ae1d1f6d254e37b1a89ee1e2aac75eb5fb7; BOOMELE 1.0T-4P manufacturer data distributed as LCSC C145956',
    pinoutEvidence: 'frozen source-board J1/J2 pins 1=GND, 2=3V3, 3=SDA, 4=SCL; local KiCad Connector_Generic:Conn_01x04 with the frozen BOOMELE 1.0T-4P land pattern',
  },
  {
    roleTest: /(?:raspberry[_ -]?pi|rpi)[_ -]?hat[_ -]?(?:host|gpio)[_ -]?connector|hat[_ -]?host[_ -]?connector/i,
    functionClass: 'connector',
    manufacturer: 'Samtec',
    partNumber: 'SSQ-120-03-T-D',
    footprint: {
      library: 'Connector_PinSocket_2.54mm',
      footprint: 'PinSocket_2x20_P2.54mm_Vertical',
    },
    symbol: { library: 'Connector_Generic', symbol: 'Conn_02x20_Odd_Even' },
    ratings: { voltageV: 655, currentA: 6.3 },
    packageEvidence: 'Samtec SSQ-120-03-T-D: 2x20, 2.54 mm-pitch, vertical through-hole socket with 10.00 mm square tails, matte-tin contacts',
    referenceEvidence: 'Pioreactor frozen HAT v1.2 CAD and temperature-board BOM identify the SSQ-120-03-T-D family at revision ca40a91e728801b139b1086853f7cf74ce76def9; Samtec SSQ-TH series print and exact product record',
    pinoutEvidence: 'Samtec 40-contact package; Raspberry Pi physical pins 1-40 with Pioreactor GPIO contract, including physical 18=GPIO24/SWDIO and 22=GPIO25/SWCLK; curated Forge_Manufacturer:SSQ-120-03-T-D pinout with Connector_PinSocket_2.54mm:PinSocket_2x20_P2.54mm_Vertical',
  },
  {
    // GOTCHA: do NOT also match bare `esd_protection_network` — that role is
    // shared with Pioreactor Eye-Spy's single Toshiba DF2S TVS. Five-line / PESD
    // name evidence selects this array; OpenDrop gold uses five_line character ids.
    roleTest: /five[_ -]?line.*esd|pesd5v0l5uy/i,
    functionClass: 'diode_protection',
    manufacturer: 'Nexperia',
    partNumber: 'PESD5V0L5UY',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-363_SC-70-6' },
    symbol: { library: 'Power_Protection', symbol: 'PESD5V0L5UY' },
    ratings: { voltageV: 5, currentA: 2.5 },
    packageEvidence: 'Nexperia PESD5V0L5UY: fivefold unidirectional 5 V ESD array in six-lead SOT363 (SC-88)',
    referenceEvidence: 'OpenDrop V4 frozen schematic D4 exact PESD5V0L5UY value and Package_TO_SOT_SMD:SOT-363_SC-70-6 footprint, revision 934a44db3ed41c24ae4dddb5b805a22e4166284b; Nexperia PESDxL5UF/V/Y Rev. 02 datasheet',
    pinoutEvidence: 'Nexperia SOT363 pins 1/3/4/5/6=cathodes 1-5 and pin 2=common anode; local KiCad Power_Protection:PESD5V0L5UY with exact Package_TO_SOT_SMD:SOT-363_SC-70-6',
  },
  {
    roleTest: /bas70[_ -]?04|low[_ -]?leakage[_ -]?(?:electrochemical[_ -]?)?(?:rail[_ -]?)?clamp|electrochemical[_ -]?input[_ -]?clamp/i,
    functionClass: 'diode_protection',
    manufacturer: 'Slkor',
    partNumber: 'BAS70-04',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23' },
    symbol: { library: 'Device', symbol: 'D_Dual_Series_ACK' },
    ratings: { voltageV: 70, currentA: 0.07 },
    packageEvidence: 'Slkor BAS70-04: dual series Schottky clamp, 70 V / 70 mA, 100 nA maximum leakage at 50 V and 2 pF maximum capacitance in SOT-23',
    referenceEvidence: 'Rodeostat frozen high-current schematic and BOM identify D1/D2 as BAS70-04, LCSC C609810, SOT-23, revision 86e4708fea84f8fc33bcbfc9a706b06f4b770efd; Slkor manufacturer data distributed by LCSC',
    pinoutEvidence: 'Slkor SOT-23 series-diode pinout 1=A1, 2=K2, 3=K1/A2; curated Forge_Manufacturer:BAS70-04 pinout with Package_TO_SOT_SMD:SOT-23',
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

  const hasCuratedPinout = hasCuratedManufacturerPinout(
    rule.manufacturer,
    rule.partNumber,
  )
  const curated = hasCuratedPinout
    ? resolveCuratedManufacturerIdentity(
      rule.manufacturer,
      rule.partNumber,
      roots.footprintsRoot,
    )
    : null
  if (curated?.status === 'unsupported') {
    return { status: 'unresolved', reason: curated.reason }
  }
  const librarySymbol = curated
    ? null
    : resolveKicadSymbol(roots.symbolsRoot, rule.symbol)
  const footprint = curated?.footprint
    ?? resolveKicadFootprint(roots.footprintsRoot, rule.footprint)
    ?? resolveKicadFootprint(CURATED_FOOTPRINTS_ROOT, rule.footprint)
  if (!footprint) {
    return {
      status: 'unresolved',
      reason: `${rule.partNumber} has no exact local KiCad footprint ${rule.footprint.library}:${rule.footprint.footprint}`,
    }
  }
  const symbol = curated
    ? {
      symbolId: curated.symbolId,
      footprintId: `${rule.footprint.library}:${rule.footprint.footprint}`,
      pins: curated.pins,
    }
    : librarySymbol
  if (!symbol) {
    return {
      status: 'unresolved',
      reason: `${rule.partNumber} has no complete local KiCad symbol ${rule.symbol.library}:${rule.symbol.symbol}`,
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
