import { runReportCompiler } from './pipeline/run-report-compiler'
import { architectureContract } from './sections/architecture'
import type { ProductDossier } from './schema/types'

const brief = [
  'Design a containerised 3.5 MWh / 1 MW LFP BESS for UK grid support.',
  'It must include grid conversion, thermal safety, BMS supervision and fire protection.',
].join(' ')

main().catch(error => {
  console.error(error)
  throw error
})

async function main(): Promise<void> {
  const valid = await runReportCompiler({ id: 'architecture-audit-bess', briefText: brief })
  const broken = breakArchitecture(valid.dossier)
  const validIssues = architectureContract.validate(valid.dossier.architecture, valid.dossier)
  const brokenIssues = architectureContract.validate(broken.architecture, broken)

  console.log('Architecture validation asks:')
  console.log('- Are required product-class modules present?')
  console.log('- Is every critical part allocated to a sub-module?')
  console.log('- Do required module-to-module interface links exist?')
  console.log('- Are modules and sub-modules non-empty?')

  console.log('\nVALID ARCHITECTURE')
  console.log(validIssues.length ? validIssues : 'No architecture issues')

  console.log('\nBROKEN ARCHITECTURE NEGATIVE CONTROL')
  for (const item of brokenIssues) {
    console.log(`- ${item.severity}/${item.code}: ${item.message}`)
  }
}

function breakArchitecture(dossier: ProductDossier): ProductDossier {
  const copy = JSON.parse(JSON.stringify(dossier)) as ProductDossier
  copy.architecture.modules = copy.architecture.modules.filter(module => module.id !== 'environmental_interface')
  const source = copy.architecture.modules.find(module => module.id === 'energy_storage_source')
  if (source) {
    source.interfaces = source.interfaces.filter(name => name !== 'dc_bus')
    const cellRacks = source.subModules.find(subModule => subModule.id === 'cell_racks')
    if (cellRacks) cellRacks.words = []
  }
  return copy
}
