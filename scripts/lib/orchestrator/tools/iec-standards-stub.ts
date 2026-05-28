/**
 * scripts/lib/orchestrator/tools/iec-standards-stub.ts
 *
 * Phase 2 stub — IEC / UL / NFPA / ENA standards lookup.
 *
 * Returns the mandatory regulatory clauses for the given (class, region).
 * Real wrapper scrapes IEC catalog abstracts / pulls ENA G99 PDFs /
 * fetches IEEE DOI; returns identical fields.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'

export interface IecStandardsInput {
  product_class: string
  region: 'EU' | 'UK' | 'US' | 'CA' | 'ROW'
  voltage_class_v?: number
}

export interface IecStandardsOutput {
  mandatory_standards: Array<{
    code: string                         // e.g. 'IEC 62619:2022'
    title: string
    issuing_body: 'IEC' | 'UL' | 'NFPA' | 'ENA' | 'IEEE' | 'BS EN' | 'EN'
    mandatory_for_region: string[]
    summary: string
  }>
  recommended_standards: Array<{ code: string; title: string; summary: string }>
}

const STANDARDS_BY_CLASS: Record<string, IecStandardsOutput> = {
  bess: {
    mandatory_standards: [
      { code: 'IEC 62619:2022', title: 'Secondary cells and batteries containing alkaline or other non-acid electrolytes — Safety requirements for secondary lithium cells and batteries, for use in industrial applications', issuing_body: 'IEC', mandatory_for_region: ['EU', 'UK', 'US'], summary: 'Lithium cell + system safety: cycle life, abuse tolerance, internal short circuit, propagation testing.' },
      { code: 'UL 9540:2020', title: 'Standard for Energy Storage Systems and Equipment', issuing_body: 'UL', mandatory_for_region: ['US', 'CA'], summary: 'Whole-system ESS certification; covers electrical, fire, mechanical safety.' },
      { code: 'UL 9540A:2019', title: 'Test Method for Evaluating Thermal Runaway Fire Propagation in Battery Energy Storage Systems', issuing_body: 'UL', mandatory_for_region: ['US', 'CA'], summary: 'Cell + module + rack + system propagation testing.' },
      { code: 'IEC 62933-5-2:2020', title: 'Electrical energy storage (EES) systems — Part 5-2: Safety requirements for grid-integrated EES systems — Electrochemical-based systems', issuing_body: 'IEC', mandatory_for_region: ['EU', 'UK'], summary: 'Grid integration safety; covers EMC, electrical, mechanical.' },
      { code: 'NFPA 855:2023', title: 'Standard for the Installation of Stationary Energy Storage Systems', issuing_body: 'NFPA', mandatory_for_region: ['US'], summary: 'Installation, separation, fire suppression, ventilation requirements.' },
      { code: 'ENA G99/3', title: 'Requirements for the connection of generation equipment in parallel with public distribution networks', issuing_body: 'ENA', mandatory_for_region: ['UK'], summary: 'UK distribution network grid-code for >16 A/phase generation/storage.' },
    ],
    recommended_standards: [
      { code: 'IEEE 1547:2018', title: 'IEEE Standard for Interconnection and Interoperability of Distributed Energy Resources', summary: 'Grid interconnect best practice (US/international).' },
      { code: 'IEC 61000-6-2:2016', title: 'EMC — Generic standards — Immunity for industrial environments', summary: 'EMC immunity baseline.' },
    ],
  },
  haps: {
    mandatory_standards: [
      { code: 'CS 25', title: 'Certification Specifications for Large Aeroplanes', issuing_body: 'EN', mandatory_for_region: ['EU'], summary: 'EASA certification basis (may be tailored for stratospheric platforms).' },
      { code: '14 CFR Part 21', title: 'Certification Procedures for Products and Articles', issuing_body: 'IEEE', mandatory_for_region: ['US'], summary: 'FAA airworthiness certification.' },
    ],
    recommended_standards: [],
  },
  heat_pump_residential: {
    mandatory_standards: [
      { code: 'EN 14825:2022', title: 'Air conditioners, liquid chilling packages and heat pumps for space heating and cooling — Performance rating and SCOP', issuing_body: 'EN', mandatory_for_region: ['EU', 'UK'], summary: 'Performance rating method including SCOP.' },
      { code: 'EN 378:2016', title: 'Refrigerating systems and heat pumps — Safety and environmental requirements', issuing_body: 'EN', mandatory_for_region: ['EU', 'UK'], summary: 'Refrigerant charge limits, leak testing, ventilation.' },
      { code: 'PED 2014/68/EU', title: 'Pressure Equipment Directive', issuing_body: 'EN', mandatory_for_region: ['EU'], summary: 'Pressure equipment design, manufacture, conformity assessment.' },
      { code: 'IEC 60335-2-40:2018', title: 'Safety of household and similar electrical appliances — Particular requirements for electrical heat pumps, air-conditioners and dehumidifiers', issuing_body: 'IEC', mandatory_for_region: ['EU', 'UK', 'US'], summary: 'Electrical + flammable refrigerant safety; charge limits.' },
    ],
    recommended_standards: [{ code: 'MCS MIS 3005', title: 'Microgeneration Installation Standard — Heat Pumps', summary: 'UK installation accreditation.' }],
  },
}

// 2026-05-28 DE-STUB: query the real corpus instead of returning only the
// hardcoded subset. ~/.forge-truth/forge-truth.db `pretraining_extracted_standards`
// holds 4,098 standards extracted from real spec documents, linked to a
// product_class via pretraining_spec_documents (140 join to BESS docs alone).
// We READ that DB (DB-first, per the chain-as-DB-consumer principle) and keep
// the curated STANDARDS_BY_CLASS as an authoritative region+mandatory overlay
// the raw extraction lacks. Read-only; graceful no-op if the DB is absent.
function lookupStandardsFromDb(productClass: string): Array<{ standard_name: string; scope: string | null; excerpt: string | null }> {
  try {
    const dbPath = resolve(homedir(), '.forge-truth', 'forge-truth.db')
    if (!existsSync(dbPath)) return []
    const db = new Database(dbPath, { readonly: true })
    try {
      const cls = String(productClass || '').toLowerCase().trim()
      if (!cls) return []
      return db.prepare(
        `SELECT DISTINCT s.standard_name AS standard_name, s.scope AS scope, s.raw_excerpt AS excerpt
           FROM pretraining_extracted_standards s
           JOIN pretraining_spec_documents d ON s.document_id = d.id
          WHERE s.standard_name IS NOT NULL AND TRIM(s.standard_name) != ''
            AND ( lower(d.product_class) = @cls
                  OR lower(d.product_class) LIKE @cls || '%'
                  OR @cls LIKE lower(d.product_class) || '%' )
          ORDER BY s.standard_name`,
      ).all({ cls }) as Array<{ standard_name: string; scope: string | null; excerpt: string | null }>
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}

export const iecStandardsLookupStub: Tool<IecStandardsInput, IecStandardsOutput> = {
  id: 'iec-standards:lookup',
  name: 'IEC/UL/NFPA/ENA Standards Lookup',
  version: '2026-05-db',
  license: 'CC-BY-4.0',
  source_url: '~/.forge-truth/forge-truth.db pretraining_extracted_standards + curated overlay',
  domain: 'standards',
  pinned_environment: { source: 'forge-truth.db:pretraining_extracted_standards' },
  applicable_to() {
    return true
  },
  async invoke(input): Promise<ToolResult<IecStandardsOutput>> {
    const t0 = Date.now()
    const curated = STANDARDS_BY_CLASS[input.product_class] ?? null
    const dbRows = lookupStandardsFromDb(input.product_class)

    // Curated mandatory list stays authoritative — it carries the region +
    // mandatory classification the raw DB extraction does not. Region-filter it.
    const mandatory = curated
      ? curated.mandatory_standards.filter(s => s.mandatory_for_region.includes(input.region))
      : []
    // Family keys from the curated mandatory codes, so we don't double-list a
    // standard the overlay already covers (e.g. DB "IEC 62619" vs curated "IEC 62619:2022").
    const mandatoryFamilies = mandatory.map(s => s.code.replace(/[:\s].*$/, '').toLowerCase()).filter(Boolean)

    const seen = new Set<string>()
    const dbRecommended = dbRows
      .filter(r => {
        const key = String(r.standard_name).trim().toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        for (const fam of mandatoryFamilies) if (fam && (key.includes(fam) || fam.includes(key))) return false
        return true
      })
      .map(r => ({
        code: r.standard_name.trim(),
        title: String(r.scope || r.excerpt || '').trim().slice(0, 200),
        summary: String(r.excerpt || r.scope || '').trim().slice(0, 300),
      }))

    const output: IecStandardsOutput = {
      mandatory_standards: mandatory,
      recommended_standards: [...(curated?.recommended_standards ?? []), ...dbRecommended],
    }

    const warnings: string[] = []
    if (dbRows.length === 0 && !curated) {
      warnings.push(`No standards in forge-truth.db for class "${input.product_class}" and no curated overlay.`)
    } else {
      warnings.push(`Standards: ${mandatory.length} curated-mandatory (region ${input.region}) + ${dbRecommended.length} from forge-truth.db (class "${input.product_class}", ${dbRows.length} rows scanned).`)
    }

    const hasAny = output.mandatory_standards.length > 0 || output.recommended_standards.length > 0
    return {
      ok: hasAny,
      output: hasAny ? output : null,
      provenance: {
        source: 'tool:iec-standards:lookup',
        tool_id: 'iec-standards:lookup',
        tool_version: '2026-05-db',
        tool_license: 'CC-BY-4.0',
        tool_source_url: '~/.forge-truth/forge-truth.db pretraining_extracted_standards',
        invocation_input: input,
        pinned_versions: { source: 'forge-truth.db:pretraining_extracted_standards' },
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - t0,
      },
      warnings,
      ...(hasAny ? {} : { error: `no standards data for class: ${input.product_class}` }),
    }
  },
}
registerTool(iecStandardsLookupStub)
