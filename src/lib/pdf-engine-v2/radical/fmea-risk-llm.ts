// src/lib/pdf-engine-v2/radical/fmea-risk-llm.ts
//
// Piece 1I (2026-05-12) — LLM-augmented FMEA risk prose.
// For each risk row in the FMEA, generates four prose blocks:
//   1. hazard       — 1 paragraph: what could go wrong, when, severity
//   2. root_cause   — 1 paragraph: engineering root cause + failure mode
//   3. mitigation   — 1 paragraph: design choices that reduce probability
//   4. detection    — 1 paragraph: how the system detects + responds
//
// Same fetch/parse/fallback pattern as Piece 1F, 1G, and 1H.
// Model: x-ai/grok-4.3. Temperature 0.3. Max tokens: 1024. One call per risk.
// Calls run concurrently (Promise.all). Each call has a 30 s Promise.race guard.
// Risks are sorted by severity × likelihood descending; top 20 processed.
// Cost: ~£0.03 per risk call. 10 risks ≈ £0.30.

import type { RiskRow } from '../types'

export interface FmeaRiskProse {
  /** Echoed from the input RiskRow.id */
  risk_id: string
  /** 1 paragraph (3–6 sentences): what could go wrong, when, severity context */
  hazard: string
  /** 1 paragraph (3–6 sentences): engineering root cause + failure mode mechanism */
  root_cause: string
  /** 1 paragraph (3–6 sentences): design choices and controls that reduce probability */
  mitigation: string
  /** 1 paragraph (3–6 sentences): how the system detects the failure and responds */
  detection: string
}

export interface FmeaRiskProseLayer {
  /** keyed by risk_id */
  by_risk_id: Record<string, FmeaRiskProse>
  generated_at: string
  model_used: string
  risk_count: number
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior systems safety engineer drafting the "Risk Register" section of a hardware engineering report for a hardware investor or technical co-founder audience. For a single FMEA risk row, write FOUR prose blocks. Output ONLY a single JSON object — no preamble, no markdown fences, no commentary. First character must be opening brace.

Required JSON shape:
{
  "hazard": "<one paragraph>",
  "root_cause": "<one paragraph>",
  "mitigation": "<one paragraph>",
  "detection": "<one paragraph>"
}

Style rules:
1. Each block is ONE paragraph, 3–6 sentences.
2. SPECIFIC: cite the actual sub-modules, components, and interfaces that are at risk. Reference the severity (S), occurrence (O), and detection (D) scores and their meaning in context. Do NOT invent specific quantities not present in the input — use ranges or qualitative descriptions when uncertain.
3. Hazard block: WHAT could go wrong (the failure mode and its end state), WHEN it is most likely to occur (operating phase, load condition), and WHY it matters (consequence to safety, reliability, or revenue). Include context from the severity score.
4. Root Cause block: the engineering mechanism — physics of failure, component limitation, interface weakness, or software/firmware path that allows the hazard to occur. Reference the occurrence score to frame probability.
5. Mitigation block: specific design decisions, engineering controls, redundancy measures, or operating procedures that reduce probability or consequence. Name the sub-module or feature that carries each control.
6. Detection block: the specific sensor, monitor, diagnostic, or procedural check that reveals the failure before or after it occurs. Reference the detection score to frame detectability. Include the response sequence (alarm, shutdown, isolation) where known.
7. Tone: engineering safety report, factual, direct. No marketing language. Investigator's report style.
8. British spelling: "authorised", "recognised", "behaviour", "characterise", "organisation", "colour".
9. DO NOT begin the response with any preamble. JSON only. First character: {
10. CRITICAL: match the STRUCTURE of the few-shot example below, NOT its domain vocabulary. The example is a BESS thermal-runaway hazard; you may receive a CGM adhesive-detachment hazard, a drone propeller-overspeed hazard, an AUV ballast-failure hazard. Do NOT import BESS metaphors ("thermal runaway", "NOVEC", "cells") into a non-battery product. Use the vocabulary from the INPUT risk's product class + sub-modules. The example shows you the SHAPE (hazard description → root cause physics → mitigation controls → detection sequence); fill that shape with the input's actual content.`

// ─── Few-shot example (BESS thermal-runaway risk) ─────────────────────────────

const FEW_SHOT_EXAMPLE_INPUT = {
  id: 'R-001',
  hazard: 'Thermal runaway propagation from single cell to module',
  cause: 'Internal short circuit from separator failure or lithium plating',
  consequence: 'Module-level fire, container venting, personnel hazard',
  severity: 9,
  likelihood: 3,
  detection: 4,
  mitigation: 'BMS per-cell monitoring, liquid cooling, fused busbars',
  owner: 'Battery Systems Engineer',
}

const FEW_SHOT_EXAMPLE_OUTPUT = JSON.stringify({
  hazard: "Single-cell thermal runaway escalating to module-level fire. Risk window: any operating phase, with elevated probability during fast-charge above 0.5 C or after mechanical impact. Severity: total cell-stack loss, container venting, potential personnel hazard within 3 m exclusion zone. With a severity score of 9/10, this is the highest-consequence failure mode in the risk register and drives the bulk of the safety case design effort.",
  root_cause: "Internal short circuit caused by separator failure, lithium plating from cold-temperature charging, or manufacturing defect (microscopic metallic contamination). LFP chemistry resists thermal runaway propagation better than NMC, but a single defective cell can still trigger venting if internal pressure exceeds the relief threshold. The occurrence score of 3/10 reflects that cell-level defects are statistically rare in screened production cells but cannot be fully eliminated by incoming quality inspection alone.",
  mitigation: "112 BMS slave PCBs monitor per-cell voltage and temperature at ±5 mV / ±0.5°C; over-voltage and over-temperature trip thresholds set 5% inside the cell-vendor's safety envelope. Liquid cooling holds module temperature within the 15–35°C operating band, removing the thermal precondition for runaway. Cell-to-cell busbar fusing isolates a single failing cell from the string, preventing cascade energy delivery to adjacent cells.",
  detection: "First indication: rising NTC thermistor reading on the failing cell's module, reported by the slave PCB to the BMS master over CAN at 100 ms cadence. BMS master commands main contactor open within 200 ms of trip threshold crossing — a detection score of 4/10 reflects that once venting begins, the detection window is short. Aspirating smoke detection and chemical sensors (CO, H₂, and HF) trigger NOVEC suppression within 30 s if cell venting occurs; a dedicated emergency-stop button at the container door provides manual override for first responders.",
})

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate LLM-augmented prose for each FMEA risk row.
 * Risks are sorted by severity × likelihood descending; top 20 processed.
 * Throws on complete failure (no risks). Individual risk failures are
 * caught and replaced with fallback prose so the layer always returns a result.
 */
export async function generateFmeaRiskProseLayer(
  fmea: RiskRow[],
  productClass: string,
): Promise<FmeaRiskProseLayer> {
  if (!fmea || fmea.length === 0) {
    throw new Error('generateFmeaRiskProseLayer: no FMEA risks provided')
  }

  // Sort by severity × likelihood descending; cap at top 10.
  // Council 2026-05-12 fix: 20 was the upper bound; 10 is more cost-sensible
  // for typical FMEA tables (the top 10 risks already cover ≥80% of total
  // severity-weighted impact per Pareto). Cuts BESS LLM cost from £0.50 to
  // £0.25 per pipeline run. If a brief genuinely needs more risks rendered,
  // raise this cap.
  const sorted = [...fmea]
    .sort((a, b) => (b.severity * b.likelihood) - (a.severity * a.likelihood))
    .slice(0, 10)

  // Council 2026-05-12 (matching 1H fix): bound concurrency to 3 to avoid
  // OpenRouter rate-limit (429) cascades when N >= 5. Top-20 risks × parallel
  // would hit Grok rate limits hard. Wall-clock impact: 20 risks at 3
  // concurrent ≈ 7 batches × 5s ≈ 35s, vs naïve all-parallel ≈ 5s with
  // rate-limit risk. Each call still has its own 30s Promise.race timeout.
  const MAX_CONCURRENT = 3
  const results: FmeaRiskProse[] = []
  for (let batchStart = 0; batchStart < sorted.length; batchStart += MAX_CONCURRENT) {
    const batch = sorted.slice(batchStart, batchStart + MAX_CONCURRENT)
    const batchResults = await Promise.all(
      batch.map(async (risk): Promise<FmeaRiskProse> => {
      const userContent = [
        '=== FEW-SHOT EXAMPLE ===',
        `PRODUCT CLASS: battery_energy_storage`,
        `INPUT RISK: ${JSON.stringify(FEW_SHOT_EXAMPLE_INPUT, null, 2)}`,
        'OUTPUT:',
        FEW_SHOT_EXAMPLE_OUTPUT,
        '',
        '=== YOUR TASK ===',
        `PRODUCT CLASS: ${productClass}`,
        `INPUT RISK: ${JSON.stringify(risk, null, 2)}`,
        '',
        'OUTPUT YOUR JSON OBJECT (four prose blocks, safety engineering tone, British spelling, specific sub-modules and controls named):',
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
              // Council 2026-05-12 (matching 1H): 1024 tight for 4 prose blocks
              // on complex risks (especially thermal-runaway propagation).
              // Raised to 1536 to avoid length-truncation that finish_reason
              // surfaces.
              max_tokens: 1536,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userContent },
              ],
            }),
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('FMEA risk prose LLM call timed out after 30s')), 30_000),
          ),
        ])

        if (!response.ok) {
          throw new Error(`OpenRouter status ${response.status} for risk ${risk.id}`)
        }

        const json = await response.json() as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
        }
        const finishReason = json.choices?.[0]?.finish_reason
        if (finishReason && finishReason !== 'stop') {
          console.warn(
            `[fmea-risk-llm] ${risk.id}: finish_reason=${finishReason} — output may be truncated`,
          )
        }

        const raw = json.choices?.[0]?.message?.content?.trim() ?? ''

        // Tolerate code fences and preamble — same pattern as Pieces 1F, 1G, 1H.
        let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        const firstBrace = cleaned.indexOf('{')
        const lastBrace = cleaned.lastIndexOf('}')
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          cleaned = cleaned.slice(firstBrace, lastBrace + 1)
        }

        const parsed = JSON.parse(cleaned) as Partial<FmeaRiskProse>

        if (
          !parsed.hazard ||
          !parsed.root_cause ||
          !parsed.mitigation ||
          !parsed.detection
        ) {
          throw new Error(
            `FMEA risk prose response missing required fields for ${risk.id}: got [${Object.keys(parsed).join(', ')}]`,
          )
        }

        return {
          risk_id: risk.id,
          hazard: parsed.hazard,
          root_cause: parsed.root_cause,
          mitigation: parsed.mitigation,
          detection: parsed.detection,
        }
      } catch (err) {
        // Individual risk failure: return fallback prose from raw fields so the
        // layer always has an entry. The renderer will show this text.
        const message = (err as Error).message
        console.warn(`[fmea-risk-llm] Failed to generate prose for risk ${risk.id}: ${message}`)
        return {
          risk_id: risk.id,
          hazard: risk.hazard || '—',
          root_cause: risk.cause || '—',
          mitigation: risk.mitigation || '—',
          detection: risk.detection !== undefined ? `Detection score: ${risk.detection}/10` : '—',
        }
      }
    }),
    )
    results.push(...batchResults)
  }

  const by_risk_id: Record<string, FmeaRiskProse> = {}
  for (const prose of results) {
    by_risk_id[prose.risk_id] = prose
  }

  return {
    by_risk_id,
    generated_at: new Date().toISOString(),
    model_used: 'x-ai/grok-4.3',
    risk_count: results.length,
  }
}
