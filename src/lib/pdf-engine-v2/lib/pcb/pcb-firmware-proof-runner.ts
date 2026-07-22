/**
 * @file Tier-0 / Tier-1 / Tier-2 firmware proof runners (P9b + fixpack14/17).
 * @description Tier-0 spawns the isolated native prototype. Tier-1 emits a
 * freestanding MCU project from the pin-map and compiles with arm-none-eabi-gcc
 * when present. Tier-2 runs a pre-fab synthetic board model (imagined
 * peripherals) — never fabricates ok without bind+sim evidence; never HIL.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {
  buildBoardSimModel,
  type BoardSimModel,
} from './pcb-firmware-board-sim-model'
import type { FirmwareBusPinMap } from './pcb-firmware-pinmap-from-nets'
import { emitTier1McuProject } from './pcb-firmware-tier1-project'

export interface FirmwareProofRunResult {
  ok: boolean
  skipped?: boolean
  reason?: string
  resultPath?: string
}

/**
 * @description Run the native Tier-0 firmware proof against a fat JSON contract.
 * @param fatSpec Validated-or-attempted proof specification object
 * @param outDir Directory for proof-spec.json / proof-result.json artefacts
 * @param repoRoot Repository root (locates firmware_proof.py)
 * @returns ok=true only when the prototype reports ok; skipped when script missing
 */
export function runTier0FirmwareProof(
  fatSpec: Record<string, unknown>,
  outDir: string,
  repoRoot: string,
): FirmwareProofRunResult {
  fs.mkdirSync(outDir, { recursive: true })
  const specPath = path.join(outDir, 'proof-spec.json')
  fs.writeFileSync(specPath, JSON.stringify(fatSpec, null, 2))
  const py = path.join(repoRoot, 'prototypes/pcb-firmware-proof/firmware_proof.py')
  if (!fs.existsSync(py)) {
    return { ok: false, skipped: true, reason: 'firmware_proof.py missing' }
  }
  const r = spawnSync('python3', [py, 'prove', specPath, '--out', outDir], {
    encoding: 'utf8',
    timeout: 120_000,
  })
  const resultPath = path.join(outDir, 'proof-result.json')
  if (r.error) {
    return {
      ok: false,
      reason: `firmware_proof spawn error: ${r.error.message}`,
      resultPath: fs.existsSync(resultPath) ? resultPath : undefined,
    }
  }
  if (fs.existsSync(resultPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as { ok?: boolean }
      return {
        ok: j.ok === true,
        reason: j.ok === true
          ? undefined
          : `firmware_proof exit ${r.status ?? 'n/a'}: ${(r.stderr || r.stdout || '').slice(0, 400)}`,
        resultPath,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { ok: false, reason: `proof-result.json unparseable: ${message}`, resultPath }
    }
  }
  return {
    ok: false,
    reason: `firmware_proof exit ${r.status ?? 'n/a'}: ${(r.stderr || r.stdout || '').slice(0, 400)}`,
  }
}

export interface FirmwareTier1CompileResult {
  ok: boolean
  skipped: boolean
  tier: 'tier1_mcu_compile'
  reason: string
  toolchain: string | null
  projectDir?: string
  elfPath?: string
}

export type Tier1CompileOpts = {
  /** When set, emit + compile a freestanding project from this pin contract. */
  proofTargetId?: string
  mcuMpn?: string
  buses?: FirmwareBusPinMap[]
}

/**
 * @description Honest Tier-1 real-MCU compile probe. Emits a pinmap-bound
 * freestanding project when buses+MCU are provided, then runs arm-none-eabi-gcc.
 * Never claims PASS without toolchain + successful link.
 * @param outDir Directory for tier1-status.json + mcu-project/
 * @param opts Optional pin-map emit inputs (from HAT custom_board contract)
 * @returns ok=true only when .elf links; skipped when toolchain/project absent
 */
export function probeTier1McuCompile(
  outDir: string,
  opts: Tier1CompileOpts = {},
): FirmwareTier1CompileResult {
  fs.mkdirSync(outDir, { recursive: true })
  const which = spawnSync('which', ['arm-none-eabi-gcc'], { encoding: 'utf8' })
  const hasToolchain = which.status === 0 && Boolean(which.stdout?.trim())
  const toolchain = hasToolchain ? which.stdout.trim() : null

  const canEmit =
    Boolean(opts.proofTargetId)
    && Boolean(opts.mcuMpn)
    && Array.isArray(opts.buses)
    && (opts.buses?.length ?? 0) > 0

  let projectDir: string | undefined
  if (canEmit && opts.proofTargetId && opts.mcuMpn && opts.buses) {
    const emitted = emitTier1McuProject({
      outDir,
      proofTargetId: opts.proofTargetId,
      mcuMpn: opts.mcuMpn,
      buses: opts.buses,
    })
    projectDir = emitted.projectDir
  }

  let result: FirmwareTier1CompileResult
  if (!hasToolchain) {
    result = {
      ok: false,
      skipped: true,
      tier: 'tier1_mcu_compile',
      reason: projectDir
        ? 'arm-none-eabi-gcc not on PATH — Tier-1 project emitted but compile not attempted'
        : 'arm-none-eabi-gcc not on PATH — Tier-1 MCU compile not attempted (native Tier-0 only)',
      toolchain: null,
      projectDir,
    }
  } else if (!projectDir) {
    result = {
      ok: false,
      skipped: true,
      tier: 'tier1_mcu_compile',
      reason:
        'arm-none-eabi-gcc present but no MCU pin-map available to emit a Tier-1 project (need custom_board + buses)',
      toolchain,
    }
  } else {
    const make = spawnSync('make', ['-C', projectDir], {
      encoding: 'utf8',
      timeout: 120_000,
    })
    const elfPath = path.join(projectDir, 'tier1_proof.elf')
    const linked = make.status === 0 && fs.existsSync(elfPath)
    result = linked
      ? {
          ok: true,
          skipped: false,
          tier: 'tier1_mcu_compile',
          reason: 'freestanding Cortex-M0+ link OK from generated pinmap',
          toolchain,
          projectDir,
          elfPath,
        }
      : {
          ok: false,
          skipped: false,
          tier: 'tier1_mcu_compile',
          reason: `Tier-1 compile failed: ${(make.stderr || make.stdout || '').slice(0, 400)}`,
          toolchain,
          projectDir,
        }
  }

  fs.writeFileSync(
    path.join(outDir, 'tier1-status.json'),
    JSON.stringify(result, null, 2),
  )
  return result
}

export interface FirmwareTier2BoardSimResult {
  ok: boolean
  skipped: boolean
  tier: 'tier2_board_sim'
  reason: string
  modelPath?: string
  resultPath?: string
  transcriptPath?: string
  bindErrorCount?: number
}

/**
 * @description Run pre-fab synthetic board sim (Tier-2). Builds a board model
 * from nets/buses/channels, fail-closes on bind_errors, then executes
 * board_sim_prove.py. Never claims HIL / FUNCTIONALLY VERIFIED.
 */
export function runTier2BoardSim(args: {
  outDir: string
  repoRoot: string
  modelInput: Parameters<typeof buildBoardSimModel>[0]
}): FirmwareTier2BoardSimResult {
  const { outDir, repoRoot, modelInput } = args
  fs.mkdirSync(outDir, { recursive: true })
  const model: BoardSimModel = buildBoardSimModel(modelInput)
  const modelPath = path.join(outDir, 'board-sim-model.json')
  fs.writeFileSync(modelPath, JSON.stringify(model, null, 2))

  const py = path.join(repoRoot, 'prototypes/pcb-firmware-proof/board_sim_prove.py')
  if (!fs.existsSync(py)) {
    const result: FirmwareTier2BoardSimResult = {
      ok: false,
      skipped: true,
      tier: 'tier2_board_sim',
      reason: 'board_sim_prove.py missing',
      modelPath,
      bindErrorCount: model.bind_errors.length,
    }
    fs.writeFileSync(path.join(outDir, 'tier2-status.json'), JSON.stringify(result, null, 2))
    return result
  }

  const r = spawnSync('python3', [py, modelPath, '--out', outDir], {
    encoding: 'utf8',
    timeout: 120_000,
  })
  const resultPath = path.join(outDir, 'board-sim-result.json')
  const transcriptPath = path.join(outDir, 'board-sim-transcript.txt')

  let result: FirmwareTier2BoardSimResult
  if (fs.existsSync(resultPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as {
        ok?: boolean
        skipped?: boolean
        reason?: string
      }
      result = {
        ok: j.ok === true,
        skipped: j.skipped === true,
        tier: 'tier2_board_sim',
        reason: j.reason
          ?? (j.ok === true
            ? 'synthetic board sim PASS — UNPROVEN IN HARDWARE'
            : `board_sim exit ${r.status ?? 'n/a'}`),
        modelPath,
        resultPath,
        transcriptPath: fs.existsSync(transcriptPath) ? transcriptPath : undefined,
        bindErrorCount: model.bind_errors.length,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      result = {
        ok: false,
        skipped: false,
        tier: 'tier2_board_sim',
        reason: `board-sim-result.json unparseable: ${message}`,
        modelPath,
        resultPath,
        bindErrorCount: model.bind_errors.length,
      }
    }
  } else {
    result = {
      ok: false,
      skipped: false,
      tier: 'tier2_board_sim',
      reason: `board_sim_prove exit ${r.status ?? 'n/a'}: ${(r.stderr || r.stdout || '').slice(0, 400)}`,
      modelPath,
      bindErrorCount: model.bind_errors.length,
    }
  }

  fs.writeFileSync(path.join(outDir, 'tier2-status.json'), JSON.stringify(result, null, 2))
  return result
}
