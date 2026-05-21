#!/usr/bin/env npx tsx
/**
 * scripts/test-orchestrator-e2e.tsx
 *
 * Phase 1+2 end-to-end test for the universal engineering orchestrator.
 *
 * Loads:
 *   - PyBaMM stub tool (registers under 'pybamm:cell-sizing')
 *   - BESS class plan (registers under 'bess:utility_containerised')
 * Calls orchestrateDesign() with a fake 3.5 MWh BESS brief.
 * Prints the full result: envelope, tool results, consistency, contract
 * quantities sourced from tools, attribution page.
 *
 * This is the smoke test that validates the entire orchestrator chain
 * works end-to-end with at least one tool registered. Real PyBaMM
 * subprocess wrapper is a drop-in replacement for the stub.
 *
 * Usage: npx tsx scripts/test-orchestrator-e2e.tsx
 */

import './lib/orchestrator/tools/pybamm-stub'             // register the stub
import './lib/orchestrator/class-plans/bess'              // register the BESS plan
import { orchestrateDesign, renderToolsUsedPageAsText } from './lib/orchestrator/orchestrate'
import { BESS_UTILITY_CONTAINERISED_PLAN } from './lib/orchestrator/class-plans/bess'
import { registerPlan, _clearPlansForTests } from './lib/orchestrator/planner'
import type { ContractInProgress, ParsedConstraints, ToolStep } from './lib/orchestrator/types'

// ---------------------------------------------------------------------------
// 1. Inject a single tool step into the BESS plan so the test actually
//    exercises the tool executor + provenance machinery.
// ---------------------------------------------------------------------------

const pybammStep: ToolStep = {
  tool_id: 'pybamm:cell-sizing',
  required: true,
  feeds_into: [],
  input_from_contract: (_c, _brief) => ({
    target_energy_kwh: 3500,    // 3.5 MWh usable
    dod_fraction: 0.80,
    cell_chemistry: 'lfp' as const,
    cell_capacity_ah: 280,
    cell_voltage_v: 3.2,
    ambient_temp_c: 25,
  }),
  contract_update: (c, output: any) => {
    const out = output as { cell_count: number; nameplate_capacity_kwh: number; thermal_dissipation_at_05c_w: number }
    return {
      ...c,
      quantities: {
        ...c.quantities,
        cell_count: {
          value: out.cell_count,
          unit: '',
          family: 'dimensionless',
          basis: 'rated',
          scope: 'cell',
          uncertainty_pct: 2.5,
          temporal_resolution_s: null,
          condition: null,
          provenance: {
            source: 'tool:pybamm:cell-sizing',
            tool_id: 'pybamm:cell-sizing',
            tool_version: '23.5-stub',
            tool_license: 'BSD-3-Clause',
            tool_source_url: 'github.com/pybamm-team/PyBaMM',
            invocation_output_field: 'cell_count',
            duration_ms: 0,
          },
        },
        nameplate_capacity_kwh: {
          value: out.nameplate_capacity_kwh,
          unit: 'kWh',
          family: 'energy',
          basis: 'nameplate',
          scope: 'system',
          uncertainty_pct: 1.0,
          temporal_resolution_s: null,
          condition: 'BoL, 25°C ambient',
          provenance: {
            source: 'tool:pybamm:cell-sizing',
            tool_id: 'pybamm:cell-sizing',
            tool_version: '23.5-stub',
            tool_license: 'BSD-3-Clause',
            tool_source_url: 'github.com/pybamm-team/PyBaMM',
            invocation_output_field: 'nameplate_capacity_kwh',
            duration_ms: 0,
          },
        },
      },
    }
  },
}

// Re-register the BESS plan with the new step appended.
_clearPlansForTests()
registerPlan({
  ...BESS_UTILITY_CONTAINERISED_PLAN,
  tools: [pybammStep],
})

// ---------------------------------------------------------------------------
// 2. Build a fake parsed brief + starting Contract.
// ---------------------------------------------------------------------------

const parsedBrief: ParsedConstraints = {
  product_class: 'bess',
  product_description: '3.5 MWh utility-scale containerised BESS in a 40HC ISO container for behind-the-meter grid balancing, 28-tonne mass cap.',
  target_performance: { value: 3.5, unit: 'MWh' },
  max_mass_kg: { value: 28000 },
  voltage_class_v: 11000,
  region: 'EU',
}

const initialContract: ContractInProgress = {
  product_class: 'bess',
  brief_summary: 'Containerised 3.5 MWh BESS for behind-the-meter operation.',
  envelope: {} as any,  // orchestrator fills in
  quantities: {
    usable_capacity_kwh: {
      value: 3500,
      unit: 'kWh',
      family: 'energy',
      basis: 'usable',
      scope: 'system',
      uncertainty_pct: 0,
      temporal_resolution_s: null,
      condition: null,
      provenance: { source: 'brief', invocation_output_field: 'target_performance.value' },
    },
    brief_mass_cap_kg: {
      value: 28000,
      unit: 'kg',
      family: 'mass',
      basis: 'max',
      scope: 'system',
      uncertainty_pct: 0,
      temporal_resolution_s: null,
      condition: null,
      provenance: { source: 'brief', invocation_output_field: 'max_mass_kg.value' },
    },
  },
  topology: [],
  closures: [],
  macro_assembly_prices: [],
  _tools_run: [],
}

// ---------------------------------------------------------------------------
// 3. Run the orchestrator.
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== ORCHESTRATOR END-TO-END TEST ===')
  console.log()
  console.log('Brief: 3.5 MWh utility BESS, 28-tonne mass cap, 11 kV PCC')
  console.log()

  const result = await orchestrateDesign(parsedBrief, initialContract, { fallback_on_failure: false })

  console.log(`Orchestrator result: ok=${result.ok}, fallback_to_llm=${result.fallback_to_llm}`)
  console.log(`Iterations: ${result.iterations}`)
  console.log(`Tools run: ${result.contract._tools_run.join(', ') || '(none)'}`)
  console.log(`Failures: ${result.failures.length === 0 ? '(none)' : result.failures.join('; ')}`)
  console.log(`Consistency results: ${result.consistency_results.length === 0 ? '(no rules)' : result.consistency_results.length}`)
  console.log()
  console.log('--- Contract quantities ---')
  for (const [key, q] of Object.entries(result.contract.quantities)) {
    console.log(`  ${key}: ${q.value} ${q.unit}  [${q.provenance.source}]`)
  }
  console.log()
  console.log('--- Tool results ---')
  for (const [toolId, r] of result.tool_results) {
    console.log(`  ${toolId}: ok=${r.ok}, output keys: ${Object.keys((r.output as object) ?? {}).join(', ')}`)
    if (r.warnings.length > 0) console.log(`    warnings: ${r.warnings.join('; ')}`)
  }
  console.log()
  console.log('--- Tools-Used attribution page ---')
  if (result.tools_used_page) {
    console.log(renderToolsUsedPageAsText(result.tools_used_page as any))
  } else {
    console.log('(no attribution page — no tool-sourced quantities)')
  }
  console.log()

  // ── Acceptance checks ───────────────────────────────────────────────
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = []
  checks.push({ name: 'orchestrator returned ok=true', pass: result.ok === true })
  checks.push({ name: 'pybamm:cell-sizing ran', pass: result.contract._tools_run.includes('pybamm:cell-sizing') })
  checks.push({
    name: 'cell_count emitted by tool',
    pass: result.contract.quantities.cell_count?.provenance?.source === 'tool:pybamm:cell-sizing',
    detail: `actual: ${result.contract.quantities.cell_count?.provenance?.source}`,
  })
  checks.push({
    name: 'cell_count value plausible (4800-5100)',
    pass: result.contract.quantities.cell_count?.value >= 4800 && result.contract.quantities.cell_count?.value <= 5100,
    detail: `actual: ${result.contract.quantities.cell_count?.value}`,
  })
  checks.push({
    name: 'attribution page lists pybamm tool',
    pass: result.tools_used_page !== null && (result.tools_used_page as any)?.tools?.some((t: any) => t.tool_id === 'pybamm:cell-sizing'),
  })
  checks.push({
    name: 'design assembled (delegates to Build #17a)',
    pass: result.design !== null && (result.design as any)?.modules?.length > 0,
    detail: `actual modules: ${(result.design as any)?.modules?.length ?? 0}`,
  })

  console.log('--- Acceptance checks ---')
  let failures = 0
  for (const c of checks) {
    const sigil = c.pass ? '[PASS]' : '[FAIL]'
    console.log(`  ${sigil} ${c.name}${c.detail ? `  -> ${c.detail}` : ''}`)
    if (!c.pass) failures++
  }
  console.log()
  if (failures === 0) {
    console.log('=== ALL ACCEPTANCE CHECKS PASSED ===')
    process.exit(0)
  } else {
    console.error(`=== ${failures} ACCEPTANCE CHECK(S) FAILED ===`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(2)
})
