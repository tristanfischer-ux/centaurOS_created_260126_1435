#!/usr/bin/env npx tsx
/**
 * scripts/generate-module-images.tsx
 *
 * Per-module image generation via Gemini 3.1 Flash Image preview i2i.
 *
 * Rewritten 2026-05-21 (council a66e6ee7cdd05270f verdict). Was: text-
 * only N×gpt-image-1 calls — every module looked stylistically
 * different because each call's text prompt drifted, breaking the
 * "this is a zoom into the same product" narrative.
 *
 * Now: validated 2026-05-16 pipeline (8.2/10 vs 6.0/10 text-only).
 * For each module, call Gemini Flash Image with TWO reference images:
 *   1. The hero cover.png (the canonical AI-generated hero from
 *      generate-hero-images.tsx)
 *   2. A programmatic palette card (module-id → hex swatches +
 *      finish/lighting contract text)
 * Both references constrain Gemini to produce a close-up that reads
 * as a zoom into the same product, with matching palette / finish /
 * lighting.
 *
 * Universal across product classes.
 *
 * Cost: ~$0.07 per image × N modules. Default N=11 ≈ $0.77 per run.
 * Latency: ~13-25 s per image. Concurrency 3 → ~1.5-2 min total.
 *
 * Output:
 *   <out-dir>/module-<id>.png per module
 *
 * State fields written:
 *   state.module_image_paths = { "<module_id>": "<abs>/module-<id>.png", ... }
 *
 * Failure modes:
 *   - No hero (state.brief_hero_image_path missing or file absent) →
 *     skip entirely (modules need the hero as reference).
 *   - Per-module Gemini failure → that module's entry is skipped;
 *     other modules continue.
 *
 * Usage:
 *   npx tsx scripts/generate-module-images.tsx <state.json> [--write]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import {
  callGeminiI2I,
  composeModulePrompt,
  buildPaletteCardPng,
  readImageRef,
  writeImage,
  runBlenderModulePass,
  moduleAzimuth,
  type ImageRef,
} from './lib/illustration-i2i'

const CONCURRENCY = Number(process.env.MODULE_IMAGE_CONCURRENCY || 3)

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
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  if (modules.length === 0) {
    console.error('[modules] no modules in state — skipping')
    return
  }
  const heroPath = String(state?.brief_hero_image_path ?? '')
  if (!heroPath || !existsSync(heroPath)) {
    console.error('[modules] state.brief_hero_image_path missing or file absent — generate the hero first')
    return
  }
  const heroRef = readImageRef(heroPath)
  if (!heroRef) {
    console.error('[modules] hero image unreadable')
    return
  }

  // Build palette card from module ids
  const moduleIds = modules.map((m) => String(m?.module ?? '')).filter(Boolean)
  console.log(`[modules] building palette card for ${moduleIds.length} module(s)...`)
  const paletteCardData = await buildPaletteCardPng(moduleIds)
  const paletteRef: ImageRef = { data: paletteCardData, mime: 'image/png' }
  const outDir = dirname(statePath)
  writeImage(resolve(outDir, 'palette-card.png'), paletteCardData)

  // 2026-05-21 (Tristan second critique): "the images you are using for
  // the modules still look like photorealistic AI renders that look great
  // but are inaccurate from an engineering perspective. you are supposed
  // to be using blender to do a 3d CAD model that has all the components
  // that are in the right size and place spatially."
  //
  // Per-module images now use the Blender output DIRECTLY (no Gemini
  // i2i paint-over). The Blender pipeline renders the engineering-truth
  // geometry — focal module saturated + sibling modules greyscale —
  // which IS the spatial accuracy the reader needs on the module pages.
  // Gemini photoreal stays at the COVER hero only (where polish matters
  // more than spatial precision).
  //
  // FOLLOW-UP NEEDED (separate task): the current render-product-
  // blender.py renders modules as solid coloured boxes inside the
  // envelope. To match Tristan's "all the components that are in the
  // right size and place spatially" requirement, render-product-blender
  // .py needs to read sub_modules + words from state.json and emit
  // recognisable component shapes (battery rack, compressor, control
  // panel, etc.) inside each module's bounding box. That's a Python
  // change — deferred to a separate commit.
  console.log(`[modules] Blender per-module CAD render (engineering-truth, no Gemini paint-over)`)
  const tBlender = Date.now()
  const modulePaths: Record<string, string> = {}
  for (let i = 0; i < moduleIds.length; i++) {
    const id = moduleIds[i]
    const az = moduleAzimuth(i, moduleIds.length)
    const blenderOut = resolve(outDir, `module-${id}.png`)  // direct: Blender → module-<id>.png (no -blender suffix)
    const path = runBlenderModulePass({ statePath, moduleId: id, azimuth: az, outPath: blenderOut })
    if (path) {
      modulePaths[id] = path
      console.log(`[modules]   ${Object.keys(modulePaths).length}/${moduleIds.length} ${id} → ${path}`)
    } else {
      console.log(`[modules]   ${id} — Blender failed (binary absent or render error)`)
    }
  }
  console.log(`[modules] Blender complete: ${Object.keys(modulePaths).length}/${moduleIds.length} in ${((Date.now() - tBlender) / 1000).toFixed(1)}s`)

  // Mark the hero + palette as not used per module (they're for the
  // cover only now) but keep refs computed so we don't waste them —
  // future Gemini-on-cover-only path may still want them.
  void heroRef; void paletteRef
  const t0 = Date.now(); void t0

  // No Gemini per-module pass — the Blender CAD render IS the module
  // image now. Loop below kept as a fallback skeleton (zero iters
  // unless re-enabled in a follow-up).
  const tasks: Array<{ id: string; outPath: string }> = []
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(async (t) => {
      const prompt = composeModulePrompt(state, t.id)
      void prompt
      return { id: t.id, path: null, ok: false }
    }))
    for (const r of results) {
      if (r.ok && r.path) {
        modulePaths[r.id] = r.path
        console.log(`[modules]   ${Object.keys(modulePaths).length}/${tasks.length} ${r.id} → ${r.path}`)
      } else {
        console.log(`[modules]   ${r.id} — FAILED`)
      }
    }
  }

  console.log(`[modules] generated ${Object.keys(modulePaths).length}/${tasks.length} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  if (write) {
    state.module_image_paths = { ...(state.module_image_paths ?? {}), ...modulePaths }
    writeFileSync(statePath, JSON.stringify(state, null, 2))
    console.log(`[modules] updated state.module_image_paths with ${Object.keys(modulePaths).length} entries`)
  } else {
    console.log(`[modules] dry run — pass --write to persist`)
  }
}

main().catch((err) => {
  console.error(`[modules] FATAL: ${err}`)
  process.exit(1)
})
