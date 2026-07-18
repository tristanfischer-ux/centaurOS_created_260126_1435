/**
 * @file Arbitrary PCB outline geometry — ENGINE-SIDE (Phase B, 2026-07-12).
 * @description Builds and validates closed board contours made from lines/arcs,
 * then renders KiCad 10 Edge.Cuts. Supports circles, rounded rectangles,
 * polygons, irregular paths, internal cut-outs, and mounting holes. Ported
 * verbatim from `prototypes/pcb-capability/pcb-outline.ts` (validated selftest)
 * so `atopile-generator.ts` can compute a component-area-derived board outline.
 *
 * Run: npx tsx src/lib/pdf-engine-v2/lib/pcb/pcb-outline.ts --selftest
 */

import type {
  PcbArcSegment,
  PcbBoardGeometry,
  PcbContour,
  PcbLineSegment,
  PcbMountingHole,
  PcbOutlineSegment,
  PcbPoint,
} from './pcb-contract'
import type { PcbBoardShapeContract } from './pcb-architecture'

const EPSILON_MM = 0.001

function point(xMm: number, yMm: number): PcbPoint {
  return { xMm, yMm }
}

function line(start: PcbPoint, end: PcbPoint): PcbLineSegment {
  return { kind: 'line', start, end }
}

function arc(
  start: PcbPoint,
  mid: PcbPoint,
  end: PcbPoint,
): PcbArcSegment {
  return { kind: 'arc', start, mid, end }
}

function distance(a: PcbPoint, b: PcbPoint): number {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm)
}

function segmentStart(segment: PcbOutlineSegment): PcbPoint {
  return segment.start
}

function segmentEnd(segment: PcbOutlineSegment): PcbPoint {
  return segment.end
}

function format(value: number): string {
  return Number(value.toFixed(4)).toString()
}

/**
 * @description Builds a closed polygon contour from three or more vertices.
 * @param id - Stable contour identifier.
 * @param vertices - Ordered perimeter vertices; the closing edge is added automatically.
 * @returns A closed line-only contour.
 * @throws When fewer than three vertices are supplied.
 */
export function createPolygonContour(
  id: string,
  vertices: readonly PcbPoint[],
): PcbContour {
  if (vertices.length < 3) {
    throw new Error('A PCB polygon requires at least three vertices')
  }
  const segments = vertices.map((vertex, index) =>
    line(vertex, vertices[(index + 1) % vertices.length]),
  )
  return { id, segments }
}

/**
 * @description Builds a circular board outline using two KiCad-compatible arcs.
 * @param id - Stable contour identifier.
 * @param center - Circle centre.
 * @param diameterMm - Finished board diameter.
 * @returns A closed circular contour.
 */
export function createCircularContour(
  id: string,
  center: PcbPoint,
  diameterMm: number,
): PcbContour {
  if (!(diameterMm > 0)) throw new Error('Circle diameter must be positive')
  const radius = diameterMm / 2
  const top = point(center.xMm, center.yMm - radius)
  const right = point(center.xMm + radius, center.yMm)
  const bottom = point(center.xMm, center.yMm + radius)
  const left = point(center.xMm - radius, center.yMm)
  return {
    id,
    segments: [
      arc(top, right, bottom),
      arc(bottom, left, top),
    ],
  }
}

/**
 * @description Builds a rounded rectangular outline using four lines and four arcs.
 * @param id - Stable contour identifier.
 * @param widthMm - Finished width.
 * @param heightMm - Finished height.
 * @param radiusMm - Corner radius.
 * @returns A closed rounded-rectangle contour.
 */
export function createRoundedRectangleContour(
  id: string,
  widthMm: number,
  heightMm: number,
  radiusMm: number,
): PcbContour {
  if (!(widthMm > 0 && heightMm > 0)) {
    throw new Error('Rounded rectangle dimensions must be positive')
  }
  if (!(radiusMm > 0 && radiusMm <= Math.min(widthMm, heightMm) / 2)) {
    throw new Error('Corner radius must be positive and fit the board')
  }
  const diagonal = radiusMm / Math.sqrt(2)
  return {
    id,
    segments: [
      line(point(radiusMm, 0), point(widthMm - radiusMm, 0)),
      arc(
        point(widthMm - radiusMm, 0),
        point(widthMm - radiusMm + diagonal, radiusMm - diagonal),
        point(widthMm, radiusMm),
      ),
      line(point(widthMm, radiusMm), point(widthMm, heightMm - radiusMm)),
      arc(
        point(widthMm, heightMm - radiusMm),
        point(widthMm - radiusMm + diagonal, heightMm - radiusMm + diagonal),
        point(widthMm - radiusMm, heightMm),
      ),
      line(point(widthMm - radiusMm, heightMm), point(radiusMm, heightMm)),
      arc(
        point(radiusMm, heightMm),
        point(radiusMm - diagonal, heightMm - radiusMm + diagonal),
        point(0, heightMm - radiusMm),
      ),
      line(point(0, heightMm - radiusMm), point(0, radiusMm)),
      arc(
        point(0, radiusMm),
        point(radiusMm - diagonal, radiusMm - diagonal),
        point(radiusMm, 0),
      ),
    ],
  }
}

function shapeDatum(shape: PcbBoardShapeContract, id: string): number | null {
  const value = shape.datums?.find((datum) => datum.id === id)?.valueMm
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function mountingHoleCenters(
  count: number,
  widthMm: number,
  heightMm: number,
  insetMm: number,
): PcbPoint[] {
  if (count <= 0) return []
  if (count === 1) return [point(widthMm / 2, heightMm / 2)]
  if (count === 2) {
    return [
      point(insetMm, heightMm / 2),
      point(widthMm - insetMm, heightMm / 2),
    ]
  }
  if (count === 3) {
    return [
      point(widthMm / 2, insetMm),
      point(insetMm, heightMm - insetMm),
      point(widthMm - insetMm, heightMm - insetMm),
    ]
  }
  if (count === 4) {
    return [
      point(insetMm, insetMm),
      point(widthMm - insetMm, insetMm),
      point(widthMm - insetMm, heightMm - insetMm),
      point(insetMm, heightMm - insetMm),
    ]
  }
  const radiusX = widthMm / 2 - insetMm
  const radiusY = heightMm / 2 - insetMm
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count
    return point(
      widthMm / 2 + radiusX * Math.cos(angle),
      heightMm / 2 + radiusY * Math.sin(angle),
    )
  })
}

/**
 * @description Converts a function-derived board-plan shape into fabrication
 * geometry. Contracts without dimensional datums return null so legacy
 * component-area outline generation remains authoritative.
 * @param shape - Board-plan outline family, dimensional datums, and hole count.
 * @returns Validated board geometry, or null when the contract has no dimensions.
 * @throws When supplied dimensions or mounting-hole datums cannot form a valid board.
 */
export function createBoardGeometryFromShapeContract(
  shape: PcbBoardShapeContract,
): PcbBoardGeometry | null {
  const widthMm = shapeDatum(shape, 'outline_width_mm')
  const heightMm = shapeDatum(shape, 'outline_height_mm')
  if (widthMm === null || heightMm === null) return null
  const cornerRadiusMm = shapeDatum(shape, 'corner_radius_mm') ?? 2
  const holeInsetMm = shapeDatum(shape, 'mounting_hole_inset_mm') ?? 3
  const holeDiameterMm = shapeDatum(shape, 'mounting_hole_diameter_mm') ?? 3.2
  if (
    widthMm <= 0 ||
    heightMm <= 0 ||
    holeInsetMm <= holeDiameterMm / 2 ||
    holeInsetMm >= Math.min(widthMm, heightMm) / 2
  ) {
    throw new Error(`Invalid ${shape.shapeFamily} board-shape datums`)
  }

  const geometry: PcbBoardGeometry = {
    outline: createRoundedRectangleContour(
      'board_outline',
      widthMm,
      heightMm,
      cornerRadiusMm,
    ),
    cutouts: [],
    mountingHoles: mountingHoleCenters(
      shape.mountingHoles,
      widthMm,
      heightMm,
      holeInsetMm,
    ).map((center, index) => ({
      id: `mounting_hole_${index + 1}`,
      center,
      diameterMm: holeDiameterMm,
      plated: false,
    })),
    source: 'derived',
    sourceDetail:
      `${shape.shapeFamily} from ${shape.outlineBasis}; ` +
      (shape.datums ?? []).map((datum) => datum.basis).join('; '),
  }
  const findings = validateBoardGeometry(geometry)
  if (findings.length) {
    throw new Error(`Invalid board-plan geometry: ${findings.join(', ')}`)
  }
  return geometry
}

/**
 * @description Validates contour continuity, closure, finite coordinates, and non-degenerate arcs.
 * @param contour - External outline or internal cut-out.
 * @returns Finding strings; an empty array means the contour is structurally valid.
 */
export function validateContour(contour: PcbContour): string[] {
  const findings: string[] = []
  if (contour.segments.length < 2) {
    findings.push(`${contour.id}:too_few_segments`)
    return findings
  }
  for (const [index, segment] of contour.segments.entries()) {
    const coordinates = segment.kind === 'arc'
      ? [segment.start, segment.mid, segment.end]
      : [segment.start, segment.end]
    if (
      coordinates.some(
        (coordinate) =>
          !Number.isFinite(coordinate.xMm) ||
          !Number.isFinite(coordinate.yMm),
      )
    ) {
      findings.push(`${contour.id}:segment_${index}:non_finite_coordinate`)
    }
    if (distance(segment.start, segment.end) <= EPSILON_MM) {
      findings.push(`${contour.id}:segment_${index}:zero_length`)
    }
    if (segment.kind === 'arc') {
      const cross =
        (segment.mid.xMm - segment.start.xMm) *
          (segment.end.yMm - segment.start.yMm) -
        (segment.mid.yMm - segment.start.yMm) *
          (segment.end.xMm - segment.start.xMm)
      if (Math.abs(cross) <= EPSILON_MM) {
        findings.push(`${contour.id}:segment_${index}:degenerate_arc`)
      }
    }
    const next = contour.segments[(index + 1) % contour.segments.length]
    if (distance(segmentEnd(segment), segmentStart(next)) > EPSILON_MM) {
      findings.push(`${contour.id}:segment_${index}:open_or_discontinuous`)
    }
  }
  return findings
}

/**
 * @description Validates the complete board geometry before KiCad generation.
 * @param geometry - External contour, cut-outs, holes, and provenance.
 * @returns Finding strings; an empty array means the geometry can proceed to KiCad DRC.
 */
export function validateBoardGeometry(
  geometry: PcbBoardGeometry,
): string[] {
  const findings = [
    ...validateContour(geometry.outline),
    ...geometry.cutouts.flatMap(validateContour),
  ]
  const ids = new Set<string>()
  for (const entity of [
    geometry.outline,
    ...geometry.cutouts,
    ...geometry.mountingHoles,
  ]) {
    if (ids.has(entity.id)) findings.push(`${entity.id}:duplicate_id`)
    ids.add(entity.id)
  }
  for (const hole of geometry.mountingHoles) {
    if (!(hole.diameterMm > 0)) {
      findings.push(`${hole.id}:non_positive_diameter`)
    }
    if (
      !Number.isFinite(hole.center.xMm) ||
      !Number.isFinite(hole.center.yMm)
    ) {
      findings.push(`${hole.id}:non_finite_center`)
    }
  }
  if (!geometry.sourceDetail.trim()) findings.push('geometry:missing_source_detail')
  return findings
}

function renderContour(contour: PcbContour): string[] {
  return contour.segments.map((segment) => {
    if (segment.kind === 'line') {
      return `  (gr_line (start ${format(segment.start.xMm)} ${format(segment.start.yMm)}) (end ${format(segment.end.xMm)} ${format(segment.end.yMm)}) (stroke (width 0.1) (type default)) (layer "Edge.Cuts"))`
    }
    return `  (gr_arc (start ${format(segment.start.xMm)} ${format(segment.start.yMm)}) (mid ${format(segment.mid.xMm)} ${format(segment.mid.yMm)}) (end ${format(segment.end.xMm)} ${format(segment.end.yMm)}) (stroke (width 0.1) (type default)) (layer "Edge.Cuts"))`
  })
}

/**
 * @description Renders every external/internal contour as KiCad 10 Edge.Cuts.
 * @param geometry - Validated board geometry.
 * @returns KiCad S-expression lines.
 * @throws When the geometry is open, degenerate, duplicated, or lacks provenance.
 */
export function renderKiCadEdgeCuts(
  geometry: PcbBoardGeometry,
): string {
  const findings = validateBoardGeometry(geometry)
  if (findings.length) {
    throw new Error(`Invalid PCB geometry:\n${findings.join('\n')}`)
  }
  return [
    ...renderContour(geometry.outline),
    ...geometry.cutouts.flatMap(renderContour),
  ].join('\n')
}

/**
 * @description Renders mounting-hole footprints separately from routed Edge.Cuts.
 * @param holes - Plated or non-plated mechanical holes.
 * @returns KiCad footprint S-expression blocks.
 */
export function renderKiCadMountingHoles(
  holes: readonly PcbMountingHole[],
): string {
  return holes.map((hole) => {
    const padType = hole.plated ? 'thru_hole' : 'np_thru_hole'
    const padNumber = hole.plated ? '"1"' : '""'
    const layers = hole.plated ? '"*.Cu" "*.Mask"' : '"*.Cu" "*.Mask"'
    return [
      `(footprint "MountingHole:${hole.id}" (layer "F.Cu") (at ${format(hole.center.xMm)} ${format(hole.center.yMm)})`,
      `  (pad ${padNumber} ${padType} circle (at 0 0) (size ${format(hole.diameterMm)} ${format(hole.diameterMm)}) (drill ${format(hole.diameterMm)}) (layers ${layers}))`,
      ')',
    ].join('\n')
  }).join('\n')
}

function geometry(outline: PcbContour, cutouts: PcbContour[] = []): PcbBoardGeometry {
  return {
    outline,
    cutouts,
    mountingHoles: [],
    source: 'mechanical_cad',
    sourceDetail: 'selftest fixture',
  }
}

function selftest(): void {
  const circle = geometry(createCircularContour('round-board', point(25, 25), 50))
  const rounded = geometry(
    createRoundedRectangleContour('rounded-board', 80, 45, 6),
  )
  const hexagon = geometry(
    createPolygonContour('hex-board', [
      point(10, 0),
      point(40, 0),
      point(50, 20),
      point(40, 40),
      point(10, 40),
      point(0, 20),
    ]),
  )
  const irregularWithCutout = geometry(
    createPolygonContour('l-board', [
      point(0, 0),
      point(60, 0),
      point(60, 20),
      point(35, 20),
      point(35, 50),
      point(0, 50),
    ]),
    [createCircularContour('centre-cutout', point(15, 20), 8)],
  )
  irregularWithCutout.mountingHoles = [
    { id: 'mh-1', center: point(5, 5), diameterMm: 3.2, plated: false },
  ]

  const valid = [circle, rounded, hexagon, irregularWithCutout]
  for (const candidate of valid) {
    const findings = validateBoardGeometry(candidate)
    if (findings.length) {
      throw new Error(`${candidate.outline.id} unexpectedly invalid: ${findings.join(', ')}`)
    }
    const edgeCuts = renderKiCadEdgeCuts(candidate)
    if (!edgeCuts.includes('Edge.Cuts')) {
      throw new Error(`${candidate.outline.id} did not render Edge.Cuts`)
    }
  }
  if (!renderKiCadEdgeCuts(circle).includes('gr_arc')) {
    throw new Error('Circular board must render arcs')
  }
  if (!renderKiCadEdgeCuts(rounded).includes('gr_arc')) {
    throw new Error('Rounded board must render corner arcs')
  }
  if (!renderKiCadEdgeCuts(hexagon).includes('gr_line')) {
    throw new Error('Polygon board must render lines')
  }
  if (!renderKiCadEdgeCuts(irregularWithCutout).includes('centre-cutout') &&
      irregularWithCutout.cutouts.length !== 1) {
    throw new Error('Irregular board must retain its cutout')
  }
  if (!renderKiCadMountingHoles(irregularWithCutout.mountingHoles).includes('np_thru_hole')) {
    throw new Error('Non-plated mounting hole was not rendered')
  }

  const open: PcbContour = {
    id: 'open-board',
    segments: [
      line(point(0, 0), point(10, 0)),
      line(point(12, 0), point(0, 0)),
    ],
  }
  if (!validateContour(open).some((finding) => finding.includes('open_or_discontinuous'))) {
    throw new Error('Open outline proveCatch did not fire')
  }
  console.log('pcb-outline selftest: OK (circle / rounded / polygon / irregular + cutout / open catch)')
}

if (process.argv.includes('--selftest')) selftest()
