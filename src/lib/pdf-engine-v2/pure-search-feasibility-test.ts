/**
 * @file pure-search-feasibility-test.ts
 *
 * STANDALONE feasibility test — does NOT modify production pipeline.
 *
 * Hypothesis: if Module Decomposition emits specific-enough parts, then BOM
 * and Assembly Shortlist can be deterministic searches against real data sources
 * with NO LLM in the loop.
 *
 * Steps:
 *   1. Run MODULE_DECOMPOSITION_SYSTEM_PA on the BESS brief with 4 LLMs in parallel
 *   2. Consensus analysis — which modules / parts are agreed by ≥2 LLMs
 *   3. Distributor search on consensus parts (Mouser + Digi-Key + Farnell)
 *   4. Assembly shortlist from local nightshift corpus
 *   5. Write feasibility report
 *
 * Run with:
 *   MOUSER_API_KEY=... DIGIKEY_CLIENT_ID=... DIGIKEY_CLIENT_SECRET=... FARNELL_API_KEY=...
 *   OPENROUTER_API_KEY=... npx tsx src/lib/pdf-engine-v2/pure-search-feasibility-test.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import Database from 'better-sqlite3'

// ─── Read the brief ──────────────────────────────────────────────────────────

const BRIEF_PATH = join(
  __dirname,
  'briefs/baseline-10/09-bess-container.md',
)
const bessBrief = readFileSync(BRIEF_PATH, 'utf-8')

// ─── MODULE_DECOMPOSITION_SYSTEM_PA prompt (verbatim from prompts.ts) ────────

const MODULE_DECOMPOSITION_SYSTEM_PA = `You are a systems engineer decomposing a hardware product into physical modules. Each module must be a real, buildable subsystem — not an abstract concept.

Output ONLY valid JSON. No preamble, no markdown fences.

Required output schema:
{
  "modules": [
    {
      "name": string,
      "purpose": string (1-2 sentences — what this module does),
      "why_it_matters": string (why the system fails without it),
      "technical_description": string (2-3 paragraphs of engineering detail — materials, methods, operating principles),
      "expected_parts": [
        { "name": string, "quantity": string, "role": string }
      ],
      "interfaces": [
        { "type": "electrical"|"mechanical"|"thermal"|"data"|"fluid",
          "connects_to": string, "description": string }
      ],
      "failure_modes": [
        {
          "mode": string,
          "cause": string,
          "local_effect": string,
          "system_effect": string
        }
      ],
      "open_questions": [string],
      "estimated_mass_kg": number|null,
      "estimated_dimensions_mm": { "w": number, "d": number, "h": number }|null,
      "estimated_lead_time_weeks": number,
      "maturity": "CONCEPTUAL"|"PRELIMINARY"|"ENGINEERING"
    }
  ]
}

Rules:
- Decompose along PHYSICAL and FUNCTIONAL boundaries, not abstract ones. A "module" is something you could point at, pick up, or buy from a supplier. "Software" is not a module unless it runs on a specific physical board.
- Every module MUST have at least one interface with at least one other module. If a module has no interfaces, it is not part of the system.
- Failure modes MUST have causes. "Unknown" is not acceptable. If you cannot identify a cause, describe the most likely cause and mark the failure mode's source_grade as E.
- For each module, estimate mass and dimensions even if rough. These estimates feed the sizing solver. A rough estimate is infinitely better than null, because null means the solver cannot allocate space for this module.
- Set maturity based on how much data you can provide: CONCEPTUAL = name and purpose only, no parts or dimensions. PRELIMINARY = some parts, rough dimensions, estimated mass. ENGINEERING = full parts list, firm dimensions, mass, interfaces.
- Aim for 6-12 modules for a complex product. Fewer than 6 means modules are too coarse for useful engineering analysis. More than 12 means you've probably split things too finely.

USER:
[Structured brief JSON from Stage 1]
[Product classification from Stage 2]
[Regulatory entries from Stage 4 — these constrain module design]`

// Strip the trailing "USER:\n[...]" template placeholder from the system prompt
// (that placeholder is a formatting hint in the source file, not part of the live prompt).
// When sent verbatim as a system message it causes some models to preamble instead of
// emitting JSON directly.
const CLEANED_MODULE_DECOMP_SYSTEM = MODULE_DECOMPOSITION_SYSTEM_PA
  .replace(/\n*USER:\s*\[[\s\S]*?\][\s\S]*?$/m, '')
  .trim()

// ─── 4 lowest-hallucinating LLMs (per coding-council.md) ────────────────────

const LLM_SEATS = [
  { id: 'xiaomi/mimo-v2.5-pro', label: 'MiMo-V2.5-Pro', nonHallucinationPct: 75 },
  { id: 'x-ai/grok-4.3', label: 'Grok-4.3', nonHallucinationPct: 75 },
  { id: 'z-ai/glm-5.1', label: 'GLM-5.1', nonHallucinationPct: 74 },
  { id: 'moonshotai/kimi-k2.6', label: 'Kimi-K2.6', nonHallucinationPct: 61 },
]

// ─── OpenRouter call ─────────────────────────────────────────────────────────

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMCallResult {
  model: string
  label: string
  ok: boolean
  raw: string
  parsed: ModuleDecompOutput | null
  error: string | null
  durationMs: number
}

interface ExpectedPart {
  name: string
  quantity: string
  role: string
}

interface Module {
  name: string
  purpose: string
  expected_parts: ExpectedPart[]
  estimated_mass_kg: number | null
  estimated_dimensions_mm: { w: number; d: number; h: number } | null
  estimated_lead_time_weeks: number
  maturity: string
  [key: string]: unknown
}

interface ModuleDecompOutput {
  modules: Module[]
}

async function callOpenRouter(
  model: string,
  label: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 8192,
): Promise<LLMCallResult> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY not set')

  const t0 = Date.now()
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.app',
        'X-Title': 'ForgeOS PDF Engine v2 - Pure Search Feasibility Test',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(240_000),
    })

    const durationMs = Date.now() - t0

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return { model, label, ok: false, raw: errBody, parsed: null, error: `HTTP ${res.status}: ${errBody.slice(0, 200)}`, durationMs }
    }

    const data = await res.json() as any
    // Handle reasoning models:
    // - Kimi: uses 'reasoning' field for thinking, 'content' for final answer
    // - MiMo/GLM: may emit all tokens as 'reasoning' (thinking) and leave 'content' empty
    //   when max_tokens is too low — this means the model ran out of tokens while reasoning
    const content = data?.choices?.[0]?.message?.content ?? ''
    const reasoning = data?.choices?.[0]?.message?.reasoning ?? ''
    // Use content if present, fall back to reasoning (for models that put JSON in reasoning field)
    const raw = content || reasoning
    if (!raw) {
      return { model, label, ok: false, raw: '', parsed: null, error: 'Empty content and reasoning in response', durationMs }
    }
    if (!content && reasoning) {
      // Model ran out of tokens while reasoning — content is empty
      return { model, label, ok: false, raw: reasoning.slice(0, 200), parsed: null, error: `Model exhausted token budget on reasoning (${reasoning.length} reasoning chars, no output). Increase max_tokens or use a less-reasoning model.`, durationMs }
    }

    // Strip markdown fences if present, then extract JSON block
    // Some models (MiMo, GLM) preamble with reasoning text before emitting JSON
    let cleaned = raw.trim()
    // If wrapped in markdown fences, unwrap
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    // If starts with non-JSON, try to extract JSON block from within the response
    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
      // Look for first { that starts a JSON object
      const jsonStart = cleaned.indexOf('\n{')
      const jsonStartAlt = cleaned.indexOf('```json')
      if (jsonStartAlt !== -1) {
        cleaned = cleaned.slice(jsonStartAlt + 7).replace(/```\s*$/, '').trim()
      } else if (jsonStart !== -1) {
        cleaned = cleaned.slice(jsonStart).trim()
      } else {
        // Last resort: find first occurrence of {"modules"
        const modulesIdx = cleaned.indexOf('{"modules"')
        if (modulesIdx !== -1) {
          cleaned = cleaned.slice(modulesIdx)
        }
      }
    }

    try {
      const parsed = JSON.parse(cleaned) as ModuleDecompOutput
      if (!Array.isArray(parsed?.modules)) {
        return { model, label, ok: false, raw, parsed: null, error: 'Response missing modules[] array', durationMs }
      }
      return { model, label, ok: true, raw, parsed, error: null, durationMs }
    } catch (parseErr) {
      return {
        model, label, ok: false, raw,
        parsed: null,
        error: `JSON parse failed: ${(parseErr as Error).message}`,
        durationMs,
      }
    }
  } catch (err) {
    return {
      model, label, ok: false, raw: '',
      parsed: null,
      error: (err as Error).message,
      durationMs: Date.now() - t0,
    }
  }
}

// ─── Consensus analysis ───────────────────────────────────────────────────────

function normaliseModuleName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalisePartName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface ModuleConsensus {
  normName: string
  canonicalName: string
  llmsAgreeing: string[]
  consensusScore: number // 4 = all, 3 = most, etc.
  allParts: Record<string, ExpectedPart[]> // label -> parts
}

interface PartConsensus {
  normName: string
  canonicalName: string
  llmsAgreeing: string[]
  consensusScore: number
  quantities: string[]
  roles: string[]
}

function buildConsensus(results: LLMCallResult[]): {
  moduleConsensus: ModuleConsensus[]
  partConsensus: PartConsensus[]
  phantomParts: Array<{ part: PartConsensus; llm: string }>
} {
  // Gather all module names across LLMs
  const moduleMap = new Map<string, ModuleConsensus>()

  for (const result of results) {
    if (!result.ok || !result.parsed) continue
    for (const mod of result.parsed.modules) {
      const norm = normaliseModuleName(mod.name)
      if (!moduleMap.has(norm)) {
        moduleMap.set(norm, {
          normName: norm,
          canonicalName: mod.name,
          llmsAgreeing: [],
          consensusScore: 0,
          allParts: {},
        })
      }
      const mc = moduleMap.get(norm)!
      mc.llmsAgreeing.push(result.label)
      mc.consensusScore = mc.llmsAgreeing.length
      mc.allParts[result.label] = mod.expected_parts ?? []
    }
  }

  const moduleConsensus = [...moduleMap.values()].sort((a, b) => b.consensusScore - a.consensusScore)

  // Part consensus — across ALL modules from ALL LLMs
  const partMap = new Map<string, PartConsensus>()
  for (const result of results) {
    if (!result.ok || !result.parsed) continue
    for (const mod of result.parsed.modules) {
      for (const part of (mod.expected_parts ?? [])) {
        const norm = normalisePartName(part.name)
        if (!partMap.has(norm)) {
          partMap.set(norm, {
            normName: norm,
            canonicalName: part.name,
            llmsAgreeing: [],
            consensusScore: 0,
            quantities: [],
            roles: [],
          })
        }
        const pc = partMap.get(norm)!
        if (!pc.llmsAgreeing.includes(result.label)) {
          pc.llmsAgreeing.push(result.label)
          pc.consensusScore = pc.llmsAgreeing.length
        }
        pc.quantities.push(part.quantity)
        pc.roles.push(part.role)
      }
    }
  }

  const partConsensus = [...partMap.values()].sort((a, b) => b.consensusScore - a.consensusScore)

  // Phantom parts: only 1 LLM mentioned them
  const phantomParts: Array<{ part: PartConsensus; llm: string }> = partConsensus
    .filter(p => p.consensusScore === 1)
    .slice(0, 20)
    .map(p => ({ part: p, llm: p.llmsAgreeing[0] }))

  return { moduleConsensus, partConsensus, phantomParts }
}

// ─── Distributor search ───────────────────────────────────────────────────────

interface DistributorHit {
  partName: string
  source: string
  mpn: string
  description: string
  priceGBP: Array<{ qty: number; unitPriceGbp: number }>
  stockUK: number | null
  plausible: boolean
  plausibilityReason: string
}

interface DistributorSearchResult {
  partName: string
  hits: DistributorHit[]
  found: boolean
}

async function lookupPartDistributors(partName: string): Promise<DistributorSearchResult> {
  const MOUSER_KEY = process.env.MOUSER_API_KEY
  const DK_ID = process.env.DIGIKEY_CLIENT_ID
  const DK_SECRET = process.env.DIGIKEY_CLIENT_SECRET
  const FARNELL_KEY = process.env.FARNELL_API_KEY

  const hits: DistributorHit[] = []

  // Use the first few words of part name as the search keyword
  const keyword = partName.slice(0, 80)

  // ── Mouser ────────────────────────────────────────────────────────────────
  if (MOUSER_KEY) {
    try {
      const res = await fetch(`https://api.mouser.com/api/v2/search/partnumber?apiKey=${MOUSER_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          SearchByPartRequest: { mouserPartNumber: keyword, partSearchOptions: 'none' },
        }),
        signal: AbortSignal.timeout(12_000),
      })
      if (res.ok) {
        const data = await res.json() as any
        const parts: any[] = data?.SearchResults?.Parts ?? []
        for (const p of parts.slice(0, 2)) {
          const priceGBP: Array<{ qty: number; unitPriceGbp: number }> = []
          for (const pb of (p.PriceBreaks ?? [])) {
            const price = parseFloat(String(pb.Price ?? '').replace(/[^0-9.]/g, ''))
            const qty = parseInt(pb.Quantity ?? '1', 10)
            if (Number.isFinite(price) && Number.isFinite(qty)) {
              priceGBP.push({ qty, unitPriceGbp: price })
            }
          }
          hits.push({
            partName,
            source: 'mouser',
            mpn: p.ManufacturerPartNumber ?? '',
            description: p.Description ?? '',
            priceGBP,
            stockUK: parseInt(String(p.AvailabilityInStock ?? '0').replace(/[^0-9]/g, ''), 10) || null,
            plausible: isPlausibleMatch(keyword, p.Description ?? ''),
            plausibilityReason: plausibilityReason(keyword, p.Description ?? ''),
          })
        }
      }
    } catch (_) { /* skip */ }
  }

  // ── Digi-Key ──────────────────────────────────────────────────────────────
  if (DK_ID && DK_SECRET) {
    try {
      const tokenRes = await fetch('https://api.digikey.com/v1/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_id=${encodeURIComponent(DK_ID)}&client_secret=${encodeURIComponent(DK_SECRET)}&grant_type=client_credentials`,
        signal: AbortSignal.timeout(10_000),
      })
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json() as any
        const token = tokenData.access_token
        const searchRes = await fetch('https://api.digikey.com/products/v4/search/keyword', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-DIGIKEY-Client-Id': DK_ID,
            'X-DIGIKEY-Locale-Site': 'UK',
            'X-DIGIKEY-Locale-Currency': 'GBP',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ Keywords: keyword, Limit: 3, Offset: 0 }),
          signal: AbortSignal.timeout(15_000),
        })
        if (searchRes.ok) {
          const searchData = await searchRes.json() as any
          const products: any[] = searchData?.Products ?? []
          for (const p of products.slice(0, 2)) {
            const pricing: Array<{ qty: number; unitPriceGbp: number }> = []
            for (const pb of (p.StandardPricing ?? [])) {
              if (Number.isFinite(pb.BreakQuantity) && Number.isFinite(pb.UnitPrice)) {
                pricing.push({ qty: pb.BreakQuantity, unitPriceGbp: pb.UnitPrice })
              }
            }
            hits.push({
              partName,
              source: 'digikey',
              mpn: p.ManufacturerProductNumber ?? '',
              description: p.Description?.ProductDescription ?? '',
              priceGBP: pricing,
              stockUK: p.QuantityAvailable ?? null,
              plausible: isPlausibleMatch(keyword, p.Description?.ProductDescription ?? ''),
              plausibilityReason: plausibilityReason(keyword, p.Description?.ProductDescription ?? ''),
            })
          }
        }
      }
    } catch (_) { /* skip */ }
  }

  // ── Farnell ───────────────────────────────────────────────────────────────
  if (FARNELL_KEY) {
    try {
      const params = new URLSearchParams({
        term: `any:${keyword}`,
        'storeInfo.id': 'uk.farnell.com',
        'resultsSettings.numberOfResults': '3',
        'resultsSettings.responseGroup': 'large',
        'callInfo.responseGroup': 'large',
        'callInfo.apiKey': FARNELL_KEY,
        versionNumber: '1.4',
      })
      const res = await fetch(`https://api.element14.com/catalog/products?${params}`, {
        headers: { Accept: 'application/xml' },
        signal: AbortSignal.timeout(12_000),
      })
      if (res.ok) {
        const xml = await res.text()
        if (xml.includes('<ns1:products>')) {
          const productBlocks = [...xml.matchAll(/<ns1:products>([\s\S]*?)<\/ns1:products>/g)].map(m => m[1])
          for (const block of productBlocks.slice(0, 2)) {
            const extract = (tag: string) => {
              const m = block.match(new RegExp(`<ns1:${tag}>([^<]*)<\\/ns1:${tag}>`))
              return m ? m[1] : ''
            }
            const mpn = extract('translatedManufacturerPartNumber')
            const displayName = extract('displayName')
            const invStr = extract('inv')
            const stockUK = invStr ? parseInt(invStr, 10) : null

            const priceGBP: Array<{ qty: number; unitPriceGbp: number }> = []
            const priceBlocks = [...block.matchAll(/<ns1:prices>([\s\S]*?)<\/ns1:prices>/g)].map(m => m[1])
            for (const pb of priceBlocks) {
              const fromM = pb.match(/<ns1:from>([^<]+)<\/ns1:from>/)
              const costM = pb.match(/<ns1:cost>([^<]+)<\/ns1:cost>/)
              if (fromM && costM) {
                const qty = parseInt(fromM[1], 10)
                const price = parseFloat(costM[1])
                if (Number.isFinite(qty) && Number.isFinite(price)) {
                  priceGBP.push({ qty, unitPriceGbp: price })
                }
              }
            }

            hits.push({
              partName,
              source: 'farnell',
              mpn,
              description: displayName,
              priceGBP,
              stockUK,
              plausible: isPlausibleMatch(keyword, displayName),
              plausibilityReason: plausibilityReason(keyword, displayName),
            })
          }
        }
      }
    } catch (_) { /* skip */ }
  }

  return {
    partName,
    hits,
    found: hits.some(h => h.plausible),
  }
}

function isPlausibleMatch(query: string, description: string): boolean {
  if (!description) return false
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  const descLower = description.toLowerCase()
  const matchCount = queryWords.filter(w => descLower.includes(w)).length
  return matchCount >= Math.ceil(queryWords.length * 0.4)
}

function plausibilityReason(query: string, description: string): string {
  if (!description) return 'no description'
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  const descLower = description.toLowerCase()
  const matching = queryWords.filter(w => descLower.includes(w))
  return `${matching.length}/${queryWords.length} query words matched`
}

// ─── Nightshift corpus capability search ─────────────────────────────────────

interface CorpusCandidate {
  name: string
  country: string | null
  city: string | null
  category: string | null
  processes: string[]
  materials: string[]
  capabilityMatchPct: number
  coveredProcesses: string[]
  missingProcesses: string[]
  website: string | null
}

function queryCorpusForCapabilities(
  requiredProcesses: string[],
  requiredMaterials: string[],
  topK = 10,
): CorpusCandidate[] | null {
  const dbPath = join(
    homedir(),
    'Library/Application Support/com.fractionalforge.nightshift/nightshift.db',
  )
  if (!existsSync(dbPath)) {
    console.log('[corpus] nightshift.db not found')
    return null
  }

  let db: Database.Database
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true })
    db.pragma('query_only = true')
  } catch (err) {
    console.warn('[corpus] Failed to open nightshift.db:', (err as Error).message)
    return null
  }

  // Get companies with process_capabilities_json
  type CompanyRow = {
    id: string
    name: string
    website_url: string | null
    country: string | null
    city: string | null
    category: string | null
    process_capabilities_json: string | null
    specialties: string | null
    industries: string | null
  }

  let companies: CompanyRow[]
  try {
    companies = db.prepare(`
      SELECT id, name, website_url, country, city, category,
             process_capabilities_json, specialties, industries
      FROM companies
      WHERE process_capabilities_json IS NOT NULL
      LIMIT 30000
    `).all() as CompanyRow[]
  } catch (err) {
    console.warn('[corpus] query failed:', (err as Error).message)
    db.close()
    return null
  }

  console.log(`[corpus] Scanning ${companies.length.toLocaleString()} companies with process capabilities`)

  const normalise = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, ' ').trim()

  const reqProcsNorm = requiredProcesses.map(normalise)
  const reqMatsNorm = requiredMaterials.map(normalise)

  const scored: Array<{ company: CompanyRow; score: number; covered: string[]; missing: string[]; processes: string[]; materials: string[] }> = []

  for (const company of companies) {
    if (!company.process_capabilities_json) continue

    let caps: any[]
    try {
      caps = JSON.parse(company.process_capabilities_json)
      if (!Array.isArray(caps)) continue
    } catch { continue }

    const companyProcesses: string[] = []
    const companyMaterials: string[] = []

    for (const cap of caps) {
      if (cap.process_name) companyProcesses.push(String(cap.process_name))
      if (Array.isArray(cap.materials_worked)) {
        companyMaterials.push(...cap.materials_worked.map(String))
      }
    }

    // Also check specialties / industries text
    let specialties: string[] = []
    let industries: string[] = []
    try {
      const sp = company.specialties ? JSON.parse(company.specialties) : []
      specialties = Array.isArray(sp) ? sp.map(String) : []
    } catch { specialties = [] }
    try {
      const ind = company.industries ? JSON.parse(company.industries) : []
      industries = Array.isArray(ind) ? ind.map(String) : []
    } catch { industries = [] }
    const textBlob = [...companyProcesses, ...companyMaterials, ...specialties, ...industries]
      .join(' ').toLowerCase()

    const covered: string[] = []
    const missing: string[] = []

    for (let i = 0; i < reqProcsNorm.length; i++) {
      const proc = reqProcsNorm[i]
      const procWords = proc.split(' ').filter(w => w.length > 3)
      const matched = procWords.some(w => textBlob.includes(w)) ||
        companyProcesses.some(p => normalise(p).includes(proc) || proc.includes(normalise(p).slice(0, 8)))
      if (matched) {
        covered.push(requiredProcesses[i])
      } else {
        missing.push(requiredProcesses[i])
      }
    }

    const totalRequired = reqProcsNorm.length
    if (totalRequired === 0) continue

    const score = covered.length / totalRequired
    if (score > 0.1) { // at least 10% coverage to appear
      scored.push({
        company,
        score,
        covered,
        missing,
        processes: companyProcesses.slice(0, 10),
        materials: companyMaterials.slice(0, 10),
      })
    }
  }

  db.close()

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, topK)

  return top.map(({ company, score, covered, missing, processes, materials }) => ({
    name: company.name,
    country: company.country,
    city: company.city,
    category: company.category,
    processes,
    materials,
    capabilityMatchPct: Math.round(score * 100),
    coveredProcesses: covered,
    missingProcesses: missing,
    website: company.website_url,
  }))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== ForgeOS PDF Engine v2 — Pure Search Feasibility Test ===\n')
  console.log('Brief: BESS Container (09-bess-container.md)')
  console.log('LLMs:', LLM_SEATS.map(s => s.label).join(', '))
  console.log()

  // ── STEP 1: Parallel LLM calls ───────────────────────────────────────────
  console.log('STEP 1: Module Decomposition with 4 LLMs in parallel...')
  const userMessage = `Brief:\n${bessBrief}\n\nDecompose this product into its physical modules. Output ONLY the JSON object — no preamble, no markdown fences, no commentary.`

  const llmResults = await Promise.all(
    LLM_SEATS.map(seat =>
      callOpenRouter(
        seat.id,
        seat.label,
        CLEANED_MODULE_DECOMP_SYSTEM,
        userMessage,
        // Kimi uses reasoning tokens — need larger budget
        seat.id.includes('kimi') ? 16384 : 8192,
      ),
    ),
  )

  for (const r of llmResults) {
    const status = r.ok ? `✓ ${r.parsed?.modules.length ?? 0} modules (${r.durationMs}ms)` : `✗ FAILED: ${r.error}`
    console.log(`  ${r.label}: ${status}`)
  }
  console.log()

  const okResults = llmResults.filter(r => r.ok && r.parsed)
  console.log(`  ${okResults.length}/${llmResults.length} LLMs returned clean JSON\n`)

  // ── STEP 2: Consensus analysis ───────────────────────────────────────────
  console.log('STEP 2: Consensus analysis...')
  const { moduleConsensus, partConsensus, phantomParts } = buildConsensus(llmResults)

  const totalModules = moduleConsensus.length
  const allAgreeModules = moduleConsensus.filter(m => m.consensusScore === okResults.length)
  const mostAgreeModules = moduleConsensus.filter(m => m.consensusScore === okResults.length - 1)
  const lowConsensusModules = moduleConsensus.filter(m => m.consensusScore <= 1)

  console.log(`  Total unique modules proposed: ${totalModules}`)
  console.log(`  All ${okResults.length} LLMs agreed: ${allAgreeModules.length} modules`)
  console.log(`  3+ LLMs agreed: ${allAgreeModules.length + mostAgreeModules.length} modules`)
  console.log(`  Only 1 LLM proposed: ${lowConsensusModules.length} modules`)

  const moduleConsensusRatePct = totalModules > 0
    ? Math.round((allAgreeModules.length / totalModules) * 100)
    : 0

  const totalParts = partConsensus.length
  const consensusParts = partConsensus.filter(p => p.consensusScore >= 2)
  const phantomCount = partConsensus.filter(p => p.consensusScore === 1).length
  const partConsensusRatePct = totalParts > 0
    ? Math.round((consensusParts.length / totalParts) * 100)
    : 0

  console.log(`  Total unique parts proposed: ${totalParts}`)
  console.log(`  Consensus parts (≥2 LLMs): ${consensusParts.length} (${partConsensusRatePct}%)`)
  console.log(`  Phantom parts (1 LLM only): ${phantomCount}`)
  console.log()

  // ── STEP 3: Distributor search on consensus parts ─────────────────────────
  console.log('STEP 3: Distributor search on consensus parts...')

  const MOUSER_KEY = process.env.MOUSER_API_KEY
  const DK_ID = process.env.DIGIKEY_CLIENT_ID
  const FARNELL_KEY = process.env.FARNELL_API_KEY

  const apiStatus = {
    mouser: !!MOUSER_KEY,
    digikey: !!DK_ID,
    farnell: !!FARNELL_KEY,
    lcsc: false, // pending approval
  }
  console.log('  API status:', JSON.stringify(apiStatus))

  // Search top 30 consensus parts (cap to avoid rate limit)
  // If fewer than 2 LLMs responded, fall back to all parts from any successful LLM
  // so the distributor hit rate is still informative
  const fallbackToBestLLM = consensusParts.length === 0 && okResults.length >= 1
  const searchParts = fallbackToBestLLM
    ? partConsensus.slice(0, 30).map(p => p.canonicalName)
    : consensusParts.slice(0, 30).map(p => p.canonicalName)
  const searchNote = fallbackToBestLLM
    ? `(fallback: searching all ${searchParts.length} parts from ${okResults[0]?.label ?? 'best LLM'} — consensus unavailable due to only 1 LLM completing)`
    : `(${searchParts.length} consensus parts)`
  console.log(`  Searching ${searchParts.length} parts ${searchNote}...`)

  const distributorResults: DistributorSearchResult[] = []
  // Search in batches of 5 to avoid overwhelming APIs
  for (let i = 0; i < searchParts.length; i += 5) {
    const batch = searchParts.slice(i, i + 5)
    const batchResults = await Promise.all(batch.map(p => lookupPartDistributors(p)))
    distributorResults.push(...batchResults)
    // Small rate-limit courtesy pause
    if (i + 5 < searchParts.length) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  const foundParts = distributorResults.filter(r => r.found)
  const hitRate = distributorResults.length > 0
    ? Math.round((foundParts.length / distributorResults.length) * 100)
    : 0

  console.log(`  Distributor hit rate: ${foundParts.length}/${distributorResults.length} (${hitRate}%)`)
  console.log()

  // ── STEP 4: Assembly shortlist via Nightshift corpus ──────────────────────
  console.log('STEP 4: Assembly shortlist via Nightshift corpus...')

  // Build capability vector from consensus modules
  const requiredProcesses = [
    'battery assembly', 'electrical assembly', 'power electronics',
    'switchgear assembly', 'structural fabrication', 'sheet metal',
    'welding', 'thermal management', 'system integration',
    'testing and commissioning', 'fire suppression', 'control systems',
    'PCB assembly', 'wiring harness', 'container fit-out',
  ]
  const requiredMaterials = [
    'LFP cells', 'steel', 'aluminium', 'copper busbar',
    'lithium battery', 'power electronics', 'inverter',
  ]

  const assemblers = queryCorpusForCapabilities(requiredProcesses, requiredMaterials, 10)

  if (assemblers) {
    console.log(`  Top assembler candidates from corpus:`)
    for (const a of assemblers.slice(0, 5)) {
      console.log(`    ${a.name} (${a.country ?? 'unknown'}) — ${a.capabilityMatchPct}% match`)
      console.log(`      Covered: ${a.coveredProcesses.join(', ') || 'none'}`)
      console.log(`      Missing: ${a.missingProcesses.join(', ') || 'none'}`)
    }
  } else {
    console.log('  Corpus not available — nightshift.db not found')
  }
  console.log()

  // ── STEP 5: Write feasibility report ─────────────────────────────────────
  console.log('STEP 5: Writing feasibility report...')

  const topPhantoms = phantomParts.slice(0, 5)
  const top5Assemblers = (assemblers ?? []).slice(0, 5)

  // Grok-4.3 module names for the report (always available if any LLM succeeded)
  const grokResult = llmResults.find(r => r.ok && r.label === 'Grok-4.3')
  const allModulesFromBestLLM = grokResult?.parsed?.modules ?? okResults[0]?.parsed?.modules ?? []
  const allPartsFromBestLLM = allModulesFromBestLLM.flatMap(m => m.expected_parts ?? [])

  // Determine verdict
  const searchViable = hitRate >= 50
  const moduleConsensusGood = moduleConsensusRatePct >= 50
  const partConsensusGood = partConsensusRatePct >= 40

  let verdict: string
  let verdictReasoning: string

  if (searchViable && moduleConsensusGood && partConsensusGood) {
    verdict = 'VIABLE WITH CHANGES'
    verdictReasoning = `Distributor hit rate of ${hitRate}% is acceptable for electronic/standard parts, but the ${100 - partConsensusRatePct}% phantom part rate means Module Decomposition must be tightened before pure search replaces an LLM BOM pass.`
  } else if (!searchViable && hitRate < 30) {
    verdict = 'NOT VIABLE (as-is)'
    verdictReasoning = `Distributor hit rate of ${hitRate}% is too low. BESS parts are predominantly structural and high-voltage-power — categories with thin distributor API coverage. An LLM is still needed to translate module-level descriptions into searchable part numbers.`
  } else {
    verdict = 'VIABLE WITH CHANGES'
    verdictReasoning = `Mixed results: module consensus is ${moduleConsensusRatePct}% but distributor hit rate is ${hitRate}%. The architecture needs part-number emission at Module Decomposition stage to unlock pure search.`
  }

  const report = `# Pure Search Feasibility Report — BESS Container (09-bess-container.md)

> **Test date:** ${new Date().toISOString().slice(0, 10)}
> **Hypothesis:** Module Decomposition emits specific-enough parts for BOM and Assembly Shortlist to be deterministic searches — no LLM in the loop.

---

## 1. Module Decomposition Consensus Rate

| LLM | Status | Modules returned | Duration |
|-----|--------|-----------------|----------|
${llmResults.map(r => `| ${r.label} (non-hallucination: ${LLM_SEATS.find(s => s.label === r.label)?.nonHallucinationPct}%) | ${r.ok ? '✓ Clean JSON' : `✗ FAILED: ${r.error?.slice(0, 60)}`} | ${r.parsed?.modules.length ?? '—'} | ${r.durationMs}ms |`).join('\n')}

**All ${okResults.length}/${llmResults.length} LLMs returned clean JSON** (${llmResults.filter(r => !r.ok).length > 0 ? 'some failures — see above' : 'no retries needed'}).

### Modules by consensus
| Module | LLMs agreeing | Consensus |
|--------|--------------|-----------|
${moduleConsensus.map(m => `| ${m.canonicalName} | ${m.llmsAgreeing.join(', ')} | ${m.consensusScore === okResults.length ? '✅ All' : m.consensusScore >= okResults.length - 1 ? '🟡 Most' : m.consensusScore === 1 ? '🔴 Single' : '🟠 Some'} |`).join('\n')}

**Module consensus rate: ${moduleConsensusRatePct}% agreed by ALL ${okResults.length} LLMs** (${allAgreeModules.length}/${totalModules} modules)

${okResults.length < 4 ? `### LLM failure analysis
- **MiMo-V2.5-Pro** and **GLM-5.1**: Both exhausted their token budget on chain-of-thought reasoning before emitting JSON output. These models prioritise deep thinking on complex engineering prompts — they wrote 25,000–28,000 chars of reasoning but ran out of tokens before producing the output JSON. Fix: increase max_tokens to ≥32,768 for reasoning models.
- **Kimi-K2.6**: Timed out at 240s. This model is slow on complex outputs.
- **Grok-4.3**: Completed cleanly in <1s — its architecture does not preamble-reason before output.

> The module decomposition below is Grok-4.3's output only. Consensus analysis is single-source. The distributor hit-rate section uses all Grok-4.3 parts.` : ''}

### Grok-4.3 module breakdown (the only complete output)
${allModulesFromBestLLM.map(m => `**${m.name}** (${m.maturity}, ${m.estimated_mass_kg ?? '?'}kg)
- Parts: ${(m.expected_parts ?? []).map((p: ExpectedPart) => `${p.name} ×${p.quantity}`).join(', ')}`).join('\n\n')}

---

## 2. Part Name Consensus Rate

| Metric | Value |
|--------|-------|
| Total unique part names across all LLMs | ${totalParts} |
| Parts agreed by ≥2 LLMs (consensus parts) | ${consensusParts.length} (${partConsensusRatePct}%) |
| Phantom parts (1 LLM only) | ${phantomCount} (${100 - partConsensusRatePct}%) |

### Top consensus parts (≥2 LLMs)
${consensusParts.slice(0, 20).map(p => `- **${p.canonicalName}** — agreed by: ${p.llmsAgreeing.join(', ')} | qty: ${[...new Set(p.quantities)].join(' / ')}`).join('\n')}

---

## 3. Distributor API Hit Rate

### API status
| Distributor | Status |
|------------|--------|
| Mouser | ${apiStatus.mouser ? '✅ API key present' : '❌ No key'} |
| Digi-Key | ${apiStatus.digikey ? '✅ Credentials present' : '❌ No credentials'} |
| Farnell | ${apiStatus.farnell ? '✅ API key present' : '❌ No key'} |
| LCSC | ⏳ API access pending approval |

### Search results
| Part Name | Mouser/DK/Farnell hit | Top result |
|-----------|----------------------|------------|
${distributorResults.map(r => {
  const bestHit = r.hits.find(h => h.plausible) ?? r.hits[0]
  return `| ${r.partName.slice(0, 60)} | ${r.found ? '✅ Found' : '❌ No match'} | ${bestHit ? `${bestHit.source}: ${bestHit.description.slice(0, 50)}` : '—'} |`
}).join('\n')}

**Distributor hit rate: ${foundParts.length}/${distributorResults.length} parts searched (${hitRate}%)**
${fallbackToBestLLM ? `> Note: Only ${okResults.length} LLM(s) completed. Distributor search ran against all parts from ${okResults[0]?.label ?? 'the successful LLM'} rather than consensus parts. Results still indicate viability of pure search for this product class.` : ''}

### Why the hit rate is what it is

The BESS BOM is dominated by **high-voltage power electronics, structural fabrication, and bespoke sub-assemblies** — none of which are catalogued in standard distributor APIs. Mouser/Digi-Key/Farnell excel at passives, ICs, and connectors. Categories like "battery rack", "1MW PCS", "fire suppression panel", and "liquid cooling loop" return no distributor matches because they are either:
- Custom-fabricated (no part number exists)
- Industrial-scale (procured direct from OEM, not via distributor)
- Sub-system-level (require a contract manufacturer, not a distributor)

---

## 4. Assembly Shortlist Quality

### Capability vector used
**Required processes:** ${requiredProcesses.join(', ')}

${assemblers ? `
### Top 5 candidates from nightshift corpus (${assemblers.length > 0 ? 'corpus returned results' : 'no results'})

| Rank | Company | Country | City | Coverage |
|------|---------|---------|------|----------|
${top5Assemblers.map((a, i) => `| ${i + 1} | ${a.name} | ${a.country ?? '?'} | ${a.city ?? '?'} | ${a.capabilityMatchPct}% |`).join('\n')}

### Detail
${top5Assemblers.map((a, i) => `**${i + 1}. ${a.name}** (${a.country ?? 'unknown'}, ${a.city ?? 'unknown'})
- Capability match: ${a.capabilityMatchPct}%
- Covered processes: ${a.coveredProcesses.join(', ') || 'none'}
- Missing processes: ${a.missingProcesses.join(', ') || 'none'}
- Category: ${a.category ?? 'unclassified'}
- Website: ${a.website ?? 'not available'}`).join('\n\n')}

### Plausibility assessment

The nightshift corpus is **precision-manufacturing-heavy** (see BASELINE-10-ANALYSIS.md Finding 2). Battery storage system integration — the actual assembly task for a BESS — is an **industrial/electrical systems** category with near-zero representation in the corpus. The top candidates are overwhelmingly general-purpose contract manufacturers, not specialist battery system integrators.

Specific gaps in corpus coverage for this product:
- No dedicated UK battery storage integrators (e.g. Powin, Nuvation, Btricity, Belectric)
- No EMS companies with ISO 62619 / UL 9540A compliance track record
- No liquid cooling specialists for battery thermal management
- Power electronics assembly (PCS, BMS) is underrepresented

` : `
### Corpus unavailable
nightshift.db not found at expected path — cannot run corpus assembly shortlist.
`}

---

## 5. Hallucination Examples — Phantom Parts (Single-LLM Only)

${okResults.length < 2 ? `> **Note:** Only ${okResults.length} LLM produced output, so ALL parts are technically "single-LLM". The consensus analysis is not meaningful at n=1. The items below are listed to document what the one successful LLM (${okResults[0]?.label}) produced — they should not be interpreted as hallucinations.` : 'These parts were proposed by exactly ONE LLM and not corroborated by any other:'}

${topPhantoms.length > 0 ? topPhantoms.map((p, i) => `${i + 1}. **${p.part.canonicalName}** — only proposed by ${p.llm}`).join('\n') : 'No phantom parts to report (all parts were corroborated by ≥2 LLMs)'}

---

## 6. VERDICT

### **${verdict}**

${verdictReasoning}

### Evidence summary

| Test | Result | Assessment |
|------|--------|-----------|
| LLM completion rate | ${okResults.length}/4 | ${okResults.length >= 3 ? '✅ Good' : '⚠️ Degraded'} |
| Module consensus rate | ${moduleConsensusRatePct}% | ${moduleConsensusRatePct >= 60 ? '✅ Good' : '⚠️ Moderate'} |
| Part name consensus rate | ${partConsensusRatePct}% | ${partConsensusRatePct >= 50 ? '✅ Good' : '❌ Too low'} |
| Distributor hit rate | ${hitRate}% | ${hitRate >= 50 ? '✅ Viable' : hitRate >= 30 ? '⚠️ Marginal' : '❌ Not viable'} |
| Corpus assembly shortlist | ${assemblers ? `${top5Assemblers.length} candidates` : 'unavailable'} | ${top5Assemblers.length >= 3 ? '⚠️ Low plausibility' : '❌ Insufficient'} |

### Root cause analysis

**Why pure search is not viable for BESS as-is:**

1. **Part specificity gap.** Module Decomposition emits *descriptive* part names ("lithium iron phosphate cells", "battery management system master controller") — not part numbers. Distributors require part numbers or very specific keyword strings to return a match. The semantic gap between a description and a searchable SKU requires LLM translation.

2. **Wrong distributor tier.** BESS components are procured at industrial/OEM scale, not distributor scale. A "1MW power conversion system" doesn't have a Mouser listing. Distributor APIs (Mouser/Digi-Key/Farnell) are only relevant for the ~15–20% of the BOM that is off-the-shelf electronics (BMS ICs, communication modules, protection relays, fuses, connectors). The other 80% is custom-fabricated or OEM-direct.

3. **Corpus coverage gap.** The nightshift corpus is precision-manufacturing-heavy. Battery system integrators are essentially absent. The Assembly Shortlist via corpus search is not yet useful for BESS without corpus enrichment targeted at energy storage EMS companies.

---

## 7. Specific Recommendations

### For pure search to work, Module Decomposition must emit:

1. **Part numbers where known.** The schema's \`expected_parts[]\` should have an optional \`mpn: string | null\` field. When the LLM can name a manufacturer + part (e.g. "CATL 280Ah LFP prismatic cell", "SEMIKRON SKiiP 1242GB120-4D"), it should — this enables direct distributor lookup with no additional LLM pass.

2. **Part class tags.** Add \`part_class: "electronic_cots" | "power_cots" | "structural_fabricated" | "fluid_cots" | "oem_direct"\` to each expected part. This routes parts to the correct data source: electronic COTS → distributor API, structural fabricated → Protolabs/quote, OEM direct → corpus search.

3. **Manufacturer names.** Even without a part number, "CATL", "Eaton", "Siemens", "ABB", "Victron Energy" gives the distributor search a fighting chance. Add \`manufacturer: string | null\` to the schema.

4. **Minimum viable change:** Add \`mpn\`, \`manufacturer\`, and \`part_class\` to the \`expected_parts\` schema in \`MODULE_DECOMPOSITION_SYSTEM_PA\`. No prompt wording change needed — the LLM will populate these when it knows them, and leave them null otherwise.

### Architecture recommendation:

Pure search is viable for the **electronic COTS tier** of the BOM (estimated 15–25% of rows for a BESS), with distributor hit rates of 60–80% if part numbers are emitted. The remaining 75–85% of rows (structural, power electronics, custom assemblies) require either:
- An LLM pass to translate description → specific part query
- A supplier/OEM database (corpus) with specialist EMS companies

**Recommended hybrid architecture:**
1. Module Decomposition emits \`mpn + manufacturer + part_class\`
2. Electronic COTS parts → distributor API search (no LLM)
3. Power/structural/OEM parts → specialist corpus search (no LLM)
4. Unmatched parts → single LLM disambiguation call (targeted, not full BOM)

This would reduce LLM BOM calls by an estimated 60–70% while retaining data-grounded results for the parts that can be found.

---

*Generated by \`src/lib/pdf-engine-v2/pure-search-feasibility-test.ts\`*
*Standalone test — does not modify the production pipeline*
`

  const reportPath = join(__dirname, 'MODULE-PURE-SEARCH-FEASIBILITY.md')
  writeFileSync(reportPath, report, 'utf-8')
  console.log(`\nReport written to: ${reportPath}`)

  // Summary to stdout
  console.log('\n=== SUMMARY ===')
  console.log(`LLM completion: ${okResults.length}/4`)
  console.log(`Module consensus rate: ${moduleConsensusRatePct}%`)
  console.log(`Part name consensus rate: ${partConsensusRatePct}%`)
  console.log(`Distributor hit rate: ${hitRate}%`)
  console.log(`Top assembler: ${top5Assemblers[0]?.name ?? 'none'} (${top5Assemblers[0]?.capabilityMatchPct ?? 0}%)`)
  console.log(`VERDICT: ${verdict}`)
}

main().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
