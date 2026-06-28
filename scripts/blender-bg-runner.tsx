#!/usr/bin/env npx tsx
/**
 * scripts/blender-bg-runner.tsx
 *
 * Phase 5 (Tristan 2026-05-24, mempalace drawer_forgeos_decisions_*):
 * background-mode runner for the Blender pipeline. Spawned by the chain
 * orchestrator (serial-design-chain-v2.tsx) right after Stage 8.5
 * specialist completes — the earliest point at which state.json's
 * moduleDecomposition is geometrically final. Runs in parallel with the
 * rest of the chain (stages 9 through 47), so by the time the [hero]
 * step is reached the blender images are typically already done.
 *
 * Sequence:
 *   1. Write <out-dir>/.blender-bg-running sentinel (synchronously, first thing)
 *   2. Run generate-blender-scene.tsx (LLM emits brief-specific Python)
 *   3. Run render-blender-scene.py (Blender renders all images)
 *   4. Write <out-dir>/.blender-bg-done sentinel
 *   5. Delete the .blender-bg-running sentinel
 *
 * The hero stage (generate-hero-images.tsx) polls .blender-bg-running with
 * timeout — if present, waits up to 15 min for .blender-bg-done. If
 * sentinels never appear (spawn failed), falls back to synchronous
 * gen+render.
 *
 * Usage (called by chain, not directly):
 *   npx tsx scripts/blender-bg-runner.tsx <state.json> <out-dir>
 *
 * Skip the whole bg pass via env BLENDER_BG_SKIP=1 — chain then falls
 * through to the synchronous path inside generate-hero-images.tsx.
 */

import { existsSync, writeFileSync, unlinkSync } from 'fs'
import { resolve } from 'path'
import { execFileSync } from 'child_process'

function main(): number {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: blender-bg-runner.tsx <state.json> <out-dir>')
    return 1
  }
  const statePath = resolve(args[0])
  const outDir = resolve(args[1])
  const running = resolve(outDir, '.blender-bg-running')
  const done = resolve(outDir, '.blender-bg-done')

  if (!existsSync(statePath)) {
    console.error(`[bg-runner] state not found: ${statePath}`)
    return 1
  }

  writeFileSync(running, `pid=${process.pid}\nstarted=${new Date().toISOString()}\n`)
  console.log(`[bg-runner] started; sentinel ${running}`)

  const t0 = Date.now()
  let genOk = false
  try {
    execFileSync(
      'npx',
      ['tsx', resolve(__dirname, 'generate-blender-scene.tsx'), statePath, '--write'],
      // 360s (was 240s): a single detailed gpt-5.5 geometry pass plus one
      // legitimate retry can exceed 4 min; the old 240s budget SIGTERM'd the
      // process (exit 143) mid-retry → silent fallback to the stock template
      // (iter-66). Still well inside the hero stage's 15-min sentinel poll.
      { stdio: 'inherit', timeout: 360_000 },
    )
    genOk = true
    console.log(`[bg-runner] gen OK in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  } catch (err: any) {
    console.error(`[bg-runner] gen failed (${err?.status ?? 'err'}); render runner will fall back to unmodified template`)
  }

  const t1 = Date.now()
  try {
    execFileSync(
      'python3',
      [resolve(__dirname, 'render-blender-scene.py'), '--state', statePath, '--out-dir', outDir],
      { stdio: 'inherit', timeout: 1_200_000 },
    )
    console.log(`[bg-runner] render OK in ${((Date.now() - t1) / 1000).toFixed(1)}s`)
  } catch (err: any) {
    console.error(`[bg-runner] render failed (${err?.status ?? 'err'}); hero stage will fall back`)
  }

  // VISION CRITIC (Tristan 2026-06-28): now the render exists, have a vision model LOOK at it and
  // write render-vision-critique.json. Flag-only — the dossier scorer reads the verdict and can only
  // CAP the render (broken → FAIL; clean → drops the 'unverified' advisory; absent → stays capped at
  // 7). Non-fatal + best-effort (a missing key / API error just leaves the render UNVERIFIED).
  try {
    execFileSync(
      'python3',
      [resolve(__dirname, 'lib', 'render_vision_critic.py'), '--write', outDir],
      { stdio: 'inherit', timeout: 120_000 },
    )
    console.log('[bg-runner] vision critic wrote render-vision-critique.json')
  } catch (err: any) {
    console.error(`[bg-runner] vision critic skipped (${err?.status ?? 'err'}); render stays UNVERIFIED`)
  }

  writeFileSync(done, `pid=${process.pid}\nfinished=${new Date().toISOString()}\ngen_ok=${genOk}\n`)
  try { unlinkSync(running) } catch {}
  console.log(`[bg-runner] DONE in ${((Date.now() - t0) / 1000).toFixed(1)}s; sentinel ${done}`)
  return 0
}

process.exit(main())
