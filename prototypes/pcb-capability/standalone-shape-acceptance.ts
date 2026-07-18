/**
 * @file Standalone bespoke-shape acceptance harness.
 * @description Generates non-rectangular KiCad boards, runs KiCad DRC, exports
 * Gerbers/drills, and renders PNGs without importing or invoking the Anvil engine.
 *
 * Run:
 *   npx tsx prototypes/pcb-capability/standalone-shape-acceptance.ts
 * Optional persistent output:
 *   PCB_ACCEPTANCE_OUT=/tmp/pcb-shapes npx tsx .../standalone-shape-acceptance.ts
 */

import { execFileSync } from 'child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'

import { discoverPcbCapability } from './discover-pcb-capability'
import {
  createCircularContour,
  createPolygonContour,
  createRoundedRectangleContour,
  renderKiCadEdgeCuts,
  renderKiCadMountingHoles,
  validateBoardGeometry,
} from './pcb-outline'

import type {
  PcbBoardGeometry,
  PcbPoint,
} from './pcb-contract'

interface ShapeFixture {
  id: string
  geometry: PcbBoardGeometry
  routedConnections: Array<{
    name: string
    start: PcbPoint
    end: PcbPoint
  }>
}

interface ShapeAcceptanceResult {
  id: string
  passed: boolean
  boardFile: string
  drcReport: string
  gerberFiles: string[]
  drillFiles: string[]
  renderFile?: string
  errors: string[]
}

function point(xMm: number, yMm: number): PcbPoint {
  return { xMm, yMm }
}

function geometry(
  outline: PcbBoardGeometry['outline'],
  mountingHoles: PcbBoardGeometry['mountingHoles'],
  cutouts: PcbBoardGeometry['cutouts'] = [],
): PcbBoardGeometry {
  return {
    outline,
    cutouts,
    mountingHoles,
    source: 'mechanical_cad',
    sourceDetail: 'standalone bespoke-shape acceptance fixture',
  }
}

function fixtures(): ShapeFixture[] {
  return [
    {
      id: 'circular',
      geometry: geometry(
        createCircularContour('circular-outline', point(30, 30), 54),
        [
          { id: 'circle-mh-1', center: point(30, 8), diameterMm: 3.2, plated: false },
          { id: 'circle-mh-2', center: point(30, 52), diameterMm: 3.2, plated: false },
        ],
      ),
      routedConnections: [
        { name: 'VCC', start: point(18, 20), end: point(42, 20) },
        { name: 'GND', start: point(18, 40), end: point(42, 40) },
      ],
    },
    {
      id: 'rounded',
      geometry: geometry(
        createRoundedRectangleContour('rounded-outline', 78, 46, 8),
        [
          { id: 'round-mh-1', center: point(8, 8), diameterMm: 3.2, plated: false },
          { id: 'round-mh-2', center: point(70, 38), diameterMm: 3.2, plated: false },
        ],
      ),
      routedConnections: [
        { name: 'VCC', start: point(18, 16), end: point(60, 16) },
        { name: 'GND', start: point(18, 30), end: point(60, 30) },
      ],
    },
    {
      id: 'hexagonal',
      geometry: geometry(
        createPolygonContour('hexagonal-outline', [
          point(15, 0),
          point(55, 0),
          point(70, 30),
          point(55, 60),
          point(15, 60),
          point(0, 30),
        ]),
        [
          { id: 'hex-mh-1', center: point(15, 15), diameterMm: 3.2, plated: false },
          { id: 'hex-mh-2', center: point(55, 45), diameterMm: 3.2, plated: false },
        ],
      ),
      routedConnections: [
        { name: 'VCC', start: point(18, 20), end: point(52, 20) },
        { name: 'GND', start: point(18, 40), end: point(52, 40) },
      ],
    },
    {
      id: 'irregular-l-with-cutout',
      geometry: geometry(
        createPolygonContour('irregular-l-outline', [
          point(0, 0),
          point(72, 0),
          point(72, 24),
          point(44, 24),
          point(44, 58),
          point(0, 58),
        ]),
        [
          { id: 'l-mh-1', center: point(8, 8), diameterMm: 3.2, plated: false },
          { id: 'l-mh-2', center: point(8, 50), diameterMm: 3.2, plated: false },
        ],
        [createCircularContour('l-board-cutout', point(24, 30), 10)],
      ),
      routedConnections: [
        { name: 'VCC', start: point(10, 12), end: point(62, 12) },
        { name: 'GND', start: point(10, 46), end: point(34, 46) },
      ],
    },
  ]
}

function routedCircuitSource(
  connections: ShapeFixture['routedConnections'],
): string {
  const blocks: string[] = []
  connections.forEach((connection, index) => {
    const netCode = index + 1
    const refA = `TP${index * 2 + 1}`
    const refB = `TP${index * 2 + 2}`
    blocks.push(`  (net ${netCode} "${connection.name}")`)
    for (const [ref, location] of [
      [refA, connection.start],
      [refB, connection.end],
    ] as const) {
      blocks.push(
        [
          `  (footprint "Acceptance:${ref}" (layer "F.Cu") (at ${location.xMm} ${location.yMm})`,
          `    (fp_text reference "${ref}" (at 0 -2) (layer "F.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))`,
          `    (fp_text value "${connection.name}" (at 0 2) (layer "F.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))`,
          '    (fp_circle (center 0 0) (end 1.25 0) (stroke (width 0.15) (type default)) (fill none) (layer "F.SilkS"))',
          `    (pad "1" thru_hole circle (at 0 0) (size 2.5 2.5) (drill 1) (layers "*.Cu" "*.Mask") (net ${netCode} "${connection.name}"))`,
          '  )',
        ].join('\n'),
      )
    }
    blocks.push(
      `  (segment (start ${connection.start.xMm} ${connection.start.yMm}) (end ${connection.end.xMm} ${connection.end.yMm}) (width 0.5) (layer "F.Cu") (net ${netCode}))`,
    )
  })
  return blocks.join('\n')
}

function boardSource(fixture: ShapeFixture): string {
  return [
    '(kicad_pcb (version 20241229) (generator "forgeos-pcb-shape-acceptance")',
    '  (general (thickness 1.6))',
    '  (paper "A4")',
    '  (layers',
    '    (0 "F.Cu" signal)',
    '    (31 "B.Cu" signal)',
    '    (36 "B.SilkS" user "b.silkscreen")',
    '    (37 "F.SilkS" user "f.silkscreen")',
    '    (38 "B.Mask" user)',
    '    (39 "F.Mask" user)',
    '    (44 "Edge.Cuts" user)',
    '  )',
    '  (setup (pad_to_mask_clearance 0))',
    '  (net 0 "")',
    `  (gr_text "${fixture.id}" (at 5 5) (layer "F.SilkS")`,
    '    (effects (font (size 1 1) (thickness 0.15)))',
    '  )',
    routedCircuitSource(fixture.routedConnections),
    renderKiCadEdgeCuts(fixture.geometry),
    renderKiCadMountingHoles(fixture.geometry.mountingHoles),
    ')',
  ].join('\n')
}

function nonEmptyFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .map((name) => resolve(directory, name))
    .filter((path) => statSync(path).isFile() && statSync(path).size > 0)
}

function runShape(
  kicadCli: string,
  outputRoot: string,
  fixture: ShapeFixture,
): ShapeAcceptanceResult {
  const shapeDir = resolve(outputRoot, fixture.id)
  const gerberDir = resolve(shapeDir, 'gerbers')
  const drillDir = resolve(shapeDir, 'drill')
  mkdirSync(gerberDir, { recursive: true })
  mkdirSync(drillDir, { recursive: true })
  const boardFile = resolve(shapeDir, `${fixture.id}.kicad_pcb`)
  const drcReport = resolve(shapeDir, 'drc.json')
  const renderFile = resolve(shapeDir, `${fixture.id}.png`)
  const errors = validateBoardGeometry(fixture.geometry)
  if (errors.length) {
    return {
      id: fixture.id,
      passed: false,
      boardFile,
      drcReport,
      gerberFiles: [],
      drillFiles: [],
      errors,
    }
  }

  writeFileSync(boardFile, boardSource(fixture))
  const run = (args: string[]): void => {
    execFileSync(kicadCli, args, {
      cwd: shapeDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    })
  }

  try {
    run([
      'pcb', 'drc',
      '--output', drcReport,
      '--format', 'json',
      '--severity-error',
      '--exit-code-violations',
      boardFile,
    ])
    run([
      'pcb', 'export', 'gerbers',
      '--output', gerberDir,
      '--layers', 'F.Cu,B.Cu,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts',
      boardFile,
    ])
    run([
      'pcb', 'export', 'drill',
      '--output', drillDir,
      '--excellon-separate-th',
      '--generate-report',
      boardFile,
    ])
    try {
      run([
        'pcb', 'render',
        '--output', renderFile,
        '--side', 'top',
        '--quality', 'basic',
        '--background', 'opaque',
        boardFile,
      ])
    } catch (error) {
      // Rendering is useful evidence but not a fabrication blocker on headless hosts.
      errors.push(
        `render_warning:${error instanceof Error ? error.message : 'unknown'}`,
      )
    }
  } catch (error) {
    errors.push(
      `kicad_command_failed:${error instanceof Error ? error.message : 'unknown'}`,
    )
  }

  const gerberFiles = nonEmptyFiles(gerberDir)
  const drillFiles = nonEmptyFiles(drillDir)
  if (!existsSync(drcReport) || statSync(drcReport).size === 0) {
    errors.push('missing_drc_report')
  }
  if (!gerberFiles.some((path) => /Edge_Cuts|Edge-Cuts/i.test(path))) {
    errors.push('missing_edge_cuts_gerber')
  }
  if (!drillFiles.length) errors.push('missing_drill_output')

  return {
    id: fixture.id,
    passed: !errors.some((error) => !error.startsWith('render_warning:')),
    boardFile,
    drcReport,
    gerberFiles,
    drillFiles,
    renderFile: existsSync(renderFile) ? renderFile : undefined,
    errors,
  }
}

/**
 * @description Runs independent KiCad acceptance tests for bespoke PCB shapes.
 * @returns Output directory and per-shape results.
 */
export function runStandaloneShapeAcceptance(): {
  outputRoot: string
  passed: boolean
  results: ShapeAcceptanceResult[]
} {
  const capability = discoverPcbCapability()
  if (!capability.kicadCli.available || !capability.kicadCli.path) {
    throw new Error('kicad-cli is required for PCB shape acceptance')
  }
  const outputRoot = process.env.PCB_ACCEPTANCE_OUT
    ? resolve(process.env.PCB_ACCEPTANCE_OUT)
    : mkdtempSync(resolve(tmpdir(), 'forgeos-pcb-shape-acceptance-'))
  mkdirSync(outputRoot, { recursive: true })
  const results = fixtures().map((fixture) =>
    runShape(capability.kicadCli.path!, outputRoot, fixture),
  )
  const report = {
    generatedAt: new Date().toISOString(),
    kicadVersion: capability.kicadCli.version,
    outputRoot,
    passed: results.every((result) => result.passed),
    results,
  }
  writeFileSync(
    resolve(outputRoot, 'acceptance-report.json'),
    JSON.stringify(report, null, 2),
  )
  return report
}

if (require.main === module) {
  const report = runStandaloneShapeAcceptance()
  console.log(JSON.stringify(report, null, 2))
  if (!report.passed) process.exit(1)
}
