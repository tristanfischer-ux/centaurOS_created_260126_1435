/**
 * @file rasterise-spatial-plan.ts — server-side SVG→PNG for the PDF.
 *
 * @description `@react-pdf/renderer`'s native `<Svg>` primitives render
 * the spatial plan as a solid black rectangle even with explicit white
 * `<Rect>` backgrounds. Observed 2026-04-24 across BESS PDFs. The fix
 * path is to build the SVG as a plain string, rasterise to PNG via
 * sharp, and embed in the PDF as `<Image>` — sidesteps the react-pdf
 * SVG rasteriser entirely.
 *
 * Sharp supports SVG input natively (librsvg-based). Output is a base64
 * data URI that @react-pdf/renderer's Image component accepts directly.
 *
 * @security Only internal SVG strings constructed from trusted
 * `spatial_plan` JSONB are passed to sharp — no user-supplied SVG.
 * sharp sanitises non-raster input elements and returns a raster PNG
 * regardless of what's inside the SVG, but we still escape all text
 * labels via `escapeXml()` defence-in-depth.
 */

import type { SpatialPlan, Placement, Feature } from "@/lib/layout/types"

// ─── Style helpers (mirror of export-project-pdf.tsx's helpers) ────────

const MOUNT_COLOURS: Record<
    string,
    { fill: string; stroke: string; dashed: boolean }
> = {
    floor: { fill: "#dbeafe", stroke: "#1e40af", dashed: false },
    wall: { fill: "#e0e7ff", stroke: "#4338ca", dashed: false },
    ceiling: { fill: "#fef3c7", stroke: "#92400e", dashed: true },
    envelope: { fill: "transparent", stroke: "#9ca3af", dashed: true },
}

const DEFAULT_MOUNT = { fill: "#f3f4f6", stroke: "#6b7280", dashed: false }

function mountColours(mount: string | null | undefined) {
    if (mount && Object.prototype.hasOwnProperty.call(MOUNT_COLOURS, mount)) {
        return MOUNT_COLOURS[mount]!
    }
    return DEFAULT_MOUNT
}

const FEATURE_STYLES: Record<
    string,
    { fill: string; stroke: string; strokeDasharray?: string }
> = {
    door: { fill: "transparent", stroke: "#ef4444", strokeDasharray: "4 3" },
    hatch: { fill: "transparent", stroke: "#f97316", strokeDasharray: "4 3" },
    window: { fill: "transparent", stroke: "#3b82f6", strokeDasharray: "4 3" },
    aisle: { fill: "#fef3c7", stroke: "#f59e0b" },
    clearance: { fill: "transparent", stroke: "#f59e0b", strokeDasharray: "2 2" },
    default: { fill: "transparent", stroke: "#6b7280", strokeDasharray: "2 2" },
}

function featureStyle(kind: string | null | undefined) {
    if (kind && Object.prototype.hasOwnProperty.call(FEATURE_STYLES, kind)) {
        return FEATURE_STYLES[kind]!
    }
    return FEATURE_STYLES.default!
}

function escapeXml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
}

// ─── SVG string builder ─────────────────────────────────────────────────

/**
 * Builds a complete SVG document as a plain string. No React, no
 * @react-pdf bindings — just concatenated XML. Designed to be piped
 * into sharp(svgBuffer).png() for PNG output.
 */
export function buildSpatialPlanSvg(
    plan: SpatialPlan,
    moduleNameById: Map<string, string>,
): string {
    const env = plan.envelope
    const view = plan.view
    const is2D = view === "top_down" || view === "side_elevation"
    if (!is2D) {
        // 3D views fall back to a stack diagram in the PDF — we only
        // rasterise the 2D top-down / side-elevation floorplans.
        return ""
    }

    const labelFor = (p: Placement): string =>
        p.label_override ?? moduleNameById.get(p.module_id) ?? p.module_id

    // Drawing dimensions — 1200px wide produces a crisp 450pt image in
    // the PDF at 2.5x device-pixel density.
    const DRAWING_W = 1200
    const axisInset = 40

    const envelopeX_mm = env.interior_w_mm
    const envelopeY_mm =
        view === "top_down" ? env.interior_d_mm : env.interior_h_mm

    const scale = envelopeX_mm > 0 ? DRAWING_W / envelopeX_mm : 1
    const drawingW = DRAWING_W
    const drawingH = Math.max(120, envelopeY_mm * scale)
    const svgW = drawingW + axisInset * 2
    const svgH = drawingH + axisInset * 2

    const toSvgX = (x_mm: number): number => axisInset + x_mm * scale
    const toSvgY = (y_mm: number, size_mm: number): number =>
        axisInset + (envelopeY_mm - y_mm - size_mm) * scale
    const toSvgPtY = (y_mm: number): number =>
        axisInset + (envelopeY_mm - y_mm) * scale

    const sizeAlongY = (p: Placement): number =>
        view === "top_down" ? p.d_mm : p.h_mm
    const sizeAlongX = (p: Placement): number => p.w_mm
    const originOnY = (p: Placement): number =>
        view === "top_down" ? p.y_mm : (p.z_mm ?? 0)

    const parts: string[] = []

    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
    )

    // White canvas background
    parts.push(
        `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#ffffff"/>`,
    )

    // Envelope outline
    parts.push(
        `<rect x="${axisInset}" y="${axisInset}" width="${drawingW}" height="${drawingH}" fill="#ffffff" stroke="#111827" stroke-width="2"/>`,
    )

    // Placements
    for (const p of plan.placements) {
        const w = Math.max(2, sizeAlongX(p) * scale)
        const h = Math.max(2, sizeAlongY(p) * scale)
        const x = toSvgX(p.x_mm)
        const y = toSvgY(originOnY(p), sizeAlongY(p))
        const c = mountColours(p.mount)
        const label = escapeXml(labelFor(p))
        const dashAttr = c.dashed ? ` stroke-dasharray="8 5"` : ""
        const fillAttr = c.fill === "transparent" ? "none" : c.fill

        parts.push(
            `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fillAttr}" stroke="${c.stroke}" stroke-width="1.5"${dashAttr}/>`,
        )

        // Label font size — larger than PDF's SVG because we're rendering
        // at 2.5x pixel density and scaling down.
        const labelFontSize = Math.max(14, Math.min(24, Math.floor(Math.min(w, h) / 6)))
        if (w > 60 && h > 30) {
            parts.push(
                `<text x="${x + w / 2}" y="${y + h / 2 + labelFontSize / 3}" font-family="Helvetica, Arial, sans-serif" font-size="${labelFontSize}" font-weight="500" fill="#111827" text-anchor="middle">${label}</text>`,
            )
        }
    }

    // Features (doors, hatches, aisles)
    for (const f of plan.features) {
        const style = featureStyle(f.kind)
        const fillAttr = style.fill === "transparent" ? "none" : style.fill
        const dashAttr = style.strokeDasharray
            ? ` stroke-dasharray="${style.strokeDasharray.replace(/,/g, " ")}"`
            : ""

        if (f.geometry === "rect" && f.coords.length >= 4) {
            const fx = f.coords[0] as number
            const fy = f.coords[1] as number
            const fw = f.coords[2] as number
            const fh = f.coords[3] as number
            parts.push(
                `<rect x="${toSvgX(fx)}" y="${toSvgY(fy, fh)}" width="${fw * scale}" height="${fh * scale}" fill="${fillAttr}" stroke="${style.stroke}" stroke-width="1.5"${dashAttr}/>`,
            )
        } else if (f.geometry === "line" && f.coords.length >= 4) {
            const x1 = f.coords[0] as number
            const y1 = f.coords[1] as number
            const x2 = f.coords[2] as number
            const y2 = f.coords[3] as number
            parts.push(
                `<line x1="${toSvgX(x1)}" y1="${toSvgPtY(y1)}" x2="${toSvgX(x2)}" y2="${toSvgPtY(y2)}" stroke="${style.stroke}" stroke-width="1.5"${dashAttr}/>`,
            )
        } else if (f.geometry === "polygon" && f.coords.length >= 6) {
            const pts: string[] = []
            for (let k = 0; k + 1 < f.coords.length; k += 2) {
                const xi = f.coords[k] as number
                const yi = f.coords[k + 1] as number
                pts.push(`${toSvgX(xi)},${toSvgPtY(yi)}`)
            }
            parts.push(
                `<polygon points="${pts.join(" ")}" fill="${fillAttr}" stroke="${style.stroke}" stroke-width="1.5"${dashAttr}/>`,
            )
        }
    }

    // Origin marker
    parts.push(
        `<circle cx="${axisInset}" cy="${axisInset + drawingH}" r="4" fill="#111827"/>`,
    )

    // Axis labels
    parts.push(
        `<text x="${axisInset}" y="${axisInset + drawingH + 20}" font-family="Helvetica" font-size="14" fill="#6b7280">0</text>`,
    )
    parts.push(
        `<text x="${axisInset + drawingW - 40}" y="${axisInset + drawingH + 20}" font-family="Helvetica" font-size="14" fill="#6b7280">${envelopeX_mm} mm</text>`,
    )
    parts.push(
        `<text x="${axisInset - 30}" y="${axisInset + 10}" font-family="Helvetica" font-size="14" fill="#6b7280">${envelopeY_mm}</text>`,
    )

    parts.push(`</svg>`)
    return parts.join("")
}

// ─── PNG rasteriser ─────────────────────────────────────────────────────

/**
 * Rasterises the spatial plan SVG to a PNG and returns a base64 data
 * URI embeddable in @react-pdf/renderer's `<Image>`. Returns null for
 * 3D views (where we keep the stack-diagram fallback) or when the plan
 * has no placements.
 */
export async function rasteriseSpatialPlanToDataUri(
    plan: SpatialPlan,
    moduleNameById: Map<string, string>,
): Promise<string | null> {
    const svg = buildSpatialPlanSvg(plan, moduleNameById)
    if (!svg) return null

    const sharp = (await import("sharp")).default
    const image = sharp(Buffer.from(svg))
    
    const stats = await image.stats()
    if (stats.channels[0] && stats.channels[1] && stats.channels[2]) {
        const meanR = stats.channels[0].mean
        const meanG = stats.channels[1].mean
        const meanB = stats.channels[2].mean
        if (meanR < 10 && meanG < 10 && meanB < 10) {
            console.warn("[rasterise-spatial-plan] SVG rasterisation produced a black rectangle. Falling back to table.")
            return null
        }
    }

    const pngBuffer = await image
        .png({ compressionLevel: 8 })
        .toBuffer()
    const base64 = pngBuffer.toString("base64")
    return `data:image/png;base64,${base64}`
}
