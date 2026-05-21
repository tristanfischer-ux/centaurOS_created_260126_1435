#!/usr/bin/env npx tsx
/**
 * scripts/render-product-illustrations.tsx
 *
 * DEPRECATED 2026-05-21 — superseded by scripts/generate-{hero,module}-
 * images.tsx (Gemini i2i pipeline) per council a66e6ee7cdd05270f
 * verdict. Kept on disk as a dev tool but NO LONGER CALLED from the
 * chain orchestrator. Per-module Blender wireframes are now produced
 * inline by runBlenderModulePass() in scripts/lib/illustration-i2i.ts
 * and consumed as i2i references by generate-module-images.tsx.
 *
 * AUDIT FINDING (af2a318fd78e757f8 Pattern 3, 2026-05-21): this script
 * writes module-<id>.png to the same path generate-module-images.tsx
 * uses for its final photoreal output. If both run in the same chain,
 * whichever runs last wins. Mitigated TODAY by the chain orchestrator
 * no longer invoking this script — but the filename collision remains
 * a latent risk. If you re-enable this script for any reason, change
 * outputs to `module-<id>-legacy-blender.png` first.
 *
 * --- ORIGINAL ARCHITECTURE NOTES BELOW (for reference) ---
 *
 * Sprint 0 v5 (Tristan 2026-05-20): generic, brief-aware Blender
 * illustration pipeline for the ForgeOS PDF engine. Replaces the
 * gpt-image-1 stylistic drift problem (different prompt = different
 * style per call) with ONE Blender scene rendered from N camera
 * azimuths — same product, rotating viewpoint, different module
 * highlighted in saturated colour while the others stay greyscale.
 *
 * Architecture (validated 2026-05-17, source mempalace drawer
 * drawer_forgeos_decisions on bess-camera-orbit.py):
 *   - ONE Blender scene per product. All N module images sit on the
 *     same orbital sphere.
 *   - Camera convention: turntable orbit with fixed RADIUS + ELEVATION
 *     + LENS (35 mm). Only AZIMUTH varies per module.
 *   - Each module render = same scene at a different camera azimuth,
 *     focal module SATURATED colour, all others GREYSCALE.
 *   - Aesthetic: clean engineering schematic. Eevee + Freestyle
 *     outlines, flat Principled BSDF (no PBR / HDRI / photoreal).
 *
 * INPUTS read from state.json:
 *   state.parsedBrief.constraints.max_dimensions_mm = { w, d, h } (mm)
 *   state.moduleDecomposition.modules[]
 *   state.moduleDecomposition.product_class
 *
 * OUTPUTS:
 *   <out-dir>/cover.png  — wide isometric showing the full envelope
 *   <out-dir>/module-<id>.png — per-module, same scene, different
 *     azimuth, focal module saturated, others greyscale.
 *
 * STATE FIELDS WRITTEN (when --write):
 *   state.brief_hero_image_path = "<abs>/cover.png"
 *   state.module_image_paths = { "<module_id>": "<abs>/module-<id>.png" }
 *
 * The renderer (scripts/render-minimal-pdf.tsx — resolveModuleImage /
 * resolveHeroImages) already reads both fields. This script is a drop-
 * in replacement for the old generate-hero-images.tsx +
 * generate-module-images.tsx pair. DO NOT change render-minimal-
 * pdf.tsx — the fallback chain there stays intact.
 *
 * BLENDER PRESENCE: this script checks /Applications/Blender.app on
 * macOS, then $PATH `blender`. If Blender is missing, it EXITS 0
 * silently (fail-soft) so the chain falls through to the existing AI
 * image-gen step. Never blocks the chain.
 *
 * Render budget: ~5-10s per image. 11 modules + cover = ~2 min total.
 *
 * Usage:
 *   npx tsx scripts/render-product-illustrations.tsx <state.json> [--write] [--out-dir <path>]
 *
 * Wiring (Tristan's job, not this script's): in scripts/serial-
 * design-chain-v2.tsx around line 2625, replace the existing
 * `generate-hero-images.tsx` exec with this script. The behaviour is a
 * superset — emits cover + every module image in one Blender process
 * batch.
 */

// DEPRECATED guard — script body retained for dev/debug, but anyone
// invoking it should know it's no longer the canonical Blender path.
console.error('[render-product-illustrations] DEPRECATED — this script is no longer called from the chain (council a66e6ee7cdd05270f, 2026-05-21). Use scripts/generate-{hero,module}-images.tsx instead. Continuing anyway since you invoked it explicitly.')

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { spawnSync } from 'child_process'
import { resolve, dirname, isAbsolute, join } from 'path'

// ── Blender discovery ──────────────────────────────────────────────────

/** Locate the Blender CLI. macOS-first, then $PATH. Returns null if
 *  Blender is unavailable — caller falls through to the AI image-gen
 *  step (existing behaviour). */
function findBlender(): string | null {
  const explicit = process.env.BLENDER_BIN
  if (explicit && existsSync(explicit)) return explicit
  const macBin = '/Applications/Blender.app/Contents/MacOS/Blender'
  if (existsSync(macBin)) return macBin
  // Try $PATH `blender`
  const which = spawnSync('which', ['blender'], { encoding: 'utf-8' })
  if (which.status === 0) {
    const cand = which.stdout.trim()
    if (cand && existsSync(cand)) return cand
  }
  return null
}

// ── State helpers ──────────────────────────────────────────────────────

interface ParsedState {
  parsedBrief?: {
    constraints?: {
      max_dimensions_mm?: { w?: number; d?: number; h?: number }
    }
  }
  moduleDecomposition?: {
    product_class?: string
    modules?: Array<{ module?: string; sub_modules?: unknown[] }>
  }
  brief_hero_image_path?: string
  module_image_paths?: Record<string, string>
}

interface Envelope {
  w: number  // metres
  d: number  // metres
  h: number  // metres
  maxDim: number
}

function envelopeFromState(state: ParsedState): Envelope {
  const maxd = state?.parsedBrief?.constraints?.max_dimensions_mm
  const w = Number(maxd?.w ?? 0) || 6000
  const d = Number(maxd?.d ?? 0) || 2000
  const h = Number(maxd?.h ?? 0) || 2000
  const wM = w / 1000
  const dM = d / 1000
  const hM = h / 1000
  return { w: wM, d: dM, h: hM, maxDim: Math.max(wM, dM, hM) }
}

function moduleIds(state: ParsedState): string[] {
  const mods = state?.moduleDecomposition?.modules ?? []
  const out: string[] = []
  for (const m of mods) {
    const id = typeof m?.module === 'string' ? m.module : ''
    if (id) out.push(id)
  }
  return out
}

// ── Render driver ──────────────────────────────────────────────────────

interface RenderJob {
  module: string      // module id, or "cover"
  azimuth: number     // degrees, on the orbital sphere
  outPath: string
}

function buildJobs(mods: string[], outDir: string): RenderJob[] {
  // Cover: front-corner isometric (-35°), wide. Module azimuths:
  // distribute evenly around the sphere so every module gets its own
  // viewpoint. Reads as a turntable spin across the deck.
  const jobs: RenderJob[] = []
  // 2026-05-21 (Tristan HAPS forensic, 6th iteration): Blender cover must
  // NOT collide with gpt-image-1's cover.png. The chain orchestrator runs
  // generate-hero-images.tsx first (writes <out-dir>/cover.png) and
  // expects this Blender step to leave the gpt-image-1 hero alone. Use a
  // distinct filename so both can coexist. The renderer (resolveHeroImages)
  // reads state.brief_hero_image_path which the chain restores to the
  // gpt-image-1 path after this script runs.
  jobs.push({
    module: 'cover',
    azimuth: -35,
    outPath: resolve(outDir, 'blender-cover.png'),
  })
  const n = mods.length
  if (n === 0) return jobs
  for (let i = 0; i < n; i++) {
    // Spread 0..360 — start at +20° so we never duplicate the cover
    // azimuth (which is -35° ≡ 325°), and stride by 360/n.
    const azimuth = (20 + (360 / n) * i) % 360
    jobs.push({
      module: mods[i],
      azimuth,
      outPath: resolve(outDir, `module-${mods[i]}.png`),
    })
  }
  return jobs
}

function runBlenderOne(
  blenderBin: string,
  pyScript: string,
  statePath: string,
  job: RenderJob,
): boolean {
  const args = [
    '--background',
    '--python', pyScript,
    '--',
    '--state', statePath,
    '--module', job.module,
    '--azimuth', String(job.azimuth),
    '--out', job.outPath,
  ]
  const t0 = Date.now()
  const proc = spawnSync(blenderBin, args, {
    encoding: 'utf-8',
    // Blender prints a lot of housekeeping. We let stderr through so
    // failures are visible, but stdout is collected and only printed
    // on failure.
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const ms = Date.now() - t0
  if (proc.status !== 0) {
    console.error(`[blender-renderer] FAIL ${job.module} (exit ${proc.status}, ${ms}ms)`)
    if (proc.stdout) console.error(proc.stdout.split('\n').slice(-15).join('\n'))
    if (proc.stderr) console.error(proc.stderr.split('\n').slice(-15).join('\n'))
    return false
  }
  if (!existsSync(job.outPath)) {
    console.error(`[blender-renderer] FAIL ${job.module}: no output at ${job.outPath}`)
    if (proc.stderr) console.error(proc.stderr.split('\n').slice(-15).join('\n'))
    return false
  }
  const sizeKB = Math.round(statSync(job.outPath).size / 1024)
  console.log(`[blender-renderer] OK ${job.module} (${ms}ms, ${sizeKB} KB) → ${job.outPath}`)
  return true
}

// ── Main ───────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes('--help')) {
    console.error('Usage: render-product-illustrations.tsx <state.json> [--write] [--out-dir <path>]')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const write = args.includes('--write')
  let outDir = dirname(statePath)
  const odIdx = args.indexOf('--out-dir')
  if (odIdx !== -1 && args[odIdx + 1]) {
    outDir = isAbsolute(args[odIdx + 1]) ? args[odIdx + 1] : resolve(args[odIdx + 1])
  }
  if (!existsSync(statePath)) {
    console.error(`[blender-renderer] state not found: ${statePath}`)
    process.exit(1)
  }
  mkdirSync(outDir, { recursive: true })

  const blenderBin = findBlender()
  if (!blenderBin) {
    console.error(
      '[blender-renderer] Blender not installed at /Applications/Blender.app or on $PATH — '
      + 'falling through to AI image-gen step (fail-soft, exit 0)',
    )
    // Exit 0 so the chain doesn't crash — existing fallback chain in
    // render-minimal-pdf.tsx handles missing images.
    return
  }
  console.log(`[blender-renderer] using Blender at ${blenderBin}`)

  const pyScript = resolve(__dirname, 'render-product-blender.py')
  if (!existsSync(pyScript)) {
    console.error(`[blender-renderer] python script missing: ${pyScript}`)
    process.exit(1)
  }

  const state: ParsedState = JSON.parse(readFileSync(statePath, 'utf-8'))
  const env = envelopeFromState(state)
  const mods = moduleIds(state)
  console.log(
    `[blender-renderer] envelope=${env.w.toFixed(1)}×${env.d.toFixed(1)}×${env.h.toFixed(1)}m`
    + ` maxDim=${env.maxDim.toFixed(1)}m radius=${(1.5 * env.maxDim).toFixed(1)}m`
    + ` elev=${(0.6 * env.maxDim).toFixed(1)}m modules=${mods.length}`,
  )

  const jobs = buildJobs(mods, outDir)
  console.log(`[blender-renderer] dispatching ${jobs.length} render jobs (concurrency 1)`)

  const t0 = Date.now()
  const successes: Record<string, string> = {}
  let coverPath: string | null = null
  for (const job of jobs) {
    const ok = runBlenderOne(blenderBin, pyScript, statePath, job)
    if (ok) {
      if (job.module === 'cover') {
        coverPath = job.outPath
      } else {
        successes[job.module] = job.outPath
      }
    }
  }
  const totalMs = Date.now() - t0
  console.log(
    `[blender-renderer] complete in ${(totalMs / 1000).toFixed(1)}s — `
    + `cover=${coverPath ? 'OK' : 'MISS'}, modules=${Object.keys(successes).length}/${mods.length}`,
  )

  if (!write) {
    console.log('[blender-renderer] dry run — pass --write to persist state.json image paths')
    return
  }

  // Merge into existing image paths rather than overwrite — preserves
  // any earlier fail-soft AI image-gen output for modules that the
  // Blender renderer happened to skip. (In practice the Blender path
  // produces every module, but the merge keeps the behaviour safe if
  // someone runs both pipelines.)
  state.module_image_paths = { ...(state.module_image_paths ?? {}), ...successes }
  // 2026-05-21 (HAPS forensic): only set brief_hero_image_path if the
  // chain hasn't already set one (gpt-image-1 has PRIMARY claim). The
  // chain orchestrator also has a belt-and-braces restore step.
  if (coverPath && !state.brief_hero_image_path) {
    state.brief_hero_image_path = coverPath
  }
  // Always expose the Blender cover path separately so the renderer
  // could surface it on an exploded-view / appendix page later.
  if (coverPath) {
    (state as any).blender_cover_image_path = coverPath
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2))
  console.log(
    `[blender-renderer] wrote ${Object.keys(successes).length} module_image_paths`
    + `${coverPath ? ' + brief_hero_image_path' : ''} into ${statePath}`,
  )
}

try {
  main()
} catch (err) {
  console.error(`[blender-renderer] FATAL: ${(err as Error).stack || err}`)
  process.exit(1)
}
