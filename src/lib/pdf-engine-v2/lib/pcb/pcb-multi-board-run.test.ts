/**
 * @file proveCatch — multi-board PCB runner does NOT merge N boards into one project.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { kicadDeliverableBoards, runBespokeMultiBoardPcb } from './pcb-multi-board-run'
import { derivePcbArchitecture } from './pcb-architecture'
import type { PcbPipelineResult } from './pcb-pipeline'

function fakePipeline(ok: boolean, stage: string): PcbPipelineResult {
  return {
    ok,
    stageReached: stage,
    routed: ok,
    drc: { ran: ok, violations: ok ? 0 : null },
    errors: ok ? [] : ['fake fail'],
  }
}

/** Minimal state that derivePcbArchitecture treats as wet-lab multi-board. */
function wetLabState(): Record<string, unknown> {
  return {
    parsedBrief: {
      product_class: 'benchtop_bioreactor',
      constraints: {
        working_volume_ml: 20,
      },
    },
    orchestratorContract: {
      product_class: 'benchtop_bioreactor',
      quantities: {
        working_volume_ml: 20,
      },
    },
    moduleDecomposition: {
      product_class: 'benchtop_bioreactor',
      modules: [
        {
          module_id: 'sensing',
          sub_modules: [{
            sub_module_id: 'od',
            words: [
              {
                word_id: 'od_led_word',
                name_human: 'OD LED',
                content_character: { character_id: 'led_emitter' },
                modifier_characters: [
                  { kind: 'part_number', value: 'WP7113SURC' },
                  { kind: 'manufacturer', value: 'Kingbright' },
                ],
              },
              {
                word_id: 'od_pd_word',
                name_human: 'OD Photodiode',
                content_character: { character_id: 'photodiode' },
                modifier_characters: [
                  { kind: 'part_number', value: 'BPW34' },
                  { kind: 'manufacturer', value: 'Vishay' },
                ],
              },
            ],
          }],
        },
        {
          module_id: 'actuation',
          sub_modules: [{
            sub_module_id: 'thermal',
            words: [
              {
                word_id: 'tmp1075_word',
                name_human: 'TMP1075',
                content_character: { character_id: 'temperature_sensor' },
                modifier_characters: [
                  { kind: 'part_number', value: 'TMP1075DSGR' },
                  { kind: 'manufacturer', value: 'TI' },
                ],
              },
            ],
          }],
        },
        {
          module_id: 'compute',
          sub_modules: [{
            sub_module_id: 'mcu',
            words: [
              {
                word_id: 'mcu_word',
                name_human: 'MCU',
                content_character: { character_id: 'microcontroller_mcu' },
                modifier_characters: [
                  { kind: 'part_number', value: 'ESP32-WROOM-32E' },
                  { kind: 'manufacturer', value: 'Espressif' },
                ],
              },
            ],
          }],
        },
      ],
    },
  }
}

describe('pcb-multi-board-run', () => {
  it('architecture for working_volume_ml plans multiple KiCad boards', () => {
    const plan = derivePcbArchitecture(wetLabState())
    const kicad = kicadDeliverableBoards(plan)
    expect(kicad.length).toBeGreaterThanOrEqual(2)
  })

  it('proveCatch: N KiCad boards → N project dirs and multiBoardMerged=false', () => {
    const root = mkdtempSync(join(tmpdir(), 'pcb-multi-'))
    try {
      const state = wetLabState()
      const plan = derivePcbArchitecture(state)
      const kicad = kicadDeliverableBoards(plan)
      expect(kicad.length).toBeGreaterThanOrEqual(2)

      // Stub generate by ensuring electronic words resolve enough to write ato —
      // runBespokeMultiBoardPcb calls real generateAtopileProject. Footprints may
      // leave unresolved; that is fine — we only assert directory fan-out.
      const seenProjectDirs: string[] = []
      const seenRunDirs: string[] = []
      const result = runBespokeMultiBoardPcb(state, root, (projectDir, runDir) => {
        seenProjectDirs.push(projectDir)
        seenRunDirs.push(runDir)
        mkdirSync(projectDir, { recursive: true })
        // generateAtopileProject already wrote main.ato before pipeline is called
        if (!existsSync(join(projectDir, 'main.ato'))) {
          writeFileSync(join(projectDir, 'main.ato'), 'module App:\n  pass\n')
        }
        return fakePipeline(false, 'placement')
      })

      expect(result.multiBoardMerged).toBe(false)
      expect(result.boardPipelines.length).toBe(kicad.length)
      expect(seenProjectDirs.length).toBe(kicad.length)
      // Distinct dirs under pcb-project/<boardId>
      const unique = new Set(seenProjectDirs)
      expect(unique.size).toBe(kicad.length)
      for (const dir of seenProjectDirs) {
        expect(dir.includes(`${join('pcb-project')}`)).toBe(true)
        expect(existsSync(join(dir, 'main.ato')) || existsSync(dir)).toBe(true)
      }
      // proveCatch: per-board run dirs so pcb/ artefacts are not clobbered
      expect(new Set(seenRunDirs).size).toBe(kicad.length)
      for (const dir of seenRunDirs) {
        expect(dir.includes(`${join('pcb-boards')}`)).toBe(true)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
