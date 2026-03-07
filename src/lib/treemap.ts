/**
 * @file treemap.ts — Squarified treemap layout algorithm.
 *
 * @description Pure TypeScript utility that computes a space-filling rectangle
 * layout using the squarified treemap algorithm. Items are sorted descending by
 * value and greedily packed in strips along the shorter axis of the remaining
 * rectangle, optimising for squareness (minimising worst aspect ratio per strip).
 *
 * @see https://www.win.tue.nl/~vanwijk/stm.pdf — Squarified Treemaps (2000)
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface TreemapItem {
  id: string
  value: number
}

export interface TreemapRect {
  x: number
  y: number
  w: number
  h: number
}

export interface TreemapCell {
  id: string
  value: number
  rect: TreemapRect
}

// ─── Algorithm ───────────────────────────────────────────────────────

/** Worst aspect ratio for a strip of items laid out along `length`. */
function worstRatio(strip: number[], totalArea: number, length: number): number {
  if (strip.length === 0 || length === 0) return Infinity
  const s = strip.reduce((a, b) => a + b, 0)
  const s2 = s * s
  const maxVal = Math.max(...strip)
  const minVal = Math.min(...strip)
  const l2 = length * length
  return Math.max((l2 * maxVal) / s2, s2 / (l2 * minVal))
}

/** Lay out a single strip of items along one edge of the remaining rect. */
function layoutStrip(
  strip: { id: string; scaledArea: number }[],
  rect: TreemapRect,
): { cells: TreemapCell[]; remaining: TreemapRect } {
  const totalStripArea = strip.reduce((s, i) => s + i.scaledArea, 0)
  const isHorizontal = rect.w >= rect.h
  const length = isHorizontal ? rect.h : rect.w
  const thickness = length > 0 ? totalStripArea / length : 0

  const cells: TreemapCell[] = []
  let offset = 0

  for (const item of strip) {
    const itemLength = thickness > 0 ? item.scaledArea / thickness : 0
    if (isHorizontal) {
      cells.push({
        id: item.id,
        value: item.scaledArea,
        rect: { x: rect.x, y: rect.y + offset, w: thickness, h: itemLength },
      })
    } else {
      cells.push({
        id: item.id,
        value: item.scaledArea,
        rect: { x: rect.x + offset, y: rect.y, w: itemLength, h: thickness },
      })
    }
    offset += itemLength
  }

  const remaining: TreemapRect = isHorizontal
    ? { x: rect.x + thickness, y: rect.y, w: rect.w - thickness, h: rect.h }
    : { x: rect.x, y: rect.y + thickness, w: rect.w, h: rect.h - thickness }

  return { cells, remaining }
}

/**
 * Compute a squarified treemap layout.
 *
 * @param items - Array of { id, value } objects. Zero/negative values are filtered out.
 * @param bounds - The bounding rectangle to fill { x, y, w, h }.
 * @returns Array of TreemapCell with computed rects. Original values are preserved.
 */
export function squarify(items: TreemapItem[], bounds: TreemapRect): TreemapCell[] {
  // Filter and sort descending
  const valid = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  if (valid.length === 0) return []
  if (valid.length === 1) {
    return [{ id: valid[0].id, value: valid[0].value, rect: { ...bounds } }]
  }

  // Scale values to fit the total area
  const totalValue = valid.reduce((s, i) => s + i.value, 0)
  const totalArea = bounds.w * bounds.h
  const scaled = valid.map((i) => ({
    id: i.id,
    originalValue: i.value,
    scaledArea: (i.value / totalValue) * totalArea,
  }))

  const result: TreemapCell[] = []
  let rect = { ...bounds }
  let idx = 0

  while (idx < scaled.length) {
    const shortSide = Math.min(rect.w, rect.h)
    const strip: typeof scaled = []
    let stripAreas: number[] = []

    // Greedily add items to the current strip while aspect ratio improves
    while (idx < scaled.length) {
      const candidate = scaled[idx]
      const newAreas = [...stripAreas, candidate.scaledArea]
      const currentWorst = worstRatio(stripAreas, totalArea, shortSide)
      const newWorst = worstRatio(newAreas, totalArea, shortSide)

      if (strip.length === 0 || newWorst <= currentWorst) {
        strip.push(candidate)
        stripAreas = newAreas
        idx++
      } else {
        break
      }
    }

    // Layout strip and shrink remaining rect
    const { cells, remaining } = layoutStrip(strip, rect)

    // Map back to original values
    for (const cell of cells) {
      const orig = scaled.find((s) => s.id === cell.id)
      result.push({
        ...cell,
        value: orig?.originalValue ?? cell.value,
      })
    }

    rect = remaining
  }

  return result
}
