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
    // INTENT (organoid 2026-07-24): a USB / digital galvanic isolator is a real SOIC-8
    // signal-isolation IC (ADuM1201). Without a curated candidate the BoM MPN
    // ADUM1201ARZ-RL7 could not resolve a footprint (distributor package text "NSOIC,
    // 8 Pins" missed the SOIC matcher) → wet_lab_hat's isolate_wet_peripherals role stayed
    // unfilled → design-fitness FAIL → pcbGate architecture_unfit → PCB 0.
    roleTest: /galvanic[_ -]?isolator|digital[_ -]?isolator|usb[_ -]?isolator|(?:^|[_ -])isolator(?:$|[_ -])|adum\d|hv[_ -]?lv[_ -]?(?:isolation|isolator|barrier)/i,
    functionClass: 'isolator_ic',
    manufacturer: 'Analog Devices',
    partNumber: 'ADUM1201ARZ-RL7',
    footprint: { library: 'Package_SO', footprint: 'SOIC-8_3.9x4.9mm_P1.27mm' },
    symbol: { library: 'Isolator', symbol: 'ADuM1201AR' },
    ratings: { voltageV: 5.5 },
    packageEvidence: 'Analog Devices ADUM1201ARZ: dual-channel digital isolator (1 fwd / 1 rev) in 8-lead NSOIC (R-8), 2.7-5.5 V both sides',
    referenceEvidence: 'Organoid bioreactor BoM X-124 USB Galvanic Isolator exact ADUM1201ARZ-RL7 (Analog Devices); ADuM1201 datasheet Rev K',
    pinoutEvidence: 'ADuM1201 R-8 pinout 1=VDD1 2=VOA 3=VIB 4=GND1 5=GND2 6=VOB 7=VIA 8=VDD2; KiCad Isolator:ADuM1201AR with Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
  },
  {
    // INTENT (FE front 2026-08-05): vehicle CAN path needs a real transceiver
    // identity — package_family QFN alone keeps fitness below A- threshold.
    roleTest: /can[_ -]?fd[_ -]?transceiver|vehicle[_ -]?can[_ -]?transceiver|(?:^|[_ -])can[_ -]?transceiver(?:$|[_ -])/i,
    functionClass: 'connectivity_ic',
    manufacturer: 'Texas Instruments',
    partNumber: 'SN65HVD255D',
    footprint: { library: 'Package_SO', footprint: 'SOIC-8_3.9x4.9mm_P1.27mm' },
    symbol: { library: 'Interface_CAN_LIN', symbol: 'SN65HVD255D' },
    ratings: { voltageV: 5.5 },
    packageEvidence: 'TI SN65HVD255D: turbo CAN transceiver, 5 V, SOIC-8 (D package)',
    referenceEvidence: 'TI SN65HVD255 datasheet SLLSE57; KiCad Interface_CAN_LIN:SN65HVD255D + Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
    pinoutEvidence: 'SOIC-8 CAN: TXD/GND/VCC/RXD/CANL/CANH/S/… per SN65HVD255D; local KiCad symbol SN65HVD255D',
  },
  {
    // INTENT: phase current sense AFE — zero-drift op-amp path (not SOIC generic).
    roleTest: /current[_ -]?sense[_ -]?front[_ -]?end|phase[_ -]?current[_ -]?(?:afe|front[_ -]?end)/i,
    functionClass: 'op_amp',
    manufacturer: 'Texas Instruments',
    partNumber: 'OPA333AIDBVT',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23-5' },
    symbol: { library: 'Amplifier_Operational', symbol: 'OPA333xxDBV' },
    ratings: { voltageV: 5.5 },
    packageEvidence: 'TI OPA333AIDBVT: 1.8 V zero-drift op-amp in SOT-23-5 (DBV)',
    referenceEvidence: 'TI OPA333 datasheet SBOS351; KiCad Amplifier_Operational:OPA333 + Package_TO_SOT_SMD:SOT-23-5 (screening AFE stand-in for phase current front-end)',
    pinoutEvidence: 'SOT-23-5 OPA333 pinout; local KiCad Amplifier_Operational:OPA333xxDBV',
  },
  {
    // INTENT: LV buck rails — real 3.3 V LDO/buck package instead of bare SOT-23.
    // GOTCHA: must NOT match generic regulator/LDO roles (MCP1700, CJT1117) —
    // only FE traction LV buck rail densification nouns.
    roleTest: /lv[_ -]?buck[_ -]?rails?(?:$|[_ -])|buck[_ -]?power[_ -]?rails?/i,
    excludedRoleTest: /ldo|linear[_ -]?regulator|mcp1700|cjt1117|3\.3[_ -]?v[_ -]?regulator/i,
    functionClass: 'regulator',
    manufacturer: 'Texas Instruments',
    partNumber: 'TPS62160DSGR',
    footprint: {
      library: 'Package_SON',
      footprint: 'WSON-8-1EP_2x2mm_P0.5mm_EP0.9x1.6mm',
    },
    symbol: { library: 'Regulator_Switching', symbol: 'TPS62160DSG' },
    ratings: { voltageV: 17, currentA: 1.0 },
    packageEvidence: 'TI TPS62160DSGR: 1 A step-down converter in 8-pin WSON (DSG)',
    referenceEvidence: 'TI TPS62160 datasheet SLVSAM4; KiCad Regulator_Switching family + Package_SON WSON-8 (LV rail screening identity)',
    pinoutEvidence: 'TI DSG-8 TPS62160 pinout; local symbol TPS62160DSG when present',
  },
  {
    // INTENT: precision_adc is the same 16-bit delta-sigma role as optical ADC —
    // function-keyed (never product-named). optical_* stays first-class via the
    // same ADS1114 identity.
    roleTest: /photodiode[_ -]?(?:adc|converter)|optical[_ -]?(?:adc|measurement)|(?:^|[_ -])precision[_ -]?adc(?:$|[_ -])/i,
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
    // INTENT: Eye-Spy / OD path needs a real photodiode package, not ADC-as-detector.
    // GOTCHA: must NOT match photodiode_adc / optical_adc — those stay ADS1114.
    roleTest: /(?:^|[_ -])(?:od[_ -]?)?photodiode(?:$|[_ -])|optical[_ -]?detector|bpw34/i,
    excludedRoleTest: /photodiode[_ -]?(?:adc|converter)|optical[_ -]?(?:adc|measurement)|tia|transimpedance|amplifier/i,
    functionClass: 'sensor_ic',
    manufacturer: 'ams-OSRAM',
    partNumber: 'BPW34S',
    footprint: { library: 'OptoDevice', footprint: 'Osram_BPW34S-SMD' },
    symbol: { library: 'Device', symbol: 'D_Photo' },
    ratings: { voltageV: 32, currentA: 0.00005 },
    packageEvidence: 'ams-OSRAM BPW34S: silicon PIN photodiode in SMD package (BPW34 family)',
    referenceEvidence: 'Yuri Eye-Spy OD gold path (ADS1114 + op-amp + photodiode); ams-OSRAM BPW34S datasheet; KiCad OptoDevice:Osram_BPW34S-SMD',
    pinoutEvidence: 'two-terminal photodiode anode/cathode; local KiCad Device:D_Photo with OptoDevice:Osram_BPW34S-SMD',
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
    // INTENT: OD densify synthesizes od_photodiode_tia; zero-drift TIA is the
    // published Eye-Spy-class front-end (not Rodeostat TL072 current TIA).
    roleTest: /opa334|zero[_ -]?drift[_ -]?(?:shutdown[_ -]?)?(?:op[_ -]?amp|amplifier)|(?:^|[_ -])(?:od[_ -]?)?(?:photodiode[_ -]?)?(?:tia|transimpedance)(?:$|[_ -])|optical[_ -]?(?:tia|front[_ -]?end)/i,
    // GOTCHA: od_tia_feedback_resistor contains "…tia…" and would steal OPA334.
    excludedRoleTest: /current[_ -]?measurement[_ -]?tia|selectable[_ -]?gain[_ -]?tia|droplet[_ -]?feedback|feedback[_ -]?resistor|series[_ -]?resistor/i,
    functionClass: 'op_amp',
    manufacturer: 'Texas Instruments',
    partNumber: 'OPA334AIDBVR',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23-6' },
    symbol: { library: 'Amplifier_Operational', symbol: 'OPA334' },
    ratings: { voltageV: 5.5 },
    packageEvidence: 'TI OPA334AIDBVR: shutdown version in 6-pin SOT-23 DBV',
    referenceEvidence: 'Texas Instruments OPA334 Data Sheet SBOS213D and active OPA334AIDBVR product record; Eye-Spy OD gold path wants ADC + op-amp + photodiode',
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
    referenceEvidence: 'Forge host-HAT actuation drive fixture + TI DRV8876 datasheet SLVSF05; Pioreactor GPIO PWM1–4 stir/media contract',
    pinoutEvidence: 'TI PWP-16 pins 1=EN/IN1, 2=PH/IN2, 3=nSLEEP, 8=OUT1, 10=OUT2, 11=VM, 15=GND; curated Forge_Manufacturer:DRV8876PWPR',
  },
  {
    // INTENT: Host-HAT heater PWM low-side switch — NEVER matches heater_element /
    // ESR18 roles (those stay resistive loads on the FFC daughterboard).
    // Also covers bare power_switch (board-level load/power path FET).
    roleTest: /heater[_ -]?pwm[_ -]?(?:switch|mosfet)|(?:host[_ -]?hat[_ -]?)?heater[_ -]?drive[_ -]?mosfet|ao3400a|(?:^|[_ -])power[_ -]?switch(?:$|[_ -])/i,
    excludedRoleTest: /(?:cartridge|resistive)[_ -]?heater|heater[_ -]?element|esr18|reverse[_ -]?polarity/i,
    functionClass: 'switch',
    // GOTCHA: forge-truth library row is "Alpha & Omega Semiconductor Inc." —
    // "and" vs "&" must match includes() in resolveVerifiedFunctionCandidate.
    manufacturer: 'Alpha & Omega Semiconductor Inc.',
    partNumber: 'AO3400A',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23' },
    symbol: { library: 'Transistor_FET', symbol: 'Q_NMOS_GSD' },
    ratings: { voltageV: 30, currentA: 5.7 },
    packageEvidence: 'AOS AO3400A: N-channel 30 V logic-level MOSFET in SOT-23',
    referenceEvidence: 'Forge host-HAT actuation drive fixture heater_pwm_switch; AOS AO3400A datasheet',
    pinoutEvidence: 'SOT-23 1=G, 2=S, 3=D; curated Forge_Manufacturer:AO3400A',
  },
  {
    roleTest: /(?:od[_ -]?)?(?:led[_ -]?)?series[_ -]?resistor|od[_ -]?(?:front[_ -]?end[_ -]?)?feedback[_ -]?resistor|tia[_ -]?feedback[_ -]?r\b/i,
    excludedRoleTest: /(?:cartridge|resistive)[_ -]?heater|esr18|shunt/i,
    functionClass: 'passive_r',
    manufacturer: 'YAGEO',
    partNumber: 'RC0603FR-101KL',
    footprint: { library: 'Resistor_SMD', footprint: 'R_0603_1608Metric' },
    symbol: { library: 'Device', symbol: 'R' },
    ratings: { voltageV: 75 },
    packageEvidence: 'YAGEO RC0603FR-101KL: 100 kΩ 1% thick-film 0603',
    referenceEvidence: 'Universal OD densify companion for LED series / TIA feedback; forge-truth library row',
    pinoutEvidence: 'two-terminal 0603; local KiCad Device:R with Resistor_SMD:R_0603_1608Metric',
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
    // INTENT (Sol+Fable 2026-07-28): channel discharge/load MOSFETs and TEC
    // low-side switches share the same discrete power-FET identity — never a
    // gate-driver IC and never a 5 A SOT-23 PWM switch for ≥25 W stages.
    roleTest: /tec[_ -]?power[_ -]?mosfet[_ -]?constituent|discharge[_ -]?load[_ -]?mosfet|load[_ -]?switch[_ -]?mosfet|power[_ -]?mosfet|irlb3813pbf/i,
    excludedRoleTest: /h[_ -]?bridge[_ -]?tec[_ -]?driver[_ -]?word|heater[_ -]?pwm[_ -]?(?:switch|mosfet)|ao3400a/i,
    functionClass: 'power_mosfet',
    manufacturer: 'Infineon Technologies',
    partNumber: 'IRLB3813PBF',
    footprint: { library: 'Package_TO_SOT_THT', footprint: 'TO-220-3_Vertical' },
    symbol: { library: 'Transistor_FET', symbol: 'Q_NMOS_GDS' },
    ratings: { voltageV: 30, currentA: 120 },
    packageEvidence: 'Infineon IRLB3813PBF: three-lead TO-220AB, package-limited 120 A continuous current',
    referenceEvidence: 'Infineon IRLB3813PbF and frozen NinjaPCR Q1 TO220BV land pattern, revision 181768d6ec068a6dd68593042167699285744768; universal channel power-stage discrete FET',
    pinoutEvidence: 'Infineon TO-220AB leads 1=Gate, 2=Drain, 3=Source, tab=Drain',
  },
  {
    // INTENT (P3 floor-9 / Yuri transfer): multi-channel precision AFE + Kelvin
    // sense are the same op-amp function class as Rodeostat's TIA front-end —
    // never a DAC op-amp (OP07) and never an OD densify OPA334.
    roleTest: /precision[_ -]?afe|analog[_ -]?front[_ -]?end|(?:^|[_ -])afe(?:$|[_ -])|kelvin[_ -]?(?:voltage[_ -]?)?sense|current[_ -]?control[_ -]?loop/i,
    excludedRoleTest: /current[_ -]?measurement[_ -]?tia|selectable[_ -]?gain[_ -]?tia|opa334|dac[_ -]?output|droplet[_ -]?feedback/i,
    functionClass: 'op_amp',
    manufacturer: 'STMicroelectronics',
    partNumber: 'TL072CDT',
    footprint: { library: 'Package_SO', footprint: 'SOIC-8_3.9x4.9mm_P1.27mm' },
    symbol: { library: 'Amplifier_Operational', symbol: 'TL072' },
    ratings: { voltageV: 36 },
    packageEvidence: 'ST TL072CDT: dual low-noise JFET-input amplifier in SO-8',
    referenceEvidence: 'Rodeostat frozen high-current BOM LCSC C6961=TL072CDT (U9 TIA / sense front-end), revision 86e4708fea84f8fc33bcbfc9a706b06f4b770efd; universal channel precision AFE',
    pinoutEvidence: 'ST SO-8 pinout 1=OUT1, 2=IN1-, 3=IN1+, 4=VCC-, 5=IN2+, 6=IN2-, 7=OUT2, 8=VCC+; local KiCad Amplifier_Operational:TL072',
  },
  {
    // INTENT: channel current shunt is a low-ohm SMD sense resistor — not the
    // OD LED series 100 kΩ ballast and not a heater element.
    roleTest: /current[_ -]?shunt|sense[_ -]?shunt|shunt[_ -]?measurement|shunt[_ -]?resistor/i,
    excludedRoleTest: /(?:led[_ -]?series|series|feedback|front[_ -]?end[_ -]?feedback)[_ -]?resistor|heater[_ -]?element|cartridge[_ -]?heater/i,
    functionClass: 'passive_r',
    manufacturer: 'Vishay Dale',
    partNumber: 'WSL2512R0100FEA',
    footprint: { library: 'Resistor_SMD', footprint: 'R_2512_6332Metric' },
    symbol: { library: 'Device', symbol: 'R' },
    ratings: { voltageV: 5, currentA: 10 },
    packageEvidence: 'Vishay WSL2512R0100FEA: 10 mΩ 1% 1 W metal-strip current-sense in 2512',
    referenceEvidence: 'Vishay WSL2512 datasheet; universal channel current-shunt measurement role (Yuri transfer — function-keyed, not product-named)',
    pinoutEvidence: 'two-terminal 2512; local KiCad Device:R with Resistor_SMD:R_2512_6332Metric',
  },
  {
    // INTENT: cell bay NTC is a 10 kΩ thermistor passive — not TMP1075 digital IC
    // (that stays on culture_temperature_sensor). classifyFunction → passive_r.
    roleTest: /cell[_ -]?thermistor|thermistor[_ -]?input|(?:^|[_ -])ntc(?:$|[_ -])/i,
    excludedRoleTest: /(?:culture[_ -]?)?temperature[_ -]?(?:sensor|probe|ic)|tmp1075/i,
    functionClass: 'passive_r',
    manufacturer: 'Murata Electronics',
    partNumber: 'NCP15XH103F03RC',
    footprint: { library: 'Resistor_SMD', footprint: 'R_0402_1005Metric' },
    symbol: { library: 'Device', symbol: 'R_NTC' },
    ratings: { voltageV: 5 },
    packageEvidence: 'Murata NCP15XH103F03RC: 10 kΩ ±1% NTC thermistor in 0402',
    referenceEvidence: 'Murata NCP15XH103F03RC product data; universal per-channel cell thermistor input',
    pinoutEvidence: 'two-terminal 0402 NTC; local KiCad Device:R_NTC with Resistor_SMD:R_0402_1005Metric',
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
    roleTest: /status[_ -]?indicator(?:[_ -]?word)?|(?:^|[_ -])status[_ -]?led(?:$|[_ -])|kpt[_ -]?1608seck/i,
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
    // DECISION (2026-07-21): classifyFunction('debug_header') → debug_connector.
    // Tagging this rule as `connector` made every live HAT fall through to
    // PinHeader_1x04 (no-mpn). Keep connector as an alias in candidateRuleForRequest
    // for the frozen OpenDrop report requests that still say functionClass=connector.
    roleTest: /(?:^|[_ -])debug[_ -]?header[_ -]?word(?:$|[_ -])|ftsh[_ -]?105[_ -]?01[_ -]?l[_ -]?dv/i,
    excludedRoleTest: /debug[_ -]?uart/i,
    functionClass: 'debug_connector',
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
    // INTENT (2026-07-28 closure_honesty): channel OV/UV / overcurrent / overtemp
    // hardware trips share a dual comparator — never leave fillable-TBD when the
    // role is already on the board as package_family.
    roleTest: /over[_ -]?under[_ -]?voltage[_ -]?comparator|overcurrent[_ -]?comparator|overtemp[_ -]?trip|comparator[_ -]?latch/i,
    excludedRoleTest: /precision[_ -]?afe|kelvin|shunt|thermistor/i,
    functionClass: 'sensor_ic',
    manufacturer: 'Texas Instruments',
    partNumber: 'LM393DR',
    footprint: { library: 'Package_SO', footprint: 'SOIC-8_3.9x4.9mm_P1.27mm' },
    // GOTCHA: KiCad 8 ships LM393 under Comparator.kicad_sym (extends LM2903),
    // not Amplifier_Comparator — wrong library left every channel trip as package_family.
    symbol: { library: 'Comparator', symbol: 'LM393' },
    ratings: { voltageV: 36 },
    packageEvidence: 'TI LM393DR: dual differential comparator SO-8',
    referenceEvidence: 'universal channel hardware trip / window-comparator role; TI LM393 datasheet',
    pinoutEvidence: 'TI SO-8 dual comparator; local KiCad Comparator:LM393 (extends LM2903)',
  },
  {
    roleTest: /hardware[_ -]?cutout/i,
    excludedRoleTest: /optical|laser/i,
    functionClass: 'power_mosfet',
    manufacturer: 'Infineon Technologies',
    partNumber: 'IRLB3813PBF',
    footprint: { library: 'Package_TO_SOT_THT', footprint: 'TO-220-3_Vertical' },
    symbol: { library: 'Transistor_FET', symbol: 'Q_NMOS_GDS' },
    ratings: { voltageV: 30, currentA: 120 },
    packageEvidence: 'Infineon IRLB3813PBF TO-220AB — series cutout FET pair role',
    referenceEvidence: 'same discrete power-FET identity as channel discharge load (Yuri transfer)',
  },
  {
    roleTest: /linear[_ -]?discharge[_ -]?pass[_ -]?bank|discharge[_ -]?pass[_ -]?bank|pass[_ -]?bank/i,
    excludedRoleTest: /current[_ -]?shunt|sense[_ -]?shunt/i,
    functionClass: 'passive_r',
    manufacturer: 'Vishay Dale',
    partNumber: 'RH05010R00FE02',
    footprint: { library: 'Resistor_THT', footprint: 'R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal' },
    symbol: { library: 'Device', symbol: 'R' },
    ratings: { voltageV: 50, currentA: 2 },
    packageEvidence: 'Vishay RH050 10 Ω 50 W wirewound — linear pass/discharge bank element',
    referenceEvidence: 'universal linear discharge pass-bank role; Vishay RH chassis-mount family',
  },
  {
    roleTest: /charge[_ -]?current[_ -]?source|linear[_ -]?source[_ -]?sink[_ -]?stage|source[_ -]?sink[_ -]?stage/i,
    excludedRoleTest: /discharge[_ -]?load[_ -]?mosfet|pass[_ -]?bank/i,
    functionClass: 'regulator',
    manufacturer: 'Infineon Technologies',
    partNumber: 'IRLB3813PBF',
    footprint: { library: 'Package_TO_SOT_THT', footprint: 'TO-220-3_Vertical' },
    symbol: { library: 'Transistor_FET', symbol: 'Q_NMOS_GDS' },
    ratings: { voltageV: 30, currentA: 120 },
    packageEvidence: 'Infineon IRLB3813PBF — linear source/sink / charge-path power element',
    referenceEvidence: 'channel power-stage discrete FET (same family as discharge load); not a gate driver',
  },
  {
    roleTest: /iec[_ -]?c14|c14[_ -]?fused[_ -]?inlet|fused[_ -]?inlet/i,
    excludedRoleTest: /usb|dc[_ -]?jack/i,
    functionClass: 'connector',
    manufacturer: 'Schurter',
    partNumber: '6100.4215',
    footprint: { library: 'Connector', footprint: 'Screw_Terminal_01x03' },
    symbol: { library: 'Connector', symbol: 'Screw_Terminal_01x03' },
    ratings: { voltageV: 250, currentA: 10 },
    packageEvidence: 'Schurter 6100.4215: IEC C14 panel-mount inlet, 10 A / 250 VAC',
    referenceEvidence: 'universal benchtop mains inlet role; Schurter 6100 series',
  },
  {
    roleTest: /isolated[_ -]?ac[_ -]?dc[_ -]?power[_ -]?module|ac[_ -]?dc[_ -]?power[_ -]?module/i,
    excludedRoleTest: /dc[_ -]?dc|ldo|usb/i,
    functionClass: 'regulator',
    manufacturer: 'MEAN WELL',
    partNumber: 'RPS-500-12',
    footprint: { library: 'Converter_DCDC', footprint: 'Converter_DCDC_Generic' },
    symbol: { library: 'Converter_DCDC', symbol: 'Converter_DCDC_Generic' },
    ratings: { voltageV: 12, currentA: 41.7 },
    packageEvidence: 'MEAN WELL RPS-500-12: 500 W medical/ITE 12 V open-frame PSU',
    referenceEvidence: 'universal isolated AC-DC instrument supply; MEAN WELL RPS-500 datasheet',
  },
  {
    roleTest: /(?:per[_ -]?channel[_ -]?)?power[_ -]?heatsink|finned[_ -]?heatsink|(?:^|[_ -])heatsink(?:$|[_ -])/i,
    excludedRoleTest: /fan[_ -]?assembly|thermal[_ -]?interface/i,
    // DECISION: reuse passive_r as the closest existing class for a bought
    // thermal part (no thermal_sink FunctionClass yet). RoleTest is the gate.
    functionClass: 'passive_r',
    manufacturer: 'Fischer Elektronik',
    partNumber: 'SK 81 50 SA',
    footprint: { library: 'Heatsink', footprint: 'Heatsink_Fischer_SK81' },
    symbol: { library: 'Device', symbol: 'Heatsink' },
    ratings: {},
    packageEvidence: 'Fischer SK 81 50 SA: extruded finned heatsink for TO-220 / power stages',
    referenceEvidence: 'universal channel / TEC rejection heatsink role; Fischer Elektronik SK series',
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
    // GOTCHA: include usb_interface — mid-mount 12401548 from briefs must not win
    // over this SMT land (see atopile 12401548→12401610 remap).
    // GOTCHA (cold-v12): `usb_c_host_interface` — `host` sits between c and interface;
    // without (?:host[_ -]?)? the curated Amphenol never selects → Gate 38 unfit.
    roleTest: /usb[_ -]?(?:c[_ -]?)?(?:host[_ -]?)?(?:power[_ -]?entry|interface|connector|receptacle|port|entry)|type[_ -]?c(?:[_ -]?receptacle)?/i,
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
    // INTENT: OD optics host 4P and HAT-side OD mate share the BOOMELE 1.0T-4P
    // land (Open Colorimeter J1/J2 pinout: GND/3V3/SDA/SCL).
    roleTest: /source[_ -]?board[_ -]?connector|od[_ -]?host[_ -]?mate/i,
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
    functionClassMatchesRule(request.functionClass, candidate.functionClass, text)
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

/**
 * @description True when curated rule class matches the request class, including
 * the debug_header SWD alias (live = debug_connector, frozen report = connector).
 */
function functionClassMatchesRule(
  requestClass: string | null,
  ruleClass: string,
  roleTextBlob: string,
): boolean {
  if (requestClass == null) return false
  if (requestClass === ruleClass) return true
  // INTENT: OpenDrop punchlist report still requests functionClass=connector for
  // FTSH; live classifyFunction emits debug_connector — both must select FTSH.
  if (
    ruleClass === 'debug_connector'
    && requestClass === 'connector'
    && /debug[_ -]?header|ftsh/i.test(roleTextBlob)
  ) {
    return true
  }
  return false
}

function candidateRuleForRequest(request: VerifiedCandidateRequest): CandidateRule | null {
  const text = roleText(request)
  return CANDIDATE_RULES.find((candidate) =>
    functionClassMatchesRule(request.functionClass, candidate.functionClass, text)
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
