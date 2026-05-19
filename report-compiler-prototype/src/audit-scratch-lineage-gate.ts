import type { ChainV2Analysis } from './chain-v2/types'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { PipelineStageTrace, ProductDossier } from './schema/types'
import { buildDepthBenchmark } from './scoring/depth-benchmark'
import { buildScratchLineageGate, renderScratchLineageGateCsv } from './scoring/scratch-lineage-gate'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const result = await runReportCompiler({ id: 'audit-scratch-lineage-bess', briefText: brief })
  const gate = buildScratchLineageGate(result.dossier, result.stageTrace)
  const csv = renderScratchLineageGateCsv(gate)

  assert(gate.verdict === 'scratch_lineage_clean', 'Unsourced BESS scratch run should have clean scratch lineage.')
  assert(gate.summary.architectureSource === 'scratch_universal_architecture', 'BESS architecture must come from the scratch universal architecture grammar.')
  assert(gate.summary.forbiddenRefs === 0, 'Clean scratch run should not contain chain-v2/state.json provenance refs.')
  assert(gate.summary.forbiddenStageMentions === 0, 'Clean scratch run should not contain chain-v2/state.json stage trace text.')
  assert(csv.trim().split('\n').length === gate.summary.rows + 1, 'Scratch lineage CSV should contain one header plus one row per gate row.')

  const chainBenchmark = buildDepthBenchmark(
    result.dossier,
    result.architectureReadiness,
    result.issues,
    result.score,
    fakeChainBenchmark(),
  )
  const benchmarkGate = buildScratchLineageGate(result.dossier, result.stageTrace, chainBenchmark)

  assert(benchmarkGate.verdict === 'scratch_lineage_clean', 'Chain-v2 aggregate benchmark must not taint scratch lineage.')
  assert(benchmarkGate.summary.chainBenchmarkUsed, 'Gate should report when the chain-v2 numeric benchmark is present.')
  assert(benchmarkGate.rows.find(row => row.area === 'benchmark_isolation')?.verdict === 'pass', 'Benchmark isolation row should pass when content policy quarantines chain-v2 to aggregate counts.')

  const taintedDossier: ProductDossier = structuredClone(result.dossier)
  taintedDossier.architecture.modules[0].subModules[0].words[0].provenance.push({
    kind: 'model',
    ref: 'chain-v2-adapted.state.json.words[0]',
  })
  const taintedGate = buildScratchLineageGate(taintedDossier, result.stageTrace, chainBenchmark)

  assert(taintedGate.verdict === 'scratch_lineage_blocked', 'Chain-v2/state.json provenance inside design content should block lineage.')
  assert(taintedGate.rows.find(row => row.area === 'chain_v2_quarantine')?.verdict === 'blocked', 'Chain-v2 quarantine should catch tainted provenance refs.')

  const taintedTrace: PipelineStageTrace[] = structuredClone(result.stageTrace)
  taintedTrace[2] = {
    ...taintedTrace[2],
    evidence: [...taintedTrace[2].evidence, 'copied from /tmp/chain-v2/state.json'],
  }
  const traceGate = buildScratchLineageGate(result.dossier, taintedTrace, chainBenchmark)

  assert(traceGate.verdict === 'scratch_lineage_blocked', 'Chain-v2/state.json stage evidence should block lineage.')
  assert(traceGate.summary.forbiddenStageMentions > 0, 'Forbidden stage mention should be counted.')

  const sourceInArchitecture: ProductDossier = structuredClone(result.dossier)
  sourceInArchitecture.architecture.modules[0].subModules[0].words[0].provenance.push({
    kind: 'source',
    ref: 'https://example.com/unadmitted-architecture-source',
    quote: 'unadmitted design source',
  })
  const sourceGate = buildScratchLineageGate(sourceInArchitecture, result.stageTrace)

  assert(sourceGate.verdict === 'scratch_lineage_blocked', 'Source refs inside architecture content should block source boundary.')
  assert(sourceGate.rows.find(row => row.area === 'source_evidence_boundary')?.verdict === 'blocked', 'Source evidence boundary should catch source refs outside admitted sourcing evidence.')

  console.log('Scratch lineage gate audit passed')
  console.log({
    clean: gate.summary,
    benchmark: benchmarkGate.summary,
    tainted: taintedGate.summary,
    trace: traceGate.summary,
    sourceBoundary: sourceGate.summary,
  })
}

function fakeChainBenchmark(): ChainV2Analysis {
  return {
    moduleCount: 11,
    subModuleCount: 90,
    wordCount: 480,
    moduleGrammarLinkCount: 40,
    crossModuleLinkCount: 20,
    pricedWordCount: 200,
    pricedWordRatio: 0.42,
    estimatedBomTotalGbp: 750000,
    issues: [],
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
