import { assertProjectContextDeterminism, buildProjectContext } from '../src/lib/forge/project-context'
const ok = assertProjectContextDeterminism()
console.log('Determinism check:', ok ? 'PASS' : 'FAIL')
const empty = buildProjectContext({})
console.log('Empty hash:', empty.contextHash.slice(0, 16) + '…', '(string:', empty.contextString + ')')
