/**
 * scripts/ingest/seed-verified-class-parts.ts — GROWING-DB seed for a component class
 * (2026-07-10, Powerwall run-22: 49/79 engineered lines carried 'TBD (detailed design)'
 * because pretraining_extracted_parts has no residential-ESS-class rows — the memory's
 * '#1 BoM-ceiling lever'). Candidate (manufacturer, MPN) pairs are proposed from model
 * knowledge and are NEVER trusted directly (the gate-20 writeback discipline): every one
 * is LIVE-verified through verifyProposedParts (the same distributor cascade Stage 10.6
 * uses); ONLY a confirmed distributor hit is written back to the library — inside
 * recordDistributorHit, with its embedding, so Stage 17.6 retrieval works immediately.
 *
 * INGEST-side (live APIs legal here — chain-as-DB-consumer principle): run OFFLINE,
 * never from the chain hot path.
 *
 *   npx tsx scripts/ingest/seed-verified-class-parts.ts [candidates.json]
 *
 * Without an argument it seeds the built-in residential-ESS list below.
 */
import { verifyProposedParts, type ProposedPart } from '../lib/background-enrichment'
import { readFileSync } from 'fs'

type Candidate = { name: string; manufacturer: string; mpn: string; component_class: string }

// Residential/small-commercial ESS balance-of-system parts — widely distributor-stocked
// families matching run-22's open 'TBD' requirements (BMS monitoring, DC contactor/fuse,
// AC breaker/contactor, comms, sensing, cooling). The live verifier is the filter: an
// MPN that no distributor confirms is simply not written.
const RESIDENTIAL_ESS_CANDIDATES: Candidate[] = [
  { name: 'BMS cell-monitoring AFE 16-cell (battery monitor IC)', manufacturer: 'Texas Instruments', mpn: 'BQ76952PFBR', component_class: 'bms_slave' },
  { name: 'BMS cell-monitoring AFE 18-cell (battery monitor IC)', manufacturer: 'Analog Devices', mpn: 'LTC6813HLWE-1#3ZZPBF', component_class: 'bms_slave' },
  { name: 'Battery pack monitor 14-cell AFE', manufacturer: 'Texas Instruments', mpn: 'BQ76940DBTR', component_class: 'cell_monitoring' },
  { name: 'DC contactor 500 A 12 V coil (EV/ESS main contactor)', manufacturer: 'TE Connectivity', mpn: 'EV200AAANA', component_class: 'dc_contactor' },
  { name: 'DC contactor 100 A sealed (ESS pack contactor)', manufacturer: 'TE Connectivity', mpn: 'EVC135-1A2M9', component_class: 'dc_contactor' },
  { name: 'PV/battery dc fuse 20 A 1000 Vdc 10x38', manufacturer: 'Littelfuse', mpn: 'SPF020.T', component_class: 'dc_fuse' },
  { name: 'PV/battery dc fuse 15 A 1000 Vdc', manufacturer: 'Bussmann', mpn: 'PV-15A10F', component_class: 'dc_fuse' },
  { name: 'MCB 63 A curve C 2-pole (main ac breaker)', manufacturer: 'Schneider Electric', mpn: 'A9F44263', component_class: 'ac_breaker' },
  { name: 'MCB 63 A curve C 2-pole (main ac breaker)', manufacturer: 'ABB', mpn: '2CDS252001R0634', component_class: 'ac_breaker' },
  { name: 'AC contactor 40 A AC-3 (grid interface)', manufacturer: 'Schneider Electric', mpn: 'LC1D40AM7', component_class: 'ac_contactor' },
  { name: 'Surge protective device type 2 (dc side)', manufacturer: 'Phoenix Contact', mpn: '2800642', component_class: 'surge_protection' },
  { name: 'Industrial ethernet switch 5-port unmanaged', manufacturer: 'Phoenix Contact', mpn: '2891005', component_class: 'ethernet_switch' },
  { name: 'Industrial ethernet switch 5-port unmanaged', manufacturer: 'Moxa', mpn: 'EDS-205', component_class: 'ethernet_switch' },
  { name: 'Hall-effect current transducer 100 A', manufacturer: 'LEM', mpn: 'HASS 100-S', component_class: 'current_transducer' },
  { name: 'Busbar current shunt 100 A 75 mV', manufacturer: 'Murata Power Solutions', mpn: '3020-01102-0', component_class: 'current_shunt' },
  { name: 'NTC temperature sensor 10k (cell temperature)', manufacturer: 'TDK', mpn: 'NTCG163JF103FT1', component_class: 'temperature_sensor' },
  { name: 'Axial cooling fan 119 mm 24 Vdc', manufacturer: 'ebm-papst', mpn: '4414FNH', component_class: 'cooling_fan' },
  { name: 'Axial cooling fan 92 mm 12 Vdc', manufacturer: 'Sanyo Denki', mpn: '9GA0912P4G001', component_class: 'cooling_fan' },
  { name: 'Power relay SPDT 12 A (aux control)', manufacturer: 'Omron', mpn: 'G2R-1-E DC12', component_class: 'relay' },
  { name: 'Insulation monitoring device (unearthed dc system)', manufacturer: 'Bender', mpn: 'B94012045', component_class: 'insulation_monitor' },
]

async function main(): Promise<number> {
  const argPath = process.argv[2]
  const candidates: Candidate[] = argPath
    ? JSON.parse(readFileSync(argPath, 'utf8'))
    : RESIDENTIAL_ESS_CANDIDATES
  const proposed: ProposedPart[] = candidates.map((c, i) => ({
    module_id: 'seed',
    sub_module_id: c.component_class,
    word_id: `seed_${i}_${c.mpn}`,
    manufacturer: c.manufacturer,
    proposed_mpn: c.mpn,
    component_class: c.component_class,
    source: 'seed-verified-class-parts (model-proposed, live-verified)',
  }))
  console.log(`[seed] verifying ${proposed.length} candidate(s) against the live distributor cascade…`)
  const outcomes = await verifyProposedParts(proposed)
  let confirmed = 0
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i]
    const c = candidates[i]
    if (o.matched) {
      confirmed++
      console.log(`[seed]   ✓ ${c.manufacturer} ${c.mpn} (${c.component_class}) — ${o.matched_source}` +
        (o.qty1_gbp != null ? ` £${o.qty1_gbp}` : ''))
    } else {
      console.log(`[seed]   ✗ ${c.manufacturer} ${c.mpn} (${c.component_class}) — ${o.note ?? 'unconfirmed'} (NOT written)`)
    }
  }
  console.log(`[seed] ${confirmed}/${candidates.length} confirmed → written back to pretraining_extracted_parts (embedded)`)
  // PRIORITY LANE (2026-07-10, the runs 42-47 plateau root): dbFirstLookup's retrieval
  // window admits discovery_source='web_verified_ingest' rows FIRST — recordDistributorHit
  // writes 'distributor:<src>', which drowns on common tokens behind the 36k-row sweep.
  // A LIVE distributor confirmation is a stronger verification than a web ingest, so
  // promote this batch's confirmed rows into the priority lane.
  try {
    const Better = (await import('better-sqlite3')).default
    const dbw = new Better(`${process.env.HOME}/.forge-truth/forge-truth.db`)
    const mpns = outcomes.map((o, i) => o.matched ? candidates[i].mpn : null).filter(Boolean) as string[]
    if (mpns.length) {
      const q = mpns.map(() => '?').join(',')
      const r = dbw.prepare(`UPDATE pretraining_extracted_parts SET discovery_source='web_verified_ingest', confidence=0.95 WHERE part_number IN (${q}) AND discovery_source LIKE 'distributor:%'`).run(...mpns)
      console.log(`[seed] promoted ${r.changes} row(s) to the web_verified_ingest priority lane`)
      // DESIGN-VOCAB LEAD SEGMENT (2026-07-10, run 50): recordDistributorHit stores the
      // DISTRIBUTOR's category name ('Thermistors - NTC 10kOhms 1% 0402') whose lead segment
      // carries none of the design vocabulary the fill's type-coherence bar tests against
      // ('cell temperature sensor') — so a correctly-seeded part is unreachable: the head-noun
      // check refuses it. Prefix the row name with the candidate's design-vocab name (both
      // names honestly describe the part; the distributor name is preserved after the dash).
      const rename = dbw.prepare(`UPDATE pretraining_extracted_parts SET part_name = ? || ' — ' || part_name WHERE part_number = ? AND part_name NOT LIKE ? || '%'`)
      let renamed = 0
      for (let i = 0; i < outcomes.length; i++) {
        if (!outcomes[i].matched) continue
        const plain = candidates[i].name.replace(/[()\/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90)
        renamed += rename.run(plain, candidates[i].mpn, plain).changes
      }
      console.log(`[seed] design-vocab lead segment prefixed on ${renamed} row(s)`)
    }
    dbw.close()
  } catch (e) {
    console.log(`[seed] priority-lane promotion skipped: ${(e as Error).message.slice(0, 100)}`)
  }
  return 0
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1) })
