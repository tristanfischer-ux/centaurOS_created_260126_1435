/**
 * @file PCB pipeline runner — ENGINE-SIDE, Phase C (2026-07-12).
 * @description `runPcbPipeline(atoProjectDir, runDir, opts?)` turns a Phase-B
 * atopile project into a routed, DRC-verified board with Gerbers, by delegating
 * the real KiCad/atopile/Freerouting mechanics to `pcb_pipeline_runner.py`
 * (a clean, no-hardcoded-path, no-optimistic-success port of
 * `~/Developer/CentaurOS created 260126 1435/scripts/pcb-chain/pcb_chain.py`).
 *
 * WHY A PYTHON SUBPROCESS, NOT A PURE-TS PORT: `pcbnew.LoadBoard` /
 * `ExportSpecctraDSN` / `ImportSpecctraSES` only exist inside KiCad's OWN bundled
 * Python interpreter (KiCad ships no equivalent kicad-cli subcommand as of
 * 10.0.4, verified live). This file owns the UNIVERSAL, honest-failure contract
 * (discovery, runDir enforcement, structured result, never fakes success); the
 * Python script owns the KiCad-Python-bridge mechanics it has no TS equivalent
 * for. This split is the same "reuse the real mechanics, own the contract"
 * approach as Phase B's `atopile-generator.ts` delegating footprint bytes to the
 * real KiCad footprint library rather than re-drawing them.
 *
 * HONEST FAILURE (load-bearing, Tristan mandatory): `ok` is true ONLY when the
 * board built, routed, DRC ran with ZERO violations, and Gerbers exist on disk.
 * Every other outcome returns `ok:false` + `stage_reached` + the real error —
 * this file never upgrades a partial/failed run to a fake pass.
 *
 * NO /tmp, NO HARDCODED MACHINE PATHS: every tool path (ato, java, kicad-cli,
 * the KiCad Python bridge, the Freerouting jar) is DISCOVERED via
 * `discoverPcbCapability()` (extended in this phase with `freeroutingJar` +
 * `kicadPythonBridge`, both resolved generically — see discover-capability.ts).
 * All artifacts are written under the caller-supplied `runDir`.
 *
 * Run: npx tsx src/lib/pdf-engine-v2/lib/pcb/pcb-pipeline.ts <atoProjectDir> <runDir>
 */

import { spawnSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { discoverPcbCapability, type PcbCapabilityManifest } from './discover-capability'

export interface PcbDrcResult {
  ran: boolean
  violations: number | null
  reportPath?: string
}

export interface PcbFileGroupResult {
  dir: string
  files: string[]
}

export interface PcbPipelineResult {
  ok: boolean
  stageReached: string
  kicadPcbPath?: string
  routed: boolean
  drc: PcbDrcResult
  gerbers?: PcbFileGroupResult
  drill?: PcbFileGroupResult
  pos?: { path: string }
  renderPng?: string
  boardSizeMm?: { w: number; h: number }
  components?: number
  nets?: number
  unroutedAfterFreerouting?: number
  iterationsRun?: number
  errors: string[]
}

export interface PcbPipelineOptions {
  /** Path to Phase B's `board-outline.json`. Defaults to `<atoProjectDir>/board-outline.json`
   *  if present; omit/pass '' to force the plain-rectangle fallback. */
  boardOutlinePath?: string
  maxPasses?: number
  maxIterations?: number
  freeroutingTimeoutS?: number
  /** Override the discovered capability manifest (mainly for tests). */
  capability?: PcbCapabilityManifest
  /** pcb-architecture board.role — gates the HAT 100 mm placement cap (cold-v13). */
  boardRole?: string
  /** pcb-architecture shape.shapeFamily — secondary HAT-envelope signal. */
  shapeFamily?: string
}

function honestFailure(stageReached: string, errors: string[]): PcbPipelineResult {
  return {
    ok: false,
    stageReached,
    routed: false,
    drc: { ran: false, violations: null },
    errors,
  }
}

/**
 * @description Runs the full Phase-C pipeline: `ato build` -> text-pcb repair ->
 * naive-but-outline-respecting placement -> Specctra DSN export -> Freerouting
 * autoroute -> `.ses` import -> `kicad-cli pcb drc` -> Gerber/drill/pos/render
 * exports. Every artifact lands under `<runDir>/pcb/`.
 * @param atoProjectDir - A Phase-B `generateAtopileProject()` output directory
 *   (contains `main.ato` + `ato.yaml`, optionally `board-outline.json`).
 * @param runDir - Output root; this function creates `<runDir>/pcb/` itself.
 */
export function runPcbPipeline(
  atoProjectDir: string,
  runDir: string,
  opts: PcbPipelineOptions = {},
): PcbPipelineResult {
  if (!existsSync(atoProjectDir)) {
    return honestFailure('not_started', [`atoProjectDir does not exist: ${atoProjectDir}`])
  }
  const mainAto = join(atoProjectDir, 'main.ato')
  if (!existsSync(mainAto)) {
    return honestFailure('not_started', [`no main.ato in atoProjectDir: ${mainAto} — not a valid atopile project`])
  }

  mkdirSync(runDir, { recursive: true })

  const capability = opts.capability ?? discoverPcbCapability()
  const missing: string[] = []
  if (!capability.atopile.available) missing.push('atopile')
  if (!capability.kicadCli.available) missing.push('kicad-cli')
  if (!capability.java.available) missing.push('java')
  if (!capability.kicadPythonBridge.available) missing.push(`kicadPythonBridge (${capability.kicadPythonBridge.error ?? 'unavailable'})`)
  if (!capability.kicadFootprints.available) missing.push('kicad-footprint-library')
  if (missing.length) {
    return honestFailure('toolchain_discovery', [`required PCB toolchain component(s) missing: ${missing.join(', ')}`])
  }
  // Freerouting is required to actually ROUTE the board (not merely to build/DRC
  // an already-routed one), so its absence is an honest failure at this stage —
  // never a silent skip that would let a later stage fabricate a "routed" result.
  if (!capability.freeroutingJar.available) {
    return honestFailure('toolchain_discovery', [
      `Freerouting jar not discovered (${capability.freeroutingJar.error ?? 'unavailable'}) — cannot autoroute`,
    ])
  }

  const boardOutlinePath =
    opts.boardOutlinePath !== undefined
      ? opts.boardOutlinePath
      : (() => {
          const candidate = join(atoProjectDir, 'board-outline.json')
          return existsSync(candidate) ? candidate : ''
        })()

  const runnerScript = resolve(__dirname, 'pcb_pipeline_runner.py')
  if (!existsSync(runnerScript)) {
    return honestFailure('not_started', [`pcb_pipeline_runner.py not found at ${runnerScript}`])
  }

  const args = [
    runnerScript,
    '--project-dir', resolve(atoProjectDir),
    '--run-dir', resolve(runDir),
    '--ato-bin', capability.atopile.path!,
    '--java-bin', capability.java.path!,
    '--kicad-python', capability.kicadPythonBridge.pythonBin!,
    '--kicad-pythonpath', capability.kicadPythonBridge.sitePackages!,
    '--kicad-cli', capability.kicadCli.path!,
    '--freerouting-jar', capability.freeroutingJar.path!,
    '--kicad-footprints-root', capability.kicadFootprints.path,
    '--board-outline', boardOutlinePath,
    '--max-passes', String(opts.maxPasses ?? 500),
    // DECISION (2026-07-21): default 8 matches pcb_pipeline_runner.py — dense
    // boards need more grow-retries once margin-clamp stacking is forbidden.
    '--max-iterations', String(opts.maxIterations ?? 8),
    '--freerouting-timeout-s', String(opts.freeroutingTimeoutS ?? 300),
  ]
  if (opts.boardRole) {
    args.push('--board-role', opts.boardRole)
  }
  if (opts.shapeFamily) {
    args.push('--shape-family', opts.shapeFamily)
  }

  // ato build reads $PATH to resolve its own dependencies; ~/.local/bin (where
  // `ato` itself lives) must be present for `ato build`'s internal tool calls.
  const env = {
    ...process.env,
    PATH: `${resolve(capability.atopile.path!, '..')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
  }

  // Overall wall-clock budget: ato build (~3min) + up to 4 placement iterations
  // each potentially re-running Freerouting (up to 300s) + DRC + exports.
  const timeoutMs = 20 * 60 * 1000
  const proc = spawnSync('python3', args, {
    encoding: 'utf8',
    env,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  })

  if (proc.error) {
    return honestFailure('runner_launch', [`failed to launch pcb_pipeline_runner.py: ${proc.error.message}`])
  }

  const stdout = proc.stdout ?? ''
  const marker = '=== PCB_PIPELINE_RESULT_JSON ==='
  const markerIndex = stdout.indexOf(marker)
  if (markerIndex === -1) {
    return honestFailure('runner_output_parse', [
      `pcb_pipeline_runner.py produced no result marker (exit ${proc.status}, signal ${proc.signal}). ` +
        `stdout tail: ${stdout.slice(-1500)} | stderr tail: ${(proc.stderr ?? '').slice(-1500)}`,
    ])
  }

  let raw: {
    ok: boolean
    stage_reached: string
    kicad_pcb_path?: string | null
    routed: boolean
    drc: { ran: boolean; violations: number | null; report_path?: string | null }
    gerbers?: { dir: string; files: string[] } | null
    drill?: { dir: string; files: string[] } | null
    pos?: { path: string } | null
    render_png?: string | null
    board_size_mm?: { w: number; h: number } | null
    components?: number | null
    nets?: number | null
    unrouted_after_freerouting?: number | null
    iterations_run?: number | null
    errors: string[]
  }
  try {
    raw = JSON.parse(stdout.slice(markerIndex + marker.length))
  } catch (error) {
    return honestFailure('runner_output_parse', [
      `pcb_pipeline_runner.py result JSON failed to parse: ${error instanceof Error ? error.message : String(error)}`,
    ])
  }

  return {
    ok: raw.ok,
    stageReached: raw.stage_reached,
    kicadPcbPath: raw.kicad_pcb_path ?? undefined,
    routed: raw.routed,
    drc: {
      ran: raw.drc.ran,
      violations: raw.drc.violations ?? null,
      reportPath: raw.drc.report_path ?? undefined,
    },
    gerbers: raw.gerbers ?? undefined,
    drill: raw.drill ?? undefined,
    pos: raw.pos ?? undefined,
    renderPng: raw.render_png ?? undefined,
    boardSizeMm: raw.board_size_mm ?? undefined,
    components: raw.components ?? undefined,
    nets: raw.nets ?? undefined,
    unroutedAfterFreerouting: raw.unrouted_after_freerouting ?? undefined,
    iterationsRun: raw.iterations_run ?? undefined,
    errors: raw.errors ?? [],
  }
}

if (require.main === module) {
  const [, , atoProjectDirArg, runDirArg] = process.argv
  if (!atoProjectDirArg || !runDirArg) {
    console.error('usage: pcb-pipeline.ts <atoProjectDir> <runDir>')
    process.exit(1)
  }
  const result = runPcbPipeline(atoProjectDirArg, runDirArg)
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.ok ? 0 : 1)
}
