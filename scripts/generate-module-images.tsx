#!/usr/bin/env npx tsx
/**
 * scripts/generate-module-images.tsx
 *
 * Sprint 0 v3 (Tristan 2026-05-20): per-module brief-aware image
 * generation. Extends generate-hero-images.tsx (v2 cover) to also
 * generate one schematic per module. Same pipeline + cost profile.
 *
 * Pipeline:
 *   1. Read state.moduleDecomposition.modules.
 *   2. For each module: compose a module-focused prompt covering the
 *      sub-modules + their key components. Set within the product
 *      envelope so scale stays consistent.
 *   3. Call Vercel AI Gateway / OpenAI gpt-image-1 (concurrency 3 to
 *      avoid rate-limits + control cost).
 *   4. Save PNGs to <out-dir>/module-<id>.png.
 *   5. Persist state.module_image_paths = { module_id: path } so the
 *      renderer can find them.
 *
 * UNIVERSAL — works for any product class.
 *
 * Cost: ~$0.04 per image × N modules. Default N=10-12 = $0.40-0.50
 * per chain run. Latency: ~3-5 min total (concurrency 3).
 *
 * Skipped via CHAIN_SKIP_MODULE_IMAGES=1 (default ON until tested).
 * The cover-only v2 is the default — per-module is opt-in.
 *
 * Usage:
 *   npx tsx scripts/generate-module-images.tsx <state.json> [--write]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'

const VERCEL_AI_KEY = process.env.VERCEL_AI_GATEWAY_API_KEY ?? loadKey('vercel-ai-gateway.env', 'VERCEL_AI_GATEWAY_API_KEY')
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? loadKey('openai.env', 'OPENAI_API_KEY')
const IMAGE_GEN_MODEL = process.env.IMAGE_GEN_MODEL || 'openai/gpt-image-1'
const IMAGE_SIZE = process.env.IMAGE_GEN_SIZE || '1024x1024'
const CONCURRENCY = Number(process.env.IMAGE_GEN_CONCURRENCY || 3)

function loadKey(envFile: string, varName: string): string | undefined {
  const candidates = [
    `/Users/tristanfischer/.claude/secrets/${envFile}`,
    `/Users/tristanfischer/secrets/${envFile}`,
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    const txt = readFileSync(p, 'utf-8')
    const m = txt.match(new RegExp(`${varName}\\s*=\\s*['"]?([^'"\\s]+)['"]?`))
    if (m) return m[1]
  }
  return undefined
}

interface ModuleSummary {
  module: string
  display: string
  briefText: string
  subModulesText: string
}

function summariseModule(m: any): ModuleSummary {
  const moduleId = String(m?.module ?? '')
  const display = String(m?.display_name ?? moduleId.replace(/_/g, ' '))
  const briefText = String(m?.module_brief ?? '').slice(0, 280)
  const subModules: any[] = Array.isArray(m?.sub_modules) ? m.sub_modules : []
  const subModulesText = subModules.slice(0, 5).map((s: any) => {
    const subName = String(s?.name_human ?? s?.id ?? '').replace(/_/g, ' ')
    const wordCount = Array.isArray(s?.words) ? s.words.length : 0
    return `${subName} (${wordCount} parts)`
  }).join(', ')
  return { module: moduleId, display, briefText, subModulesText }
}

function composeModulePrompt(productClass: string, productDisplay: string, env: { w: number; d: number; h: number } | null, m: ModuleSummary): string {
  const envBlock = env
    ? `${(env.w / 1000).toFixed(1)} m × ${(env.d / 1000).toFixed(1)} m × ${(env.h / 1000).toFixed(1)} m`
    : 'unspecified envelope'
  return `Technical engineering illustration of the ${m.display} module of a ${productDisplay}.\n` +
    `Parent product envelope: ${envBlock}.\n` +
    `Module brief: ${m.briefText}\n` +
    `Sub-modules: ${m.subModulesText}\n` +
    `Style: isometric technical illustration with cutaway view exposing key components. Light grey background, flat colour fills, thin black outlines, no shadows. THIS MODULE highlighted in a distinct identity colour; surrounding context faded. CAD aesthetic, engineering schematic style. NO text, NO labels, NO measurements — illustration only. Square aspect ratio.`
}

async function generateImageViaVercel(prompt: string): Promise<Buffer | null> {
  if (!VERCEL_AI_KEY) return null
  try {
    const res = await fetch('https://ai-gateway.vercel.sh/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VERCEL_AI_KEY}` },
      body: JSON.stringify({
        model: IMAGE_GEN_MODEL,
        prompt,
        size: IMAGE_SIZE,
        n: 1,
        response_format: 'b64_json',
      }),
    })
    if (!res.ok) return null
    const j: any = await res.json()
    const b64: string = j?.data?.[0]?.b64_json ?? ''
    if (!b64) return null
    return Buffer.from(b64, 'base64')
  } catch { return null }
}

async function generateImageViaOpenAI(prompt: string): Promise<Buffer | null> {
  if (!OPENAI_KEY) return null
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, size: IMAGE_SIZE, n: 1, response_format: 'b64_json' }),
    })
    if (!res.ok) return null
    const j: any = await res.json()
    const b64: string = j?.data?.[0]?.b64_json ?? ''
    if (!b64) return null
    return Buffer.from(b64, 'base64')
  } catch { return null }
}

async function processOne(prompt: string): Promise<Buffer | null> {
  let png = await generateImageViaVercel(prompt)
  if (!png && OPENAI_KEY) png = await generateImageViaOpenAI(prompt)
  return png
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: generate-module-images.tsx <state.json> [--write]')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const write = args.includes('--write')
  if (!existsSync(statePath)) {
    console.error(`State not found: ${statePath}`)
    process.exit(1)
  }
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const productClass = String(state?.moduleDecomposition?.product_class ?? state?.parsedBrief?.product_class ?? '')
  const productDisplay = String(state?.parsedBrief?.product_display_name ?? productClass.replace(/_/g, ' '))
  const maxDim = state?.parsedBrief?.constraints?.max_dimensions_mm
  const env = (maxDim?.w && maxDim?.d && maxDim?.h)
    ? { w: Number(maxDim.w), d: Number(maxDim.d), h: Number(maxDim.h) }
    : null
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  if (modules.length === 0) {
    console.error('[module-images] no modules — skipping')
    return
  }
  if (!VERCEL_AI_KEY && !OPENAI_KEY) {
    console.error('[module-images] no image-gen key — skipping')
    return
  }
  const outDir = dirname(statePath)
  const tasks = modules.map((m) => {
    const s = summariseModule(m)
    return {
      module: s.module,
      prompt: composeModulePrompt(productClass, productDisplay, env, s),
      outPath: resolve(outDir, `module-${s.module}.png`),
    }
  })

  console.log(`[module-images] generating ${tasks.length} module images (concurrency ${CONCURRENCY})`)
  const t0 = Date.now()
  const modulePaths: Record<string, string> = {}
  let done = 0

  // Concurrency-limited processor
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(async (t) => {
      const png = await processOne(t.prompt)
      if (png) {
        if (write) writeFileSync(t.outPath, png)
        return { module: t.module, path: t.outPath, ok: true }
      }
      return { module: t.module, path: null, ok: false }
    }))
    for (const r of results) {
      done++
      if (r.ok && r.path) {
        modulePaths[r.module] = r.path
        console.log(`[module-images]   [${done}/${tasks.length}] ${r.module} → ${r.path}`)
      } else {
        console.log(`[module-images]   [${done}/${tasks.length}] ${r.module} — FAILED`)
      }
    }
  }

  console.log(`[module-images] generated ${Object.keys(modulePaths).length}/${tasks.length} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  if (write) {
    state.module_image_paths = modulePaths
    writeFileSync(statePath, JSON.stringify(state, null, 2))
    console.log(`[module-images] updated state.module_image_paths with ${Object.keys(modulePaths).length} entries`)
  } else {
    console.log(`[module-images] dry run — pass --write to persist`)
  }
}

main().catch((err) => {
  console.error(`[module-images] FATAL: ${err}`)
  process.exit(1)
})
