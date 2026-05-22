/**
 * scripts/lib/orchestrator/tools/octopart-stub.ts
 *
 * Phase 2 stub — Octopart parts catalog.
 *
 * Lookup component availability + pricing + manufacturer data for
 * each declared BoM part_number. Real Octopart wrapper hits the
 * Octopart GraphQL API; returns identical fields.
 *
 * STUB ECHOES PARTS BACK as "available". Real wrapper marks
 * unavailable parts so the chain can surface procurement risk.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'

export interface OctopartInput {
  parts: Array<{
    manufacturer: string
    part_number: string
    quantity: number
  }>
}

export interface OctopartOutput {
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
}

export const octopartLookupStub: Tool<OctopartInput, OctopartOutput> = {
  id: 'octopart:parts-lookup',
  name: 'Octopart Parts Catalog',
  version: '2026-05-stub',
  license: 'proprietary',  // free tier available
  source_url: 'octopart.com',
  domain: 'parts_catalog',
  pinned_environment: { octopart_api: 'v4-stub' },
  applicable_to() {
    return true  // all classes benefit from parts lookup
  },
  async invoke(input): Promise<ToolResult<OctopartOutput>> {
    const t0 = Date.now()
    const parts = input.parts.map(p => ({
      manufacturer: p.manufacturer,
      part_number: p.part_number,
      quantity_requested: p.quantity,
      in_stock: true,                   // stub: pretend everything's in stock
      stock_units: p.quantity * 5,
      unit_price_gbp: null,             // stub: don't fabricate prices
      lead_time_weeks_min: 8,
      lead_time_weeks_max: 16,
      distributors: ['Digi-Key', 'Mouser', 'Farnell'],
    }))
    const out: OctopartOutput = { parts, total_priced_count: 0, total_in_stock_count: parts.length }
    return { ok: true, output: out, provenance: { source: 'tool:octopart:parts-lookup', tool_id: 'octopart:parts-lookup', tool_version: '2026-05-stub', tool_license: 'proprietary', tool_source_url: 'octopart.com', invocation_input: input, pinned_versions: { octopart_api: 'v4-stub' }, timestamp: new Date(0).toISOString(), duration_ms: Date.now() - t0 }, warnings: ['STUB: returns all parts as available without real catalog lookup; real Octopart API not wired'] }
  },
}
registerTool(octopartLookupStub)
