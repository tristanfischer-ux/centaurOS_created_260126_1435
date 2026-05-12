// src/lib/pdf-engine-v2/radical/regulatory-prose-llm.ts
//
// Piece 1H (2026-05-12) — LLM-augmented regulatory standard-by-standard prose.
// For each regulatory entry in RegulatoryExtraction, generates four prose blocks:
//   1. applicability       — 1 paragraph: who it applies to + scope
//   2. engineering_impact  — 1 paragraph: design consequences, test costs, schedule
//   3. evidence_required   — 1 paragraph: exact document types and clauses
//   4. gap_action          — 1 paragraph: next concrete step with verb
//
// Same fetch/parse/fallback pattern as Piece 1F (module-paragraph-llm.ts) and
// Piece 1G (brief-overview-llm.ts).
// Model: x-ai/grok-4.3. Temperature 0.3. Max tokens: 1024. One call per standard.
// Calls run concurrently (Promise.all). Each call has a 30 s Promise.race guard.
// Cost: ~£0.03 per standard call. 8 standards ≈ £0.24.

import type { RegulatoryExtraction } from '../types'

export interface RegulatoryStandardProse {
  /** Echoed from the input RegulatoryEntry.standard_name */
  standard_name: string
  /** 1 paragraph (3–6 sentences): who it applies to and what it covers */
  applicability: string
  /** 1 paragraph (3–6 sentences): design impact, timeline, indicative cost */
  engineering_impact: string
  /** 1 paragraph (3–6 sentences): exact evidence documents required */
  evidence_required: string
  /** 1 paragraph (3–6 sentences): concrete next action to close the gap */
  gap_action: string
}

export interface RegulatoryProseLayer {
  /** keyed by standard_name */
  by_standard: Record<string, RegulatoryStandardProse>
  generated_at: string
  model_used: string
  standard_count: number
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior compliance engineer drafting the "Regulatory and Compliance Posture" section of a hardware engineering report for a hardware investor or technical co-founder audience. For a single regulatory standard, write FOUR prose blocks. Output ONLY a single JSON object — no preamble, no markdown fences, no commentary. First character must be opening brace.

Required JSON shape:
{
  "applicability": "<one paragraph>",
  "engineering_impact": "<one paragraph>",
  "evidence_required": "<one paragraph>",
  "gap_action": "<one paragraph>"
}

Style rules:
1. Each block is ONE paragraph, 3–6 sentences.
2. SPECIFIC: reference the standard number, edition year, clause numbers where known, accredited lab names only when they appear in the input (e.g. TUV, UL, Intertek, BSI, SGS). If the input does not name a lab, write "an accredited test house" — never fabricate names.
3. SPECIFIC: include realistic budget figures and timelines only when the input provides them or they are well-established industry benchmarks for this standard. If uncertain, use ranges ("6–12 weeks", "£20,000–£40,000") rather than false precision.
4. Tone: engineering compliance report, factual, direct. No marketing language. No hedging beyond what is genuinely uncertain.
5. British spelling: "authorised", "recognised", "behaviour", "characterise", "organisation".
6. Applicability block: WHAT the standard covers + WHY it is mandatory for this specific product class + jurisdiction trigger.
7. Engineering Impact block: HOW it affects the design — test types required, schedule impact, cost impact. Distinguish cell-level vs pack-level vs system-level obligations where applicable.
8. Evidence Required block: WHAT documentation must be produced — exact document type (test report, declaration of conformity, type certificate, etc.) and which party holds it.
9. Gap Action block: the single NEXT STEP the project team must take, phrased as an action ("Confirm …", "Obtain …", "Engage …", "Request …"). Include a time budget if available.
10. DO NOT begin the response with any preamble. JSON only. First character: {
11. CRITICAL: match the STRUCTURE of the few-shot example below, NOT its domain vocabulary. The example is a UK/EU battery safety standard (IEC 62619); you may receive an FDA medical-device QSR, a CE Machinery Directive standard, an FAA Part 23 airworthiness rule. Do NOT import battery-specific lab names or test methodologies into a non-battery product. Use the vocabulary from the INPUT standard's actual jurisdiction + scope. The example shows you the SHAPE (applicability → engineering-impact-in-pounds-and-weeks → evidence-required-from-supplier → gap-action-with-timeline); fill that shape with the input's actual content.`

// ─── Few-shot example (IEC 62619:2022 for a BESS) ────────────────────────────

const FEW_SHOT_EXAMPLE_INPUT = {
  standard_name: 'IEC 62619:2022',
  version_date: 'Edition 2 (2022)',
  jurisdiction: 'UK / EU / International',
  owner: 'Battery Systems Engineer',
  status: 'not_started',
  claim_type: 'requirement',
  applicability: 'Mandatory for secondary lithium cells and batteries in industrial applications including stationary energy storage.',
  engineering_impact: 'Cell and module level testing required; pack-level thermal propagation test may be required at system level.',
  evidence_required: 'Cell-level test certificates from supplier or independent lab test report.',
  gap_action: 'Confirm cell certification status with CATL; if not certified, engage test house.',
}

const FEW_SHOT_EXAMPLE_OUTPUT = JSON.stringify({
  applicability: 'Mandatory for all secondary lithium cells and batteries used in industrial applications. Covers electrical, mechanical, and environmental safety testing at cell and module level. Required for any battery system selling into UK/EU markets at >16 A per phase. IEC 62619:2022 (Edition 2) supersedes Edition 1 and introduces tighter thermal propagation requirements at the battery system level. Applies regardless of cell chemistry where the energy content exceeds 2 kWh per module.',
  engineering_impact: 'Cell supplier must provide IEC 62619 test certificates for the specific cell type, including the 2022 Edition 2 thermal propagation annex. If using uncertified cells, budget 12 weeks and approximately £40,000 for independent testing at a UKAS-accredited lab. Module-level testing for the assembled pack adds 6–8 weeks and £15,000–£20,000. System-level testing under Annex D (thermal propagation containment) must be confirmed with the accredited test house before design freeze — late-stage failures have caused 6-month programme delays in comparable BESS projects.',
  evidence_required: 'Cell-level test report to IEC 62619:2022 Edition 2 issued by the cell supplier or an accredited test house (test house must be UKAS-, DAkkS-, or ILAC-recognised). Module-level test report covering crush, nail penetration, thermal abuse, and short-circuit tests. Pack-level declaration of conformity signed by the manufacturer\'s technical authority. If self-certifying at system level, a technical construction file referencing each underlying cell and module test report.',
  gap_action: 'Confirm that the selected CATL cell holds a current IEC 62619:2022 Edition 2 certificate — request the test report from the CATL account manager within the next two weeks. If the certificate does not cover Edition 2, obtain cell samples and engage an accredited test house. Budget 14 weeks total from sample dispatch to final test report, with a go/no-go decision point at week 4 when pre-test inspection results are available.',
})

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate LLM-augmented prose for each regulatory standard in the extraction.
 * Throws on complete failure (no standards). Individual standard failures are
 * caught and replaced with fallback prose so the layer always returns a result.
 */
export async function generateRegulatoryProseLayer(
  regulatoryExtraction: RegulatoryExtraction,
  productClass: string,
): Promise<RegulatoryProseLayer> {
  const entries = regulatoryExtraction.regulatory_entries

  if (!entries || entries.length === 0) {
    throw new Error('generateRegulatoryProseLayer: no regulatory entries in extraction')
  }

  // Council 2026-05-12 fix: bound concurrency to 3 to avoid OpenRouter
  // rate-limit (429) cascades when N >= 5. No external p-limit dependency —
  // simple chunked-Promise.all is sufficient. Wall-clock impact: 9 standards
  // at 3 concurrent ≈ 3 batches × 5s ≈ 15s, vs naïve all-parallel ≈ 5s
  // (but with rate-limit risk). Each in-flight call still has its own 30s
  // Promise.race timeout.
  const MAX_CONCURRENT = 3
  const results: RegulatoryStandardProse[] = []
  for (let batchStart = 0; batchStart < entries.length; batchStart += MAX_CONCURRENT) {
    const batch = entries.slice(batchStart, batchStart + MAX_CONCURRENT)
    const batchResults = await Promise.all(
      batch.map(async (entry): Promise<RegulatoryStandardProse> => {
      const userContent = [
        '=== FEW-SHOT EXAMPLE ===',
        `INPUT STANDARD: ${JSON.stringify(FEW_SHOT_EXAMPLE_INPUT, null, 2)}`,
        `PRODUCT CLASS: battery_energy_storage`,
        'OUTPUT:',
        FEW_SHOT_EXAMPLE_OUTPUT,
        '',
        '=== YOUR TASK ===',
        `PRODUCT CLASS: ${productClass}`,
        `INPUT STANDARD: ${JSON.stringify(entry, null, 2)}`,
        '',
        'OUTPUT YOUR JSON OBJECT (four prose blocks, compliance engineering tone, British spelling, specific numbers and timelines where available):',
      ].join('\n')

      try {
        const response = await Promise.race([
          fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'x-ai/grok-4.3',
              temperature: 0.3,
              // Council 2026-05-12 fix: 1024 was tight for 4 prose blocks on
              // complex multi-jurisdiction standards. Raised to 1536 to avoid
              // length-truncation that finish_reason check now surfaces.
              max_tokens: 1536,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userContent },
              ],
            }),
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('regulatory prose LLM call timed out after 30s')), 30_000),
          ),
        ])

        if (!response.ok) {
          throw new Error(`OpenRouter status ${response.status} for ${entry.standard_name}`)
        }

        const json = await response.json() as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
        }
        const finishReason = json.choices?.[0]?.finish_reason
        if (finishReason && finishReason !== 'stop') {
          console.warn(
            `[regulatory-prose-llm] ${entry.standard_name}: finish_reason=${finishReason} — output may be truncated`,
          )
        }

        const raw = json.choices?.[0]?.message?.content?.trim() ?? ''

        // Tolerate code fences and preamble — same pattern as Piece 1F + 1G.
        let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        const firstBrace = cleaned.indexOf('{')
        const lastBrace = cleaned.lastIndexOf('}')
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          cleaned = cleaned.slice(firstBrace, lastBrace + 1)
        }

        const parsed = JSON.parse(cleaned) as Partial<RegulatoryStandardProse>

        if (
          !parsed.applicability ||
          !parsed.engineering_impact ||
          !parsed.evidence_required ||
          !parsed.gap_action
        ) {
          throw new Error(
            `Regulatory prose response missing required fields for ${entry.standard_name}: got [${Object.keys(parsed).join(', ')}]`,
          )
        }

        return {
          standard_name: entry.standard_name,
          applicability: parsed.applicability,
          engineering_impact: parsed.engineering_impact,
          evidence_required: parsed.evidence_required,
          gap_action: parsed.gap_action,
        }
      } catch (err) {
        // Individual standard failure: return fallback prose so the layer
        // always has an entry. The renderer will show this text.
        const message = (err as Error).message
        console.warn(`[regulatory-prose-llm] Failed to generate prose for ${entry.standard_name}: ${message}`)
        return {
          standard_name: entry.standard_name,
          applicability: entry.applicability || '—',
          engineering_impact: entry.engineering_impact || '—',
          evidence_required: entry.evidence_required || '—',
          gap_action: entry.gap_action || '—',
        }
      }
    }),
    )
    results.push(...batchResults)
  }

  const by_standard: Record<string, RegulatoryStandardProse> = {}
  for (const prose of results) {
    by_standard[prose.standard_name] = prose
  }

  return {
    by_standard,
    generated_at: new Date().toISOString(),
    model_used: 'x-ai/grok-4.3',
    standard_count: results.length,
  }
}
