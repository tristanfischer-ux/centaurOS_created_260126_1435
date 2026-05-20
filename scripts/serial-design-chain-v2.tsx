#!/usr/bin/env npx tsx
/**
 * scripts/serial-design-chain-v2.tsx
 *
 * Tristan 2026-05-14: universal engineering report generator.
 *
 * Phase 1 (Design — 5 LLM passes, identical 3-concern reviewer template):
 *   Generator (Gemini 3.1 Pro) → R1 (Grok 4.3) → R2 (GLM-5.1)
 *   → R3 (Haiku 4.5) → R4 (Flash-Lite grounded)
 *
 * Phase 2 (Translate + universal gates + Flash-Lite repair, max 3 iter):
 *   translate → arithmetic gates → grammar gates → repair loop → render
 *
 * Action log: actions.jsonl per step with delta metrics.
 *
 * Usage:
 *   npx tsx scripts/serial-design-chain-v2.tsx <brief.md> <out-dir>
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'
import { execFileSync } from 'child_process'

for (const envPath of [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/distributor-apis.env'),
  resolve(homedir(), '.claude/secrets/tavily.env'),
]) {
  try {
    const c = readFileSync(envPath, 'utf-8')
    for (const line of c.split('\n')) {
      const t = line.trim()
      if (t && !t.startsWith('#') && t.includes('=')) {
        const [k, ...rest] = t.split('=')
        const v = rest.join('=').replace(/^["']|["']$/g, '')
        if (!process.env[k]) process.env[k] = v
      }
    }
  } catch {}
}

import { runBriefParsing } from '../src/lib/pdf-engine-v2/stages/0-brief-generation'
import { runResearchSynthesis } from '../src/lib/pdf-engine-v2/stages/1-research'
import { classifyProduct } from '../src/lib/pdf-engine-v2/product-classifier'
import { MODULE_DECOMPOSITION_TAXONOMY_PROMPT } from '../src/lib/pdf-engine-v2/prompts'
import { buildNaturalLanguageLayer, ensureSubmoduleProseCoversWords } from '../src/lib/pdf-engine-v2/radical/sentence-generator'
import { translate } from '../src/lib/pdf-engine-v2/radical/universal-translator'
import { runArithmeticGates } from '../src/lib/pdf-engine-v2/radical/universal-arithmetic-gates'
import { runGrammarGates } from '../src/lib/pdf-engine-v2/radical/universal-grammar-gates'
import { repair, applyPatches, dedupAllModifiers } from '../src/lib/pdf-engine-v2/radical/universal-repair'
import { parseJsonFromLlm } from '../src/lib/pdf-engine-v2/lib/llm-json'
import type { KeyMetrics, BriefRevisionEntry } from '../src/lib/pdf-engine-v2/types/module-decomposition'
import { formatFloorsForPrompt, getClassFloors } from '../src/lib/pdf-engine-v2/class-floors'
import { defaultEnvelopeForClass, suggestEnvelope } from '../src/lib/pdf-engine-v2/deployment-envelopes'
import {
  ensureGraphsRegistered,
  getClassReferenceGraph,
  validateConnectionsAgainstGraph,
} from '../src/lib/pdf-engine-v2/class-reference-graph'
import { runPhysicsLedger } from '../src/lib/pdf-engine-v2/stages/0.1-physics-ledger'
import { runComplianceGate, type ComplianceGateResult } from '../src/lib/pdf-engine-v2/stages/3.5-compliance-gate'
import { runBriefTargetReconciliation, type ReconciliationResult } from '../src/lib/pdf-engine-v2/stages/1.8-brief-target-reconciliation'
import { deriveHeadlineFromModules } from '../src/lib/pdf-engine-v2/headline-deriver'
import { resolveDesignDecisions, type DesignDecision } from '../src/lib/pdf-engine-v2/radical/design-decisions'
import { verifyAllParts, stripUnverifiedParts, recommendReplacementsForStripped, buildTechnicalSummary, type PartVerification, type PartRecommendation } from '../src/lib/pdf-engine-v2/radical/part-verification'
import { runPhysicsCritic, type CritiqueReport } from '../src/lib/pdf-engine-v2/radical/physics-critic'
// Phase C pipeline integration REVERTED 2026-05-15 per coding council (5/5
// REVERT). Registry pre-seed of reviewer prompts caused score regression and
// risked registry pollution by ingesting LLM-coined aliases as canonical
// entries. The character-registry query helper stays available for the future
// offline harvester (scripts/harvest-registry-candidates.tsx) — re-enable
// pipeline integration only after the registry has 200-300 canonical entries
// via human-gated admission. See memory: forgeos_decisions for the verdict.

// ─── Models ─────────────────────────────────────────────────────────────────
const GEMINI_3_1_PRO = 'google/gemini-3.1-pro-preview'
const FLASH_LITE = 'google/gemini-3.1-flash-lite'
// 2026-05-19 v5.2: Gemini 3.5 Flash — reasoning-first model used for stages
// where engineering judgment matters and the prompt is short (≤3K). Sweet
// spot per ab-tests/README.md: structured JSON output + judgment-heavy.
// max_tokens MUST be ≥6000 to break through reasoning tokens. Currently
// wired into: brief plausibility critic + brief rewriter (this file) and
// physics critic (src/lib/pdf-engine-v2/radical/physics-critic.ts:46).
const FLASH_3_5 = 'google/gemini-3.5-flash'
const GROK_4_3 = 'x-ai/grok-4.3'
const GLM_5_1 = 'z-ai/glm-5.1'
const HAIKU_4_5 = 'anthropic/claude-haiku-4.5'
// R3 model — swapped from Haiku 4.5 to Qwen 3.6 Max (2026-05-15). Haiku's
// 200K TOTAL-context cap was the squeeze: by the time R1+R2 had enriched the
// design, input was ~70-80K tokens, leaving < 130K for output. Qwen 3.6 Max
// has a 1M context window, ~6× cheaper per token than Sonnet 4.6, and sits
// in a different vendor family from R1 (Grok) / R2 (GLM) / R4 (Flash-Lite)
// preserving review diversity.
// (iter-57 BESS-qwen FATAL'd on initial `qwen/qwen-3.6-plus` — invalid model
// ID. Correct OpenRouter slug confirmed against brainstorming-council usage.)
const QWEN_3_6_MAX = 'qwen/qwen3.6-max-preview'

// Per-model max_tokens caps. iter-17 discovered GLM truncates above ~64 K
// output even when we request 150 K — provider-side cap. Cap GLM lower so
// repair fallback isn't required.
const MAX_TOKENS_BY_MODEL: Record<string, number> = {
  [GEMINI_3_1_PRO]:  80_000,   // iter-24: Gemini Pro truncated mid-string at 205KB (~50K tok). Cap output budget to keep it tighter.
  [FLASH_LITE]:      65_000,   // iter-18 R4 truncated at 30K; design after R3 needs ~60K output
  [GROK_4_3]:       150_000,
  [GLM_5_1]:         60_000,   // iter-17 GLM truncated >64K (provider-side cap)
  [HAIKU_4_5]:       80_000,   // iter-38 HP hit 200K total-context cap (53K input + 150K requested out = 203K). With ~70K input after R1+R2 enrichment, 80K out keeps total ≤ 150K (well under cap).
  [QWEN_3_6_MAX]:   32_000,   // Qwen 3.6 Max output cap is ~32K; that's plenty for an R3 reviewer (which emits a delta, not a full design). 1M context window absorbs upstream R1+R2 enrichment without the Haiku total-context squeeze.
}

// ─── Action log ─────────────────────────────────────────────────────────────
//
// Refactored 2026-05-18: backed by the shared `lib/action-logger.ts` module
// so `runPipeline()`-path + chain-v2-path emit a uniform schema. Preserves
// the inline `logAction()` API used by 30 call-sites below — those are
// untouched. New records gain action_type + finish_reason + cost_usd +
// before_hash + after_hash via the helper's classification (best-effort).
import {
  attachActionLogger,
  getActionLogger,
  type ActionType,
} from '../src/lib/pdf-engine-v2/lib/action-logger'

function logAction(record: Record<string, any>): void {
  const logger = getActionLogger()
  if (!logger.isAttached()) return
  // Schema enrichment (audit Gap #5): classify each record into a
  // CLAUDE.md action_type. We do NOT change the inline call-site signatures
  // — we just sniff fields to derive the type. Records that look like LLM
  // calls (have `model`) route through `logLlm()` so cost_usd is computed.
  const step = String(record.step ?? 'unknown')
  if (record.model && (record.tokens_in !== undefined || record.tokens_out !== undefined || record.latency_ms !== undefined)) {
    logger.logLlm({
      step_name: step,
      model: String(record.model),
      tokens_in: record.tokens_in,
      tokens_out: record.tokens_out,
      latency_ms: record.latency_ms,
      finish_reason: record.finish_reason,
      ok: record.ok,
      error: record.error,
      ...Object.fromEntries(Object.entries(record).filter(([k]) =>
        !['step', 'model', 'tokens_in', 'tokens_out', 'latency_ms', 'finish_reason', 'ok', 'error'].includes(k))),
    })
    return
  }
  // Gate-like records: phase2_iter_N rows carry arithmetic/grammar verdicts.
  if (/^phase2_iter_/.test(step) && (record.arithmetic || record.grammar)) {
    logger.logGate({
      step_name: step,
      gate_name: 'phase2_arithmetic_grammar',
      verdict: (record.arithmetic?.failed === 0 && record.grammar?.failed === 0) ? 'PASS' : 'FAIL',
      score: ((record.arithmetic?.total_score ?? 0) + (record.grammar?.total_score ?? 0)) || undefined,
      reasons: [],
      ...Object.fromEntries(Object.entries(record).filter(([k]) => k !== 'step')),
    })
    return
  }
  // Repair-like records: phase2_repair_N rows.
  if (/^phase2_repair_/.test(step)) {
    logger.logRepair({
      step_name: step,
      target_field: 'design.modules',
      key_changes: `applied=${record.applied ?? 0}, skipped=${record.skipped ?? 0}` + (record.unfixable ? `, unfixable: ${record.reason}` : ''),
      ...Object.fromEntries(Object.entries(record).filter(([k]) => k !== 'step')),
    })
    return
  }
  // Generic init / boundary / note record — log via the low-level API so
  // free-form fields ride through unchanged.
  let actionType: ActionType = 'note'
  if (step === 'init') actionType = 'init'
  else if (step === 'fatal' || step === 'render' || step === 'save_state') actionType = 'stage_end'
  logger.log({ step_name: step, action_type: actionType, ...record })
}

function summarise(modules: any[]): { modules: number; sub_modules: number; words: number; dp_keys: number; grammar_links: number; cross_links_unused?: number; overview_chars: number } {
  let sm = 0, w = 0, dp = 0, gl = 0, oc = 0
  for (const m of modules) {
    sm += m.sub_modules?.length ?? 0
    w += (m.sub_modules ?? []).reduce((a: number, s: any) => a + (s.words?.length ?? 0), 0)
    dp += Object.keys(m.derived_parameters ?? {}).length
    gl += m.grammar_links?.length ?? 0
    oc += (m.overview_paragraph_en ?? '').length
  }
  return { modules: modules.length, sub_modules: sm, words: w, dp_keys: dp, grammar_links: gl, overview_chars: oc }
}

function delta(before: any, after: any): Record<string, number> {
  return {
    d_modules: after.modules - before.modules,
    d_sub_modules: after.sub_modules - before.sub_modules,
    d_words: after.words - before.words,
    d_dp_keys: after.dp_keys - before.dp_keys,
    d_grammar_links: after.grammar_links - before.grammar_links,
    d_overview_chars: after.overview_chars - before.overview_chars,
  }
}

// ─── LLM helper ─────────────────────────────────────────────────────────────
async function callLlm(opts: {
  model: string
  system: string
  user: string
  maxTokens?: number
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'
  groundWithGoogleSearch?: boolean
  timeoutMs?: number
}): Promise<{ text: string; latency_ms: number; tokens_in?: number; tokens_out?: number }> {
  // Retry policy (Tristan 2026-05-15, council-driven):
  //   • TRANSIENT (3 retries with 5s / 15s / 45s exponential backoff):
  //     - 5xx from OpenRouter
  //     - empty response body (200 OK with no choices/content)
  //     - undici socket/stream errors (UND_ERR_*, "terminated", "other side closed",
  //       ECONNRESET, ETIMEDOUT, fetch failed)
  //     - response.json() parse failures (truncated body mid-stream)
  //   • STRUCTURAL (never retry — surface immediately with diagnostic):
  //     - 4xx (bad request, model not found — same params will fail again)
  //     - finish_reason='length' (truncated output; retry with same max_tokens
  //       reproduces; needs prompt redesign or max_tokens increase)
  //   • Council unanimous on length: retrying same params wastes money + produces
  //     same truncation. Fail loudly with clear diagnostic instead.
  const maxAttempts = 3
  const backoffMs = [5_000, 15_000, 45_000]  // applied AFTER attempts 1, 2 (no backoff after attempt 3 = fatal)
  let lastErr: unknown
  const t0 = Date.now()
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 1_500_000)
    const body: any = {
      model: opts.model,
      messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }],
      temperature: 0,
      max_tokens: opts.maxTokens ?? 150_000,
    }
    if (opts.model === FLASH_LITE) {
      if (opts.thinkingLevel) body.thinking_level = opts.thinkingLevel
      // NOTE 2026-05-16: `google_search_grounding` is silently ignored by
      // OpenRouter for Gemini Flash-Lite — verified by date-probe test
      // (model returned its training-cutoff date "May 21 2024" when asked
      // for today's date). The flag was a lie. Kept this option as a no-op
      // for backwards compat with existing callers; real grounding requires
      // calling Gemini via Google's native API. For now this is a stub.
      // if (opts.groundWithGoogleSearch) body.google_search_grounding = { enabled: true }
    }
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (response.status >= 500) {
        lastErr = new Error(`OpenRouter ${response.status} from ${opts.model}`)
        if (attempt < maxAttempts) {
          console.error(`[callLlm] attempt ${attempt}/${maxAttempts} got ${response.status}; retrying in ${backoffMs[attempt - 1] / 1000}s...`)
          await new Promise(r => setTimeout(r, backoffMs[attempt - 1]))
          continue
        }
        throw lastErr
      }
      if (!response.ok) {
        // 4xx — structural, do not retry. Bad model ID, malformed request, auth.
        throw new Error(`OpenRouter ${response.status} from ${opts.model}: ${await response.text().catch(() => '?').then(t => t.slice(0, 500))}`)
      }
      // Parse response body. response.json() can throw on truncated streams
      // (TypeError: terminated / Unexpected end of JSON input) — treat as transient.
      let json: any
      try {
        json = await response.json()
      } catch (parseErr) {
        if (attempt < maxAttempts) {
          console.error(`[callLlm] attempt ${attempt}/${maxAttempts} body parse failed (${String(parseErr).slice(0, 100)}); retrying in ${backoffMs[attempt - 1] / 1000}s...`)
          await new Promise(r => setTimeout(r, backoffMs[attempt - 1]))
          continue
        }
        throw parseErr
      }
      const choice = json.choices?.[0]
      const finishReason = choice?.finish_reason
      const text = (choice?.message?.content ?? '').trim()
      // STRUCTURAL: finish_reason='length' means the model hit its output cap.
      // Retrying with the same params reproduces it. Surface immediately.
      if (finishReason === 'length' && text.length > 0) {
        throw new Error(`[callLlm] STRUCTURAL: ${opts.model} returned finish_reason='length' (output truncated at max_tokens=${body.max_tokens}). Prompt needs tightening or max_tokens needs raising; retrying same call will reproduce the truncation.`)
      }
      // TRANSIENT: empty content from provider (200 OK with no body)
      if (text.length === 0 && attempt < maxAttempts) {
        console.error(`[callLlm] attempt ${attempt}/${maxAttempts} empty response from ${opts.model}; retrying in ${backoffMs[attempt - 1] / 1000}s...`)
        await new Promise(r => setTimeout(r, backoffMs[attempt - 1]))
        continue
      }
      return {
        text,
        latency_ms: Date.now() - t0,
        tokens_in: json.usage?.prompt_tokens,
        tokens_out: json.usage?.completion_tokens,
      }
    } catch (err) {
      clearTimeout(timeout)
      lastErr = err
      const msg = String(err)
      // Don't retry STRUCTURAL errors (4xx, length-truncation) — same params reproduce.
      const isStructural = /STRUCTURAL|OpenRouter 4[0-9][0-9]/i.test(msg)
      if (isStructural) throw err
      // TRANSIENT: undici socket/stream errors, fetch failed, ECONNRESET, ETIMEDOUT,
      // TypeError: terminated (mid-stream abort). All recoverable with retry+backoff.
      const isTransient = /socket|other side closed|fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR|TypeError:\s*terminated|terminated/i.test(msg)
      if (!isTransient || attempt === maxAttempts) throw err
      console.error(`[callLlm] attempt ${attempt}/${maxAttempts} transient (${msg.slice(0, 100)}); retrying in ${backoffMs[attempt - 1] / 1000}s...`)
      await new Promise(r => setTimeout(r, backoffMs[attempt - 1]))
    }
  }
  throw lastErr
}

/**
 * Parse via the engine's full parser (handles fenced code, leading prose,
 * trailing commas, truncation, and finally a Flash-Lite repair pass if
 * everything else fails). Always saves raw to disk on entry so we have it
 * for debugging regardless of whether parsing succeeds.
 */
async function parseJson(raw: string, opts: { stage: string; model: string; rawDumpPath?: string }): Promise<any> {
  if (opts.rawDumpPath) {
    try { writeFileSync(opts.rawDumpPath, raw) } catch {}
  }
  return await parseJsonFromLlm(raw, {
    stage: opts.stage,
    model: opts.model,
    enableLlmRepair: true,  // critical for serial chain — late reviewers' big responses are prone to truncation
  })
}

// ─── Reviewer patch applier (op-type semantics) ────────────────────────────
function applyReviewerPatches(design: any, patches: any[]): { applied: number; skipped: number; reasons: string[] } {
  let applied = 0
  let skipped = 0
  const reasons: string[] = []
  if (!Array.isArray(design.modules)) design.modules = []
  if (!Array.isArray(design.cross_module_grammar_links)) design.cross_module_grammar_links = []

  for (const p of patches) {
    try {
      const op = p.op
      if (op === 'add_sub_module') {
        const m = design.modules.find((x: any) => x.module === p.module)
        if (!m) { skipped++; reasons.push(`skip add_sub_module: module "${p.module}" not found`); continue }
        if (!Array.isArray(m.sub_modules)) m.sub_modules = []
        if (m.sub_modules.some((s: any) => s.id === p.sub_module?.id)) {
          skipped++; reasons.push(`skip add_sub_module: ${p.module}.${p.sub_module?.id} already exists`); continue
        }
        m.sub_modules.push(p.sub_module)
        applied++; reasons.push(`+sub_module ${p.module}.${p.sub_module?.id} (${p.reason ?? ''})`)
      } else if (op === 'add_grammar_link') {
        const m = design.modules.find((x: any) => x.module === p.module)
        if (!m) { skipped++; reasons.push(`skip add_grammar_link: module "${p.module}" not found`); continue }
        // Validate endpoints reference real sub-modules
        const subIds = new Set((m.sub_modules ?? []).map((s: any) => s.id))
        if (p.link?.from_sub_module && !subIds.has(p.link.from_sub_module)) {
          skipped++; reasons.push(`skip add_grammar_link: from_sub_module "${p.link.from_sub_module}" not in ${p.module}`); continue
        }
        if (p.link?.to_sub_module && !subIds.has(p.link.to_sub_module)) {
          skipped++; reasons.push(`skip add_grammar_link: to_sub_module "${p.link.to_sub_module}" not in ${p.module}`); continue
        }
        if (!Array.isArray(m.grammar_links)) m.grammar_links = []
        m.grammar_links.push(p.link)
        applied++; reasons.push(`+grammar_link ${p.module}: ${p.link?.from_sub_module}→${p.link?.to_sub_module}/${p.link?.mechanism}`)
      } else if (op === 'add_cross_link') {
        const moduleIds = new Set(design.modules.map((x: any) => x.module))
        if (p.link?.from_module && !moduleIds.has(p.link.from_module)) {
          skipped++; reasons.push(`skip add_cross_link: from_module "${p.link.from_module}" not declared`); continue
        }
        if (p.link?.to_module && !moduleIds.has(p.link.to_module)) {
          skipped++; reasons.push(`skip add_cross_link: to_module "${p.link.to_module}" not declared`); continue
        }
        design.cross_module_grammar_links.push(p.link)
        applied++; reasons.push(`+cross_link: ${p.link?.from_module}→${p.link?.to_module}/${p.link?.mechanism}`)
      } else if (op === 'edit_field') {
        const m = design.modules.find((x: any) => x.module === p.module)
        if (!m) { skipped++; reasons.push(`skip edit_field: module "${p.module}" not found`); continue }
        setByPath(m, p.path, p.new_value)
        applied++; reasons.push(`=${p.module}.${p.path}`)
      } else if (op === 'edit_sub_module_field') {
        const m = design.modules.find((x: any) => x.module === p.module)
        if (!m) { skipped++; reasons.push(`skip: module "${p.module}" not found`); continue }
        const sm = (m.sub_modules ?? []).find((s: any) => s.id === p.sub_module_id)
        if (!sm) { skipped++; reasons.push(`skip: sub-module "${p.module}.${p.sub_module_id}" not found`); continue }
        setByPath(sm, p.path, p.new_value)
        applied++; reasons.push(`=${p.module}.${p.sub_module_id}.${p.path}`)
      } else if (op === 'add_word_to_sub_module') {
        const m = design.modules.find((x: any) => x.module === p.module)
        if (!m) { skipped++; reasons.push(`skip: module "${p.module}" not found`); continue }
        const sm = (m.sub_modules ?? []).find((s: any) => s.id === p.sub_module_id)
        if (!sm) { skipped++; reasons.push(`skip: sub-module "${p.module}.${p.sub_module_id}" not found`); continue }
        if (!Array.isArray(sm.words)) sm.words = []
        const existing = sm.words.find((w: any) => w.id === p.word?.id)
        if (existing) {
          // ENRICHMENT MERGE: if a word with this id already exists, merge richer
          // content (extra modifier_characters, longer name_human) into it rather than skipping.
          // Lets reviewers re-add an existing word with more specs to densify.
          const incoming = p.word
          if (Array.isArray(incoming?.modifier_characters)) {
            existing.modifier_characters = existing.modifier_characters ?? []
            // Append non-duplicate modifiers (kind+value tuple uniqueness)
            for (const inMod of incoming.modifier_characters) {
              const dupe = existing.modifier_characters.some((em: any) => em.kind === inMod.kind && em.value === inMod.value)
              if (!dupe) existing.modifier_characters.push(inMod)
            }
          }
          if (incoming?.name_human && (incoming.name_human.length > (existing.name_human ?? '').length)) {
            existing.name_human = incoming.name_human
          }
          if (incoming?.content_character && existing.content_character) {
            // Merge richer character fields
            for (const k of ['name_human', 'function_radical_secondary', 'material_radical_secondary']) {
              if (incoming.content_character[k] && !existing.content_character[k]) {
                existing.content_character[k] = incoming.content_character[k]
              }
            }
          }
          applied++; reasons.push(`~enriched word ${p.module}.${p.sub_module_id}.${p.word?.id} (+${(incoming.modifier_characters ?? []).length} modifiers)`)
        } else {
          sm.words.push(p.word)
          applied++; reasons.push(`+word ${p.module}.${p.sub_module_id}.${p.word?.id}`)
        }
      } else if (op === 'append_to_overview') {
        const m = design.modules.find((x: any) => x.module === p.module)
        if (!m) { skipped++; reasons.push(`skip append_to_overview: module "${p.module}" not found`); continue }
        m.overview_paragraph_en = ((m.overview_paragraph_en ?? '').trim() + ' ' + (p.text ?? '').trim()).trim()
        applied++; reasons.push(`+overview ${p.module}: +${(p.text ?? '').length} chars`)
      } else {
        skipped++; reasons.push(`skip unknown op="${op}"`)
      }
    } catch (err) {
      skipped++; reasons.push(`skip exception: ${String(err)}`)
    }
  }
  return { applied, skipped, reasons }
}

function setByPath(obj: any, path: string, value: any): void {
  const parts = path.split('.')
  let cursor = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (cursor[parts[i]] === undefined || cursor[parts[i]] === null) cursor[parts[i]] = {}
    cursor = cursor[parts[i]]
  }
  cursor[parts[parts.length - 1]] = value
}

// ─── Prompts ────────────────────────────────────────────────────────────────

function generatorSystem(): string {
  return `${MODULE_DECOMPOSITION_TAXONOMY_PROMPT}

=== FIRST-DRAFT BUDGET (Tristan 2026-05-14, retuned 2026-05-15 after iter-55 BESS truncation) ===

You are the FIRST step in an additive review chain. FOUR downstream reviewers (Grok, GLM, Haiku, Flash-Lite) will EXPAND your output by adding more modifier_characters, more words, more grammar_links. Your job is the SKELETON, not the finished BoM. Your output MUST fit within ~140 KB JSON to leave headroom for the providers' output caps — iter-55 BESS hit 221 KB at this step and truncated mid-stream, breaking the whole chain.

Target dimensions (FIRST-DRAFT — reviewers expand):
  - 4-5 sub-modules per module (NOT 6+; reviewers add if needed)
  - 4-5 WORDS per sub-module (NOT 6+; reviewers fill to the ≥5 procurement floor)
  - 4-7 derived_parameters fields per module
  - 3-5 grammar_links per module (intra) + 5-8 cross_module_grammar_links
  - overview_paragraph_en: 3-4 sentences per module (~700-1,100 chars)

Sub-module specificity is non-negotiable. Every word must be specific enough that a procurement engineer can search Mouser/DigiKey/Farnell or hand it to a contract manufacturer for a quote. Generic "controller / sensor / wire harness" without specs is REJECTED.

=== WORD MODIFIER REQUIREMENTS (the BoM grade gate) ===

Every word's modifier_characters array MUST populate AT LEAST these "kind" categories where they apply:

  quantity               — "×4896" (always required)
  manufacturer           — "CATL" / "Bussmann" / "Murata" / "STMicroelectronics" / "Phoenix Contact"
  part_number            — "CB-280Ah" / "KLM-125" / "STM32F427VGT6" / "ISO1042BDWVR"
  material               — "FR4 4-layer with conformal coating" / "copper C11000" / "polymer PA66 GF30" / "stainless steel 316L"
  rating_primary         — most-load-bearing electrical spec: "280 Ah", "1700 V / 800 A", "125 A 690 V DC", "0.5 % accuracy"
  rating_secondary       — other electrical specs: "100 µH / 100 A continuous", "5 kV galvanic isolation"
  dimensions             — "173 × 72 × 207 mm" / "100 × 60 × 12 mm PCB" / "M12 × 4 mounting"
  mass                   — "5.3 kg" / "0.18 kg per module"
  operating_temp_range   — "−20 to +60 °C" / "−40 to +85 °C industrial"
  regulatory             — "IEC 62619", "UL 9540", "UN 38.3", "RoHS / REACH"
  ip_rating              — "IP65" / "IP55 dust-tight, water-jet"

PERMANENTLY EXCLUDED kinds — DO NOT emit on any word, ever (Tristan directive 2026-05-15):
  • lead_time — fabricator-specific; ALWAYS requires direct conversation with a contract manufacturer. The engine cannot generate trustworthy lead times. Do not invent them.

TEMPORARILY EXCLUDED kinds — DO NOT emit yet (will be re-enabled once BoM + assumptions ledger exist):
  • unit_cost_estimate_gbp / unit_cost / cost / price — financial metrics suppressed until grounded by a BoM table and explicit assumptions.

A word with ONLY quantity is REJECTED — every word is a BoM line and a BoM line with only "×4896" is unsourceable.

Target for FIRST-DRAFT (you): every word has 4-6 populated modifier_characters across the ALLOWED kinds — pick the 4-6 MOST LOAD-BEARING for that part. Reviewers will add remaining ALLOWED kinds (ip_rating, secondary ratings, operating_temp_range). DO NOT try to emit lead_time or cost. DO NOT try to emit all kinds yourself — that's what gets the chain truncated.

Example FIRST-DRAFT word (LFP prismatic cell) — 5 most load-bearing modifiers, no lead_time, no cost:
{
  "id": "lfp_prismatic_cell_word",
  "name_human": "CATL 280 Ah LFP prismatic cell",
  "content_character": { ... },
  "modifier_characters": [
    { "kind": "quantity", "value": "×4896" },
    { "kind": "manufacturer", "value": "CATL" },
    { "kind": "part_number", "value": "CB-280Ah-A-50" },
    { "kind": "rating_primary", "value": "280 Ah at 0.5 C" },
    { "kind": "dimensions", "value": "173 × 72 × 207 mm" }
  ]
}

That's the FIRST-DRAFT detail level — enough for procurement to identify the part. Reviewers will add mass, operating_temp_range, regulatory, ip_rating on subsequent passes. (lead_time and cost are excluded per the rules above.) 3 words per sub-module with 1 modifier each is still unusable for procurement and remains REJECTED.

=== ADDITIONAL FIELD: brief_overview_prose ===

Top-level JSON MUST include "brief_overview_prose" with sub-fields:
  overview_and_context (2-3 paragraphs)
  mission_statement (1 sentence; use brief's cost ceiling, deployment time, target market verbatim)
  target_customers (2 sentences)
  why_now (1 paragraph)
All numbers MUST match numbers in modules[].derived_parameters. Do not invent.

=== SUB-MODULE SPECIFICITY (HARD REQUIREMENT) ===

Every sub-module's prose AND words[] MUST be specific enough that a procurement engineer could either (a) search Mouser / DigiKey / Farnell with confidence the result is the right class of part, OR (b) hand it to a contract manufacturer and receive a coherent quote within ±20%.

REJECTED: generic words like "controller", "sensor", "wire harness", "power supply" WITHOUT specs.
ACCEPTED: "ARM Cortex-M4 MCU PCB, STM32F427VGT6", "Pt100 RTD temperature sensor, ±0.15 °C", "24 AWG UL 2464 shielded control harness, 20-conductor, 600 V rated", "24 V DC 5 A AC-DC desktop supply, IEC 62368 listed".

Where the design implies a specific commercial part, NAME the manufacturer + part number (e.g. "CATL 280 Ah LFP prismatic cell" not "lithium cell"). Where it's a class, give the class spec (voltage / current / capacity / dimensions / comms protocol).

Every sub-module MUST declare grammar_links to other sub-modules it physically/electrically/control-connects to.`
}

const REVIEWER_TEMPLATE = `You are a reviewer in an additive engineering design review chain. The design you receive is a hardware product decomposition: brief overview prose + 10-12 modules + per-module sub-modules with grammar_links + cross_module_grammar_links.

YOUR JOB — four concerns, applied to the ENTIRE design:

1. ACCURACY — fact-check existing claims (numerical, regulatory, part-spec). Fix what's false.

2. COMPLETENESS — identify what's missing and ADD it: missing sub-modules a functional product needs, missing parts inside existing sub-modules, missing fields in derived_parameters, missing regulatory standards, missing grammar_links. Every added sub-module must declare grammar_links to existing peers. Every part must be specific enough to procurement-search on Mouser/DigiKey/Farnell.

3. **DENSITY + DESCRIPTIVE RICHNESS (CRITICAL — the BoM-grade gate)** —

   3a. WORD COUNT: every existing sub-module with fewer than 5 words is UNDER-DETAILED for a real BoM. Scan every sub-module; if it has 1-4 words, ADD WORDS via add_word_to_sub_module patches to bring it up to 5-7 specific parts.

   3b. MODIFIER RICHNESS: every existing word with fewer than 5 modifier_characters is UNDER-SPECIFIED for procurement. Each word is a BoM line; a BoM line with only "×4896" is unsourceable. Every word needs modifier_characters populated across these ALLOWED kinds where applicable:
       quantity, manufacturer, part_number, material, rating_primary, rating_secondary, dimensions, mass, operating_temp_range, regulatory, ip_rating.

   DO NOT emit lead_time or cost/unit_cost_estimate_gbp/price — lead_time is permanently excluded (fabricator-specific, must come from human conversation), cost is suppressed pending the BoM + assumptions ledger.

   To enrich an existing word, emit an add_word_to_sub_module patch using the SAME word.id; the chain merges your modifier_characters into the existing word (non-duplicate kind+value pairs only). Use this to add manufacturer + part_number + material + cert + dimensions to thin words.

   Examples of common density+richness failures:
     - "LFP prismatic cell [×4896, 280, 3.2]" → needs manufacturer (CATL), part_number (CB-280Ah-A-50), material (LFP cathode / graphite anode), rating_primary (280 Ah at 0.5 C), dimensions (173×72×207 mm), mass (5.3 kg), operating_temp_range (−20 to +60 °C), regulatory (IEC 62619, UN 38.3)
     - "BMS slave PCB assembled [×136]" → needs manufacturer (custom-design / outsource to PCBA house), part_number (internal BoM ref like BSV-PCB-A1), material (FR4 4-layer with conformal coating), rating_primary (14-channel cell monitor based on ISL94212), dimensions (100×60×12 mm), mass (0.18 kg), operating_temp_range (−40 to +85 °C industrial), regulatory (RoHS, IEC 60950)
     - "DC contactor 900V [×2, 900, 1600]" → needs manufacturer (Gigavac / Sensata), part_number (GX21BAB), material (silver-alloy contacts, ceramic arc chamber), rating_primary (1600 A continuous, 6000 A break at 900 V DC), dimensions (185×115×100 mm), mass (4.2 kg), operating_temp_range (−40 to +85 °C), regulatory (UL 508, IEC 60947-4-1)

   3c. ENGLISH SENTENCE — RICH PROSE PARAGRAPH (Phase A rewrite 2026-05-15, financial suppression added 2026-05-15): every sub-module's english_sentence MUST be a 150-200 word natural-English PROSE PARAGRAPH that names every word in the sub-module AND weaves in every TECHNICAL modifier_character (manufacturer, part_number, material, dimensions, rating, regulatory, operating_temp_range, ip_rating, etc.) using natural English prepositions, not as a comma list. The downstream BoM table will be built by aggregating the words/modifiers themselves — this paragraph is what the engineer READS.

   HARD SUPPRESSION RULES (Tristan 2026-05-15, both UNIVERSAL across every product class):
     A. lead_time / "lead time" / "N-week lead" / "supplied via X with N-week" / "delivery in N weeks" / etc. — PERMANENTLY suppressed. Lead times are fabricator-specific and always require human conversation with a contract manufacturer; the engine cannot generate trustworthy lead times under any condition. NEVER mention them in prose.
     B. unit_cost_estimate_gbp / cost / price / £ / $ / € / "approximately £N" / "estimated cost" — TEMPORARILY suppressed until the BoM table + assumptions ledger exist. After that, costs return; lead times do not.
   The modifier values may stay on the word for downstream non-rendered consumption; the prose simply does not surface them.

   Example tone (NOTE the absence of cost / lead time): "The main water reservoir comprises a 150-litre food-grade LLDPE tank (Enduramaxx EMX-LID-150) sitting on the base frame, fitted with a Fluidmaster ½-inch WRAS-approved float valve (part FM-400-X) and an Enduramaxx 400 mm screw-on lid. The tank wall thickness is 6 mm at the base for forklift impact, the float valve is rated to 6 bar working pressure and trip-tested at 25 °C ambient, all components certified to WRAS for potable water." A 2-3 line single sentence is INSUFFICIENT — readers cannot identify components and procurement engineers cannot work from it.

   3d. OVERVIEW PARAGRAPH — CAP at ~1,000 WORDS (Phase A constraint 2026-05-15, financial suppression added 2026-05-15): every module's overview_paragraph_en should be ~600-1000 words (≈4,000-6,500 chars), 2-3 paragraphs maximum. CRITICAL: every concrete component or part-name you mention in the module overview MUST also appear as a word inside one of the module's sub-modules — the BoM aggregates sub-module words, so anything named in the overview but absent from the sub-modules is invisible to procurement. Cross-check before emitting: if you write "the rack is fitted with TE Connectivity AMP fastons" in the overview, the corresponding sub-module must list a word with id like te_connectivity_amp_faston_word with appropriate modifiers.

   SUPPRESSION (overview — same two-tier rule as 3c above):
     • LEAD TIMES — PERMANENTLY suppressed. Never. No "12-week lead time", no "supplied via X with N-week", no "delivery in N weeks". Fabricator-specific, always needs human conversation.
     • COSTS — TEMPORARILY suppressed until BoM + assumptions ledger exist. No "£18,500 unit cost", no GBP/EUR/USD figures.
   If you find yourself reaching for a £ / $ / € / "weeks" / "lead time" / "cost" / "price" number, STOP — describe the technical attribute instead. Use append_to_overview if a module's overview is shorter than 800 chars.

   3e. MODULE DISPLAY NAME: every module must carry a display_name field appropriate to the actual product class. The module ID (e.g. energy_storage_source) is universal for gating; the display_name is what the reader sees. For BESS energy_storage_source the display_name is "Battery Cell String", for vertical farm "Water Reservoir System", for heat pump "Refrigerant Reservoir & Charge Management". Emit an edit_field patch on display_name for every module on your first pass if it is missing or generic.


4. COHERENCE — orphan sub-modules need their grammar_links added (do NOT delete orphans). Dangling references need their endpoints fixed. Duplicates need consolidating.

OUTPUT FORMAT — patches, NOT the full design:

Return a compact JSON array of patch operations. DO NOT return the full design — the chain applies your patches in-place. Output size MUST be small (<25 KB) so no provider truncation can occur.

Supported operation types:

  { "op": "add_sub_module", "module": "<module_id>", "sub_module": { full sub-module object with id, name_human, words[], english_sentence, rad_syntax, grammar_links }, "reason": "..." }
  { "op": "add_grammar_link", "module": "<module_id>", "link": { from_sub_module, to_sub_module, mechanism, type, detail }, "reason": "..." }
  { "op": "add_cross_link", "link": { from_module, to_module, mechanism, type, detail }, "reason": "..." }
  { "op": "edit_field", "module": "<module_id>", "path": "derived_parameters.cell_count", "new_value": 5000, "reason": "..." }
  { "op": "edit_sub_module_field", "module": "<module_id>", "sub_module_id": "<sub_id>", "path": "name_human", "new_value": "...", "reason": "..." }
  { "op": "add_word_to_sub_module", "module": "<module_id>", "sub_module_id": "<sub_id>", "word": { id, name_human, content_character, modifier_characters }, "reason": "..." }
  { "op": "append_to_overview", "module": "<module_id>", "text": "<additional sentence>", "reason": "..." }

PRODUCTIVE-OUTPUT HARD CONSTRAINT (DESCRIPTION-WEIGHTED):
You MUST return at least ONE move from BOTH groups:

  DESCRIPTION (at least one required — this is what makes the BoM real):
    (a) ≥ 12 add_word_to_sub_module operations EITHER to enrich existing thin words with manufacturer / part_number / material / rating / dimensions / regulatory etc. OR to add new specific parts
    (b) ≥ 1,500 chars of new overview prose across modules via append_to_overview

  STRUCTURE / SCAFFOLDING (at least one required):
    (c) ≥ 2 add_sub_module operations
    (d) ≥ 5 add_grammar_link or add_cross_link operations
    (e) ≥ 5 edit_field operations adding derived_parameters

A design where existing sub-modules' words still have ≤3 modifier_characters is a FAILED review. The BoM-grade test: pick any word, can a procurement engineer source the part from your modifier set? If "×4896" is all you've got, NO.

Scan specifically for these completeness gaps before deciding nothing is missing:
  - thermal management (cold plates, coolant manifolds, heaters for cold ambient)
  - safety interlocks (door switches, smoke detectors, e-stops)
  - EMC / grounding (chassis earth, CM chokes, shielded harness)
  - redundancy (paralleled fans, backup comms)
  - monitoring & diagnostics (watchdog, log storage)
  - sourcing specificity (replace generic "controller" with a real MCU part)
  - regulatory standards relevant to the product class

OUTPUT EXACT SHAPE:
{
  "patches": [
    { "op": "...", ...fields..., "reason": "..." },
    ...
  ]
}

Return ONLY JSON. No preamble. No markdown fences. No commentary outside JSON.`

const R4_FACTCHECK_APPEND = `

=== ADDITIONAL ROLE: GROUNDED FACT-CHECK (Tristan directive 2026-05-16, anti-hallucination) ===

You have Google Search grounding enabled. iter-59 BESS audit found ~30-40% hallucination rate on manufacturer+part_number combinations (e.g. "Unex RACK-40U-HD" for a steel rack frame — Unex makes cable trays, not racks; "Wakefield-Vette CP-BESS-280" — invented suffix). Your job is to STRIP fabricated SKUs, not invent replacements.

PRIORITY 1 — PART NUMBER VERIFICATION (strip on failure):
   - For every word with BOTH a manufacturer AND a part_number modifier, search-verify the part number EXISTS for that manufacturer in their actual catalogue/datasheet.
   - If the part number is NOT verifiable (no datasheet, no distributor listing, no manufacturer catalogue page), STRIP the part_number modifier — do NOT invent a replacement. Leaving the manufacturer alone is fine; leaving NEITHER is also fine. A word with manufacturer:"Phoenix Contact" + verified part_number:"QUINT-PS-24" is good. A word with manufacturer:"Phoenix Contact" + no part_number is acceptable. A word with manufacturer:"Phoenix Contact" + INVENTED part_number:"QUINT-TS-20" is REJECTED.
   - Common hallucination patterns to strip: brief-specific SKU suffixes ("...-BESS-280", "...-V1-CUSTOM"), category mismatch (vendor makes X but the part is Y), made-up family names that don't appear in any manufacturer document.
   - Emit edit_sub_module_field patches removing only the falsified modifier; leave the rest of the word intact.

PRIORITY 2 — REGULATORY STANDARDS (verify current, edit on drift):
   - Every IEC/UL/NFPA/G99/BS EN reference: verify the standard number is current and applies to the product class.
   - If a standard has been superseded, edit to the current version. If a reference is to a non-existent standard, strip it.

PRIORITY 3 — QUANTITATIVE SPEC SANITY:
   - When a model number is given, cross-check the claimed spec against the published datasheet. If the claim is wrong (e.g. claiming 1000 A continuous on a 50 A contactor), edit to the correct value.

DO NOT:
   - Invent replacement part_numbers when the original was wrong. Strip and leave manufacturer-only.
   - Add manufacturer+part_number combinations to commodity items (earth bars, copper cables, brass studs, generic insulation tape, mineral wool, spring nuts). These are commodity items sold by spec; the gate accepts ≥3 modifiers for them.
   - Pass through known-invented SKUs to satisfy the modifier-count gate. The word_modifier_richness gate now allows ≥3 for commodity items. Better to strip than to fabricate.`

// ─── Step orchestration ────────────────────────────────────────────────────

/**
 * Compute explicit DENSIFICATION TARGETS for the reviewer's user message.
 *
 * Phase 2 repair can only fix ~30 violations per iter × 6 iters = 180. With
 * 50+ thin sub-modules and 150+ thin words this never converges. Architectural
 * fix: surface the gap to the Phase 1 reviewer so it knows EXACTLY which IDs
 * to enrich. Reviewer prompts are LLM-driven (high patch budget); Phase 2 is
 * just deterministic cleanup of residuals.
 */
// lead_time + unit_cost_estimate_gbp removed 2026-05-15 — lead_time permanently
// excluded (fabricator-specific, must come from human conversation per Tristan),
// cost suppressed pending BoM table + assumptions ledger.
const REQUIRED_KINDS = ['manufacturer', 'part_number', 'material', 'rating_primary', 'dimensions', 'regulatory']
function computeDensityTargets(design: any): string {
  const thinSubs: string[] = []
  const thinWords: Array<{ ref: string; have: string[]; missing: string[] }> = []
  for (const m of (design?.modules ?? [])) {
    for (const sm of (m.sub_modules ?? [])) {
      const wordCount = (sm.words ?? []).length
      if (wordCount < 5) {
        thinSubs.push(`${m.module}::${sm.id} (${wordCount} words, need ≥5)`)
      }
      for (const w of (sm.words ?? [])) {
        const modKinds: string[] = (w.modifier_characters ?? []).map((mc: any) => String(mc.kind ?? ''))
        if (modKinds.length < 5) {
          const have = Array.from(new Set(modKinds))
          const missing = REQUIRED_KINDS.filter(k => !have.includes(k))
          const wid = w.id ?? w.content_character?.character_id ?? '?'
          thinWords.push({ ref: `${m.module}::${sm.id}::${wid}`, have, missing })
        }
      }
    }
  }
  if (thinSubs.length === 0 && thinWords.length === 0) return ''
  const subList = thinSubs.length > 0
    ? `\nUNDER-DENSE SUB-MODULES (you MUST emit add_word_to_sub_module patches with NEW words until each reaches ≥5 words):\n${thinSubs.map(s => '  - ' + s).join('\n')}`
    : ''
  // Cap word list to keep prompt manageable (≤ 80 worst cases) — reviewer will
  // generalise from these examples to the rest.
  const wordList = thinWords.length > 0
    ? `\nUNDER-SPECIFIED WORDS (you MUST emit add_word_to_sub_module patches with the SAME word.id + the missing modifier_characters — chain merges them in). Each word needs ≥5 modifier_characters with concrete values:\n${thinWords.slice(0, 80).map(w => `  - ${w.ref} — have:[${w.have.join(',')}] missing:[${w.missing.slice(0, 6).join(',')}]`).join('\n')}${thinWords.length > 80 ? `\n  ... + ${thinWords.length - 80} more (apply same enrichment pattern)` : ''}`
    : ''
  return `\n\n──────────────────────────────────────────────────────────────\nDENSIFICATION TARGETS — MUST FIX IN THIS PASS (priority over new sub-modules)\n──────────────────────────────────────────────────────────────${subList}${wordList}\n──────────────────────────────────────────────────────────────\nProcurement-grade reminder: every modifier_character must carry a concrete value (real manufacturer/part number/dimension/cert/£ price) — NOT placeholders like "TBD" or "various". This data feeds a real BoM.\n`
}

/**
 * Phase D-prep (2026-05-15): generate the productivity/ROI headline that
 * drives the entire downstream design. Flash-Lite with Google grounding, fed
 * brief + parsed constraints + research synthesis. Emits the KeyMetrics shape
 * defined in types/module-decomposition.ts.
 *
 * Failure mode: if the LLM emission can't be parsed or is missing required
 * fields, return null and let the rest of the chain run without it (the
 * generator + reviewers will skip the KEY_METRICS context block).
 */
/**
 * Brief plausibility critic (Tristan directive 2026-05-15). Runs ONCE between
 * brief parse and key_metrics generation. Asks Flash-Lite to perform an
 * order-of-magnitude physical-feasibility check against well-known bounds for
 * the product class.
 *
 * Empirical motivation: Test 2 ("impossibility brief" — 500 MWh BESS in a
 * 20-foot ISO container at 1500 kg / £50,000) was accepted by every existing
 * arithmetic gate. The gates check internal-consistency of LLM-emitted values,
 * not whether those values are physically achievable. By the time Phase 2
 * runs, the LLMs have already fabricated component data that satisfies every
 * gate. This step is the gate BEFORE the chain that says "stop, this is not
 * possible — refuse before any £3-5 of downstream LLM work."
 *
 * Returns:
 *   { possible: true, ... }  → continue chain
 *   { possible: false, contradictions: [...] }  → caller halts with FATAL
 */
interface BriefPlausibilityVerdict {
  possible: boolean
  confidence: 'high' | 'medium' | 'low'
  contradictions: Array<{
    constraint: string
    brief_value: string
    physical_floor: string
    ratio: string
    reasoning: string
  }>
  /**
   * Phase 0 refinement loop (Tristan 2026-05-15): when contradictions exist,
   * the critic ALSO emits one revision proposal per contradiction. Each
   * proposal names a single constraint to relax + the smallest change that
   * resolves it. The chain picks one per priority heuristic; the unchosen
   * ones surface as "alternatives considered" in the PDF.
   */
  proposed_revisions?: Array<{
    target_constraint: string  // canonical key e.g. "max_mass_kg", "unit_cost_ceiling", "target_capacity_mwh", "envelope_volume_m3"
    current_value: string
    proposed_value: string
    relax_factor: string       // human-readable, e.g. "20× increase" or "60% reduction"
    rationale: string
    resolves_contradiction_indexes: number[]  // indices into contradictions[]
  }>
  notes?: string
}

async function generateBriefPlausibilityCritic(opts: {
  brief: string
  parsedBrief: any
  productClass: string
  apiKey: string
}): Promise<BriefPlausibilityVerdict> {
  // Per-class floors come from the data registry in class-floors.ts.
  // Principle 3 (Tristan 2026-05-15): floors are DATA not code; new product
  // class = add to data file, don't edit this prompt. Falls open with no
  // floors block when class is unknown.
  const floorsBlock = formatFloorsForPrompt(opts.productClass)
  const hasFloors = floorsBlock.length > 0
  const system = `You are a hardware-feasibility critic. Your ONE job: examine a product brief and decide whether the requested OUTPUT can be physically achieved within the brief's stated CONSTRAINTS (mass, volume/envelope, cost ceiling, lead time, performance targets) using current state-of-the-art technology.

You are NOT designing the product. You are NOT optimising. You are asking: "Is this even possible? Or is the customer asking for something that violates physics, market reality, or current tech limits by more than 2× in any dimension?"

${hasFloors ? floorsBlock : '(No class-specific physical floors are available for this product class. Use first-principles engineering judgment — flag only contradictions you can argue from basic physics or fundamental market economics. If unsure, return possible=true with low confidence.)'}

For any class, also check:
  - if claimed_output_per_year vs minimum_specific_output × mass_budget → does it fit?
  - if claimed_capex vs minimum_£_per_unit × output → does it fit?
  - if envelope_volume vs minimum_volumetric_density × output → does it fit?

A contradiction is a STRICT 5× threshold: only flag when brief_value vs physical_floor differs by >5×. NOTHING under 5× counts as a contradiction.

This is a HARDWARE-ENGINEERING brief, not a feasibility study. The whole POINT of a brief is often to design something aggressive that requires real engineering — low-charge refrigerant systems, vertical-integration cost targets, high-density energy storage. Many briefs will deliberately set targets 2-5× tighter than typical market designs because that's the design problem. Do NOT refuse these; they are the work.

Specifically:
  - 1.5× → DO NOT FLAG (close to typical; minor optimisation)
  - 3× → DO NOT FLAG (aggressive engineering target — the kind of thing the designer is being asked to figure out)
  - 4.9× → DO NOT FLAG (very aggressive but still within the realm of clever design)
  - 5.5× → BORDERLINE flag (call it out; note the achievability gap)
  - 10× → FLAG (order of magnitude — likely physics rather than engineering)
  - 100× → FLAG (two orders of magnitude — physics breaks)
  - 1,666× → FLAG (three orders of magnitude — physics violation)

Reserve "possible=false" for cases that violate physics or market reality by 5× or more. Examples that SHOULD be flagged:
  - 500 MWh BESS in 1,500 kg envelope (1,666× the physical cell-density floor — IMPOSSIBLE)
  - 100 kW heat pump at £50 ex-works (150× under cost floor — IMPOSSIBLE)
  - Vertical farm yielding 5,000 kg/m²/year (100× over leafy-green photoperiod ceiling — IMPOSSIBLE)

Examples that SHOULD NOT be flagged:
  - 30 kW R290 heat pump at 500 g charge (3× under conventional charge; achievable with low-charge mini-channel design)
  - BESS at £51/kWh (1.5× under £80/kWh market floor; achievable with vertical integration at scale)
  - Heat pump at SCOP 5.5 (1.1× over typical floor; achievable with ground-source or premium air-source)

Trust the designer to ask for aggressive targets. Refuse only physically impossible ones.

Return ONLY this JSON (no preamble, no markdown):

{
  "possible": true | false,
  "confidence": "high" | "medium" | "low",
  "contradictions": [
    {
      "constraint": "mass_budget | envelope_volume | capex_ceiling | output_target | performance | lead_time",
      "brief_value": "<the constraint as stated in the brief>",
      "physical_floor": "<order-of-magnitude floor with units, e.g. 'cells alone require ≥ 2,500,000 kg at 200 Wh/kg'>",
      "ratio": "<ratio of required vs allowed, e.g. '1,666× over budget'>",
      "reasoning": "<one short sentence>"
    }
  ],
  "proposed_revisions": [
    {
      "target_constraint": "<canonical key: max_mass_kg | unit_cost_ceiling | target_capacity_mwh | target_thermal_kw | target_canopy_m2 | envelope_volume_m3 | material | refrigerant_charge_kg | etc.>",
      "current_value": "<as stated in brief>",
      "proposed_value": "<smallest change to satisfy the physical floor>",
      "relax_factor": "<human-readable, e.g. '20× increase' or '95% reduction'>",
      "rationale": "<one short sentence: this revision resolves contradiction X because Y>",
      "resolves_contradiction_indexes": [0]
    }
  ],
  "notes": "<one-sentence summary>"
}

PROPOSED_REVISIONS RULES (Phase 0 refinement, Tristan 2026-05-15):
  - For EACH contradiction in contradictions[], emit ONE OR MORE proposed_revisions that, if applied to the brief, would resolve it
  - Each revision names a SINGLE constraint to relax + the SMALLEST change that resolves the contradiction
  - When multiple constraints could be relaxed for the same contradiction, emit one revision per option (so the user sees alternatives). Example: a 1666× mass contradiction in a BESS brief has these revisions:
      (a) raise max_mass_kg from 1500 to 2,500,000 (1666× increase) — RATIONALE: matches cell density physical floor
      (b) reduce target_capacity_mwh from 500 to 0.3 (99.94% reduction) — RATIONALE: 1500 kg / 200 Wh/kg = 0.3 MWh max
      (c) change material to "advanced solid-state cells" — RATIONALE: 1000 Wh/kg required; not yet commercially available
  - DO NOT propose tiny tweaks. Each revision should fully resolve at least one contradiction.
  - resolves_contradiction_indexes: array of 0-based indices into contradictions[] that this revision resolves
  - If possible=true (no contradictions): return proposed_revisions: []

If possible=true, return contradictions: [] and proposed_revisions: []. If you cannot find any contradiction >5×, the brief is plausible.

DO NOT be polite. DO NOT hedge. If the customer asks for something impossible, propose the revisions that would make it possible.`

  const user = `PRODUCT CLASS: ${opts.productClass}

PRODUCT BRIEF:
${opts.brief}

PARSED CONSTRAINTS:
${JSON.stringify(opts.parsedBrief)}

Run the feasibility check. Return the JSON verdict.`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // 2026-05-19 v5.2 plausibility critic: swap Flash-Lite → 3.5 Flash.
        // Better physics-floor reasoning (verified by A/B probe). max_tokens
        // bumped 2500→8000 to clear reasoning-token budget (3.5 Flash burns
        // ~70% of completion on internal reasoning).
        model: FLASH_3_5,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
        max_tokens: 8000,
        thinking_level: 'high',
        // ⚠️ Removed google_search_grounding 2026-05-16 — verified that
        // OpenRouter silently ignores this for Gemini Flash-Lite. This call
        // is therefore an LM-only review, not a grounded fact-check.
        // To get real Google Search grounding, call Gemini via Google's
        // native API (see GEMINI_API_KEY escape valve).
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error(`[chain] brief_plausibility: OpenRouter ${response.status} — DEFAULTING TO POSSIBLE (do not block on tool failure)`)
      return { possible: true, confidence: 'low', contradictions: [], notes: 'critic unavailable; default permissive' }
    }
    const json = await response.json() as any
    const raw = (json.choices?.[0]?.message?.content ?? '').trim()
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    try {
      const parsed = JSON.parse(cleaned)
      if (typeof parsed.possible !== 'boolean') {
        console.error(`[chain] brief_plausibility: malformed verdict — DEFAULTING TO POSSIBLE`)
        return { possible: true, confidence: 'low', contradictions: [], notes: 'malformed verdict' }
      }
      return parsed as BriefPlausibilityVerdict
    } catch (err) {
      console.error(`[chain] brief_plausibility: JSON parse failed — DEFAULTING TO POSSIBLE: ${(err as Error).message}`)
      return { possible: true, confidence: 'low', contradictions: [], notes: 'parse failure' }
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Phase 0 — relaxation priority heuristic (Tristan 2026-05-15).
 *
 * When multiple proposed_revisions could resolve the same set of contradictions,
 * pick the one that touches the MOST NEGOTIABLE constraint first. Order from
 * most-negotiable (relaxed first) to most-rigid (relaxed last):
 *
 *   1. unit_cost_ceiling      — aspirational; raising a budget is usually fine
 *   2. target_performance_*   — reducing stated output is a softer relax than
 *                               re-engineering the envelope. Captured as the
 *                               family target_capacity_*, target_thermal_*,
 *                               target_yield_*, target_throughput_*, etc.
 *   3. max_mass_kg            — physical limit but transport classes step up
 *                               (van → truck → abnormal-load)
 *   4. envelope_volume_m3     — usually a hard constraint (shipping container)
 *   5. material               — chemistry/material change is large engineering
 *   6. refrigerant_charge_kg  — capped by regulation (EN 378); rigid
 *   7. (everything else)      — relaxed last
 *
 * Future extension: the brief writer can annotate constraints with [LOCK]
 * tags to force a constraint into the rigid bucket. MVP uses the heuristic.
 */
const RELAXATION_PRIORITY: string[] = [
  'unit_cost_ceiling', 'unit_cost_ceiling_gbp', 'capex_ceiling', 'cost_ceiling',
  'target_capacity_mwh', 'target_capacity_kwh', 'target_thermal_kw', 'target_yield_kg', 'target_throughput', 'target_power_mw', 'target_performance', 'output_target', 'performance',
  'max_mass_kg', 'mass_budget',
  'envelope_volume_m3', 'envelope', 'max_dimensions_mm',
  'material', 'cell_chemistry',
  'refrigerant_charge_kg',
]

function relaxationPriorityIndex(target: string): number {
  const t = target.toLowerCase()
  for (let i = 0; i < RELAXATION_PRIORITY.length; i++) {
    if (t.includes(RELAXATION_PRIORITY[i])) return i
  }
  return 9999  // unknown — relaxed last
}

/**
 * From the critic's proposed_revisions[], pick ONE to apply this iter. Heuristic:
 *   1. Prefer revisions that resolve more contradictions (broader fix)
 *   2. Tie-breaker: prefer the most-negotiable constraint per RELAXATION_PRIORITY
 *
 * Returns null when there are no revisions to pick. Also returns the
 * unchosen alternatives so the renderer can surface them.
 */
function pickRevisionByPriority(verdict: BriefPlausibilityVerdict): {
  chosen: NonNullable<BriefPlausibilityVerdict['proposed_revisions']>[number] | null
  alternatives: NonNullable<BriefPlausibilityVerdict['proposed_revisions']>
} {
  const revs = verdict.proposed_revisions ?? []
  if (revs.length === 0) return { chosen: null, alternatives: [] }
  // Rank: more contradictions resolved → higher; lower priority-index → higher (more negotiable)
  const ranked = [...revs].sort((a, b) => {
    const ar = (a.resolves_contradiction_indexes ?? []).length
    const br = (b.resolves_contradiction_indexes ?? []).length
    if (ar !== br) return br - ar
    const ai = relaxationPriorityIndex(a.target_constraint)
    const bi = relaxationPriorityIndex(b.target_constraint)
    return ai - bi
  })
  const chosen = ranked[0]
  const alternatives = ranked.slice(1)
  return { chosen, alternatives }
}

/**
 * Parse a relax_factor string like "20× increase" or "95% reduction" or
 * "1666× over" into a numeric factor. Returns null on unparseable. Used by
 * the per-revision cap (100× max single-step relax).
 */
function parseRelaxFactor(raw: string): number | null {
  if (!raw) return null
  const m = String(raw).match(/(\d[\d,]*\.?\d*)\s*[x×%]/i)
  if (!m) return null
  const v = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(v)) return null
  // "95% reduction" → ratio is 1/0.05 = 20× equivalent
  if (/%/.test(raw)) return v < 100 ? 1 / (1 - v / 100) : 1000
  return v
}

/**
 * Phase 0 — brief rewriter. Given a brief markdown text and a chosen
 * revision, ask Flash-Lite to produce a revised brief where the named
 * constraint is changed to the proposed value. All other content is
 * preserved verbatim. Annotations document the change inline so a reader
 * can see what happened.
 *
 * Returns the revised markdown, or null on LLM failure (in which case the
 * caller treats the iter as a no-op and surfaces the original brief +
 * revisions for human review).
 */
async function rewriteBriefWithRevision(opts: {
  briefText: string
  revision: NonNullable<BriefPlausibilityVerdict['proposed_revisions']>[number]
  apiKey: string
}): Promise<string | null> {
  const system = `You are a brief-revision editor. You receive a product brief markdown and ONE specific constraint change to apply. Your job: produce a revised brief that:
  1. Applies the constraint change EXACTLY as specified (current_value → proposed_value for target_constraint)
  2. Preserves EVERY other word, number, section, formatting choice in the original brief
  3. Inserts a brief annotation in the constraints section explaining the change, formatted as a Markdown comment:
       <!-- REVISED 2026-05-15: <target_constraint> was <current_value>, raised/reduced to <proposed_value> per plausibility-critic recommendation. RATIONALE: <rationale> -->
  4. Updates any prose references that mention the old value (e.g. if the overview paragraph says "3.5 MWh capacity" and the revision changes capacity, update the prose accordingly)

Do NOT change anything not directly affected by the revision. Do NOT optimise other parts of the brief. Do NOT add commentary above or below the brief. Return ONLY the revised markdown, no preamble, no fences.`

  const user = `ORIGINAL BRIEF:
${opts.briefText}

REVISION TO APPLY:
  target_constraint: ${opts.revision.target_constraint}
  current_value:     ${opts.revision.current_value}
  proposed_value:    ${opts.revision.proposed_value}
  relax_factor:      ${opts.revision.relax_factor}
  rationale:         ${opts.revision.rationale}

Return the revised brief markdown now.`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: FLASH_LITE,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.1,
        max_tokens: 8000,
        thinking_level: 'low',
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error(`[chain] brief_rewriter: OpenRouter ${response.status} — leaving brief unchanged`)
      return null
    }
    const json = await response.json() as any
    const raw = String(json.choices?.[0]?.message?.content ?? '').trim()
    if (!raw) {
      console.error(`[chain] brief_rewriter: empty response — leaving brief unchanged`)
      return null
    }
    // Strip code fence if the LLM ignored instructions
    const cleaned = raw.replace(/^```(?:markdown|md)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    return cleaned
  } finally {
    clearTimeout(timeout)
  }
}

async function generateKeyMetrics(opts: {
  brief: string
  parsedBrief: any
  research: any
  productClass: string
  apiKey: string
}): Promise<KeyMetrics | null> {
  const system = `You are a hardware-engineering analyst emitting the OPERATIONAL headline for a product about to be decomposed into an engineering report. This headline states what the product DOES and the constraints it must respect — it is the design target.

CRITICAL — Tristan directive 2026-05-15: do NOT emit financial numbers (capex, opex, revenue, payback). Those require the Bill of Materials and an explicit assumptions ledger, neither of which exists at this stage. Financial metrics will be added LATER in a separate phase that aggregates per-component costs from the BoM and references a documented assumptions ledger for £/MWh, labour rates, etc.

Emit ONLY physical/operational metrics derivable from the brief + research:
  - headline_output: what the product produces (annual MWh for BESS, kg/year yield for vertical farm, kW thermal output for heat pump, readings/day for CGM, etc.)
  - headline_constraint: the hardest brief-stated constraint (mass, volume, area, capacity ceiling, etc.)
  - utilisation: a class-appropriate operational metric (round-trip efficiency, SCOP, yield_per_m2_per_year, uptime_fraction)
  - supporting_metrics: 1-3 additional operational metrics readers care about (continuous power output, cycle life, IP rating, noise level)

Show your work in the "notes" field of each metric (one short sentence: input × utilisation × cycles → answer). Be conservative.

Numeric values are PLAIN strings — no commas, no currency symbols, no percent signs ("12000" not "£12,000", "0.85" not "85 %").

Return ONLY JSON matching this exact shape (no preamble, no markdown, no financial fields):

{
  "headline_output":      { "id": "...", "label": "...", "value": "...", "unit": "...", "notes": "..." },
  "headline_constraint":  { "id": "...", "label": "...", "value": "...", "unit": "...", "notes": "..." },
  "utilisation":          { "id": "...", "label": "...", "value": "...", "unit": "...", "notes": "..." },
  "supporting_metrics":   [ { "id": "...", "label": "...", "value": "...", "unit": "...", "notes": "..." } ]
}

Class-appropriate examples:
- BESS: headline_output={MWh delivered/year}, utilisation={round_trip_efficiency_pct}, headline_constraint={capacity ceiling MWh or mass kg}
- Vertical farm: headline_output={kg yield/year}, utilisation={yield_per_m2_per_year}, headline_constraint={m² growing area}
- Heat pump: headline_output={kW thermal output}, utilisation={SCOP seasonal coefficient}, headline_constraint={electricity input kW}
- CGM: headline_output={readings/day}, utilisation={uptime fraction}, headline_constraint={sensor lifetime days}

supporting_metrics — 1-3 entries — physical only (continuous power output, cycle life, mass, dB noise, IP rating). NO financial.

If you find yourself wanting to emit capex, opex, revenue, or payback: STOP. Those are not your job at this stage. They will be computed deterministically from the BoM after the design exists.`

  const user = `PRODUCT BRIEF:
${opts.brief}

PARSED CONSTRAINTS:
${JSON.stringify(opts.parsedBrief)}

RESEARCH SYNTHESIS:
${opts.research ? JSON.stringify(opts.research) : '(not available)'}

PRODUCT CLASS: ${opts.productClass}

Emit the KeyMetrics JSON now.`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: FLASH_LITE,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.1,
        max_tokens: 3000,
        thinking_level: 'high',
        // ⚠️ google_search_grounding removed 2026-05-16 — OpenRouter no-op for
        // Gemini Flash-Lite. This is an LM-only review path.
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error(`[chain] key_metrics: OpenRouter ${response.status} — skipping`)
      return null
    }
    const json = await response.json() as any
    const raw = (json.choices?.[0]?.message?.content ?? '').trim()
    if (!raw) {
      console.error(`[chain] key_metrics: empty response — skipping`)
      return null
    }
    // Strip code fence + parse
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    try {
      const parsed = JSON.parse(cleaned)
      // Operational-only shape check (Tristan directive 2026-05-15): financials
      // were stripped because they were fabricated without a BoM. Minimum
      // required: headline_output, headline_constraint, utilisation.
      if (!parsed?.headline_output?.value || !parsed?.headline_constraint?.value || !parsed?.utilisation?.value) {
        console.error(`[chain] key_metrics: missing required operational fields (headline_output/headline_constraint/utilisation) — skipping`)
        return null
      }
      // STRIP any financial fields the LLM emitted despite the prompt. We do
      // not trust them and we do not render them.
      for (const k of ['capex_gbp', 'opex_gbp_per_year', 'revenue_gbp_per_year', 'roi_payback_years']) {
        if (k in parsed) {
          console.error(`[chain] key_metrics: STRIPPED ${k}=${parsed[k]?.value} — financials are fabricated without BoM`)
          delete parsed[k]
        }
      }
      parsed.generated_by = FLASH_LITE
      parsed.generated_at = new Date().toISOString()
      if (!Array.isArray(parsed.supporting_metrics)) parsed.supporting_metrics = []
      return parsed as KeyMetrics
    } catch (err) {
      console.error(`[chain] key_metrics: JSON parse failed — ${(err as Error).message}; skipping`)
      return null
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Format KeyMetrics as a compact prompt block for the generator + reviewers.
 * Designed to slot into the user message after research synthesis. Returns
 * empty string when metrics are null so the chain runs unchanged.
 */
function formatKeyMetricsBlock(km: KeyMetrics | null): string {
  if (!km) return ''
  const lines: string[] = []
  lines.push('')
  lines.push('──────────────────────────────────────────────────────────────')
  lines.push('OPERATIONAL HEADLINE — what this design must deliver (physical/operational only)')
  lines.push('──────────────────────────────────────────────────────────────')
  const row = (m: any) => m ? `  ${m.label}: ${m.value}${m.unit ? ' ' + m.unit : ''}${m.notes ? '  — ' + m.notes : ''}` : null
  for (const r of [row(km.headline_output), row(km.headline_constraint), row(km.utilisation)]) {
    if (r) lines.push(r)
  }
  for (const sm of (km.supporting_metrics ?? [])) { const r = row(sm); if (r) lines.push(r) }
  lines.push('')
  lines.push('NOTE — financial metrics (capex, opex, revenue, payback) deliberately suppressed at this stage. They will be computed from the Bill of Materials and an explicit assumptions ledger in a later phase. Do not fabricate them.')
  lines.push('')
  lines.push('Design IMPLICATIONS:')
  lines.push('  - The headline output is the design target. Specify components that deliver it within the headline_constraint.')
  lines.push('  - Every part with running cost (electricity, consumables, maintenance) contributes to opex. Trade capex vs opex to minimise payback years.')
  lines.push('  - The headline_constraint is HARD — exceeding it breaks the brief. If a sub-module spec implies a value above the constraint, fix the spec.')
  lines.push('──────────────────────────────────────────────────────────────')
  return lines.join('\n')
}

/**
 * Brief-constraint propagator (Tristan directive 2026-05-15).
 *
 * After the generator emits a design, copy the brief's parsed numeric
 * constraints into a designated module's `derived_parameters`. Without this
 * step, the cost_ceiling + mass_budget gates fall through as no-op because
 * they read `unit_cost_ceiling_gbp` / `max_mass_kg` from derived_parameters
 * and the LLMs rarely emit those exact field names.
 *
 * Empirical motivation: iter-49d had BoM cost £322,183 vs brief ceiling
 * £180,000 (79% over) and BoM mass 35,049 kg vs limit 28,000 kg (25% over).
 * Both gates were silent because the limit fields weren't in any module's
 * derived_parameters. Now we copy them in deterministically right after
 * generation, so the gates have anchors.
 *
 * Target module: structure_containment if present (it's the envelope that
 * physically holds the constraints), else the first module. The gates iterate
 * all modules so writing to one is sufficient.
 */
function propagateBriefConstraintsToDesign(design: any, parsedBrief: any): { written: string[]; target_module: string | null } {
  const written: string[] = []
  if (!design || !parsedBrief?.constraints) return { written, target_module: null }
  const modules = design.modules ?? []
  if (modules.length === 0) return { written, target_module: null }

  // Pick target — prefer structure_containment as the natural envelope owner
  let target = modules.find((m: any) => m.module === 'structure_containment') ?? modules[0]
  if (!target.derived_parameters) target.derived_parameters = {}
  const dp = target.derived_parameters

  const c = parsedBrief.constraints
  // Cost ceiling
  if (typeof c.unit_cost_ceiling?.value === 'number' && c.unit_cost_ceiling.value > 0) {
    if (!('unit_cost_ceiling_gbp' in dp)) {
      dp.unit_cost_ceiling_gbp = c.unit_cost_ceiling.value
      written.push(`unit_cost_ceiling_gbp=${c.unit_cost_ceiling.value}`)
    }
  }
  // Mass budget
  if (typeof c.max_mass_kg?.value === 'number' && c.max_mass_kg.value > 0) {
    if (!('max_mass_kg' in dp)) {
      dp.max_mass_kg = c.max_mass_kg.value
      written.push(`max_mass_kg=${c.max_mass_kg.value}`)
    }
  }
  // Envelope volume — compute from w×d×h if present
  if (c.max_dimensions_mm?.w && c.max_dimensions_mm?.d && c.max_dimensions_mm?.h) {
    const w = Number(c.max_dimensions_mm.w), d = Number(c.max_dimensions_mm.d), h = Number(c.max_dimensions_mm.h)
    if (Number.isFinite(w) && Number.isFinite(d) && Number.isFinite(h)) {
      const vol_m3 = (w * d * h) / 1e9  // mm³ → m³
      if (!('envelope_volume_m3' in dp)) {
        dp.envelope_volume_m3 = Number(vol_m3.toFixed(2))
        written.push(`envelope_volume_m3=${dp.envelope_volume_m3}`)
      }
    }
  }
  // Target performance (energy capacity, power, etc.)
  if (typeof c.target_performance?.value === 'number' && c.target_performance.value > 0) {
    const unit = String(c.target_performance.unit ?? '').trim()
    const fieldName = unit.toLowerCase().includes('mwh')
      ? 'target_capacity_mwh'
      : unit.toLowerCase().includes('kwh')
        ? 'target_capacity_kwh'
        : unit.toLowerCase().includes('mw')
          ? 'target_power_mw'
          : 'target_performance_value'
    if (!(fieldName in dp)) {
      dp[fieldName] = c.target_performance.value
      written.push(`${fieldName}=${c.target_performance.value} (${unit})`)
    }
  }
  // Operating temperature envelope
  if (typeof c.operating_environment?.temp_min_c === 'number') {
    if (!('operating_temp_min_c' in dp)) {
      dp.operating_temp_min_c = c.operating_environment.temp_min_c
      written.push(`operating_temp_min_c=${c.operating_environment.temp_min_c}`)
    }
  }
  if (typeof c.operating_environment?.temp_max_c === 'number') {
    if (!('operating_temp_max_c' in dp)) {
      dp.operating_temp_max_c = c.operating_environment.temp_max_c
      written.push(`operating_temp_max_c=${c.operating_environment.temp_max_c}`)
    }
  }

  return { written, target_module: target.module }
}

async function runReviewerStep(opts: {
  label: string
  model: string
  fallbackModel?: string
  systemAppend?: string
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'
  groundWithGoogleSearch?: boolean
  brief: string
  parsedBrief: any
  research: any
  currentDesign: any
  rawDumpPath?: string
  keyMetrics?: KeyMetrics | null
}): Promise<any> {
  const system = REVIEWER_TEMPLATE + (opts.systemAppend ?? '')
  const densityTargets = computeDensityTargets(opts.currentDesign)
  const kmBlock = formatKeyMetricsBlock(opts.keyMetrics ?? null)
  // Compact JSON (no indent) to fit Haiku's 200 K context window after R2/R3
  // grow the design ~30 % each pass. Pretty-printed bloats by ~30 % whitespace.
  const user = `PRODUCT BRIEF (raw):
${opts.brief}

PARSED CONSTRAINTS:
${JSON.stringify(opts.parsedBrief)}

RESEARCH SYNTHESIS:
${opts.research ? JSON.stringify(opts.research) : '(not available)'}

CURRENT DESIGN (apply your 3-concern review to this whole block):
${JSON.stringify(opts.currentDesign)}
${kmBlock}
${densityTargets}
Return the corrected JSON.`

  const before = summarise(opts.currentDesign.modules ?? [])

  // Sprint 2D (Tristan 2026-05-20): primary model + optional fallback. If
  // the primary model fails (request error or parseJson throws even after
  // enableLlmRepair), retry once with the fallback. Universal — applies to
  // every reviewer step (R1/R2/R3/R4) when a fallback is configured.
  const tryOne = async (model: string, isRetry: boolean): Promise<{ patchResponse: any; result: any; modelUsed: string }> => {
    const labelWithRetry = isRetry ? `${opts.label} (retry with ${model})` : opts.label
    console.error(`\n[chain] ${labelWithRetry} ...`)
    const result = await callLlm({
      model,
      system,
      user,
      maxTokens: MAX_TOKENS_BY_MODEL[model] ?? 150_000,
      thinkingLevel: opts.thinkingLevel,
      groundWithGoogleSearch: opts.groundWithGoogleSearch,
      timeoutMs: 1_500_000,
    })
    console.error(`[chain] ${labelWithRetry} raw response: ${result.text.length} chars`)
    const patchResponse = await parseJson(result.text, {
      stage: labelWithRetry,
      model,
      rawDumpPath: opts.rawDumpPath,
    })
    return { patchResponse, result, modelUsed: model }
  }

  let attempt: { patchResponse: any; result: any; modelUsed: string }
  try {
    attempt = await tryOne(opts.model, false)
  } catch (err) {
    if (!opts.fallbackModel || opts.fallbackModel === opts.model) {
      throw err
    }
    console.error(`[chain] ${opts.label} primary model ${opts.model} failed: ${(err as Error).message.slice(0, 200)}`)
    console.error(`[chain] ${opts.label} falling back to ${opts.fallbackModel}`)
    logAction({ step: `${opts.label}.fallback_triggered`, model: opts.model, error: String(err).slice(0, 200) })
    attempt = await tryOne(opts.fallbackModel, true)
  }
  const { patchResponse, result, modelUsed: _modelUsed } = attempt
  const patches: any[] = Array.isArray(patchResponse?.patches) ? patchResponse.patches : []
  console.error(`[chain] ${opts.label} returned ${patches.length} patches`)

  // Deep-clone design and apply patches in-place
  const parsed = JSON.parse(JSON.stringify(opts.currentDesign))
  const applyResult = applyReviewerPatches(parsed, patches)
  console.error(`[chain] ${opts.label} applied ${applyResult.applied} / ${patches.length} patches (skipped ${applyResult.skipped})`)
  for (const r of applyResult.reasons.slice(0, 8)) console.error(`    ${r}`)

  const afterCheck = summarise(parsed.modules ?? [])
  // Patch-mode shouldn't collapse (reviewer cannot delete modules). But sanity check anyway.
  if (before.sub_modules >= 10 && afterCheck.sub_modules < before.sub_modules * 0.5) {
    throw new Error(`COLLAPSE in ${opts.label}: sub-modules ${before.sub_modules} → ${afterCheck.sub_modules} (check raw)`)
  }
  const after = summarise(parsed.modules ?? [])
  const dlt = delta(before, after)
  console.error(`[chain] ${opts.label} done in ${(result.latency_ms / 1000).toFixed(1)}s — Δ: ${JSON.stringify(dlt)}`)
  logAction({
    step: opts.label,
    model: opts.model,
    latency_ms: result.latency_ms,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    before,
    after,
    delta: dlt,
  })
  return { design: parsed, summary: after, latency_ms: result.latency_ms }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: serial-design-chain-v2.tsx <brief.md> <out-dir>')
    process.exit(1)
  }
  const briefPath = resolve(args[0])
  const outDir = resolve(args[1])
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  // Shared logger attach (handles dir create + file truncate).
  attachActionLogger(outDir)

  const brief = readFileSync(briefPath, 'utf-8')
  console.error(`[chain] brief: ${briefPath} (${brief.length} chars)`)
  logAction({ step: 'init', brief_chars: brief.length, brief_path: briefPath })

  // ── Save the original brief (Phase 0 refinement loop, Tristan 2026-05-15)
  writeFileSync(resolve(outDir, '0-original-brief.md'), brief)

  // Parse + classify the original
  const t0 = Date.now()
  const parsedResultOriginal = await runBriefParsing(brief)
  if (!parsedResultOriginal.ok || !parsedResultOriginal.data) throw new Error('Brief parsing failed')
  logAction({ step: 'parse_brief', model: 'gemini-3.1-pro', latency_ms: Date.now() - t0 })
  writeFileSync(resolve(outDir, '1-parsed-brief-original.json'), JSON.stringify(parsedResultOriginal.data, null, 2))

  const classificationOriginal = classifyProduct(brief)
  console.error(`[chain] classification: ${classificationOriginal.productClass} (confidence=${classificationOriginal.confidence})`)
  logAction({ step: 'classify', product_class: classificationOriginal.productClass, confidence: classificationOriginal.confidence })

  // ── Phase 0 — brief refinement loop (Tristan 2026-05-15)
  // Auto-revise non-viable briefs along the lowest-priority relaxation path,
  // up to MAX_BRIEF_ITERS iterations. Each iter: plausibility critic → pick
  // most-negotiable revision per RELAXATION_PRIORITY → rewrite brief → re-parse.
  // Cap at 100× per single revision (halts if a revision would relax beyond).
  // Full revision history saved to state for transparent rendering in §1.
  const MAX_BRIEF_ITERS: number = 3
  const MAX_RELAX_FACTOR = 100
  const apiKeyEarly = process.env.OPENROUTER_API_KEY ?? ''

  function parseRatio(raw: string): number | null {
    if (!raw) return null
    const m = String(raw).match(/(\d[\d,]*\.?\d*)\s*[x×]/i)
    if (!m) return null
    const n = parseFloat(m[1].replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }

  let currentBriefText = brief
  let currentParsed: any = parsedResultOriginal.data
  let currentProductClass = classificationOriginal.productClass
  const revisionHistory: any[] = []
  let plausibility: BriefPlausibilityVerdict | null = null
  let briefIter = 0

  while (briefIter < MAX_BRIEF_ITERS) {
    const tPlaus = Date.now()
    console.error(`\n[chain] brief refinement iter ${briefIter}: running plausibility critic ...`)
    plausibility = await generateBriefPlausibilityCritic({ brief: currentBriefText, parsedBrief: currentParsed, productClass: currentProductClass, apiKey: apiKeyEarly })
    console.error(`[chain] brief plausibility iter ${briefIter}: possible=${plausibility.possible} (confidence=${plausibility.confidence}, ${plausibility.contradictions.length} contradiction${plausibility.contradictions.length === 1 ? '' : 's'}, ${plausibility.proposed_revisions?.length ?? 0} revisions proposed, ${((Date.now() - tPlaus) / 1000).toFixed(1)}s)`)
    for (const c of plausibility.contradictions) {
      console.error(`  ✗ ${c.constraint}: brief=${c.brief_value}, floor=${c.physical_floor}, ratio=${c.ratio} — ${c.reasoning}`)
    }
    writeFileSync(resolve(outDir, `2-brief-plausibility-iter${briefIter}.json`), JSON.stringify(plausibility, null, 2))
    logAction({ step: `brief_plausibility_iter${briefIter}`, model: FLASH_LITE, latency_ms: Date.now() - tPlaus, possible: plausibility.possible, contradiction_count: plausibility.contradictions.length, revision_count: plausibility.proposed_revisions?.length ?? 0 })

    const hardContradictions = plausibility.contradictions.filter(c => {
      const r = parseRatio(c.ratio)
      return r != null && r > 5.0
    })

    // Deterministic threshold guard: sub-5× contradictions surface as warnings only
    if (!plausibility.possible && hardContradictions.length === 0) {
      console.error(`[chain] brief plausibility iter ${briefIter}: critic flagged possible=false but NO contradiction >5× — treating as PASS (sub-5× warnings retained for the reader).`)
      plausibility.possible = true
      plausibility.notes = `${plausibility.notes ?? ''} [downgraded by deterministic 5× guard]`
      break
    }

    // Viable as-is (or after revision converged)
    if (plausibility.possible && hardContradictions.length === 0) {
      if (briefIter > 0) console.error(`[chain] brief refinement: brief is now viable after ${briefIter} revision${briefIter === 1 ? '' : 's'}`)
      break
    }

    // Hard contradictions remain — need a revision
    if (briefIter >= MAX_BRIEF_ITERS - 1) {
      console.error(`[chain] brief refinement: hit MAX_BRIEF_ITERS=${MAX_BRIEF_ITERS} with hard contradictions still present; halting`)
      break
    }

    const { chosen, alternatives } = pickRevisionByPriority(plausibility)
    if (!chosen) {
      console.error(`[chain] brief refinement iter ${briefIter}: hard contradictions present but critic emitted no proposed_revisions; halting`)
      break
    }
    // Per-revision cap. We always log the LLM's proposal to revisionHistory
    // (so it surfaces in the renderer for human review) but only set
    // applied=true after a successful rewrite + re-parse below. The cap-trip /
    // rewrite-fail / re-parse-fail branches leave applied=false so the
    // renderer can distinguish proposed-but-not-applied from actually-applied.
    const factor = parseRelaxFactor(chosen.relax_factor)
    const factorBlocked = factor != null && factor > MAX_RELAX_FACTOR
    if (factorBlocked) {
      console.error(`[chain] brief refinement iter ${briefIter}: chosen revision ${chosen.target_constraint} relax_factor ${factor}× exceeds MAX_RELAX_FACTOR=${MAX_RELAX_FACTOR}×; halting with revision logged for human review`)
    }

    const entry: BriefRevisionEntry = {
      iter: briefIter,
      target_constraint: chosen.target_constraint,
      original_value: chosen.current_value,
      revised_value: chosen.proposed_value,
      relax_factor: chosen.relax_factor,
      rationale: chosen.rationale + (factorBlocked ? ' [BLOCKED: exceeds 100× per-revision cap; surfaced for human review]' : ''),
      contradictions_resolved: (chosen.resolves_contradiction_indexes ?? []).map((i: number) => plausibility?.contradictions[i]?.constraint ?? '?'),
      alternatives_considered: alternatives.map((a: any) => ({
        target_constraint: a.target_constraint,
        proposed_value: a.proposed_value,
        relax_factor: a.relax_factor,
        rationale: a.rationale,
      })),
      applied: false,
    }
    revisionHistory.push(entry)

    if (factorBlocked) break

    console.error(`[chain] brief refinement iter ${briefIter}: applying revision ${chosen.target_constraint}: ${chosen.current_value} → ${chosen.proposed_value} (${chosen.relax_factor}); ${alternatives.length} alternative${alternatives.length === 1 ? '' : 's'} surfaced for reader`)

    const tRewrite = Date.now()
    const rewritten = await rewriteBriefWithRevision({ briefText: currentBriefText, revision: chosen, apiKey: apiKeyEarly })
    logAction({ step: `brief_rewrite_iter${briefIter}`, model: FLASH_LITE, latency_ms: Date.now() - tRewrite, ok: rewritten != null })
    if (!rewritten) {
      entry.rationale = entry.rationale + ' [BLOCKED: Flash-Lite rewriter returned null]'
      console.error(`[chain] brief refinement iter ${briefIter}: rewriter failed; halting with the revision logged`)
      break
    }

    writeFileSync(resolve(outDir, `0-revised-brief-iter${briefIter + 1}.md`), rewritten)

    // Re-parse + re-classify on the revised brief
    const reParseT = Date.now()
    const reParsed = await runBriefParsing(rewritten)
    logAction({ step: `re_parse_brief_iter${briefIter + 1}`, latency_ms: Date.now() - reParseT, ok: reParsed.ok })
    if (!reParsed.ok || !reParsed.data) {
      entry.rationale = entry.rationale + ' [BLOCKED: re-parse of revised brief failed]'
      console.error(`[chain] brief refinement iter ${briefIter}: re-parse failed on revised brief; halting`)
      break
    }
    const reClass = classifyProduct(rewritten)

    currentBriefText = rewritten
    currentParsed = reParsed.data
    currentProductClass = reClass.productClass
    entry.applied = true
    briefIter++
  }

  // Phase 0 complete. Build the BriefBlock + decide whether to continue or halt.
  // was_revised is true if ANY proposal was logged (so the renderer surfaces
  // the notice page). revised_text + parsed_revised reflect what the chain
  // will actually use downstream — only populated when at least one revision
  // was actually applied, otherwise null so consumers don't read stale aliases.
  const wasRevised = revisionHistory.length > 0
  const anyApplied = revisionHistory.some(r => r.applied)
  const appliedCount = revisionHistory.filter(r => r.applied).length
  const briefBlock = {
    original_text: brief,
    parsed_original: parsedResultOriginal.data,
    revised_text: anyApplied ? currentBriefText : null,
    parsed_revised: anyApplied ? currentParsed : null,
    revision_history: revisionHistory,
    was_revised: wasRevised,
  }
  writeFileSync(resolve(outDir, '2-brief-block.json'), JSON.stringify(briefBlock, null, 2))
  logAction({ step: 'brief_block', was_revised: wasRevised, any_applied: anyApplied, applied_count: appliedCount, proposed_count: revisionHistory.length, iters_used: briefIter })

  if (wasRevised) {
    const status = anyApplied
      ? `APPLIED — ${appliedCount}/${revisionHistory.length} revision${revisionHistory.length === 1 ? '' : 's'} applied`
      : `BLOCKED — ${revisionHistory.length} revision${revisionHistory.length === 1 ? '' : 's'} proposed, none applied`
    console.error(`\n[chain] === BRIEF REFINEMENT ${status} ===`)
    for (const r of revisionHistory) {
      const tag = r.applied ? '✓ applied' : '✗ blocked'
      console.error(`  iter ${r.iter} [${tag}]: ${r.target_constraint} ${r.original_value} → ${r.revised_value} (${r.relax_factor}) — ${r.rationale.slice(0, 100)}`)
    }
    console.error(`\nRevision history + alternatives surfaced in §1 of the rendered PDF.`)
  }

  // Final halt check — if last plausibility still has hard contradictions, exit
  if (plausibility) {
    const finalHard = plausibility.contradictions.filter(c => {
      const r = parseRatio(c.ratio)
      return r != null && r > 5.0
    })
    if (!plausibility.possible && finalHard.length > 0) {
      console.error(`\n[chain] === FATAL === brief refinement loop exhausted ${MAX_BRIEF_ITERS} iter${MAX_BRIEF_ITERS === 1 ? '' : 's'} without convergence.`)
      for (const c of finalHard) console.error(`  ✗ ${c.constraint}: brief=${c.brief_value}, floor=${c.physical_floor}, ratio=${c.ratio}`)
      console.error(`\nFinal cumulative revisions:`)
      for (const h of revisionHistory) console.error(`  iter ${h.iter}: ${h.target_constraint} ${h.original_value} → ${h.revised_value}`)
      console.error(`\nReview ${outDir}/2-brief-block.json (alternatives_considered) and re-run with a different lock.`)
      process.exit(2)
    }
  }

  // Working brief for the rest of the chain
  const parsedResult = { ok: true, data: currentParsed }
  const productClass = currentProductClass
  const classification = { productClass: currentProductClass, confidence: classificationOriginal.confidence }
  writeFileSync(resolve(outDir, '1-parsed-brief.json'), JSON.stringify(parsedResult.data, null, 2))

  // ── G0 deterministic physics ledger (Task #253, 2026-05-19): runs AFTER
  // brief refinement converges and BEFORE the LLM physics-critic. Pure
  // first-principles conservation-of-energy / mass / cost-floor / power-
  // density / payload-envelope checks against `class-floors.ts`. Zero LLM
  // tokens, sub-millisecond. Catches adversarial briefs that LLM critics
  // can be talked into accepting (perpetual-motion at £0, etc).
  //
  // Verdict written to state.physicsLedger. HALT verdicts are surfaced to
  // the reader via the renderer; the chain continues so the user sees what
  // the ledger caught rather than getting a silent failure.
  let physicsLedger: any = null
  const tLedger = Date.now()
  try {
    const ledgerResult = await runPhysicsLedger(currentBriefText, parsedResult.data, productClass)
    if (ledgerResult.ok) {
      physicsLedger = ledgerResult.data
      const v = physicsLedger.verdict
      const hardCount = (physicsLedger.violations ?? []).filter((x: any) => x.severity === 'hard').length
      const softCount = (physicsLedger.violations ?? []).filter((x: any) => x.severity === 'soft').length
      console.error(`[chain] G0 physics ledger: ${v} (hard=${hardCount} soft=${softCount}; ${((Date.now() - tLedger) / 1000).toFixed(2)}s)`)
      logAction({ step: 'physics_ledger', verdict: v, hard: hardCount, soft: softCount, latency_ms: Date.now() - tLedger, ok: true })
    } else {
      console.error(`[chain] G0 physics ledger returned !ok (continuing without)`)
      logAction({ step: 'physics_ledger', ok: false })
    }
  } catch (err) {
    console.error(`[chain] G0 physics ledger threw: ${(err as Error).message}; continuing without`)
    logAction({ step: 'physics_ledger', ok: false, error: String(err).slice(0, 200), latency_ms: Date.now() - tLedger })
  }

  // ── G1b Compliance Gate (Tristan v5 directive 2026-05-19): regulatory
  // standards check vs class-standards.ts. Catches missing-mandatory + multi-
  // jurisdiction-scope conflicts. Deterministic, zero LLM cost. Writes
  // state.complianceGate which the renderer's manual-review badge collector
  // reads.
  let complianceGate: ComplianceGateResult | null = null
  const tCompliance = Date.now()
  try {
    complianceGate = runComplianceGate(parsedResult.data, productClass, currentBriefText)
    const cg = complianceGate
    console.error(`[chain] G1b compliance: ${cg.verdict} — ${cg.mandatory_covered}/${cg.mandatory_total} mandatory covered for ${cg.jurisdictions_detected.join('+') || '(no jurisdiction detected)'}`)
    if (cg.conflicts.length > 0) {
      for (const c of cg.conflicts.slice(0, 5)) console.error(`  ⚠ ${c.standard_code} (${c.conflict_type}): ${c.reason.slice(0, 120)}`)
    }
    logAction({ step: 'compliance_gate', verdict: cg.verdict, mandatory_total: cg.mandatory_total, mandatory_covered: cg.mandatory_covered, conflict_count: cg.conflicts.length, latency_ms: Date.now() - tCompliance, ok: true })
  } catch (err) {
    console.error(`[chain] G1b compliance gate threw: ${(err as Error).message}; continuing without`)
    logAction({ step: 'compliance_gate', ok: false, error: String(err).slice(0, 200), latency_ms: Date.now() - tCompliance })
  }

  const t1 = Date.now()
  const researchResult = await runResearchSynthesis(parsedResult.data, productClass)
  const research = researchResult.ok ? researchResult.data : null
  logAction({ step: 'research', model: 'mimo-v2.5-pro', latency_ms: Date.now() - t1, ok: researchResult.ok })
  writeFileSync(resolve(outDir, '3-research.json'), JSON.stringify(research, null, 2))

  // Phase C registry pre-seed REVERTED 2026-05-15. Reuse of registry entries
  // is now an OFFLINE concern handled by scripts/harvest-registry-candidates.tsx.

  // Principle 1+2 (Tristan 2026-05-15): LLMs DO NOT emit summary numbers.
  // The headline (annual throughput, capacity, efficiency) is computed
  // DETERMINISTICALLY from the design components AFTER Phase 2 closes —
  // it's a CONSEQUENCE of the design, not an input to it. We no longer call
  // an LLM here. Reviewers design from brief constraints + research alone.
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  let keyMetrics: KeyMetrics | null = null  // populated AFTER Phase 2 by headline-deriver

  // ── Phase 1: Generator
  console.error(`\n[chain] STEP 4: Generator (Gemini 3.1 Pro) ...`)
  const keyMetricsBlock = formatKeyMetricsBlock(keyMetrics)
  const genUser = `PRODUCT BRIEF:
${currentBriefText}

PARSED CONSTRAINTS:
${JSON.stringify(parsedResult.data)}

RESEARCH SYNTHESIS:
${research ? JSON.stringify(research) : '(not available)'}
${keyMetricsBlock}
Generate the full engineering decomposition (brief_overview_prose + modules + sub-modules + cross_module_grammar_links + excluded_modules + rationale_excluded). Return ONLY JSON.`
  const genResult = await callLlm({
    model: GEMINI_3_1_PRO,
    system: generatorSystem(),
    user: genUser,
    maxTokens: 150_000,
    timeoutMs: 1_500_000,
  })
  writeFileSync(resolve(outDir, '4-generator.raw.txt'), genResult.text)
  let design = await parseJson(genResult.text, { stage: 'generator', model: GEMINI_3_1_PRO })
  writeFileSync(resolve(outDir, '4-generator.json'), JSON.stringify(design, null, 2))
  const sumGen = summarise(design.modules ?? [])
  console.error(`[chain] Generator: ${sumGen.modules} modules, ${sumGen.sub_modules} sub-modules, ${sumGen.words} words, ${sumGen.grammar_links} grammar_links, ${sumGen.overview_chars} chars (${(genResult.latency_ms/1000).toFixed(1)}s)`)
  logAction({ step: 'generator', model: GEMINI_3_1_PRO, latency_ms: genResult.latency_ms, tokens_in: genResult.tokens_in, tokens_out: genResult.tokens_out, summary: sumGen })

  // ── Propagate brief constraints into design derived_parameters
  // (Tristan directive 2026-05-15): gates need anchors. Without this, the
  // cost_ceiling + mass_budget gates are no-op because the LLMs don't reliably
  // emit unit_cost_ceiling_gbp / max_mass_kg into derived_parameters. iter-49d
  // had BoM cost 79% over and mass 25% over — both gates silent.
  const propagation = propagateBriefConstraintsToDesign(design, parsedResult.data)
  if (propagation.written.length > 0) {
    console.error(`[chain] brief constraints propagated to ${propagation.target_module}.derived_parameters: ${propagation.written.join(', ')}`)
  } else {
    console.error(`[chain] no brief constraints to propagate (none parsed)`)
  }
  logAction({ step: 'propagate_constraints', target_module: propagation.target_module, written: propagation.written })

  // ── Phase 1: Reviewers (identical template)
  // Sprint 2D (Tristan 2026-05-20): each reviewer step has a fallback
  // model in a different vendor family so a transient model failure
  // (R2 GLM-5.1 truncated mid-stream in iter-9, KIMI K2.6 intermittently
  // unavailable per MEMORY) doesn't kill the chain. The fallback uses a
  // peer reviewer's model — same review-pass purpose, different
  // tokeniser / JSON-emission style. Each fallback is the model that
  // sits in the OTHER half of the reviewer pool so we don't both fail
  // for a shared infra issue.
  const r1 = await runReviewerStep({ label: 'STEP 5: R1 Grok 4.3', model: GROK_4_3, fallbackModel: QWEN_3_6_MAX, brief: currentBriefText, parsedBrief: parsedResult.data, research, currentDesign: design, rawDumpPath: resolve(outDir, '5-r1-grok.raw.txt'), keyMetrics })
  design = r1.design
  writeFileSync(resolve(outDir, '5-r1-grok.json'), JSON.stringify(design, null, 2))

  const r2 = await runReviewerStep({ label: 'STEP 6: R2 GLM-5.1', model: GLM_5_1, fallbackModel: GROK_4_3, brief: currentBriefText, parsedBrief: parsedResult.data, research, currentDesign: design, rawDumpPath: resolve(outDir, '6-r2-glm.raw.txt'), keyMetrics })
  design = r2.design
  writeFileSync(resolve(outDir, '6-r2-glm.json'), JSON.stringify(design, null, 2))

  const r3 = await runReviewerStep({ label: 'STEP 7: R3 Qwen 3.6 Max', model: QWEN_3_6_MAX, fallbackModel: GLM_5_1, brief: currentBriefText, parsedBrief: parsedResult.data, research, currentDesign: design, rawDumpPath: resolve(outDir, '7-r3-qwen.raw.txt'), keyMetrics })
  design = r3.design
  writeFileSync(resolve(outDir, '7-r3-haiku.json'), JSON.stringify(design, null, 2))

  // ── STEP 7.5: Physics critic (post-R3, pre-R4).
  // Structural gates check wiring, not physics. The critic does the math the
  // chain doesn't — battery vs endurance, heatsink vs dissipation, cable vs
  // current. Placed AFTER R3 enrichment is done (so the numbers exist to
  // critique) and BEFORE R4 grounded fact-check (so R4 can web-verify the
  // critic's high-severity flags). Honesty rule enforced inside the module:
  // findings with confidence=unknown route to "manual review", never to
  // fabricated values. Fail-soft — chain continues if critic errors.
  console.error(`\n[chain] STEP 7.5: physics critic (post-R3, pre-R4)`)
  const tCritic = Date.now()
  let critique: CritiqueReport | null = null
  try {
    critique = await runPhysicsCritic({
      modules: design.modules ?? [],
      brief: parsedResult.data,
      keyMetrics,
      productClass,
      apiKey,
    })
    if (critique) {
      console.error(`[chain] critic scored: brief=${critique.scores.brief_to_design_fidelity}/10 phys=${critique.scores.engineering_plausibility}/10 coh=${critique.scores.internal_coherence}/10 part=${critique.scores.part_realism}/10 hon=${critique.scores.honesty_signal}/10 (${critique.latency_ms}ms)`)
      console.error(`[chain] critic headline: ${critique.headline}`)
      const highSev = critique.issues.filter(i => i.severity === 'high')
      const medSev = critique.issues.filter(i => i.severity === 'med')
      console.error(`[chain] critic issues: ${highSev.length} high, ${medSev.length} med, ${critique.issues.length} total`)
      for (const i of [...highSev, ...medSev].slice(0, 6)) console.error(`  ✗ [${i.severity}/${i.confidence}] ${i.dimension} @ ${i.where}: ${i.issue.slice(0, 160)}`)
      writeFileSync(resolve(outDir, '7-5-physics-critique.json'), JSON.stringify(critique, null, 2))
    } else {
      console.error(`[chain] physics critic returned null (likely API/parse error); continuing without`)
    }
  } catch (err) {
    console.error(`[chain] physics critic threw: ${(err as Error).message}; continuing without`)
  }
  logAction({ step: 'physics_critic', latency_ms: Date.now() - tCritic, ok: critique !== null, scores: critique?.scores, issue_count: critique?.issues.length ?? 0 })

  // Build R4 systemAppend including critic findings. NOTE: R4 is LM-only,
  // not actually grounded. Verified 2026-05-16 — OpenRouter ignores the
  // grounding flag for Gemini Flash-Lite. R4 reviews from training-data
  // knowledge only. To get real web grounding, route through Google's
  // native Gemini API (the GEMINI_API_KEY escape valve, not yet wired).
  const criticAppend = critique && critique.issues.length > 0
    ? `\n\nPHYSICS CRITIC FINDINGS (from post-R3 review by an independent reviewer — verify each against datasheets / first-principles):\n${critique.issues
        .filter(i => i.severity === 'high' || i.severity === 'med')
        .slice(0, 12)
        .map((i, n) => `${n + 1}. [${i.severity}/${i.confidence} confidence] ${i.dimension} @ ${i.where}: ${i.issue}${i.suggested_check ? ` (suggested check: ${i.suggested_check})` : ''}`)
        .join('\n')}\n\nYour patches should address as many of these as you can verify. For findings with confidence=unknown you are NOT required to invent a value — leave the spec as-is.`
    : ''

  // 2026-05-19 audit gap #11: removed misleading `groundWithGoogleSearch: true`.
  // OpenRouter ignores the flag for Flash-Lite (see callLlm comment at :228-234
  // — option kept as a no-op stub for backwards compat). Leaving it on R4 made
  // readers think the reviewer was web-grounded when it wasn't. Removed.
  // Real grounding requires the GEMINI_API_KEY escape valve (not yet wired).
  const r4 = await runReviewerStep({
    label: 'STEP 8: R4 Flash-Lite review',  // LM-only, not grounded
    model: FLASH_LITE,
    fallbackModel: FLASH_3_5,  // Sprint 2D fallback
    systemAppend: R4_FACTCHECK_APPEND + criticAppend,
    thinkingLevel: 'high',
    brief: currentBriefText, parsedBrief: parsedResult.data, research, currentDesign: design,
    rawDumpPath: resolve(outDir, '8-r4-flashlite.raw.txt'),
    keyMetrics,
  })
  design = r4.design
  writeFileSync(resolve(outDir, '8-r4-flashlite.json'), JSON.stringify(design, null, 2))

  // ── Canonical product_class override (Task #254, 2026-05-19 council
  // unanimous Option B). The LLM Generator + reviewers emit free-form
  // product_class strings like `heat_pump_1_6kW_r290` (literal brief tokens).
  // Three downstream consumers (K10 reference graph, deployment envelopes,
  // Engine B PRODUCT_CLASS_REFERENCE_OVERRIDES) need canonical slugs from a
  // closed set. Architectural principle (Kimi K2.6): "LLMs must NEVER emit
  // values for keyed identifiers (foreign keys, enums, slugs, lookup keys).
  // The system — not the model — owns the key space."
  //
  // Run AFTER all 4 reviewers (Grok 4.3 council seat: any reviewer step can
  // re-mutate design.product_class via patches; running once after them all
  // is the safe choice). Preserves the LLM's descriptive name as
  // `productClassDescription` (non-load-bearing — for UI / logging only,
  // never consumed by lookup logic).
  if (design && currentProductClass && design.product_class !== currentProductClass) {
    const llmEmitted = String(design.product_class ?? '')
    ;(design as any).productClassDescription = llmEmitted  // preserve for human readers
    design.product_class = currentProductClass
    console.error(`[chain] canonical product_class OVERRIDE: "${llmEmitted}" → "${currentProductClass}" (deterministic classifier wins)`)
    logAction({ step: 'canonical_product_class_override', llm_emitted: llmEmitted, canonical: currentProductClass, overridden: true })
  } else {
    logAction({ step: 'canonical_product_class_override', llm_emitted: String(design?.product_class ?? ''), canonical: currentProductClass, overridden: false })
  }

  // ── Physics Repair Loop (Tristan 2026-05-20 directive)
  //
  // The chain's job is to deliver a WORKING design, not just flag broken ones.
  // Before this stage: physics critic (STEP 7.5) emits HIGH findings; R4 (STEP 8)
  // gets them as advisory text but rarely acts because findings are prose not
  // structured patches and R4 is the cheapest reviewer. Phase 2 repair loop only
  // fires on gate failures, not physics findings. Result: chain ships broken
  // designs with DO-NOT-PROCURE banner (iter-8 fix).
  //
  // After this stage: each HIGH-severity physics finding is dispatched to a
  // STRONG model (Gemini 3.1 Pro — same as Generator) with explicit MANDATORY
  // repair directive and the suggested_check from the critic. Model emits
  // structured patches (replace_modifier, edit_word, add_word_to_sub_module,
  // set_derived_parameter) that swap out the wrong components. Loops until
  // plausibility ≥ 7 OR HIGH count = 0 OR max iters (4) reached.
  //
  // Universal: works for every product class. Class-agnostic prose findings,
  // model-side judgment on which parts to swap.
  let physicsRepairResult: any = null
  const tPhysRepair = Date.now()
  try {
    const hasHighSev = critique && (critique.issues ?? []).some((i: any) => {
      const s = String(i?.severity ?? '').toLowerCase()
      return s === 'high' || s === 'critical' || s === 'halt'
    })
    const lowPlaus = critique && (critique.scores?.engineering_plausibility ?? 10) <= 5
    if (critique && (hasHighSev || lowPlaus)) {
      const { runPhysicsRepairLoop } = await import('../src/lib/pdf-engine-v2/radical/physics-repair')
      physicsRepairResult = await runPhysicsRepairLoop({
        modules: design.modules ?? [],
        crossLinks: (design as any).cross_module_grammar_links ?? [],
        initialCritique: critique,
        brief: parsedResult.data,
        keyMetrics,
        productClass: currentProductClass,
        apiKey,
        // defaults: repairModel=Gemini 3.1 Pro, critiqueModel=Gemini 3.5 Flash, maxIters=4, plausibilityTarget=7
      })
      if (physicsRepairResult?.final_critique) {
        critique = physicsRepairResult.final_critique
      }
      console.error(`[chain] physics repair: ${physicsRepairResult.iters} iter(s); HIGH ${physicsRepairResult.initial_high_count}→${physicsRepairResult.final_high_count}; plausibility ${physicsRepairResult.initial_plausibility}→${physicsRepairResult.final_plausibility}; patches ${physicsRepairResult.patches_applied_total}`)
      for (const d of (physicsRepairResult.iter_diagnostics ?? [])) {
        console.error(`  iter ${d.iter}: proposed ${d.patches_proposed} applied ${d.patches_applied} | HIGH ${d.high_in}→${d.high_out} plaus ${d.plausibility_in}→${d.plausibility_out}${d.unfixable_reason ? ' | ' + d.unfixable_reason : ''}`)
      }
    } else {
      console.error(`[chain] physics repair: skipped (no HIGH findings, plausibility ${critique?.scores?.engineering_plausibility ?? '?'}/10)`)
    }
  } catch (err) {
    console.error(`[chain] physics repair threw: ${(err as Error).message}; continuing without`)
  }
  logAction({
    step: 'physics_repair',
    latency_ms: Date.now() - tPhysRepair,
    ran: !!physicsRepairResult?.ran,
    iters: physicsRepairResult?.iters ?? 0,
    initial_high: physicsRepairResult?.initial_high_count ?? 0,
    final_high: physicsRepairResult?.final_high_count ?? 0,
    initial_plausibility: physicsRepairResult?.initial_plausibility,
    final_plausibility: physicsRepairResult?.final_plausibility,
    patches_applied: physicsRepairResult?.patches_applied_total ?? 0,
  })

  // ── End-of-Phase-1 normalisation pass (universal, 2026-05-15).
  // The 4 reviewers each emit modifiers in their own formatting (× vs x, "IP65"
  // vs "IP65 protection"), so by the time R4 returns, words can carry 2-3
  // cosmetic-dupe modifiers per kind. iter-53 VF had 51 such components.
  // Collapse them up-front so Phase 2 gates only fire on real spec conflicts.
  const dedupResult = dedupAllModifiers(design.modules ?? [])
  if (dedupResult.modifiers_collapsed > 0) {
    console.error(`[chain] modifier dedup: collapsed ${dedupResult.modifiers_collapsed} cosmetic-dupe modifier(s) across ${dedupResult.components_cleaned} component(s)`)
  }
  logAction({ step: 'modifier_dedup_pre_phase2', components_cleaned: dedupResult.components_cleaned, modifiers_collapsed: dedupResult.modifiers_collapsed })

  // Pre-apply deterministic sub-module prose to any sub-module whose
  // LLM-emitted english_sentence drops words from words[]. Without this the
  // sub_module_prose_covers_words gate fires every Phase 2 iter and the repair
  // LLM has to rewrite each sentence — iter-53 VF hit 36/51 violations.
  const proseResult = ensureSubmoduleProseCoversWords(design.modules ?? [])
  if (proseResult.sub_modules_rewritten > 0) {
    console.error(`[chain] sub-module prose pre-fill: rewrote ${proseResult.sub_modules_rewritten}/${proseResult.total_sub_modules} sub-modules (LLM english_sentence dropped words; deterministic prose covers all)`)
  }
  logAction({ step: 'submodule_prose_pre_phase2', sub_modules_rewritten: proseResult.sub_modules_rewritten, total_sub_modules: proseResult.total_sub_modules })

  // ── G0.5 Brief Target Reconciliation (Tristan firestorm directive 2026-05-19):
  // catches the catastrophic class where Generator emits a design at the wrong
  // SCALE (e.g. 1 kW design against 8 kW brief). Discovered in council review
  // of morning chain 92cdda58. Runs post-Phase-1, pre-Phase-2 — if HALT, no
  // amount of Phase 2 patching can rescue the scale, so we exit early rather
  // than burn 18 iters of repair LLM calls + Engine B/C/D + render budget.
  // Deterministic, zero LLM cost.
  let reconciliation: ReconciliationResult | null = null
  const tRecon = Date.now()
  try {
    reconciliation = runBriefTargetReconciliation(parsedResult.data, design)
    const r = reconciliation
    console.error(`[chain] G0.5 brief-target-reconciliation: ${r.verdict} — ${r.comparisons_made} comparisons, ${r.mismatches.length} mismatch${r.mismatches.length === 1 ? '' : 'es'}, ${r.unable_to_compare.length} unable_to_compare`)
    for (const m of r.mismatches) console.error(`  ${m.severity === 'halt' ? '✕' : '⚠'} ${m.target_field}: ${m.note}`)
    logAction({ step: 'brief_target_reconciliation', verdict: r.verdict, comparisons: r.comparisons_made, mismatches: r.mismatches.length, halt_count: r.mismatches.filter(m => m.severity === 'halt').length, latency_ms: Date.now() - tRecon, ok: true })

    if (r.verdict === 'HALT') {
      // Persist what we have to state.json so the partial run is auditable, then exit.
      const haltState = {
        projectId: 'chain-v2-' + Date.now(),
        parsedBrief: parsedResult.data,
        moduleDecomposition: design,
        complianceGate: complianceGate ?? null,
        physicsLedger,
        physicsCritique: critique,
        briefTargetReconciliation: r,
        brief: briefBlock,
        acceptanceStatus: 'not_accepted',
        haltReason: `G0.5 brief-target-reconciliation HALT: design scale materially differs from brief — Phase 2 cannot rescue. See briefTargetReconciliation.mismatches.`,
        savedAt: new Date().toISOString(),
      }
      const haltPath = resolve(outDir, 'state.json')
      writeFileSync(haltPath, JSON.stringify(haltState, null, 2))
      console.error(`\n[chain] === FATAL G0.5 === Brief-vs-design scale mismatch; exiting code 3. Re-submit the brief — Generator misread the target. State.json snapshot at ${haltPath}.`)
      logAction({ step: 'fatal_g05_halt', reason: 'brief_target_reconciliation_halt', mismatches: r.mismatches })
      process.exit(3)
    }
  } catch (err) {
    console.error(`[chain] G0.5 reconciliation threw: ${(err as Error).message}; continuing without`)
    logAction({ step: 'brief_target_reconciliation', ok: false, error: String(err).slice(0, 200) })
  }

  // ── Phase 2: Translate + gates + repair loop
  console.error(`\n[chain] === PHASE 2: Translate + Gates + Repair ===`)
  // apiKey was declared in Phase D-prep above; reuse it here.
  // Phase 2 cap raised from 9 to 18 (Tristan directive 2026-05-16). Background:
  // 14-gate system + structural gates (spatial_position_complete,
  // cross_module_required_links, cell_discharge_rate_within_nameplate) need
  // more iters to converge on non-BESS classes — iter-62 showed 8/10 classes
  // still improving at the old cap of 9. 18 gives roughly 2× headroom which
  // brings convergence to within reach for most chains. Cost: ~£0.20/run worst
  // case (each extra iter is ~1 repair LLM call).
  const PHASE2_MAX_ITERS = 18
  let repairIter = 0
  let allPassed = false
  // Track the FINAL failed gate set so we can route unrepaired structural
  // gates to design-decisions after the loop bails.
  let finalFailedGates: any[] = []
  // 2026-05-19 fix M2 (audit-found): track the final arithmetic + grammar
  // gate run so we can persist them as state.grammarVerdicts. The chain
  // previously wrote state.grammarVerdicts: null, hiding all per-gate detail
  // from the renderer's gate-verdict panel.
  let finalArith: ReturnType<typeof runArithmeticGates> | null = null
  let finalGrammar: ReturnType<typeof runGrammarGates> | null = null
  let finalIters = 0
  while (repairIter < PHASE2_MAX_ITERS && !allPassed) {
    const t = translate(design.modules ?? [], design.cross_module_grammar_links ?? [])
    // 2026-05-20 iter-9 Step 3: stamp brief constraints onto the translated
    // modules array so the briefConstraintPropagationGate can compare
    // derived_parameters against brief.target_performance / max_mass_kg /
    // unit_cost_ceiling. The gate reads (modules as any).__briefConstraints.
    ;(t.modules as any).__briefConstraints = parsedResult.data?.constraints ?? null
    const arith = runArithmeticGates(t.modules)
    const grammar = runGrammarGates(t.modules, t.crossLinks, productClass)
    finalArith = arith
    finalGrammar = grammar
    finalIters = repairIter
    const failed = [...arith.results, ...grammar.results].filter(r => !r.passed && r.score < 0)
    finalFailedGates = failed
    console.error(`[chain] Phase 2 iter ${repairIter}: arith ${arith.passed} pass / ${arith.failed} fail; grammar ${grammar.passed} pass / ${grammar.failed} fail; total score ${arith.total_score + grammar.total_score}`)
    for (const r of failed) console.error(`  ✗ [${r.name}] ${r.reasons.join(' | ')}`)
    logAction({
      step: `phase2_iter_${repairIter}`,
      arithmetic: { passed: arith.passed, failed: arith.failed, total_score: arith.total_score, failures: arith.results.filter(r => !r.passed && r.score < 0) },
      grammar: { passed: grammar.passed, failed: grammar.failed, total_score: grammar.total_score, failures: grammar.results.filter(r => !r.passed && r.score < 0) },
    })

    if (failed.length === 0) { allPassed = true; break }
    if (repairIter >= PHASE2_MAX_ITERS - 1) { console.error(`[chain] Phase 2: hit max repair iterations (${PHASE2_MAX_ITERS}); bailing`); break }

    const rep = await repair({
      modules: design.modules,
      crossLinks: design.cross_module_grammar_links ?? [],
      failedGates: failed,
      apiKey,
      timeoutMs: 600_000,
      extraContext: computeDensityTargets(design),
    })
    if (rep.unfixable) {
      console.error(`[chain] Phase 2: repair LLM returned unfixable: ${rep.reason}`)
      logAction({ step: `phase2_repair_${repairIter}`, unfixable: true, reason: rep.reason })
      break
    }
    const applied = applyPatches(design.modules, design.cross_module_grammar_links ?? (design.cross_module_grammar_links = []), rep.patches)
    console.error(`[chain] Phase 2 iter ${repairIter}: applied ${applied.applied} patches, skipped ${applied.skipped}, state_changed=${applied.state_changed}`)
    for (const r of applied.reasons) console.error(`    ${r}`)
    logAction({ step: `phase2_repair_${repairIter}`, patches: rep.patches, applied: applied.applied, skipped: applied.skipped, state_changed: applied.state_changed, reasons: applied.reasons })
    if (!applied.state_changed) {
      console.error(`[chain] Phase 2: no state change after repair iter ${repairIter} — bailing (further iterations will not progress).`)
      logAction({ step: `phase2_bail_no_progress`, iter: repairIter })
      break
    }
    repairIter++
  }

  // ── Post-Phase-2 re-normalisation pass (Tristan directive 2026-05-16):
  //
  // The pre-Phase-2 pass (lines ~1567-1583) only runs once, BEFORE Phase 2
  // patches the design. Every Phase 2 iter can add new words via R3/R4
  // patches (+8 to +25 words observed in iter-58/59). After Phase 2 closes,
  // those new words have no prose coverage and may carry cosmetic-dupe
  // modifiers. Re-run the same two normalisers post-Phase-2 so the gates'
  // residual violations reflect real conflicts, not stale prose / cosmetic dups.
  //
  // iter-59 BESS evidence: pre-Phase-2 pass rewrote 33/33 sub-modules, but
  // the final sub_module_prose_covers_words gate STILL flagged 41/51 — every
  // sub-module that gained a new word during Phase 2 dropped prose coverage.
  const postProse = ensureSubmoduleProseCoversWords(design.modules ?? [])
  if (postProse.sub_modules_rewritten > 0) {
    console.error(`[chain] post-Phase-2 prose pre-fill: rewrote ${postProse.sub_modules_rewritten}/${postProse.total_sub_modules} sub-modules`)
  }
  const postDedup = dedupAllModifiers(design.modules ?? [])
  if (postDedup.modifiers_collapsed > 0) {
    console.error(`[chain] post-Phase-2 modifier dedup: collapsed ${postDedup.modifiers_collapsed} cosmetic-dupe modifier(s)`)
  }
  logAction({ step: 'post_phase2_normalise', sub_modules_rewritten: postProse.sub_modules_rewritten, modifiers_collapsed: postDedup.modifiers_collapsed })

  // ── K10 shadow validation (Task #252, 2026-05-19): validate the final
  // cross_module_grammar_links against the typed engineering reference graph
  // for the product class. The PA orchestrator calls this via
  // `stages/1.7-module-decomposition.ts:runK10ShadowValidation` but that
  // orchestrator is dead code w.r.t. production; the chain is what runs.
  // This bridge replicates the shadow-validation contract directly so K10's
  // 20-class graph footprint (Tasks #213/#215/#217/#220/#231/#238/#244)
  // actually gates the production output.
  //
  // The renderer reads `state.moduleDecomposition.k10ShadowResult` (per
  // render-minimal-pdf.tsx:1183) and surfaces verdict + missing_required
  // counts in the manual-review block. Without this bridge the field stayed
  // null and 4 weeks of K10 work was invisible to PDFs.
  const tK10 = Date.now()
  try {
    await ensureGraphsRegistered()
    const k10ProductClass = String(design.product_class ?? '').trim().toLowerCase()
    let graph = getClassReferenceGraph(k10ProductClass)
    // Alias fallback — chain emits product_class from the Stage 0 classifier
    // ("mini_split_heatpump") which may not exactly match the K10 registry
    // slug ("heat_pump_residential"). Try a small alias map before giving up.
    if (!graph) {
      // K10 graphs use kebab-case slugs (`heat-pump-residential`, `vfd-motor-drive`,
      // `bess-utility-scale`, `auv-subsea`). The chain's classifier emits
      // snake_case (`mini_split_heatpump`, `heat_pump`). Bridge the two via an
      // alias map. New product classes need entries here AND a K10 graph file
      // in `src/lib/pdf-engine-v2/class-reference-graphs/`.
      const ALIASES: Record<string, string> = {
        mini_split_heatpump: 'heat-pump-residential',
        heat_pump: 'heat-pump-residential',
        'heat-pump': 'heat-pump-residential',
        heatpump: 'heat-pump-residential',
        thermal_system: 'heat-pump-residential',
        commercial_heatpump: 'heat-pump-commercial',
        'heat-pump-commercial': 'heat-pump-commercial',
        battery_energy_storage: 'bess-utility-scale',
        energy_storage: 'bess-utility-scale',
        bess: 'bess-utility-scale',
        residential_ess: 'bess-utility-scale',
        ev_charger: 'dc_fast_ev_charger',
        'ev-charger': 'dc_fast_ev_charger',
        traction_battery_pack: 'vehicle_battery_pack',
        vehicle_battery: 'vehicle_battery_pack',
        vfd: 'vfd-motor-drive',
        motor_drive: 'vfd-motor-drive',
        auv: 'auv-subsea',
        drone: 'consumer_cinematography_drone',
        agv: 'automated_guided_vehicle_agv',
        amr: 'autonomous_mobile_robot_amr',
        // 2026-05-20 iter-9 Step 5: vertical-farm graph added — chain previously
        // logged "NO_GRAPH for vertical_farm" because no K10 graph existed.
        'vertical-farm': 'vertical_farm',
      }
      const aliased = ALIASES[k10ProductClass]
      if (aliased) graph = getClassReferenceGraph(aliased)
    }
    if (graph) {
      const emitted = (design.cross_module_grammar_links ?? []).map((l: any) => ({
        from_module: l.from_module,
        to_module: l.to_module,
        mechanism: l.mechanism,
        detail: l.detail,
      }))
      const k10Result = validateConnectionsAgainstGraph(emitted, graph)
      const shadowResult = {
        class: graph.product_class ?? k10ProductClass,
        product_class: k10ProductClass,
        verdict: k10Result.missing_required.length === 0 ? 'PASS_SHADOW' : 'FAIL_SHADOW',
        matched_edges: k10Result.summary.matched_count,
        missing_required: k10Result.missing_required.map((e: any) => ({
          from_class: String(e.from_class),
          to_class: String(e.to_class),
          protocol: e.protocol,
          mechanism: e.mechanism,
          notes: e.notes,
        })),
        extra_emitted: k10Result.extra.map((e: any) => ({
          from_module: e.from_module,
          to_module: e.to_module,
          mechanism: e.mechanism,
          protocol: e.protocol,
          detail: e.detail,
        })),
        protocol_mismatches: k10Result.protocol_mismatch.map((m: any) => ({
          from_module: m.emitted.from_module,
          to_module: m.emitted.to_module,
          reason: m.reason,
        })),
        ts: new Date().toISOString(),
        mode: 'shadow' as const,
      }
      ;(design as any).k10ShadowResult = shadowResult
      console.error(`[chain] K10 shadow: ${shadowResult.verdict} — matched=${shadowResult.matched_edges} missing=${shadowResult.missing_required.length} extra=${shadowResult.extra_emitted.length}`)
      logAction({
        step: 'k10_shadow',
        verdict: shadowResult.verdict,
        matched: shadowResult.matched_edges,
        missing: shadowResult.missing_required.length,
        extra: shadowResult.extra_emitted.length,
        protocol_mismatches: shadowResult.protocol_mismatches.length,
        latency_ms: Date.now() - tK10,
        ok: true,
      })
    } else {
      ;(design as any).k10ShadowResult = {
        class: '',
        product_class: k10ProductClass,
        verdict: 'NO_GRAPH',
        matched_edges: 0,
        missing_required: [],
        extra_emitted: [],
        protocol_mismatches: [],
        ts: new Date().toISOString(),
        mode: 'shadow' as const,
        reason: `no K10 graph registered for product_class="${k10ProductClass}"`,
      }
      console.error(`[chain] K10 shadow: NO_GRAPH for ${k10ProductClass} (add to class-reference-graphs/ to enable)`)
      logAction({ step: 'k10_shadow', verdict: 'NO_GRAPH', product_class: k10ProductClass, latency_ms: Date.now() - tK10, ok: true })
    }
  } catch (err) {
    console.error(`[chain] K10 shadow threw: ${(err as Error).message}; continuing without`)
    logAction({ step: 'k10_shadow', ok: false, error: String(err).slice(0, 200), latency_ms: Date.now() - tK10 })
  }

  // ── Headline derivation (Principle 1+2, 2026-05-15): compute headline
  // metrics DETERMINISTICALLY from the design components + brief constraints,
  // AFTER Phase 2 has closed. The headline is a CONSEQUENCE of the design,
  // not an input. Each numeric field carries a `source` annotation
  // (derived_deterministic / derived_from_brief / unavailable) so the reader
  // knows what was computed vs what's an estimate.
  const tDerive = Date.now()
  try {
    const derived = deriveHeadlineFromModules(design.modules ?? [], parsedResult.data, productClass, currentBriefText)
    keyMetrics = derived as KeyMetrics
    writeFileSync(resolve(outDir, '9-headline-derived.json'), JSON.stringify(derived, null, 2))
    const ho = derived.headline_output
    const hc = derived.headline_constraint
    const ut = derived.utilisation
    console.error(`[chain] headline derived: ${ho ? `${ho.label}=${ho.value} ${ho.unit ?? ''} [${(ho as any).source ?? '?'}]` : '(no headline)'}; ${hc ? `${hc.label}=${hc.value} ${hc.unit ?? ''}` : ''}; ${ut ? `${ut.label}=${ut.value} ${ut.unit ?? ''}` : ''} (${((Date.now() - tDerive) / 1000).toFixed(2)}s)`)
  } catch (err) {
    console.error(`[chain] headline derivation threw: ${(err as Error).message}; continuing without headline`)
  }
  logAction({ step: 'derive_headline', latency_ms: Date.now() - tDerive, ok: keyMetrics != null })

  // ── Part verification (Tristan directive 2026-05-16): per-item search-verify
  // every (manufacturer, part_number) pair via Flash-Lite, strip the high-
  // confidence fakes BEFORE rendering. iter-59 audit found ~40% hallucination
  // rate that single-shot R4 wasn't catching. This stage iterates one item
  // at a time, dedicated prompt, ~£0.10/run. See design-decisions.ts for the
  // parallel pattern.
  const tVerify = Date.now()
  let partVerifications: PartVerification[] = []
  let strippedParts = { stripped: 0, details: [] as Array<{ word_id: string; removed_pn: string; reasoning: string }> }
  let partRecommendations: PartRecommendation[] = []
  try {
    partVerifications = await verifyAllParts(design.modules ?? [], apiKey, { batchSize: 10 })
    const counts = { verified: 0, unverified: 0, uncertain: 0, skip: 0 }
    for (const v of partVerifications) counts[v.status]++
    console.error(`[chain] part verification: ${partVerifications.length} parts checked — verified=${counts.verified}, unverified=${counts.unverified}, uncertain=${counts.uncertain}, skip=${counts.skip}`)
    strippedParts = stripUnverifiedParts(design.modules ?? [], partVerifications)
    if (strippedParts.stripped > 0) {
      console.error(`[chain] part verification: stripped ${strippedParts.stripped} high-confidence fake part_numbers`)
      for (const d of strippedParts.details.slice(0, 5)) console.error(`  • ${d.word_id} → removed "${d.removed_pn}" (${d.reasoning.slice(0, 100)})`)
      // Strip+recommend: for each stripped part, ask Flash-Lite for a verified
      // real alternative. Honesty rule: if the recommender doesn't know a real
      // SKU it MUST say "uncertain — manual sourcing required" rather than
      // fabricate. The engine doesn't auto-apply recommendations; they're
      // surfaced on the Parts Pending Verification page for the human to pick.
      const stripped = strippedParts.details.map(d => {
        const parts = (d.word_id || '').split('::')
        const moduleId = parts[0] ?? ''
        const subModuleId = parts[1] ?? ''
        const wordId = parts[2] ?? ''
        return {
          ...d,
          module: moduleId,
          sub_module_id: subModuleId,
          word_name: wordId.replace(/_word$/, '').replace(/_/g, ' '),
          technical_summary: buildTechnicalSummary(design.modules ?? [], moduleId, subModuleId, wordId),
        }
      })
      partRecommendations = await recommendReplacementsForStripped(stripped, apiKey, { batchSize: 10 })
      const recCounts = { high: 0, medium: 0, low: 0, unknown: 0 }
      for (const r of partRecommendations) recCounts[r.confidence]++
      console.error(`[chain] strip+recommend: ${partRecommendations.length} recommendations — high=${recCounts.high}, medium=${recCounts.medium}, low=${recCounts.low}, unknown=${recCounts.unknown} (manual sourcing required)`)
    }
    writeFileSync(resolve(outDir, '10-part-verifications.json'), JSON.stringify({ verifications: partVerifications, stripped: strippedParts, recommendations: partRecommendations }, null, 2))
  } catch (err) {
    console.error(`[chain] part-verification step threw: ${(err as Error).message}; continuing without`)
  }
  logAction({ step: 'part_verification', latency_ms: Date.now() - tVerify, total: partVerifications.length, stripped: strippedParts.stripped, recommendations: partRecommendations.length })

  // ── Design Decisions Required (Tristan directive 2026-05-15).
  // The Phase 2 repair loop cannot reconcile genuine spec conflicts on a
  // component (e.g. cable gland dimension="M20" AND dimension="M20 × 1.5 mm
  // cable"). Instead of pretending the design failed, surface each conflict
  // as a DESIGN DECISION the human engineer picks, with an LLM-written
  // explanation + recommendation. Run status becomes accepted_with_decisions
  // rather than accepted=false.
  const tDecisions = Date.now()
  let designDecisions: DesignDecision[] = []
  try {
    designDecisions = await resolveDesignDecisions(design.modules ?? [], currentBriefText, apiKey)
    if (designDecisions.length > 0) {
      console.error(`[chain] design decisions: ${designDecisions.length} unresolved conflict${designDecisions.length === 1 ? '' : 's'} surfaced for human review`)
      for (const d of designDecisions) console.error(`  • ${d.module}::${d.sub_module_id}::${d.word_id} ${d.kind}: ${d.conflicting_values.map(v => `"${v}"`).join(' AND ')} → recommend "${d.recommended_value}"`)
    }
    writeFileSync(resolve(outDir, '10-design-decisions.json'), JSON.stringify(designDecisions, null, 2))
  } catch (err) {
    console.error(`[chain] design-decisions step threw: ${(err as Error).message}; continuing without`)
  }
  logAction({ step: 'design_decisions', latency_ms: Date.now() - tDecisions, count: designDecisions.length })

  // ── Route unrepaired STRUCTURAL gates to design decisions.
  // When Phase 2 caps out with non-modifier_consistency failures, those aren't
  // fabrication conflicts — they're structural gaps the LLM repair loop
  // couldn't close (e.g. "thermal_path_closes": 14 heat sources without a
  // cooling-providing cross-link). Surfacing them as honest "human engineer
  // must decide" entries is better than exiting `not_accepted` silently.
  // Tristan directive 2026-05-16.
  if (!allPassed && finalFailedGates.length > 0) {
    const STRUCTURAL_GATE_EXPLANATIONS: Record<string, { explanation: string; why_it_matters: string; recommendation: string }> = {
      thermal_path_closes: {
        explanation: 'The design lists heat-source sub-modules without a cross-module link to a cooling-providing module. Every component that generates heat needs an explicit thermal path to a sink — convection, liquid loop, conduction to chassis, etc.',
        why_it_matters: 'Without a closed thermal path the component will overheat in service. The chain cannot infer which cooling module each heat source ties into; this is a system-architect decision.',
        recommendation: 'For each heat source listed in the gate output, choose one of: (a) extend an existing cooling module to cover it; (b) accept passive radiation as sufficient (only valid for low-power items); (c) add a new cooling element with an explicit cross-module grammar link.',
      },
      cross_module_required_links: {
        explanation: 'The class-connections registry declares certain links MUST exist for this product class (e.g. a battery module must connect to a control module via CAN or RS-485). The chain did not add all required links.',
        why_it_matters: 'Missing required links mean the design is incomplete — components are wired but not orchestrated. A human engineer needs to confirm the missing links are actually missing (not just unstated) and add them or update the class-connections.ts registry if the requirement is too strict.',
        recommendation: 'Inspect the listed missing links. For each, either: (a) confirm the design intends to include this link and add it explicitly; (b) note that the link exists but isn\'t captured in the design data; (c) flag the class-connection requirement as not applicable for this design variant.',
      },
      spatial_position_complete: {
        explanation: 'Sub-modules with placement-implying mechanisms (mechanical_mount, thermal_contact, dc_busbar) need explicit position information — above/below, internal/external, mounted-on-X — to be assemblable.',
        why_it_matters: 'A designer working from this report cannot place components without position context. The chain has the modifiers but no spatial coordinates; deciding placement is part of the human engineer\'s job.',
        recommendation: 'For each listed sub-module, decide its position relative to neighbours (e.g. "PCS inverter mounted in rack 1, position bottom" or "Temperature sensor bonded to rack 3 cold plate, top-centre"). Update the modifier_characters with placement notes.',
      },
      sub_module_word_density: {
        explanation: 'Some sub-modules have fewer components (words) than the chain\'s minimum density target for engineered systems. The repair loop couldn\'t enrich them within the iter budget.',
        why_it_matters: 'A thin sub-module may indicate the chain missed components OR that the sub-module truly is simple (e.g. a single moulded enclosure). Without human review you can\'t tell which.',
        recommendation: 'For each thin sub-module: confirm whether it should be split further OR accept that the sub-module is genuinely a single-component unit.',
      },
      word_modifier_richness: {
        explanation: 'Some components have fewer detail modifiers than the chain\'s richness target. The repair loop ran out of iters before reaching the target for these specific items.',
        why_it_matters: 'A thin component description is harder to procure against — missing dimensions, ratings, or materials slow down the BoM stage.',
        recommendation: 'For each listed component, fill in the missing modifiers (material, dimension, rating, regulatory) before sending to procurement. Most are mechanical/structural components where typical industrial specs apply.',
      },
      declared_links_unique: {
        explanation: 'The same component-to-component link is declared more than once with conflicting metadata.',
        why_it_matters: 'Duplicate links create ambiguity in the bill of materials and complicate assembly diagrams.',
        recommendation: 'For each duplicate, pick one canonical link description and remove the others.',
      },
      sub_module_prose_covers_words: {
        explanation: 'The natural-language description of a sub-module doesn\'t mention all its components.',
        why_it_matters: 'A reader of the report may miss components that exist in the design data but not in the prose. Affects readability, not engineering correctness.',
        recommendation: 'Have the chain regenerate the sub-module prose, OR edit by hand to include the missing components.',
      },
      module_prose_subset_of_sub_modules: {
        explanation: 'The module-level overview mentions components or sub-modules that don\'t actually exist in the design data.',
        why_it_matters: 'Inflated prose creates the false impression of completeness. Same readability concern.',
        recommendation: 'Trim the module overview to only describe what exists in the design data.',
      },
      power_topology_closes: {
        explanation: 'The power-distribution chain has unconnected ends — components that draw power but aren\'t wired to a source, or sources without loads.',
        why_it_matters: 'Open electrical paths mean the design is incomplete; a fabricator can\'t build to it without making assumptions.',
        recommendation: 'For each dangling power connection, choose the source or load it should connect to and add an explicit grammar link.',
      },
      cell_discharge_rate_within_nameplate: {
        explanation: 'The pack-level current draw divided by parallel cell paths exceeds the cell\'s continuous nameplate C-rate.',
        why_it_matters: 'Running cells above nameplate degrades cycle life and may trigger thermal events. Either the cell choice is wrong for this application, or pack topology needs more parallel paths.',
        recommendation: 'Choose: (a) a higher-rate cell, (b) more parallel strings to lower per-cell current, (c) explicitly derate the system\'s continuous power.',
      },
    }

    let surfacedFromGates = 0
    for (const g of finalFailedGates) {
      const gateName = (g.name ?? '') as string
      if (gateName === 'modifier_consistency') continue  // already handled by resolveDesignDecisions
      const tmpl = STRUCTURAL_GATE_EXPLANATIONS[gateName]
      if (!tmpl) continue  // unknown gate — skip
      const affected = g.affected ?? []
      const reasons = g.reasons ?? []
      designDecisions.push({
        id: `gate-unrepaired::${gateName}`,
        module: affected[0] ?? '(multiple)',
        sub_module_id: '-',
        word_id: '-',
        word_name: gateName,
        kind: 'unrepaired_gate',
        conflicting_values: reasons.slice(0, 4),
        explanation: tmpl.explanation,
        why_it_matters: tmpl.why_it_matters,
        recommendation: tmpl.recommendation,
        recommended_value: 'Human engineer review required',
        generated_by: 'structural-gate-router',
        generated_at: new Date().toISOString(),
      } as DesignDecision)
      surfacedFromGates++
    }
    if (surfacedFromGates > 0) {
      console.error(`[chain] structural-gate router: surfaced ${surfacedFromGates} unrepaired gate(s) as design decisions`)
      writeFileSync(resolve(outDir, '10-design-decisions.json'), JSON.stringify(designDecisions, null, 2))
    }
    logAction({ step: 'structural_gate_routing', count: surfacedFromGates })
  }

  // ── Manual-review badge wires (Tristan v3 gap closure 2026-05-19).
  // The renderer's collectManualReviewBadges() at render-minimal-pdf.tsx:954
  // surfaces 6 gate badges on the cover + inline + appendix. Until now only G0
  // (physicsLedger) fired. G4 + G5 are cheap to derive from data the chain
  // already produces:
  //
  //  G5 parts manual-review — derive from state.partVerifications array.
  //  Any row with status='unverified' goes into g5UnverifiedParts[]. The
  //  badge fires when the array is non-empty.
  const g5UnverifiedParts = partVerifications
    .filter(v => v.status === 'unverified')
    .map(v => ({
      part_number: v.part_number,
      part_name: v.word_name,
      reason: v.reasoning,
      fallback_action: (v as any).fallback_action ?? null,
    }))
  const g5ManualReview = g5UnverifiedParts.length > 0
  //
  //  G4 grammar manual-review — fire when Phase 2 grammar gates failed AND
  //  the chain bailed (allPassed=false). Attached to moduleDecomposition.
  //  The chain's universal-grammar-gates already detected the violations;
  //  the structural-gate router routed them to designDecisions. The renderer
  //  surfaces the badge separately to highlight "this design needs grammar
  //  review" at the cover-page strip level.
  const g4FailedGrammar = !allPassed && finalFailedGates.some(g => {
    const name = String(g.name ?? '')
    return name === 'thermal_path_closes' ||
           name === 'cross_module_required_links' ||
           name === 'spatial_position_complete' ||
           name === 'sub_module_word_density' ||
           name === 'word_modifier_richness' ||
           name === 'declared_links_unique' ||
           name === 'sub_module_prose_covers_words' ||
           name === 'module_prose_subset_of_sub_modules' ||
           name === 'power_topology_closes' ||
           name === 'modifier_consistency'
  })
  if (g4FailedGrammar && design) {
    ;(design as any).g4ManualReview = true
  }
  logAction({ step: 'manual_review_badges', g4: g4FailedGrammar, g5_count: g5UnverifiedParts.length })

  // ── Acceptance status.
  // accepted_clean         — all gates pass + no design decisions surfaced
  // accepted_with_decisions — gates didn't all pass, but the unrepaired ones were
  //                          honestly surfaced as design decisions (either
  //                          modifier_consistency conflicts from resolveDesignDecisions
  //                          OR structural-gate failures from the router above)
  // not_accepted           — fallback: Phase 2 bailed AND no decisions exist
  //                          (would only happen if a gate fails that has no
  //                          template entry in STRUCTURAL_GATE_EXPLANATIONS)
  // 2026-05-19 v5.1 audit fix #5 (GPT-5.5): acceptanceStatus was computed
  // only from Phase 2 gates + designDecisions. v5 added G1b/G4/G5/physics-
  // critic gates that should influence the final verdict. Now:
  // - allPassed AND no v5 gate flags AND no designDecisions → accepted_clean
  // - any flags / decisions → accepted_with_decisions (still ships, but
  //   surfaces flags to the founder via badges + appendix)
  // - Phase 2 bailed AND no decisions → not_accepted (only edge case where
  //   a gate fails with no template entry in STRUCTURAL_GATE_EXPLANATIONS)
  const v5GateFlagged =
    (complianceGate?.verdict === 'WARN' || complianceGate?.verdict === 'HALT') ||
    g5ManualReview ||
    !!(design as any)?.g4ManualReview ||
    (critique?.issues?.some(i => i.severity === 'high') ?? false)

  // 2026-05-20 BESS iter-6 council fix #17 (GPT-5.5, Opus, Grok all flagged):
  // The 4927444a BESS chain produced a "procurement-style" PDF despite the
  // physics critic returning engineering_plausibility=2/10 with 8 HIGH-severity
  // issues (30A fuses on 819V/300A bus, FF600R12ME4 half-bridge claimed as
  // 3-phase 250kW inverter, 4700µF film cap "physically impossible", coolant
  // flow 4× inconsistent, etc.). The status was 'accepted_with_decisions'.
  //
  // Universal rule: if the physics critic reports engineering_plausibility ≤ 3
  // OR brief_to_design_fidelity ≤ 3, the design has critical first-principles
  // violations and is NOT procurement-grade. Status promoted to 'blocked' so
  // the renderer emits a DO-NOT-PROCURE header regardless of other gates.
  const criticPlausibility = critique?.scores?.engineering_plausibility ?? 10
  const criticFidelity = critique?.scores?.brief_to_design_fidelity ?? 10
  const physicsBlocked = (typeof criticPlausibility === 'number' && criticPlausibility <= 3) ||
                         (typeof criticFidelity === 'number' && criticFidelity <= 3)
  if (physicsBlocked) {
    console.error(`[chain] PHYSICS BLOCKED: engineering_plausibility=${criticPlausibility}/10 brief_fidelity=${criticFidelity}/10 — promoting acceptanceStatus to 'blocked'`)
    logAction({ step: 'physics_block', plausibility: criticPlausibility, fidelity: criticFidelity })
  }
  const acceptanceStatus = physicsBlocked
    ? 'blocked'
    : (allPassed && !v5GateFlagged && designDecisions.length === 0)
    ? 'accepted_clean'
    : (designDecisions.length > 0 || v5GateFlagged ? 'accepted_with_decisions' : 'not_accepted')

  // ── Save final state, build NL layer, render PDF
  const nl = buildNaturalLanguageLayer((design.modules ?? []) as any)
  for (const m of design.modules ?? []) {
    const entry = (nl as any).by_module?.[m.module]
    if (entry && m.overview_paragraph_en) entry.paragraph_en_llm = m.overview_paragraph_en
  }
  const state = {
    projectId: 'chain-v2-' + Date.now(),
    parsedBrief: parsedResult.data,
    moduleDecomposition: design,
    naturalLanguageLayer: nl,
    briefOverviewProse: design.brief_overview_prose ?? null,
    keyMetrics: keyMetrics ?? null,
    brief: briefBlock,
    designDecisions,
    partVerifications,
    partRecommendations,
    partVerificationSummary: {
      total: partVerifications.length,
      verified: partVerifications.filter(v => v.status === 'verified').length,
      unverified: partVerifications.filter(v => v.status === 'unverified').length,
      uncertain: partVerifications.filter(v => v.status === 'uncertain').length,
      skipped: partVerifications.filter(v => v.status === 'skip').length,
      stripped: strippedParts.stripped,
      recommendations_total: partRecommendations.length,
      recommendations_unknown: partRecommendations.filter(r => r.confidence === 'unknown').length,
    },
    physicsCritique: critique,
    // 2026-05-20 iter-9 Step 1: physics repair loop diagnostics (Tristan
    // "design that does work" directive). state.physicsRepair carries the
    // before/after metrics so the renderer + audit can see whether the
    // chain successfully auto-resolved physics findings.
    physicsRepair: physicsRepairResult ?? null,
    physicsLedger,
    // 2026-05-19 v5.1 audit fix #1 (Grok + GPT-5.5): persist complianceGate
    // in the INITIAL state object, not just the post-engines re-stamp block.
    // Previously it would only land on disk if the re-stamp block succeeded;
    // ANY error in that block (G2 computation, G3 computation, file write)
    // dropped complianceGate on the floor. Initial-write makes it durable.
    complianceGate: complianceGate ?? null,
    // 2026-05-19 firestorm: G0.5 brief-target-reconciliation result. Catches
    // generator scale-mismatch (1kW design vs 8kW brief class of failure).
    briefTargetReconciliation: reconciliation ?? null,
    // 2026-05-20 iter-8 (Tristan): per-class performance summary table.
    // Built last so it can read every resolved field. Renders as a spec
    // sheet page right after the operational headline so a reader sees
    // the headline numbers + their cross-checks before any prose.
    performanceCard: null as ReturnType<typeof import('../src/lib/pdf-engine-v2/performance-card').buildPerformanceCard> | null,
    // 2026-05-19 fix M1 (audit-found): worker reads state.gatesPassed for the
    // pdf_engine_runs.state_snapshot_json column but chain never wrote it.
    // DB snapshot was always {gatesPassed: null}. Write the actual boolean.
    gatesPassed: allPassed,
    // 2026-05-19 fix M2 (audit-found): write the final gate results object so
    // the renderer can render per-gate pass/fail detail in the gate-verdict
    // panel. Previously the chain wrote `grammarVerdicts: null`, hiding every
    // arithmetic + grammar gate outcome from the PDF reader.
    grammarVerdicts: finalArith && finalGrammar
      ? {
          iters_used: finalIters,
          max_iters: PHASE2_MAX_ITERS,
          all_passed: allPassed,
          arithmetic: {
            passed: finalArith.passed,
            failed: finalArith.failed,
            fired: finalArith.fired,
            total_score: finalArith.total_score,
            results: finalArith.results,
          },
          grammar: {
            passed: finalGrammar.passed,
            failed: finalGrammar.failed,
            fired: finalGrammar.fired,
            total_score: finalGrammar.total_score,
            results: finalGrammar.results,
          },
        }
      : null,
    // Manual-review badge signals (renderer reads these for G4 + G5 cover-page strip + appendix).
    g5ManualReview,
    g5UnverifiedParts,
    acceptanceStatus,
    savedAt: new Date().toISOString(),
  }
  // 2026-05-20 iter-8: build per-class performance card AFTER the rest of
  // state is populated. The card resolves canopy area, LED power, cooling,
  // humidity, CO2 etc. from derived_parameters across all modules so the
  // renderer can emit a spec-sheet page that flags cross-module
  // contradictions (e.g. LED prose says 20 kW but BoM has 40 × 200 W = 8 kW).
  try {
    const { buildPerformanceCard } = await import('../src/lib/pdf-engine-v2/performance-card')
    state.performanceCard = buildPerformanceCard(state)
    console.error(`[chain] performance card: ${state.performanceCard.sections.length} sections, ${state.performanceCard.warnings.length} warnings`)
    logAction({ step: 'performance_card', sections: state.performanceCard.sections.length, warnings: state.performanceCard.warnings.length })
  } catch (err) {
    console.error(`[chain] performance card build failed: ${(err as Error).message}`)
  }
  // 2026-05-20 iter-8 (Tristan + council CAPEX/OPEX/Reliability framing):
  // Surface every design choice the chain made, sourced from existing state
  // (no Generator invention at render time). Renderer shows as
  // "Design Trade-offs" page after Brief.
  try {
    const { buildDesignDecisionsReview } = await import('../src/lib/pdf-engine-v2/design-decisions-review')
    ;(state as any).designDecisionsReview = buildDesignDecisionsReview(state)
    const dd = (state as any).designDecisionsReview
    console.error(`[chain] design decisions review: ${dd.summary.total} choices (${dd.summary.applied} applied, ${dd.summary.flagged} flagged, ${dd.summary.blocked} blocked)`)
    logAction({ step: 'design_decisions_review', ...dd.summary })
  } catch (err) {
    console.error(`[chain] design decisions review build failed: ${(err as Error).message}`)
  }
  const statePath = resolve(outDir, 'state.json')
  writeFileSync(statePath, JSON.stringify(state, null, 2))
  logAction({ step: 'save_state', path: statePath, accepted: allPassed, acceptance_status: acceptanceStatus, decision_count: designDecisions.length })

  // ── P6 wiring (2026-05-18): Engine B — backfill per-line price estimates +
  // engine_b_component_class for every word that lacks a distributor quote.
  // Without this, partVerifications carries no component_class attribution and
  // the cover's per-class cost-stack collapses to {unclassified: total}. Run
  // BEFORE Engine C so that the reference-anchor sees the volume-corrected
  // unit prices. Fail-soft: chain still produces a PDF if this step errors.
  // Skip when CHAIN_SKIP_ENGINE_B=1 (CI / fast iteration).
  if (process.env.CHAIN_SKIP_ENGINE_B !== '1') {
    const tEngineB = Date.now()
    try {
      execFileSync('npx', ['tsx', resolve(__dirname, 'estimate-missing-prices.tsx'), statePath, '--write'], {
        stdio: 'inherit',
        cwd: resolve(__dirname, '..'),
      })
      logAction({ step: 'engine_b_estimate_prices', latency_ms: Date.now() - tEngineB, ok: true })
    } catch (err) {
      console.error(`[chain] Engine B estimate-missing-prices failed: ${(err as Error).message}; continuing without`)
      logAction({ step: 'engine_b_estimate_prices', latency_ms: Date.now() - tEngineB, ok: false, error: String(err).slice(0, 200) })
    }
  } else {
    console.error('[chain] CHAIN_SKIP_ENGINE_B=1 — skipping Engine B price-estimate step')
  }

  // ── P5 wiring (2026-05-18): Engine C — reference-product anchoring against
  // the Phase 4 corpus (~/.forge-truth/forge-truth.db). Adds engine_c_flag
  // (in_range / over / under / no_reference) per BoM line + aggregate
  // state.engine_c_summary the cover-page REF panel renders. Runs ~75-140s
  // depending on BoM size (one OpenAI embedding per priced line). Fail-soft:
  // chain still produces a PDF if this step errors. Skip when
  // CHAIN_SKIP_ENGINE_C=1.
  if (process.env.CHAIN_SKIP_ENGINE_C !== '1') {
    const tEngineC = Date.now()
    try {
      execFileSync('npx', ['tsx', resolve(__dirname, 'enrich-state-with-reference-anchor.tsx'), statePath], {
        stdio: 'inherit',
        cwd: resolve(__dirname, '..'),
      })
      logAction({ step: 'engine_c_reference_anchor', latency_ms: Date.now() - tEngineC, ok: true })
    } catch (err) {
      console.error(`[chain] Engine C reference-anchor failed: ${(err as Error).message}; continuing without`)
      logAction({ step: 'engine_c_reference_anchor', latency_ms: Date.now() - tEngineC, ok: false, error: String(err).slice(0, 200) })
    }
  } else {
    console.error('[chain] CHAIN_SKIP_ENGINE_C=1 — skipping Engine C reference-anchor step')
  }

  // ── Cost Repair Loop (Sprint 1B, Tristan 2026-05-20 fifth review):
  // Engine C flags >2x / <.5x outliers but does NOT correct. This step
  // closes the loop — asks a fixer model (Grok 4.3 by default) to either
  // (a) correct the price with cited source, (b) declare manual sourcing
  // required, or (c) declare the corpus comparison misleading.
  // Universal across product classes. Fail-soft.
  // Skip via CHAIN_SKIP_COST_REPAIR=1.
  if (process.env.CHAIN_SKIP_COST_REPAIR !== '1') {
    const tCostRepair = Date.now()
    try {
      execFileSync('npx', ['tsx', resolve(__dirname, 'cost-repair.tsx'), statePath, '--write'], {
        stdio: 'inherit',
        cwd: resolve(__dirname, '..'),
      })
      logAction({ step: 'cost_repair_loop', latency_ms: Date.now() - tCostRepair, ok: true })
    } catch (err) {
      console.error(`[chain] cost-repair failed: ${(err as Error).message}; continuing without`)
      logAction({ step: 'cost_repair_loop', latency_ms: Date.now() - tCostRepair, ok: false, error: String(err).slice(0, 200) })
    }
  } else {
    console.error('[chain] CHAIN_SKIP_COST_REPAIR=1 — skipping cost-repair step')
  }

  // ── Engine D (suppliers, 2026-05-19): spawn enrich-state-with-suppliers.tsx
  // to populate state.suppliers + state.suppliers_provenance. The renderer's
  // SuppliersPage (render-minimal-pdf.tsx:4049) reads state.suppliers and
  // renders §7 only when non-empty. Before this step was wired, every PDF
  // shipped without §7 Suppliers despite the script existing at 2,550 lines.
  // Discovered 2026-05-19 audit (see CHAIN-ENGINE-AUDIT-2026-05-19.md gap #1).
  // The script queries ~/.forge-truth/forge-truth.db `companies` table (~28k
  // rows, Companies House verified + web-sourced), with Brave Search fallback
  // and Flash-Lite scoring (~£0.05-0.15/run, latency ~30-60s).
  // Skip when CHAIN_SKIP_SUPPLIERS=1.
  if (process.env.CHAIN_SKIP_SUPPLIERS !== '1') {
    const tSuppliers = Date.now()
    try {
      execFileSync('npx', ['tsx', resolve(__dirname, 'enrich-state-with-suppliers.tsx'), statePath, '--write'], {
        stdio: 'inherit',
        cwd: resolve(__dirname, '..'),
      })
      logAction({ step: 'suppliers_enrichment', latency_ms: Date.now() - tSuppliers, ok: true })
    } catch (err) {
      console.error(`[chain] suppliers enrichment failed: ${(err as Error).message}; continuing without`)
      logAction({ step: 'suppliers_enrichment', latency_ms: Date.now() - tSuppliers, ok: false, error: String(err).slice(0, 200) })
    }
  } else {
    console.error('[chain] CHAIN_SKIP_SUPPLIERS=1 — skipping suppliers enrichment step')
  }

  // ── Supplier Contact Validation (Sprint 3A, Tristan 2026-05-20 fifth
  // review): post-process state.suppliers, for each candidate verify the
  // website_url's host apex shares tokens with the company name. If not,
  // do a Brave search "{name} UK" and replace with a reconciling result.
  // If no reconciling result, drop the bad website/email. Universal
  // across product classes. Fail-soft. Skip via
  // CHAIN_SKIP_SUPPLIER_VALIDATION=1.
  if (process.env.CHAIN_SKIP_SUPPLIER_VALIDATION !== '1') {
    const tVal = Date.now()
    try {
      execFileSync('npx', ['tsx', resolve(__dirname, 'validate-supplier-contacts.tsx'), statePath, '--write'], {
        stdio: 'inherit',
        cwd: resolve(__dirname, '..'),
      })
      logAction({ step: 'supplier_contact_validation', latency_ms: Date.now() - tVal, ok: true })
    } catch (err) {
      console.error(`[chain] supplier-contact-validation failed: ${(err as Error).message}; continuing without`)
      logAction({ step: 'supplier_contact_validation', latency_ms: Date.now() - tVal, ok: false, error: String(err).slice(0, 200) })
    }
  } else {
    console.error('[chain] CHAIN_SKIP_SUPPLIER_VALIDATION=1 — skipping supplier-contact-validation step')
  }

  // ── Deployment envelope (Task #248, 2026-05-19): persist the canonical
  // shipping/installation envelope for the product class onto state. The PA
  // pipeline (stages/3-size-layout.ts) already does this but is NOT reachable
  // from serial-design-chain-v2; without this step, render-minimal-pdf has no
  // envelope to surface even though deployment-envelopes.ts has the data.
  // Synchronous, no LLM, no cost. Fail-soft: just skip if anything throws.
  try {
    const liveState = JSON.parse(readFileSync(statePath, 'utf-8'))
    const productClass = String(
      liveState.moduleDecomposition?.product_class ??
      liveState.parsedBrief?.product_class ??
      '',
    )
    if (productClass) {
      // 2026-05-19 fix M4 (audit-found): K10 shadow uses an ALIASES map to
      // bridge classifier slugs to canonical class-graph keys, but the
      // envelope lookup had no such bridge — classes like
      // `mini_split_heatpump`, `energy_storage`, `vfd` got null envelopes.
      // Apply the same alias normalisation here. Keep both lookups: alias-
      // normalised first, then raw classifier slug as fallback.
      const ENVELOPE_ALIASES: Record<string, string> = {
        mini_split_heatpump: 'heat-pump-residential',
        heat_pump: 'heat-pump-residential',
        'heat-pump': 'heat-pump-residential',
        heatpump: 'heat-pump-residential',
        thermal_system: 'heat-pump-residential',
        commercial_heatpump: 'heat-pump-commercial',
        'heat-pump-commercial': 'heat-pump-commercial',
        battery_energy_storage: 'bess-utility-scale',
        energy_storage: 'bess-utility-scale',
        bess: 'bess-utility-scale',
        residential_ess: 'bess-utility-scale',
        ev_charger: 'dc_fast_ev_charger',
        'ev-charger': 'dc_fast_ev_charger',
        traction_battery_pack: 'vehicle_battery_pack',
        vehicle_battery: 'vehicle_battery_pack',
        vfd: 'vfd-motor-drive',
        motor_drive: 'vfd-motor-drive',
        auv: 'auv-subsea',
        drone: 'consumer_cinematography_drone',
        agv: 'automated_guided_vehicle_agv',
        amr: 'autonomous_mobile_robot_amr',
        // 2026-05-20 iter-9 Step 5: vertical-farm graph added — chain previously
        // logged "NO_GRAPH for vertical_farm" because no K10 graph existed.
        'vertical-farm': 'vertical_farm',
      }
      const aliased = ENVELOPE_ALIASES[productClass.toLowerCase()]
      let envelope = (aliased ? defaultEnvelopeForClass(aliased) : null)
        ?? defaultEnvelopeForClass(productClass)
        ?? null
      // For container/cabinet/rack-categorised classes, prefer the size-aware
      // selector if we have allocated mass + volume aggregates from Engine B
      // or the brief's derived parameters. Categories per
      // deployment-envelopes.ts: 'shipping_container' | 'electrical_rack' |
      // 'pallet' | 'pv_module_form_factor' | 'outdoor_cabinet' | 'din_rail'.
      // Only the size-variable categories benefit from suggestEnvelope.
      if (envelope && (envelope.category === 'shipping_container' || envelope.category === 'outdoor_cabinet' || envelope.category === 'electrical_rack')) {
        const totMassKg = Number(liveState.parsedBrief?.derived_parameters?.max_mass_kg) || 0
        const totVolM3 = Number(liveState.parsedBrief?.derived_parameters?.envelope_volume_m3) || 0
        if (totMassKg > 0 && totVolM3 > 0) {
          const payloadVolLiters = totVolM3 * 1000
          const candidates = suggestEnvelope(payloadVolLiters, totMassKg, envelope.category)
          if (candidates.length) envelope = candidates[0]
        }
      }
      liveState.deploymentEnvelope = envelope
      writeFileSync(statePath, JSON.stringify(liveState, null, 2))
      logAction({
        step: 'deployment_envelope',
        ok: true,
        envelope_id: envelope?.id ?? null,
        envelope_category: envelope?.category ?? null,
        product_class: productClass,
      })
      if (envelope) {
        console.error(`[chain] deployment_envelope: ${envelope.id} (${envelope.category}) for ${productClass}`)
      } else {
        console.error(`[chain] deployment_envelope: no envelope mapped for ${productClass} (returning null is intentional for some classes)`)
      }
    }
  } catch (err) {
    console.error(`[chain] deployment_envelope failed: ${(err as Error).message}; continuing without`)
    logAction({ step: 'deployment_envelope', ok: false, error: String(err).slice(0, 200) })
  }

  // 2026-05-19 fix M3 (audit-found): re-stamp partVerificationSummary after
  // Engine B + Engine C have mutated state.partVerifications. ALSO run G2
  // cost-reality gate + G3 review-completeness gate inline here so they have
  // the freshest data.
  try {
    const liveState = JSON.parse(readFileSync(statePath, 'utf-8'))
    const pv = Array.isArray(liveState.partVerifications) ? liveState.partVerifications : []
    liveState.partVerificationSummary = {
      total: pv.length,
      verified: pv.filter((v: any) => v.status === 'verified').length,
      unverified: pv.filter((v: any) => v.status === 'unverified').length,
      uncertain: pv.filter((v: any) => v.status === 'uncertain').length,
      skipped: pv.filter((v: any) => v.status === 'skip').length,
      stripped: liveState.partVerificationSummary?.stripped ?? 0,
      recommendations_total: Array.isArray(liveState.partRecommendations) ? liveState.partRecommendations.length : 0,
      recommendations_unknown: Array.isArray(liveState.partRecommendations)
        ? liveState.partRecommendations.filter((r: any) => r.confidence === 'unknown').length
        : 0,
      // Engine B/C attribution: how many rows have price estimates / reference flags now?
      with_price_estimate: pv.filter((v: any) => v.price_estimate_gbp != null).length,
      with_engine_b_class: pv.filter((v: any) => v.engine_b_component_class != null && v.engine_b_component_class !== 'unknown').length,
      with_engine_c_flag: pv.filter((v: any) => v.engine_c_flag != null).length,
      engine_c_out_of_range: pv.filter((v: any) => v.engine_c_flag === 'over' || v.engine_c_flag === 'under').length,
    }
    // ── G2 Cost-Reality Gate (Tristan v5 directive 2026-05-19): deterministic
    // BoM-total sanity check vs implausibility threshold. Engine C already
    // checks per-line ratio against corpus median (engine_c_flag);
    // G2 is the WHOLE-BoM sanity at-a-glance: is the total even in the right
    // order of magnitude for the product class? If <£10 or >£10M, the design
    // is almost certainly off (wrong scale, wrong class, or corrupt data).
    // Renderer reads state.cost_reality_status + state.cost_reality_rejection.
    const tCostReality = Date.now()
    try {
      let bomTotalGbp = 0
      let bomPricedLines = 0
      let bomUnpricedLines = 0
      for (const v of pv) {
        const unit = Number(v.distributor_price_gbp) > 0
          ? Number(v.distributor_price_gbp)
          : (Number(v.price_estimate_gbp) > 0 ? Number(v.price_estimate_gbp) : 0)
        if (unit > 0) {
          // Try to recover quantity from the matching word; default 1.
          const qty = 1  // Conservative; engine_b_* already attributes per-unit
          bomTotalGbp += unit * qty
          bomPricedLines += 1
        } else {
          bomUnpricedLines += 1
        }
      }
      const orderOfMag = bomTotalGbp > 0 ? Math.log10(bomTotalGbp) : 0
      // Plausible BoM range: £100 (consumer wearable) to £10M (utility BESS, HAPS).
      // Outside this, flag for manual review.
      let cost_reality_status: string = 'pass'
      let cost_reality_rejection: any = null
      let cost_reality_verdict: 'pass' | 'warn' | 'reject' = 'pass'
      if (bomTotalGbp > 0 && (orderOfMag < 2 || orderOfMag > 7)) {
        cost_reality_verdict = 'reject'
        cost_reality_status = 'manual_review_required'
        cost_reality_rejection = {
          reason: orderOfMag < 2
            ? `BoM total £${bomTotalGbp.toFixed(0)} is implausibly low (<£100). Likely cause: missing prices, wrong unit, or corrupted state. Check Engine B / Engine C logs.`
            : `BoM total £${bomTotalGbp.toFixed(0)} is implausibly high (>£10M). Likely cause: quantities multiplied wrong, wrong currency, or Engine B failed to volume-anchor.`,
          bom_total_gbp: Math.round(bomTotalGbp),
          priced_lines: bomPricedLines,
          unpriced_lines: bomUnpricedLines,
          order_of_magnitude: Math.round(orderOfMag * 10) / 10,
        }
      } else if (bomTotalGbp > 0 && bomPricedLines < pv.length * 0.5) {
        // Soft warn: less than 50% of BoM lines have prices.
        cost_reality_verdict = 'warn'
        cost_reality_rejection = {
          reason: `Only ${bomPricedLines}/${pv.length} BoM lines have unit prices (${((bomPricedLines / pv.length) * 100).toFixed(0)}%). Engine B or distributor cascade fell short — total may be substantially understated.`,
          bom_total_gbp: Math.round(bomTotalGbp),
          priced_lines: bomPricedLines,
          unpriced_lines: bomUnpricedLines,
          order_of_magnitude: Math.round(orderOfMag * 10) / 10,
        }
      }
      liveState.cost_reality_status = cost_reality_status
      liveState.cost_reality_verdict = cost_reality_verdict
      liveState.cost_reality_rejection = cost_reality_rejection
      liveState.cost_reality = {
        bom_total_gbp: Math.round(bomTotalGbp),
        priced_lines: bomPricedLines,
        unpriced_lines: bomUnpricedLines,
        order_of_magnitude: Math.round(orderOfMag * 10) / 10,
        verdict: cost_reality_verdict,
      }
      console.error(`[chain] G2 cost-reality: ${cost_reality_verdict.toUpperCase()} — BoM £${Math.round(bomTotalGbp)} across ${bomPricedLines} priced lines (${bomUnpricedLines} unpriced)`)
      logAction({ step: 'cost_reality_gate', verdict: cost_reality_verdict, bom_total_gbp: Math.round(bomTotalGbp), priced_lines: bomPricedLines, latency_ms: Date.now() - tCostReality, ok: true })
    } catch (err) {
      console.error(`[chain] G2 cost-reality threw: ${(err as Error).message}; continuing without`)
      logAction({ step: 'cost_reality_gate', ok: false, error: String(err).slice(0, 200) })
    }

    // ── G3 Review-Completeness Gate (Tristan v5 directive 2026-05-19): final
    // density check before render. Catches "engine emitted a PDF with empty
    // sections" silently. Pure deterministic; no LLM. Sets g3ManualReview +
    // g3_review_gaps[] for the renderer's manual-review badge.
    const tG3 = Date.now()
    try {
      const modules = Array.isArray(liveState.moduleDecomposition?.modules) ? liveState.moduleDecomposition.modules : []
      const submoduleCount = modules.reduce((acc: number, m: any) => acc + (Array.isArray(m.sub_modules) ? m.sub_modules.length : 0), 0)
      const bomLines = pv.length
      const compliance = liveState.complianceGate
      const suppliers = Array.isArray(liveState.suppliers) ? liveState.suppliers : []
      const supplierArchetypes = suppliers.length
      const critique = liveState.physicsCritique
      const gaps: Array<{ section: string; reason: string }> = []
      if (modules.length < 5) gaps.push({ section: 'modules', reason: `Only ${modules.length} modules (expected ≥5 for engineered systems)` })
      if (submoduleCount < modules.length * 2) gaps.push({ section: 'sub_modules', reason: `${submoduleCount} sub-modules across ${modules.length} modules — expected ≥${modules.length * 2}` })
      if (bomLines < 20) gaps.push({ section: 'bom', reason: `${bomLines} BoM lines (expected ≥20 for engineered systems)` })
      if (!compliance || !compliance.mandatory_total) gaps.push({ section: 'compliance', reason: 'Compliance gate did not register any mandatory standards' })
      if (supplierArchetypes === 0) gaps.push({ section: 'suppliers', reason: 'No supplier archetypes populated (Engine D may have failed or class has no supplier coverage)' })
      if (!critique || !critique.scores) gaps.push({ section: 'physics_critic', reason: 'Physics critic did not return a structured critique' })
      const g3ManualReview = gaps.length > 0
      liveState.g3ManualReview = g3ManualReview
      liveState.g3_review_gaps = gaps
      console.error(`[chain] G3 review-completeness: ${g3ManualReview ? `WARN — ${gaps.length} gap${gaps.length === 1 ? '' : 's'}` : 'PASS'}`)
      for (const g of gaps) console.error(`  ⚠ ${g.section}: ${g.reason}`)
      logAction({ step: 'review_completeness_gate', g3ManualReview, gap_count: gaps.length, gaps, latency_ms: Date.now() - tG3, ok: true })
    } catch (err) {
      console.error(`[chain] G3 review-completeness threw: ${(err as Error).message}; continuing without`)
      logAction({ step: 'review_completeness_gate', ok: false, error: String(err).slice(0, 200) })
    }

    // ── Persist complianceGate from earlier (needs to land on state.json so
    // renderer can read it for the G1b badge).
    if (complianceGate) liveState.complianceGate = complianceGate

    writeFileSync(statePath, JSON.stringify(liveState, null, 2))
    logAction({ step: 'recompute_summary_after_engines', ok: true, summary: liveState.partVerificationSummary })
  } catch (err) {
    console.error(`[chain] failed to re-stamp partVerificationSummary + G2 + G3 after Engine B/C: ${(err as Error).message}; continuing`)
    logAction({ step: 'recompute_summary_after_engines', ok: false, error: String(err).slice(0, 200) })
  }

  const pdfPath = resolve(outDir, 'chain-v2.pdf')
  // 2026-05-19 fix C2: pass RENDER_NO_OPEN=1 to renderer in worker context so
  // the renderer doesn't try to open Preview (LaunchAgent has no GUI session).
  // The renderer already guards its own `open` call with RENDER_NO_OPEN; this
  // ensures the env var propagates when the chain is itself invoked by the
  // Mac Studio worker (process.env.PDF_ENGINE_WORKER=1 set by worker).
  const renderEnv = { ...process.env }
  if (process.env.PDF_ENGINE_WORKER === '1' && !renderEnv.RENDER_NO_OPEN) {
    renderEnv.RENDER_NO_OPEN = '1'
  }
  execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), statePath, pdfPath], {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
    env: renderEnv,
  })
  // 2026-05-19 fix C2 (audit-found production failure mode): wrap `open` in
  // try/catch. The renderer's own `open` was guarded; this one was not. In
  // the worker/LaunchAgent path, `open` can fail (no GUI session) and would
  // throw — leaving the chain in a state where the PDF was successfully
  // written but the entire run aborted before the chain's own success log.
  // Silent in dev (where `open` works), critical in production.
  if (process.env.PDF_ENGINE_WORKER !== '1' && process.env.RENDER_NO_OPEN !== '1') {
    try {
      execFileSync('open', [pdfPath])
    } catch (err) {
      console.error(`[chain] failed to open PDF locally (non-fatal): ${(err as Error).message}`)
    }
  }
  logAction({ step: 'render', path: pdfPath })
  console.error(`\n[chain] === FINAL ===  state: ${statePath}  pdf: ${pdfPath}  status=${acceptanceStatus}  gates_passed=${allPassed}  design_decisions=${designDecisions.length}`)
}

main().catch(err => {
  console.error('[chain] FATAL:', err)
  logAction({ step: 'fatal', error: String(err) })
  process.exit(1)
})
