import { getRegistryByProductClass } from '../src/lib/pdf-engine-v2/lib/character-registry'

async function main() {
  for (const cls of ['energy_storage', 'heatpump', 'vertical_farm']) {
    const seed = await getRegistryByProductClass(cls, 10)
    console.log(`${cls}: ${seed.length} rows`)
    for (const r of seed.slice(0, 5)) {
      console.log(`  ${r.character_id.padEnd(38)}  ${(r.manufacturer ?? '-').padEnd(20)}  ${(r.mpn_hints[0] ?? '-').padEnd(30)}  ${r.source_grade}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
