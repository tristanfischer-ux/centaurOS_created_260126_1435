/**
 * @file pcb-pipeline.test.ts — Phase C verification (2026-07-12).
 * @description Two fixtures:
 *   1. A TINY known-good atopile project (the same "flight controller" universality
 *      fixture atopile-generator.test.ts uses — MCU + IMU + LED driver, zero
 *      colorimeter vocabulary) run through the REAL pipeline end-to-end
 *      (`ato build` -> route -> DRC -> Gerbers). Asserts the result STRUCTURE and
 *      that DRC actually ran — this is a real toolchain integration test, not a
 *      mock, so it's skipped honestly (not silently green) when the local
 *      toolchain isn't fully present.
 *   2. A deliberately BROKEN project (no `main.ato`) — asserts the pipeline fails
 *      HONESTLY (`ok:false` + a real `stageReached` + a real error message)
 *      rather than faking success. This case needs no toolchain at all, so it
 *      always runs.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateAtopileProject } from './atopile-generator'
import { discoverPcbCapability } from './discover-capability'
import { runPcbPipeline } from './pcb-pipeline'

jest.mock('../distributors/db-only-cascade', () => ({
  lookupCached: jest.fn(() => ({ found: false, result: null, source: 'unknown', ageHours: null })),
}))

function makeTmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

// The same "flight controller" design atopile-generator.test.ts uses as its
// universality proof — MCU + IMU sensor + LED driver, no colorimeter vocabulary.
const TINY_ELECTRONIC_DESIGN = {
  moduleDecomposition: {
    modules: [
      {
        module: 'control_compute_communication',
        sub_modules: [
          {
            id: 'control_compute_communication__flight_controller',
            words: [
              {
                id: 'flight_control_processor_word',
                name_human: 'Flight Control Processor',
                content_character: { character_id: 'flight_control_processor' },
                modifier_characters: [
                  { kind: 'quantity', value: '×1' },
                  { kind: 'form', value: 'Flight control MCU, LQFP-32 package, ARM Cortex-M4' },
                  { kind: 'manufacturer', value: 'STMicroelectronics' },
                  { kind: 'part_number', value: 'STM32F405RGT6' },
                ],
              },
            ],
          },
        ],
      },
      {
        module: 'sensing_instrumentation',
        sub_modules: [
          {
            id: 'sensing_instrumentation__imu',
            words: [
              {
                id: 'imu_sensor_word',
                name_human: 'IMU Sensor',
                content_character: { character_id: 'imu_sensor' },
                modifier_characters: [
                  { kind: 'quantity', value: '×1' },
                  { kind: 'form', value: 'Accelerometer + gyroscope IMU sensor IC, SOIC-8 package' },
                  { kind: 'part_number', value: 'TBD (detailed design)' },
                ],
              },
            ],
          },
        ],
      },
      {
        module: 'energy_conversion_transduction',
        sub_modules: [
          {
            id: 'energy_conversion_transduction__nav_lights',
            words: [
              {
                id: 'led_driver_ic_word',
                name_human: 'Navigation LED Driver',
                content_character: { character_id: 'led_driver_ic' },
                modifier_characters: [
                  { kind: 'quantity', value: '×1' },
                  { kind: 'form', value: 'LED driver IC, SOT-23-6 package' },
                  { kind: 'part_number', value: 'TBD (detailed design)' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  orchestratorContract: {
    topology: [
      { from_part: 'IMU Sensor', to_part: 'Flight Control Processor', mechanism: 'signal' },
      { from_part: 'Flight Control Processor', to_part: 'Navigation LED Driver', mechanism: 'signal' },
    ],
  },
}

describe('pcb-pipeline (Phase C)', () => {
  const tmpDirs: string[] = []
  afterAll(() => {
    for (const dir of tmpDirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* no-op */
      }
    }
  })

  describe('honest failure (no toolchain required — always runs)', () => {
    it('fails honestly when the ato project directory has no main.ato', () => {
      const brokenDir = makeTmpDir('pcb-pipeline-broken-')
      tmpDirs.push(brokenDir)
      writeFileSync(join(brokenDir, 'not-an-ato-file.txt'), 'garbage')

      const runDir = makeTmpDir('pcb-pipeline-broken-rundir-')
      tmpDirs.push(runDir)

      const result = runPcbPipeline(brokenDir, runDir)

      expect(result.ok).toBe(false)
      expect(result.stageReached).toBe('not_started')
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toMatch(/main\.ato/)
      expect(result.drc.ran).toBe(false)
      expect(result.gerbers).toBeUndefined()
    })

    it('fails honestly when the atoProjectDir itself does not exist', () => {
      const runDir = makeTmpDir('pcb-pipeline-missing-rundir-')
      tmpDirs.push(runDir)

      const result = runPcbPipeline('/nonexistent/path/that/does/not/exist', runDir)

      expect(result.ok).toBe(false)
      expect(result.stageReached).toBe('not_started')
      expect(result.errors[0]).toMatch(/does not exist/)
    })

    it('never claims Gerbers exist unless files are actually present on disk', () => {
      const brokenDir = makeTmpDir('pcb-pipeline-broken2-')
      tmpDirs.push(brokenDir)
      // No main.ato at all.
      const runDir = makeTmpDir('pcb-pipeline-broken2-rundir-')
      tmpDirs.push(runDir)

      const result = runPcbPipeline(brokenDir, runDir)
      expect(result.ok).toBe(false)
      expect(result.gerbers).toBeUndefined()
      expect(result.drc.violations).toBeNull()
    })
  })

  // ── Real toolchain integration (skipped honestly, not silently, if absent) ──
  const capability = discoverPcbCapability()
  const toolchainReady = capability.canAuthor && capability.canRoute && capability.canVerifyAndExport
  const describeIfToolchain = toolchainReady ? describe : describe.skip

  describeIfToolchain('tiny known-good fixture — real end-to-end pipeline', () => {
    let atoProjectDir: string
    let runDir: string
    let result: ReturnType<typeof runPcbPipeline>

    beforeAll(() => {
      atoProjectDir = makeTmpDir('pcb-pipeline-tiny-ato-')
      tmpDirs.push(atoProjectDir)
      const genResult = generateAtopileProject(TINY_ELECTRONIC_DESIGN, atoProjectDir)
      expect(genResult.components.length).toBeGreaterThanOrEqual(3)

      runDir = makeTmpDir('pcb-pipeline-tiny-rundir-')
      tmpDirs.push(runDir)
      result = runPcbPipeline(atoProjectDir, runDir, { maxIterations: 4, maxPasses: 200 })
    }, 15 * 60 * 1000)

    it('reaches at least the DRC stage and DRC actually ran', () => {
      expect(result.drc.ran).toBe(true)
      expect(typeof result.drc.violations).toBe('number')
      expect(result.drc.reportPath).toBeDefined()
      expect(existsSync(result.drc.reportPath!)).toBe(true)
    }, 30_000)

    it('produces a structured result with real artifact paths (or an honest gap)', () => {
      expect(result.components).toBeGreaterThanOrEqual(3)
      expect(result.nets).toBeGreaterThan(0)
      expect(result.stageReached).not.toBe('not_started')
      // Every path the result claims to exist must actually be on disk — the
      // core honesty contract this phase exists to enforce.
      if (result.kicadPcbPath) expect(existsSync(result.kicadPcbPath)).toBe(true)
      if (result.gerbers) {
        expect(existsSync(result.gerbers.dir)).toBe(true)
        expect(result.gerbers.files.length).toBeGreaterThan(0)
        for (const f of result.gerbers.files) expect(existsSync(f)).toBe(true)
      }
      if (result.renderPng) expect(existsSync(result.renderPng)).toBe(true)
    }, 30_000)

    it('writes every artifact under runDir — never /tmp, never a hardcoded path', () => {
      if (result.kicadPcbPath) expect(result.kicadPcbPath.startsWith(runDir)).toBe(true)
      if (result.gerbers) expect(result.gerbers.dir.startsWith(runDir)).toBe(true)
      if (result.renderPng) expect(result.renderPng.startsWith(runDir)).toBe(true)
    }, 30_000)

    it('ok is true ONLY if routed AND DRC clean AND gerbers exist on disk (never optimistic)', () => {
      if (result.ok) {
        expect(result.routed).toBe(true)
        expect(result.drc.ran).toBe(true)
        expect(result.drc.violations).toBe(0)
        expect(result.gerbers).toBeDefined()
        expect(result.gerbers!.files.length).toBeGreaterThan(0)
      } else {
        // An honest failure must still explain itself.
        expect(result.errors.length).toBeGreaterThan(0)
      }
    }, 30_000)
  })

  describeIfToolchain('honest failure at the ato-build stage (deliberately broken project)', () => {
    it('fails honestly when main.ato has a syntax error — ato build fails, no fake success', () => {
      const brokenDir = makeTmpDir('pcb-pipeline-syntax-broken-')
      tmpDirs.push(brokenDir)
      writeFileSync(join(brokenDir, 'main.ato'), 'this is not valid atopile syntax {{{ ]]]\n')
      writeFileSync(join(brokenDir, 'ato.yaml'), 'ato-version: ^0.2.0\nbuilds:\n  default:\n    entry: main.ato:App\n')

      const runDir = makeTmpDir('pcb-pipeline-syntax-broken-rundir-')
      tmpDirs.push(runDir)

      const result = runPcbPipeline(brokenDir, runDir)

      expect(result.ok).toBe(false)
      expect(result.stageReached).toBe('ato_build')
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.drc.ran).toBe(false)
      expect(result.gerbers).toBeUndefined()
    }, 60_000)
  })

  if (!toolchainReady) {
    it('honestly reports the local PCB toolchain is not fully available for the real-pipeline suite', () => {
      // Not a failure of THIS test — a visible, honest skip reason instead of a
      // silent green suite when kicad-cli/atopile/Freerouting/the KiCad Python
      // bridge aren't all present on this machine.
      expect(capability.missingRequired).toBeDefined()
      // eslint-disable-next-line no-console
      console.warn(
        `[pcb-pipeline.test] real-toolchain suite skipped — canAuthor=${capability.canAuthor} canRoute=${capability.canRoute} canVerifyAndExport=${capability.canVerifyAndExport}`,
      )
    })
  }
})
