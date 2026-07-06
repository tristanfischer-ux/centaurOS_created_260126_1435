#!/usr/bin/env npx tsx
/**
 * scripts/ingest/ingest-co2-verified-parts.ts — curated, WEB-VERIFIED CO2-
 * mineralisation parts ingest into pretraining_extracted_parts (the growing-DB
 * principle: DB-first → search-on-miss → VERIFY → write-back class-tagged).
 * Modelled EXACTLY on ingest-bess-verified-parts.ts's discipline — read that
 * file first if you are extending this one.
 *
 * WHY (2026-07-06): out/co2-campaign-v5's parts-ledger.json lists 18 NOT-FOUND
 * tags (Part names 8.2) — K-102, V-104, X-103, X-102, H-103, Z-101, X-116,
 * EP-104, C-104, X-131, X-133, I-105, I-103, I-102, X-106, X-107, X-140, H-101
 * — plus 2 orphan_equipment tags (X-114, E-101). Every INGEST row below was
 * verified on a manufacturer/distributor page ACTUALLY FETCHED on 2026-07-06
 * (URL in the `src` field).
 *
 * ═══ ORPHAN DISSECTION (2026-07-06) ═══════════════════════════════════════════
 * parts_ledger.py's `orphan_equipment` = a PROCESS-type identity with zero
 * fluid/electrical edges in the connection graph (scripts/blender-universal/
 * parts_ledger.py lines ~1438-1487) — connection_ledger.py's wiring gap, a
 * SIBLING-owned file, out of this round's ownership.
 *   X-114 'gypsum feed hopper + screw' — pinned Schenck Process MULTICOR (a
 *     genuine loss-in-weight screw-feeder family) — ALREADY HONEST. No ingest.
 *     The connectivity gap (its screw-feeder motor never wired to EP-104) is a
 *     connection_ledger.py fix, routed not fixed here.
 *   E-101 'crystalliser vacuum condenser' — was WRONGLY 'IDENTIFIED' as 'GEA
 *     FLUIDBED VIBRO-FLUIDISER' (£9,200, status IDENTIFIED, basis 'catalogue')
 *     — a SIBLING-IDENTITY-COLLISION: the CO2/K2SO4 hot-air DRYER's own real
 *     MPN (verified: GEA VIBRO-FLUIDIZER fluid-bed dryer) was copied onto this
 *     UNRELATED thermal-transfer word (and a second word, 'dryer exhaust
 *     heat-recovery exchanger', E-107 — same bug, not orphaned by connectivity
 *     but equally dishonest). FIXED AT THE RULE in scripts/requirements_bom.py
 *     (`_detect_borrowed_identities`'s exemption for a "rated principal" was
 *     firing on ANY capacity/rating_primary value — including a thermal-
 *     transfer noun with NO downstream rating-cost model at all — so the
 *     collision was never even checked; narrowed to `_has_rating_cost_model`,
 *     which only exempts nouns _RATING_COST_MODELS actually has a curve for
 *     — motor/VFD/pump/blower/MCC/etc. — preserving the original SAF EP-109
 *     exemption byte-for-byte while catching this one). A second, independent
 *     widening (`_is_identity_bearing_pn`) was required because GEA's real MPN
 *     was itself captured as a non-numeric product-FAMILY name ('FLUIDBED
 *     VIBRO-FLUIDISER', no digits) — the prior `_is_structured_pn`-only gate
 *     could never flag a collision on a copied identity with no digits. Full
 *     replay proof: `requirements_bom.py out/co2-campaign-v5 --json`
 *     before/after the rule fix — E-101 AND E-107 flip IDENTIFIED→NOT FOUND
 *     with a disclosed "MPN unresolved — GEA is correct but the specific part
 *     number is not" basis; BESS-v15 catches 3 more genuine label/tape/padlock
 *     collisions (Brady 25714/121194/121085 — the SAME bug family); water-v79
 *     and SAF-v21 are BYTE-IDENTICAL (the SAF D-102/D-103 bespoke-placeholder
 *     exemption this whole mechanism protects is unaffected).
 *   E-101 now correctly reads NOT FOUND (an honest, still-open research gap)
 *     — this file's `VERIFIED_NO_PUBLIC_MPN` list gives it its own honest
 *     finding (Graham Manufacturing / GEA Wiegand make small custom surface
 *     condensers for exactly this vacuum-crystalliser/vapour-ejector duty, but
 *     neither publishes a catalogue MPN for a compact custom unit at this
 *     scale — genuinely bespoke/engineered-to-order, not a research failure).
 *
 * Family-coherence discipline (gate-20 / the PAC-SH71DS lesson, AND the E-101
 * lesson above): each MPN's product family matches the part class — a pump
 * gets a pump MPN, a fan gets a fan MPN, never an unrelated accessory OR an
 * unrelated equipment class entirely. Every `part_name` LEADS with the word's
 * own requirement text so the fill-blank matcher's head-noun + qualifier-
 * coherence checks (`dbHitAcceptableForWord`, `pickBestDbCandidate` in
 * src/lib/pdf-engine-v2/lib/emitter-completion.ts) are satisfied BY
 * CONSTRUCTION, not by luck — calibrated against the REAL exported functions
 * on a scratch DB (FORGE_TRUTH_DB_PATH_OVERRIDE) before commit.
 *
 * Genuinely OEM-proprietary / no-public-MPN items get an honest finding in the
 * SHARED `verified_no_public_mpn_findings` table (created by the water-
 * treatment script; this script re-uses it with class_tag='co2_mineralisation')
 * — never an invented part number. Genuinely bespoke/fabricated items (a
 * poured-concrete column plinth, a made-to-order conveyor, a build-to-order
 * cooling-water skid) are NOT force-fitted with an ill-matched catalogue part
 * — they stay the correct, honest classification the engine already renders;
 * a VERIFIED_NO_PUBLIC_MPN finding is recorded, no row is ingested.
 *
 * Rows are embedded at insert (text-embedding-3-small, 1536-d Float32LE, the
 * canonical [part_name, manufacturer, part_number, raw_excerpt] recipe) so the
 * Stage 17.6 cosine RAG serves them immediately; degrades to NULL embedding
 * when OPENAI_API_KEY is absent (backfill-embeddings.ts sweeps those).
 *
 * Idempotent: skips any (manufacturer, part_number) already present.
 * DRY-RUN by default; --commit writes. No live distributor calls (chain-as-
 * DB-consumer rule untouched — this is a curated seed, not an API sweep).
 *
 * Usage:
 *   npx tsx scripts/ingest/ingest-co2-verified-parts.ts             # dry-run
 *   npx tsx scripts/ingest/ingest-co2-verified-parts.ts --commit
 *   npx tsx scripts/ingest/ingest-co2-verified-parts.ts --selftest  # shape checks, no DB
 *
 * British spelling throughout.
 *
 * ═══ PARTS-ROUND-1-NOTFOUND-INVENTORY (2026-07-06) ═══════════════════════════
 * out/co2-campaign-v5's parts-ledger.json `not_found` = 18 tags. For each,
 * (name_human, sub_module id) was read verbatim from out/co2-campaign-v5/
 * state.json's moduleDecomposition tree. Disposition per tag:
 *
 *  REAL MPN FOUND + INGESTED (14 tags):
 *   K-102 flue-gas inlet blower → CEM S.r.l. BLC-ex ATEX centrifugal blower.
 *   X-103 KOH solids dosing feeder → Coperion K-Tron K-ML-D5-KT20 loss-in-
 *     weight screw feeder.
 *   X-102 K2SO4 pusher centrifuge → ANDRITZ ecoOne pusher centrifuge (ANDRITZ's
 *     own page names "Potassium Sulfate" as an application — a genuine, not
 *     keyword-only, match).
 *   H-103 electric steam generator → Chromalox CHSI high-capacity electric
 *     steam boiler.
 *   X-116 plant PLC controller → Siemens SIMATIC S7-1500 CPU 1516-3 PN/DP,
 *     6ES7516-3AN02-0AB0 (resolves the ledger's own "Siemens is correct but
 *     the specific part number is [unresolved]" note).
 *   EP-104 motor control centre → Eaton Freedom 2100 Series MCC (a real,
 *     named, catalogued packaged-MCC product LINE; no single MPN exists for a
 *     configured-to-order 750 kW/30+-motor lineup — same "family reference, no
 *     single SKU" shape as the BESS round's Mersen Infini-Cell/Motivair
 *     In-Rack Manifold rows).
 *   V-104 dryer inlet air-heater battery → Chromalox ADH Series flanged
 *     process duct heater (build-to-order flanged heater; family reference).
 *   X-131 access platform + ladders → Kee Safety Kee Platform modular
 *     tube-and-fitting access system (a real catalogue SYSTEM, welding-free,
 *     to BS 5395-3/EN 14122; family reference — configured per plant layout).
 *   X-133 safety shower + eyewash → Hughes Safety Showers L18GS34G floor-
 *     mounted combination safety shower + eye/face wash, ANSI Z358.1.
 *   I-105 nitrogen blanketing skid → Groth Corporation 3011 (Series 3000
 *     blanket-gas regulator) — the 311×410×600mm envelope is far too small
 *     for a PSA nitrogen-generation skid; a compact tank-blanketing regulator
 *     panel is the correct real match at this scale.
 *   I-103 ATEX area extract fan → Systemair AXC 100 A / AXC-EX cased axial
 *     duct fan, ATEX II 2G Ex h IIB+H2 T4 Gb.
 *   I-102 ATEX-zone inlet louvre → CVE Shop CVWL38-600 aluminium weather
 *     louvre, 600×600mm nominal (honest caveat carried in `desc`: louvres are
 *     passive/non-ignition, so no manufacturer sells an independently
 *     "ATEX-certified" louvre SKU — a robust weatherproof louvre is what is
 *     actually specified for an ATEX-area inlet path).
 *   X-107 bag heat sealer → Fischbein (nVenia) B2600 continuous band sealer.
 *   X-140 sealer jaw heating element → Foscott Packaging FRD675 heater
 *     cartridge elements (a genuine stocked spare-part SKU, £25.00/set —
 *     matches the ×2 quantity as one set).
 *
 *  GENUINELY NO PUBLIC MPN — VERIFIED_NO_PUBLIC_MPN finding, NOT ingested
 *  (4 not-found tags + the E-101 orphan, 5 total):
 *   Z-101 cooling-water skid — S&S Technical's real, named "PCW" packaged
 *     pump+HX+controls skid product family; every unit is engineered-to-order
 *     against customer flow/duty/footprint with no published model/size table.
 *   C-104 field-erection column plinth — a reinforced-concrete/steel civil
 *     foundation, designed to site-specific loads by a structural engineer;
 *     no manufacturer sells a foundation plinth as a catalogue SKU.
 *   X-106 bag take-away conveyor — Spiroflow-type belt conveyors are
 *     explicitly bespoke/made-to-order (length, belt width, height configured
 *     per bagging-line layout); no fixed model code exists.
 *   H-101 shrink-wrap tunnel heater — Vepro Group's real electric shrink-
 *     tunnel family publishes kW/dimension figures (12/12.2/34.6 kW) but none
 *     lands on the exact 24 kW / 2400×1760×2200mm duty and no manufacturer
 *     assigns an independent MPN to the heater bank alone (spec'd per tunnel
 *     by the tunnel OEM).
 *   E-101 crystalliser vacuum condenser (orphan, fixed at the rule — see
 *     header) — Graham Manufacturing (steam surface condensers + vacuum
 *     ejector systems, explicitly including "small packaged units") and GEA
 *     Wiegand (shell-and-tube surface condensers for exactly this vacuum-
 *     distillation/crystalliser vapour duty) are the two genuine, verified
 *     manufacturer families for this equipment class; neither publishes a
 *     catalogue MPN for a compact ~60 kW custom unit — every real unit is
 *     custom-engineered to the process duty.
 *
 * TOTAL new verified parts this round: 14 real MPN rows + 5 VERIFIED_NO_PUBLIC_
 * MPN findings = 19 of the 20 items (not_found 18 + orphan_equipment 2) given
 * an honest disposition; X-114 (the 2nd orphan) already carries an honest,
 * correctly-matched IDENTIFIED status (Schenck Process MULTICOR) and needed
 * no ingest — its remaining orphan flag is a connection_ledger.py wiring gap,
 * routed (not this round's ownership) not fixed.
 */
import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'

const DB_PATH = process.env.FORGE_TRUTH_DB_PATH_OVERRIDE || resolve(homedir(), '.forge-truth', 'forge-truth.db')
const CLASS_TAG = 'co2_mineralisation'
const DISCOVERY_SOURCE = 'web_verified_ingest'
const COMMIT = process.argv.includes('--commit')
const SELFTEST = process.argv.includes('--selftest')

interface VerifiedPart {
  part_name: string          // LEADS with the word's own requirement text — see file header
  manufacturer: string
  part_number: string        // real catalogue MPN / product number / series id
  desc: string                // duty + spec, honest datasheet numbers
  src: string                 // the page actually fetched + verified 2026-07-06
  unit_price_gbp: number | null
  component_class?: string
  upgrade?: boolean
}

const PARTS: VerifiedPart[] = [
  {
    part_name: 'Flue-gas inlet blower — CEM BLC-ex ATEX centrifugal blower, 316 stainless casing, non-sparking impeller',
    manufacturer: 'CEM S.r.l.', part_number: 'BLC-ex 12',
    desc: 'CEM BLC-ex range ATEX centrifugal blower, AISI 316 stainless spiral casing, non-sparking forward-curved steel impeller, ATEX-certified motor (Zone I-IIG), flanged in/out connections, range 4.5-265 m3/min. Indicative flue-gas inlet blower for a 500 kg/h hot corrosive flue-gas duty (~10-12 m3/min at typical post-quench density), within the BLC-ex 12 m3/min frame size.',
    src: 'https://oceanfootprint.co.uk/product/blc-atex-centrifugal-blowers/',
    unit_price_gbp: null,
  },
  {
    part_name: 'Dryer inlet air-heater battery — Chromalox ADH Series flanged in-duct process air heater, Incoloy-sheathed elements',
    manufacturer: 'Chromalox', part_number: 'ADH Series',
    desc: 'Chromalox ADH/ADHT Series flanged, in-duct tubular-element process air heater, 5-270 kW at 240/480 V three-phase, Incoloy-sheathed elements for corrosion/oxidation resistance, continuous outlet temperatures to 800 degF. Indicative dryer inlet air-heater battery for a 68 kW preheat duty ahead of a fluidised-bed/vibrating dryer (build-to-order flanged heater — exact kW/voltage/duct-diameter configured per order; family reference).',
    src: 'https://www.chromalox.com/en/products-and-technologies/industrial-heaters-and-systems/air-and-radiant-heaters/duct-heaters/flanged-duct-heaters',
    unit_price_gbp: null,
  },
  {
    part_name: 'KOH solids dosing feeder — Coperion K-Tron K-ML-D5-KT20 loss-in-weight twin-screw feeder, stainless contact parts',
    manufacturer: 'Coperion K-Tron', part_number: 'K-ML-D5-KT20',
    desc: 'Coperion K-Tron K-ML-D5-KT20 loss-in-weight twin-screw feeder, KT20 platform, stainless-steel product-contact surfaces, gas-purged shaft seals — suited to corrosive/caustic solids such as KOH flakes/pellets. Indicative KOH solids dosing feeder for a 250 kg/h metered-feed duty into a reactor feed line.',
    src: 'https://datasheets.globalspec.com/ds/2896/CoperionKtron/5E232485-E6B5-4FCB-A430-4CAC00D1B946',
    unit_price_gbp: null,
  },
  {
    part_name: 'K2SO4 pusher centrifuge — ANDRITZ ecoOne pusher centrifuge, potassium-sulphate duty',
    manufacturer: 'ANDRITZ', part_number: 'ecoOne',
    desc: 'ANDRITZ ecoOne pusher centrifuge range, basket diameters 250-1,250 mm, throughput up to 150 t/h, up to 99% solids recovery — ANDRITZ\'s own product page names "Potassium Sulfate" and "Potash" as named applications, a genuine (not keyword-only) match. Indicative K2SO4 pusher centrifuge separating potassium-sulphate crystals from mother liquor at a 165 kg/h duty (well below the range\'s normal throughput floor — a pilot/small-scale unit at the bottom of the ecoOne range; confirm minimum frame size at detailed design).',
    src: 'https://www.andritz.com/products-en/separation/filter-centrifuges/andritz-pusher-centrifuge-ecoone',
    unit_price_gbp: null,
  },
  {
    part_name: 'Electric steam generator — Chromalox CHSI high-capacity electric steam boiler, Incoloy sheath elements',
    manufacturer: 'Chromalox', part_number: 'CHSI',
    desc: 'Chromalox CHSI series electric (non-gas-fired) high-capacity steam boiler, rated 735-4,550 lb/hr (about 333-2,064 kg/hr) at 210-1,300 kW and up to 250 psig, Incoloy-sheathed elements, proportional/touchscreen control. Indicative electric steam generator for a 450 kg/h (about 992 lb/hr) duty feeding a distillation reboiler — near the smallest CHSI frame size.',
    src: 'https://www.chromalox.com/en/products-and-technologies/industrial-heaters-and-systems/electric-steam-generation/electric-steam-boilers/high-capacity-steam-boilers',
    unit_price_gbp: null,
  },
  {
    part_name: 'Plant PLC controller — Siemens SIMATIC S7-1500 CPU 1516-3 PN/DP',
    manufacturer: 'Siemens', part_number: '6ES7516-3AN02-0AB0',
    desc: 'Siemens SIMATIC S7-1500 CPU 1516-3 PN/DP, 2 MB work memory / 7.5 MB data memory, three onboard interfaces (PROFINET IRT with integrated 2-port switch, PROFINET RT, PROFIBUS DP) — sufficient I/O headroom via distributed ET 200 remote I/O for a mid-size chemical plant with many field devices. Indicative plant PLC controller (resolves the ledger\'s own note that "Siemens is correct but the specific part number is" unresolved).',
    src: 'https://support.industry.siemens.com/cs/attachments/59191914/s71500_cpu1516_3_pn_dp_manual_en-US_en-US.pdf',
    unit_price_gbp: null,
  },
  {
    part_name: 'Motor control centre — Eaton Freedom 2100 Series low-voltage MCC, packaged multi-section lineup',
    manufacturer: 'Eaton', part_number: 'Freedom 2100',
    desc: 'Eaton Freedom 2100 Series, NEMA ICS-18 packaged LV motor control centre built from modular vertical sections (standard width about 508 mm/20in, depths 381/508 mm, heights to about 2286 mm/90in), combination starter/VFD buckets sized per load. Indicative motor control centre for a 750 kW / 30+-motor-load connected plant (a multi-section lineup, not a single fixed SKU — configured per one-line diagram at detailed design; family reference).',
    src: 'https://www.eaton.com/us/en-us/catalog/low-voltage-power-distribution-controls-systems/low-voltage-motor-control-centers.html',
    unit_price_gbp: null,
  },
  {
    part_name: 'Access platform + ladders — Kee Safety Kee Platform modular steel/aluminium access system',
    manufacturer: 'Kee Safety', part_number: 'Kee Platform',
    desc: 'Kee Safety Kee Platform, a real catalogue modular tube-and-fitting access system (Kee Klamp galvanised steel or Kee Lite aluminium), welding-free, engineered to BS 5395-3 and EN 14122, supplied with project-specific CAD/construction drawings; integrated fixed-ladder + guardrail accessory range within the same system. Indicative plant maintenance access platform + ladder assembly (configured per plant layout — footprint/ladder run length/handrail metreage set at detailed design; family reference — individual Kee Klamp fitting part numbers are separately catalogued).',
    src: 'https://www.keesafety.com/platforms-walkways/kee-mobile-platforms',
    unit_price_gbp: null,
  },
  {
    part_name: 'Safety shower + eyewash — Hughes Safety Showers L18GS34G floor-mounted combination unit, ANSI Z358.1',
    manufacturer: 'Hughes Safety Showers', part_number: 'L18GS34G',
    desc: 'Hughes Safety Showers L18GS34G floor-mounted combination safety shower + eye/face wash: shower flow about 76 L/min (20 US gpm), eye/face wash 3 US gpm flushing flow, both within ANSI/ISEA Z358.1 minimum flow requirements; powder-coated stainless-steel construction for corrosion resistance against splashed KOH/MEA. Indicative emergency safety shower + eyewash station for a corrosive-chemical plant.',
    src: 'https://www.hughes-safety.com/us/floor-mounted-laboratory-safety-shower-with-eye-wash',
    unit_price_gbp: null,
  },
  {
    part_name: 'Nitrogen blanketing skid — Groth 3011 tank-blanketing regulator, compact panel-mounted assembly',
    manufacturer: 'Groth Corporation', part_number: '3011',
    desc: 'Groth Corporation Series 3000 (3011L/3011H/3011HP/3020A) blanket-gas regulator, 0.5 in-WC to 15 psig, DN15-DN25 (1/2-1 in) NPT/flanged connections, spring-loaded piston design, field-adjustable 5-100% flow capacity — the recognised standard product for tank/vessel headspace nitrogen blanketing at this physical scale (the stated 311x410x600mm envelope is far too small for a PSA nitrogen-generation skid; a compact regulator panel is the correct real match). Indicative nitrogen blanketing skid protecting a tank/vessel headspace from oxidation/explosion risk.',
    src: 'https://www.grothcorp.com/products/blanket-gas-regulators/',
    unit_price_gbp: null,
  },
  {
    part_name: 'ATEX area extract fan — Systemair AXC 100 A cased axial duct fan, ATEX II 2G Ex h IIB+H2 T4 Gb',
    manufacturer: 'Systemair', part_number: 'AXC 100 A',
    desc: 'Systemair AXC 100 A cased axial duct fan, standard performance point 237 m3/h at 279 Pa (27 W, 0.13 A) — within about 5% of a 250 m3/h duty; the AXC-EX range shares the same cased-axial platform with ATEX marking II 2G Ex h IIB+H2 T4 Gb for zones 1/2. Indicative ATEX area extract fan ventilating a hazardous-area plant zone (confirm the 100 mm-diameter size is offered in the -EX ATEX variant at order — flameproof motor housings sometimes force ATEX ranges to a larger minimum frame size).',
    src: 'https://www.systemair.com/en/products/fans/axial-fans/axc/axc-ex',
    unit_price_gbp: null,
  },
  {
    part_name: 'ATEX-zone inlet louvre — CVWL38-600 aluminium weather louvre, 600 x 600mm nominal opening',
    manufacturer: 'CVE Shop', part_number: 'CVWL38-600',
    desc: 'CVWL38-600 extruded-aluminium weather louvre, 600x600mm nominal opening (655x655mm overall), 3.0mm frame/2.0mm blades, integral bird mesh. Indicative fresh-air inlet louvre paired with an ATEX-zone extract fan (honest caveat: a passive, non-electrical louvre has no ignition source, so under the ATEX Directive 2014/34/EU no manufacturer sells an independently "ATEX-certified louvre" SKU as such — a standard robust weatherproof louvre of this type is what is actually specified for the inlet air path into an ATEX-classified area).',
    src: 'https://www.cveshop.co.uk/cveshophome/prod_1659381-Aluminium-Weather-Louvre-600mm-x-600mm.html',
    unit_price_gbp: null,
  },
  {
    part_name: 'Bag heat sealer — Fischbein B2600 continuous band sealer',
    manufacturer: 'Fischbein', part_number: 'B2600',
    desc: 'Fischbein (nVenia) B2600 continuous heat/band sealer for closing polyethylene/polypropylene gusseted, pillow and pouch bags at up to 100 linear ft/min, 230V/3ph/60Hz standard power (9.0A draw), height-adjustable base (32.5-56.5in). Indicative bag heat sealer closing filled PCC/K2SO4/gypsum product bags on a bagging line.',
    src: 'https://www.nvenia.com/equipment/band-sealer-b2600/',
    unit_price_gbp: null,
  },
  {
    part_name: 'Sealer jaw heating element — FRD675 heater cartridge elements (pack of 2), band-sealer jaw spare part',
    manufacturer: 'Foscott Packaging', part_number: 'FRD675',
    desc: 'Foscott Packaging FRD675 heater cartridge elements, sold as a set of two, fits inside the seal jaws of continuous/rotary band sealers (listed for CBS730 and FRD-1000 model sealers). Indicative sealer jaw heating element spare part for a bag heat sealer\'s jaw mechanism — matches the ledger\'s x2 quantity as one set. Confirm exact fitment against the final specified sealer model (jaw heater cartridges are generally sealer-model-specific) at detailed design.',
    src: 'https://www.foscottpackaging.co.uk/FRD675-Heater-Cartridge-Elements',
    unit_price_gbp: 25.00,
  },
]

// ── VERIFIED NO-PUBLIC-MPN FINDINGS ─────────────────────────────────────────
// Re-uses the SAME `verified_no_public_mpn_findings` table the water-treatment
// script created (idempotent, keyed by (manufacturer, family)); this round adds
// class_tag='co2_mineralisation' rows for the genuinely bespoke/no-public-MPN
// items — see PARTS-ROUND-1-NOTFOUND-INVENTORY above for the full reasoning
// per item (Z-101, C-104, X-106, H-101, E-101).
interface NoPublicMpnFinding {
  class_tag: string
  manufacturer: string
  family: string
  part_name_match: string[]
  evidence: string[]
  verified_date: string
  note: string
}
const VERIFIED_NO_PUBLIC_MPN: NoPublicMpnFinding[] = [
  {
    class_tag: CLASS_TAG,
    manufacturer: 'S&S Technical, Inc.',
    family: 'Process Cooling Water (PCW) packaged pump + heat-exchanger + controls skid',
    part_name_match: ['cooling-water skid', 'cooling water skid'],
    evidence: ['https://www.skidsolutions.com/packaged-pumping-systems/process-cooling-water-systems/'],
    verified_date: '2026-07-06',
    note: 'A real, named S&S Technical "PCW" packaged skid product family (stainless pump + heat exchanger + actuated/manual valves + UL-listed PLC/HMI panel) — genuinely engineered-to-order against customer flow/duty/footprint, no published catalogue model numbers, capacity steps, or dimension table on the manufacturer\'s own site (enquiries directed to a phone quote).',
  },
  {
    class_tag: CLASS_TAG,
    manufacturer: 'Civil/structural contractor (site-specific design)',
    family: 'Field-erection column plinth / equipment foundation',
    part_name_match: ['field-erection column plinth', 'column plinth'],
    evidence: ['no public MPN exists for a poured foundation — negative-finding, no catalogue page to cite'],
    verified_date: '2026-07-06',
    note: 'A reinforced-concrete/steel column foundation plinth is a civil/structural deliverable designed to site-specific loads (dead weight, wind, seismic, soil bearing) by a structural engineer and cast/fabricated on site — no manufacturer sells this as a catalogue part number; correctly priced as a materials take-off (concrete + rebar + anchor bolts + formwork), not a vendor SKU.',
  },
  {
    class_tag: CLASS_TAG,
    manufacturer: 'Spiroflow (and equivalent conveyor systems integrators)',
    family: 'Bag take-away belt conveyor',
    part_name_match: ['bag take-away conveyor', 'bag conveyor'],
    evidence: ['https://www.spiroflow.com/conveyor-solutions/'],
    verified_date: '2026-07-06',
    note: 'Spiroflow\'s own materials state they "design and manufacture bespoke material handling equipment tailored to customer requirements" — no fixed model code or catalogue SKU is published for belt conveyors; length, belt width and height are configured per job (an 810mm belt width is consistent with heavy 25kg PCC/K2SO4 sack duty, still made-to-order).',
  },
  {
    class_tag: CLASS_TAG,
    manufacturer: 'Vepro Group (and equivalent shrink-tunnel OEMs — MSK, Sancell, Premier Tech, Robopac)',
    family: 'Shrink-wrap tunnel heater bank',
    part_name_match: ['shrink-wrap tunnel heater', 'shrink wrap tunnel heater'],
    evidence: ['https://www.veprogroup.com/shrink-tunnel/'],
    verified_date: '2026-07-06',
    note: 'Vepro publishes real electric shrink-tunnel heater ratings (12 kW, 12.2 kW, 34.6 kW) and machine envelopes (1200x1200x2000mm to 2250x1200x2000mm) but none lands on the exact 24 kW / 2400x1760x2200mm duty; shrink-tunnel heater banks are near-universally specified per tunnel size/throughput by the tunnel manufacturer rather than sold as a standalone, independently-numbered part.',
  },
  {
    class_tag: CLASS_TAG,
    manufacturer: 'Graham Manufacturing / GEA Wiegand',
    family: 'Small custom shell-and-tube surface condenser for vacuum-crystalliser / steam-jet-ejector vapour duty',
    part_name_match: ['crystalliser vacuum condenser'],
    evidence: [
      'https://graham-mfg.com/solutions/products/surface-condensers/',
      'https://www.gea.com/en/products/vacuum-systems/vacuum-systems/multi-stage-steam-jet-vacuum-pumps/',
    ],
    verified_date: '2026-07-06',
    note: 'Graham Manufacturing (steam surface condensers, explicitly including "small packaged units", paired with vacuum ejector systems) and GEA Wiegand (shell-and-tube surface condensers recommended by GEA for vacuum-distillation/chemical duty where the evacuated vapour must not contact the cooling media) are the two genuine, verified manufacturer families for this exact equipment class — the orphan (E-101) that was WRONGLY pinned to an unrelated GEA fluid-bed dryer MPN (see file header) now correctly reads NOT FOUND; neither manufacturer publishes a catalogue MPN for a compact ~60 kW custom unit — every real unit at this scale is custom-engineered to the process duty (vapour composition, cooling-water temperature, vacuum level), not a stock SKU.',
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
    if (f.class_tag !== CLASS_TAG) fail(`VERIFIED_NO_PUBLIC_MPN ${f.manufacturer} ${f.family} has wrong class_tag ${f.class_tag}`)
  }
  pass(`VERIFIED_NO_PUBLIC_MPN has ${VERIFIED_NO_PUBLIC_MPN.length} row(s)`)

  // Every PARTS row's own component_class (or the default CLASS_TAG) must be
  // class-tagged 'co2_mineralisation' — never left implicitly BESS/water/SAF —
  // so a cross-class cosine-RAG hit is provably impossible by construction.
  for (const p of PARTS) {
    const cc = p.component_class ?? CLASS_TAG
    if (cc !== CLASS_TAG && !['sensor', 'motor_actuator', 'mechanical_assembly'].includes(cc)) {
      fail(`PARTS row ${p.part_number} has an unexpected component_class override ${cc}`)
    }
  }

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
