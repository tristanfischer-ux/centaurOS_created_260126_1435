/**
 * @file image-overlay.ts — Post-process generated images with text labels
 *
 * @description Imagen 4 / gpt-image-1 can't reliably render text, so images
 * are generated clean (no text) and we add professional labels server-side
 * using Sharp's SVG composite. This produces an engineering-drawing style
 * annotation frame around the illustration:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │  MODULE NAME — purpose                       │  top bar
 *   ├──────┬──────────────────────────────┬───────┤
 *   │ IN:  │                              │ OUT:  │
 *   │ • x  │    [CLEAN ILLUSTRATION]      │ • y   │  side margins
 *   │ • z  │                              │ • w   │
 *   ├──────┴──────────────────────────────┴───────┤
 *   │  KEY: Component A • Component B • ...        │  bottom bar
 *   └─────────────────────────────────────────────┘
 *
 * @security No user-supplied strings are rendered without XML escaping.
 *
 * @related
 * - Image generator: ./image-generator.ts (calls these functions before upload)
 * - Module spec: ./xray-schema.ts (ModuleSpec type definition)
 */

import sharp from "sharp"

// ─── Layout Constants ────────────────────────────────────────────────

const TOP_BAR_H = 60
const BOTTOM_BAR_H = 50
const SIDE_MARGIN_W = 140
const FONT_FAMILY = "system-ui, -apple-system, Helvetica, Arial, sans-serif"
const BG_COLOR = "#1a1a2e" // dark navy for frame
const TEXT_COLOR = "#e8e8e8"
const ACCENT_COLOR = "#ff4500" // International Orange
const MUTED_COLOR = "#a0a0b0"
const BULLET = "•"
const SIDE_LINE_H = 22 // line height for side margin items

// ─── XML Escape ──────────────────────────────────────────────────────

/** Escapes user-supplied text for safe SVG embedding. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Truncates text to maxLen characters, adding ellipsis if needed. */
function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s
}

// ─── Module Image Overlay ────────────────────────────────────────────

interface ModuleLabelData {
  name: string
  purpose: string
  keyParts: string[]
  io: { in: string[]; out: string[] }
}

/**
 * Adds an engineering-drawing annotation frame around a module blueprint image.
 *
 * @param base64Png - Base64-encoded PNG image data (no data URI prefix)
 * @param module - Label data extracted from ModuleSpec
 * @returns New base64-encoded PNG with labels baked in
 */
export async function overlayModuleLabels(
  base64Png: string,
  module: ModuleLabelData,
): Promise<string> {
  const imgBuffer = Buffer.from(base64Png, "base64")
  const metadata = await sharp(imgBuffer).metadata()
  const imgW = metadata.width ?? 2048
  const imgH = metadata.height ?? 1365

  // Total canvas size with frame
  const totalW = imgW + SIDE_MARGIN_W * 2
  const totalH = imgH + TOP_BAR_H + BOTTOM_BAR_H

  // Build SVG overlay that covers the full canvas
  const svg = buildModuleSvg(totalW, totalH, imgW, imgH, module)

  // Extend image canvas with dark frame, then composite SVG text on top
  const result = await sharp(imgBuffer)
    .extend({
      top: TOP_BAR_H,
      bottom: BOTTOM_BAR_H,
      left: SIDE_MARGIN_W,
      right: SIDE_MARGIN_W,
      background: BG_COLOR,
    })
    .composite([
      {
        input: Buffer.from(svg),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer()

  return result.toString("base64")
}

/**
 * Builds the SVG overlay for a module image annotation frame.
 * The SVG is transparent in the center (illustration shows through)
 * and contains text in the margin areas.
 */
function buildModuleSvg(
  totalW: number,
  totalH: number,
  imgW: number,
  imgH: number,
  module: ModuleLabelData,
): string {
  const lines: string[] = []
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`)

  // ── Top bar: MODULE NAME — purpose ──
  const title = esc(truncate(module.name.toUpperCase(), 40))
  const purpose = esc(truncate(module.purpose, 80))
  const topY = TOP_BAR_H / 2

  lines.push(`  <text x="${SIDE_MARGIN_W}" y="${topY - 2}" fill="${ACCENT_COLOR}" font-family="${FONT_FAMILY}" font-size="18" font-weight="700" dominant-baseline="middle">${title}</text>`)

  // Purpose text, offset to the right of the name
  // Approximate name width: ~11px per char at 18px bold
  const nameWidth = Math.min(module.name.length * 11, totalW * 0.3)
  const dashX = SIDE_MARGIN_W + nameWidth + 16
  lines.push(`  <text x="${dashX}" y="${topY - 2}" fill="${MUTED_COLOR}" font-family="${FONT_FAMILY}" font-size="14" dominant-baseline="middle">— ${purpose}</text>`)

  // ── Thin accent line below top bar ──
  lines.push(`  <line x1="0" y1="${TOP_BAR_H - 1}" x2="${totalW}" y2="${TOP_BAR_H - 1}" stroke="${ACCENT_COLOR}" stroke-width="2" stroke-opacity="0.6"/>`)

  // ── Left margin: Inputs ──
  const sideStartY = TOP_BAR_H + 24
  lines.push(`  <text x="16" y="${sideStartY}" fill="${ACCENT_COLOR}" font-family="${FONT_FAMILY}" font-size="13" font-weight="700">INPUTS</text>`)

  module.io.in.slice(0, 8).forEach((input, i) => {
    const y = sideStartY + (i + 1) * SIDE_LINE_H
    const label = esc(truncate(input, 16))
    lines.push(`  <text x="16" y="${y}" fill="${TEXT_COLOR}" font-family="${FONT_FAMILY}" font-size="12">${BULLET} ${label}</text>`)
  })

  // ── Right margin: Outputs ──
  const rightX = totalW - 16
  lines.push(`  <text x="${rightX}" y="${sideStartY}" fill="${ACCENT_COLOR}" font-family="${FONT_FAMILY}" font-size="13" font-weight="700" text-anchor="end">OUTPUTS</text>`)

  module.io.out.slice(0, 8).forEach((output, i) => {
    const y = sideStartY + (i + 1) * SIDE_LINE_H
    const label = esc(truncate(output, 16))
    lines.push(`  <text x="${rightX}" y="${y}" fill="${TEXT_COLOR}" font-family="${FONT_FAMILY}" font-size="12" text-anchor="end">${label} ${BULLET}</text>`)
  })

  // ── Thin accent line above bottom bar ──
  const bottomBarY = TOP_BAR_H + imgH
  lines.push(`  <line x1="0" y1="${bottomBarY}" x2="${totalW}" y2="${bottomBarY}" stroke="${ACCENT_COLOR}" stroke-width="2" stroke-opacity="0.6"/>`)

  // ── Bottom bar: KEY COMPONENTS ──
  const bottomY = bottomBarY + BOTTOM_BAR_H / 2 + 2
  const keyLabel = "KEY:  "
  const parts = module.keyParts.slice(0, 6).map((p) => esc(truncate(p, 30))).join(` ${BULLET} `)
  lines.push(`  <text x="${SIDE_MARGIN_W}" y="${bottomY}" fill="${MUTED_COLOR}" font-family="${FONT_FAMILY}" font-size="12" dominant-baseline="middle"><tspan fill="${ACCENT_COLOR}" font-weight="700">${keyLabel}</tspan>${parts}</text>`)

  lines.push("</svg>")
  return lines.join("\n")
}

// ─── System Diagram Legend ───────────────────────────────────────────

const LEGEND_BAR_H = 56

interface SystemLegendModule {
  name: string
  purpose: string
}

/**
 * Adds a bottom legend bar to a system diagram showing module names.
 *
 * @param base64Png - Base64-encoded PNG image data
 * @param systemFunction - One-line system function description
 * @param modules - List of module names and purposes for the legend
 * @returns New base64-encoded PNG with legend bar
 */
export async function overlaySystemLegend(
  base64Png: string,
  systemFunction: string,
  modules: SystemLegendModule[],
): Promise<string> {
  const imgBuffer = Buffer.from(base64Png, "base64")
  const metadata = await sharp(imgBuffer).metadata()
  const imgW = metadata.width ?? 2048
  const totalH = (metadata.height ?? 1152) + LEGEND_BAR_H

  const svg = buildSystemLegendSvg(imgW, totalH, systemFunction, modules)

  const result = await sharp(imgBuffer)
    .extend({
      top: 0,
      bottom: LEGEND_BAR_H,
      left: 0,
      right: 0,
      background: BG_COLOR,
    })
    .composite([
      {
        input: Buffer.from(svg),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer()

  return result.toString("base64")
}

/**
 * Builds the SVG legend bar for a system diagram.
 */
function buildSystemLegendSvg(
  totalW: number,
  totalH: number,
  systemFunction: string,
  modules: SystemLegendModule[],
): string {
  const lines: string[] = []
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`)

  const barY = totalH - LEGEND_BAR_H

  // Accent line
  lines.push(`  <line x1="0" y1="${barY}" x2="${totalW}" y2="${barY}" stroke="${ACCENT_COLOR}" stroke-width="2" stroke-opacity="0.6"/>`)

  // System function label
  const midY = barY + LEGEND_BAR_H / 2
  const funcText = esc(truncate(systemFunction, 60))
  lines.push(`  <text x="20" y="${midY - 8}" fill="${ACCENT_COLOR}" font-family="${FONT_FAMILY}" font-size="13" font-weight="700" dominant-baseline="middle">SYSTEM</text>`)
  lines.push(`  <text x="88" y="${midY - 8}" fill="${MUTED_COLOR}" font-family="${FONT_FAMILY}" font-size="12" dominant-baseline="middle">${funcText}</text>`)

  // Module names row
  const moduleStr = modules.slice(0, 8).map((m) => esc(truncate(m.name, 20))).join(` ${BULLET} `)
  lines.push(`  <text x="20" y="${midY + 12}" fill="${TEXT_COLOR}" font-family="${FONT_FAMILY}" font-size="12" dominant-baseline="middle">${moduleStr}</text>`)

  lines.push("</svg>")
  return lines.join("\n")
}
