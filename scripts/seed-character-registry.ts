#!/usr/bin/env npx tsx
/**
 * @file seed-character-registry.ts — bulk seed-expansion for the pdf-engine-v2
 *       `character_registry` Supabase table.
 *
 * Pipeline:
 *   1. Gemini 3.1 Flash-Lite (Google-Search-grounded, thinking_level=high)
 *      proposes 80–150 canonical character_ids covering the full BoM for a
 *      product class, each with semantic radicals + MPN hints + manufacturer.
 *   2. Tavily verifies the first MPN per character (concurrency 10).
 *   3. Service-role Supabase client UPSERTs into `character_registry` with
 *      `ON CONFLICT (character_id) DO UPDATE` that array-appends the new
 *      product class without duplicating it.
 *
 * Usage:
 *   npx tsx scripts/seed-character-registry.ts \
 *     --product-class energy_storage \
 *     [--count 150] \
 *     [--dry-run] \
 *     [--no-verify]
 *
 * Auth + env:
 *   • OPENROUTER_API_KEY            — for Gemini 3.1 Flash-Lite
 *   • TAVILY_API_KEY                — for MPN verification
 *   • NEXT_PUBLIC_SUPABASE_URL      — Supabase project URL
 *   • SUPABASE_SERVICE_ROLE_KEY     — bypasses RLS (service-role policy)
 *
 *   Loaded from (in order, first wins):
 *     - process.env (e.g. CI)
 *     - .env.local in repo root
 *     - ~/.claude/secrets/openrouter.env
 *     - ~/.claude/secrets/tavily.env
 *     - ~/.claude/secrets/distributor-apis.env (kept for parity with run.ts)
 *
 * Notes:
 *   - Re-running for a different product class is safe: existing rows have
 *     the new class array-appended; new rows are inserted.
 *   - Re-running for the SAME product class is a no-op for existing rows
 *     (the array-append CASE guards against duplicates).
 *   - Costs at default settings (~150 character_ids, verify on):
 *       Flash-Lite: ~£0.05 (1 grounded call, ~30k output tokens)
 *       Tavily:     ~150 searches × $0.005 = ~£0.60
 *     Wall clock: roughly 90–180s.
 */

// ─── Env loader (same pattern as src/lib/pdf-engine-v2/run.ts) ──────────────
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

const envFilesToLoad = [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/openrouter.env'),
  resolve(homedir(), '.claude/secrets/tavily.env'),
  resolve(homedir(), '.claude/secrets/distributor-apis.env'),
]

for (const envPath of envFilesToLoad) {
  try {
    const envContent = readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=')
        const value = valueParts.join('=').replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  } catch {
    // env file not found — continue with existing env
  }
}

import { createClient } from '@supabase/supabase-js'
import {
  GEMINI_3_1_FLASH_LITE,
  callFastExtract,
} from '../src/lib/pdf-engine-v2/lib/openrouter-models'
import { webSearch } from '../src/lib/pdf-engine-v2/lib/search-client'
import { CONTENT_RADICALS } from '../src/lib/pdf-engine-v2/types/module-decomposition'

// ─── Types ──────────────────────────────────────────────────────────────────

type PartClass =
  | 'electronic_cots'
  | 'mechanical_cots'
  | 'oem_subsystem'
  | 'structural_fabricated'
  | 'software_ip'

type SourceGrade =
  | 'verified'
  | 'priced'
  | 'canonical'
  | 'plausible'
  | 'unverified'

type UnitPriceSource =
  | 'distributor'
  | 'vendor_catalog'
  | 'tavily_extract'
  | 'plausibility_inferred'
  | 'training_data'

interface ProposedCharacter {
  character_id: string
  name_human: string
  function_radical_primary: string | null
  material_radical_primary: string | null
  function_radical_secondary: string | null
  material_radical_secondary: string | null
  part_class: PartClass
  mpn_hints: string[]
  manufacturer: string | null
  vendor_catalog_part_type: string | null
  typical_unit_price_gbp: number | null
  rationale: string
}

interface VerifiedCharacter extends ProposedCharacter {
  verified: boolean
  source_url: string | null
  verification_query: string | null
}

// ─── Supported product classes (matches PA Stage 0/0.5 vocabulary) ──────────

const PRODUCT_CLASSES = [
  'energy_storage',
  'cgm',
  'drone',
  'edge_ai',
  'heatpump',
  'ev_charger',
  'bioreactor',
  'vertical_farm',
  'auv',
  'haps',
] as const
type ProductClass = (typeof PRODUCT_CLASSES)[number]

const PRODUCT_CLASS_DESCRIPTIONS: Record<ProductClass, string> = {
  energy_storage:
    'containerised battery energy storage system, 3.5 MWh, LFP prismatic cells, 1 MW PCS, grid-tied, UK market. Generate 80–150 canonical character_ids covering the entire BoM: cells + interconnects + BMS + thermal + fire suppression + PCS + container + EMS + safety + comms + monitoring.',
  cgm:
    'continuous glucose monitor wearable patch, 14-day disposable, BLE 5.x to smartphone, factory-calibrated enzymatic sensor. Generate 80–150 canonical character_ids covering the entire BoM: sensor electrode stack + ASIC front-end + MCU + BLE radio + button cell + housing + adhesive + applicator + packaging.',
  drone:
    'multi-rotor inspection drone, 5–7 kg MTOW, 30-minute endurance, RTK-GNSS, 4K gimbal payload, BVLOS-class telemetry. Generate 80–150 canonical character_ids covering airframe + propulsion + ESCs + flight controller + battery + RTK module + telemetry radio + camera/gimbal + landing gear + parachute + remote controller.',
  edge_ai:
    'edge AI inference box for factory line monitoring, 30 W TDP, fanless, IP54, GbE + Wi-Fi 6E + 5G modem, supports 8-channel PoE camera fan-in. Generate 80–150 canonical character_ids covering SoM + NPU/SoC + DDR + eMMC/NVMe + power tree + PoE injector + RF front-ends + chassis + thermal + I/O connectors.',
  heatpump:
    'air-source heat pump for UK retrofit, 8 kW thermal output, R290 refrigerant, A-rated, MCS-compliant. Generate 80–150 canonical character_ids covering compressor + heat exchangers + expansion valve + refrigerant circuit + circulation pump + inverter + controller + casing + sensors + insulation + safety.',
  ev_charger:
    '22 kW AC EV charger wallbox + 50 kW DC fast charger reference, Type 2 / CCS2, OCPP 2.0.1, UK market. Generate 80–150 canonical character_ids covering contactor stack + RCD + connector assembly + PFC/LLC stage + power module + EMC filters + MCU controller + RFID + display + enclosure.',
  bioreactor:
    'single-use 200 L stainless-steel bioreactor for monoclonal antibody production, CIP/SIP, mass-flow gas mixing, BMS-controlled. Generate 80–150 canonical character_ids covering vessel + agitator + sparger + filters + sensors (pH/DO/temp/level) + pumps + valves + control system + utility skid.',
  vertical_farm:
    'vertical-farming grow rack module, 4-tier hydroponic NFT, full-spectrum LED, automated dosing, climate-controlled room scale. Generate 80–150 canonical character_ids covering rack structure + LED arrays + drivers + pumps + dosing + sensors + reservoirs + plumbing + controls + automation.',
  auv:
    'autonomous underwater vehicle, 100 m depth rating, 8 h endurance, payload bay, inertial + DVL + acoustic navigation. Generate 80–150 canonical character_ids covering pressure hull + thrusters + Li-ion battery + INS/DVL + acoustic modem + payload sensors + lights + buoyancy + recovery + comms.',
  haps:
    'high-altitude pseudo-satellite, stratospheric solar-electric UAV, 20 km altitude, multi-month endurance, comms relay payload. Generate 80–150 canonical character_ids covering composite airframe + solar arrays + Li-S/Li-ion battery + propulsion + autopilot + SATCOM + payload + thermal control + GNC sensors.',
}

// ─── CLI parsing ────────────────────────────────────────────────────────────

interface Cli {
  productClass: ProductClass
  count: number
  dryRun: boolean
  noVerify: boolean
}

function parseCli(argv: string[]): Cli {
  let productClass: string | undefined
  let count = 150
  let dryRun = false
  let noVerify = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--product-class') {
      productClass = argv[++i]
    } else if (arg === '--count') {
      count = parseInt(argv[++i] ?? '', 10)
      if (!Number.isFinite(count) || count <= 0) {
        throw new Error(`--count must be a positive integer, got '${argv[i]}'`)
      }
    } else if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--no-verify') {
      noVerify = true
    } else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!productClass) {
    printUsage()
    throw new Error('Missing required --product-class')
  }
  if (!(PRODUCT_CLASSES as readonly string[]).includes(productClass)) {
    throw new Error(
      `Invalid --product-class '${productClass}'. Must be one of: ${PRODUCT_CLASSES.join(', ')}`,
    )
  }

  return { productClass: productClass as ProductClass, count, dryRun, noVerify }
}

function printUsage(): void {
  console.error(
    [
      'Usage:',
      '  npx tsx scripts/seed-character-registry.ts \\',
      '    --product-class <energy_storage|cgm|drone|edge_ai|heatpump|ev_charger|bioreactor|vertical_farm|auv|haps> \\',
      '    [--count 150] \\',
      '    [--dry-run] \\',
      '    [--no-verify]',
    ].join('\n'),
  )
}

// ─── Step 1: Flash-Lite proposes ─────────────────────────────────────────────

function buildSystemPrompt(): string {
  return [
    'You are a hardware engineering BoM expert. Given a product class, list the canonical character_ids (BoM part types) that appear in real-world products of that class. For each character_id, provide its semantic composition (radicals) and real-world MPN/manufacturer hints.',
    '',
    'Output ONLY a JSON object with this shape:',
    '{',
    '  "character_ids": [',
    '    {',
    '      "character_id": "snake_case_id",',
    '      "name_human": "Plain English label",',
    '      "function_radical_primary": "one of the 22 canonical content radicals",',
    '      "material_radical_primary": "one of the 22 canonical content radicals (e.g. copper, steel, lithium_iron_phosphate_chemistry)",',
    '      "function_radical_secondary": null | "second canonical radical",',
    '      "material_radical_secondary": null | "second canonical radical",',
    '      "part_class": "electronic_cots" | "mechanical_cots" | "oem_subsystem" | "structural_fabricated" | "software_ip",',
    '      "mpn_hints": ["MPN1", "MPN2", "MPN3"],',
    '      "manufacturer": "Canonical manufacturer name" | null,',
    '      "vendor_catalog_part_type": "matching partType from VENDOR_CATALOG" | null,',
    '      "typical_unit_price_gbp": number | null,',
    '      "rationale": "1-sentence why this is in the BoM"',
    '    }',
    '  ]',
    '}',
    '',
    'Constraints:',
    '- ONLY use the 22 canonical content radicals provided. Do NOT invent new radicals.',
    '- Real-world parts only. If you do not know an MPN, leave mpn_hints empty. Do NOT fabricate MPNs.',
    '- MANDATORY MINIMUM: 80 character_ids. Target 120-150. Outputs with fewer than 80 entries will be rejected. Cover the ENTIRE BoM (cells/sensors/connectors/fasteners/PCBs/enclosure/wiring/thermal/safety/comms/monitoring/software) — not just headline subsystems.',
    '- Manufacturer names must be verifiable (CATL, Sungrow, TE Connectivity, etc.).',
    '- Use Google Search grounding to verify any specific MPN before including it.',
    '- Be concise per row: rationale = ONE short sentence (max 15 words). Do not pad explanations.',
    '- First character of output MUST be {. No commentary, no markdown fences.',
    '',
    `Canonical 22 content radicals: ${JSON.stringify(CONTENT_RADICALS)}`,
  ].join('\n')
}

function buildUserPrompt(pc: ProductClass, count: number): string {
  return [
    `Product class: ${pc}`,
    `Description: ${PRODUCT_CLASS_DESCRIPTIONS[pc]}`,
    `Count target: ${count} (HARD FLOOR: 80. Anything less is a failed response.)`,
    '',
    'Checklist — make sure every applicable category has multiple character_ids before stopping:',
    '  1. Active power components (cells/converters/motors/heaters)',
    '  2. Passive electrical (busbars, wiring, terminals, connectors, fuses, contactors, breakers)',
    '  3. Semiconductors (ICs, MOSFETs, IGBTs, diodes, gate drivers, isolators)',
    '  4. PCB assemblies (controllers, monitors, sensor boards, IO boards)',
    '  5. Sensors (temperature, current, voltage, gas, smoke, pressure, vibration, IMU)',
    '  6. Thermal (heat exchangers, fans, pumps, coolant, insulation, gaskets, TIM)',
    '  7. Mechanical / structural (frames, racks, enclosures, doors, bolts, brackets, mounts)',
    '  8. Safety (fire suppression, RCD, e-stop, interlocks, alarms, signage)',
    '  9. Communications (CAN, Ethernet, RS485, modems, antennae, switches)',
    ' 10. Embedded / software (firmware blocks, EMS controller, BMS firmware, cloud agent)',
  ].join('\n')
}

function stripJsonFences(text: string): string {
  let t = text.trim()
  // Strip ``` or ```json prefix
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  }
  return t.trim()
}

function extractJsonObject(text: string): string {
  // Take from first '{' to the matching closing '}'. We trust the LLM's
  // pretty-printer (never pre-escape newlines inside string literals —
  // see MEMORY drawer forgeos_json_parser_newline_pre_escape_antipattern).
  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in LLM output')
  // Walk to find matching brace, respecting string literals.
  // Also remember the last fully-closed inner object at depth==2 (a row
  // inside character_ids[]) so we can recover from truncation.
  let depth = 0
  let inString = false
  let escape = false
  let lastRowCloseAtDepth2 = -1
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
      if (depth === 1) lastRowCloseAtDepth2 = i // just closed a row inside the array
    }
  }
  // Truncation recovery: if we never returned to depth 0 but we DID close at
  // least one row in the character_ids array, splice the input just after the
  // last complete row and append `]}` to close the array + outer object.
  if (lastRowCloseAtDepth2 !== -1) {
    const head = text.slice(start, lastRowCloseAtDepth2 + 1)
    const reconstructed = `${head}\n]}`
    console.warn(
      `[propose] LLM output appears truncated — recovering parseable prefix (${lastRowCloseAtDepth2 + 1 - start} chars)`,
    )
    return reconstructed
  }
  throw new Error('Unbalanced braces in LLM output (no recoverable rows)')
}

async function proposeCharacters(
  pc: ProductClass,
  count: number,
): Promise<{ proposals: ProposedCharacter[]; rawText: string }> {
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(pc, count)
  console.error(
    `[propose] Calling ${GEMINI_3_1_FLASH_LITE} (thinking=high, grounded=true, maxTokens=64000)…`,
  )
  const t0 = Date.now()
  const rawText = await callFastExtract(userPrompt, {
    systemPrompt,
    thinkingLevel: 'high',
    groundWithGoogleSearch: true,
    maxTokens: 64_000,
    temperature: 0,
    timeoutMs: 300_000, // 5 min — high thinking + grounding can be slow
  })
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  console.error(`[propose] Got ${rawText.length} chars in ${dt}s`)

  const cleaned = stripJsonFences(rawText)
  const jsonStr = extractJsonObject(cleaned)
  let parsed: { character_ids?: unknown }
  try {
    parsed = JSON.parse(jsonStr) as { character_ids?: unknown }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[propose] JSON.parse failed:', msg)
    console.error('[propose] First 500 chars:', jsonStr.slice(0, 500))
    throw new Error(`Failed to parse LLM output as JSON: ${msg}`)
  }
  if (!Array.isArray(parsed.character_ids)) {
    throw new Error(
      `LLM output missing 'character_ids' array. Got keys: ${Object.keys(parsed).join(',')}`,
    )
  }

  const validated: ProposedCharacter[] = []
  const allowedPartClasses: PartClass[] = [
    'electronic_cots',
    'mechanical_cots',
    'oem_subsystem',
    'structural_fabricated',
    'software_ip',
  ]

  for (const rawRow of parsed.character_ids) {
    if (!rawRow || typeof rawRow !== 'object') continue
    const row = rawRow as Record<string, unknown>
    const character_id = typeof row.character_id === 'string' ? row.character_id.trim() : ''
    if (!character_id || !/^[a-z0-9_]+$/.test(character_id)) {
      console.warn(`[propose] Skipping invalid character_id: ${JSON.stringify(row.character_id)}`)
      continue
    }
    const part_class_raw = typeof row.part_class === 'string' ? row.part_class : ''
    if (!allowedPartClasses.includes(part_class_raw as PartClass)) {
      console.warn(
        `[propose] Skipping ${character_id}: invalid part_class '${part_class_raw}'`,
      )
      continue
    }
    const mpn_raw = row.mpn_hints
    const mpn_hints = Array.isArray(mpn_raw)
      ? mpn_raw.filter((m): m is string => typeof m === 'string' && m.trim().length > 0).map((m) => m.trim())
      : []

    const radicalOrNull = (v: unknown): string | null => {
      if (v === null || v === undefined) return null
      if (typeof v !== 'string') return null
      const trimmed = v.trim()
      if (!trimmed) return null
      if (!(CONTENT_RADICALS as readonly string[]).includes(trimmed)) {
        console.warn(
          `[propose] ${character_id}: non-canonical radical '${trimmed}' — coercing to null`,
        )
        return null
      }
      return trimmed
    }
    const priceRaw = row.typical_unit_price_gbp
    const price = typeof priceRaw === 'number' && Number.isFinite(priceRaw) ? priceRaw : null

    validated.push({
      character_id,
      name_human: typeof row.name_human === 'string' ? row.name_human : character_id,
      function_radical_primary: radicalOrNull(row.function_radical_primary),
      material_radical_primary: radicalOrNull(row.material_radical_primary),
      function_radical_secondary: radicalOrNull(row.function_radical_secondary),
      material_radical_secondary: radicalOrNull(row.material_radical_secondary),
      part_class: part_class_raw as PartClass,
      mpn_hints,
      manufacturer:
        typeof row.manufacturer === 'string' && row.manufacturer.trim().length > 0
          ? row.manufacturer.trim()
          : null,
      vendor_catalog_part_type:
        typeof row.vendor_catalog_part_type === 'string' && row.vendor_catalog_part_type.trim().length > 0
          ? row.vendor_catalog_part_type.trim()
          : null,
      typical_unit_price_gbp: price,
      rationale: typeof row.rationale === 'string' ? row.rationale : '',
    })
  }

  // De-duplicate by character_id (keep first occurrence — LLM occasionally emits dupes)
  const seen = new Set<string>()
  const deduped: ProposedCharacter[] = []
  for (const p of validated) {
    if (seen.has(p.character_id)) continue
    seen.add(p.character_id)
    deduped.push(p)
  }
  return { proposals: deduped, rawText }
}

// ─── Step 2: Tavily verifies MPNs ────────────────────────────────────────────

const VERIFY_CONCURRENCY = 10

async function verifyOne(p: ProposedCharacter): Promise<VerifiedCharacter> {
  if (p.mpn_hints.length === 0) {
    return { ...p, verified: false, source_url: null, verification_query: null }
  }
  const mpn = p.mpn_hints[0]
  const query = `${mpn} ${p.manufacturer ?? ''} manufacturer datasheet`.trim()
  try {
    const results = await webSearch({ query, maxResults: 3 })
    if (results.length === 0) {
      return { ...p, verified: false, source_url: null, verification_query: query }
    }
    // Match heuristic: any result title/snippet/url contains the MPN OR the manufacturer.
    const mpnLower = mpn.toLowerCase()
    const mfgLower = (p.manufacturer ?? '').toLowerCase()
    const matched = results.find((r) => {
      const haystack = `${r.title} ${r.snippet} ${r.url}`.toLowerCase()
      if (haystack.includes(mpnLower)) return true
      if (mfgLower && mfgLower.length >= 3 && haystack.includes(mfgLower)) return true
      return false
    })
    if (matched) {
      return { ...p, verified: true, source_url: matched.url, verification_query: query }
    }
    return {
      ...p,
      verified: false,
      source_url: results[0]?.url ?? null,
      verification_query: query,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[verify] ${p.character_id} (${mpn}): ${msg}`)
    return { ...p, verified: false, source_url: null, verification_query: query }
  }
}

async function verifyAll(proposals: ProposedCharacter[]): Promise<VerifiedCharacter[]> {
  const results: VerifiedCharacter[] = new Array(proposals.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (true) {
      const idx = next++
      if (idx >= proposals.length) return
      results[idx] = await verifyOne(proposals[idx])
      done++
      if (done % 10 === 0 || done === proposals.length) {
        console.error(`[verify] ${done}/${proposals.length}`)
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(VERIFY_CONCURRENCY, proposals.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

// ─── Step 3: Upsert into Supabase ────────────────────────────────────────────

function deriveSourceGrade(c: VerifiedCharacter): SourceGrade {
  if (c.verified) return 'verified'
  if (c.typical_unit_price_gbp !== null && c.typical_unit_price_gbp > 0) return 'priced'
  return 'canonical'
}

function deriveUnitPriceSource(c: VerifiedCharacter): UnitPriceSource | null {
  if (c.verified) return 'tavily_extract'
  if (c.typical_unit_price_gbp !== null && c.typical_unit_price_gbp > 0) {
    return 'training_data'
  }
  return null
}

function deriveConfidence(c: VerifiedCharacter): number {
  if (c.verified) return 0.85
  if (c.typical_unit_price_gbp !== null && c.typical_unit_price_gbp > 0) return 0.75
  return 0.6
}

interface UpsertResult {
  inserted: number
  updated: number
  skipped: number
  errors: number
}

interface RegistryRow {
  character_id: string
  function_radical_primary: string | null
  material_radical_primary: string | null
  function_radical_secondary: string | null
  material_radical_secondary: string | null
  part_class: PartClass
  mpn_hints: string[]
  manufacturer: string | null
  vendor_catalog_part_type: string | null
  unit_price_gbp: number | null
  unit_price_source: UnitPriceSource | null
  source_url: string | null
  source_grade: SourceGrade
  confidence_score: number
  product_classes: string[]
  last_verified_at: string | null
}

function toRow(c: VerifiedCharacter, productClass: ProductClass): RegistryRow {
  return {
    character_id: c.character_id,
    function_radical_primary: c.function_radical_primary,
    material_radical_primary: c.material_radical_primary,
    function_radical_secondary: c.function_radical_secondary,
    material_radical_secondary: c.material_radical_secondary,
    part_class: c.part_class,
    mpn_hints: c.mpn_hints,
    manufacturer: c.manufacturer,
    vendor_catalog_part_type: c.vendor_catalog_part_type,
    unit_price_gbp: c.typical_unit_price_gbp,
    unit_price_source: deriveUnitPriceSource(c),
    source_url: c.source_url,
    source_grade: deriveSourceGrade(c),
    confidence_score: deriveConfidence(c),
    product_classes: [productClass],
    last_verified_at: c.verified ? new Date().toISOString() : null,
  }
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (Array.isArray(value)) {
    // text[] literal: ARRAY[...]
    if (value.every((v) => typeof v === 'string')) {
      const parts = (value as string[]).map((s) => `'${s.replace(/'/g, "''")}'`)
      return `ARRAY[${parts.join(',')}]::text[]`
    }
    // jsonb array
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

function renderInsertSql(row: RegistryRow): string {
  return [
    'INSERT INTO public.character_registry (',
    '  character_id, function_radical_primary, material_radical_primary,',
    '  function_radical_secondary, material_radical_secondary, part_class,',
    '  mpn_hints, manufacturer, vendor_catalog_part_type,',
    '  unit_price_gbp, unit_price_source, source_url, source_grade,',
    '  confidence_score, product_classes, last_verified_at',
    ') VALUES (',
    [
      sqlLiteral(row.character_id),
      sqlLiteral(row.function_radical_primary),
      sqlLiteral(row.material_radical_primary),
      sqlLiteral(row.function_radical_secondary),
      sqlLiteral(row.material_radical_secondary),
      sqlLiteral(row.part_class),
      // mpn_hints is jsonb
      `'${JSON.stringify(row.mpn_hints).replace(/'/g, "''")}'::jsonb`,
      sqlLiteral(row.manufacturer),
      sqlLiteral(row.vendor_catalog_part_type),
      sqlLiteral(row.unit_price_gbp),
      sqlLiteral(row.unit_price_source),
      sqlLiteral(row.source_url),
      sqlLiteral(row.source_grade),
      sqlLiteral(row.confidence_score),
      sqlLiteral(row.product_classes),
      sqlLiteral(row.last_verified_at),
    ]
      .map((s, i, arr) => `  ${s}${i === arr.length - 1 ? '' : ','}`)
      .join('\n'),
    ')',
    'ON CONFLICT (character_id) DO UPDATE SET',
    '  product_classes = CASE',
    '    WHEN public.character_registry.product_classes @> ARRAY[EXCLUDED.product_classes[1]]::text[]',
    '      THEN public.character_registry.product_classes',
    '    ELSE array_append(public.character_registry.product_classes, EXCLUDED.product_classes[1])',
    '  END,',
    '  -- never downgrade source_grade; upgrade only if EXCLUDED is more confident',
    '  source_grade = CASE',
    "    WHEN EXCLUDED.source_grade = 'verified' THEN 'verified'",
    "    WHEN public.character_registry.source_grade IN ('verified','priced') THEN public.character_registry.source_grade",
    '    ELSE EXCLUDED.source_grade',
    '  END,',
    '  last_verified_at = COALESCE(EXCLUDED.last_verified_at, public.character_registry.last_verified_at)',
    'RETURNING (xmax = 0) AS inserted;',
  ].join('\n')
}

async function upsertAll(
  rows: RegistryRow[],
  productClass: ProductClass,
): Promise<UpsertResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 }

  // Fetch existing rows in one query so we can distinguish inserts from updates,
  // and so we can detect "already has this product class" (skipped).
  const ids = rows.map((r) => r.character_id)
  const { data: existing, error: selErr } = await supabase
    .from('character_registry')
    .select('character_id, product_classes')
    .in('character_id', ids)
  if (selErr) {
    throw new Error(`Failed to read existing character_registry rows: ${selErr.message}`)
  }
  const existingMap = new Map<string, string[]>()
  for (const e of existing ?? []) {
    existingMap.set(e.character_id, (e.product_classes as string[] | null) ?? [])
  }

  // Build the upserted payload — for existing rows we extend the product_classes array.
  for (const row of rows) {
    const existingClasses = existingMap.get(row.character_id)
    let action: 'insert' | 'update' | 'skip'
    let payload: RegistryRow

    if (existingClasses === undefined) {
      // New row.
      action = 'insert'
      payload = row
    } else if (existingClasses.includes(productClass)) {
      // Row exists and already covers this product class.
      action = 'skip'
      payload = row
    } else {
      // Row exists; append the new product class.
      action = 'update'
      payload = { ...row, product_classes: [...existingClasses, productClass] }
    }

    if (action === 'skip') {
      result.skipped++
      continue
    }

    // Use upsert with onConflict so we don't need separate insert/update branches
    // for the rest of the columns. The product_classes value is correct in payload.
    const { error: upErr } = await supabase
      .from('character_registry')
      .upsert(payload, { onConflict: 'character_id' })

    if (upErr) {
      console.error(`[upsert] ${row.character_id}: ${upErr.message}`)
      result.errors++
      continue
    }
    if (action === 'insert') result.inserted++
    else result.updated++
  }

  return result
}

// ─── Cost estimation ─────────────────────────────────────────────────────────

interface CostBreakdown {
  flashLiteGbp: number
  tavilyGbp: number
  totalGbp: number
}

function estimateCost(
  promptTokens: number,
  outputTokens: number,
  tavilyCalls: number,
): CostBreakdown {
  // Gemini 3.1 Flash-Lite: $0.25 / 1M input, $1.50 / 1M output (Google-Search
  // grounding adds ~$0.001 per grounded query, treated as a flat extra below).
  // USD→GBP roughly 0.79 as of 2026-05.
  const usdToGbp = 0.79
  const inputUsd = (promptTokens / 1_000_000) * 0.25
  const outputUsd = (outputTokens / 1_000_000) * 1.5
  const groundingUsd = 0.001 // one grounded call
  const flashLiteGbp = (inputUsd + outputUsd + groundingUsd) * usdToGbp

  // Tavily: $0.005 per basic search.
  const tavilyUsd = tavilyCalls * 0.005
  const tavilyGbp = tavilyUsd * usdToGbp

  return {
    flashLiteGbp,
    tavilyGbp,
    totalGbp: flashLiteGbp + tavilyGbp,
  }
}

// Crude tokeniser: ~4 chars/token. Good enough for cost reporting.
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const cli = parseCli(process.argv.slice(2))

  // Env-key checks up-front so we fail fast.
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('Missing OPENROUTER_API_KEY (.env.local or ~/.claude/secrets/openrouter.env)')
  }
  if (!cli.noVerify && !process.env.TAVILY_API_KEY) {
    throw new Error(
      'Missing TAVILY_API_KEY (.env.local or ~/.claude/secrets/tavily.env). Pass --no-verify to skip verification.',
    )
  }
  if (!cli.dryRun) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (needed unless --dry-run)',
      )
    }
  }

  const t0 = Date.now()
  console.error(
    `[seed] product_class=${cli.productClass} count=${cli.count} dryRun=${cli.dryRun} verify=${!cli.noVerify}`,
  )

  // Step 1: propose.
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(cli.productClass, cli.count)
  const inputTokens = approxTokens(systemPrompt + userPrompt)
  const { proposals, rawText } = await proposeCharacters(cli.productClass, cli.count)
  const outputTokens = approxTokens(rawText)
  console.error(`[seed] Flash-Lite proposed ${proposals.length} character_ids`)

  // Step 2: verify (unless --no-verify).
  let verified: VerifiedCharacter[]
  let tavilyCalls = 0
  if (cli.noVerify) {
    verified = proposals.map((p) => ({
      ...p,
      verified: false,
      source_url: null,
      verification_query: null,
    }))
  } else {
    tavilyCalls = proposals.filter((p) => p.mpn_hints.length > 0).length
    verified = await verifyAll(proposals)
  }

  const verifiedCount = verified.filter((v) => v.verified).length
  const skippedVerifyCount = verified.filter((v) => v.mpn_hints.length === 0).length

  // Step 3: upsert (or print SQL on --dry-run).
  const rows = verified.map((c) => toRow(c, cli.productClass))
  let upsertRes: UpsertResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 }

  if (cli.dryRun) {
    console.log('-- ============================================================')
    console.log(`-- DRY RUN: ${rows.length} character_registry rows for ${cli.productClass}`)
    console.log('-- ============================================================')
    for (const row of rows) {
      console.log(renderInsertSql(row))
      console.log('')
    }
  } else {
    upsertRes = await upsertAll(rows, cli.productClass)
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  const cost = estimateCost(inputTokens, outputTokens, tavilyCalls)

  console.error('')
  console.error(`Seed expansion: ${cli.productClass}`)
  console.error(`  Flash-Lite proposed: ${proposals.length} character_ids`)
  console.error(
    `  Tavily verified: ${verifiedCount} (skipped ${skippedVerifyCount}${cli.noVerify ? ' — verify disabled' : ''})`,
  )
  if (cli.dryRun) {
    console.error(`  DRY RUN — no rows written`)
  } else {
    console.error(`  Inserted (new):    ${upsertRes.inserted}`)
    console.error(`  Updated (existing, added product_class): ${upsertRes.updated}`)
    console.error(`  Skipped (already has product_class): ${upsertRes.skipped}`)
    if (upsertRes.errors > 0) {
      console.error(`  Errors: ${upsertRes.errors}`)
    }
  }
  console.error(
    `  Total cost: £${cost.totalGbp.toFixed(4)} (Flash-Lite £${cost.flashLiteGbp.toFixed(4)} + Tavily £${cost.tavilyGbp.toFixed(4)})`,
  )
  console.error(`  Wall clock: ${dt}s`)

  // Print a 5-row sample for caller inspection (stdout, machine-friendly).
  const sample = verified.slice(0, 5).map((v) => ({
    character_id: v.character_id,
    manufacturer: v.manufacturer,
    mpn_hints: v.mpn_hints,
    verified: v.verified,
    source_url: v.source_url,
    typical_unit_price_gbp: v.typical_unit_price_gbp,
  }))
  console.error('')
  console.error('Sample (first 5):')
  console.error(JSON.stringify(sample, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err))
  process.exit(1)
})
