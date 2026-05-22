import './lib/orchestrator/tools/pybamm-real'
import { getTool } from './lib/orchestrator/registry'

const tool = getTool('pybamm:cell-sizing')
if (!tool) { console.error('FAIL'); process.exit(1) }
console.log(`${tool.name} v${tool.version} (${tool.license})`)
;(async () => {
  const r = await tool.invoke({
    target_energy_kwh: 3500,
    dod_fraction: 0.80,
    cell_chemistry: 'lfp' as const,
    cell_capacity_ah: 280,
    cell_voltage_v: 3.2,
  }, {} as any)
  console.log('Output:', JSON.stringify(r.output, null, 2))
  console.log('Warnings:', r.warnings)
  console.log(`Duration: ${r.provenance.duration_ms}ms`)
})()
