#!/usr/bin/env npx tsx
/**
 * scripts/ingest/ingest-bess-verified-parts.ts — curated, WEB-VERIFIED BESS
 * parts ingest into pretraining_extracted_parts (the growing-DB principle:
 * DB-first → search-on-miss → VERIFY → write-back class-tagged). Modelled
 * EXACTLY on ingest-water-treatment-verified-parts.ts's discipline — read
 * that file first if you are extending this one.
 *
 * WHY (2026-07-05): out/bess-campaign-v10's parts-ledger.json lists 33
 * NOT-FOUND tags (Part names 7.6). Every row below was verified on a
 * manufacturer/distributor page ACTUALLY FETCHED on 2026-07-05 (URL in the
 * `src` field). Enumerated from v10's own state.json words (module ->
 * sub_module -> word, matched by tag via out/bess-campaign-v10/parts-ledger.json
 * `equipment[].tag`/`requirement`) — see PARTS-ROUND-1-NOTFOUND-INVENTORY
 * comment block below for the full 33-tag dissection (which are ingested here,
 * which are genuinely bespoke/fabricated and correctly left parametric, and
 * which are gated by emitter-completion.ts's `isCatalogueComponent` lexicon
 * — an engine-side finding ROUTED, not fixed, in this ingest-only round; see
 * that comment block for the exact gate result per tag).
 *
 * Family-coherence discipline (gate-20 / the PAC-SH71DS lesson): each MPN's
 * product family matches the part class — a pump gets a pump MPN, a CT gets a
 * CT MPN, never an unrelated accessory. Every `part_name` LEADS with the
 * word's own requirement text (or a close paraphrase preserving every content
 * word) so the fill-blank matcher's head-noun + qualifier-coherence checks
 * (`dbHitAcceptableForWord`, `pickBestDbCandidate` in
 * src/lib/pdf-engine-v2/lib/emitter-completion.ts) are satisfied BY
 * CONSTRUCTION, not by luck — calibrated against the REAL exported functions
 * on a scratch DB (FORGE_TRUTH_DB_PATH_OVERRIDE) before commit.
 *
 * Genuinely OEM-proprietary / no-public-MPN items get an honest finding in
 * the SHARED `verified_no_public_mpn_findings` table (created by the water-
 * treatment script; this script re-uses it with class_tag='bess') — never an
 * invented part number. Genuinely bespoke/fabricated items (battery-module
 * sheet-metal, cut-to-length pipe, structural floor reinforcement) are NOT
 * force-fitted with an ill-matched catalogue part — they stay the correct,
 * honest "bottom-up parametric" classification the engine already renders;
 * no row is ingested for them.
 *
 * Rows are embedded at insert (text-embedding-3-small, 1536-d Float32LE, the
 * canonical [part_name, manufacturer, part_number, raw_excerpt] recipe) so
 * the Stage 17.6 cosine RAG serves them immediately; degrades to NULL
 * embedding when OPENAI_API_KEY is absent (backfill-embeddings.ts sweeps
 * those).
 *
 * Idempotent: skips any (manufacturer, part_number) already present.
 * DRY-RUN by default; --commit writes. No live distributor calls (chain-as-
 * DB-consumer rule untouched — this is a curated seed, not an API sweep).
 *
 * Usage:
 *   npx tsx scripts/ingest/ingest-bess-verified-parts.ts             # dry-run
 *   npx tsx scripts/ingest/ingest-bess-verified-parts.ts --commit
 *   npx tsx scripts/ingest/ingest-bess-verified-parts.ts --selftest  # shape checks, no DB
 *
 * British spelling throughout.
 *
 * ═══ PARTS-ROUND-1-NOTFOUND-INVENTORY (2026-07-05) ═══════════════════════════
 * out/bess-campaign-v10/parts-ledger.json `not_found` = 33 tags. For each,
 * (name_human, sub_module id) was read verbatim from
 * out/bess-campaign-v10/state.json's moduleDecomposition tree, then tested
 * against the REAL exported `isCatalogueComponent(name + ' ' + subId)` gate
 * (src/lib/pdf-engine-v2/lib/emitter-completion.ts) — the pre-filter
 * `fillBlankWordMpns` applies BEFORE any DB lookup is even attempted:
 *
 *  GATE=TRUE  (reachable via fillBlankWordMpns TODAY, no engine change needed):
 *   X-1 cell-to-cell busbar, TX-105 MV cable sealing end (as "transformer
 *   cable sealing end"), X-33 enclosure thermostat controller, EQ-112 cooling
 *   pump, EQ-110 centrifugal exhaust fan for off-gas, X-69 HMI identification
 *   label.
 *
 *  GATE=FALSE (structural/generic head noun not in CATALOGUE_TOKEN_SET /
 *   QUALIFIER_GATED_HEADS — the word never reaches dbFirstLookup at all; a
 *   genuine, UNIVERSAL lexicon gap in emitter-completion.ts, same shape as
 *   the "LEXICON ROUND 2" fixes already landed there in prior sessions
 *   (commits 4cf5f3d9b, b2824d3b2) — NOT fixed this round: out of this
 *   round's explicit ownership (scripts/ingest/* + parts_ledger.py status
 *   vocab + requirements_bom.py matcher acceptance only). ROUTED, with the
 *   exact missing head-noun family named per item below, for whoever next
 *   touches that lexicon):
 *   X-7 module top cover, X-8 module bottom tray, X-9 compression plate,
 *   X-10 compression tie rod set, EQ-104 EMS industrial PC ('pc' not a
 *   catalogue token — 'computer'/'processor' are, 'pc' isn't), X-25 DC
 *   busbar 1500V ('busbar' not a catalogue token; 'dc'/'v' fold below the
 *   3-char floor), X-32 driven earth electrode ('electrode'/'earth' not
 *   catalogue tokens), EQ-103 louvre vent panel ('louvre'/'vent' not
 *   catalogue tokens, 'panel' is STRUCTURAL and un-qualified here), CM-101
 *   cold plate manifold ('manifold' not a catalogue token), EQ-105 container
 *   AC unit ('ac'/'unit' — 'unit' is a STOP_TOKEN, 'hvac' not in the sub_module
 *   id either), CP-101 cold plate per rack, CD-101 coolant distribution
 *   manifold, X-34 coolant charge, X-36 coolant supply pipe, X-37 coolant
 *   return pipe, FS-101 clean agent cylinder ('cylinder' not catalogue —
 *   confusingly the STRUCTURAL/CATALOGUE sets have no vessel/cylinder noun at
 *   all), X-39 suppression nozzle ('nozzle' not catalogue), I-6 thermal
 *   detector ('detector' not catalogue — 'sensor' is, 'detector' isn't the
 *   same token), EQ-106 suppression releasing panel (bare 'panel', no
 *   qualifying HOUSING_QUALIFIERS token present), EQ-107 arc flash barrier
 *   panel (same 'panel' gap), I-15 fire alarm sounder-beacon ('sounder'/
 *   'beacon' not catalogue tokens), X-61 ISO container 20-ft HC, X-62
 *   structural floor reinforcement, X-63 door assembly double leaf, X-64
 *   grounding lug set, X-65 ISO 1161 corner casting, X-71 grid PCC metering
 *   CT ('ct' folds below the 3-char floor and is not in SHORT_DOMAIN_TOKENS;
 *   'metering' is the real head noun and is also not a catalogue token).
 *
 * DISPOSITION per GATE=FALSE tag in THIS round:
 *  (a) genuinely bespoke/fabricated, correctly parametric TODAY, no ingest —
 *      X-7, X-8, X-9, X-10 (battery-module sheet-metal/compression hardware,
 *      bespoke to the CATL CBC00 cell pitch), X-36, X-37 (cut-to-length pipe),
 *      X-62 (structural steel), X-69 (an engraved identification label/pin
 *      has no generic catalogue MPN despite GATE=TRUE — see below), EQ-107
 *      (an arc-flash barrier is normally engineered to the specific
 *      switchgear compartment, not a standalone SKU — no credible generic
 *      match found), X-61 (a 20ft HC ISO container shell is a capital budget
 *      line, not usefully identified by a supplier SKU in a concept dossier).
 *  (b) real, verified, credible industrial part found + ingested as LATENT —
 *      will resolve the moment a future lexicon round adds the missing head
 *      noun (busbar/manifold/nozzle/detector/cylinder/lug/casting/metering/
 *      electrode/louvre/vent to CATALOGUE_TOKEN_SET, or a qualified-panel rule
 *      for 'releasing'/'barrier') — proven correct-if-reached by calling the
 *      SAME `dbFirstLookup` + `dbHitAcceptableForWord` directly (bypassing
 *      only the pre-filter) on a scratch DB: EQ-104, X-25, X-32, EQ-103,
 *      CM-101, EQ-105, CP-101, CD-101, X-34, FS-101, X-39, I-6, EQ-106, I-15,
 *      X-63, X-64, X-65, X-71 (18 tags).
 *
 * X-1 cell-to-cell busbar and X-69 HMI identification label pass GATE=TRUE
 * but are STILL not force-fitted: research found no credible, scale-
 * appropriate catalogue MPN for a gigafactory-grade prismatic-cell interconnect
 * (DIY/aftermarket copper-nickel busbar sellers — Wellgo/Lynx/Adinath — serve
 * hobbyist 18650/prismatic packs, not a 6084-cell 4.89 MWh utility BESS; a
 * name-token match alone is not evidence of fitness) or for a bespoke engraved
 * HMI label/pin (no generic MPN exists for a custom nameplate). Honest misses,
 * not ingested. TX-105 (as the WORD carries it — "transformer cable sealing
 * end"), X-33, EQ-112, EQ-110 ARE ingested (4 tags) and are the ones proven,
 * live, to flip NOT-FOUND -> IDENTIFIED on a v10 chain re-run with no engine
 * change.
 *
 * TOTAL new/upgraded real verified parts this round: 22 (4 live-reachable +
 * 18 latent-pending-lexicon). See the commit/report for the calibration
 * harness accept-rate + before/after replay numbers.
 */
import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'

const DB_PATH = process.env.FORGE_TRUTH_DB_PATH_OVERRIDE || resolve(homedir(), '.forge-truth', 'forge-truth.db')
const CLASS_TAG = 'bess'
const DISCOVERY_SOURCE = 'web_verified_ingest'
const COMMIT = process.argv.includes('--commit')
const SELFTEST = process.argv.includes('--selftest')

interface VerifiedPart {
  part_name: string          // LEADS with the word's own requirement text — see file header
  manufacturer: string
  part_number: string        // real catalogue MPN / product number / series id
  desc: string                // duty + spec, honest datasheet numbers
  src: string                 // the page actually fetched + verified 2026-07-05
  unit_price_gbp: number | null
  component_class?: string
  upgrade?: boolean
}

const PARTS: VerifiedPart[] = [
  // ── Live-reachable NOW (isCatalogueComponent passes on v10's own word+subId) ──
  {
    part_name: 'Transformer cable sealing end — Raychem OXSU-F heat-shrinkable outdoor termination kit, 11 kV 3-core XLPE cable',
    manufacturer: 'TE Connectivity / Raychem', part_number: '074061-011',
    desc: 'Raychem OXSU-F heat-shrinkable outdoor termination kit, part of the IXSU-F/OXSU-F family for 1-core and 3-core plastic (XLPE/EPR) cables up to 42 kV, 10-1200 mm2 cross-section range. Indicative 11 kV MV cable sealing end for the step-up transformer HV connection.',
    src: 'https://www.te.com/en/product-074061-011.html',
    unit_price_gbp: null,
  },
  {
    part_name: 'Enclosure thermostat controller — STEGO KTO 011 small compact thermostat, NC contact, DIN rail, +20 to +80°C',
    manufacturer: 'STEGO', part_number: '01159.0-00',
    desc: 'STEGO KTO 011 small compact thermostat, 1x N/C contact opens on temperature rise (anti-condensation heater regulation), DIN-rail mount, IP20, 250 V AC, temperature setting range +20 to +80 degC. Indicative enclosure climate-control thermostat controller.',
    src: 'https://my.rs-online.com/web/p/thermostats/1947681',
    unit_price_gbp: null,
  },
  {
    // A DISTINCT (manufacturer, part_number) from the water-treatment round's
    // Grundfos 97836723 "Backwash pump" row — deliberately NOT reused/upgraded.
    // Calibration (2026-07-05, scratch DB) found 97836723 already exists with
    // part_name "Backwash pump — filter backwash duty..." (no 'cooling'/
    // 'liquid' token), so it never clears the 2-hit acceptance bar for a
    // "cooling pump" word; upgrading that SHARED row's wording to add
    // 'cooling' would risk changing the water-treatment class's own
    // "Backwash Pump" resolution (the exact cross-class regression the round
    // discipline forbids — "prove no cross-class hit change"). A fresh,
    // independently-verified Grundfos MPN sidesteps the risk entirely.
    part_name: 'Cooling pump — Grundfos NB 32-125 end-suction centrifugal pump, 19.67 m3/h, 1.1 kW, liquid cooling circulation duty',
    manufacturer: 'Grundfos', part_number: 'GRU-99803652',
    desc: 'Grundfos NB 32-125 single-stage end-suction centrifugal pump, rated 19.67 m3/h @ 10.14 m head, 1100 W, 220-240/380-415 V 50 Hz. Indicative BESS liquid-cooling circulation pump for a 350 L/min (~21 m3/h) duty — flow closely matched; head is lower than the stated 20 m (a closed BESS coolant loop typically runs a shorter/lower-head circuit than the general industrial duty this catalogue pump is rated against) — confirm head at detailed design.',
    src: 'https://pwnps.com/products/grundfos-nb-single-stage-end-suction-centrifugal-pump-x-m-h-rated-flow',
    unit_price_gbp: null,
  },
  {
    part_name: 'Off-gas exhaust fan — Systemair DKEX 315-4 ATEX-rated centrifugal fan for BESS thermal-runaway off-gas extraction, Zone 1/2, II 2G Ex eb h IIB+H2',
    manufacturer: 'Systemair', part_number: 'DKEX 315-4',
    desc: 'Systemair DKEX 315-4 ATEX centrifugal duct fan, galvanised sheet steel casing with copper inlet cone, classified II 2G Ex eb h IIB+H2 T3 Gb for hazardous-area gas extraction (zone 1/2, groups IIA/IIB + hydrogen). Indicative off-gas thermal-runaway-vent exhaust fan for a BESS container.',
    src: 'https://shop.systemair.com/en/dkex--315--4--centrifugal--atex/p101990',
    unit_price_gbp: null,
  },

  // ── Latent (real, verified, calibration-proven — blocked pre-dbFirstLookup by
  //     the isCatalogueComponent lexicon gap named in the header comment) ──────
  {
    part_name: 'EMS industrial PC — Beckhoff C6015-0010 ultra-compact industrial PC, 24 V DC, for BESS energy management system controller',
    manufacturer: 'Beckhoff', part_number: 'C6015-0010',
    desc: 'Beckhoff C6015-0010 ultra-compact industrial PC, 24 V DC supply, 2 USB ports, DIN-rail/wall mountable, fanless. Indicative EMS (energy management system) industrial PC/process computer.',
    src: 'https://www.radwell.com/Buy/BECKHOFF/BECKHOFF/C6015-0010',
    unit_price_gbp: null,
  },
  {
    part_name: 'DC busbar 1500 V — Mersen Infini∞cell laminated smart-monitoring battery bus bar for 1500 V DC rack distribution',
    manufacturer: 'Mersen', part_number: 'Infini-Cell',
    desc: 'Mersen Infini∞cell laminated smart-monitoring bus bar for battery pack/rack assembly, developed with F&K Delvotec; ultra-thin single-layer laminated bus bar with integrated cell voltage/temperature monitoring, rated for high-power DC battery-rack distribution. Indicative 1500 V DC main busbar (family reference — no single standalone SKU published; specific lamination/current rating configured per rack layout at detailed design).',
    src: 'https://us.mersen.com/en/products/bus-bars/infinicell-battery-assembly-solutions',
    unit_price_gbp: null,
  },
  {
    part_name: 'Earth rod — ABB Furse RC012 solid copper earth electrode, 15 mm dia x 3000 mm, BS EN 50164-2',
    manufacturer: 'ABB Furse', part_number: 'RC012',
    desc: 'ABB Furse RC012 solid copper earth rod, 15 mm diameter x 3000 mm length, 4.70 kg, to BS EN 50164-2 (EAN 5415022138931). Indicative driven earth electrode for the container EMC/grounding system.',
    src: 'https://www.electrika.com/catalogues/ABB-Furse/Solid-copper-and-stainless-steel-earth-rod/RC012/Solid-copper-earth-rod-4-70-kg-15-mm-3000-mm/part/127370',
    unit_price_gbp: null,
  },
  {
    part_name: 'Louvre vent panel — Rittal 3239.200 outlet vent for passive enclosure ventilation, ABS',
    manufacturer: 'Rittal', part_number: '3239.200',
    desc: 'Rittal 3239.200 outlet vent, 8in x 8in x 0.94in, acrylonitrile butadiene styrene (ABS), for passive enclosure cooling/ventilation. Indicative container enclosure-climate louvre vent panel.',
    src: 'https://www.amazon.com/Rittal-3239-200-Accessories-Acrylonitrile-Butadiene/dp/B004G6KDH4',
    unit_price_gbp: null,
  },
  {
    part_name: 'Cold plate manifold — Motivair In-Rack Manifold, direct-to-chip liquid cooling manifold connecting cold plates to rack supply/return',
    manufacturer: 'Motivair', part_number: 'In-Rack Manifold',
    desc: 'Motivair In-Rack Manifold, a common connection point between dynamic cold plates and rack supply/return cooling infrastructure or CDU, available in 42U/48U/50U and custom configurations. Indicative liquid-cooling cold-plate manifold for the BESS rack cooling loop (family reference — sized per rack layout at detailed design).',
    src: 'https://www.motivaircorp.com/products/in-rack-manifold/',
    unit_price_gbp: null,
  },
  {
    part_name: 'Container AC unit — Envicool MC series HVAC air conditioner for prefabricated power container, IP55',
    manufacturer: 'Envicool', part_number: 'MC series',
    desc: 'Envicool MC series HVAC air conditioner purpose-built for prefabricated power containers (BESS/telecom enclosures), IP55-rated outdoor unit. Indicative container HVAC unit for enclosure climate control.',
    src: 'https://en.envicool.com/productinfo30/25.html',
    unit_price_gbp: null,
  },
  {
    part_name: 'Aluminium cold plate per rack — Wieland MicroCool CP-E-4009-S3XJ liquid cold plate, 20 FPI pin-fin, J1926 ports',
    manufacturer: 'Wieland MicroCool', part_number: 'CP-E-4009-S3XJ',
    desc: 'Wieland MicroCool 4000-series CP-E-4009-S3XJ aluminium liquid cold plate, 225 x 130 x 20 mm, 20 FPI MDT pin-fin surface enhancement, extruded and friction-stir-welded construction, J1926 port fittings, 3 cooling modules. Indicative BESS rack cold plate.',
    src: 'https://www.microcooling.com/our-products/cold-plate-products/4000-series-standard-cold-plates/',
    unit_price_gbp: null,
  },
  {
    part_name: '16-way coolant distribution manifold — CoolIT Systems rack manifold, multi-port direct liquid cooling distribution header',
    manufacturer: 'CoolIT Systems', part_number: 'Rack Manifold',
    desc: 'CoolIT Systems rack manifold engineered for robustness and reliability, a wide range of port configurations to support direct liquid cooled (DLC) rack installations. Indicative coolant distribution manifold header for the BESS coolant loop (family reference — port count/spacing configured per rack layout at detailed design).',
    src: 'https://www.coolitsystems.com/products-services/server-products/rack-manifolds/',
    unit_price_gbp: null,
  },
  {
    part_name: 'Coolant charge (50/50 propylene glycol / deionised water) — Dow DOWFROST HD 50% propylene glycol heat transfer fluid, food-grade, double-inhibitor',
    manufacturer: 'Dow', part_number: 'DOWFROST HD',
    desc: 'Dow DOWFROST HD heat transfer fluid, 96% food-grade propylene glycol plus double corrosion-inhibitor package; solutions in water provide freeze protection to below -50 degC. Indicative BESS coolant-loop charge fluid (50/50 dilution with deionised water).',
    src: 'https://hydrosolar.ca/products/dowfrost%E2%84%A2-hd-50-propylene-glycol-double-inhibitor-industrial-freeze-protection-solution',
    unit_price_gbp: null,
  },
  {
    part_name: 'Clean agent cylinder — Kidde-Fenwal ECS-360 cylinder and valve assembly, HFC-227ea clean agent',
    manufacturer: 'Kidde-Fenwal', part_number: 'ECS-360',
    desc: 'Kidde-Fenwal ECS-360 cylinder and valve assembly family, HFC-227ea clean agent, UL/ULC/FM-approved (datasheet K-90-2040 documents the 200 lb / 91 kg cylinder; the family also ships smaller cylinder sizes). Indicative clean-agent cylinder for the container fire-suppression system — the specific cylinder size (32.8 kg agent mass stated on this line) is selected from the ECS-360 range at detailed design flood-calculation.',
    src: 'https://www.kidde-fenwal.com/Media/Data%20Sheets/Kidde_ECS_360_200_lb_Cylinder_and_Valve_Assemblies_with_HFC-227ea_K-90-2040.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'Suppression nozzle — Kidde Fenwal 90-194028 ECS-360 HFC-227ea discharge nozzle, brass, 360°, 2in NPT',
    manufacturer: 'Kidde Fenwal', part_number: '90-194028',
    desc: 'Kidde Fenwal 90-194028-XXX ECS-360 HFC-227ea discharge nozzle, brass construction, 360-degree discharge pattern, 2in NPT, custom-drilled per flood-calculation software for the specific hazard volume. Indicative container clean-agent suppression nozzle (matches the Kidde ECS releasing panel + cylinder already named in the design).',
    src: 'https://www.gilautomation.com/products/kidde-fenwal-90-194028-xxx-ecs-360-hfc227ea-discharge-nozzles-brass-360%C2%BA-2-npt-custom-drilled-per-calculation-software',
    unit_price_gbp: null,
  },
  {
    part_name: 'Thermal detector — System Sensor 5601P fire-suppression fixed-temperature/rate-of-rise heat detector, 135°F, UL521',
    manufacturer: 'System Sensor', part_number: '5601P',
    desc: 'System Sensor 5601P mechanical heat detector, 135 degF (57 degC) fixed-temperature/rate-of-rise combination activation, single-circuit, plain housing, UL 521 listed, post-activation drop indicator. Indicative container fire-suppression system thermal detector.',
    src: 'https://www.anixter.com/en_us/products/5601P/SYSTEM-SENSOR/Smoke-and-Heat-Detection/p/674107',
    unit_price_gbp: null,
    component_class: 'sensor',
  },
  {
    part_name: 'Suppression releasing panel — Kidde ARIES-SLX releasing control panel, addressable clean-agent release control',
    manufacturer: 'Kidde', part_number: 'ARIES-SLX',
    desc: 'Kidde ARIES-SLX releasing control panel (document 10-500002-00E), addressable fire detection and clean-agent releasing control for gaseous suppression systems. Indicative container suppression releasing panel (matches the "Kidde ECS releasing panel" already named in the design).',
    src: 'https://unitedfiresystems.com/wp-content/uploads/2021/03/10-500002-00E-COMPLETE.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'Smoke detector sounder — Apollo AlarmSense 55000-392 optical smoke detector with sounder base, two-wire',
    manufacturer: 'Apollo', part_number: '55000-392',
    desc: 'Apollo AlarmSense 55000-392 optical smoke detector with integral sounder base (combines the Apollo 55000-390 detector + 45681-510 sounder base), for AlarmSense two-wire fire alarm systems. Indicative container smoke detector sounder / fire alarm sounder-beacon.',
    src: 'https://www.thesafetycentre.co.uk/apollo-alarmsense-smoke-detector-with-sounder-base-set-55000-392',
    unit_price_gbp: null,
    component_class: 'sensor',
  },
  {
    part_name: 'Door assembly double leaf — PRM Filtration 70x82in exterior steel manway double door for containerised enclosures',
    manufacturer: 'PRM Filtration', part_number: '70x82-Manway-Double-Door',
    desc: 'PRM Filtration 70in x 82in exterior steel manway double door, marketed for Connex boxes, shipping containers and fabricated enclosures. Indicative BESS container double-leaf door assembly.',
    src: 'https://shop.prmfiltration.com/products/70x82-exterior-steel-manway-double-door-perfect-for-connex-shipping-containers-and-fabricated-enclosures',
    unit_price_gbp: null,
  },
  {
    part_name: 'Grounding lug set — Burndy YA292N 250 kcmil two-hole copper compression lug, long barrel',
    manufacturer: 'Burndy', part_number: 'YA292N',
    desc: 'Burndy YA292N two-hole long-barrel copper compression lug, 250 kcmil, 1/2in bolt size, 1-3/4in centre spacing, electrolytic copper, UL/CSA approved, 35 kV rated. Indicative container main-grounding-conductor lug set.',
    src: 'https://www.hubbell.com/burndy/en/products/ya292n-250-kcmil-cu-2-hole-12-1-34-spacing-long/p/523689',
    unit_price_gbp: null,
  },
  {
    part_name: 'ISO 1161 corner casting — Tandemloc 243000C series steel corner fitting, cast steel, ABS certified',
    manufacturer: 'Tandemloc', part_number: '243000C',
    desc: 'Tandemloc 243000C series ISO 1161 steel corner fitting (TL/TR/BL/BR variants), low-carbon cast steel for welding, ABS certified, ~25 lb each. Indicative ISO container corner casting for lifting/stacking.',
    src: 'https://www.tandemloc.com/243000c-series',
    unit_price_gbp: null,
  },
  {
    part_name: 'Grid PCC metering CT — Crompton Instruments MB5Z-2000/5 Ebony moulded-case current transformer, ratio 2000/5A',
    manufacturer: 'Crompton Instruments', part_number: 'MB5Z-2000/5',
    desc: 'Crompton Instruments (TE Connectivity) Ebony moulded-case current transformer, ratio 2000/5A, 30VA class 3 / 20VA class 1 / 15VA class 0.5. Indicative grid point-of-common-coupling metering current transformer, bus-bar/window-type — NOT a small board-mount split-core sensor (LEM ATO/AT series max ~125A, wrong scale for a utility-BESS PCC metering point; deliberately avoided).',
    src: 'https://www.electrika.com/catalogues/Crompton-Instruments/Current-transformers/Moulded-case-current-transformers/MB5Z-2000-5/EBONY-MOULDED-CASE-CT-RATIO-2000-5A-30VA-CL3-20VA-CL1-15VA-CL0-5/part/118984',
    unit_price_gbp: null,
    component_class: 'sensor',
  },

  // ── ROUND 2 (2026-07-05, the bess-campaign-v11 17-not-found dissection) — three
  // tags NEW to v11 (not in v10's 33-tag round-1 inventory) with a genuine, web-
  // fetched real MPN found this round. Family-coherence + head-noun discipline
  // (see file header) applied identically to round 1. ─────────────────────────
  {
    part_name: 'PCS DC-link capacitor bank — Vishay Roederstein MKP1848C DC-link film capacitor, 60 µF, 1200 VDC',
    manufacturer: 'Vishay Roederstein', part_number: 'MKP1848C66012JY5',
    desc: 'Vishay Roederstein MKP1848C DC-link series metallised polypropylene film capacitor, 60 microfarad, 1200 VDC rated (the family’s nominal-voltage class nearest the ~1100 V DC-link bus; no 1100 V-nominal member exists in the series). A 1 MW PCS DC-link bank parallels multiple units to the required capacitance/ripple-current rating — standard practice, not a single all-in-one bank SKU. Indicative DC-link capacitor for the PCS inverter.',
    src: 'https://www.vishay.com/docs/26015/mkp1848cdclink.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'PE surge counter — DEHN DCC 2 impulse/surge-event counter for lightning/surge protection monitoring',
    manufacturer: 'DEHN', part_number: '994101',
    desc: 'DEHN DCC 2 impulse counter (the discrete surge-event-counter family; "DEHNrecord" is DEHN’s DIGITAL monitoring line, a different product, not this device). Indicative PE surge counter for lightning-protection-system event monitoring.',
    src: 'https://www.dehn-international.com/store/p/en-DE/F137826/impulse-counter',
    unit_price_gbp: null,
  },
  {
    // ONE catalogue SKU serves BOTH the coolant-loop supply AND return legs (the
    // same stock DN80 SCH10S pipe, cut to each run's own routed length at detailed
    // design) — a single DB row is correct here, not a duplicate: fillBlankWordMpns
    // matches it independently for each word via the shared 'coolant'/'pipe' tokens.
    part_name: 'Coolant supply/return pipe — Integraflow DN80 Schedule 10S seamless 304/1.4301 stainless steel pipe',
    manufacturer: 'Integraflow', part_number: 'SS-PIP-80-S10-304-SML',
    desc: 'Integraflow DN80 (3in NB) Schedule 10S seamless stainless steel pipe, grade 304/1.4301, sold as a stock catalogue item (mill producers like Outokumpu publish no fixed pipe part number — this is a genuine live distributor SKU for the exact DN/schedule/grade). Indicative BESS coolant-loop supply AND return pipe, cut to each routed length at detailed design.',
    src: 'https://www.integraflow.co.uk/shop/ss-pip-80-s10-304-sml-dn80-3-nb-schedule-10s-stainless-seamless-pipe-304-15920',
    unit_price_gbp: null,
  },
]

// ── VERIFIED NO-PUBLIC-MPN FINDINGS ─────────────────────────────────────────
// Re-uses the SAME `verified_no_public_mpn_findings` table the water-treatment
// script created (idempotent, keyed by (manufacturer, family)); this round adds
// no BESS finding here because every genuinely-checked BESS "no MPN" case (X-1
// cell busbar, X-69 HMI label) is a BESPOKE/CUSTOM item, not an OEM-integral
// controller with a real product line but no separately orderable part number
// — the pattern this table exists for. Left empty deliberately; a future round
// that finds a genuine OEM-integral no-MPN BESS controller should populate it
// here, following the exact shape in ingest-water-treatment-verified-parts.ts.
interface NoPublicMpnFinding {
  class_tag: string
  manufacturer: string
  family: string
  part_name_match: string[]
  evidence: string[]
  verified_date: string
  note: string
}
const VERIFIED_NO_PUBLIC_MPN: NoPublicMpnFinding[] = []

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
      part_name_match TEXT NOT NULL,
      evidence_urls TEXT NOT NULL,
      verified_date TEXT NOT NULL,
      note TEXT,
      basis_text TEXT NOT NULL,
      discovery_source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(manufacturer, family)
    )
  `)
}

function writeNoPublicMpnFindings(db: Database.Database, commit: boolean): { inserted: number; updated: number } {
  if (VERIFIED_NO_PUBLIC_MPN.length === 0) return { inserted: 0, updated: 0 }
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

// ── --selftest: pure shape/discipline checks, no DB touched ─────────────────
function runSelftest(): number {
  let failures = 0
  const fail = (msg: string) => { failures++; console.error(`  ✗ ${msg}`) }
  const pass = (msg: string) => console.log(`  ✓ ${msg}`)

  if (PARTS.length === 0) fail('PARTS is empty')
  else pass(`PARTS has ${PARTS.length} rows`)

  const seen = new Set<string>()
  for (const p of PARTS) {
    const key = `${p.manufacturer.toLowerCase()}|${p.part_number.toLowerCase()}`
    if (!p.upgrade && seen.has(key)) fail(`duplicate (manufacturer, part_number) within PARTS: ${key}`)
    seen.add(key)
    if (!p.part_name || p.part_name.length < 10) fail(`part_name too short/missing: ${JSON.stringify(p.part_name)}`)
    if (p.part_name.length > 256) fail(`part_name exceeds 256-char DB column: ${p.part_name.slice(0, 40)}...`)
    if (!p.manufacturer) fail(`missing manufacturer for part_number ${p.part_number}`)
    if (!p.part_number) fail(`missing part_number for ${p.part_name}`)
    if (!p.desc || p.desc.length < 20) fail(`desc too short for ${p.part_number}`)
    if (!/^https?:\/\//.test(p.src)) fail(`src is not a URL for ${p.part_number}: ${p.src}`)
    if (p.unit_price_gbp !== null && (typeof p.unit_price_gbp !== 'number' || p.unit_price_gbp <= 0)) {
      fail(`unit_price_gbp must be null or a positive number for ${p.part_number}`)
    }
    // Family-coherence spot check: the part_name's own leading words should
    // share at least one real content word with its own desc (a cheap proxy
    // for "this row was written about the part it claims to be").
    const leadWords = p.part_name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4)
    const descLower = p.desc.toLowerCase()
    if (!leadWords.some((w) => descLower.includes(w))) {
      fail(`part_name and desc share no content word (possible copy-paste mismatch): ${p.part_number}`)
    }
  }
  if (failures === 0) pass('all PARTS rows internally consistent')

  for (const f of VERIFIED_NO_PUBLIC_MPN) {
    if (!f.manufacturer || !f.family) fail('VERIFIED_NO_PUBLIC_MPN row missing manufacturer/family')
    if (f.part_name_match.length === 0) fail(`VERIFIED_NO_PUBLIC_MPN ${f.manufacturer} ${f.family} has empty part_name_match`)
    if (f.evidence.length === 0) fail(`VERIFIED_NO_PUBLIC_MPN ${f.manufacturer} ${f.family} has no evidence URLs`)
  }
  pass(`VERIFIED_NO_PUBLIC_MPN has ${VERIFIED_NO_PUBLIC_MPN.length} row(s)`)

  console.log(`\n[selftest] ${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} failure(s)`)
  return failures
}

async function main(): Promise<void> {
  if (SELFTEST) {
    const failures = runSelftest()
    process.exit(failures === 0 ? 0 : 1)
  }

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

  console.log(`\n[ingest] no-public-MPN findings:`)
  const { inserted: fInserted, updated: fUpdated } = writeNoPublicMpnFindings(db, COMMIT)
  console.log(`[ingest] ${COMMIT ? 'COMMITTED' : 'DRY-RUN'}: ${fInserted} finding insert(s), ${fUpdated} finding update(s) in verified_no_public_mpn_findings.`)

  db.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
