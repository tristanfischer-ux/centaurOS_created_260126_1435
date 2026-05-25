/**
 * scripts/lib/orchestrator/tools/distributor-cascade-real.ts
 *
 * REAL parts catalogue lookup tool — replaces the prior octopart-stub.
 *
 * For every declared BoM part (manufacturer, part_number, quantity), call
 * the distributor cascade `findSkuForPart` from
 * src/lib/pdf-engine-v2/lib/distributors/index.ts which hits in parallel:
 *   - Mouser  (MOUSER_API_KEY)
 *   - Digi-Key (DIGIKEY_CLIENT_ID + DIGIKEY_CLIENT_SECRET)
 *   - Farnell (FARNELL_API_KEY)
 *   - LCSC    (LCSC_API_KEY when set)
 *   - Nexar   (NEXAR_ACCESS_TOKEN or NEXAR_CLIENT_ID/SECRET)
 *
 * The cascade is the AUTHORITATIVE tier-1 source per the mempalace policy
 * (drawer_forgeos_decisions: part-verification.ts) — distributor URLs are
 * trusted by construction (no HEAD-check needed), LLM verification is the
 * last-resort tier.
 *
 * Output preserves the OctopartOutput shape so downstream consumers (chain
 * + tools-flow-mermaid TOOL_INPUT_HINTS) don't need migration. Provenance
 * carries the count of hits per source so the Mermaid + Tools Used
 * appendix can display the cascade breakdown.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { findSkuForPart } from '../../../../src/lib/pdf-engine-v2/lib/distributors'

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
  name: 'Distributor Cascade (Mouser + Digi-Key + Farnell + LCSC + Nexar)',
  version: '2026-05-25-real',
  license: 'mixed (Mouser commercial / Digi-Key commercial / Farnell commercial / LCSC commercial / Nexar Evaluation)',
  source_url: 'https://www.mouser.co.uk/api-hub/ + https://developer.digikey.com/ + https://partner.element14.com/ + https://www.lcsc.com/ + https://portal.nexar.com/',
  domain: 'parts_catalog',
  pinned_environment: {
    mouser_api: 'v2',
    digikey_api: 'v4',
    farnell_api: 'v1',
    lcsc_api: 'v1',
    nexar_api: 'supSearchMpn-graphql',
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
      let result: Awaited<ReturnType<typeof findSkuForPart>> = null
      try {
        if (mpn.length >= 2) result = await findSkuForPart(mpn, mfr)
      } catch (err) {
        console.warn(`[distributor-cascade] error on ${mpn}: ${(err as Error).message}`)
      }
      if (!result) {
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
      const best = result.best
      sources_breakdown[best.source] = (sources_breakdown[best.source] ?? 0) + 1
      for (const alt of result.alternates) {
        sources_breakdown[alt.source] = (sources_breakdown[alt.source] ?? 0) + 1
      }
      const stockBest = best.stockUK ?? 0
      const isInStock = stockBest > 0
      if (isInStock) in_stock += 1
      const priceQty1 = result.qty1GBP
      if (priceQty1 != null && priceQty1 > 0) priced += 1
      const lead = best.leadWeeks
      const distributorNames = [best.source, ...result.alternates.map((a) => a.source)]
      out_parts.push({
        manufacturer: best.manufacturer || p.manufacturer,
        part_number: best.mpn || p.part_number,
        quantity_requested: p.quantity,
        in_stock: isInStock,
        stock_units: stockBest,
        unit_price_gbp: priceQty1,
        lead_time_weeks_min: lead,
        lead_time_weeks_max: lead,
        distributors: Array.from(new Set(distributorNames)),
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
        tool_version: '2026-05-25-real',
        tool_license: 'mixed',
        tool_source_url: 'https://www.mouser.co.uk/api-hub/',
        invocation_input: input,
        pinned_versions: {
          mouser_api: 'v2',
          digikey_api: 'v4',
          farnell_api: 'v1',
          lcsc_api: 'v1',
          nexar_api: 'supSearchMpn-graphql',
        },
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - t0,
      },
      warnings: [],
    }
  },
}

registerTool(distributorCascadeRealTool)
