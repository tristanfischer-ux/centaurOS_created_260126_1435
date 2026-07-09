// proveCatch for T-06 / E-03 — civils two-truths (engineering-contract.ts water_treatment).
//
// THE BUG: scope_exclusions_desc said "building and civils" while requirements_bom
// derives underground drain-pit excavation — two truths (Sam Green).
// THE RULE: when drain_pit_* quantities exist, scope text must EXCLUDE only building
// fabric / polytunnel / rack, EXPLICITLY include underground pits, and must NOT say
// blanket "no civils" / "the building and civils".

import { buildContract } from '../../engineering-contract'

function run(): void {
  const brief = {
    original_text: `
Water-handling plant. Reverse-osmosis permeate 8 cubic metres per hour.
Pump Unit 1 — 90 cubic metres per hour. Pump Unit 2 — 90 cubic metres per hour.
Drain-water pit: one 5,000-litre concrete drain pit per zone.
Cultivation containers: 6,000 ebb/flow trays.
`,
    product_description: 'fertigation and ebb/flow irrigation water plant',
  }
  const c = buildContract('water_treatment', brief)
  if (!c) throw new Error('civils-scope: buildContract returned null')

  const pitL = c.quantities?.drain_pit_volume_l?.value
  const pitM3 = c.quantities?.drain_collection_sump_volume_each_m3?.value
  if (!(typeof pitL === 'number' && pitL > 0) && !(typeof pitM3 === 'number' && pitM3 > 0)) {
    throw new Error(`civils-scope proveCatch: drain_pit_* must be present (got L=${pitL} m3=${pitM3})`)
  }

  const excl = String((c.shared_quantities as Record<string, unknown> | undefined)?.scope_exclusions_desc ?? '')
  const incl = String((c.shared_quantities as Record<string, unknown> | undefined)?.scope_inclusions_desc ?? '')
  const summary = String(c.brief_summary ?? '')
  const buildingFlag = c.quantities?.building_out_of_scope
  const flagBasis = typeof buildingFlag === 'object' && buildingFlag !== null
    ? String((buildingFlag as { basis?: string }).basis ?? (buildingFlag as { source_detail?: string }).source_detail ?? '')
    : ''

  const blob = `${excl}\n${incl}\n${summary}\n${flagBasis}`.toLowerCase()

  // Must NOT claim blanket "no civils" / "building and civils" as a total exclusion
  if (/\bno\s+civils\b/.test(blob) || /\bthe building and civils\b/.test(excl.toLowerCase())) {
    throw new Error(
      `civils-scope proveCatch: scope must NOT say blanket "no civils" / "the building and civils" when drain pits exist — got excl=${JSON.stringify(excl)}`,
    )
  }
  // Must mention underground pits / excavation as IN scope
  if (!/underground|drain[\s-]?pit|buried\s+drain/.test(blob)) {
    throw new Error(
      `civils-scope proveCatch: scope text must mention underground pits / buried drains — got blob head=${blob.slice(0, 240)}`,
    )
  }
  // Exclusions must name building FABRIC / polytunnel (not bare "civils")
  if (!/building\s+fabric|polytunnel|rack\s+framework/.test(excl.toLowerCase())) {
    throw new Error(
      `civils-scope proveCatch: exclusions must name building fabric / polytunnel / rack — got ${JSON.stringify(excl)}`,
    )
  }
  if (!incl || !/underground|drain[\s-]?pit|buried/.test(incl.toLowerCase())) {
    throw new Error(
      `civils-scope proveCatch: scope_inclusions_desc must call out underground pits — got ${JSON.stringify(incl)}`,
    )
  }

  // eslint-disable-next-line no-console
  console.log(
    `civils-scope --selftest OK (drain_pit present; exclusions=${excl.slice(0, 80)}…; inclusions mention underground pits)`,
  )
}

run()
