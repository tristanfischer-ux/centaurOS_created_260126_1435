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
    manufacturer: 'ST (Xianke / 先科)',
    partNumber: 'CS1E102M-CRI13',
    symbolId: 'Forge_Manufacturer:CS1E102M-CRI13',
    footprint: {
      library: 'Forge_Manufacturer',
      footprint: 'Panasonic_EEVFK1E102Q',
    },
    pins: [
      { number: '1', name: '+', kind: 'passive' },
      { number: '2', name: '-', kind: 'passive' },
    ],
    provenance: 'Seeed OPL 302030098 / LCSC C123705: CS1E102M-CRI13 is 1000 uF 25 V polar SMD D12.5xL13.5; frozen NinjaPCR CAP_SMD_AL_D125 land geometry; https://www.lcsc.com/product-detail/C123705.html',
  },
  {
    manufacturer: 'GOOSVN (Ningbo Gosun Technology)',
    partNumber: 'GS012S-3.5-02P-11',
    symbolId: 'Forge_Manufacturer:GS012S-3.5-02P-11',
    footprint: {
      library: 'Forge_Manufacturer',
      footprint: 'GOOSVN_GS012S_3.5_02P',
    },
    pins: [
      { number: '1', name: 'A', kind: 'passive' },
      { number: '2', name: 'B', kind: 'passive' },
    ],
    provenance: 'Seeed OPL 320110028 maps to GS012S-3.5-02P-11; Gosun GS012S series 2-position 3.5 mm screw terminal, contacts 1/2; http://www.gosun-tech.com/Products-GS012S.htm',
  },
  {
    manufacturer: 'Samtec',
    partNumber: 'TSW-104-07-T-S',
    symbolId: 'Forge_Manufacturer:TSW-104-07-T-S',
    footprint: {
      library: 'Connector_PinHeader_2.54mm',
      footprint: 'PinHeader_1x04_P2.54mm_Vertical',
    },
    pins: [
      { number: '1', name: 'TXD', kind: 'bidirectional' },
      { number: '2', name: 'RXD', kind: 'bidirectional' },
      { number: '3', name: 'GND', kind: 'power_in' },
      { number: '4', name: '3V3', kind: 'power_in' },
    ],
    provenance: 'Samtec TSW 1x4 2.54 mm header; frozen NinjaPCR SERIAL4 PINHD-1X4 nets TXD/RXD/GND/3V3; https://www.samtec.com/products/tsw',
  },
  {
    manufacturer: 'Samtec',
    partNumber: 'FTSH-105-01-L-DV',
    symbolId: 'Forge_Manufacturer:FTSH-105-01-L-DV',
    footprint: {
      library: 'Connector_PinHeader_1.27mm',
      footprint: 'PinHeader_2x05_P1.27mm_Vertical_SMD',
    },
    pins: [
      { number: '1', name: 'SWDIO', kind: 'bidirectional' },
      { number: '2', name: 'SWCLK', kind: 'input' },
      { number: '3', name: 'GND', kind: 'power_in' },
      { number: '4', name: 'RESET', kind: 'input' },
      { number: '5', name: 'GND', kind: 'power_in' },
      { number: '6', name: '3V3', kind: 'power_in' },
      { number: '7', name: 'NC', kind: 'passive' },
      { number: '8', name: 'NC', kind: 'passive' },
      { number: '9', name: 'GND', kind: 'power_in' },
      { number: '10', name: 'NC', kind: 'passive' },
    ],
    provenance: 'Samtec FTSH-105-01-L-DV 2x5 1.27 mm SMD header; frozen OpenDrop J2 Conn_02x05 SWD nets; https://www.samtec.com/products/ftsh',
  },
  {
    manufacturer: 'Murata Manufacturing',
    partNumber: 'BLM18PG121SN1D',
    symbolId: 'Device:Ferrite_Bead',
    footprint: { library: 'Inductor_SMD', footprint: 'L_0603_1608Metric' },
    pins: [
      { number: '1', name: '1', kind: 'passive' },
      { number: '2', name: '2', kind: 'passive' },
    ],
    provenance: 'Murata BLM18PG121SN1D 0603 ferrite; OpenDrop V4 FB1-FB8 L_0603_1608Metric land; https://www.murata.com/en-us/products/productdetail?partno=BLM18PG121SN1%23',
  },
  {
    manufacturer: 'Kingbright',
    partNumber: 'KPT-1608CGCK',
    symbolId: 'Device:LED',
    footprint: { library: 'LED_SMD', footprint: 'LED_0603_1608Metric' },
    pins: [
      { number: '1', name: 'K', kind: 'passive' },
      { number: '2', name: 'A', kind: 'passive' },
    ],
    provenance: 'Kingbright KPT-1608CGCK 0603 green LED; OpenDrop LED1 land pattern; https://www.kingbrightusa.com/PDF/KPT-1608CGCK.pdf',
  },
  {
    manufacturer: 'Kingbright',
    partNumber: 'KPT-1608SECK',
    symbolId: 'Device:LED',
    footprint: { library: 'LED_SMD', footprint: 'LED_0603_1608Metric' },
    pins: [
      { number: '1', name: 'K', kind: 'passive' },
      { number: '2', name: 'A', kind: 'passive' },
    ],
    provenance: 'Kingbright KPT-1608SECK 0603 orange LED; OpenDrop LED2/LED3 land pattern; https://www.kingbrightusa.com/PDF/KPT-1608SECK.pdf',
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
    manufacturer: 'Samtec',
    partNumber: 'SSQ-120-03-T-D',
    symbolId: 'Forge_Manufacturer:SSQ-120-03-T-D',
    footprint: {
      library: 'Connector_PinSocket_2.54mm',
      footprint: 'PinSocket_2x20_P2.54mm_Vertical',
    },
    pins: [
      { number: '1', name: '3V3', kind: 'power_in' },
      { number: '2', name: '5V', kind: 'power_in' },
      { number: '3', name: 'GPIO2_SDA', kind: 'bidirectional' },
      { number: '4', name: '5V', kind: 'power_in' },
      { number: '5', name: 'GPIO3_SCL', kind: 'bidirectional' },
      { number: '6', name: 'GND', kind: 'power_in' },
      { number: '7', name: 'GPIO4_BUTTON', kind: 'bidirectional' },
      { number: '8', name: 'GPIO14_TXD', kind: 'bidirectional' },
      { number: '9', name: 'GND', kind: 'power_in' },
      { number: '10', name: 'GPIO15_RXD', kind: 'bidirectional' },
      { number: '11', name: 'GPIO17_PWM1', kind: 'bidirectional' },
      { number: '12', name: 'GPIO18_PWM5_HEATER', kind: 'bidirectional' },
      { number: '13', name: 'GPIO27', kind: 'bidirectional' },
      { number: '14', name: 'GND', kind: 'power_in' },
      { number: '15', name: 'GPIO22', kind: 'bidirectional' },
      { number: '16', name: 'GPIO23_PCB_LED', kind: 'bidirectional' },
      { number: '17', name: '3V3', kind: 'power_in' },
      { number: '18', name: 'GPIO24_SWDIO', kind: 'bidirectional' },
      { number: '19', name: 'GPIO10_MOSI', kind: 'bidirectional' },
      { number: '20', name: 'GND', kind: 'power_in' },
      { number: '21', name: 'GPIO9_MISO', kind: 'bidirectional' },
      { number: '22', name: 'GPIO25_SWCLK', kind: 'bidirectional' },
      { number: '23', name: 'GPIO11_SCLK', kind: 'bidirectional' },
      { number: '24', name: 'GPIO8_CE0', kind: 'bidirectional' },
      { number: '25', name: 'GND', kind: 'power_in' },
      { number: '26', name: 'GPIO7_CE1', kind: 'bidirectional' },
      { number: '27', name: 'ID_SD', kind: 'bidirectional' },
      { number: '28', name: 'ID_SC', kind: 'bidirectional' },
      { number: '29', name: 'GPIO5', kind: 'bidirectional' },
      { number: '30', name: 'GND', kind: 'power_in' },
      { number: '31', name: 'GPIO6', kind: 'bidirectional' },
      { number: '32', name: 'GPIO12_PWM4', kind: 'bidirectional' },
      { number: '33', name: 'GPIO13_PWM2', kind: 'bidirectional' },
      { number: '34', name: 'GND', kind: 'power_in' },
      { number: '35', name: 'GPIO19', kind: 'bidirectional' },
      { number: '36', name: 'GPIO16_PWM3', kind: 'bidirectional' },
      { number: '37', name: 'GPIO26', kind: 'bidirectional' },
      { number: '38', name: 'GPIO20', kind: 'bidirectional' },
      { number: '39', name: 'GND', kind: 'power_in' },
      { number: '40', name: 'GPIO21_HALL', kind: 'bidirectional' },
    ],
    provenance: 'Samtec SSQ-TH series print and SSQ-120-03-T-D product record define a 2x20, 2.54 mm, through-hole, double-row socket; Pioreactor frozen HAT v1.2 evidence and GPIO contract map physical pins 18/22 to GPIO24 SWDIO/GPIO25 SWCLK and the remaining Raspberry Pi 40-pin header contacts; https://suddendocs.samtec.com/catalog_english/ssq_th.pdf; https://docs.pioreactor.com/developer-guide/pinout',
  },
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
  {
    manufacturer: 'Texas Instruments',
    partNumber: 'ADS1114IDGSR',
    symbolId: 'Analog_ADC:ADS1114IDGS',
    footprint: { library: 'Package_SO', footprint: 'TSSOP-10_3x3mm_P0.5mm' },
    pins: [
      { number: '1', name: 'ADDR', kind: 'input' },
      { number: '2', name: 'ALERT/RDY', kind: 'output' },
      { number: '3', name: 'GND', kind: 'power_in' },
      { number: '4', name: 'AIN0', kind: 'input' },
      { number: '5', name: 'AIN1', kind: 'input' },
      // GOTCHA: ADS1114 (not 1115) exposes AIN0/AIN1 only — DGS pins 6–7 are NC.
      { number: '6', name: 'NC', kind: 'nc' },
      { number: '7', name: 'NC', kind: 'nc' },
      { number: '8', name: 'VDD', kind: 'power_in' },
      { number: '9', name: 'SDA', kind: 'bidirectional' },
      { number: '10', name: 'SCL', kind: 'input' },
    ],
    provenance:
      'TI ADS111x SBAS444E DGS-10 pinout + Pioreactor Eye-Spy frozen BOM U2 @ ca40a91e; ' +
      'https://www.ti.com/lit/ds/symlink/ads1114.pdf',
  },
  {
    manufacturer: 'Texas Instruments',
    partNumber: 'TMP1075DSGR',
    symbolId: 'Forge_Manufacturer:TMP1075DSGR',
    footprint: {
      library: 'Package_SON',
      footprint: 'WSON-8-1EP_2x2mm_P0.5mm_EP0.9x1.6mm',
    },
    pins: [
      { number: '1', name: 'A0', kind: 'input' },
      { number: '2', name: 'A1', kind: 'input' },
      { number: '3', name: 'A2', kind: 'input' },
      { number: '4', name: 'ALERT', kind: 'output' },
      { number: '5', name: 'GND', kind: 'power_in' },
      { number: '6', name: 'SDA', kind: 'bidirectional' },
      { number: '7', name: 'SCL', kind: 'input' },
      { number: '8', name: 'V+', kind: 'power_in' },
      { number: '9', name: 'EP', kind: 'passive' },
    ],
    provenance: 'TI TMP1075 datasheet SBOS858 DSG (WSON-8) pinout + Pioreactor heater_20ml BOM U1 @ ca40a91e; https://www.ti.com/lit/ds/symlink/tmp1075.pdf',
  },
  {
    manufacturer: 'Texas Instruments',
    partNumber: 'DRV5021A3QDBZR',
    symbolId: 'Forge_Manufacturer:DRV5021A3QDBZR',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23' },
    pins: [
      { number: '1', name: 'OUT', kind: 'output' },
      { number: '2', name: 'VCC', kind: 'power_in' },
      { number: '3', name: 'GND', kind: 'power_in' },
    ],
    provenance: 'TI DRV5021 datasheet SLVSE41 DBZ (SOT-23) pinout + Pioreactor heater_20ml BOM U2 @ ca40a91e; https://www.ti.com/lit/ds/symlink/drv5021.pdf',
  },
  {
    manufacturer: 'Rohm',
    partNumber: 'ESR18EZPJ3R9',
    symbolId: 'Forge_Manufacturer:ESR18EZPJ3R9',
    footprint: { library: 'Resistor_SMD', footprint: 'R_1206_3216Metric' },
    pins: [
      { number: '1', name: '1', kind: 'passive' },
      { number: '2', name: '2', kind: 'passive' },
    ],
    provenance: 'Rohm ESR18 thick-film 1206 two-terminal resistor + Pioreactor heater_20ml BOM R12–R28 @ ca40a91e',
  },
  {
    manufacturer: 'ams-OSRAM',
    partNumber: 'BPW34S',
    symbolId: 'Forge_Manufacturer:BPW34S',
    footprint: { library: 'OptoDevice', footprint: 'Osram_BPW34S-SMD' },
    pins: [
      { number: '1', name: 'K', kind: 'passive' },
      { number: '2', name: 'A', kind: 'passive' },
    ],
    provenance: 'ams-OSRAM BPW34S SMD PIN photodiode two-terminal K/A; KiCad OptoDevice:Osram_BPW34S-SMD; Eye-Spy OD densify companion',
  },
  {
    // INTENT: Gold Heater - SCH.pdf @ ca40a91e labels J1 pins 1/2/5/6/7 as
    // RES_A/RES_B/I2C_SCL/I2C_SDA/HALL_OUT. Pins 3/4 are the only remaining
    // contacts and are the sole power entry for TMP1075+DRV5021 → +3V3/GND.
    manufacturer: 'Molex',
    partNumber: '52207-0760',
    symbolId: 'Forge_Manufacturer:52207-0760',
    footprint: {
      library: 'Connector_FFC-FPC',
      footprint: 'Molex_200528-0070_1x07-1MP_P1.00mm_Horizontal',
    },
    pins: [
      { number: '1', name: 'RES_A', kind: 'passive' },
      { number: '2', name: 'RES_B', kind: 'passive' },
      { number: '3', name: '3V3', kind: 'power_in' },
      { number: '4', name: 'GND', kind: 'power_in' },
      { number: '5', name: 'I2C_SCL', kind: 'bidirectional' },
      { number: '6', name: 'I2C_SDA', kind: 'bidirectional' },
      { number: '7', name: 'HALL_OUT', kind: 'output' },
    ],
    provenance:
      'Pioreactor heater_20ml Heater - SCH.pdf J1 0522070760 @ ca40a91e: RES_A/RES_B/I2C_SCL/I2C_SDA/HALL_OUT on pins 1/2/5/6/7; pins 3/4 inferred +3V3/GND (no other power connector on daughterboard)',
  },
  {
    manufacturer: 'Alpha & Omega Semiconductor Inc.',
    partNumber: 'AO3400A',
    symbolId: 'Forge_Manufacturer:AO3400A',
    footprint: { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23' },
    pins: [
      { number: '1', name: 'G', kind: 'input' },
      { number: '2', name: 'S', kind: 'passive' },
      { number: '3', name: 'D', kind: 'passive' },
    ],
    provenance:
      'AOS AO3400A SOT-23 N-channel MOSFET pinout 1=G, 2=S, 3=D; Forge host-HAT heater PWM low-side switch (never on heater_20ml gold)',
  },
  {
    manufacturer: 'Texas Instruments',
    partNumber: 'DRV8876PWPR',
    symbolId: 'Forge_Manufacturer:DRV8876PWPR',
    footprint: {
      library: 'Package_SO',
      footprint: 'HTSSOP-16-1EP_4.4x5mm_P0.65mm_EP3.4x5mm',
    },
    pins: [
      { number: '1', name: 'EN_IN1', kind: 'input' },
      { number: '2', name: 'PH_IN2', kind: 'input' },
      { number: '3', name: 'nSLEEP', kind: 'input' },
      { number: '4', name: 'nFAULT', kind: 'output' },
      { number: '5', name: 'VREF', kind: 'input' },
      { number: '6', name: 'IPROPI', kind: 'output' },
      { number: '7', name: 'IMODE', kind: 'input' },
      { number: '8', name: 'OUT1', kind: 'output' },
      { number: '9', name: 'PGND', kind: 'power_in' },
      { number: '10', name: 'OUT2', kind: 'output' },
      { number: '11', name: 'VM', kind: 'power_in' },
      { number: '12', name: 'VCP', kind: 'passive' },
      { number: '13', name: 'CPH', kind: 'passive' },
      { number: '14', name: 'CPL', kind: 'passive' },
      { number: '15', name: 'GND', kind: 'power_in' },
      { number: '16', name: 'PMODE', kind: 'input' },
      { number: '17', name: 'EP', kind: 'passive' },
    ],
    provenance:
      'TI DRV8876 datasheet SLVSF05 PWP (HTSSOP-16) pinout; Forge host-HAT stir/pump drive — https://www.ti.com/lit/ds/symlink/drv8876.pdf',
  },
] as const

function normalized(value: string): string {
  return value.trim().toLowerCase()
}

/** INTENT: Distributor-cache hits are not placement authority. Some verified MPNs
 *  are panel/industrial parts that must never land on a PCBA role footprint. */
const PCB_MPN_DENYLIST = new Map<string, string>([
  [
    normalized('4-2489541-7'),
    '4-2489541-7 is a 110 V DC panel indicator — not an SMD PCB LED; deny placement even if distributor cache verifies the MPN',
  ],
])

/**
 * @description Returns a human reason if this MPN must not be placed on a PCB, else null.
 * @param partNumber Catalogue / BoM part number
 * @returns Deny reason string, or null when placement may proceed
 */
export function isDeniedPcbMpn(partNumber: string | null | undefined): string | null {
  if (!partNumber) return null
  return PCB_MPN_DENYLIST.get(normalized(partNumber)) ?? null
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
