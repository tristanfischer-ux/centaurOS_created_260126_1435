import { readFileSync, writeFileSync } from 'fs'
import { dedupePrincipalWords, explodeEquipmentSubAssemblies } from './lib/orchestrator/generic/universal-contract-sizing.ts'
const p = process.argv[2]; const st = JSON.parse(readFileSync(p,'utf8'))
const mods = (st.moduleDecomposition?.modules)||[]
const dd = dedupePrincipalWords(mods); const ex = explodeEquipmentSubAssemblies(mods)
writeFileSync(p, JSON.stringify(st))
console.log(`[depth] deduped ${dd} duplicate principals; +${ex} physics-sized sub-components`)
