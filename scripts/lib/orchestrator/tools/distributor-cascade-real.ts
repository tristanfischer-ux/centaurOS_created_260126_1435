/**
 * scripts/lib/orchestrator/tools/distributor-cascade-real.ts
 *
 * Parts catalogue enrichment tool — DB-only reads from forge-truth.db.
 *
 * CHAIN-AS-DB-CONSUMER ARCHITECTURE (codified 2026-05-25,
 * drawer_forgeos_decisions_e30f5e00a59dc3ff):
 * This tool is now ENRICHMENT not DISCOVERY. It reads from
 * ~/.forge-truth/forge-truth.db via db-only-cascade.ts for every declared
 * BoM part. No live distributor API calls happen here.
 *
 * Live discovery is exclusively the responsibility of scripts/ingest/* jobs
 * running on a schedule. This separation prevents chain runs from burning
 * free-tier quotas (~200 calls/chain × N chains = Mouser/DK/Nexar exhausted
 * within hours as seen in L23-L26).
 *
 * Output preserves the OctopartOutput shape so downstream consumers (chain
 * + tools-flow-mermaid TOOL_INPUT_HINTS) don't need migration. The
 * sources_breakdown uses 'cache:mouser', 'cache:digikey', 'library:mouser'
 * etc. to distinguish DB-cached hits from library-only rows.
 *
 * Trade-off documented intentionally: a part not yet ingested returns
 * in_stock=false, unit_price_gbp=null. This is correct — the chain should
 * not show a price we don't have. Gate 20 (fictional-pn-audit) will emit
 * MED for unknown parts, prompting an ingest run.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { lookupCached } from '../../../../src/lib/pdf-engine-v2/lib/distributors/db-only-cascade'

export interface DistributorCascadeInput {
  parts: Array<{
    manufacturer: string
    part_number: string
    quantity: number
  }>
}

export interface DistributorCascadeOutput {
  parts: Array<{
    manufacturer: string
    part_number: string
    quantity_requested: number
    in_stock: boolean
    stock_units: number
    unit_price_gbp: number | null
    lead_time_weeks_min: number | null
    lead_time_weeks_max: number | null
    distributors: string[]
  }>
  total_priced_count: number
  total_in_stock_count: number
  /** Per-source hit count — populates the mermaid PRICE_VERIFICATION cluster. */
  sources_breakdown: Record<'mouser' | 'digikey' | 'farnell' | 'lcsc' | 'nexar' | 'rs' | 'eriks' | 'zoro', number>
}

export const distributorCascadeRealTool: Tool<DistributorCascadeInput, DistributorCascadeOutput> = {
  id: 'octopart:parts-lookup', // kept stable so TOOL_INPUT_HINTS + mermaid still match
  name: 'Distributor Cascade — DB Enrichment (forge-truth.db, no live API)',
  version: '2026-05-25-db-only',
  license: 'free-proprietary',  // DB read, no live API calls
  source_url: 'forge-truth.db distributor_cascade_cache + pretraining_extracted_parts',
  domain: 'parts_catalog',
  pinned_environment: {
    mouser_api: 'cached',
    digikey_api: 'cached',
    farnell_api: 'cached',
    lcsc_api: 'cached',
    nexar_api: 'cached',
  },
  applicable_to() {
    return true // every class has BoM parts worth looking up
  },
  async invoke(input): Promise<ToolResult<DistributorCascadeOutput>> {
    const t0 = Date.now()
    const out_parts: DistributorCascadeOutput['parts'] = []
    const sources_breakdown: DistributorCascadeOutput['sources_breakdown'] = {
      mouser: 0,
      digikey: 0,
      farnell: 0,
      lcsc: 0,
      nexar: 0,
      rs: 0,
      eriks: 0,
      zoro: 0,
    }
    let priced = 0
    let in_stock = 0

    for (const p of input.parts) {
      const mpn = (p.part_number || '').trim()
      const mfr = (p.manufacturer || '').trim() || null

      if (mpn.length < 2) {
        out_parts.push({
          manufacturer: p.manufacturer,
          part_number: p.part_number,
          quantity_requested: p.quantity,
          in_stock: false,
          stock_units: 0,
          unit_price_gbp: null,
          lead_time_weeks_min: null,
          lead_time_weeks_max: null,
          distributors: [],
        })
        continue
      }

      // DB-only lookup — synchronous, zero quota
      const dbResult = lookupCached(mfr, mpn)

      if (!dbResult.found || !dbResult.result) {
        out_parts.push({
          manufacturer: p.manufacturer,
          part_number: p.part_number,
          quantity_requested: p.quantity,
          in_stock: false,
          stock_units: 0,
          unit_price_gbp: null,
          lead_time_weeks_min: null,
          lead_time_weeks_max: null,
          distributors: [],
        })
        continue
      }

      const best = dbResult.result

      // Record discovery source with prefix indicating data origin
      const sourceKey = best.source
      const sourceLabel = `${dbResult.source === 'library_only' ? 'library' : 'cache'}:${sourceKey}`
      sources_breakdown[sourceKey] = (sources_breakdown[sourceKey] ?? 0) + 1
      console.debug(`[distributor-cascade] DB ${sourceLabel} hit for ${mpn}`)

      const stockBest = best.stockUK ?? 0
      const isInStock = stockBest > 0
      if (isInStock) in_stock += 1

      // Extract qty-1 GBP price from cached result
      let priceQty1: number | null = null
      if (best.priceGBP && best.priceGBP.length > 0) {
        const sorted = [...best.priceGBP].sort((a, b) => a.qty - b.qty)
        const p0 = sorted[0].unitPriceGbp
        priceQty1 = Number.isFinite(p0) && p0 > 0 ? p0 : null
      }
      if (priceQty1 != null) priced += 1

      const lead = best.leadWeeks

      out_parts.push({
        manufacturer: best.manufacturer || p.manufacturer,
        part_number: best.mpn || p.part_number,
        quantity_requested: p.quantity,
        in_stock: isInStock,
        stock_units: stockBest,
        unit_price_gbp: priceQty1,
        lead_time_weeks_min: lead,
        lead_time_weeks_max: lead,
        distributors: [sourceKey],
      })
    }

    const out: DistributorCascadeOutput = {
      parts: out_parts,
      total_priced_count: priced,
      total_in_stock_count: in_stock,
      sources_breakdown,
    }
    return {
      ok: true,
      output: out,
      provenance: {
        source: 'tool:octopart:parts-lookup',
        tool_id: 'octopart:parts-lookup',
        tool_version: '2026-05-25-db-only',
        tool_license: 'free-proprietary',
        tool_source_url: 'forge-truth.db distributor_cascade_cache + pretraining_extracted_parts',
        invocation_input: input,
        pinned_versions: {
          mouser_api: 'cached',
          digikey_api: 'cached',
          farnell_api: 'cached',
          lcsc_api: 'cached',
          nexar_api: 'cached',
        },
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - t0,
      },
      warnings: [
        'DB-only mode: no live API calls. Prices and stock from cached distributor data. ' +
        'Run scripts/ingest/run-weekly-component-sweep.sh to refresh the cache.',
      ],
    }
  },
}

registerTool(distributorCascadeRealTool)
