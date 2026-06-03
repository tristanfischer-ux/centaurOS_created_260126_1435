/**
 * scripts/enrich-state-with-investors.tsx
 *
 * Pre-render enrichment step (2026-06-03): reads the chain's state.json, builds the
 * investor-fit section from the brief (Forge Capital match — see
 * src/lib/pdf-engine-v2/lib/investor-section.ts), and writes it onto
 * state.investorSection for the renderer's InvestorPage. Same shape as the other
 * pre-render enrichers (enrich-state-with-suppliers.tsx). Fail-soft — always exits 0
 * so it can never break a chain run. British spelling.
 *
 *   npx tsx scripts/enrich-state-with-investors.tsx <state.json> [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { buildInvestorSection } from '../src/lib/pdf-engine-v2/lib/investor-section'

async function main(): Promise<void> {
  const statePath = process.argv[2]
  if (!statePath) {
    console.error('usage: enrich-state-with-investors.tsx <state.json> [--write]')
    process.exit(0)
  }
  let state: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (e) {
    console.error(`[investor] could not read state (${(e as Error).message}) — skipping`)
    process.exit(0)
  }

  const pb = state.parsedBrief ?? {}
  const c = pb.constraints ?? {}
  // Reconstruct enough brief text for investment-signal extraction from the parsed brief.
  const briefText = [
    pb.product_description,
    state.moduleDecomposition?.product_class ?? pb.product_class,
    c.target_market_region ?? c.country,
    pb.target_customers,
    JSON.stringify({ additional: c.additional_constraints, standards: c.safety_standards }).slice(0, 1200),
  ].filter(Boolean).join('\n')

  const section = await buildInvestorSection(briefText)
  if (section && process.argv.includes('--write')) {
    state.investorSection = section
    writeFileSync(statePath, JSON.stringify(state, null, 2))
    console.error(`[investor] wrote ${section.picks.length}-investor section to state (${section.candidate_count} candidates)`)
  } else if (!section) {
    console.error('[investor] no section produced — skipping (renderer will omit the page)')
  }
}

main().catch((e) => {
  console.error('[investor] non-fatal failure:', (e as Error)?.message ?? e)
  process.exit(0)
})
