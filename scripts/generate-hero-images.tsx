#!/usr/bin/env npx tsx
/**
 * scripts/generate-hero-images.tsx
 *
 * Hero (cover) image generation for the ForgeOS PDF Engine v2 chain.
 *
 * Rewritten 2026-05-21 (Tristan critique "bess hero looks terrible";
 * council a66e6ee7cdd05270f verdict). Was: text-only gpt-image-1 via
 * Vercel AI Gateway, producing cartoonish CAD-style line drawings.
 * Now: validated 2026-05-16 BESS-bake-off pipeline (8.2/10):
 *
 *   1. Blender renders ONE structural reference of the envelope
 *      (deterministic geometry, correct module positions, schematic
 *      wireframe quality).
 *   2. Gemini 3.1 Flash Image preview via OpenRouter takes the
 *      Blender PNG as an inlineData reference + a photorealistic-
 *      industrial-photography prompt. Produces the cover hero the
 *      reader actually sees.
 *
 * Universal across product classes. Smoke-tested 2026-05-21:
 * 13.7s, ~$0.07, photorealistic BESS interior with battery racks +
 * liquid cooling manifolds + control panel + HVAC.
 *
 * Output:
 *   <out-dir>/blender-cover.png  — intermediate Blender wireframe
 *   <out-dir>/cover.png           — final Gemini i2i hero (canonical)
 *
 * State fields written:
 *   state.brief_hero_image_path   = "<abs>/cover.png"
 *   state.blender_cover_image_path = "<abs>/blender-cover.png"
 *
 * Failure modes (all fail-soft):
 *   - Blender absent → skip Blender ref, call Gemini text-only with
 *     the same prompt. Output may be less layout-faithful but still
 *     usable.
 *   - Gemini API failure → no cover written; renderer falls back to
 *     EnvelopeOutline placeholder.
 *
 * Usage:
 *   npx tsx scripts/generate-hero-images.tsx <state.json> [--write]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import {
  callGeminiI2I,
  runBlenderCoverPass,
  composeHeroPrompt,
  readImageRef,
  writeImage,
  type ImageRef,
} from './lib/illustration-i2i'

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

  // STEP 1: Blender structural reference
  console.log('[hero] step 1: Blender structural reference cover pass...')
  const t1 = Date.now()
  const blenderCoverPath = runBlenderCoverPass(statePath)
  const blenderRef: ImageRef | null = blenderCoverPath ? readImageRef(blenderCoverPath) : null
  if (blenderRef) {
    console.log(`[hero]   Blender cover OK in ${((Date.now() - t1) / 1000).toFixed(1)}s → ${blenderCoverPath}`)
  } else {
    console.log(`[hero]   Blender absent or failed; will call Gemini text-only (no layout reference)`)
  }

  // STEP 2: Gemini i2i (with Blender ref if available)
  console.log('[hero] step 2: Gemini 3.1 Flash Image preview (i2i)...')
  const prompt = composeHeroPrompt(state)
  const references: ImageRef[] = blenderRef ? [blenderRef] : []
  const t2 = Date.now()
  const generated = await callGeminiI2I({ prompt, references })
  if (!generated) {
    console.error('[hero] Gemini i2i call failed; no cover written')
    process.exit(0)  // fail-soft per chain orchestrator expectation
  }
  console.log(`[hero]   Gemini OK in ${((Date.now() - t2) / 1000).toFixed(1)}s (${(generated.length / 1024).toFixed(1)} KB)`)

  const outDir = dirname(statePath)
  const coverPath = resolve(outDir, 'cover.png')
  writeImage(coverPath, generated)
  console.log(`[hero] wrote ${coverPath}`)

  if (write) {
    state.brief_hero_image_path = coverPath
    if (blenderCoverPath) state.blender_cover_image_path = blenderCoverPath
    writeFileSync(statePath, JSON.stringify(state, null, 2))
    console.log(`[hero] updated state.brief_hero_image_path`)
  } else {
    console.log('[hero] dry run — pass --write to persist state.brief_hero_image_path')
  }
}

main().catch((err) => {
  console.error(`[hero] FATAL: ${err}`)
  process.exit(1)
})
