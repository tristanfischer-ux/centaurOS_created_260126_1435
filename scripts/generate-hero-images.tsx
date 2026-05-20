#!/usr/bin/env npx tsx
/**
 * scripts/generate-hero-images.tsx
 *
 * Sprint 0 v2 (Tristan 2026-05-20): brief-aware hero image generation.
 *
 * The static-class hero PNG library (public/heroes/<slug>-cover.png) is
 * calibrated for ~2 m desktop / cabinet units; briefs for container or
 * warehouse-scale products render at the wrong scale. The iter-9
 * envelope-suppression hides the wrong-scale image, the iter-10 Envelope
 * Outline draws a proportional outline as a placeholder. This script
 * generates a REAL brief-specific cover image so the reader sees the
 * actual product at the actual scale.
 *
 * Pipeline:
 *   1. Read brief envelope dimensions + product class + key visible
 *      components from state.json.
 *   2. Compose a descriptive prompt covering: scale, dominant geometry,
 *      visible components (trolleys / racks / compressor / etc.),
 *      camera viewpoint, technical-illustration style.
 *   3. Call image-gen model via Vercel AI Gateway (OpenAI-compatible).
 *      Default: gpt-image-1. Configurable via IMAGE_GEN_MODEL env.
 *   4. Save PNG to <out-dir>/cover.png (project's output directory —
 *      same dir as state.json). Renderer prefers this over static.
 *   5. Persist state.brief_hero_image_path so the renderer can find it.
 *
 * UNIVERSAL — works for any product class. The prompt composer reads
 * product class + module decomposition + brief envelope dimensions from
 * state.json without hardcoding class-specific behaviour.
 *
 * Usage:
 *   npx tsx scripts/generate-hero-images.tsx <state.json> [--write]
 *
 * Wired into scripts/serial-design-chain-v2.tsx near the end (after all
 * data settled, before render). Skipped via CHAIN_SKIP_IMAGE_GEN=1.
 *
 * Cost: ~$0.04 per cover (gpt-image-1) × 1 image per chain run.
 * Latency: 30-60s.
 *
 * Failure mode: fails soft. If the API call errors out, just don't
 * write the image — renderer falls back to EnvelopeOutline placeholder.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'

const VERCEL_AI_KEY = process.env.VERCEL_AI_GATEWAY_API_KEY ?? loadKey('vercel-ai-gateway.env', 'VERCEL_AI_GATEWAY_API_KEY')
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? loadKey('openai.env', 'OPENAI_API_KEY')
const IMAGE_GEN_MODEL = process.env.IMAGE_GEN_MODEL || 'openai/gpt-image-1'
const IMAGE_SIZE = process.env.IMAGE_GEN_SIZE || '1024x1024'

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

interface BriefSummary {
  productClass: string
  productDisplayName: string
  envelopeMm: { w: number; d: number; h: number } | null
  visibleModules: string[]
  isContainer: boolean
}

function summariseBrief(state: any): BriefSummary {
  const productClass = String(
    state?.moduleDecomposition?.product_class ??
    state?.parsedBrief?.product_class ??
    ''
  )
  const productDisplayName = String(
    state?.parsedBrief?.product_display_name ??
    state?.parsedBrief?.product_description?.split('.')[0] ??
    productClass.replace(/_/g, ' ')
  ).slice(0, 200)
  const maxDim = state?.parsedBrief?.constraints?.max_dimensions_mm
  let envelopeMm: { w: number; d: number; h: number } | null = null
  if (maxDim?.w && maxDim?.d && maxDim?.h) {
    envelopeMm = { w: Number(maxDim.w), d: Number(maxDim.d), h: Number(maxDim.h) }
  }
  const md: any[] = state?.moduleDecomposition?.modules ?? []
  const visibleModules: string[] = []
  for (const m of md.slice(0, 5)) {
    visibleModules.push(String(m?.module ?? '').replace(/_/g, ' '))
  }
  const briefText = String(state?.parsedBrief?.brief_text ?? '')
  const isContainer = /\b(20|40)\s?-?\s?(ft|foot)\s+(iso|hi-?cube|container|shipping)/i.test(briefText)
  return { productClass, productDisplayName, envelopeMm, visibleModules, isContainer }
}

function composePrompt(b: BriefSummary): string {
  const envBlock = b.envelopeMm
    ? `${(b.envelopeMm.w / 1000).toFixed(1)} m long × ${(b.envelopeMm.d / 1000).toFixed(1)} m wide × ${(b.envelopeMm.h / 1000).toFixed(1)} m tall`
    : 'unspecified envelope'
  const containerNote = b.isContainer ? 'standard ISO shipping container with corrugated steel sides and front double-door reveal' : ''
  const moduleNote = b.visibleModules.length > 0
    ? `Visible engineering modules: ${b.visibleModules.join(', ')}.`
    : ''
  return `Technical engineering illustration of a ${b.productDisplayName}.
` +
    `Scale: ${envBlock}. ${containerNote}\n` +
    `${moduleNote}\n` +
    `Style: clean isometric technical illustration with a partial cutaway view exposing internal components. Light grey background. Engineering CAD aesthetic — flat colour fills with thin black outline, no shadows, no photo-realism. Each major module shown in a distinct identity colour. Place the unit on a subtle grid floor for scale reference. NO text, NO labels, NO measurements — pure illustration. Aspect ratio square.`
}

async function generateImageViaVercel(prompt: string): Promise<Buffer | null> {
  if (!VERCEL_AI_KEY) return null
  try {
    const res = await fetch('https://ai-gateway.vercel.sh/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VERCEL_AI_KEY}`,
      },
      body: JSON.stringify({
        model: IMAGE_GEN_MODEL,
        prompt,
        size: IMAGE_SIZE,
        n: 1,
        response_format: 'b64_json',
      }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[image-gen] Vercel AI Gateway ${res.status}: ${errBody.slice(0, 300)}`)
      return null
    }
    const j: any = await res.json()
    const b64: string = j?.data?.[0]?.b64_json ?? ''
    if (!b64) {
      console.error(`[image-gen] no b64_json in response: ${JSON.stringify(j).slice(0, 200)}`)
      return null
    }
    return Buffer.from(b64, 'base64')
  } catch (err) {
    console.error(`[image-gen] Vercel AI Gateway error: ${(err as Error).message}`)
    return null
  }
}

async function generateImageViaOpenAI(prompt: string): Promise<Buffer | null> {
  if (!OPENAI_KEY) return null
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size: IMAGE_SIZE,
        n: 1,
        response_format: 'b64_json',
      }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[image-gen] OpenAI direct ${res.status}: ${errBody.slice(0, 300)}`)
      return null
    }
    const j: any = await res.json()
    const b64: string = j?.data?.[0]?.b64_json ?? ''
    if (!b64) return null
    return Buffer.from(b64, 'base64')
  } catch (err) {
    console.error(`[image-gen] OpenAI direct error: ${(err as Error).message}`)
    return null
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: generate-hero-images.tsx <state.json> [--write]')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const write = args.includes('--write')
  if (!existsSync(statePath)) {
    console.error(`State not found: ${statePath}`)
    process.exit(1)
  }
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const summary = summariseBrief(state)
  if (!summary.productClass) {
    console.error('[image-gen] no product_class found — skipping')
    return
  }
  if (!VERCEL_AI_KEY && !OPENAI_KEY) {
    console.error('[image-gen] no Vercel AI Gateway or OpenAI key — skipping (renderer falls back to EnvelopeOutline)')
    return
  }
  const prompt = composePrompt(summary)
  console.log(`[image-gen] composing cover for ${summary.productDisplayName}`)
  console.log(`[image-gen] prompt: ${prompt.slice(0, 200)}...`)
  const t0 = Date.now()
  let png = await generateImageViaVercel(prompt)
  if (!png && OPENAI_KEY) {
    console.log('[image-gen] Vercel AI failed; trying OpenAI direct')
    png = await generateImageViaOpenAI(prompt)
  }
  if (!png) {
    console.error('[image-gen] all image-gen backends failed — renderer will use EnvelopeOutline fallback')
    return
  }
  const outPath = resolve(dirname(statePath), 'cover.png')
  console.log(`[image-gen] received ${(png.length / 1024).toFixed(1)} KB in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  if (write) {
    writeFileSync(outPath, png)
    state.brief_hero_image_path = outPath
    writeFileSync(statePath, JSON.stringify(state, null, 2))
    console.log(`[image-gen] wrote ${outPath} + updated state.brief_hero_image_path`)
  } else {
    console.log(`[image-gen] dry run — pass --write to persist (would write ${outPath})`)
  }
}

main().catch((err) => {
  console.error(`[image-gen] FATAL: ${err}`)
  process.exit(1)
})
