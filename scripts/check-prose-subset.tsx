import { readFileSync } from 'fs'
import { runGrammarGates } from '../src/lib/pdf-engine-v2/radical/universal-grammar-gates'

const paths = [
  ['BESS iter-33', '/Users/tristanfischer/Downloads/bess-iter/iter-33-universal/bess-container/state.json'],
  ['VF iter-44',   '/Users/tristanfischer/Downloads/bess-iter/iter-44-verticalfarm/container/state.json'],
  ['HP iter-40',   '/Users/tristanfischer/Downloads/bess-iter/iter-40-heatpump/container/state.json'],
] as const

for (const [name, path] of paths) {
  const s = JSON.parse(readFileSync(path, 'utf-8'))
  const modules = s.moduleDecomposition?.modules ?? []
  const cross = s.moduleDecomposition?.cross_module_grammar_links ?? []
  const result = runGrammarGates(modules, cross)
  const subset = result.results.find(r => r.name === 'module_prose_subset_of_sub_modules')
  console.log(`\n=== ${name} ===`)
  console.log(`subset gate: ${subset?.passed ? 'PASS' : 'FAIL'} (score ${subset?.score})`)
  if (!subset?.passed) {
    for (const r of (subset?.reasons ?? [])) console.log(`  ${r}`)
  }
}
