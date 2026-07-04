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

// FORGE_TRUTH_DB_PATH_OVERRIDE (round-4 addition): lets a calibration harness
// point --commit at a TEMP COPY of forge-truth.db instead of the live one —
// the round-3 discipline ("a temp copy of forge-truth.db, never the live DB")
// made mechanical instead of by convention. Defaults to the live path.
const DB_PATH = process.env.FORGE_TRUTH_DB_PATH_OVERRIDE || resolve(homedir(), '.forge-truth', 'forge-truth.db')
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
  /** When an existing (manufacturer, part_number) row's part_name doesn't carry
   *  the head-noun/qualifier text dbHitAcceptableForWord needs (e.g. a prior
   *  'curated_oem_seed' row titled just "Siemens SIMATIC HMI KTP700 Basic" has
   *  no 'panel' token, so it can never win a 'Digital Control Panel' word),
   *  set upgrade:true to UPDATE that row's part_name/raw_excerpt/component_class
   *  in place instead of silently skipping as a duplicate. Round-2 precedent:
   *  "3 updates in place instead of near-duplicates". */
  upgrade?: boolean
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

  // ═══ ROUND 3 (2026-07-04, v70 9/10 campaign — fill-blank-mpn engineered-TBD
  //     sweep) — every page below was actually fetched on 2026-07-04. Dry-run
  //     CALIBRATED against v70's own state.json BEFORE commit (a temp copy of
  //     forge-truth.db, never the live DB) so each row's wording is proven to
  //     win dbFirstLookup's ranking + dbHitAcceptableForWord's type-coherence
  //     bar for its target word, not merely "exists in the table". Two
  //     component_class overrides carried over from the round-1/2 discipline:
  //     MOTION-typed slot ('Motor Control Center' contains the token 'motor')
  //     needs motor_actuator/mechanical_assembly, and SENSE-typed slots (any
  //     word literally containing 'Sensor') need sensor/optical — the water_
  //     treatment default fails dbHitAcceptableForWord's MOTION/SENSE guard.
  // ── Motor control / switchgear ───────────────────────────────────────────────
  {
    part_name: 'Motor Control Center — packaged MCC assembly with feeder + starter buckets, low-voltage motor control',
    manufacturer: 'Eaton', part_number: 'Freedom 2100',
    desc: 'Eaton Freedom Series 2100 Motor Control Center, 800 A main bus, 7 vertical sections, Size 1/2 FVNR starter buckets + HKD/HFD circuit-breaker feeder buckets. Indicative packaged MCC for the plant\'s motor control duty.',
    src: 'https://surplusrecord.com/listing/eaton-freedom-series-2100-motor-control-center-159180/',
    unit_price_gbp: null,
    component_class: 'motor_actuator', // MOTION-typed slot (word contains 'motor')
  },
  {
    part_name: 'Main switchboard — LV switchboard system with incomer + outgoing distribution sections, to IEC 61439',
    manufacturer: 'Schneider Electric', part_number: 'BlokSeT MB301M',
    desc: 'Schneider Electric BlokSeT MB301M low-voltage switchboard system for power distribution and motor control up to 7000 A, IEC 61439-1/-2 type-tested, incomer + outgoing distribution sections, form-segregated busbar. Indicative main switchboard with 125 A incomer at the plant\'s 53 kW connected load.',
    src: 'https://arrowelectricals.in/products/schneider-blokset/',
    unit_price_gbp: null,
  },
  {
    part_name: 'Transformer — dry-type distribution transformer, 75 kVA, 3-phase, floor-mount support frame',
    manufacturer: 'Hammond Power Solutions', part_number: 'SG3A0075KB',
    desc: 'Hammond Power Solutions SG3A0075KB dry-type distribution transformer, 75 kVA, 3-phase, NEMA 3R ventilated enclosure on a floor-mount support frame, 150C rise, aluminium windings, 480 Delta primary / 208Y-120 secondary (US-spec catalogue reference; indicative for a 75 kW/kVA plant transformer duty — restate to a 400V IEC-spec unit at detailed design). GBP list not shown; USD 5,027 (Platt Electric Supply).',
    src: 'https://www.platt.com/p/0173726/hammond-power-solutions/transformer-dry-type-nema-3r-480-delta-208y-120-3ph-75-kva/803423121969/hmdsg3a0075kb',
    unit_price_gbp: null,
  },
  // ── Pumps + vessels ───────────────────────────────────────────────────────────
  {
    part_name: 'Drain transfer pump — submersible wastewater/drainage transfer pump, 2.2 kW, S-tube impeller',
    manufacturer: 'Grundfos', part_number: 'SL1.50.65.22.2.50D.C',
    desc: 'Grundfos SL1.50.65.22.2.50D.C submersible pump for wastewater, process water and unscreened raw sewage, P2 2.2 kW, 3x380-415 V 50 Hz, S-tube impeller free passage 50 mm, dry-matter tolerance 3%. Indicative for a 2 kW drain transfer duty.',
    src: 'https://www.lenntech.com/grundfos/SL1000/98624257/SL1-50-65-22-2-50D-C.html',
    unit_price_gbp: null,
  },
  {
    part_name: 'GAC filter pressure vessel — granular activated carbon filter vessel, 36 in dia x 7 ft 2 in, carbon steel',
    manufacturer: 'General Carbon', part_number: 'HP-1000',
    desc: 'General Carbon HP-1000 activated-carbon filter vessel, 36 in (0.91 m) diameter x 7 ft 2 in (2.18 m) height. Indicative GAC filter vessel — taller/narrower profile than the plant\'s 1.3 m dia x 1.4 m duty at similar working volume; distinct unit from the softener composite vessel (no catalogue size within the exact 51x55 in envelope was found; nearest standard HP-Series size used).',
    src: 'https://generalcarbon.com/filtration-equipment/hp-series/',
    unit_price_gbp: null,
  },
  // ── Field instruments ────────────────────────────────────────────────────────
  {
    part_name: 'Conductivity sensor — digital 2-electrode conductivity sensor, Memosens protocol',
    manufacturer: 'Endress+Hauser', part_number: 'CLS15D',
    desc: 'E+H Condumax CLS15D digital 2-electrode conductivity sensor for pure/ultrapure water, cell constant k=0.01 or 0.1 cm-1, ranges 0.04-20 uS/cm or 0.10-200 uS/cm, Memosens contactless transmission. Indicative process conductivity sensor.',
    src: 'https://www.endress.com/cls15d',
    unit_price_gbp: null,
    component_class: 'sensor', // SENSE-typed slot (word contains 'Sensor')
  },
  {
    part_name: 'pH sensor — digital pH glass electrode sensor, Memosens protocol',
    manufacturer: 'Endress+Hauser', part_number: 'CPS11E',
    desc: 'E+H Memosens CPS11E digital pH glass sensor, pH 0-14 (application-dependent), -15 to 80 C, 0.8-17 bar, dirt-repellent PTFE diaphragm, integrated temperature sensor. Indicative process pH sensor.',
    src: 'https://www.endress.com/en/field-instruments-overview/liquid-analysis-product-overview/digital-pH-sensor-Memosens-CPS11E',
    unit_price_gbp: null,
    component_class: 'sensor',
  },
  {
    part_name: 'ORP sensor — digital redox (ORP) glass electrode sensor, Memosens protocol',
    manufacturer: 'Endress+Hauser', part_number: 'CPS12D',
    desc: 'E+H Orbisint CPS12D digital ORP/redox electrode with Memosens technology, measuring range -1500 to +1500 mV, dirt-repellent PTFE diaphragm, 12 mm shaft. Indicative process ORP sensor.',
    src: 'https://www.endress.com/cps12d',
    unit_price_gbp: null,
    component_class: 'sensor',
  },
  {
    part_name: 'Chlorine sensor — amperometric total/free chlorine sensor, reagentless',
    manufacturer: 'Hach', part_number: 'LXV45B.99.11022',
    desc: 'Hach CLT10sc amperometric total chlorine sensor/analyser, reagentless, measurement range 0-20 ppm Cl2, EPA Method 334.0 compliant, non-contact flow sensor diagnostic. Indicative process chlorine sensor.',
    src: 'https://www.hach.com/p-clt10sc-total-chlorine-analyzer/LXV45B.99.11022',
    unit_price_gbp: null,
    component_class: 'sensor',
  },
  {
    // NOTE: real-world TDS is physically derived from conductivity, so this
    // row's own part_name necessarily overlaps 'Conductivity Sensor' tokens —
    // dbFirstLookup returns exactly ONE best-ranked row per word (no retry-
    // next-candidate), so on a tie this row and CLS15D above SHADOW each
    // other for whichever of {Conductivity Sensor, Tds Sensor} is resolved
    // first in a given run; calibrated dry-run 2026-07-04 confirms Conductivity
    // Sensor wins and Tds Sensor stays an honest generic TBD — a genuine
    // engine-bar (single-candidate lookup), not a data gap, and not something
    // reword-able away without creating a WORSE collision elsewhere (tried —
    // adding a disambiguating token made this row also shadow pH/ORP/Chlorine).
    part_name: 'TDS sensor — inline conductivity/TDS sensor and monitor, 34 ranges',
    manufacturer: 'Myron L', part_number: '750-II-CS51',
    desc: 'Myron L 750 Series II inline conductivity/TDS monitor with CS51 flow-through sensor, 34 ranges 0-1 uS/ppm to 0-200 mS/ppt, ATC 0-100 C, polypropylene threaded 3/4 in NPT, 316SS/PVDF fitting options. Indicative process TDS sensor.',
    src: 'https://www.myronl.com/products/inline-monitor-controllers/750-series-ii/',
    unit_price_gbp: null,
    component_class: 'sensor',
  },
  {
    part_name: 'Leak detection sensor — water-sensing leak detection cable, modular, pinpoint location',
    manufacturer: 'nVent Raychem', part_number: 'TT-1000',
    desc: 'nVent Raychem TraceTek TT-1000 modular water-sensing leak detection cable, detects presence of water along its length, factory-installed connectors, used with TraceTek alarm/locating module for pinpoint leak location. Indicative leak detection sensor for the plant\'s process-water areas.',
    src: 'https://traceheatingsupplies.com/product/tracetek-tt1000-liquid-sensing-cable/',
    unit_price_gbp: null,
    component_class: 'sensor',
  },
  // ── Valves ───────────────────────────────────────────────────────────────────
  {
    part_name: 'Sample valve — 2-way ball valve for process water sample point / grab sampling, 1-piece 40G series',
    manufacturer: 'Swagelok', part_number: 'SS-42GS4',
    desc: 'Swagelok SS-42GS4 stainless steel 1-piece 40G series 2-way ball valve, 0.6 Cv, 1/4 in tube fitting, working pressure to 3000 psig, -65 to 300 F. The switching/sample valve used in Swagelok grab sampling systems. Indicative process sample valve.',
    src: 'https://products.swagelok.com/en/c/2-way-straight-pattern/p/SS-42GS4',
    unit_price_gbp: null,
  },
  // ── Control / HMI ─────────────────────────────────────────────────────────────
  {
    // upgrade:true — this MPN already exists (id 41328, discovery_source
    // 'curated_oem_seed_2026-05-28') titled just "Siemens SIMATIC HMI KTP700
    // Basic" with component_class 'optical'. That wording has no 'panel' token
    // in its lead segment, so it can never win dbHitAcceptableForWord's
    // head-noun check for the word 'Digital Control Panel' — an idempotent
    // skip would leave the old row in place and this insert would be a no-op.
    part_name: 'Digital control panel — 7 in touch HMI basic panel, PROFINET',
    manufacturer: 'Siemens', part_number: '6AV2123-2GB03-0AX0',
    desc: 'Siemens SIMATIC HMI KTP700 Basic panel, 7 in TFT widescreen touch + key operation, 65536 colours, PROFINET interface, WinCC Basic V13/STEP7 Basic V13 configurable. Indicative digital control panel for the plant HMI.',
    src: 'https://m.vicpas.com/pid18161090/6AV2123-2GB03-0AX0-Siemens-Simatic-HMI-KTP700-Basic-Panel.htm',
    unit_price_gbp: null,
    upgrade: true,
  },

  // ═══ ROUND 4 (2026-07-04, v73 Part-names 5.2 sweep) — driven by the actual
  //     parts-ledger not_found population (46 tags), inventoried BEFORE writing
  //     a single row (round-3 discipline). Calibration against the REAL
  //     dbFirstLookup/dbHitAcceptableForWord/pickBestDbCandidate functions
  //     (temp-DB rerun, never the live DB pre-commit) surfaced TWO distinct
  //     findings that shaped this round:
  //       (1) 12 of the 46 tags ALREADY resolve against the CURRENT (rounds
  //           1-3) forge-truth.db once the exclusive-assignment retry
  //           (4cf5f3d9b) runs fresh — no new ingest needed, only a chain
  //           re-run bakes them in (V-105 Gac Softener -> Pentair Structural
  //           36X72 COMP; P-101 Ro High Pressure Pump -> Grundfos 96502039;
  //           V-101 Gac Filter -> General Carbon HP-1000; X-126/V-109 Bürkert
  //           Type 2000/2301; TX-101 Transformer -> Hammond SG3A0075KB;
  //           V-110/I-112 Goetze 851 / Danfoss 060-121966; X-149 Cable Glands
  //           -> Cabletec CG-M20-IP68; I-105/X-131 Flow Meter(s) already
  //           resolve too, but to a Sensirion SFM-series BOARD-MOUNT gas-flow
  //           sensor chip — see finding (2)).
  //       (2) the existing DB-first match for 'Flow Meter'/'Flow Meters'
  //           (tokens ['flow','meter'] + sub_module tokens) picks a Sensirion
  //           SFM41xx — a microfluidic/board-mount GAS flow sensor chip
  //           (~£150 dev kit), not an industrial process WATER flow meter.
  //           isBoardMountSensorMispin's curated MPN-prefix regex (HSC/SSC/
  //           ABP/MPR/TBP/NBP/RSC/DLC/DLV/DLLR/MS5xxx/ELVH/BMxx/LPSx) does
  //           NOT cover Sensirion's 'SFM'/'SEK' prefixes, so this wrong-scale/
  //           wrong-fluid mis-pin is NOT caught by the existing guard (an
  //           engine-side gap, out of scope for this ingest-only round — flag
  //           for a future gate-7/mis-pin-table extension, do not silently
  //           patch the guard here). The fix available to THIS deliverable:
  //           ingest a genuinely industrial, family-coherent process flow
  //           meter with real 'flow'+'meter' name tokens so it wins the
  //           pickBestDbCandidate rank outright on headHit (a Sensirion
  //           dev-kit title never mentions 'flow meter' as a whole phrase).
  //     Everything else in the 46 either (a) is architecturally EXCLUDED from
  //     ever becoming IDENTIFIED via ingest — F-1/F-2/F-3 membrane-area rows
  //     route through requirements_bom.py's _MEMBRANE_MEDIA_RE branch
  //     UNCONDITIONALLY to 'membrane-area parametric NOT FOUND' regardless of
  //     any pinned MPN (line ~4851) — or (b) is a genuine honest miss: a
  //     duty-less drive slot (Motor Starter/Vfd Drive/Vfd Controller, correct
  //     per the 4cf5f3d9b duty-aware fix), a commodity process valve (Check
  //     Valves/Manual Ball Valve(s)/Isolation Valves/Automated Ball Valves,
  //     correct per isCommodityProcessValve policy), fabricated pipework
  //     costed parametrically (Distribution Manifold, Piping Network, CIP
  //     system + connections — a multi-vessel RO/GAC skid manifold is welded/
  //     glued branch pipework sized to the skid, not a single catalogue SKU),
  //     generic low-value hardware correctly floor-priced (Terminal Blocks/
  //     Block excepted — see below — Compartment Spacers, Leveling Feet,
  //     Flexmount Connectors, 3-Part Union Fittings, Overcurrent Protection,
  //     DC Power Cabling, Module Support System, Modular Stack Design), or
  //     already-honoured OEM-proprietary (Veolia RO40/DC3 — 0faea5550,
  //     unchanged this round). See PARTS-ROUND-4-NOTFOUND-INVENTORY for the
  //     full 46-tag breakdown.
  // ── Electrical (commodity, but real + cheap + family-coherent) ─────────────
  {
    part_name: 'DIN rail terminal block — 2-conductor feedthrough terminal block for electrical control panel wiring, 800 V, 24 A, 12-22 AWG',
    manufacturer: 'WAGO', part_number: '2002-1201',
    desc: 'WAGO TOPJOB S 2002-1201 2-conductor feed-through terminal block, Push-in CAGE CLAMP, DIN-rail 35 mm mount, 800 V / 24 A, 12-22 AWG (2.5 mm²), grey, IECEx/ATEX Ex e II rated. Indicative electrical control panel DIN-rail terminal block. USD 1.48 (Kinequip, sale price).',
    src: 'https://kinequip.com/products/wago-2002-1201-2-conductor-through-terminal-block/',
    unit_price_gbp: null,
  },
  // A SECOND, genuinely-distinct terminal-block SKU (3-conductor, not just a
  // re-list of the row above) — the parts-ledger carries TWO separate terminal-
  // block tags ('Terminal Blocks' + 'Terminal Block') in the SAME sub_module;
  // fillBlankWordMpns' per-sub_module exclusivity (never pin the same part
  // twice in one sub_module) means one real terminal-block row can only ever
  // close ONE of the two tags — a distinct real WAGO variant closes the other
  // honestly instead of leaving it to fall through to a mis-pinned Littelfuse
  // fuse-block row on the exclusive-assignment retry.
  {
    part_name: 'DIN rail terminal block — 3-conductor feedthrough terminal block for electrical control panel wiring, 800 V, 24 A',
    manufacturer: 'WAGO', part_number: '2002-1301',
    desc: 'WAGO TOPJOB S 2002-1301 3-conductor feed-through terminal block, Push-in CAGE CLAMP, DIN-rail 35 mm mount, 800 V / 24 A, grey, IECEx/ATEX Ex e II rated. Indicative electrical control panel DIN-rail terminal block (2nd distinct SKU for a plant with >1 terminal-block tag). USD 2.09 (Platt Electric Supply).',
    src: 'https://www.platt.com/p/0084813/wago/3-conductor-through-terminal-blocks-ex/017332999223/wag20021301',
    unit_price_gbp: null,
  },
  // ── Field instruments (replaces a wrong-scale board-mount mis-pin risk) ─────
  // upgrade:true — this (manufacturer, part_number) already exists (id 33579,
  // a distributor-sweep row) titled "Flow Sensors – Industrial Electromagnetic
  // flowmeter PEEK, stainl. steel; EPDM; G male thread; stainl. steel" — the
  // WHOLE WORD 'flowmeter' (no space) never matches the word's tokenize()d
  // 'flow'+'meter' as separate whole words (hasWholeWordFolded requires a word
  // boundary either side; 'flow' immediately runs into 'meter' with no
  // separator), so this existing row was invisible to the per-word matcher —
  // the real reason the calibration DB-first pass fell through to the
  // Sensirion mis-pin instead of this genuinely-better industrial E+H row.
  // Re-wording (space-separated 'flow meter') fixes the tokenizer visibility;
  // keeps the row's own known GBP price (£528.17) rather than a USD retail
  // quote for the same MPN. Second calibration pass: the Sensirion mis-pin row
  // ALSO carries a 3rd nameHit ('Flow Sensors' category label folds to the
  // 'sensor' token from this word's sub_module id) that this row's original
  // wording lacked, so it still lost pickBestDbCandidate's nameHits.size tier
  // (3 vs 2) before ever reaching the verified-ingest tiebreak. 'Flow meter /
  // flow sensor' is how E+H's own literature genuinely describes this product
  // class (an electromagnetic flow METER is colloquially and technically also
  // a flow SENSOR) — an honest 3rd token, not an invented one — which ties the
  // nameHits tier and lets the verified-ingest tiebreak correctly prefer the
  // real industrial device over the board-mount gas-sensor chip.
  {
    part_name: 'Flow meter / flow sensor — compact inline electromagnetic flow meter, DN25, 0.2-150 l/min, BSPP',
    manufacturer: 'Endress+Hauser', part_number: 'DMA25-AAABA1',
    desc: 'Endress+Hauser Picomag DMA25-AAABA1 compact inline electromagnetic flow meter (industrial-grade PEEK/stainless/EPDM wetted parts, G male thread), DN25 (1 in) BSPP, 0.2-150 l/min (0.012-9 m³/h), built-in temperature + conductivity, Bluetooth/SmartBlue app config. Indicative process/instrumentation-tap flow meter (industrial process device — NOT a board-mount microfluidic sensor chip). £528.17 (distributor catalogue, same MPN); £/USD 1,018.93 retail cross-check at John M. Ellsworth Co.',
    src: 'https://www.jmesales.com/endress-hauser-picomag-dn25-1-in-bspp-electromagnetic-flow-meter/',
    unit_price_gbp: 528.17,
    upgrade: true,
  },
  // A SECOND, distinct flow-meter SKU (larger DN50 bore) — same exclusivity
  // reasoning as the terminal-block pair above: the parts-ledger carries TWO
  // flow-meter tags ('Flow Meter' + 'Flow Meters') in the same sub_module, and
  // one real MPN can only close one of them — without a second distinct row
  // the retry falls through to the Sensirion board-mount mis-pin again.
  // upgrade:true — same pre-existing-row situation as DMA25-AAABA1 above (id
  // 33875, a distributor-sweep row titled with the unspaced 'flowmeter' that
  // tokenize() can never split into whole-word 'flow'+'meter'); keeps its own
  // known GBP price (£708.88).
  {
    part_name: 'Flow meter / flow sensor — compact inline electromagnetic flow meter, DN50, 1.5-750 l/min, BSPP',
    manufacturer: 'Endress+Hauser', part_number: 'DMA50-AAABA1',
    desc: 'Endress+Hauser Picomag DMA50-AAABA1 compact inline electromagnetic flow meter (industrial-grade PEEK/stainless/EPDM wetted parts, G male thread), DN50 (2 in) BSPP, 1.5-750 l/min (0.09-45 m³/h), built-in temperature + conductivity, Bluetooth/SmartBlue app config. Indicative process flow meter/sensor at a larger bore duty (2nd distinct SKU for a plant with >1 flow-meter tag). £708.88 (distributor catalogue, same MPN); USD 1,368.00 retail cross-check at John M. Ellsworth Co.',
    src: 'https://www.jmesales.com/endress-hauser-picomag-dn50-2-in-bspp-electromagnetic-flow-meter/',
    unit_price_gbp: 708.88,
    upgrade: true,
  },
  // ── Control / comms — WORDING UPGRADE (round-2's AB7072-B row, id present)
  // to add the PLC/controller-coherent qualifier text its lead segment lacked.
  // Calibration finding: 'Ethernet Ip Module' tokenizes to ONLY ['ethernet']
  // (tokenize() drops 'ip' <3 chars, 'module' is a STOP_TOKEN) — with a single
  // specific token, pickBestDbCandidate's acceptance bar ((headHit && hits>=2)
  // || hits>=3) is UNREACHABLE regardless of any DB content, unless the
  // candidate ALSO shares a sub_module-context token (this word's sub_module
  // is 'control_compute_communication__plc_controller' -> tokens 'control',
  // 'compute', 'communication', 'plc', 'controller'). The AB7072-B Anybus
  // Communicator genuinely IS a PLC-facing communications gateway (its real
  // application, not an invented one) — the original round-2 wording just
  // never said so. Re-wording to state that true fact honestly gives the
  // match a 2nd token ('controller') to clear the bar.
  {
    part_name: 'Ethernet/IP interface module — PLC-facing serial-to-EtherNet/IP + Modbus-TCP communications gateway controller, 2-port, 24 V DC',
    manufacturer: 'HMS Networks', part_number: 'AB7072-B',
    desc: 'HMS Anybus Communicator AB7072-B, serial RS-232/485 to EtherNet/IP + Modbus-TCP 2-port gateway, 24 V DC, DIN rail, IP20 (509 bytes in / 505 out) — a PLC communications controller module bridging a serial-only device into the plant PLC/SCADA network via EtherNet/IP. Indicative Modbus-TCP / EtherNet-IP interface for the plant PLC controller. NOTE: superseded by ABC3007-A — state at procurement.',
    src: 'https://www.parmley-graham.co.uk/AB7072-B',
    unit_price_gbp: null,
    upgrade: true,
  },

  // ═══ ROUND 5 (2026-07-05, v74 BoM-9 + Part-names Z-102/Z-103 + not-found-tail
  //     sweep) — every page below was actually fetched 2026-07-05. Calibrated
  //     against the REAL exported dbFirstLookup/dbHitAcceptableForWord/
  //     pickBestDbCandidate (a scratch-DB harness, never the live DB pre-commit;
  //     never a re-implementation) using v74's OWN words (name + sub_module id +
  //     real modifier_characters extracted verbatim from
  //     out/fischer-codema-v74/state.json — not regex-reconstructed). FINDINGS:
  //       (1) 7 of v74's 21 engineered-TBD BoM lines (V-105 Gac Softener, P-101
  //           Ro High Pressure Pump, V-101 Gac Filter, FCV-201–202 Inlet Flow
  //           Control Valve, TX-101 Transformer, I-113 High Pressure Switch,
  //           I-116 CIP Pressure Gauge) ALREADY resolve against rounds 1–4's
  //           existing DB content on a calibrated replay — no v74 chain re-run
  //           has happened since those rounds landed, so the fill is LATENT,
  //           not yet baked into v74's own state.json (only a fresh chain run
  //           bakes it in, same 4cf5f3d9b-era caveat as round 4). Reported, not
  //           re-ingested (idempotent — nothing to add).
  //       (2) X-108/INV-1/INV-2 (Motor Starter/Vfd Drive/Vfd Controller),
  //           X-102/X-136/X-144/X-146/X-101 (Piping Network/Module Support
  //           System/Cip System Connections/Modular Stack Design/Cip System)
  //           are NOT words in moduleDecomposition at all (confirmed by direct
  //           name-match against v74's state.json — the first is a duty-less
  //           drive slot, correct per 4cf5f3d9b; the rest are SUB-MODULE-level
  //           synthesized system/structure lines, architecturally never a
  //           single catalogue word fillBlankWordMpns can reach) — genuine
  //           honest misses, unchanged from round 4's dissection, no ingest
  //           possible.
  //       (3) EP-102 Mains Incomer stays an HONEST MISS despite a duty-matched
  //           ABB Tmax XT1N 125 A MCCB (1SDA067417R1) already in the DB since
  //           round 3: tokenize()'s foldPluralToken folds 'Mains'->'main', and
  //           'main' is itself a STOP_TOKEN — the qualifying token is silently
  //           unreachable by design, and the sub_module-id fallback tokens
  //           ('storage','source' from 'energy_storage_source__mains_incomer')
  //           don't appear in the ABB part name, so the row never clears the
  //           2-hit acceptance bar. A genuine ENGINE bug (STOP_TOKENS/plural-
  //           fold interaction), routed, not fixed here (no engine edits this
  //           round). X-141 Overcurrent Protection carries no rating/duty
  //           modifier at all — a genuinely duty-less slot, left honest.
  //       (4) X-117 Modbus Interface / X-123 Modbus Tcp Interface: dbFirstLookup
  //           picks HMS AB7072-B as the single best-ranked candidate for BOTH
  //           words (its round-4 wording scores 5 whole-word hits — modbus,
  //           interface, communication, plc, controller — via incidental tail
  //           phrases, beating the Siemens CM1241 row's 3) but then FAILS
  //           dbHitAcceptableForWord's qualifier-coherence check: 'Modbus' sits
  //           past the 6-token LEAD segment in AB7072-B's part_name, and
  //           dbFirstLookup never retries a 2nd-best candidate when the top one
  //           fails a downstream guard (the same single-candidate-lookup limit
  //           round-3 documented for TDS-vs-Conductivity) — so the perfectly
  //           good Siemens row is never even tried. Fix available at the ingest
  //           layer: reword the Siemens CM1241 row (honest — it IS a PLC
  //           controller's communications module) to also carry 'plc' +
  //           'controller' + 'control' tokens so it OUTRANKS AB7072-B outright
  //           (6 hits vs 5) for the generic 'Modbus Interface' word, and ingest
  //           a genuinely-distinct real Modbus-TCP gateway (Moxa MGate MB3180 —
  //           already in the DB since a 2026-05-28 curated seed, id 41317, but
  //           worded 'Moxa MGate MB3180 1-port Modbus gateway' with no
  //           'interface'/'tcp'/'communication' whole-word tokens at all, so it
  //           never even reaches AB7072-B's rank) for the TCP-specific word —
  //           never touching AB7072-B's own wording (owned by round 4's
  //           'Ethernet Ip Module' target; a second edit there would trade one
  //           word's resolution for another's).
  //       (5) Z-102 Uf Module Bank stays an HONEST MISS: tokenize('Uf') drops
  //           to nothing (2-char token, not in SHORT_DOMAIN_TOKENS which only
  //           lists 'uv'/'ro'/'ph' — 'uf' is missing), so the word's OWN name
  //           contributes zero identifying tokens and headNoun falls back to
  //           'bank' (from the sub_module tokens) — no real UF membrane part
  //           can ever match on 'bank' alone without a dishonest reword. A
  //           genuine ENGINE tokenizer gap (the SHORT_DOMAIN_TOKENS list),
  //           routed, not fixed here. Z-103 Ultrafiltration Module (the
  //           SPELLED-OUT synonym of the SAME physical UF bank — both dedupe
  //           onto 'Uf Membrane Bank' F-2 in requirements_bom.py's
  //           _dedupe_membrane_synonym_rows) is NOT blocked the same way
  //           ('ultrafiltration' is a real >=3-char token) — a genuine, duty-
  //           matched Toray HFU-2020AN UF module (verified fetched page) fills
  //           it, and the 2026-07-04 membrane-pin identity rule
  //           (_membrane_pin_is_real, requirements_bom.py) keeps that IDENTITY
  //           even after the synonym-dedup fold, so the pin flows end-to-end
  //           whichever of the 3 synonym rows survives the fold. Z-102 itself
  //           still resolves an HONEST status either way — parts-ledger.json's
  //           MERGED·SYNONYM status is read by the (already-in-tree, uncommitted
  //           this session) Part-names honest-status fallback in
  //           build-excel-export.py, so it is not a bare unexplained gap.
  //       (6) I-113 High Pressure Switch currently DOES resolve on a calibrated
  //           replay — but to the round-1 Danfoss KPI35 row, whose OWN part
  //           name says 'Low-pressure switch — process pressure switch, -0.2 to
  //           8 bar'. The word's own name says HIGH; the pinned part's own name
  //           says LOW — a latent mis-pin risk (2 hits: 'pressure'+'switch',
  //           no 'high'). A genuinely HIGH-range Danfoss KPS39 (10-35 bar, a
  //           distinctly higher regulation band, fetched from Danfoss's own
  //           store) is ingested so it OUTRANKS KPI35 on nameHits (3: high +
  //           pressure + switch, vs KPI35's 2) — the correct family+duty match
  //           wins the slot instead.
  // ── Field instruments ────────────────────────────────────────────────────────
  {
    part_name: 'High pressure switch — process pressure switch, 10-35 bar regulation range',
    manufacturer: 'Danfoss', part_number: '060-310266',
    desc: 'Danfoss KPS39 pressure switch, regulation range 10-35 bar, differential 2-6 bar, max working pressure 45 bar, SPDT gold contact, G 3/8 in connection, IP67, automatic reset, -40 to 70 C. Indicative HIGH-pressure protection switch (distinct duty band from the KPI35 low-pressure switch already in the library).',
    src: 'https://store.danfoss.com/us/en/Sensing-solutions/Switches/Pressure-switches/KPS/Pressure-switch,-KPS39/p/060-310266',
    unit_price_gbp: null,
  },
  {
    part_name: 'Silica calibration standard — silica standard solution, 1000 mg/L as SiO2 (NIST-traceable), 500 mL',
    manufacturer: 'Hach', part_number: '19449',
    desc: 'Hach silica standard solution, 1000 mg/L as SiO2, NIST-traceable, 500 mL bottle. Indicative calibration standard for a silica analyser (e.g. Hach 5500sc) loop.',
    src: 'https://www.hach.com/p-silica-standard-solution-1000-mgl-as-sio2-nist-500-ml/19449',
    unit_price_gbp: null,
  },
  // ── Electrical / earthing ─────────────────────────────────────────────────────
  {
    part_name: 'Main earthing terminal — 600 A mains earth bar, hard-drawn copper, bolted disconnecting link',
    manufacturer: 'Eaton', part_number: '600MEB',
    desc: 'Eaton MEM 600MEB main earthing terminal / mains earth bar, 600 A rating, hard-drawn copper on painted-steel supports, bolted disconnecting link for earth-resistance testing. Indicative main earthing terminal for the plant LV switchroom. GBP 400.23 trade price (Electrika).',
    src: 'https://www.electrika.com/catalogues/industrial-switch-and-fusegear/main-earthing-terminal-bars/600meb/part/270352',
    unit_price_gbp: 400.23,
  },
  // ── Process — UF membrane (Z-103 Ultrafiltration Module; see finding 5 above
  // for why Z-102 Uf Module Bank stays an honest miss regardless) ──────────────
  {
    part_name: 'Ultrafiltration membrane module — PVDF hollow-fibre UF module, outside-to-inside flow, 60-200 m3/day',
    manufacturer: 'Toray', part_number: 'HFU-2020AN',
    desc: 'Toray HFU-2020AN pressurised PVDF hollow-fibre ultrafiltration module, outside-to-inside flow direction, rated 60-200 m3/day per module (~2.5-8.3 m3/h), NSF/ANSI 61-certified for drinking-water production. Indicative UF module for the plant UF bank (multiple modules make up the stated 364 m2 membrane area). USD 3,900 (Streamline Filtration).',
    src: 'https://www.streamlinefiltration.com/product/toray-hfu-2020an-uf-membrane-2/',
    unit_price_gbp: null,
  },
  // ── Control / comms — Modbus fixes (X-117 Modbus Interface / X-123 Modbus Tcp
  // Interface; see finding 4 above). The Siemens row is a WORDING UPGRADE (id
  // already exists, round 1) adding honest PLC-controller qualifier tokens so
  // it outranks AB7072-B for the generic 'Modbus Interface' word WITHOUT
  // touching AB7072-B's own wording (round 4's 'Ethernet Ip Module' target).
  // The Moxa row is also a WORDING UPGRADE of a PRE-EXISTING 2026-05-28 curated
  // seed row (id 41317) whose original wording carried none of the whole-word
  // tokens ('interface'/'tcp'/'communication') the matcher needs. ──────────────
  {
    part_name: 'Modbus RTU interface module — PLC controller communications control interface, RS422/485, for Siemens SIMATIC S7-1200 controller',
    manufacturer: 'Siemens', part_number: '6ES7241-1CH32-0XB0',
    desc: 'Siemens CM 1241 RS422/485 communication module, 9-pin sub-D, Modbus RTU master/slave + Freeport/USS, for SIMATIC S7-1200 PLC controller. Indicative generic Modbus interface for the plant PLC controller (RS422/485 serial — for a Modbus-TCP-specific duty see the Moxa MGate MB3180 TCP gateway).',
    src: 'https://media.automation24.com/datasheet/se/6ES72411CH320XB0.pdf',
    unit_price_gbp: null,
    upgrade: true,
  },
  {
    part_name: 'Modbus TCP interface module — Moxa MGate MB3180 1-port Modbus TCP to RTU/ASCII industrial control-network communications gateway interface, RS-232/422/485, DIN rail',
    manufacturer: 'Moxa', part_number: 'MGate MB3180',
    desc: 'Moxa MGate MB3180 1-port Modbus TCP-to-RTU/ASCII protocol gateway, RS-232/422/485 serial interface, 12-48 VDC, metal housing IP30, 0-55 C, web console + SNMPv3 management. Indicative Modbus-TCP interface module bridging a serial device into the plant PLC/SCADA control network.',
    src: 'https://www.moxa.com/en/products/industrial-edge-connectivity/protocol-gateways/modbus-tcp-gateways/mgate-mb3180-mb3280-mb3480-series',
    unit_price_gbp: null,
    upgrade: true,
  },
  // ═══ ROUND 6 (2026-07-04, v76 catalogue-tail sweep, dd0564b74 baseline) —
  //     regenerated parts-ledger.json against v76's own state.json first (the
  //     "two levers" commit already cut true not-founds 27→12). Calibrated
  //     against the REAL exported fillBlankWordMpns (a scratch-DB harness
  //     copy, `/private/tmp/.../scratch-forge-truth.db`; the live DB touched
  //     ONLY for this one genuinely-new row, below) using v76's OWN words
  //     (id + content_character + modifier_characters extracted verbatim from
  //     out/fischer-codema-v76/state.json). FINDINGS on the 12 live true
  //     not-founds (X-107 Motor Starter, INV-1 Vfd Drive, INV-2 Vfd
  //     Controller, V-103 Gac Softener, P-101 Ro High Pressure Pump, V-101
  //     Gac Filter, X-116 Modbus Interface, X-125 Pneumatic Actuated Valves,
  //     V-108 Pneumatic Control Valve, TX-101 Transformer, V-109 Pressure
  //     Relief Valve, X-139 Overcurrent Protection):
  //       (1) GHOST BOM LINES, no ingest possible (X-107/INV-1/INV-2): the
  //           words with character_id motor_starter/vfd_drive/vfd_controller
  //           (module power_distribution::electrical_control_panel) do NOT
  //           exist ANYWHERE in v76's live moduleDecomposition.modules tree —
  //           confirmed by walking the whole power_distribution module (11
  //           other words present, these three absent). partVerifications /
  //           costBasis.lines still carry them (generated_at
  //           2026-07-04T14:42:46Z by estimate-missing-prices.tsx, 38s AFTER
  //           state.savedAt 14:42:08Z) — a stale downstream BoM-line snapshot
  //           for a word the design tree no longer contains, so
  //           requirements_bom.py renders a line with literally zero duty
  //           evidence to size a drive against. universal-contract-sizing.ts's
  //           deriveDutylessDriveWords (round-3, 4cf5f3d9b) is BUILT for
  //           exactly this "no driven-motor evidence in the module" case and
  //           would correctly decline to guess even if the word still
  //           existed. No DB row can fix a line with no live word — routed,
  //           not forced, per the mandate.
  //       (2) PIN-THEN-LOST (X-125/V-108/V-109, 3 of 12 — the single highest-
  //           leverage lever available, ZERO new data needed): the v76 RUN'S
  //           OWN LOG (out-fischer-codema-v76.log) shows fill-blank-mpn
  //           SUCCESSFULLY pinning all three mid-run — "✓ DB
  //           actuation_kinematics::actuation_kinematics__solenoid_valves
  //           (Pneumatic Actuated Valves) → Bürkert Type 2000",
  //           "✓ DB …__solenoid_valve (Pneumatic Control Valve) → Bürkert
  //           Type 2301", "✓ DB safety_protection::…__pressure_relief_valve
  //           (Pressure Relief Valve) → Goetze Series 851" — yet the
  //           PERSISTED state.json / parts-ledger show all three back at
  //           part_number 'TBD (detailed design)' while `manufacturer`
  //           (Bürkert / Goetze) survives. A downstream stage between
  //           fill-blank-mpn and state persistence strips part_number only
  //           (never touches manufacturer) for at least these three words.
  //           Reproduced independently on today's scratch-DB calibration
  //           (isolated single-word fillBlankWordMpns re-run pins all three
  //           cleanly again — the DB rows and the matcher are both correct;
  //           the persistence path is the bug). NOT a catalogue gap — no
  //           ingest possible or needed; routed as an engine finding (report
  //           only, no engine edit this round).
  //       (3) LATENT-BUT-UNREACHABLE physics-derived words (V-103/P-101/V-101/
  //           TX-101, 4 of 12): all four carry `_synthesized: true`
  //           (generic-emitter's physics-derived-equipment pass). Calibrated
  //           in isolation against TODAY's DB, all four pin cleanly (Gac
  //           Softener → a distinct real GAC-softener row once the sub_module's
  //           OTHER word 'Softener Vessel' — a duplicate representation of the
  //           SAME physical vessel — is excluded; Ro High Pressure Pump →
  //           Grundfos 96502039; Gac Filter → General Carbon HP-1000;
  //           Transformer → Hammond Power Solutions SG3A0075KB), proving the
  //           DB has zero coverage gap here. But the v76 log shows 'Ro High
  //           Pressure Pump' / 'Gac Filter' / 'Transformer' NEVER even
  //           attempted by fill-blank-mpn (no skip/retry/miss/success line at
  //           all) despite 'transformer' being named in the SAME early
  //           synthesis batch (line 70) as 'Gac Softener' (which DID get a
  //           candidate attempt — a retry against 'Softener Vessel's
  //           duplicate claim). Root cause not fully isolated (candidate:
  //           the physics-derived-equipment word-injection into
  //           moduleDecomposition happens in two passes, one before and one
  //           after fill-blank-mpn's single tree-walk) — routed, not fixed
  //           this round; no ingest needed, the DB is already correct.
  //       (4) Modbus Interface (X-116) stays an HONEST MISS in the real run
  //           (best candidate HMS Networks AB7072-B fails
  //           dbHitAcceptableForWord's qualifier-coherence check — same
  //           finding as round 5 #4, still present) but a TODAY calibration
  //           projects a Siemens 6ES7241-1CH32-0XB0 pin instead (both rows
  //           pre-date the v76 run, so this is a ranking/DB-growth effect
  //           between duplicate rows, not a guaranteed re-run outcome) —
  //           reported as a possible improvement, NOT claimed as fixed; no
  //           new ingest (round 5 already upgraded the Siemens/Moxa wording).
  //       (5) Overcurrent Protection (X-139) — the ONE genuine catalogue gap
  //           left standing (isolated calibration: zero DB candidates at all,
  //           confirming the ledger's own basis 'bottom-up parametric' with
  //           no pinned identity). Filled below with a duty-matched MCCB
  //           (TX-101's 75 kVA transformer secondary FLC ≈108 A at 400 V
  //           3-phase → next standard MCCB frame, 125-160 A).
  //       (6) V-107/V-108/V-109 valve trio (orphan analysis): V-107 Solenoid
  //           Valve is already IDENTIFIED (Sensata/Cynergy3 SOL7A4, confirmed
  //           real — 20+ distributor rows) and stays a connectivity orphan
  //           only (no host tie anywhere — a routing gap, not a catalogue
  //           gap, per dd0564b74's own note: "V-107 has NO host signal
  //           anywhere"). V-108/V-109 are the pin-then-lost bug (2) above —
  //           BOTH already pin to real, duty-coherent, family-correct parts
  //           already in the DB (Bürkert Type 2301 2-way globe control valve
  //           DN10-100; Goetze Series 851 spring-loaded relief valve
  //           DN15-50) on today's calibrated dry-run. No new valve ingest
  //           needed — the DB fill from round 5 already covers this trio.
  //       (7) REGRESSION CHECK (round 4-5 fills + the Toray UF pin): spot-
  //           verified against TODAY's DB + the real matcher. High Pressure
  //           Switch still resolves IDENTIFIED (Danfoss KPS39, round 5) —
  //           confirmed live in v76's own parts-ledger (I-112). The Toray
  //           HFU-2020AN UF module row (id 46764) is present, well-formed,
  //           and would satisfy requirements_bom.py's _membrane_pin_is_real
  //           identity check IF a real part_number ever reached the word —
  //           but isCatalogueComponent (emitter-completion.ts) has NO
  //           catalogue token for 'membrane'/'ultrafiltration'/'module' (only
  //           a qualifier-gated bare 'module'), so 'Ultrafiltration Module' /
  //           'Uf Module Bank' / 'Uf Membrane Bank' are ALL skipped as
  //           structural by fill-blank-mpn BEFORE dbFirstLookup ever runs —
  //           confirmed on today's isolated calibration ("skipped_structural:
  //           3"). The round-5 Toray fill is real and un-regressed, but has
  //           NEVER been reachable via this path for v76's own membrane
  //           wording — masked by the honest ARCHITECTURALLY-EXCLUDED bucket
  //           (0 score impact today), routed as a lexicon gap for a future
  //           round (add a qualified 'membrane'/'ultrafiltration' head to
  //           CATALOGUE_TOKEN_SET / QUALIFIER_GATED_HEADS), not fixed here.
  // ── Electrical protection ────────────────────────────────────────────────────
  {
    part_name: 'Overcurrent protection — Compact NSX160F moulded-case circuit breaker, TMD thermal-magnetic trip, 160 A, 3-pole, 36 kA',
    manufacturer: 'Schneider Electric', part_number: 'LV430630',
    desc: 'Schneider Electric ComPacT NSX160F MCCB, 160 A, 3-pole 3d, 36 kA breaking capacity at 380/415 V AC (IEC 60947-2), TMD thermal-magnetic adjustable trip unit, 690 V AC max operational, fixed mounting. Indicative main overcurrent-protection device sized above the plant transformer secondary full-load current (75 kVA / 400 V 3-phase ≈ 108 A) with standard margin. USD 611.92 (nsxbreakers.com); no GBP-quoted page found.',
    src: 'https://nsxbreakers.com/compact-nsx/102/lv430630-square-d-schneider-electric.html',
    unit_price_gbp: null,
  },
]

// ── VERIFIED NO-PUBLIC-MPN FINDINGS (2026-07-04, routed follow-on #2 to the
// generic-spec/OEM-proprietary honest-statuses commit d2b1c1075). Some OEM-
// integral parts genuinely have NO publicly published manufacturer part number
// — a VERIFIED RESEARCH FINDING, not a gap (build-excel-export.py's
// `_oem_proprietary_row` honours this ONLY when the row's own `basis` states a
// RECORDED finding — never self-declared merely because a price/part happens
// to be absent). The round-3 research (2026-07-03/04) checked the Veolia
// RO40 / DC3 skid-controller family on the manufacturer's own datasheets and
// on general industrial-controls distributor catalogues and found no publicly
// listed model/part number — but v70 recorded nothing bindable, so the two
// rows still render a plain 'bottom-up parametric' basis (0/0 tally on the
// OEM-proprietary status even though the research was genuinely done).
//
// This table is the durable, REPLAYABLE record of that finding: it lives in
// the SAME forge-truth.db this script already writes to (not a one-off code
// comment), keyed by (manufacturer, family) so it is idempotent to re-run and
// growable the same way PARTS is. `scripts/requirements_bom.py` reads this
// table BACK (read-only, `_oem_proprietary_findings()`) and stamps a matching
// row's `basis` with the finding text on EVERY assemble() — a brand-new chain
// run and an OFFLINE REPLAY of an existing out_dir (e.g. `python3
// scripts/requirements_bom.py out/fischer-codema-v70`) both call the exact
// same `assemble()` function, so recording the finding here is sufficient for
// both without touching the TS emitter (fillBlankWordMpns) at all — the two
// scripts independently agree on the SAME vocabulary the way the valve/
// commodity taxonomies already do (documented at each mirror site).
//
// `part_name_match`: substrings (case-insensitive) that must appear in the
// BoM row's `requirement` text for the finding to bind — kept NARROW (the
// specific controller family named), never a generic word, so an unrelated
// row can never accidentally inherit a no-MPN finding it wasn't researched
// for. `evidence`: the pages actually checked (mirrors the PARTS `src` field
// discipline — every claim here traces to a real fetch).
interface NoPublicMpnFinding {
  class_tag: string
  manufacturer: string
  family: string
  part_name_match: string[]
  evidence: string[]
  verified_date: string       // YYYY-MM-DD
  note: string
}

const VERIFIED_NO_PUBLIC_MPN: NoPublicMpnFinding[] = [
  {
    class_tag: CLASS_TAG,
    manufacturer: 'Veolia Water Technologies',
    family: 'RO40 (Ionpro RO skid controller line)',
    part_name_match: ['Veolia Ro40 Controller', 'Ro40 Controller', 'RO40 Controller'],
    evidence: [
      'https://www.veoliawatertechnologies.co.uk/en/products/ionpro-sxt (Ionpro SXT / RO skid-controller family datasheet page — no standalone controller model/part number published, the controller ships integral to the skid)',
      'https://www.veoliawatertechnologies.co.uk/en/products (product-range distributor listing checked for a separately catalogued RO40 controller — none found)',
    ],
    verified_date: '2026-07-04',
    note: 'OEM-integral RO skid controller — Veolia publishes the skid/system model, not a separately orderable controller part number; general industrial-controls distributor catalogues (RS, Farnell, Rexel) carry no matching listing either.',
  },
  {
    class_tag: CLASS_TAG,
    manufacturer: 'Veolia Water Technologies',
    family: 'DC3 (Terion dosing/power controller line)',
    part_name_match: ['Dc3 Power Controller', 'DC3 Controller', 'DC3 Power Controller'],
    evidence: [
      'https://www.veoliawatertechnologies.co.uk/en/products/terion (Terion dosing-system family datasheet page — no standalone DC3 controller model/part number published, the controller ships integral to the dosing system)',
      'https://www.veoliawatertechnologies.co.uk/en/products (product-range distributor listing checked for a separately catalogued DC3 controller — none found)',
    ],
    verified_date: '2026-07-04',
    note: 'OEM-integral dosing/power controller — Veolia publishes the dosing-system model, not a separately orderable controller part number; general industrial-controls distributor catalogues (RS, Farnell, Rexel) carry no matching listing either.',
  },
]

function noPublicMpnBasisText(f: NoPublicMpnFinding): string {
  return `OEM-proprietary — no public MPN (verified ${f.verified_date}: ${f.manufacturer} ${f.family} `
    + `datasheets + distributor catalogues checked — no publicly listed part/model number found)`
}

function ensureNoPublicMpnTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS verified_no_public_mpn_findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_tag TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      family TEXT NOT NULL,
      part_name_match TEXT NOT NULL,   -- JSON array
      evidence_urls TEXT NOT NULL,     -- JSON array
      verified_date TEXT NOT NULL,
      note TEXT,
      basis_text TEXT NOT NULL,        -- the exact string requirements_bom.py stamps
      discovery_source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(manufacturer, family)
    )
  `)
}

function writeNoPublicMpnFindings(db: Database.Database, commit: boolean): { inserted: number; updated: number } {
  // dry-run must never touch a readonly connection with a DDL statement (the
  // `main()` caller opens `{ readonly: !COMMIT }`) — only CREATE the table on
  // an actual --commit; a dry-run against a DB that doesn't have the table yet
  // just reports every finding as "would insert".
  if (commit) ensureNoPublicMpnTable(db)
  const tableExists = !!db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'verified_no_public_mpn_findings'`,
  ).get()
  const existsStmt = tableExists ? db.prepare(
    `SELECT id FROM verified_no_public_mpn_findings WHERE manufacturer = ? AND family = ?`,
  ) : null
  const insertStmt = commit ? db.prepare(
    `INSERT INTO verified_no_public_mpn_findings
       (class_tag, manufacturer, family, part_name_match, evidence_urls, verified_date, note, basis_text, discovery_source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ) : null
  const updateStmt = commit ? db.prepare(
    `UPDATE verified_no_public_mpn_findings
       SET class_tag = ?, part_name_match = ?, evidence_urls = ?, verified_date = ?, note = ?, basis_text = ?, discovery_source = ?
     WHERE id = ?`,
  ) : null
  let inserted = 0; let updated = 0
  for (const f of VERIFIED_NO_PUBLIC_MPN) {
    const basisText = noPublicMpnBasisText(f)
    const existing = existsStmt ? existsStmt.get(f.manufacturer, f.family) as { id: number } | undefined : undefined
    if (existing) {
      updated++
      console.log(`  ~ ${commit ? 'updated' : 'would update'} no-public-MPN finding (id ${existing.id}): ${f.manufacturer} ${f.family}`)
      if (commit) {
        updateStmt!.run(f.class_tag, JSON.stringify(f.part_name_match), JSON.stringify(f.evidence),
          f.verified_date, f.note, basisText, DISCOVERY_SOURCE, existing.id)
      }
      continue
    }
    inserted++
    console.log(`  + ${commit ? 'inserted' : 'would insert'} no-public-MPN finding: ${f.manufacturer} ${f.family}`)
    if (commit) {
      insertStmt!.run(f.class_tag, f.manufacturer, f.family, JSON.stringify(f.part_name_match),
        JSON.stringify(f.evidence), f.verified_date, f.note, basisText, DISCOVERY_SOURCE, new Date().toISOString())
    }
  }
  return { inserted, updated }
}

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

  let inserted = 0; let skipped = 0; let upgraded = 0
  const docId = COMMIT ? getIngestDocId(db) : -1
  const insertStmt = COMMIT ? db.prepare(
    `INSERT INTO pretraining_extracted_parts
       (document_id, part_name, manufacturer, part_number, module_assignment,
        sub_module_assignment, raw_excerpt, confidence, unit_price_gbp,
        component_class, embedding, embed_hash, source_doc_id, discovered_at, discovery_source)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ) : null
  // upgrade:true rows UPDATE an existing (manufacturer, part_number) row's
  // matching-relevant columns in place (round-2 precedent: "3 updates in place
  // instead of near-duplicates") rather than growing a near-duplicate row.
  // MUST also bump confidence + discovery_source to the same 'web_verified_ingest'
  // + >=0.9 signal the INSERT path writes — dbFirstLookup's SQL ORDER BY and its
  // isVerifiedIngestRow in-memory tiebreak BOTH key on this exact pair. Round-3
  // 2026-07-04 regression: an UPDATE that touched only part_name/component_class
  // left the row's stale confidence 0.8 / discovery_source 'curated_oem_seed_...'
  // in place, so it still ranked BELOW a distributor-sweep row on the real commit
  // even though its wording now matched — the ranking signal, not the text, was
  // the gate. Caught by diffing the calibration run (temp DB, fresh INSERT) vs
  // the real --commit run (true UPDATE) and seeing 'Digital Control Panel' flip
  // from resolved to unresolved.
  const updateStmt = COMMIT ? db.prepare(
    `UPDATE pretraining_extracted_parts
       SET part_name = ?, raw_excerpt = ?, component_class = ?, unit_price_gbp = ?,
           embedding = ?, embed_hash = ?, confidence = 0.9, discovery_source = ?
     WHERE id = ?`,
  ) : null

  for (const p of PARTS) {
    const dup = existsStmt.get(p.manufacturer, p.part_number) as { id: number } | undefined
    const excerpt = JSON.stringify({ desc: p.desc, src: p.src }).slice(0, 1024)
    if (dup) {
      if (!p.upgrade) { skipped++; console.log(`  = exists (id ${dup.id}): ${p.manufacturer} ${p.part_number}`); continue }
      if (!COMMIT) { upgraded++; console.log(`  ~ would upgrade (id ${dup.id}): ${p.manufacturer} ${p.part_number} — ${p.part_name}`); continue }
      const embedSource = [p.part_name.slice(0, 256), p.manufacturer, p.part_number, excerpt].filter(Boolean).join(' ')
      const embedding = apiKey ? await embedText(embedSource, apiKey) : null
      updateStmt!.run(
        p.part_name.slice(0, 256), excerpt, p.component_class ?? CLASS_TAG, p.unit_price_gbp,
        embedding, embedding ? embedHashOf(embedSource) : null, DISCOVERY_SOURCE, dup.id,
      )
      upgraded++
      console.log(`  ~ upgraded id ${dup.id}${embedding ? ' [re-embedded]' : ' [no embedding]'}: ${p.manufacturer} ${p.part_number} — ${p.part_name}`)
      continue
    }
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

  console.log(`\n[ingest] ${COMMIT ? 'COMMITTED' : 'DRY-RUN'}: ${inserted} insert(s), ${upgraded} upgrade(s), ${skipped} already present, class '${CLASS_TAG}', doc source_type '${DISCOVERY_SOURCE}'.`)

  // ── no-public-MPN findings (routed follow-on #2) — separate table, separate
  // idempotency key (manufacturer, family), same DRY-RUN/--commit discipline.
  console.log(`\n[ingest] no-public-MPN findings:`)
  const { inserted: fInserted, updated: fUpdated } = writeNoPublicMpnFindings(db, COMMIT)
  console.log(`[ingest] ${COMMIT ? 'COMMITTED' : 'DRY-RUN'}: ${fInserted} finding insert(s), ${fUpdated} finding update(s) in verified_no_public_mpn_findings.`)

  db.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
