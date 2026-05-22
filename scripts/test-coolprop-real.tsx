import './lib/orchestrator/tools/coolprop-real'
import { getTool } from './lib/orchestrator/registry'

const tool = getTool('coolprop:refrigerant-properties')
if (!tool) {
  console.error('FAIL: tool not registered')
  process.exit(1)
}
console.log(`Tool: ${tool.name} v${tool.version} (${tool.license})`)
;(async () => {
  const result = await tool.invoke({ fluid: 'r290', temperature_c: 35 }, {} as any)
  console.log('Result:', JSON.stringify(result.output, null, 2))
  console.log(`Duration: ${result.provenance.duration_ms}ms`)
})()
