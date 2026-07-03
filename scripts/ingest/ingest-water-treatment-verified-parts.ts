#!/usr/bin/env npx tsx
/**
 * scripts/ingest/ingest-water-treatment-verified-parts.ts — curated, WEB-VERIFIED
 * water-treatment parts ingest into pretraining_extracted_parts (the growing-DB
 * principle: DB-first → search-on-miss → VERIFY → write-back class-tagged).
 *
 * WHY (2026-07-03): out/fischer-codema-v56d ships 76/83 bought-out BoM lines with
 * MPN 'TBD (detailed design)' (−3.7 on the Bill of Materials tab). Concept-stage
 * practice is an INDICATIVE real part per line. Every row below was verified on a
 * manufacturer/distributor page ACTUALLY FETCHED on 2026-07-03 (URL in src field
 * + source_doc_id). The true v56d fill-blank-mpn baseline resolves 0 honest fills
 * (its 4 DB hits are class-alien mis-pins: a Daikin pressure SWITCH pinned as the
 * RO high-pressure PUMP, a Sartorius bioprocess part as the PRV, etc.) — these
 * rows outrank those mis-pins with family-coherent parts.
 *
 * Family-coherence discipline (gate-20 / the PAC-SH71DS lesson): each MPN's
 * product family matches the part class — pumps get pump MPNs, a softener valve
 * gets a softener-valve MPN, never an unrelated accessory. Duty is matched within
 * band and carried in raw_excerpt.desc so the fill-blank capacity gate
 * (partFlowCapacityM3h) can read it — the CM3-3 3 m³/h-on-90 m³/h lesson.
 *
 * Rows are embedded at insert (text-embedding-3-small, 1536-d Float32LE, the
 * canonical [part_name, manufacturer, part_number, raw_excerpt] recipe) so the
 * Stage 17.6 cosine RAG serves them immediately; degrades to NULL embedding when
 * OPENAI_API_KEY is absent (backfill-embeddings.ts sweeps those).
 *
 * Idempotent: skips any (manufacturer, part_number) already present.
 * DRY-RUN by default; --commit writes. No live distributor calls (chain-as-DB-
 * consumer rule untouched — this is a curated seed, not an API sweep).
 *
 * Usage:
 *   npx tsx scripts/ingest/ingest-water-treatment-verified-parts.ts            # dry-run
 *   npx tsx scripts/ingest/ingest-water-treatment-verified-parts.ts --commit
 *
 * British spelling throughout.
 */
import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const CLASS_TAG = 'water_treatment'
const DISCOVERY_SOURCE = 'web_verified_ingest'
const COMMIT = process.argv.includes('--commit')

interface VerifiedPart {
  part_name: string          // slot-vocabulary name (what the engine calls the part)
  manufacturer: string
  part_number: string        // real catalogue MPN / product number / series id
  desc: string               // duty + spec, honest datasheet numbers (m3/h kept parseable)
  src: string                // the page actually fetched + verified 2026-07-03
  unit_price_gbp: number | null // GBP-quoted list prices only; NULL when page quoted USD/EUR
  /** Per-row component_class override. Default CLASS_TAG ('water_treatment').
   *  Needed for MOTION-typed slots: dbHitAcceptableForWord (emitter-completion.ts)
   *  REJECTS a motor/drive-token word unless the candidate's component_class
   *  matches /motor_actuator|mechanical_assembly/ — so a drive motor / motor-
   *  overload row tagged 'water_treatment' would be type-rejected for the very
   *  slot it exists to serve. */
  component_class?: string
}

const PARTS: VerifiedPart[] = [
  // ── Pumps (duty-banded; flow in desc feeds partFlowCapacityM3h) ─────────────
  {
    part_name: 'Irrigation / process water transfer pump — end-suction, 127 m3/h @ 33.4 m, 15 kW',
    manufacturer: 'Grundfos', part_number: '96539165',
    desc: 'NBE 65-160/173 A-F-A-GQQE single-stage end-suction centrifugal pump, rated 127 m3/h @ 33.4 m head, P2 15 kW, 3x380-415 V, variable speed 360-2910 rpm. Indicative for a 90 m3/h @ ~35 m irrigation duty.',
    src: 'https://www.lenntech.es/uploads/grundfos/96539165/Grundfos_NBE-65-160-173-A-F-A-GQQE.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'Hand watering / wash-down pump — horizontal multistage, 22 m3/h, 4 kW',
    manufacturer: 'Grundfos', part_number: '96935501',
    desc: 'CM25-2 A-R-A-E-AVBE horizontal multistage centrifugal pump, rated 22 m3/h, P2 4 kW, 3x400 V 50 Hz. Indicative for a 25 m3/h hand-watering duty.',
    src: 'https://www.lenntech.com/uploads/grundfos/96935501/Grundfos_CM25-2-A-R-A-E-AVBE.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'RO membrane high-pressure feed pump — vertical multistage, 17 m3/h @ 44.8 m, 4 kW',
    manufacturer: 'Grundfos', part_number: '96502039',
    desc: 'CRN 15-4 A-P-A-V-HQQV vertical multistage centrifugal pump, all-316 wetted parts, rated 17 m3/h @ 44.8 m, P2 4 kW. Indicative RO membrane-bank feed pump for a 4 kW high-pressure duty.',
    src: 'https://www.lenntech.com/uploads/grundfos/96502039/Grundfos_CRN-15-4-A-P-G-V-HQQV.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'Backwash pump — filter backwash duty, end-suction, 20.4 m3/h @ 31.9 m, 3 kW',
    manufacturer: 'Grundfos', part_number: '97836723',
    desc: 'NB 32-160.1/169 A-F2-A-E-BAQE end-suction centrifugal pump, rated 20.4 m3/h @ 31.9 m, P2 3 kW. Indicative cloth/media filter backwash pump.',
    src: 'https://www.lenntech.com/uploads/grundfos/97836723/Grundfos_NB-32-160-1-169-A-F2-A-E-BAQE.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'Fertigation dosing / injection pump — vertical multistage, 30 m3/h @ 53.1 m, 7.5 kW',
    manufacturer: 'Grundfos', part_number: '96122012',
    desc: 'CR 32-4-2 A-F-A-E-HQQE vertical multistage centrifugal pump, rated 30 m3/h @ 53.1 m, P2 7.5 kW, 3x400/690 V. Indicative fertigation-unit irrigation/injection pump for an 8 kW duty.',
    src: 'https://www.lenntech.com/uploads/grundfos/96122012/Grundfos_CR-32-4-2-A-F-A-E-HQQE.pdf',
    unit_price_gbp: null,
  },
  // ── Valves ───────────────────────────────────────────────────────────────────
  {
    part_name: 'Backwash / service valve nest — automatic multiport filter backwash valve (flow-reversal service)',
    manufacturer: 'Praher', part_number: 'AQUASTAR 4000',
    desc: 'Praher AQUASTAR 4000 automatic 6-way backwash/service valve (ref 104095), pressure-switch triggered, IP65, multi-voltage 12-230 V, fits 1.5-2 in Ocean V6 filter valves. One unit replaces the manual backwash valve set of a media filter. EUR 1,209 incl VAT indicative.',
    src: 'https://www.swimming-pool-online.com/praher-aquastar-automatic-multiway-valve.html',
    unit_price_gbp: null,
  },
  {
    part_name: 'Softener inlet / service flow control valve — top-mount softener control valve, 2 in, 24 m3/h continuous',
    manufacturer: 'Pentair Fleck', part_number: '2900S',
    desc: 'Fleck 2900S 2-inch softener/filter control valve, lead-free brass body, 106 GPM (24 m3/h) continuous service flow, 36 GPM backwash, 3- or 5-cycle control, tanks to 36 in. Indicative for a 15 m3/h softener vessel inlet/service control.',
    src: 'https://www.pentair.com/en-us/water-treatment-components/valves/2900s_valve.html',
    unit_price_gbp: null,
  },
  {
    part_name: 'Pneumatic control valve — 2-way globe control valve, DN10-100',
    manufacturer: 'Bürkert', part_number: 'Type 2301',
    desc: 'Bürkert Type 2301 pneumatically operated 2-way globe control valve, DN10-DN100 / NPS 3/8-4, several Kvs per port size via removable seats. Indicative modulating process control valve.',
    src: 'https://www.processinstrumentsolutions.co.uk/wp-content/uploads/2021/04/Burkert-Type-2301-Pneumatically-operated-2-way-Globe-Control-Valve-datasheet.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'Pneumatic actuated valve — 2/2-way angle-seat section valve, DN10-80',
    manufacturer: 'Bürkert', part_number: 'Type 2000',
    desc: 'Bürkert Type 2000 CLASSIC pneumatically operated 2/2-way angle-seat valve, DN10-DN80 / NPS 3/8-3, stainless body options. Indicative irrigation-section actuated valve (200-valve fertigation groups).',
    src: 'https://24905721.fs1.hubspotusercontent-eu1.net/hubfs/24905721/Interfluid/files/Type%202000%20-%20Pneumatically%20operated%202-2-way%20angle%20seat%20valve_Burkert.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'Pressure relief / safety valve — spring-loaded, gunmetal, DN15-50',
    manufacturer: 'Goetze', part_number: 'Series 851',
    desc: 'Goetze series 851 spring-loaded safety/pressure-relief valve, gunmetal angle-type, DN15-DN50 (1/2-2 in), set pressures 7-725 psi (0.5-50 bar), -60 to +225 C. Factory-set and sealed. Indicative line/vessel protection valve.',
    src: 'https://www.goetze-group.com/en-us/products/industry/851-s5716.html',
    unit_price_gbp: null,
  },
  // ── Field instruments ────────────────────────────────────────────────────────
  {
    part_name: 'Low-pressure switch — process pressure switch, -0.2 to 8 bar',
    manufacturer: 'Danfoss', part_number: '060-121966',
    desc: 'Danfoss KPI35 pressure switch, regulation range -0.2 to 8 bar, differential 0.5-2 bar, SPDT, 1/4 in BSP, IP30, max 18 bar, automatic reset. Indicative pump-protection low-pressure switch. GBP 75.75 ex VAT.',
    src: 'https://www.mandmcontrols.com/060-121966-danfoss-kpi35-pressure-switch-0-2-to-8-bar',
    unit_price_gbp: 75.75,
  },
  {
    part_name: 'Level transmitter — hydrostatic, 0-4 m water column (600 mbar cell), 4-20 mA HART',
    manufacturer: 'Endress+Hauser', part_number: 'Waterpilot FMX21',
    desc: 'E+H Waterpilot FMX21 submersible hydrostatic level transmitter, ceramic cell, ranges incl. 600 mbar (0-6 m) covering a 0-4 m tank duty, 4-20 mA HART, level+temperature. From USD 1,120.94 (Instrumart).',
    src: 'https://www.instrumart.com/products/45766/eh-waterpilot-fmx21-level-transmitter',
    unit_price_gbp: null,
  },
  {
    part_name: 'Pressure transmitter — 0-7 bar (0-100 psi), 4-20 mA, G1/4',
    manufacturer: 'WIKA', part_number: '50372475',
    desc: 'WIKA A-10 general-industrial pressure transmitter, 0-100 psi (~0-6.9 bar) covering a 0-5 bar duty, 4-20 mA 2-wire, 316L wetted parts. USD 137.50 (Kinequip).',
    src: 'https://kinequip.com/products/wika-50372475-a-10-100psi-4-20ma-electronic-pressure-transmitter/',
    unit_price_gbp: null,
  },
  {
    part_name: 'pH analyser / multiparameter transmitter — pH/ORP, 2-channel Memosens',
    manufacturer: 'Endress+Hauser', part_number: 'Liquiline CM442',
    desc: 'E+H Liquiline CM442 1-/2-channel multiparameter transmitter for pH, ORP, conductivity, oxygen, chlorine (Memosens). Indicative pH control analyser (pH 0-14, 0.3 control band). USD 2,456.21 base (Instrumart).',
    src: 'https://www.instrumart.com/products/46140/eh-liquiline-cm442-transmitter',
    unit_price_gbp: null,
  },
  {
    part_name: 'pH analyser — universal water-quality controller with pH/ORP sensor inputs, 4-20 mA + HART',
    manufacturer: 'Hach', part_number: 'LXV404.99.05112',
    desc: 'Hach SC200 universal controller, 100-240 V AC, two analog pH/ORP/DO sensor inputs, two 4-20 mA outputs, HART/Modbus RTU. Indicative pH analyser/controller for a pH 0-14 loop with 0.3 control band.',
    src: 'https://www.hach.com/p-sc200-universal-controller-100-240-v-ac-with-two-analog-phorpdo-sensor-inputs-hart-and-two-4-20ma-outputs/LXV404.99.05112',
    unit_price_gbp: null,
  },
  // ── Packaged process equipment ───────────────────────────────────────────────
  {
    part_name: 'UV disinfection system — drinking-water UV reactor, up to 49 m3/h',
    manufacturer: 'WEDECO (Xylem)', part_number: 'Spektron 30e',
    desc: 'WEDECO Spektron 30e UV disinfection system, max flow 49 m3/h, ECORAY lamps, OeNORM/DVGW-certified drinking-water disinfection. Indicative in-line UV skid for a 15-25 m3/h irrigation-water duty.',
    src: 'https://almex-bg.com/storage/6/4/406/5ccbbd67e258d2ae847e403868f59322.pdf',
    unit_price_gbp: null,
  },
  // ── Electrical / control ─────────────────────────────────────────────────────
  {
    part_name: 'Control + instrument UPS — 5000 VA / 4500 W double-conversion tower',
    manufacturer: 'Eaton', part_number: '9SX5KI',
    desc: 'Eaton 9SX 5000i tower UPS, 5000 VA / 4500 W online double-conversion, hardwired, up to 95% efficiency, hot-swap battery modules. GBP 2,765 ex VAT (VPS UPS). Indicative control/instrument UPS at 5 kVA.',
    src: 'https://www.vps-ups.co.uk/eaton-9sx-5000va-tower.html',
    unit_price_gbp: 2765,
  },
  {
    part_name: 'SCADA / plant control system — horticultural irrigation and fertigation process computer',
    manufacturer: 'Hoogendoorn', part_number: 'iSii',
    desc: 'Hoogendoorn iSii all-in-one process computer for greenhouse climate, water (irrigation/fertigation, EC/pH control) and energy management; the control-system class the brief names (iSii-class). Integrates sensors, alarms, remote access.',
    src: 'https://hoogendoorn.com/en/our-solutions/isii',
    unit_price_gbp: null,
  },
  {
    part_name: 'PLC controller, plant control CPU — SIMATIC S7-1200 CPU 1212C DC/DC/DC',
    manufacturer: 'Siemens', part_number: '6ES7212-1AE40-0XB0',
    desc: 'Siemens SIMATIC S7-1200 CPU 1212C compact PLC, 8 DI / 6 DO / 2 AI, 75 kB memory, PROFINET. Indicative skid PLC controller. (The 1214C/1215C siblings are already in the library as electronic_pcb rows without slot vocabulary.)',
    src: 'https://media.automation24.com/datasheet/se/6ES72121AE400XB0.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'Modbus RTU interface module — RS422/485 communication module for S7-1200',
    manufacturer: 'Siemens', part_number: '6ES7241-1CH32-0XB0',
    desc: 'Siemens CM 1241 RS422/485 communication module, 9-pin sub-D, Modbus RTU master/slave + Freeport/USS, for SIMATIC S7-1200. Indicative Modbus interface.',
    src: 'https://media.automation24.com/datasheet/se/6ES72411CH320XB0.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'Remote monitoring gateway — industrial IIoT VPN gateway and remote-access router',
    manufacturer: 'HMS Networks (Ewon)', part_number: 'FLEXY20500_00MA',
    desc: 'Ewon Flexy 205 multipurpose IIoT data gateway + remote access VPN router, 4x RJ45 LAN/WAN, OPC UA, PLC data collection. Indicative remote monitoring gateway. ~USD 1,243 (Applied Automation).',
    src: 'https://media.hms-networks.com/image/upload/v1749046856/Documents/Generated_Datasheets/Production/en/hms-FLEXY20500_00MA-en-Ewon-Flexy-205.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'Control-panel power supply unit — 24 V DC 10 A DIN-rail, single-phase',
    manufacturer: 'Phoenix Contact', part_number: '2904601',
    desc: 'Phoenix Contact QUINT4-PS/1AC/24DC/10 primary-switched power supply, 100-240 V AC in, 24 V DC 10 A (240 W) out, SFB technology, DIN rail, -40 to +70 C. USD 300.23 (RSP Supply). Indicative panel PSU.',
    src: 'https://rspsupply.com/p-36888-phoenix-contact-2904601-power-supply-quint4-ps1ac24dc10.aspx',
    unit_price_gbp: null,
  },
  {
    part_name: 'Emergency stop switch station — safety mushroom pushbutton 38 mm, pull-to-release, 1NC+1NO (ISO 13850)',
    manufacturer: 'Eaton', part_number: '216516',
    desc: 'Eaton M22-PV/K11 RMQ-Titan emergency-stop complete device, red 38 mm mushroom, pull release, 1NC+1NO, IP66/IP69K, ISO 13850. GBP 35 ex VAT (Hasuka Automation). Indicative field E-stop station.',
    src: 'https://www.hasukaautomation.co.uk/products/216516-m22-pv-k11-emergency-stop-eaton',
    unit_price_gbp: 35,
  },
  {
    part_name: 'Cable trays — heavy-duty hot-dip galvanised steel cable tray (mechanical protection for cabling), 100 x 50 mm, 3 m',
    manufacturer: 'Legrand', part_number: 'SRFL100G',
    desc: 'Legrand Swifts heavy-duty hot-dip galvanised steel cable tray, return flange, 100 mm x 50 mm x 3 m length (EAN 5012774337171). Indicative instrument/power cable tray run.',
    src: 'https://www.legrand.co.uk/en/catalog/products/swifts-heavy-duty-hot-dip-galvanised-steel-cable-tray-100mm-x-50mm-x-3m-length-srfl100g',
    unit_price_gbp: null,
  },

  // ═══ ROUND 2 (2026-07-03, v59 engineered-TBD sweep) — every page below was
  //     actually fetched on 2026-07-03. Families: VFDs at the driven-motor kW,
  //     motor starter/overload, MCC/switchboard/panel ENCLOSURES (the internals
  //     stay engineered), dosing pump, GAC/softener composite vessels, mains-
  //     incomer MCCB, SPD, Modbus-TCP/EtherNet-IP gateway, pump drive motor. ═══
  // ── Drives + motor control ───────────────────────────────────────────────────
  {
    part_name: 'VFD drive — variable frequency drive 15 kW, 3x380-480 V, IP20, 31 A (VLT Micro Drive FC-51)',
    manufacturer: 'Danfoss', part_number: '132F0059',
    desc: 'Danfoss VLT Micro Drive FC-51 15 kW / 20 HP frequency converter (FC-051P15KT4E20H3BXCXXXSXXX), 3x380-480 V AC, IP20, max output 31 A. Sized to the plant 15 kW irrigation-pump motor. GBP 1,926.85 ex VAT (Drives Online).',
    src: 'https://www.drives-online.com/shop/vlt-fc51-132f0059/',
    unit_price_gbp: 1926.85,
  },
  {
    part_name: 'VFD drive — variable frequency drive 4 kW, 3x380-480 V, IP20, 8.8 A (ACS355 machinery drive)',
    manufacturer: 'ABB', part_number: 'ACS355-03E-08A8-4',
    desc: 'ABB ACS355 machinery drive, 4 kW, 3-phase 380-480 V AC, output 8.8 A, IP20, vector control + STO. Sized to the plant 4 kW RO high-pressure pump motor. (Newark stock ref 97Y9133.)',
    src: 'https://www.newark.com/abb/acs355-03e-08a8-4/inverter-drive-machinery-3-ph/dp/97Y9133',
    unit_price_gbp: null,
  },
  {
    part_name: 'Motor starter / motor circuit breaker — TeSys GV2, 20-25 A, 11 kW @ 400 V, 15 kA (DOL starter protection)',
    manufacturer: 'Schneider Electric', part_number: 'GV2ME22',
    desc: 'Schneider TeSys GV2ME22 3-pole thermal-magnetic motor circuit breaker, adjustable 20-25 A, Icu 15 kA @ 400 V, 11 kW motor @ 400/415 V, pushbutton control, DIN rail, IP20. Indicative DOL motor-starter protection. USD 95 (IQ Electro). NOTE: an id-42316 row for this MPN already exists — the ingest skips; this entry documents the verified page.',
    src: 'https://iqelectro.com/products/gv2me22-schneider-electric-motor-circuit-breaker',
    unit_price_gbp: null,
  },
  {
    part_name: 'Motor overload protection relay — SIRIUS thermal overload relay, 20-25 A, Class 10, size S0',
    manufacturer: 'Siemens', part_number: '3RU2126-4DB0',
    desc: 'Siemens SIRIUS 3RU2126-4DB0 thermal overload relay, 20-25 A setting range, trip Class 10, size S0, mounts on 3RT202x contactors, phase-loss protection, manual/auto reset. Indicative pump-motor overload protection. USD 55.46 (Kent Store).',
    src: 'https://kentstore.com/3ru2126-4db0/',
    unit_price_gbp: null,
    // MOTION-typed slot ('Motor Overload Protection'): dbHitAcceptableForWord
    // requires a motor_actuator/mechanical_assembly class for motor-token words.
    component_class: 'motor_actuator',
  },
  {
    part_name: 'Drive motor for process pump — W22 IE3 cast iron three-phase motor, 4 kW, 400/690 V, IEC 112M',
    manufacturer: 'WEG', part_number: 'M4-02FL112C3BIE3',
    desc: 'WEG W22 IE3 cast iron 3-phase induction motor, 4 kW, 3000 rpm (2-pole), 400/690 V 50 Hz, IEC 112M frame, B5 flange, TEFC (ERIKS UK catalogue ref M4-02FL112C3BIE3). Indicative 4 kW pump drive motor (RO high-pressure CRN duty runs 2900 rpm).',
    src: 'https://shop.eriks.co.uk/en/gearboxes-motors-and-drives-electric-motors-three-phase-ac-motors/3-phase-motor-4kw-3000rpm-2p-b5t-ie3-400-690v-50hz-w22-iec-112m-cast-iron-m4-02fl112c3bie3-weg/',
    unit_price_gbp: null,
    component_class: 'motor_actuator', // MOTION-typed slot ('Drive Motor') — see 3RU2126 note
  },
  // ── Dosing + vessels ─────────────────────────────────────────────────────────
  {
    part_name: 'pH / EC dosing pump — SMART Digital diaphragm dosing pump, 7.5 l/h @ 16 bar, 1:3000 turndown',
    manufacturer: 'Grundfos', part_number: 'DDA 7.5-16 AR',
    desc: 'Grundfos DDA 7.5-16 AR digital diaphragm dosing pump (variant fetched: DDA 7.5-16 AR-PV/T/C-F-31U2U2IG, code GRU-97722794), max 7.5 l/h @ 16 bar, stepper-motor drive, PVDF head, full-PTFE diaphragm, 230 V AC. Indicative pH/EC correction dosing duty. AUD 3,311 ex GST.',
    src: 'https://pwnps.com/products/grundfos-dda-digital-dosing-pump-7-5-16-ar-l-h-max-flow-rate-at-16-bar-max-pressure',
    unit_price_gbp: null,
  },
  {
    part_name: 'GAC filter / softener composite pressure vessel — 36 x 72 in (0.91 m dia x 1.83 m), 999 L, 150 psi, NSF 61',
    manufacturer: 'Pentair Structural', part_number: '36X72 COMP 6"TF 6"BF',
    desc: 'Pentair Structural composite pressure vessel 36X72 COMP 6"TF 6"BF: 36 in (914 mm) diameter x 72 in, 264 US gal (999 L), fibreglass-wound PE liner, 150 psi max, 6 in top+bottom flanges, tripod base, NSF/ANSI 61. Indicative GAC filter / softener vessel at the 0.9 m dia x 1.8 m duty.',
    src: 'https://hillwater.com/wp-content/uploads/2024/11/structural-composite-tank-specs.pdf',
    unit_price_gbp: null,
  },
  // ── Enclosures (the ENCLOSURE is the real part; internals stay engineered) ────
  {
    part_name: 'Main switchboard / motor control centre enclosure — VX25 baying enclosure, 800x2000x600 mm, IP55',
    manufacturer: 'Rittal', part_number: '8806.000',
    desc: 'Rittal VX25 baying enclosure system 8806.000, WHD 800x2000x600 mm, single door, sheet steel with 3 mm zinc-plated mounting plate, IP55 (IEC 60529), IK10. Indicative main switchboard / MCC / plant control-panel enclosure carcass. GBP 742.15 (Parmley Graham).',
    src: 'https://www.parmley-graham.co.uk/enclosures-amp-climate-control/rittal/enclosure-systems/baying-enclosure-system-vx25/8806000',
    unit_price_gbp: 742.15,
  },
  {
    part_name: 'Electrical control panel enclosure — AX compact wall enclosure, 800x1000x300 mm, IP66',
    manufacturer: 'Rittal', part_number: '1180.000',
    desc: 'Rittal AX compact enclosure 1180.000, WHD 800x1000x300 mm, 1.5 mm sheet steel, single door, zinc-plated mounting plate, IP66 / NEMA 4, RAL 7035. Indicative digital/electrical control panel enclosure. GBP 285.53 (Parmley Graham).',
    src: 'https://www.parmley-graham.co.uk/enclosures-amp-climate-control/rittal/compact-enclosures/compact-enclosure-ax/1180000',
    unit_price_gbp: 285.53,
  },
  // ── LV distribution + protection ─────────────────────────────────────────────
  {
    part_name: 'Mains incomer circuit breaker — Tmax XT1N 160 MCCB, TMD 125 A, 36 kA @ 415 V, 3P',
    manufacturer: 'ABB', part_number: '1SDA067417R1',
    desc: 'ABB Tmax XT1N 160 moulded-case circuit breaker, thermomagnetic TMD release 125 A (magnetic 1250 A), Icu 36 kA @ 415 V AC, 3-pole, fixed, front terminals. Indicative 125 A LV mains-incomer breaker (v59 duty: 125 A ACB frame on 53 kW connected load). USD 123.90 (Gabby Electric).',
    src: 'https://gabbyelectric.com/en-us/products/1sda067417r1-xt1n-160-tmd-125-1250-3p-f-f',
    unit_price_gbp: null,
  },
  {
    part_name: 'Surge protection device — Type 2 SPD, 3+1 circuit, 230/400 V, In 20 kA / Imax 40 kA, DIN rail',
    manufacturer: 'Phoenix Contact', part_number: '2838199',
    desc: 'Phoenix Contact VAL-MS 230/3+1-FM Type 2 (IEC class II / EN T2) surge arrester, 230/400 V AC, nominal discharge 20 kA (8/20), max 40 kA, Up ≤ 1.35 kV L-N, remote indicator contact, NS 35/7.5 DIN rail. Indicative LV panel surge protection device.',
    src: 'https://media.digikey.com/pdf/Data%20Sheets/Phoenix%20Contact%20PDFs/2838199.pdf',
    unit_price_gbp: null,
  },
  // ── Communications ───────────────────────────────────────────────────────────
  {
    part_name: 'Modbus TCP / EtherNet-IP interface module — Anybus Communicator serial gateway, 2-port, 24 V DC',
    manufacturer: 'HMS Networks', part_number: 'AB7072-B',
    desc: 'HMS Anybus Communicator AB7072-B, serial RS-232/485 to EtherNet/IP + Modbus-TCP 2-port gateway, 24 V DC, DIN rail, IP20 (509 bytes in / 505 out). Indicative Modbus-TCP / EtherNet-IP interface. NOTE: superseded by ABC3007-A — state at procurement.',
    src: 'https://www.parmley-graham.co.uk/AB7072-B',
    unit_price_gbp: null,
  },
]

// ── Embedding (canonical recipe: text-embedding-3-small, 1536-d Float32LE) ─────
function loadOpenAiKey(): string | null {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  try {
    const env = readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf-8')
    const m = env.match(/^OPENAI_API_KEY="?([^"\n]+)"?/m)
    return m ? m[1] : null
  } catch { return null }
}

async function embedText(text: string, apiKey: string): Promise<Buffer | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000), dimensions: 1536 }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { data?: Array<{ embedding?: number[] }> }
    const vec = j?.data?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length !== 1536) return null
    const buf = Buffer.alloc(vec.length * 4)
    vec.forEach((v, i) => buf.writeFloatLE(v, i * 4))
    return buf
  } catch { return null }
}

const embedHashOf = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32)

function getIngestDocId(db: Database.Database): number {
  const row = db.prepare(
    `SELECT id FROM pretraining_spec_documents WHERE source_type = ? ORDER BY id ASC LIMIT 1`,
  ).get(DISCOVERY_SOURCE) as { id: number } | undefined
  if (row?.id) return row.id
  const r = db.prepare(
    `INSERT INTO pretraining_spec_documents (source_type, document_type, extraction_status)
     VALUES (?, 'curated_web_verified_seed', 'done')`,
  ).run(DISCOVERY_SOURCE)
  return Number(r.lastInsertRowid)
}

async function main(): Promise<void> {
  if (!existsSync(DB_PATH)) { console.error(`DB not found: ${DB_PATH}`); process.exit(1) }
  const db = new Database(DB_PATH, { readonly: !COMMIT })
  db.pragma('busy_timeout = 4000')
  if (COMMIT) db.pragma('journal_mode = WAL')

  const apiKey = loadOpenAiKey()
  if (!apiKey) console.error('[ingest] OPENAI_API_KEY not found — rows will carry NULL embeddings (backfill-embeddings.ts sweeps those)')

  const existsStmt = db.prepare(
    `SELECT id FROM pretraining_extracted_parts
     WHERE LOWER(manufacturer) = LOWER(?) AND LOWER(part_number) = LOWER(?) LIMIT 1`,
  )

  let inserted = 0; let skipped = 0
  const docId = COMMIT ? getIngestDocId(db) : -1
  const insertStmt = COMMIT ? db.prepare(
    `INSERT INTO pretraining_extracted_parts
       (document_id, part_name, manufacturer, part_number, module_assignment,
        sub_module_assignment, raw_excerpt, confidence, unit_price_gbp,
        component_class, embedding, embed_hash, source_doc_id, discovered_at, discovery_source)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ) : null

  for (const p of PARTS) {
    const dup = existsStmt.get(p.manufacturer, p.part_number) as { id: number } | undefined
    if (dup) { skipped++; console.log(`  = exists (id ${dup.id}): ${p.manufacturer} ${p.part_number}`); continue }
    const excerpt = JSON.stringify({ desc: p.desc, src: p.src }).slice(0, 1024)
    if (!COMMIT) { inserted++; console.log(`  + would insert: ${p.manufacturer} ${p.part_number} — ${p.part_name}`); continue }
    const embedSource = [p.part_name.slice(0, 256), p.manufacturer, p.part_number, excerpt].filter(Boolean).join(' ')
    const embedding = apiKey ? await embedText(embedSource, apiKey) : null
    const r = insertStmt!.run(
      docId, p.part_name.slice(0, 256), p.manufacturer, p.part_number,
      excerpt, 0.9 /* web-verified on a fetched page */, p.unit_price_gbp,
      p.component_class ?? CLASS_TAG, embedding, embedding ? embedHashOf(embedSource) : null,
      p.src, new Date().toISOString(), DISCOVERY_SOURCE,
    )
    inserted++
    console.log(`  + inserted id ${r.lastInsertRowid}${embedding ? ' [embedded]' : ' [no embedding]'}: ${p.manufacturer} ${p.part_number} — ${p.part_name}`)
  }

  console.log(`\n[ingest] ${COMMIT ? 'COMMITTED' : 'DRY-RUN'}: ${inserted} insert(s), ${skipped} already present, class '${CLASS_TAG}', doc source_type '${DISCOVERY_SOURCE}'.`)
  db.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
