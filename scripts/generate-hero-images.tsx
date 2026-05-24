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
import { execFileSync } from 'child_process'
import {
  callGeminiI2I,
  runBlenderCoverPass,
  composeHeroPrompt,
  readImageRef,
  writeImage,
  type ImageRef,
} from './lib/illustration-i2i'

/**
 * Phase 2.5 (2026-05-24): dispatch to scripts/render-blender-scene.py which
 * runs a per-class hand-coded Blender template (or LLM-generated blender-
 * scene.py if phase 3 generator ran first). The template's render pipeline
 * produces 00-hero.png + module-*.png + blender-cover.png mirror in one
 * Blender call. We use blender-cover.png as the Gemini i2i reference so
 * the photoreal cover is anchored on real geometry, not the cube grid.
 *
 * Returns the absolute path to blender-cover.png on success, or null if
 * no template exists for this class (caller falls back to legacy
 * runBlenderCoverPass).
 */
function trySceneTemplateHero(statePath: string, outDir: string): string | null {
  const runner = resolve(__dirname, 'render-blender-scene.py')
  if (!existsSync(runner)) return null
  const blenderCover = resolve(outDir, 'blender-cover.png')
  // Skip the second run if the template runner has already produced output
  // for this chain run (e.g. when generate-module-images.tsx fired earlier).
  if (existsSync(blenderCover) && existsSync(resolve(outDir, '00-hero.png'))) {
    return blenderCover
  }
  try {
    execFileSync(
      'python3',
      [runner, '--state', statePath, '--out-dir', outDir],
      { stdio: 'inherit', timeout: 300_000 },
    )
  } catch (err: any) {
    const code = typeof err?.status === 'number' ? err.status : -1
    if (code === 5) {
      console.error('[hero] no per-class template; falling back to legacy runBlenderCoverPass')
    } else {
      console.error(`[hero] render-blender-scene.py exited ${code}; falling back to legacy runBlenderCoverPass`)
    }
    return null
  }
  return existsSync(blenderCover) ? blenderCover : null
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

  // STEP 0 (phase 3): LLM-generated brief-specific blender-scene.py.
  // Writes <out-dir>/blender-scene.py + forge_blender_lib.py if successful;
  // render-blender-scene.py picks them up automatically. Fail-soft: if the
  // generator fails or no template exists for this class, the runner falls
  // back to the unmodified per-class template (still phase-20-quality).
  // Skip via BLENDER_SCENE_GEN_SKIP=1 (e.g. for fast smoke tests).
  const outDirEarly = dirname(statePath)
  const sceneGen = resolve(__dirname, 'generate-blender-scene.tsx')
  if (process.env.BLENDER_SCENE_GEN_SKIP !== '1' && existsSync(sceneGen)) {
    console.log('[hero] step 0: per-project geometry generator (LLM)...')
    const t0 = Date.now()
    try {
      execFileSync('npx', ['tsx', sceneGen, statePath, '--write'], { stdio: 'inherit', timeout: 240_000 })
      console.log(`[hero]   geometry generator OK in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    } catch (err: any) {
      console.error(`[hero]   geometry generator failed (${err?.status ?? 'err'}); falling back to unmodified template`)
    }
  }

  // STEP 1: Blender structural reference
  // Phase 2.5: try the per-class template runner first (real geometry); fall
  // back to the legacy single-shot cube-grid Blender if no template exists.
  console.log('[hero] step 1: Blender structural reference cover pass...')
  const t1 = Date.now()
  let blenderCoverPath: string | null = trySceneTemplateHero(statePath, outDirEarly)
  if (blenderCoverPath) {
    console.log(`[hero]   template runner produced blender-cover.png in ${((Date.now() - t1) / 1000).toFixed(1)}s`)
  } else {
    blenderCoverPath = runBlenderCoverPass(statePath)
  }
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
