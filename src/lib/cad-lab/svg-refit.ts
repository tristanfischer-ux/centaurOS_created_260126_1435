/**
 * @file svg-refit.ts — Server-side SVG viewBox refitting.
 *
 * @description CadQuery/Modal exports SVGs with oversized viewBox values where
 * the actual geometry occupies a tiny corner of a massive canvas. This utility
 * parses SVG path data to compute tight bounding boxes and rewrites the viewBox
 * to frame the content with 10% padding, producing crisp renders at any size.
 *
 * Runs server-side in the API route before uploading to Supabase storage, so
 * BOTH Build and Review pages benefit from the corrected viewBox.
 */

// ─── Coordinate extraction ─────────────────────────────────────────

/** Extract numeric coordinates from SVG path `d` attributes */
function extractPathCoords(svgContent: string): number[] {
  const coords: number[] = []
  // Match all d="..." attributes in <path> elements
  const dAttrRegex = /\bd="([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = dAttrRegex.exec(svgContent)) !== null) {
    // Extract all numbers from the path data (handles decimals, negatives, scientific notation)
    const numRegex = /-?\d+\.?\d*(?:e[+-]?\d+)?/gi
    let numMatch: RegExpExecArray | null
    while ((numMatch = numRegex.exec(match[1])) !== null) {
      coords.push(parseFloat(numMatch[0]))
    }
  }
  return coords
}

/** Extract position and dimension attributes from basic SVG shapes */
function extractShapeCoords(svgContent: string): { xs: number[]; ys: number[] } {
  const xs: number[] = []
  const ys: number[] = []

  // <circle cx="..." cy="..." r="...">
  const circleRegex = /<circle[^>]*?cx="([\d.e+-]+)"[^>]*?cy="([\d.e+-]+)"[^>]*?r="([\d.e+-]+)"/gi
  let m: RegExpExecArray | null
  while ((m = circleRegex.exec(svgContent)) !== null) {
    const cx = parseFloat(m[1]), cy = parseFloat(m[2]), r = parseFloat(m[3])
    xs.push(cx - r, cx + r)
    ys.push(cy - r, cy + r)
  }

  // <rect x="..." y="..." width="..." height="...">
  const rectRegex = /<rect[^>]*?x="([\d.e+-]+)"[^>]*?y="([\d.e+-]+)"[^>]*?width="([\d.e+-]+)"[^>]*?height="([\d.e+-]+)"/gi
  while ((m = rectRegex.exec(svgContent)) !== null) {
    const x = parseFloat(m[1]), y = parseFloat(m[2])
    const w = parseFloat(m[3]), h = parseFloat(m[4])
    xs.push(x, x + w)
    ys.push(y, y + h)
  }

  // <line x1="..." y1="..." x2="..." y2="...">
  const lineRegex = /<line[^>]*?x1="([\d.e+-]+)"[^>]*?y1="([\d.e+-]+)"[^>]*?x2="([\d.e+-]+)"[^>]*?y2="([\d.e+-]+)"/gi
  while ((m = lineRegex.exec(svgContent)) !== null) {
    xs.push(parseFloat(m[1]), parseFloat(m[3]))
    ys.push(parseFloat(m[2]), parseFloat(m[4]))
  }

  // <ellipse cx="..." cy="..." rx="..." ry="...">
  const ellipseRegex = /<ellipse[^>]*?cx="([\d.e+-]+)"[^>]*?cy="([\d.e+-]+)"[^>]*?rx="([\d.e+-]+)"[^>]*?ry="([\d.e+-]+)"/gi
  while ((m = ellipseRegex.exec(svgContent)) !== null) {
    const cx = parseFloat(m[1]), cy = parseFloat(m[2])
    const rx = parseFloat(m[3]), ry = parseFloat(m[4])
    xs.push(cx - rx, cx + rx)
    ys.push(cy - ry, cy + ry)
  }

  // <polyline> / <polygon> points="x,y x,y ..."
  const polyRegex = /<(?:polyline|polygon)[^>]*?points="([^"]+)"/gi
  while ((m = polyRegex.exec(svgContent)) !== null) {
    const numRegex = /-?\d+\.?\d*(?:e[+-]?\d+)?/gi
    let n: RegExpExecArray | null
    let idx = 0
    while ((n = numRegex.exec(m[1])) !== null) {
      if (idx % 2 === 0) xs.push(parseFloat(n[0]))
      else ys.push(parseFloat(n[0]))
      idx++
    }
  }

  return { xs, ys }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Refit an SVG's viewBox to tightly frame its geometry with 10% padding.
 *
 * @param svgBase64 - Base64-encoded SVG string (without data URI prefix)
 * @returns Refitted base64-encoded SVG, or the original if parsing fails
 */
export function refitSvgViewBox(svgBase64: string): string {
  try {
    const svgContent = Buffer.from(svgBase64, "base64").toString("utf-8")

    // Extract path coordinates (alternating x,y pairs in path data)
    const pathCoords = extractPathCoords(svgContent)
    const { xs: shapeXs, ys: shapeYs } = extractShapeCoords(svgContent)

    // Path coordinates alternate x,y — separate them
    const pathXs: number[] = []
    const pathYs: number[] = []
    for (let i = 0; i < pathCoords.length; i++) {
      // DECISION: CadQuery paths use absolute coordinates predominantly.
      // Alternating even=x, odd=y is a reasonable heuristic for bounding box.
      if (i % 2 === 0) pathXs.push(pathCoords[i])
      else pathYs.push(pathCoords[i])
    }

    const allXs = [...pathXs, ...shapeXs]
    const allYs = [...pathYs, ...shapeYs]

    if (allXs.length === 0 || allYs.length === 0) return svgBase64

    const minX = Math.min(...allXs)
    const maxX = Math.max(...allXs)
    const minY = Math.min(...allYs)
    const maxY = Math.max(...allYs)

    const width = maxX - minX
    const height = maxY - minY

    // Sanity check: skip if bounds are degenerate
    if (width <= 0 || height <= 0) return svgBase64

    // 10% padding on each side
    const padX = width * 0.1
    const padY = height * 0.1

    const newViewBox = `${(minX - padX).toFixed(2)} ${(minY - padY).toFixed(2)} ${(width + 2 * padX).toFixed(2)} ${(height + 2 * padY).toFixed(2)}`

    // Replace existing viewBox (or add one if missing)
    let refitted: string
    if (/viewBox="[^"]*"/.test(svgContent)) {
      refitted = svgContent.replace(/viewBox="[^"]*"/, `viewBox="${newViewBox}"`)
    } else {
      // Add viewBox to the root <svg> element
      refitted = svgContent.replace(/<svg\b/, `<svg viewBox="${newViewBox}"`)
    }

    return Buffer.from(refitted, "utf-8").toString("base64")
  } catch {
    // GOTCHA: If anything goes wrong parsing, return original — don't break the upload pipeline
    return svgBase64
  }
}
