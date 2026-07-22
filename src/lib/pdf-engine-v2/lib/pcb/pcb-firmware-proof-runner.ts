/**
 * @file Tier-0 firmware proof runner — spawn isolated prototype (P9b).
 * @description Invokes `prototypes/pcb-firmware-proof/firmware_proof.py prove`
 * without importing live distributor code. Fail closed on spawn/validate errors.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

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
}

/**
 * @description Honest Tier-1 real-MCU compile probe. Never claims PASS without
 * arm-none-eabi-gcc (or equivalent) + a generated MCU project. Today the
 * prototype only ships native Tier-0 — report skipped, not fabricated ok.
 * @param outDir Directory for tier1-status.json
 * @returns skipped=true until a real MCU toolchain + project exists
 */
export function probeTier1McuCompile(outDir: string): FirmwareTier1CompileResult {
  fs.mkdirSync(outDir, { recursive: true })
  const which = spawnSync('which', ['arm-none-eabi-gcc'], { encoding: 'utf8' })
  const hasToolchain = which.status === 0 && Boolean(which.stdout?.trim())
  const result: FirmwareTier1CompileResult = hasToolchain
    ? {
        ok: false,
        skipped: true,
        tier: 'tier1_mcu_compile',
        reason:
          'arm-none-eabi-gcc present but no MCU project generator is wired yet — Tier-1 remains ENGINEERING DRAFT',
        toolchain: which.stdout.trim(),
      }
    : {
        ok: false,
        skipped: true,
        tier: 'tier1_mcu_compile',
        reason:
          'arm-none-eabi-gcc not on PATH — Tier-1 MCU compile not attempted (native Tier-0 only)',
        toolchain: null,
      }
  fs.writeFileSync(
    path.join(outDir, 'tier1-status.json'),
    JSON.stringify(result, null, 2),
  )
  return result
}
