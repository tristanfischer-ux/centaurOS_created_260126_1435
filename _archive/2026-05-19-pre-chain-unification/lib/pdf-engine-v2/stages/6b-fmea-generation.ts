/**
 * Stage 6b: FMEA Generation
 *
 * Generates a top-level FMEA (Failure Mode and Effects Analysis) table for the
 * product. On the PA path, module decomposition produces `failure_modes` (PA
 * schema) rather than `riskMatrix` entries, so the FMEA section would otherwise
 * be empty. This stage calls an LLM with domain-specific FMEA knowledge and the
 * full module list to produce 8-12 FMEA rows with proper S/O/D/RPN columns.
 *
 * Output is stored as `(state as any).fmea` — the renderer at stage 7-pdf-v3.tsx
 * line 1549 already reads this field first before falling back to module riskMatrix.
 */

import type { Module, RiskRow, StageResult } from '../types'
import { sanitiseLlmOutput } from '../sanitiser'
import { STAGE_TEMPERATURES } from '../llm-temperature-config'
import { getActionLogger } from '../lib/action-logger'

// ─── FMEA prompt ──────────────────────────────────────────────────────────────

const FMEA_SYSTEM_PROMPT = `You are a senior functional-safety engineer with IEC 62619, UL 9540A, and NFPA 855 expertise. Your task is to produce a comprehensive FMEA (Failure Mode and Effects Analysis) table for the product described in the user message.

Output ONLY valid JSON. No preamble, no markdown fences, no commentary.

Required output schema:
{
  "fmea": [
    {
      "id": string,             // e.g. "FMEA-001"
      "moduleId": string,       // matches a module id in the list (or "system" for cross-module)
      "moduleName": string,     // human-readable module name
      "hazard": string,         // the specific failure mode / hazardous event (1 sentence)
      "cause": string,          // concrete root-cause chain
      "consequence": string,    // system-level effect in engineering terms
      "severity": number,       // S: 1-10 (10 = loss of life / total asset loss)
      "likelihood": number,     // O (Occurrence): 1-10 (10 = certain within design life)
      "detection": number,      // D: 1-10 (10 = certain to escape detection before harm)
      "mitigation": string,     // specific engineering mitigation — component/test/procedure
      "verificationTest": string, // specific test confirming mitigation works (standard clause / lab procedure)
      "owner": string,          // named engineering role
      "residualSeverity": number,   // S after mitigation (optional estimate)
      "residualLikelihood": number, // O after mitigation (optional estimate)
      "residualDetection": number   // D after mitigation (optional estimate)
    }
  ]
}

RATING SCALES:
- Severity 1-10: 10=loss of life or total asset loss; 7-9=serious injury/major damage; 4-6=repairable damage; 1-3=minor
- Occurrence 1-10: 10=certain within design life; 7-9=probable; 4-6=occasional; 1-3=remote
- Detection 1-10: 10=certain to escape detection; 7-9=difficult to catch; 4-6=catchable with effort; 1-3=clear alarm <1 s

RPN = S × O × D. Produce 8-12 rows covering:
- Safety-critical modes (thermal runaway, arc fault, fire suppression failure, explosion vent blockage)
- Availability modes (BMS comms loss, HVAC failure, contactor weld, grid fault ride-through)
- Environmental/IP modes (condensation ingress, seal failure)
- Any product-specific high-RPN modes from the module list

For BESS products: MANDATORY rows include thermal runaway propagation, DC arc fault (1500 V bus), BMS comms loss, HVAC/cooling failure, vent blockage, cell overvoltage. Reference real standards: IEC 62619:2022, UL 9540A, NFPA 855, G99/EREC.

Mitigation must name a SPECIFIC component, control, or design feature — not a generic phrase like "improve monitoring".
VerificationTest must name a SPECIFIC test method or standard clause — not a generic phrase like "testing".

Return ONLY the JSON object.`

// ─── LLM call helper ──────────────────────────────────────────────────────────

async function callFmeaLlm(systemPrompt: string, userContent: string): Promise<any> {
  const models = [
    'google/gemini-3.1-pro-preview',
    'x-ai/grok-4.3',
    'xiaomi/mimo-v2.5-pro',
  ]

  for (const model of models) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 180_000)
    const t0 = Date.now()

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: STAGE_TEMPERATURES.regulatory ?? 0.2,
          // WS-D 2026-05-13: 150k (was 8192) — Tristan approved; truncation more expensive than unused tokens.
          max_tokens: 150_000,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        getActionLogger().logLlm({ step_name: 'fmea_generation', model, latency_ms: Date.now() - t0, ok: false, error: `OpenRouter ${response.status}` })
        throw new Error(`OpenRouter API returned status: ${response.status}`)
      }

      const json = await response.json()
      getActionLogger().logLlm({
        step_name: 'fmea_generation',
        model,
        prompt_tokens: json?.usage?.prompt_tokens,
        completion_tokens: json?.usage?.completion_tokens,
        latency_ms: Date.now() - t0,
        finish_reason: json?.choices?.[0]?.finish_reason,
        ok: true,
      })
      const msg = json.choices?.[0]?.message
      let raw = msg?.content || msg?.reasoning || ''
      if (!raw && msg?.reasoning_details?.length) {
        raw = msg.reasoning_details
          .filter((d: any) => d.type === 'reasoning.text')
          .map((d: any) => d.text)
          .join('\n')
      }

      if (!raw) throw new Error('No content in OpenRouter response')

      console.log(`[fmea-generation] ${model} responded: ${raw.length} chars`)

      // Strip markdown fences and thinking blocks
      let jsonStr = raw
      jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      jsonStr = jsonStr.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '').trim()
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

      // Try parse whole string first
      try {
        return JSON.parse(jsonStr)
      } catch { /* fall through */ }

      // First brace to last brace
      const firstBrace = jsonStr.indexOf('{')
      const lastBrace = jsonStr.lastIndexOf('}')
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1))
        } catch { /* fall through */ }
      }

      throw new Error('Failed to parse JSON response from FMEA LLM')
    } catch (error) {
      clearTimeout(timeout)
      console.warn(
        `[fmea-generation] ${model} failed: ${(error as Error).message}. Trying next model...`
      )
      continue
    }
  }

  throw new Error('All models failed for FMEA generation')
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateFmeaRow(row: any, idx: number): RiskRow & {
  moduleId?: string
  moduleName?: string
  consequence?: string
  verificationTest?: string
  owner?: string
  residualSeverity?: number
  residualLikelihood?: number
  residualDetection?: number
} {
  if (!row || typeof row !== 'object') {
    throw new Error(`FMEA row ${idx} is not an object`)
  }
  if (!row.id || !row.hazard || !row.cause || !row.consequence) {
    throw new Error(`FMEA row ${idx} missing required fields (id, hazard, cause, consequence)`)
  }
  const sev = Number(row.severity)
  const occ = Number(row.likelihood)
  const det = Number(row.detection)
  if (isNaN(sev) || sev < 1 || sev > 10) throw new Error(`FMEA row ${idx} invalid severity: ${row.severity}`)
  if (isNaN(occ) || occ < 1 || occ > 10) throw new Error(`FMEA row ${idx} invalid likelihood: ${row.likelihood}`)
  if (isNaN(det) || det < 1 || det > 10) throw new Error(`FMEA row ${idx} invalid detection: ${row.detection}`)

  return {
    id: String(row.id),
    hazard: sanitiseLlmOutput(String(row.hazard)),
    cause: sanitiseLlmOutput(String(row.cause)),
    consequence: sanitiseLlmOutput(String(row.consequence)),
    severity: sev,
    likelihood: occ,
    detection: det,
    mitigation: row.mitigation ? sanitiseLlmOutput(String(row.mitigation)) : undefined,
    verificationTest: row.verificationTest ? sanitiseLlmOutput(String(row.verificationTest)) : undefined,
    owner: row.owner ? sanitiseLlmOutput(String(row.owner)) : undefined,
    moduleId: row.moduleId ? String(row.moduleId) : undefined,
    moduleName: row.moduleName ? sanitiseLlmOutput(String(row.moduleName)) : undefined,
    residualSeverity: row.residualSeverity ? Number(row.residualSeverity) : undefined,
    residualLikelihood: row.residualLikelihood ? Number(row.residualLikelihood) : undefined,
    residualDetection: row.residualDetection ? Number(row.residualDetection) : undefined,
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export type FmeaRow = RiskRow & {
  moduleId?: string
  moduleName?: string
  consequence?: string
  verificationTest?: string
  owner?: string
  residualSeverity?: number
  residualLikelihood?: number
  residualDetection?: number
}

export async function runFmeaGeneration(
  modules: Module[],
  briefText: string,
  productClass?: string,
): Promise<StageResult<FmeaRow[]>> {
  const start = Date.now()
  console.log('[fmea-generation] Starting FMEA generation...')

  // Build a compact module summary so the LLM has engineering context
  const moduleSummary = modules
    .map(m => {
      const fmPa = (m as any).failure_modes as Array<{ mode: string; cause: string; system_effect?: string }> | undefined
      const fmLegacy = m.failureModes
      const failureModeStr = fmPa?.length
        ? fmPa.map(f => `${f.mode}: ${f.cause}`).join('; ')
        : fmLegacy?.join('; ') || 'no failure modes listed'
      return `Module "${m.name}" (id: ${m.id}): ${m.purpose}. Failure modes: ${failureModeStr}`
    })
    .join('\n')

  const userContent = `Product brief:\n${briefText.slice(0, 3000)}\n\nProduct class: ${productClass || 'unknown'}\n\nModules (${modules.length} total):\n${moduleSummary}`

  try {
    const parsed = await callFmeaLlm(FMEA_SYSTEM_PROMPT, userContent)

    if (!parsed || !Array.isArray(parsed.fmea) || parsed.fmea.length < 4) {
      throw new Error(
        `FMEA response has ${parsed?.fmea?.length ?? 0} rows — need at least 4`
      )
    }

    const rows: FmeaRow[] = []
    const errors: string[] = []

    for (let i = 0; i < parsed.fmea.length; i++) {
      try {
        rows.push(validateFmeaRow(parsed.fmea[i], i))
      } catch (err) {
        errors.push((err as Error).message)
      }
    }

    if (rows.length < 4) {
      throw new Error(`Only ${rows.length} valid FMEA rows after validation (errors: ${errors.join('; ')})`)
    }

    if (errors.length > 0) {
      console.warn(`[fmea-generation] ${errors.length} rows failed validation and were dropped: ${errors.join('; ')}`)
    }

    console.log(`[fmea-generation] Generated ${rows.length} FMEA rows.`)
    return {
      ok: true,
      data: rows,
      durationMs: Date.now() - start,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error during FMEA generation'
    console.error('[fmea-generation] Failed:', msg)
    return {
      ok: false,
      error: msg,
      durationMs: Date.now() - start,
    }
  }
}
