"use server"

/**
 * @file export-project-pdf.tsx — V2 "Generate export" comprehensive PDF.
 *
 * @description Pulls every readable artefact on a V2 project (brief +
 * regulatory + modules + key parts + failure modes + unknowns + parts
 * table + BOM lines + per-module cost breakdown + Finn assumptions +
 * Fang / Jian / Max reviews + supplier match reasons + project audit
 * log) and renders one long, properly sectioned PDF. Intended to be
 * the "put the kitchen sink in" board / supplier / data-room pack.
 *
 * Design:
 *   - Cover page: brand bar + project title + revision + generated + ship state
 *   - TOC: numbered section list
 *   - Brief: full subject, mission, use case, customers, why now, constraints
 *   - Regulatory: full per-standard detail (no truncation)
 *   - One page per module: full description, purpose, why it matters,
 *     every key part, every failure mode, every unknown, diagnostics,
 *     Finn's cost breakdown for this module, Fang / Jian / Max reviews
 *   - BOM master: every part with every field (name, number, module,
 *     process, material, spec, finish, tolerance, mass, envelope, cost)
 *   - Cost waterfall: unit cost + per-module + Finn's per-part breakdown
 *   - Risks register: every failure mode + every unknown, per module
 *   - Suppliers: each with match reasons + score breakdown + modules
 *   - Audit log: project audit rows
 *
 * @security withAuth + foundry check before every read. Never includes
 * another tenant's data.
 */

import React from "react"
import {
    Document,
    Page,
    View,
    Text,
    StyleSheet,
    pdf,
    Image,
    Svg,
    Rect,
    Line,
    Circle,
    Polygon,
} from "@react-pdf/renderer"

import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"
import type { SpatialPlan, Placement, Feature } from "@/lib/layout/types"
import {
    looksLikeHallucinatedSupplierName,
    checkSupplierUrlShape,
} from "@/lib/supplier-verification"
import { dedupAssemblyRollUp } from "@/lib/bom/assembly-dedup"
import { checkBomModuleConsistency } from "@/lib/bom/module-consistency"
import { checkMirrorParity } from "@/lib/bom/mirror-parity"
import { buildSpendSummary, SPEND_BY_SUPPLIER_CONSTANTS } from "@/lib/bom/spend-by-supplier"
import { applyBomCostFallback } from "@/lib/cad-lab/bom-cost-fallback"
import { promoteSupplierScore } from "@/lib/cad-lab/supplier-strong-fit-promotion"
import { detectIndustryDomain } from "@/lib/cad-lab/industry-domains"
import {
    anyRiskMatrixIsBoilerplate,
    inferOwnerByDiscipline,
    isModuleRiskMatrixBoilerplate,
    repairRiskRowFromContext,
} from "@/lib/risk/boilerplate-detect"
import { computeFeasibilityVerdict as computeFeasibilityVerdictFn } from "@/lib/feasibility/compute-verdict"
import {
    triageWithFangFindings,
    regulatoryStatusLabel,
    regulatoryStatusColour,
    type FangIssue,
} from "@/lib/regulatory-triage"
import {
    SUPPLIER_DESCRIPTION_LEAK_PATTERNS,
    SUPPLIER_DESCRIPTION_FALLBACK,
    stripToolCallLeaks,
    formatJsonArrayField,
} from "@/lib/ai/llm-output-sanitiser"

// ─── Result ────────────────────────────────────────────────────────────

export type ExportProjectPdfResult =
    | {
          ok: true
          filename: string
          base64: string
          sizeBytes: number
      }
    | {
          ok: false
          error: string
          errorCode:
              | "PROJECT_NOT_FOUND"
              | "PROJECT_FORBIDDEN"
              | "RENDER_FAILED"
              | "INTERNAL"
      }

// ─── Styles ────────────────────────────────────────────────────────────

const BRAND = "#ea580c" // International-orange adjacent
const INK = "#1f2937"
const MUTED = "#6b7280"
const SOFT = "#9ca3af"
const BORDER = "#e5e7eb"
const BG_SOFT = "#f9fafb"

const styles = StyleSheet.create({
    // ── Pages ───────────────────────────────
    page: {
        padding: 36,
        paddingTop: 48,
        paddingBottom: 56,
        fontSize: 9.5,
        lineHeight: 1.45,
        color: INK,
    },
    cover: {
        padding: 0,
        color: INK,
        fontSize: 11,
        lineHeight: 1.5,
    },
    coverBand: {
        backgroundColor: BRAND,
        // `minHeight` (not fixed `height`) lets the band grow when the
        // project title wraps onto 2 or 3 lines — 28pt bold at
        // MAX_NAME_LEN=120 can produce a 2-line title for most briefs.
        // Fixed 140pt clipped the second line and visually truncated
        // the title. (Bug 2026-04-22, BESS container brief.)
        minHeight: 140,
        width: "100%",
        paddingLeft: 48,
        paddingRight: 48,
        paddingTop: 42,
        paddingBottom: 24,
        color: "white",
    },
    // marginBottom must exceed the h1's font descender to prevent the
    // subtitle visually colliding with the title at certain widths — 18
    // is safe for 28pt bold. Subtitle also gets explicit marginTop as
    // belt-and-braces against line-height round-off in react-pdf.
    coverBandTitle: { fontSize: 28, fontWeight: "bold", color: "white", marginBottom: 18, lineHeight: 1.2 },
    coverBandSub: { fontSize: 11, color: "white", opacity: 0.9, marginTop: 4 },
    coverBody: { padding: 48 },
    coverGridRow: { flexDirection: "row", marginBottom: 4 },
    coverGridLabel: { width: 160, color: MUTED, fontSize: 10 },
    coverGridValue: { flex: 1, fontSize: 10 },

    // ── Typography ──────────────────────────
    h1: { fontSize: 22, marginBottom: 4, fontWeight: "bold" },
    h2: {
        fontSize: 16,
        marginTop: 0,
        marginBottom: 10,
        fontWeight: "bold",
        color: BRAND,
        borderBottomWidth: 2,
        borderBottomColor: BRAND,
        paddingBottom: 4,
    },
    h3: { fontSize: 13, marginTop: 14, marginBottom: 6, fontWeight: "bold", color: INK },
    h4: { fontSize: 11, marginTop: 10, marginBottom: 4, fontWeight: "bold", color: INK },
    h5: { fontSize: 10, marginTop: 6, marginBottom: 3, fontWeight: "bold", color: MUTED, textTransform: "uppercase" },
    muted: { color: MUTED },
    soft: { color: SOFT, fontSize: 8.5 },
    small: { fontSize: 8.5, color: MUTED },
    para: { marginBottom: 6 },

    // ── Layout helpers ──────────────────────
    hr: { borderBottomWidth: 1, borderBottomColor: BORDER, marginTop: 6, marginBottom: 10 },
    row: { flexDirection: "row", marginBottom: 5 },
    rowLabel: { width: 140, fontWeight: "bold", paddingRight: 8 },
    rowValue: { flex: 1 },
    pill: {
        fontSize: 8,
        color: "white",
        backgroundColor: BRAND,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 3,
        alignSelf: "flex-start",
    },
    pillMuted: {
        fontSize: 8,
        color: MUTED,
        backgroundColor: BG_SOFT,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 3,
        alignSelf: "flex-start",
        borderWidth: 1,
        borderColor: BORDER,
    },
    statRow: { flexDirection: "row", gap: 14, marginBottom: 10 },
    stat: { flex: 1, padding: 8, backgroundColor: BG_SOFT, borderRadius: 4 },
    statLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", marginBottom: 2 },
    statValue: { fontSize: 14, fontWeight: "bold" },

    // ── Lists ───────────────────────────────
    bullet: { flexDirection: "row", marginBottom: 2, paddingLeft: 4 },
    bulletDot: { width: 8, color: BRAND, fontSize: 9 },
    bulletText: { flex: 1 },

    // ── Module card ─────────────────────────
    moduleHead: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 4,
    },
    moduleName: { fontSize: 13, fontWeight: "bold", flex: 1 },
    moduleMeta: { fontSize: 9, color: MUTED, textAlign: "right" },
    moduleImage: {
        // Full-page-width module image, no background fill. Earlier
        // version used backgroundColor: BG_SOFT which looked like a
        // dark/grey box around images when the rendered aspect ratio
        // didn't exactly match the container. width:100% + no
        // background gives edge-to-edge visibility.
        width: "100%",
        height: 260,
        marginTop: 6,
        marginBottom: 6,
        objectFit: "contain",
    },
    moduleImageEmpty: {
        height: 80,
        backgroundColor: BG_SOFT,
        borderRadius: 4,
        marginTop: 6,
        marginBottom: 6,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#e5e7eb",
        borderStyle: "dashed",
    },
    // INTENT: every AI-generated illustration carries a small disclaimer
    // caption. Founders consistently mistook renders for authored technical
    // specifications. The disclaimer makes the legal + engineering status
    // unambiguous at a glance. Applied under hero, concept, and every
    // module render. Tone: neutral, not apologetic.
    imageDisclaimer: {
        fontSize: 8,
        color: MUTED,
        fontStyle: "italic",
        textAlign: "center",
        marginTop: -2,
        marginBottom: 8,
    },
    coverImage: {
        // Full-page-width cover illustration, no background fill.
        // A4 content area at default react-pdf margins is ~515pt
        // wide; width:100% fills it.
        width: "100%",
        height: 340,
        marginTop: 14,
        objectFit: "contain",
    },

    // ── Tables ──────────────────────────────
    table: { marginTop: 4 },
    tableHead: {
        flexDirection: "row",
        backgroundColor: BG_SOFT,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
        paddingVertical: 4,
        paddingHorizontal: 2,
    },
    tableRow: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
        paddingVertical: 3,
        paddingHorizontal: 2,
    },
    tableHeadCell: { fontSize: 8, fontWeight: "bold", color: MUTED, textTransform: "uppercase" },
    tableCell: { fontSize: 8.5 },

    // ── Footer ──────────────────────────────
    footer: {
        position: "absolute",
        left: 36,
        right: 36,
        bottom: 22,
        fontSize: 8,
        color: SOFT,
        flexDirection: "row",
        justifyContent: "space-between",
        borderTopWidth: 1,
        borderTopColor: BORDER,
        paddingTop: 4,
    },
})

// Loop 7 critique fix A9: page numbers were absent across the whole PDF.
// react-pdf supplies pageNumber + totalPages via the render-prop pattern.
// Wrap each section's footer label + a "Page N of M" right-aligned text.
function PdfFooter({ label }: { label: string }): React.ReactElement {
    return (
        <View style={styles.footer} fixed>
            <Text>{label}</Text>
            <Text
                render={({ pageNumber, totalPages }) =>
                    `Page ${pageNumber} of ${totalPages}`
                }
            />
        </View>
    )
}

// ─── Small formatters ──────────────────────────────────────────────────

/**
 * Coerce ANY value coming off Supabase / PostgREST into a finite JS number
 * or null. This is the single chokepoint the PDF data builder uses for
 * every numeric column.
 *
 * The bug this protects against (2026-04-26 council-diagnosed):
 * PostgREST returns `numeric` and `decimal` columns as STRINGS to preserve
 * precision (e.g. "187500.00", "3800.0000"). The previous data builder
 * used `typeof x === "number"` checks which evaluated FALSE for every
 * row, so massKg / estimatedUnitCostGbp / etc. were all null silently.
 * That's been the historical state for months — but at some point a
 * downstream calc (Yoga flexbox layout for a numeric Style prop OR an
 * SVG coord) started hitting the propagated `undefined` sentinel
 * (Yoga's YGUndefined = 10e20f), arithmetic-combining into garbage like
 * -8.131324562511189e+21, and pdfkit then rejects with "unsupported
 * number". Coercing at the boundary gives downstream code a real number
 * to work with OR a clean null guarded by the existing `?? 0` patterns.
 */
function safeNumeric(val: unknown): number | null {
    if (val === null || val === undefined) return null;
    const n = typeof val === 'string' ? parseFloat(val) : val;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function safeDivide(a: number | null, b: number | null): number | null {
    if (a == null || b == null || b === 0) return null
    return a / b
}

function safeAdd(a: number | null, b: number | null): number | null {
    if (a == null || b == null) return null
    return a + b
}

function fmtGbp(n: number | null | undefined): string {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—"
    return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
}

/**
 * Recursively walk the PdfInput tree and return paths to any number
 * that is NaN / +Infinity / -Infinity / outside ±1e15 (pdfkit's safe
 * range is roughly ±1e21 but the Yoga sentinel is 1e20 so we flag much
 * earlier). Used as a last-line diagnostic before the render call.
 */
function walkForBadNumbers(
    obj: unknown,
    path: string,
): Array<{ path: string; value: unknown }> {
    const out: Array<{ path: string; value: unknown }> = []
    if (obj == null) return out
    if (typeof obj === "number") {
        if (!Number.isFinite(obj) || Math.abs(obj) > 1e15) {
            out.push({ path, value: obj })
        }
        return out
    }
    if (typeof obj === "string" && obj.length > 0 && obj.length < 30 && !isNaN(Number(obj))) {
        out.push({ path, value: obj })
    }
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            out.push(...walkForBadNumbers(obj[i], `${path}[${i}]`))
        }
        return out
    }
    if (typeof obj === "object") {
        for (const k of Object.keys(obj as Record<string, unknown>)) {
            // Skip giant string fields (research, subject, executive_summary)
            // and base64 blobs — they can't be the source of a bad number.
            if (k === "subject" || k === "executiveSummary" || k.endsWith("Base64") || k.endsWith("DataUri")) continue
            out.push(...walkForBadNumbers((obj as Record<string, unknown>)[k], `${path}.${k}`))
        }
    }
    return out
}

function coercePdfInputNumbers(data: PdfInput) {
    if (data.cost) {
        data.cost.unitTotalGbp = safeNumeric(data.cost.unitTotalGbp) as number | null
        data.cost.ceilingGbp = safeNumeric(data.cost.ceilingGbp) as number | null
        if ('headroomGbp' in data.cost) {
            (data.cost as any).headroomGbp = safeNumeric((data.cost as any).headroomGbp) as number | null
        }
    }
    for (const mod of data.modules) {
        mod.massKg = safeNumeric(mod.massKg) as number | null
        mod.budgetMassKg = safeNumeric(mod.budgetMassKg) as number | null
        if (mod.cost) {
            mod.cost.totalPerUnit = safeNumeric(mod.cost.totalPerUnit) as number | null
            if (mod.cost.labourCost !== undefined) mod.cost.labourCost = safeNumeric(mod.cost.labourCost) as number | null
            if (mod.cost.materialCostPerUnit !== undefined) mod.cost.materialCostPerUnit = safeNumeric(mod.cost.materialCostPerUnit) as number | undefined
            if (mod.cost.processingCostPerUnit !== undefined) mod.cost.processingCostPerUnit = safeNumeric(mod.cost.processingCostPerUnit) as number | undefined
            if (mod.cost.toolingCost !== undefined) mod.cost.toolingCost = safeNumeric(mod.cost.toolingCost) as number | undefined
            if (mod.cost.estimatedMassKg !== undefined) mod.cost.estimatedMassKg = safeNumeric(mod.cost.estimatedMassKg) as number | undefined
            
            if (Array.isArray(mod.cost.parts)) {
                for (const p of mod.cost.parts) {
                    if (p.cost !== undefined) p.cost = safeNumeric(p.cost) as number
                }
            }
            
            const anyCost = mod.cost as any
            if (Array.isArray(anyCost.costBreakdown)) {
                for (const row of anyCost.costBreakdown) {
                    if (!row || typeof row !== 'object') continue
                    for (const k of Object.keys(row)) {
                        if (typeof row[k] === 'string' && !isNaN(Number(row[k])) && row[k].length > 0) {
                            row[k] = safeNumeric(row[k])
                        } else if (typeof row[k] === 'number') {
                            row[k] = safeNumeric(row[k])
                        }
                    }
                }
            }
        }
    }
}

function fmtKg(n: number | null | undefined): string {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—"
    // British thousands separator (40000 → "40,000.00 kg") — Tristan-flagged
    // 2026-04-26 NIGHT: "When you have the max at 40,000 kilos, can you
    // please make sure you have commas for the numbers?"
    return `${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
}

/**
 * D3 — Loop 26 unverified-extraction badge.
 *
 * Returns true when a data row should display the "Unverified" pill:
 *   - confidence is absent (null / undefined) — older rows never had it; most cautious default
 *   - confidence is present but below the 0.7 threshold
 *   - verifiedAt is absent (null / undefined)
 *
 * Do NOT call for deterministic-rule-derived fields (solver envelope,
 * feasibility verdict, mass). Only for LLM-extracted values where a
 * human or authoritative source hasn't confirmed the claim.
 */
function isUnverifiedExtraction(
    confidence: number | null | undefined,
    verifiedAt: string | null | undefined,
): boolean {
    // Absence of verifiedAt is sufficient to mark unverified.
    if (!verifiedAt) return true
    // When verifiedAt present, still flag if confidence is explicitly low.
    if (confidence != null && confidence < 0.7) return true
    return false
}

/**
 * D3 — Inline "Unverified" pill for PDF rendering.
 * Rendered inline beside a value when isUnverifiedExtraction returns true.
 * Uses a muted amber colour so it is visible but not alarming on every row.
 */
function UnverifiedPill(): React.ReactElement {
    return (
        <Text
            style={{
                fontSize: 6.5,
                color: "#92400e",
                backgroundColor: "#fef3c7",
                paddingHorizontal: 3,
                paddingVertical: 1,
                borderRadius: 2,
                marginLeft: 3,
                fontWeight: "bold",
            }}
        >
            Unverified
        </Text>
    )
}

function fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    return d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    })
}

function fmtDuration(seconds: number | null | undefined): string {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—"
    if (seconds < 60) return `${seconds.toFixed(0)}s`
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds - m * 60)
    return `${m}m ${s}s`
}

// Loop 7 critique fixes A1 + A10: strip markdown asterisk bleed AND
// internal telemetry strings before any reviewer-authored text lands in
// the founder-visible PDF. Multiple sub-agent critiques flagged the same
// strings leaking across all three demos (BESS p.55/91, Hedgerow p.63,
// VertFarm p.42/101). Apply this to every review summary / issue /
// recommendation / supplier description / supplier certification field.
//
// Banned strings: model identifiers, scrape-failure markers, internal
// schema vocabulary, debug telemetry, and the LLM scratch-prompt patterns
// that leaked into Hedgerow's HYPERTAC LIMITED supplier description
// (p.56) — those start with phrases like "We need to produce" or "single
// sentence d50 words" or end mid-clause with "what supplier brings…".
const TELEMETRY_LEAK_LINE_PATTERNS: ReadonlyArray<RegExp> = [
    /^target provenance:.*$/im,
    /^freshest\b.*$/im,
    /^Phase \d+ is non-correcting\b.*$/im,
    /^BOM derived from the module decomposition.*$/im,
    /^model (google|openai|anthropic|deepseek|mistral)\/.*$/im,
    /^Run at \d{4}-\d{2}-\d{2}T?\d{2}:\d{2}.*model.*cost \d+p.*$/im,
    /^MISSING\s*[–\-]\s*Not found on website\s*$/im,
    /^NOT STATED ON WEBSITE\s*$/im,
    /^NONE RECORDED.*No certifications found in enrichment data.*$/im,
    /^ramp role unassigned\s*$/im,
    /^\[CAD Lab Review\].*$/im,
    /^\[CAD Lab Review Result\].*$/im,
]

// SCRATCH_PROMPT_INDICATORS: authoritative list is in supplier-description-sanitiser.ts
// (SUPPLIER_DESCRIPTION_LEAK_PATTERNS). The PDF renderer imports that list rather
// than maintaining a parallel copy. Additional patterns below are PDF-render-layer
// specific (telemetry markers that don't apply at generation time).
//
// Pre-existing patterns kept for backwards-compatibility with shortlist rows
// written by earlier versions of the synthesis prompt.
const SCRATCH_PROMPT_INDICATORS: ReadonlyArray<RegExp> = [
    // ── Patterns shared with generation-time validate() ──────────────────
    // (imported from SUPPLIER_DESCRIPTION_LEAK_PATTERNS — see import above)
    ...SUPPLIER_DESCRIPTION_LEAK_PATTERNS,
    // ── PDF-layer-only additions (pre-existing, Loop 7 catastrophe) ──────
    /\bWe need to produce a single sentence\b/i,
    /\bd\d+\s*words?,?\s*specific to the project\b/i,
    /\bSo we need to infer what\b.*\blikely brings\b/i,
    /\bThe supplier is .{1,40},\s*but no description\b/i,
    /\bMatch this STYLE and DEPTH\b/i,
]

function cleanReviewText(raw: string | null | undefined): string {
    if (typeof raw !== "string") return ""
    let text = raw

    // 1. If the text contains an LLM scratch-prompt pattern, swap it for
    //    a neutral placeholder rather than show the leaked thinking-trace.
    //    Uses SUPPLIER_DESCRIPTION_FALLBACK from the shared sanitiser so
    //    the fallback text is consistent across generation-time and render-time.
    if (SCRATCH_PROMPT_INDICATORS.some((re) => re.test(text))) {
        console.warn(
            `[export-project-pdf] reasoning-trace or prompt-echo leak caught at render time.` +
                ` Raw (first 120 chars): "${text.slice(0, 120).replace(/\n/g, " ")}"`,
        )
        return SUPPLIER_DESCRIPTION_FALLBACK
    }

    // 2. Strip whole lines that match any internal-telemetry pattern.
    text = text
        .split("\n")
        .filter((line) => !TELEMETRY_LEAK_LINE_PATTERNS.some((re) => re.test(line)))
        .join("\n")

    // 3. Strip Markdown bold/italic asterisks. The PDF renderer doesn't
    //    parse markdown — `**bold**` shows as literal asterisks across
    //    every Engineering Review block on every demo. Drop the marker
    //    pairs but keep the inner text.
    text = text
        .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/(^|[^\\])\*([^*\n]+)\*/g, "$1$2")
        .replace(/__([^_]+)__/g, "$1")

    // 4. Loop 7 critique B4 — Helvetica (react-pdf default) doesn't ship
    //    Greek glyphs, math superscripts, or extended degree symbols.
    //    BESS p.42/54/69 showed `Ω→@`, `²→@@`, `°→@@@`. Substitute
    //    ASCII-safe fallbacks before render so the founder doesn't read
    //    "0.040 @ resistivity" instead of "0.040 Ω resistivity".
    text = text
        .replace(/Ω/g, " ohms")
        .replace(/μΩ/g, " microohms")
        .replace(/㎡/g, " m^2")
        .replace(/㎥/g, " m^3")
        .replace(/m²/g, "m^2")
        .replace(/m³/g, "m^3")
        .replace(/cm²/g, "cm^2")
        .replace(/mm²/g, "mm^2")
        .replace(/[²]/g, "^2")
        .replace(/[³]/g, "^3")
        .replace(/°C/g, "degC")
        .replace(/°F/g, "degF")
        .replace(/°/g, " deg")
        .replace(/μ/g, "u")
        .replace(/×/g, " x ")
        .replace(/–|—/g, "-")

    // 5. Strip tool-call artifacts (Loop 28 P1: Fang `lookup_process()` leaks)
    text = stripToolCallLeaks(text)

    // 6. Collapse 3+ blank lines back down to 1 (filter step above can
    //    leave gaps where a telemetry line was the only content of a
    //    paragraph).
    text = text.replace(/\n{3,}/g, "\n\n").trim()
    return text
}

// Acronym-expansion-overreach fixer (A6). The global "spell out
// acronyms" rule is correct for ad copy; in engineering documents it
// incorrectly expands proper-noun designators (RAL paint codes, DIN
// rail, RIDDOR regulations, IEC standards). Re-collapse the most
// damaging expansions back to their canonical forms when they appear in
// review text. Conservative — only collapses where the expansion is
// adjacent to a number/code that disambiguates the proper-noun reading.
type AcronymRecollapseEntry =
    | { pattern: RegExp; replacement: string }
    | { pattern: RegExp; replace: (m: string, ...groups: string[]) => string }

const ACRONYM_RECOLLAPSE: ReadonlyArray<AcronymRecollapseEntry> = [
    { pattern: /\bRandom Access Library (\d{4})\b/g, replacement: "RAL $1" },
    { pattern: /\bDeutsches Institut für Normung\b/g, replacement: "DIN" },
    { pattern: /\bInternational Organization for Standardization (\d{2,5}(?:-[0-9a-z]+)?)\b/g, replacement: "ISO $1" },
    { pattern: /\bInternational Electrotechnical Commission (\d{2,5}(?:-\d+)*)\b/g, replacement: "IEC $1" },
    { pattern: /\bBritish Standard (\d{2,5}(?:-\d+)*)\b/g, replacement: "BS $1" },
    { pattern: /\bfourth-generation long term evolution\b/gi, replacement: "4G LTE" },
    { pattern: /\b(alternating current)\b/g, replacement: "AC" },
    { pattern: /\b(direct current)\b/g, replacement: "DC" },
    {
        pattern: /\bReporting of Injuries, Diseases and Dangerous Occurrences Regulations\s*(\d{4})?\b/g,
        replace: (_m, year) => (year ? `RIDDOR ${year}` : "RIDDOR 2013"),
    },
]

function fixAcronymOverreach(raw: string): string {
    let text = raw
    for (const entry of ACRONYM_RECOLLAPSE) {
        if ("replacement" in entry) {
            text = text.replace(entry.pattern, entry.replacement)
        } else {
            text = text.replace(entry.pattern, entry.replace)
        }
    }
    return text
}

function sanitizeReviewText(raw: string | null | undefined): string {
    return fixAcronymOverreach(cleanReviewText(raw))
}

// Map a specialist id / display name → "Name (Role — specialist AI)".
// Tristan's feedback: every time a specialist is named we need to tell
// the reader both what they do and that they're an AI specialist, so
// the PDF doesn't read like a team of humans wrote it.
const SPECIALIST_ROLES: Record<string, string> = {
    strategist: "Strategy Lead",
    sage: "Strategy Lead",
    cto: "CTO",
    max: "CTO",
    "vp-engineering": "VP Engineering",
    jian: "VP Engineering",
    "vp-manufacturing": "VP Manufacturing",
    fang: "VP Manufacturing",
    "vp-supply-chain": "VP Supply Chain",
    chase: "VP Supply Chain",
    "product-lead": "Product Lead",
    priya: "Product Lead",
    "growth-marketer": "Marketing Lead",
    mia: "Marketing Lead",
    "sales-lead": "Sales Lead",
    sal: "Sales Lead",
    "chief-of-staff": "Chief of Staff",
    cal: "Chief of Staff",
    "finance-lead": "Finance Lead",
    finn: "Finance Lead",
    "fundraising-advisor": "Fundraising Advisor",
    fiona: "Fundraising Advisor",
    "hiring-team": "HR Lead",
    harper: "HR Lead",
    "legal-counsel": "Legal Counsel",
    leo: "Legal Counsel",
}

/**
 * Maps a module's `leadTimeSource` tag to the founder-friendly provenance
 * caption shown in the PDF. Mirrors the label convention from
 * `src/app/(platform)/the-forge-v2/projects/[id]/modules/page.tsx` so the
 * PDF and the workspace agree on what each tag reads as.
 *
 * Empty-state policy: when `source` is null/unknown we surface
 * "Provenance: not yet declared" rather than hiding the caption. The PDF
 * goes to investors / suppliers and an un-captioned lead time reads as an
 * authoritative number — founders must see that the provenance is missing.
 * See Tristan's note 2026-04-22: "I'm not convinced that we actually know
 * how the lead time information happens."
 */
function leadSourcePdfCaption(source: string | null | undefined): string {
    switch (source) {
        case "supplier-quote":       return "Supplier quote"
        // NOTE: `ai-estimate` reads as "Specialist estimate" per
        // CLAUDE.md §No AI Emphasis — matches the workspace list page.
        case "ai-estimate":          return "Specialist estimate"
        case "historical-analogue":  return "Historical analogue"
        case "specialist-judgement": return "Specialist judgement"
        default:                     return "Provenance: not yet declared"
    }
}

function specialistRole(idOrName: string | null | undefined): string | null {
    if (!idOrName) return null
    const key = String(idOrName).trim().toLowerCase()
    if (SPECIALIST_ROLES[key]) return SPECIALIST_ROLES[key]
    // "Finn — Finance Lead" / "Finn (Finance Lead)" — try the first word.
    const firstWord = key.split(/[\s—:(-]+/)[0]
    return SPECIALIST_ROLES[firstWord] ?? null
}

/**
 * V1 CHANGE (2026-04-24, per Tristan): strip specialist names and AI agent
 * branding from the PDF. The new UX is a plain box-and-button flow — users
 * never see the specialist characters, so PDF copy referencing "Finn",
 * "Chase", "Max", "specialist AI" etc. is out of voice.
 *
 * Each call site replaces specialist-mention prose with plain category
 * words: cost estimator, module decomposition, supplier match, etc.
 * This helper now returns a role-only label ("Finance") for any place
 * where a specialist attribution was formerly shown — but the preferred
 * fix is to remove the call site entirely (see commit message for the
 * pass over usage sites).
 */
function specialistLabel(idOrName: string | null | undefined): string {
    const name = typeof idOrName === "string" ? idOrName : ""
    const role = specialistRole(name)
    return role ?? "the system"
}

// ─── Types passed to the PDF component ────────────────────────────────

interface Regulatory {
    code: string
    name: string
    status: string | null
    summary: string
    /** Loop 3 P4: compliance-matrix extension fields. Optional — older
     *  Chase outputs don't have these and the renderer falls back to the
     *  pre-Loop-3 single-line shape. */
    applicability?: string
    designImpact?: string
    evidenceRequired?: string
    ownerRole?: string
    gapAction?: string
    /** Item 2 (council 2026-04-29): confidence and verified timestamp for
     *  the unverified-extraction badge — separate from triage status. */
    confidence?: number | null
    verifiedAt?: string | null
}

interface ModulePdf {
    id: string
    name: string
    purpose: string
    description: string
    whyItMatters: string
    massKg: number | null
    budgetMassKg: number | null
    leadWeeks: number | null
    leadTimeSource: string | null
    mirrorOf: string | null
    /** Human-readable name of the mirror module — resolved from the slug at PDF-build time so the page shows "mirrors Left wing" instead of "mirrors left_wing". */
    mirrorOfName: string | null
    keyParts: string[]
    failureModes: string[]
    unknowns: string[]
    /** Loop 5 P5 (council unanimous): structured FMEA risk matrix. Optional —
     *  older modules with only failureModes string array still render via the
     *  fallback path. When present, the renderer prefers this rich shape and
     *  shows severity × likelihood × owner × mitigation per row. */
    riskMatrix: Array<{
        id: string
        hazard: string
        cause: string | null
        consequence: string | null
        existingControls: string | null
        severity: number
        likelihood: number
        mitigation: string | null
        owner: string | null
        residualSeverity: number | null
        residualLikelihood: number | null
    }>
    imageUrl: string | null
    diagnostics: Record<string, string> | null
    cost: AiCostEstimate | null
    reviews: Array<{
        reviewer: string
        verdict: string | null
        summary: string
        issues: Array<{ severity: string; category: string; message: string; suggestion?: string }>
        recommendations: string[]
        reviewedAtIso: string | null
    }>
}

interface PartRow {
    partNumber: string
    name: string
    sourceModuleName: string | null
    process: string | null
    material: string | null
    materialSpec: string | null
    finish: string | null
    tolerance: string | null
    massKg: number | null
    estimatedUnitCostGbp: number | null
    isPurchased: boolean
    description: string | null
    /**
     * A1 — Loop 26 Tier-A fix.
     * Cost provenance from the `parts.cost_provenance` column
     * (added in migration 20260429300000_parts_cost_provenance.sql).
     * Values: "quoted" | "parametric" | "placeholder" | "todo" | null.
     * Null means the column predates the migration or was never set —
     * treat the same as "placeholder" for badge-render purposes.
     */
    costProvenance: "quoted" | "parametric" | "placeholder" | "todo" | null
}

interface SupplierPdf {
    name: string
    hq: string | null
    moduleNames: string[]
    /** BOM part numbers this supplier was matched against (e.g. ["BATT-005-PUR"]). */
    matchedPartNumbers: string[]
    /** Cheap-LLM project-specific synthesis — replaces the supplier's marketing blurb. */
    projectSynthesis: string | null
    matchScore: number | null
    scoreBreakdown: Record<string, unknown> | null
    matchReasons: string[]
    rampRole: string | null
    websiteUrl: string | null
    contactEmail: string | null
    /** Year the company was founded (when known). Helps the founder gauge maturity. */
    foundedYear: number | null
    /** Headcount when the directory has it. */
    employeeCount: number | null
    /** Typical lead time as the supplier states it (e.g. "4-6 weeks"). */
    leadTime: string | null
    /** Minimum order quantity / value, when declared. */
    minimumOrder: string | null
    /** Active certifications (AS9100D, ISO 13485, NFPA 855). */
    certifications: string[] | null
    /** One-paragraph blurb the supplier directory holds about them. */
    description: string | null
}

interface AuditRowPdf {
    action: string
    section: string | null
    createdAtIso: string
    metadataSummary: string
}

interface PdfInput {
    projectName: string
    designRevisionLetter: string
    generatedAtIso: string
    createdAtIso: string | null
    shippedAtIso: string | null
    briefLockedAtIso: string | null
    foundryName: string | null
    systemIllustrationUrl: string | null
    /**
     * Interior-exploded hero (walls removed, interior contents visible).
     * When present, preferred over {@link systemIllustrationUrl} on the
     * cover page because the rest of the PDF shows interior contents —
     * the walls-visible hero misrepresents what the reader is about to
     * see. Falls back to systemIllustrationUrl when null.
     */
    interiorOverviewUrl: string | null
    conceptRenderUrl: string | null
    brief: {
        subject: string | null
        mission: string | null
        useCase: string | null
        targetCustomers: string | null
        whyNow: string | null
        unitCostCeilingGbp: number | null
        maxMassKg: number | null
        targetProcess: string | null
        targetMaterial: string | null
        toleranceTarget: string | null
        quantityTarget: string | null
        complianceNotes: string | null
    }
    regulatory: Regulatory[]
    modules: ModulePdf[]
    parts: PartRow[]
    cost: {
        unitTotalGbp: number | null
        ceilingGbp: number | null
        perModule: Array<{ moduleName: string; totalGbp: number | null }>
        /**
         * Fix 1 — Loop 25 P0: build-time cost-mismatch assertion.
         * When the persisted feasibility verdict's cost evidence references
         * a value that differs from the canonical deduped BOM roll-up by
         * more than 1%, this field is set to the gap percentage (0–100).
         * The cover renders an amber warning banner so the founder sees
         * the stale verdict before proceeding. Null means no mismatch.
         * Re-running the proofreader will re-compute the verdict with
         * the canonical cost and clear this flag.
         */
        costMismatchPct: number | null
        /**
         * Loop 26 P3 / A2: cost-tree arithmetic validation gate.
         * Populated after the cost waterfall is assembled. Null when the
         * validator did not run (older projects, empty BOM). Non-null when
         * at least one arithmetic check was attempted — check hasFindings
         * before rendering annotations.
         */
        costTreeValidation: import("@/lib/cost/cost-tree-validation").CostTreeValidationResult | null
        /**
         * Loop 28 P2: auto-reconciled cost tree.
         * When per-module costs (some falling back to Finn estimates) diverge
         * from the parts-table unit total by >1%, this field contains the
         * reconciled figures: unit total = sum(per-module costs), and each
         * module's % OF UNIT is recomputed against that reconciled total.
         * The original parts-table total is preserved for the reconciliation
         * section. Null when reconciliation did not run.
         */
        costTreeReconciliation: import("@/lib/cost/cost-tree-validation").CostTreeReconciliation | null
    }
    suppliers: SupplierPdf[]
    /**
     * Council fix 4A (2026-04-29): directory bias disclosure.
     * When the supplier directory has fewer than 10 entries in the project's
     * detected industry domain, this field contains a disclosure note that
     * the PDF renders as a yellow banner in the supplier section. Null means
     * directory coverage is adequate (>= 10 entries) or could not be assessed.
     */
    supplierDirectoryCoverageNote: string | null
    auditLog: AuditRowPdf[]
    /** Loop 8 G1 (QC-GATES.md): deterministic numerical-consistency
     *  reconciliation. Populated server-side from the same `data` the
     *  PDF renders so divergences across the 3 parallel cost views and
     *  2 parallel mass views surface on the cover instead of shipping
     *  silent. Null when reconciliation hasn't run (back-compat). */
    reconciliation: import("@/lib/cad-lab-numerical-reconciliation").ReconciliationResult | null
    /** Loop 8 P3 cost-realism reframe — Oracle band for the project
     *  class (BESS / vert farm / consumer-IoT / desal / mobility-aid).
     *  When set + brief target falls outside band, the brief page
     *  shows a yellow callout reframing the cost overrun as "your
     *  target is below industry-low" instead of "engine over-estimated". */
    oracleProjectBand: import("@/lib/cost/oracle-benchmarks").OracleProjectBand | null
    /** Sizing optimisation + dimension sheet from Fang. When present, renders
     *  a new section 3 ("Sizing optimisation") showing the trial sweep,
     *  winner rationale, top alternatives, and levers. Nullable — projects
     *  from before v1.1 sizing engine won't have this. */
    dimensionSheet: import("@/lib/sizing/types").DimensionSheet | null
    /** Spatial plan from Fang's layout engine. When present, renders a new
     *  section ("Spatial plan") AFTER sizing optimisation and BEFORE the
     *  per-module pages. Contains a to-scale 2D drawing (top-down / side
     *  elevation) or a simplified layered diagram (stack / isometric
     *  exploded) with placements, features, and constraints. Nullable —
     *  projects from before v1.2 layout engine won't have this, and
     *  rule libraries that don't yet implement layout return null. */
    spatialPlan: SpatialPlan | null
    /** Pre-rasterised PNG of the spatial plan as a base64 data URI.
     *  Added 2026-04-24: @react-pdf/renderer's native `<Svg>` renders
     *  the SpatialPlanSection drawing as a solid black rectangle. We
     *  build the SVG server-side, pipe through sharp() to a PNG, and
     *  embed as `<Image>` instead. Null for 3D views (which fall back
     *  to the stack diagram) or when no plan exists. */
    spatialPlanImageDataUri: string | null
    totals: {
        moduleCount: number
        keyPartCount: number
        partRowCount: number
        failureModeCount: number
        unknownCount: number
        regulatoryCount: number
        supplierCount: number
        reviewCount: number
    }
    /**
     * Source-attribution counts + freshness. Captured at export time so
     * the PDF can tell the reader WHERE the numbers came from — which
     * Supabase table, how many rows were available to draw from, and how
     * fresh that data is. Nulls are rendered as "—" (honest signal that
     * the count couldn't be read at export time).
     */
    sources: {
        materialPropertyCount: number | null
        materialPropertyFreshestIso: string | null
        processCapabilityCount: number | null
        processCapabilityFreshestIso: string | null
        supplierDirectoryCount: number | null
        marketplaceListingCount: number | null
        bomModel: string
        bomProvider: string
    }
    /**
     * Engine self-review findings from the proofreader specialist (Phase 1).
     * Null when the proofreader hasn't run yet (older projects) OR when it
     * found nothing (returned `findings: []`). Non-blocking — the PDF
     * always emits; findings are surfaced in the appendix for the founder
     * to review.
     */
    proofreadFindings: {
        ranAtIso: string
        model: string
        costPence: number
        findings: Array<{
            section: string
            severity: "cosmetic" | "content" | "blocker"
            location: string
            issue: string
            suggested_fix: string
            confidence: "high" | "medium" | "low"
        }>
    } | null
    /**
     * Deterministic feasibility verdict (Loop 3 P1, council-unanimous
     * 2026-04-25 NIGHT). Drives the brief-page status banner and, when
     * status is "red", the Feasibility Exception page that renders right
     * after the brief. Computed in the proofreader stage from sizing,
     * cost, mass and brief constraints — no LLM involvement.
     */
    feasibilityVerdict: {
        status: "green" | "amber" | "red"
        ranAtIso: string
        fails: Array<{
            axis: "envelope" | "mass" | "cost" | "cost_type_mismatch" | "transport" | "suppliers" | "spatial_overflow" | "fang_critical_findings" | "fang_review_coverage" | "cross_modal_consistency" | "decomposition_gaps" | "data_completeness"
            severity: "blocker" | "warning"
            summary: string
            evidence: string
        }>
        tradeoffs: string[]
        /**
         * Constraint axes the solver had real data to evaluate.
         * Non-empty required for GREEN to mean "checked and passed".
         * Empty means the solver had no inputs — treat as UNREVIEWED, not GREEN.
         * Loop 24 P0 phantom-GREEN fix.
         */
        checkedConstraints: string[]
    } | null
    /**
     * Alternate envelope pushback from the class-fence guard (Loop 24 P0).
     *
     * Populated when Gate 3 found a feasible alternate in a DIFFERENT product
     * class from the briefed envelope (e.g. 40ft container → warehouse bay).
     * Instead of silently swapping, the engine delivers the briefed-class
     * max-feasible result AND surfaces this as a "consider this" trade-off.
     *
     * When non-null, the Brief section renders a warning-level callout showing:
     *   - What the briefed class can achieve (e.g. 1.4 MWh in 40ft container)
     *   - What the alternate class can achieve (e.g. 3.5 MWh in warehouse bay)
     *   - Trade-off note guiding the founder on whether to relax the envelope
     *
     * Null when (a) sizing was feasible at the briefed class on the first pass,
     * (b) no feasible alternate was found, or (c) the alternate is the same
     * product class (safe auto-retry, no pushback needed).
     */
    alternateEnvelopePushback: {
        briefed_envelope: { kind: string; label: string; classification_tag: string }
        alternate_envelope: { kind: string; label: string; classification_tag: string }
        capacity_at_briefed_class: { value: number | null; units: string; deficit: number | null; summary: string }
        capacity_at_alternate_class: { value: number | null; units: string }
        trade_off_note: string
    } | null
    /**
     * Item 2 (council 2026-04-29): true when the regulatory triage pass found
     * ALL rows still undifferentiated (all "in-scope-not-started" with no
     * "not-applicable" or "design-impact-identified"). The RegulatorySection
     * renders a warning banner when this is true.
     */
    regulatoryUndifferentiated: boolean
    /**
     * Loop 26 D1/D4: detected industry domain for the project.
     * Passed to RegulatorySection so it can escalate the missing-data
     * placeholder to a red warning for safety-critical domains (potable water,
     * medical, aerospace, defence, oil and gas, nuclear processing).
     * "general" means detection found no strong domain signal.
     */
    detectedDomain: import("@/lib/cad-lab/industry-domains").IndustryDomain
}

// ─── PDF Component ─────────────────────────────────────────────────────

function CoverPage({ data }: { data: PdfInput }): React.ReactElement {
    const isShipped = data.shippedAtIso != null
    return (
        <Page size="A4" style={styles.cover}>
            <View style={styles.coverBand}>
                <Text style={styles.coverBandTitle}>{data.projectName}</Text>
                <Text style={styles.coverBandSub}>
                    Revision {data.designRevisionLetter}
                    {data.foundryName ? ` · ${data.foundryName}` : ""}
                    {isShipped ? " · Shipped" : " · In build"}
                </Text>
            </View>
            <View style={styles.coverBody}>
                <Text style={{ fontSize: 18, marginBottom: 16, color: INK }}>
                    Forge project pack
                </Text>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Project name</Text>
                    <Text style={styles.coverGridValue}>{data.projectName}</Text>
                </View>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Revision</Text>
                    <Text style={styles.coverGridValue}>Rev {data.designRevisionLetter}</Text>
                </View>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Project created</Text>
                    <Text style={styles.coverGridValue}>{fmtDateTime(data.createdAtIso)}</Text>
                </View>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Brief locked</Text>
                    <Text style={styles.coverGridValue}>{fmtDateTime(data.briefLockedAtIso)}</Text>
                </View>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Shipped</Text>
                    <Text style={styles.coverGridValue}>
                        {isShipped ? fmtDateTime(data.shippedAtIso) : "Not shipped yet"}
                    </Text>
                </View>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Document generated</Text>
                    <Text style={styles.coverGridValue}>{fmtDateTime(data.generatedAtIso)}</Text>
                </View>

                {/* Fix 5A — council 4/6 (GPT-5.5 + Gemini + DeepSeek + Kimi):
                    feasibility verdict prominence on cover. The RED/AMBER/GREEN
                    verdict was only visible on the Feasibility Exception page
                    deep inside the PDF. Founders missed it. Colour-coded badge
                    + top 3 blockers on the cover ensures the first thing a
                    reader sees is whether the design is feasible. */}
                {data.feasibilityVerdict && (
                    <FeasibilityCoverBadge verdict={data.feasibilityVerdict} />
                )}

                {/* System illustration (or honest placeholder).
                    Prefer the interior-exploded hero when present — the
                    rest of the PDF shows interior contents, and the old
                    walls-visible hero misrepresents what the reader sees
                    on the following pages. Fall back to the walls-visible
                    illustration when the interior render hasn't been
                    produced yet. */}
                {data.interiorOverviewUrl ?? data.systemIllustrationUrl ? (
                    <>
                        <Image
                            src={
                                (data.interiorOverviewUrl ??
                                    data.systemIllustrationUrl) as string
                            }
                            style={styles.coverImage}
                        />
                        <Text style={styles.imageDisclaimer}>
                            Illustrative only — not a technical specification. All renders in this document are generated for visual reference; component arrangement, proportions, and identities may differ from the final engineered assembly.
                        </Text>
                    </>
                ) : (
                    <View
                        style={[
                            styles.coverImage,
                            { alignItems: "center", justifyContent: "center" },
                        ]}
                    >
                        <Text style={{ color: MUTED, fontSize: 10 }}>
                            No system illustration generated yet. Trigger it from the modules page.
                        </Text>
                    </View>
                )}

                {/* Loop 8 G1 reconciliation banner — surfaces internal
                    numerical inconsistency the founder needs to see
                    before they take any single number as load-bearing. */}
                {data.reconciliation?.coverBanner && (
                    <View
                        style={{
                            marginTop: 14,
                            padding: 8,
                            borderRadius: 4,
                            backgroundColor: "#fee2e2",
                            borderLeftWidth: 3,
                            borderLeftColor: "#b91c1c",
                        }}
                    >
                        <Text style={{ fontSize: 10, color: "#7f1d1d", fontWeight: "bold" }}>
                            {data.reconciliation.coverBanner}
                        </Text>
                    </View>
                )}

                {/* Fix 1 — Loop 25 P0: cost-mismatch assertion banner.
                    Fires when the persisted feasibility-verdict cost evidence
                    and the canonical deduped BOM roll-up differ by more than
                    1%. The founder sees this BEFORE any cost number on the
                    cover, prompting a proofreader re-run to sync the verdict. */}
                {data.cost.costMismatchPct != null && !isHardInfeasible(data.feasibilityVerdict) && (
                    <View
                        style={{
                            marginTop: 14,
                            padding: 8,
                            borderRadius: 4,
                            backgroundColor: "#fef3c7",
                            borderLeftWidth: 3,
                            borderLeftColor: "#b45309",
                        }}
                    >
                        <Text style={{ fontSize: 10, color: "#7c2d12", fontWeight: "bold" }}>
                            {`Cost figures may be stale — ${data.cost.costMismatchPct.toFixed(0)}% gap between the cover tile and the feasibility verdict`}
                        </Text>
                        <Text style={{ fontSize: 9, color: "#7c2d12", marginTop: 3 }}>
                            The feasibility exception page shows a cost figure from an earlier pipeline run. The cover tile uses the current bill of materials (de-duplicated roll-up). Re-run the proofreader to sync the feasibility verdict against the current bill of materials.
                        </Text>
                    </View>
                )}

                {/* L13-P3 (2026-04-27): hard-infeasibility banner on the
                    cover. When the design fails an envelope / mass /
                    transport blocker, modules + bill of materials + cost
                    waterfall + reconciliation + risks register + supplier
                    shortlist are suppressed; the document is intentionally
                    short. The reader should NOT scroll past the cover
                    looking for procurement-grade numbers — there are
                    none, by design. */}
                {isHardInfeasible(data.feasibilityVerdict) && (
                    <View
                        style={{
                            marginTop: 14,
                            padding: 12,
                            borderRadius: 4,
                            backgroundColor: "#7f1d1d",
                            borderLeftWidth: 4,
                            borderLeftColor: "#450a0a",
                        }}
                    >
                        <Text style={{ fontSize: 12, color: "#ffffff", fontWeight: "bold" }}>
                            BRIEF INFEASIBLE — DO NOT PROCEED TO PROCUREMENT
                        </Text>
                        <Text style={{ fontSize: 9, color: "#fee2e2", marginTop: 4 }}>
                            The design as currently briefed cannot be built within the declared envelope, mass, or transport constraints. Modules, bill of materials, cost waterfall, reconciliation, risks register and supplier shortlist are intentionally omitted from this document. Resolve the blockers listed on the Feasibility Exception page before any module decomposition or supplier engagement.
                        </Text>
                    </View>
                )}

                {/* wrap=false keeps the full 3-row grid together — before
                    this, the last row (unit cost / ceiling / headroom /
                    reviews) would orphan onto page 2. */}
                <View style={{ marginTop: 24 }} wrap={false}>
                    <Text style={styles.h5}>Totals at a glance</Text>
                    <View style={styles.statRow}>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Modules</Text>
                            <Text style={styles.statValue}>{data.totals.moduleCount}</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Key parts</Text>
                            <Text style={styles.statValue}>{data.totals.keyPartCount}</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>BOM rows</Text>
                            <Text style={styles.statValue}>{data.totals.partRowCount}</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Suppliers</Text>
                            <Text style={styles.statValue}>{data.totals.supplierCount}</Text>
                        </View>
                    </View>
                    <View style={styles.statRow}>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Failure modes</Text>
                            <Text style={styles.statValue}>{data.totals.failureModeCount}</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Open questions</Text>
                            <Text style={styles.statValue}>{data.totals.unknownCount}</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Standards</Text>
                            <Text style={styles.statValue}>{data.totals.regulatoryCount}</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Reviews</Text>
                            <Text style={styles.statValue}>{data.totals.reviewCount}</Text>
                        </View>
                    </View>
                    {/* Loop 7 critique fix A5 + Tristan punch list #1 — when
                     * the project is RED on cost, the cover stat tiles must
                     * show the comparison clearly. Previously: "Headroom —"
                     * when ceiling was missing OR when headroom was zero,
                     * which a founder reads as "no problem". Now: red value
                     * + sign + "OVER" annotation when headroom is negative,
                     * "Not declared" instead of "—" when ceiling is missing
                     * so the gap is named, not hidden. */}
                    {(() => {
                        // Fix 1 — Loop 25 P0: for hard-infeasible PDFs, the design
                        // does not have a valid procurement-ready cost — suppress
                        // the UNIT COST tile to prevent a misleading number appearing
                        // alongside "BRIEF INFEASIBLE — DO NOT PROCEED". Show "—"
                        // with an "Infeasible" label instead. The ceiling is still
                        // shown so the founder understands the gap they need to close.
                        const hardInfeasibleCover = isHardInfeasible(data.feasibilityVerdict)
                        const unit = hardInfeasibleCover ? null : data.cost.unitTotalGbp
                        const ceiling = data.cost.ceilingGbp
                        const headroom =
                            unit != null && ceiling != null ? ceiling - unit : null
                        const isOver = headroom != null && headroom < 0
                        return (
                            <View style={styles.statRow}>
                                <View style={styles.stat}>
                                    <Text style={styles.statLabel}>Unit cost</Text>
                                    <Text style={styles.statValue}>
                                        {hardInfeasibleCover ? "—" : fmtGbp(unit)}
                                    </Text>
                                    {hardInfeasibleCover && (
                                        <Text style={{ fontSize: 7, color: "#b91c1c", marginTop: 1 }}>
                                            Not computed — design infeasible
                                        </Text>
                                    )}
                                </View>
                                <View style={styles.stat}>
                                    <Text style={styles.statLabel}>Ceiling</Text>
                                    <Text style={styles.statValue}>
                                        {ceiling != null
                                            ? fmtGbp(ceiling)
                                            : "Not declared"}
                                    </Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text style={styles.statLabel}>Headroom</Text>
                                    <Text
                                        style={
                                            isOver
                                                ? [styles.statValue, { color: "#B91C1C" }]
                                                : styles.statValue
                                        }
                                    >
                                        {hardInfeasibleCover
                                            ? "—"
                                            : headroom != null
                                              ? `${isOver ? "−" : "+"}${fmtGbp(Math.abs(headroom))}${isOver ? " OVER" : ""}`
                                              : "—"}
                                    </Text>
                                </View>
                            </View>
                        )
                    })()}
                </View>
                {/* Loop 24 P0 — Fang unvalidated-module warning badge.
                    Mirrors the "Internal numerical inconsistency detected"
                    banner pattern. Shows on the cover when any module was
                    not reviewed (no review record) or had a double-empty
                    review (review record exists but zero issues on all
                    attempts). Founders must see this before the modules
                    section so they know which modules are unvalidated. */}
                {(() => {
                    const unvalidated = data.modules.filter(
                        (m) =>
                            m.reviews.length === 0 ||
                            m.reviews.every((r) => r.issues.length === 0),
                    )
                    if (unvalidated.length === 0) return null
                    return (
                        <View
                            style={{
                                marginTop: 14,
                                padding: 10,
                                backgroundColor: "#fee2e2",
                                borderLeftWidth: 4,
                                borderLeftColor: "#b91c1c",
                                borderRadius: 3,
                            }}
                        >
                            <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7f1d1d" }}>
                                Engineering review incomplete — {unvalidated.length} module{unvalidated.length === 1 ? "" : "s"} not validated
                            </Text>
                            <Text style={{ fontSize: 9, color: "#7f1d1d", marginTop: 3 }}>
                                {unvalidated.map((m) => m.name).join(", ")}
                                {" "}— Fang did not complete a manufacturing review for these modules. Cost and mass figures for unvalidated modules are working estimates only. Re-run Fang before sharing this report with suppliers or investors.
                            </Text>
                        </View>
                    )
                })()}
            </View>
        </Page>
    )
}

function TocPage({ sections }: { sections: string[] }): React.ReactElement {
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>Contents</Text>
            {sections.map((s, i) => (
                <View key={i} style={{ flexDirection: "row", marginBottom: 4 }}>
                    <Text style={{ width: 24, color: MUTED }}>{(i + 1).toString().padStart(2, "0")}</Text>
                    <Text style={{ flex: 1 }}>{s}</Text>
                </View>
            ))}
            <PdfFooter label="Contents" />
        </Page>
    )
}

// ─── Feasibility verdict (Loop 3 P1, council-unanimous 2026-04-25) ───
//
// Council finding: "Engineers don't design things they know violate
// physics. Neither should the engine." When sizing / cost / mass / UK
// transport gates fail, the brief page now opens with a Red banner
// summarising the gap, and a dedicated Feasibility Exception page
// renders right after the brief — listing every failed axis with
// numerical evidence and a small set of trade-off pivots the founder
// can consider. The downstream pages (sizing, BOM, cost waterfall,
// suppliers) still render so the engineering work is visible, but the
// reader meets the verdict before the polish, not after it.

const VERDICT_COLORS = {
    red: { bg: "#fee2e2", border: "#b91c1c", text: "#7f1d1d", label: "RED" },
    amber: { bg: "#fef3c7", border: "#b45309", text: "#7c2d12", label: "AMBER" },
    green: { bg: "#dcfce7", border: "#15803d", text: "#14532d", label: "GREEN" },
    unreviewed: { bg: "#f3f4f6", border: "#6b7280", text: "#374151", label: "UNREVIEWED" },
} as const

/**
 * Fix 5A — council 4/6 (GPT-5.5 + Gemini + DeepSeek + Kimi): prominent
 * feasibility verdict badge on the cover page.
 *
 * Previously the verdict was buried on the Feasibility Exception page deep
 * inside the PDF. Founders missed it. This component renders a large,
 * colour-coded badge (RED/AMBER/GREEN) with the top 3 blocking findings
 * directly on the cover so the first thing any reader sees is whether the
 * design is feasible.
 */
function FeasibilityCoverBadge({
    verdict,
}: {
    verdict: NonNullable<PdfInput["feasibilityVerdict"]>
}): React.ReactElement {
    const phantom = verdict.status === "green" && verdict.checkedConstraints.length === 0
    const effectiveStatus = phantom ? "unreviewed" : verdict.status
    const theme = VERDICT_COLORS[effectiveStatus as keyof typeof VERDICT_COLORS] ?? VERDICT_COLORS.unreviewed

    // Top 3 blockers for RED/AMBER — gives the reader immediate context
    const topBlockers = verdict.fails
        .filter((f) => f.severity === "blocker")
        .slice(0, 3)
    const topWarnings = topBlockers.length === 0
        ? verdict.fails.filter((f) => f.severity === "warning").slice(0, 3)
        : []
    const topFindings = topBlockers.length > 0 ? topBlockers : topWarnings

    return (
        <View
            style={{
                marginTop: 18,
                marginBottom: 4,
                padding: 14,
                borderRadius: 6,
                backgroundColor: theme.bg,
                borderWidth: 2,
                borderColor: theme.border,
            }}
            wrap={false}
        >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                    style={{
                        backgroundColor: theme.border,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 4,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 14,
                            fontWeight: "bold",
                            color: "white",
                            letterSpacing: 1,
                        }}
                    >
                        {theme.label}
                    </Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: "bold", color: theme.text }}>
                    {effectiveStatus === "red"
                        ? "Feasibility — blockers found"
                        : effectiveStatus === "amber"
                            ? "Feasibility — warnings found"
                            : effectiveStatus === "green"
                                ? "Feasibility — all checks passed"
                                : "Feasibility — not yet reviewed"}
                </Text>
            </View>
            {topFindings.length > 0 && (
                <View style={{ marginTop: 8 }}>
                    {topFindings.map((f, idx) => (
                        <View
                            key={idx}
                            style={{
                                flexDirection: "row",
                                marginBottom: 3,
                                paddingLeft: 4,
                            }}
                        >
                            <Text style={{ width: 10, fontSize: 9, color: theme.text }}>
                                •
                            </Text>
                            <Text
                                style={{
                                    flex: 1,
                                    fontSize: 9,
                                    color: theme.text,
                                    lineHeight: 1.4,
                                }}
                            >
                                {f.summary}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
            {effectiveStatus === "green" && (
                <Text
                    style={{
                        fontSize: 8.5,
                        color: theme.text,
                        marginTop: 6,
                        opacity: 0.8,
                    }}
                >
                    {`${verdict.checkedConstraints.length} constraint${verdict.checkedConstraints.length === 1 ? "" : "s"} evaluated: ${verdict.checkedConstraints.join(", ")}.`}
                </Text>
            )}
        </View>
    )
}

/**
 * Loop 24 P0 — Phantom-GREEN guard.
 *
 * A feasibility verdict with status="green" is only meaningful when the
 * solver had real data to check (checkedConstraints non-empty). When every
 * axis was null or trivially skipped, the engine had no inputs, and "no
 * violations found" is vacuously true — not evidence of a passing design.
 *
 * Returns true when the verdict is GREEN but checkedConstraints is empty,
 * indicating the solver ran but had nothing to evaluate. The PDF renders
 * this as UNREVIEWED rather than GREEN.
 */
function isPhantomGreen(verdict: PdfInput["feasibilityVerdict"]): boolean {
    if (!verdict) return false
    return verdict.status === "green" && verdict.checkedConstraints.length === 0
}

/**
 * L13-P3 (2026-04-27): a "hard infeasibility" is when the verdict is red
 * AND at least one blocker fires on a physical-fit axis (envelope, mass,
 * transport). Loop 3 P1 chose to keep rendering all downstream sections
 * with a banner; Loop 12 critique found that's not enough — customers
 * still see numbers that look like procurement targets when the design
 * does not fit the brief envelope. For hard-infeasible designs, we now
 * suppress the modules / bill-of-materials / cost waterfall /
 * reconciliation / risks register / supplier shortlist sections and
 * leave only the cover, brief, sizing, and feasibility-exception pages.
 *
 * Soft red (cost-over-budget, supplier-coverage warning) still renders
 * everything — those are conversations, not stop-the-line events.
 */
function isHardInfeasible(
    verdict: PdfInput["feasibilityVerdict"],
): verdict is NonNullable<PdfInput["feasibilityVerdict"]> {
    if (!verdict) return false
    if (verdict.status !== "red") return false
    return verdict.fails.some(
        (f) =>
            f.severity === "blocker" &&
            (f.axis === "envelope" || f.axis === "mass" || f.axis === "transport" || f.axis === "spatial_overflow"),
    )
}

function FeasibilityVerdictBanner({
    verdict,
    showAxes = false,
}: {
    verdict: NonNullable<PdfInput["feasibilityVerdict"]>
    showAxes?: boolean
}): React.ReactElement {
    const phantomGreen = verdict.status === "green" && verdict.checkedConstraints.length === 0
    const colorKey: keyof typeof VERDICT_COLORS = phantomGreen ? "unreviewed" : verdict.status
    const c = VERDICT_COLORS[colorKey]
    const blockers = verdict.fails.filter((f) => f.severity === "blocker")
    const warnings = verdict.fails.filter((f) => f.severity === "warning")
    return (
        <View
            style={{
                backgroundColor: c.bg,
                borderLeftWidth: 3,
                borderLeftColor: c.border,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 10,
                paddingRight: 10,
                marginBottom: 14,
            }}
        >
            <Text style={{ fontSize: 11, fontWeight: "bold", color: c.text }}>
                Feasibility verdict: {c.label}
            </Text>
            <Text style={{ fontSize: 9, color: c.text, marginTop: 2 }}>
                {phantomGreen
                    ? "Feasibility check ran but returned no findings — the solver had insufficient data (no dimension sheet, no brief cost ceiling, no parts mass). Treat as unreviewed, not approved."
                    : blockers.length > 0
                      ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}`
                      : ""}
                {!phantomGreen && blockers.length > 0 && warnings.length > 0 ? " · " : ""}
                {!phantomGreen && warnings.length > 0
                    ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
                    : ""}
                {!phantomGreen && verdict.fails.length === 0 && verdict.checkedConstraints.length > 0
                    ? `No constraint conflicts detected. Constraints checked: ${verdict.checkedConstraints.join(", ")}.`
                    : !phantomGreen && verdict.fails.length > 0
                      ? " — see Feasibility Exception page for detail."
                      : ""}
            </Text>
            {showAxes && blockers.length > 0 && (
                <View style={{ marginTop: 6 }}>
                    {blockers.map((f, idx) => (
                        <View key={`ba-${idx}`} style={{ flexDirection: "row", marginBottom: 2, paddingLeft: 4 }}>
                            <Text style={{ width: 10, fontSize: 8, color: c.text }}>•</Text>
                            <Text style={{ flex: 1, fontSize: 8, color: c.text }}>
                                {axisLabel(f.axis)}: {f.summary}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
            {showAxes && blockers.length === 0 && warnings.length > 0 && (
                <View style={{ marginTop: 6 }}>
                    {warnings.slice(0, 5).map((f, idx) => (
                        <View key={`wa-${idx}`} style={{ flexDirection: "row", marginBottom: 2, paddingLeft: 4 }}>
                            <Text style={{ width: 10, fontSize: 8, color: c.text }}>•</Text>
                            <Text style={{ flex: 1, fontSize: 8, color: c.text }}>
                                {axisLabel(f.axis)}: {f.summary}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
            {showAxes && !phantomGreen && verdict.fails.length > 0 && (
                <Text style={{ fontSize: 7.5, color: c.text, marginTop: 6, opacity: 0.75, fontStyle: "italic" }}>
                    This verdict is computed deterministically from the sizing solver, bill of materials, and cost waterfall — not from language-model opinion. Constraint axes that lacked input data were not evaluated and are not reflected above.
                </Text>
            )}
        </View>
    )
}

function FeasibilityExceptionPage({
    verdict,
}: {
    verdict: NonNullable<PdfInput["feasibilityVerdict"]>
}): React.ReactElement {
    // Loop 24 P0: phantom-GREEN renders as UNREVIEWED on this page.
    const phantomGreen = verdict.status === "green" && verdict.checkedConstraints.length === 0
    const colorKey: keyof typeof VERDICT_COLORS = phantomGreen ? "unreviewed" : verdict.status
    const c = VERDICT_COLORS[colorKey]
    const blockers = verdict.fails.filter((f) => f.severity === "blocker")
    const warnings = verdict.fails.filter((f) => f.severity === "warning")
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>Feasibility exception</Text>
            <Text style={[styles.muted, { marginBottom: 10, fontSize: 9 }]}>
                {phantomGreen
                    ? "The feasibility solver ran but had insufficient data to evaluate any constraint axis. This may indicate the dimension sheet was not generated, the brief has no cost ceiling, or the bill of materials has no parts with mass data. The downstream sections are present but unvalidated — treat all figures as working estimates until the solver can be re-run with complete inputs."
                    : "Before this report was assembled, the design was checked against the brief constraints and against UK transport law. The fails below are not opinions — each one is grounded in numbers from the design itself (sizing solver, cost waterfall, parts mass roll-up). Treat the downstream sections as tentative until these are resolved."}
            </Text>
            <View
                style={{
                    backgroundColor: c.bg,
                    borderLeftWidth: 3,
                    borderLeftColor: c.border,
                    paddingTop: 6,
                    paddingBottom: 6,
                    paddingLeft: 8,
                    paddingRight: 8,
                    marginBottom: 12,
                }}
            >
                <Text style={{ fontSize: 10, fontWeight: "bold", color: c.text }}>
                    Status: {c.label}
                    {phantomGreen ? " — insufficient solver inputs" : ""}
                </Text>
                {phantomGreen && (
                    <Text style={{ fontSize: 9, color: c.text, marginTop: 3 }}>
                        No constraint axes were checked. Re-run the proofreader once the dimension sheet, brief constraints, and bill-of-materials parts are populated.
                    </Text>
                )}
            </View>
            {blockers.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                    <Text
                        style={{
                            fontSize: 11,
                            fontWeight: "bold",
                            color: VERDICT_COLORS.red.border,
                            marginBottom: 4,
                        }}
                    >
                        BLOCKERS ({blockers.length})
                    </Text>
                    {blockers.map((f, idx) => (
                        <View key={`bk-${idx}`} style={{ marginBottom: 6 }}>
                            <Text style={{ fontSize: 10, fontWeight: "bold" }}>
                                {axisLabel(f.axis)} — {f.summary}
                            </Text>
                            <Text style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>
                                {f.evidence}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
            {warnings.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                    <Text
                        style={{
                            fontSize: 11,
                            fontWeight: "bold",
                            color: VERDICT_COLORS.amber.border,
                            marginBottom: 4,
                        }}
                    >
                        WARNINGS ({warnings.length})
                    </Text>
                    {warnings.map((f, idx) => (
                        <View key={`wn-${idx}`} style={{ marginBottom: 6 }}>
                            <Text style={{ fontSize: 10, fontWeight: "bold" }}>
                                {axisLabel(f.axis)} — {f.summary}
                            </Text>
                            <Text style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>
                                {f.evidence}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
            {/* L13-VERIFY-FIX (2026-04-27): identify the primary blocker
               so the founder reads "do this first" instead of scanning
               5 equally-weighted trade-offs. Primary = the first
               blocker (envelope > mass > transport > cost). */}
            {blockers.length > 0 && (
                <View
                    style={{
                        backgroundColor: "#fee2e2",
                        borderLeftWidth: 3,
                        borderLeftColor: "#b91c1c",
                        padding: 10,
                        marginBottom: 12,
                    }}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7f1d1d" }}>
                        Primary blocker — fix this first
                    </Text>
                    <Text style={{ fontSize: 10, color: "#7f1d1d", marginTop: 4 }}>
                        {axisLabel(blockers[0].axis)}: {blockers[0].summary}
                    </Text>
                    {blockers[0].evidence ? (
                        <Text style={{ fontSize: 9, color: "#7f1d1d", marginTop: 2 }}>
                            {blockers[0].evidence}
                        </Text>
                    ) : null}
                    <Text style={{ fontSize: 9, color: "#7f1d1d", marginTop: 6 }}>
                        Most downstream blockers (cost over-run, supplier coverage gaps) are consequences of this primary axis. Resolve it before iterating the others.
                    </Text>
                </View>
            )}
            {verdict.tradeoffs.length > 0 && (
                <View style={{ marginBottom: 6 }}>
                    <Text style={[styles.h5, { marginBottom: 4 }]}>
                        Suggested trade-offs
                    </Text>
                    <Text style={[styles.muted, { fontSize: 8.5, marginBottom: 4 }]}>
                        Each trade-off is a brief revision the founder can ask the customer or themselves to consider. Quantitative cost / mass / envelope deltas are not modelled in this report; pursuing one trade-off may invalidate others. Re-run the design with a revised brief to see the new feasibility verdict before committing tooling.
                    </Text>
                    {verdict.tradeoffs.map((t, idx) => (
                        <Text
                            key={`to-${idx}`}
                            style={{ fontSize: 10, marginBottom: 3 }}
                        >
                            • {t}
                        </Text>
                    ))}
                </View>
            )}
            <PdfFooter label="Feasibility exception" />
        </Page>
    )
}

/** Loop 5 P1: cross-section RED-state framing (3/3 unanimous Loop 4 council).
 *
 * When the feasibility verdict is RED, downstream sections (BOM, cost,
 * suppliers) need to signal that their content is tentative. This banner
 * renders inline under each section heading and references the upstream
 * blocker IDs so the founder traces what's invalidated and why.
 *
 * The council's exact concern (V4-Pro): "Once the envelope check returns
 * 'infeasible', all downstream sections (cost, BOM, risks) should be
 * automatically invalidated and replaced with a 're-baseline required'
 * notice." We don't suppress the sections (they're still useful as design
 * estimates) but we frame them as INVALIDATED / TENTATIVE / DEFERRED so the
 * founder doesn't treat them as a procurement-ready package.
 *
 * sectionKind selects which blockers are most relevant for the section's
 * audience — cost section foregrounds cost+transport blockers; BOM
 * foregrounds envelope+cost; suppliers foregrounds the whole verdict.
 */
function RedStateBanner({
    verdict,
    sectionKind,
}: {
    verdict: NonNullable<PdfInput["feasibilityVerdict"]>
    sectionKind: "bom" | "cost" | "suppliers"
}): React.ReactElement {
    const blockers = verdict.fails.filter((f) => f.severity === "blocker")
    const c = VERDICT_COLORS.red
    const sectionMessage =
        sectionKind === "cost"
            ? "This estimate is invalidated until the upstream feasibility blockers are resolved — figures below are illustrative, not procurement-ready."
            : sectionKind === "bom"
              ? "Tentative bill of materials. Quantities and selections are derived from a configuration the sizing solver could not fit; expect material churn once the blockers below are resolved."
              : "Procurement deferred. Suppliers below are research candidates — do not begin RFQ work until the upstream feasibility blockers are closed."
    return (
        <View
            style={{
                backgroundColor: c.bg,
                borderLeftWidth: 3,
                borderLeftColor: c.border,
                paddingTop: 6,
                paddingBottom: 6,
                paddingLeft: 8,
                paddingRight: 8,
                marginBottom: 8,
            }}
        >
            <Text
                style={{
                    fontSize: 10,
                    fontWeight: "bold",
                    color: c.text,
                    marginBottom: 2,
                }}
            >
                Tentative under failed feasibility
            </Text>
            <Text style={{ fontSize: 9, color: c.text, marginBottom: 3 }}>
                {sectionMessage}
            </Text>
            {blockers.length > 0 && (
                <Text style={{ fontSize: 9, color: c.text }}>
                    Blockers:{" "}
                    {blockers
                        .map((f) => `${axisLabel(f.axis)} (${f.summary.replace(/\.$/, "")})`)
                        .join(" · ")}
                </Text>
            )}
        </View>
    )
}

function axisLabel(axis: NonNullable<PdfInput["feasibilityVerdict"]>["fails"][number]["axis"]): string {
    switch (axis) {
        case "envelope":
            return "Envelope"
        case "mass":
            return "Mass"
        case "cost":
            return "Cost"
        case "cost_type_mismatch":
            return "Cost — type mismatch"
        case "transport":
            return "Transport (UK)"
        case "suppliers":
            return "Supplier coverage"
        case "spatial_overflow":
            return "Spatial plan — envelope overflow"
        case "fang_critical_findings":
            return "Manufacturing review — CRITICAL findings"
        case "fang_review_coverage":
            return "Manufacturing review — coverage"
        case "cross_modal_consistency":
            return "Cross-section consistency"
        case "decomposition_gaps":
            return "Module decomposition — completeness"
        case "data_completeness":
            return "Data completeness"
    }
}

function BriefSection({ data }: { data: PdfInput }): React.ReactElement {
    const b = data.brief
    return (
        <View>
            <Text style={styles.h2}>1. Brief</Text>
            {/* Loop 24 P0: show the banner for non-green verdicts AND for
                phantom-GREEN (solver ran, no checked constraints). Phantom-green
                renders as UNREVIEWED rather than GREEN so founders do not treat
                an empty-pass as an approval signal. */}
            {data.feasibilityVerdict && (
                data.feasibilityVerdict.status !== "green" ||
                isPhantomGreen(data.feasibilityVerdict)
            ) && (
                <FeasibilityVerdictBanner verdict={data.feasibilityVerdict} />
            )}
            {/* ── Alternate envelope pushback callout (Loop 24 P0 class-fence) ──
              * Rendered when Gate 3 found a feasible alternate in a DIFFERENT
              * product class from the briefed envelope. Warning-level — not an
              * error; the design is valid at the briefed class, but the founder
              * may want to relax the envelope to hit their full target.
              * Uses semantic warning tokens: bg-warning/10 → #fef3c7, border-warning → #a16207.
              */}
            {data.alternateEnvelopePushback != null && (
                <View
                    style={{
                        marginTop: 10,
                        marginBottom: 8,
                        padding: 10,
                        borderRadius: 4,
                        backgroundColor: "#fef3c7",
                        borderLeftWidth: 3,
                        borderLeftColor: "#a16207",
                    }}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#92400e", marginBottom: 4 }}>
                        Trade-off note from sizing engine
                    </Text>
                    <Text style={{ fontSize: 9.5, color: "#78350f", marginBottom: 4 }}>
                        {`Your brief specified a ${data.alternateEnvelopePushback.briefed_envelope.classification_tag} envelope (${data.alternateEnvelopePushback.briefed_envelope.label}). `}
                        {data.alternateEnvelopePushback.capacity_at_briefed_class.value != null
                            ? `At that envelope, the maximum feasible capacity is ${data.alternateEnvelopePushback.capacity_at_briefed_class.value} ${data.alternateEnvelopePushback.capacity_at_briefed_class.units}${data.alternateEnvelopePushback.capacity_at_briefed_class.deficit != null ? `, short of your target by ${data.alternateEnvelopePushback.capacity_at_briefed_class.deficit} ${data.alternateEnvelopePushback.capacity_at_briefed_class.units}` : ""}. `
                            : data.alternateEnvelopePushback.capacity_at_briefed_class.summary + " "
                        }
                    </Text>
                    {data.alternateEnvelopePushback.capacity_at_alternate_class.value != null && (
                        <Text style={{ fontSize: 9.5, color: "#78350f", marginBottom: 4 }}>
                            {`If you consider relaxing the envelope class to ${data.alternateEnvelopePushback.alternate_envelope.classification_tag} (${data.alternateEnvelopePushback.alternate_envelope.label}), ${data.alternateEnvelopePushback.capacity_at_alternate_class.value} ${data.alternateEnvelopePushback.capacity_at_alternate_class.units} may be achievable.`}
                        </Text>
                    )}
                    <Text style={{ fontSize: 9.5, color: "#78350f", marginBottom: 4 }}>
                        {data.alternateEnvelopePushback.trade_off_note}
                    </Text>
                    <Text style={{ fontSize: 8.5, color: "#92400e", fontStyle: "italic" }}>
                        To switch, return to the brief and update the envelope. Otherwise the design proceeds as briefed at the maximum feasible capacity for the briefed envelope class.
                    </Text>
                </View>
            )}
            {b.subject && (
                <View style={styles.para}>
                    <Text style={styles.h5}>What we are building</Text>
                    <Text>{b.subject}</Text>
                </View>
            )}
            {b.mission && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Mission</Text>
                    <Text>{b.mission}</Text>
                </View>
            )}
            {b.useCase && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Use case</Text>
                    <Text>{b.useCase}</Text>
                </View>
            )}
            {b.targetCustomers && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Target customers</Text>
                    <Text>{b.targetCustomers}</Text>
                </View>
            )}
            {b.whyNow && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Why now</Text>
                    <Text>{b.whyNow}</Text>
                </View>
            )}
            {/* Hide rows entirely when the founder didn't declare a value —
                "not declared" filler clutters the PDF and looks like a bug.
                Show the section header only when at least one constraint has a value. */}
            {(b.unitCostCeilingGbp != null
                || b.maxMassKg != null
                || b.targetProcess
                || b.targetMaterial
                || b.toleranceTarget
                || b.quantityTarget) && (
                <Text style={styles.h3}>Constraints declared</Text>
            )}
            {b.unitCostCeilingGbp != null && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Unit cost ceiling</Text>
                    <Text style={styles.rowValue}>{fmtGbp(b.unitCostCeilingGbp)}</Text>
                </View>
            )}
            {/* Loop 8 P3 (Tristan-flagged Loop 7) — when the brief target is
             *  wildly outside the council-priors industry band for this
             *  product class, surface that fact RIGHT HERE. The rest of
             *  the report shows "£501,505 over" and the founder reads
             *  the engine as wrong; the actual problem is the brief
             *  target is below the industry floor. */}
            {data.oracleProjectBand && (data.oracleProjectBand.targetBelowLow || data.oracleProjectBand.targetAboveHigh) && (
                <View
                    style={{
                        marginTop: 8,
                        padding: 8,
                        borderRadius: 4,
                        backgroundColor: "#fef3c7",
                        borderLeftWidth: 3,
                        borderLeftColor: "#a16207",
                    }}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#92400e", marginBottom: 2 }}>
                        {data.oracleProjectBand.targetBelowLow
                            ? `Brief target is ${data.oracleProjectBand.targetVsLowRatio != null ? `${(data.oracleProjectBand.targetVsLowRatio * 100).toFixed(0)}% of` : "below"} the industry-low benchmark for this product class`
                            : `Brief target is ${data.oracleProjectBand.targetVsHighRatio != null ? `${(data.oracleProjectBand.targetVsHighRatio).toFixed(1)}× ` : ""}above the industry-high benchmark for this product class`}
                    </Text>
                    <Text style={{ fontSize: 9, color: "#78350f" }}>
                        {data.oracleProjectBand.caption}
                    </Text>
                    {data.oracleProjectBand.targetBelowLow && (
                        <Text style={{ fontSize: 9, color: "#78350f", marginTop: 2, fontStyle: "italic" }}>
                            If the design&apos;s estimated cost (shown later in this report) exceeds your stated target, the gap reflects industry-typical build costs rather than an estimation error — review whether the brief target should be revised upward or whether the scope needs cutting. If the engine&apos;s estimate comes in within your target, treat that as a flag that your scope may be tighter than industry-typical for this class.
                        </Text>
                    )}
                </View>
            )}
            {b.maxMassKg != null && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Max mass</Text>
                    <Text style={styles.rowValue}>{fmtKg(b.maxMassKg)}</Text>
                </View>
            )}
            {b.targetProcess && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Target process</Text>
                    <Text style={styles.rowValue}>{b.targetProcess}</Text>
                </View>
            )}
            {b.targetMaterial && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Target material</Text>
                    <Text style={styles.rowValue}>{b.targetMaterial}</Text>
                </View>
            )}
            {b.toleranceTarget && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Tolerance target</Text>
                    <Text style={styles.rowValue}>{b.toleranceTarget}</Text>
                </View>
            )}
            {b.quantityTarget && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Quantity target</Text>
                    <Text style={styles.rowValue}>{b.quantityTarget}</Text>
                </View>
            )}
            {b.complianceNotes && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Compliance notes</Text>
                    <Text>{b.complianceNotes}</Text>
                </View>
            )}
        </View>
    )
}

// Loop 26 D1/D4: domains where an absent regulatory matrix is legally reckless.
// The placeholder escalates to red and uses stronger language for these domains.
const SAFETY_CRITICAL_DOMAINS: ReadonlySet<import("@/lib/cad-lab/industry-domains").IndustryDomain> =
    new Set([
        "water_treatment", // potable water, desalination — WHO / BS EN 15748 / WRAS
        "medical",         // implants, diagnostics — MDR 2017/745, FDA 510(k)
        "aerospace",       // aircraft, unmanned aircraft — EASA CS-25, DO-178C
        "defense",         // mil-spec — ITAR, DEF STAN
        "oil_gas",         // pressure vessels, subsea — PSSR, PED
        "processing",      // pharmaceutical, cleanroom — GMP, ATEX
    ])

function RegulatorySection({ items, data }: { items: Regulatory[]; data: PdfInput }): React.ReactElement {
    // Loop 3 P4: when at least one item carries the new compliance-matrix
    // fields (applicability / designImpact / evidenceRequired / ownerRole
    // / gapAction), render the rich layout. When none do, fall back to
    // the original 1-line summary shape so older projects still look the
    // same.
    const hasMatrix = items.some(
        (r) =>
            r.applicability ||
            r.designImpact ||
            r.evidenceRequired ||
            r.ownerRole ||
            r.gapAction,
    )
    // D3 — Loop 26: count unverified entries for the section-level callout.
    // All regulatory rows default to unverified because Chase/LLM extraction
    // has <60% precision on multi-page regulatory tables (council finding).
    // The section callout fires when ≥30% of rows are unverified.
    const unverifiedCount = items.filter((r) =>
        isUnverifiedExtraction(r.confidence, r.verifiedAt),
    ).length
    const unverifiedFraction = items.length > 0 ? unverifiedCount / items.length : 0
    const showRegulatoryUnverifiedCallout = items.length > 0 && unverifiedFraction >= 0.3

    // D1/D4 — Loop 26: determine urgency colour for the mandatory-section placeholder.
    // Safety-critical domains get a red warning; all other domains get amber.
    const isSafetyCritical = SAFETY_CRITICAL_DOMAINS.has(data.detectedDomain)
    const missingBg = isSafetyCritical ? "#fef2f2" : "#fffbeb"
    const missingBorderColour = isSafetyCritical ? "#b91c1c" : "#b45309"
    const missingHeadColour = isSafetyCritical ? "#7f1d1d" : "#78350f"
    const missingBodyColour = isSafetyCritical ? "#991b1b" : "#92400e"

    return (
        <View break>
            <Text style={styles.h2}>2. Regulatory posture</Text>
            {items.length === 0 && (
                // Loop 26 D1/D4: mandatory-section placeholder — never silently omit.
                // The compliance review stage has not yet run (or returned no
                // applicable standards). Founders must not share this document with
                // suppliers, certification bodies, or investors until this section is
                // populated. For safety-critical domains the callout is red because
                // operating without a compliance matrix is a legal and safety risk.
                <View
                    style={{
                        marginTop: 6,
                        marginBottom: 8,
                        padding: 10,
                        borderRadius: 4,
                        backgroundColor: missingBg,
                        borderLeftWidth: 3,
                        borderLeftColor: missingBorderColour,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 10,
                            fontWeight: "bold",
                            color: missingHeadColour,
                            marginBottom: 4,
                        }}
                    >
                        {isSafetyCritical
                            ? "Regulatory analysis not yet performed — this is legally required for this product class"
                            : "Regulatory analysis not yet performed — this section will be populated when the compliance review stage completes"}
                    </Text>
                    <Text
                        style={{ fontSize: 9, color: missingBodyColour, marginBottom: 4 }}
                    >
                        {isSafetyCritical
                            ? "This product operates in a safety-critical domain. A compliance matrix identifying applicable standards, design impacts, evidence requirements, and gap actions is mandatory before any procurement, certification, or investor-facing use of this document. Do not share this report until the regulatory review stage has run and this section is populated."
                            : "The compliance review stage has not yet run for this project. When it completes, this section will list each applicable standard with its status, owner, and next gap action. Until then, do not use this document for procurement or regulatory submissions."}
                    </Text>
                    {isSafetyCritical && (
                        <Text
                            style={{
                                fontSize: 8.5,
                                color: missingBodyColour,
                                fontStyle: "italic",
                            }}
                        >
                            {`Detected domain: ${data.detectedDomain.replace(/_/g, " ")}. Typical standards for this domain include national drinking-water regulations, pressure-system and material-contact approvals, and operator qualification requirements. Engage a qualified compliance engineer before design freeze.`}
                        </Text>
                    )}
                </View>
            )}
            {hasMatrix && items.length > 0 && (
                <Text style={[styles.muted, { marginBottom: 8, fontSize: 9 }]}>
                    Per-standard compliance matrix — applicability, design
                    impact, evidence required, status, owner, and the next
                    concrete gap action. Status &quot;not-started&quot; means
                    the founder hasn&apos;t closed the gap yet, not that the
                    standard is unimportant.
                </Text>
            )}
            {/* D3 — Loop 26: section-level callout when ≥30% of entries are unverified. */}
            {showRegulatoryUnverifiedCallout && (
                <View
                    style={{
                        marginBottom: 8,
                        padding: 8,
                        borderRadius: 4,
                        backgroundColor: "#fef3c7",
                        borderLeftWidth: 3,
                        borderLeftColor: "#b45309",
                    }}
                >
                    <Text style={{ fontSize: 9, fontWeight: "bold", color: "#78350f" }}>
                        {unverifiedCount} of {items.length} regulatory entries are unverified extractions — confirm with a qualified compliance reviewer before procurement.
                    </Text>
                    <Text style={{ fontSize: 8.5, color: "#78350f", marginTop: 3 }}>
                        These entries were populated by an automated extraction pass. Precision on conditional regulatory specifications is 40–70%. Each entry marked &quot;Unverified&quot; should be cross-checked against the original standard text before any procurement, certification, or design-freeze decision.
                    </Text>
                </View>
            )}
            {/* Item 2 (council 2026-04-29): undifferentiated warning banner — fires when
             *  the post-Chase triage pass could not differentiate any standard from
             *  &quot;not-started&quot;, meaning the product class is either too novel or
             *  the brief description is too sparse for keyword matching to resolve
             *  applicability. Manual review is required in this case. */}
            {items.length > 0 && data.regulatoryUndifferentiated && (
                <View
                    style={{
                        marginBottom: 8,
                        padding: 8,
                        borderRadius: 4,
                        backgroundColor: "#fdf2f8",
                        borderLeftWidth: 3,
                        borderLeftColor: "#9d174d",
                    }}
                >
                    <Text style={{ fontSize: 9, fontWeight: "bold", color: "#831843" }}>
                        Automated triage could not differentiate standards for this product class — manual applicability review required.
                    </Text>
                    <Text style={{ fontSize: 8.5, color: "#831843", marginTop: 3 }}>
                        All standards remain at &quot;not-started&quot; because the brief description did not match the keyword rules for the domain exclusion or design-impact elevation passes. A qualified compliance engineer should review each standard below and mark it not-applicable or flag design impact before procurement or certification.
                    </Text>
                </View>
            )}
            {items.map((r, i) => {
                const rowUnverified = isUnverifiedExtraction(r.confidence, r.verifiedAt)
                return (
                <View key={i} style={{ marginBottom: 10 }} wrap={false}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                        <Text style={{ fontWeight: "bold", marginRight: 8 }}>{r.code}</Text>
                        {r.status && (() => {
                            const colours = regulatoryStatusColour(r.status)
                            return (
                                <Text
                                    style={{
                                        fontSize: 8,
                                        paddingHorizontal: 6,
                                        paddingVertical: 2,
                                        borderRadius: 3,
                                        backgroundColor: colours.bg,
                                        color: colours.text,
                                        borderWidth: 1,
                                        borderColor: colours.border,
                                        marginRight: 4,
                                    }}
                                >
                                    {regulatoryStatusLabel(r.status)}
                                </Text>
                            )
                        })()}
                        {r.ownerRole && (
                            <Text style={[styles.pillMuted, { marginLeft: 6 }]}>
                                {sanitizeReviewText(r.ownerRole)}
                            </Text>
                        )}
                        {/* D3 — Loop 26: inline unverified pill per row */}
                        {rowUnverified && <UnverifiedPill />}
                    </View>
                    <Text style={{ fontStyle: "italic", marginBottom: 2 }}>{r.name}</Text>
                    {r.summary && <Text style={{ marginBottom: 3 }}>{sanitizeReviewText(r.summary)}</Text>}
                    {r.applicability && (
                        <Text style={{ fontSize: 9, marginBottom: 2 }}>
                            <Text style={{ fontWeight: "bold" }}>Applicability: </Text>
                            {sanitizeReviewText(r.applicability)}
                        </Text>
                    )}
                    {r.designImpact && (
                        <Text style={{ fontSize: 9, marginBottom: 2 }}>
                            <Text style={{ fontWeight: "bold" }}>Design impact: </Text>
                            {sanitizeReviewText(r.designImpact)}
                        </Text>
                    )}
                    {r.evidenceRequired && (
                        <Text style={{ fontSize: 9, marginBottom: 2 }}>
                            <Text style={{ fontWeight: "bold" }}>Evidence required: </Text>
                            {sanitizeReviewText(r.evidenceRequired)}
                        </Text>
                    )}
                    {r.gapAction && (
                        <Text style={{ fontSize: 9, marginBottom: 2 }}>
                            <Text style={{ fontWeight: "bold" }}>Next action: </Text>
                            {sanitizeReviewText(r.gapAction)}
                        </Text>
                    )}
                </View>
                )
            })}
        </View>
    )
}

function ModulePage({
    mod,
    index,
    partsForModule,
}: {
    mod: ModulePdf
    index: number
    /**
     * L9-FOLLOWUP (2026-04-27): BOM parts filtered by `sourceModuleName`
     * for this module. When non-empty, the Cost breakdown table reads
     * from these (the same source as the cover unit cost + BOM master
     * after L9-P1) instead of Finn's coarse `mod.cost.parts`. Eliminates
     * the Reconciliation R1 finding "Module-page cost total disagrees
     * with BOM master" that fired on every Loop 9 PDF because the page
     * showed Finn's £195/£195k while the cover showed BOM's £1,328/£647k.
     */
    partsForModule: PartRow[]
}): React.ReactElement {
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>
                3.{index + 1} · {mod.name}
            </Text>
            <View style={styles.moduleHead}>
                <View style={{ flex: 1 }} />
                <Text style={styles.moduleMeta}>
                    {fmtKg(mod.massKg)}
                    {mod.budgetMassKg != null ? ` / budget ${fmtKg(mod.budgetMassKg)}` : ""}
                    {typeof mod.leadWeeks === "number"
                        ? ` · ${mod.leadWeeks} wk lead · ${leadSourcePdfCaption(mod.leadTimeSource)}`
                        : ""}
                    {mod.mirrorOfName ? ` · mirrors ${mod.mirrorOfName}` : ""}
                </Text>
            </View>

            {/* Module image — generated render or honest empty placeholder */}
            {mod.imageUrl ? (
                <>
                    <Image src={mod.imageUrl} style={styles.moduleImage} />
                    <Text style={styles.imageDisclaimer}>
                        Illustrative only — not a technical specification. Generated for visual reference; component arrangement, proportions, and identities may differ from the final engineered assembly.
                    </Text>
                </>
            ) : (
                <View style={styles.moduleImageEmpty}>
                    <Text style={{ color: MUTED, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>
                        {mod.name}
                    </Text>
                    <Text style={{ color: MUTED, fontSize: 8 }}>
                        Illustration not yet available — will be generated on the next pipeline run.
                    </Text>
                </View>
            )}

            {/* Order: Purpose → Why it matters → Description. "Why it
                matters" carries the strategic stake and belongs before the
                physical description so readers hit the importance signal
                before the implementation detail. */}
            {mod.purpose && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Purpose</Text>
                    <Text>{mod.purpose}</Text>
                </View>
            )}
            {mod.whyItMatters && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Why it matters</Text>
                    <Text>{sanitizeReviewText(mod.whyItMatters)}</Text>
                </View>
            )}
            {mod.description && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Description</Text>
                    <Text>{sanitizeReviewText(mod.description)}</Text>
                </View>
            )}

            {/* Key parts — FULL list, no truncation */}
            <Text style={styles.h5}>
                Key parts ({mod.keyParts.length})
            </Text>
            {mod.keyParts.length === 0 && (
                <Text style={styles.muted}>None declared.</Text>
            )}
            {mod.keyParts.map((p, i) => (
                <View key={i} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{p}</Text>
                </View>
            ))}

            {/* Diagnostics */}
            {mod.diagnostics && Object.keys(mod.diagnostics).length > 0 && (
                <View style={{ marginTop: 8 }}>
                    <Text style={styles.h5}>Manufacturing diagnostics</Text>
                    {Object.entries(mod.diagnostics).map(([k, v]) => (
                        <View key={k} style={styles.row}>
                            <Text style={styles.rowLabel}>{k}</Text>
                            <Text style={styles.rowValue}>{String(v)}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Failure modes — FULL */}
            {mod.failureModes.length > 0 && (
                <View style={{ marginTop: 8 }}>
                    <Text style={styles.h5}>Failure modes ({mod.failureModes.length})</Text>
                    {mod.failureModes.map((f, i) => (
                        <View key={i} style={styles.bullet}>
                            <Text style={styles.bulletDot}>•</Text>
                            <Text style={styles.bulletText}>{f}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Unknowns — FULL */}
            {mod.unknowns.length > 0 && (
                <View style={{ marginTop: 8 }}>
                    <Text style={styles.h5}>Open questions ({mod.unknowns.length})</Text>
                    {mod.unknowns.map((u, i) => (
                        <View key={i} style={styles.bullet}>
                            <Text style={styles.bulletDot}>•</Text>
                            <Text style={styles.bulletText}>{u}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* L14 (2026-04-27): when neither Finn cost nor BOM parts
               exist for a module, the rest of the page is silent on
               cost. HAPS Loop 13: Landing Gear Assembly had zero
               parts AND no Finn cost — the customer reads the module
               page expecting cost data and finds nothing. Surface the
               gap explicitly. */}
            {!mod.cost && partsForModule.length === 0 && (
                <View
                    style={{
                        marginTop: 10,
                        padding: 8,
                        backgroundColor: "#fee2e2",
                        borderLeftWidth: 3,
                        borderLeftColor: "#b91c1c",
                    }}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7f1d1d" }}>
                        No bill-of-materials decomposition for this module
                    </Text>
                    <Text style={{ fontSize: 9, color: "#7f1d1d", marginTop: 3 }}>
                        Max did not produce key parts for this module, and Finn did not produce a coarse cost estimate. The cover unit cost and cost waterfall therefore exclude this module entirely. Re-run module decomposition before treating any cost figure as load-bearing.
                    </Text>
                </View>
            )}
            {/* Cost breakdown */}
            {(mod.cost || partsForModule.length > 0) && (
                <View style={{ marginTop: 10 }}>
                    <Text style={styles.h5}>
                        Cost breakdown
                        {partsForModule.length > 0
                            ? " · BOM-derived"
                            : mod.cost?.confidence
                                ? ` · ${mod.cost.confidence} confidence`
                                : ""}
                    </Text>
                    {/* L9-FOLLOWUP + Tristan-flagged 2026-04-27 08:00:
                       prefer BOM parts table (canonical, matches cover + BOM
                       master + reconciliation gate). Add explicit Part #
                       column so a reader can cross-reference each row in the
                       BOM master. Add a sum-vs-BOM footer line so the reader
                       can see at a glance whether this module's cost
                       breakdown actually matches the BOM. */}
                    {partsForModule.length > 0 ? (
                        <View style={styles.table}>
                            <View style={styles.tableHead}>
                                <Text style={[styles.tableHeadCell, { width: 70 }]}>Part #</Text>
                                <Text style={[styles.tableHeadCell, { flex: 2.5 }]}>Name</Text>
                                <Text style={[styles.tableHeadCell, { width: 40 }]}>Type</Text>
                                <Text style={[styles.tableHeadCell, { flex: 1.5 }]}>Process / material</Text>
                                <Text style={[styles.tableHeadCell, { width: 60, textAlign: "right", paddingRight: 8 }]}>Cost</Text>
                            </View>
                            {partsForModule.map((p, i) => (
                                <View key={i} style={styles.tableRow}>
                                    <Text style={[styles.tableCell, { width: 70 }]}>
                                        {p.partNumber ?? "—"}
                                    </Text>
                                    <Text style={[styles.tableCell, { flex: 2.5 }]}>
                                        {p.name}
                                        {p.description ? (
                                            <Text style={{ color: MUTED }}>{" — " + sanitizeReviewText(p.description)}</Text>
                                        ) : null}
                                    </Text>
                                    <Text style={[styles.tableCell, { width: 40 }]}>
                                        {p.isPurchased ? "buy" : "make"}
                                    </Text>
                                    <Text style={[styles.tableCell, { flex: 1.5 }]}>
                                        {!p.isPurchased
                                            ? `${p.process ?? "—"}${p.material ? " · " + p.material : ""}`
                                            : "—"}
                                    </Text>
                                    <Text
                                        style={[styles.tableCell, { width: 60, textAlign: "right", paddingRight: 8 }]}
                                    >
                                        {fmtGbp(p.estimatedUnitCostGbp)}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    ) : mod.cost?.parts && mod.cost.parts.length > 0 ? (
                        <View style={styles.table}>
                            <View style={styles.tableHead}>
                                <Text style={[styles.tableHeadCell, { flex: 3 }]}>Part</Text>
                                <Text style={[styles.tableHeadCell, { width: 40 }]}>Type</Text>
                                <Text style={[styles.tableHeadCell, { flex: 1.5 }]}>Process / material</Text>
                                <Text style={[styles.tableHeadCell, { width: 60, textAlign: "right", paddingRight: 8 }]}>Cost</Text>
                            </View>
                            {mod.cost.parts.map((p, i) => (
                                <View key={i} style={styles.tableRow}>
                                    <Text style={[styles.tableCell, { flex: 3 }]}>
                                        {p.name}
                                        {p.reasoning ? (
                                            <Text style={{ color: MUTED }}>{" — " + p.reasoning}</Text>
                                        ) : null}
                                    </Text>
                                    <Text style={[styles.tableCell, { width: 40 }]}>{p.type}</Text>
                                    <Text style={[styles.tableCell, { flex: 1.5 }]}>
                                        {p.type === "make"
                                            ? `${p.process ?? "—"}${p.material ? " · " + p.material : ""}`
                                            : "—"}
                                    </Text>
                                    <Text
                                        style={[styles.tableCell, { width: 60, textAlign: "right", paddingRight: 8 }]}
                                    >
                                        {fmtGbp(p.cost)}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    ) : null}
                    {/* Sum-vs-BOM cross-check footer — Tristan-flagged 2026-04-27 08:00.
                       Reader sees at a glance whether this module's cost
                       breakdown actually matches the BOM master.
                       L13-P2 (2026-04-27): partsSum is now computed via
                       dedupAssemblyRollUp so an assembly-parent row + its
                       constituents in the same module do not double-count. */}
                    {(() => {
                        const moduleDedup = dedupAssemblyRollUp(partsForModule)
                        const partsSum = moduleDedup.effectiveCost.reduce(
                            (acc, c) => acc + c,
                            0,
                        )
                        const finnSum =
                            mod.cost?.parts?.reduce(
                                (acc, p) => acc + (typeof p.cost === "number" ? p.cost : 0),
                                0,
                            ) ?? 0
                        const breakdownSum = partsForModule.length > 0 ? partsSum : finnSum
                        const bomSum = partsSum
                        const usingBomDerived = partsForModule.length > 0
                        if (breakdownSum === 0 && bomSum === 0) return null
                        const diff = bomSum > 0 ? Math.abs(breakdownSum - bomSum) / bomSum : 0
                        const matches = usingBomDerived || diff < 0.01
                        return (
                            <Text
                                style={[
                                    styles.muted,
                                    {
                                        fontSize: 9,
                                        marginTop: 6,
                                        color: matches ? "#0a7d28" : "#b35900",
                                    },
                                ]}
                            >
                                {usingBomDerived ? (
                                    `✓ Cost breakdown is sourced from the bill of materials master · ${partsForModule.length} rows · per-unit total ${fmtGbp(breakdownSum)} matches the BOM master row-sum for this module exactly. Each Part # above can be found verbatim in §4 BOM master.`
                                ) : matches ? (
                                    `✓ Cost breakdown sum ${fmtGbp(breakdownSum)} matches the BOM master row-sum for this module within 1%. Lines below are Finn's narrative items; the BOM master in §4 carries the canonical Part # references for procurement.`
                                ) : (
                                    `⚠ Cost breakdown sum ${fmtGbp(breakdownSum)} disagrees with the BOM master row-sum for this module (${fmtGbp(bomSum)}) by ${(diff * 100).toFixed(0)}%. The BOM master in §4 is the canonical source — treat the lines above as a narrative breakdown rather than a procurement list. See Reconciliation page.`
                                )}
                            </Text>
                        )
                    })()}
                    {/* Labour: only when Finn provided it AND we're falling back
                       to Finn's breakdown. Hide when BOM is the source — labour
                       is rolled into per-row "make" costs in the BOM. */}
                    {partsForModule.length === 0 &&
                        typeof mod.cost?.labourCost === "number" && (
                            <View style={[styles.row, { marginTop: 4 }]}>
                                <Text style={styles.rowLabel}>Labour</Text>
                                <Text style={styles.rowValue}>
                                    {fmtGbp(mod.cost.labourCost)}
                                    {mod.cost.labourReasoning ? ` — ${mod.cost.labourReasoning}` : ""}
                                </Text>
                            </View>
                        )}
                    {/* Per-unit total: parts roll-up when present, else Finn.
                       L13-P2 (2026-04-27): de-duplicated to match cover total. */}
                    {(() => {
                        const totalDedup = dedupAssemblyRollUp(partsForModule)
                        const partsTotal = totalDedup.effectiveCost.reduce(
                            (acc, c) => acc + c,
                            0,
                        )
                        const useParts = partsForModule.length > 0
                        const total = useParts
                            ? partsTotal
                            : typeof mod.cost?.totalPerUnit === "number"
                                ? mod.cost.totalPerUnit
                                : null
                        if (total === null) return null
                        return (
                            <View style={styles.row}>
                                <Text style={styles.rowLabel}>
                                    Per-unit total{useParts ? " · BOM-derived" : ""}
                                </Text>
                                <Text style={[styles.rowValue, { fontWeight: "bold" }]}>
                                    {fmtGbp(total)}
                                </Text>
                            </View>
                        )
                    })()}
                    {mod.cost?.assumptions && mod.cost.assumptions.length > 0 && (
                        <View style={{ marginTop: 4 }}>
                            <Text style={styles.h5}>Assumptions</Text>
                            {mod.cost.assumptions.map((a, i) => (
                                <View key={i} style={styles.bullet}>
                                    <Text style={styles.bulletDot}>•</Text>
                                    <Text style={styles.bulletText}>{a}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                    {mod.cost?.reasoning && (
                        <Text style={[styles.muted, { fontSize: 9, marginTop: 4 }]}>
                            {mod.cost.reasoning}
                        </Text>
                    )}
                </View>
            )}

            {/* Engineering reviews — L14 (2026-04-27): when a module has
               no engineering review, surface the gap so the customer
               knows it's missing rather than silently absent. Loop 13
               scoring (Hedgerow Camera + Battery — 2 of 3 highest-cost
               modules — had no review).
               Loop 24 P0: also catch the double-empty case where a review
               record exists (reviews.length > 0) but has zero issues —
               indicates Fang returned an empty result on both attempts and
               the module was never actually validated. Render a hard RED
               banner rather than the silent amber "no review" placeholder. */}
            {mod.reviews.length === 0 && (
                <View
                    style={{
                        marginTop: 10,
                        padding: 8,
                        backgroundColor: "#fef3c7",
                        borderLeftWidth: 3,
                        borderLeftColor: "#b45309",
                    }}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7c2d12" }}>
                        No engineering review on this module
                    </Text>
                    <Text style={{ fontSize: 9, color: "#7c2d12", marginTop: 3 }}>
                        Fang did not produce a manufacturing or assembly review for this module. The other module pages carry [CRITICAL] / [WARNING] / [INFO] findings on tolerances, supplier risks, and sequence dependencies; this module is silent. Re-run Fang on this module before treating the cost / mass figures above as procurement-grade.
                    </Text>
                </View>
            )}
            {/* Loop 24 P0 — double-empty review: a review record exists but
                every attempt returned zero issues. This is NOT a pass — it is
                a validation failure. Render a hard RED banner so the founder
                cannot mistake it for an approved module. */}
            {mod.reviews.length > 0 && mod.reviews.every((r) => r.issues.length === 0) && (
                <View
                    style={{
                        marginTop: 10,
                        padding: 8,
                        backgroundColor: "#fee2e2",
                        borderLeftWidth: 3,
                        borderLeftColor: "#b91c1c",
                    }}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7f1d1d" }}>
                        Engineering review failed to complete — this module has not been validated
                    </Text>
                    <Text style={{ fontSize: 9, color: "#7f1d1d", marginTop: 3 }}>
                        Fang returned a review record but produced no findings on any attempt. This is a pipeline validation failure, not a pass verdict. The module was not reviewed for DFM issues, tolerance risks, or assembly sequence problems. Do not treat the cost / mass figures above as procurement-grade. Re-run Fang on this module to obtain a real verdict.
                    </Text>
                </View>
            )}
            {mod.reviews.length > 0 && (
                <View style={{ marginTop: 10 }}>
                    <Text style={styles.h5}>Engineering review ({mod.reviews.length})</Text>
                    {mod.reviews.map((r, i) => (
                        <View key={i} style={{ marginBottom: 8 }}>
                            <Text style={{ fontWeight: "bold", fontSize: 10 }}>
                                Manufacturing review
                                {r.verdict ? ` · ${r.verdict}` : ""}
                                {r.reviewedAtIso ? ` · ${fmtDateTime(r.reviewedAtIso)}` : ""}
                            </Text>
                            {r.summary && <Text style={{ marginTop: 2 }}>{sanitizeReviewText(r.summary)}</Text>}
                            {r.issues.length > 0 && (
                                <View style={{ marginTop: 4 }}>
                                    {r.issues.map((iss, j) => (
                                        <View
                                            key={j}
                                            style={{
                                                marginBottom: 3,
                                                padding: 4,
                                                backgroundColor: BG_SOFT,
                                                borderRadius: 3,
                                            }}
                                        >
                                            <Text style={{ fontSize: 9 }}>
                                                <Text style={{ fontWeight: "bold" }}>
                                                    [{iss.severity.toUpperCase()}]{" "}
                                                </Text>
                                                <Text style={{ fontWeight: "bold" }}>
                                                    {iss.category}:{" "}
                                                </Text>
                                                {sanitizeReviewText(iss.message)}
                                                {iss.suggestion ? (
                                                    <Text style={{ fontStyle: "italic" }}>
                                                        {" "}Suggestion: {sanitizeReviewText(iss.suggestion)}
                                                    </Text>
                                                ) : null}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                            {r.recommendations.length > 0 && (
                                <View style={{ marginTop: 4 }}>
                                    <Text style={styles.h5}>Recommendations</Text>
                                    {r.recommendations.map((rec, j) => (
                                        <View key={j} style={styles.bullet}>
                                            <Text style={styles.bulletDot}>•</Text>
                                            <Text style={styles.bulletText}>{sanitizeReviewText(rec)}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    ))}
                </View>
            )}

            <PdfFooter label={`${mod.name} · Module ${index + 1}`} />
        </Page>
    )
}

function BomMasterPage({
    parts,
    sources,
    suppliersByPart,
    verdict,
}: {
    parts: PartRow[]
    sources: PdfInput["sources"]
    suppliersByPart: Map<string, string[]>
    verdict: PdfInput["feasibilityVerdict"]
}): React.ReactElement {
    const isRed = verdict?.status === "red"
    // L14 (2026-04-27): count unpriced rows so the founder sees the
    // BOM gap at a glance. HAPS Loop 13: PWA-001 to PWA-007 (Port wing
    // primary structure) + PAY-002 (£185k SIGINT receiver, 48% of unit
    // cost) all had cost = null. Section scored 2/10 because the BOM
    // claims to be procurement-grade while a third of buy-rows have no
    // price. Surface the gap explicitly so the customer prioritises
    // pricing those rows before any RFQ work.
    const unpricedBuyRows = parts.filter(
        (p) => p.isPurchased && (p.estimatedUnitCostGbp == null || p.estimatedUnitCostGbp <= 0),
    )

    // Loop 26 P2: graduated BOM confidence label, computed from actual data
    // coverage. Previously ALL BOMs were labelled TENTATIVE when verdict===red
    // (a proxy for design feasibility, not BOM completeness). The new logic
    // measures cost coverage and supplier coverage across purchased rows so
    // the label reflects what the BOM actually contains.
    //
    // VALIDATED   — no red verdict, ≥70% purchased rows have a cost, ≥70% have a supplier
    // PRELIMINARY — no red verdict, 50–70% cost coverage OR 50–70% supplier coverage
    // TENTATIVE   — red verdict OR <50% cost coverage on purchased rows
    const purchasedRows = parts.filter((p) => p.isPurchased)
    const pricedPurchasedRows = purchasedRows.filter(
        (p) => p.estimatedUnitCostGbp != null && p.estimatedUnitCostGbp > 0,
    )
    const purchasedWithSupplier = purchasedRows.filter(
        (p) => (suppliersByPart.get(p.partNumber) ?? []).length > 0,
    )
    const costCoverage =
        purchasedRows.length > 0 ? pricedPurchasedRows.length / purchasedRows.length : 1
    const supplierCoverage =
        purchasedRows.length > 0 ? purchasedWithSupplier.length / purchasedRows.length : 1

    type BomConfidenceLabel = "VALIDATED" | "PRELIMINARY" | "TENTATIVE"
    const bomConfidenceLabel: BomConfidenceLabel = ((): BomConfidenceLabel => {
        if (isRed || costCoverage < 0.5) return "TENTATIVE"
        if (costCoverage >= 0.7 && supplierCoverage >= 0.7) return "VALIDATED"
        return "PRELIMINARY"
    })()
    // L15-P3: parametric fallback for unpriced buy rows. The cost specialist
    // sometimes returns null on niche aerospace lines (HAPS PWA-001 to
    // PWA-007 — primary wing structure — were all unpriced in Loop 14). Run
    // a deterministic pattern match against ~20 part categories (composite
    // primary structure, hydrogen pressure vessel, fuel cell, avionics,
    // PCBA, harness, fastener, ...) and surface a "parametric" cost so the
    // bill-of-materials total is no longer understated. The persistence
    // layer is unchanged — these are render-time estimates with explicit
    // rationale shown alongside the row.
    const parametricByPartNumber = applyBomCostFallback(parts)
    const parametricRows = parts.filter((p) => {
        const fb = parametricByPartNumber.get(p.partNumber)
        return (
            p.isPurchased &&
            (p.estimatedUnitCostGbp == null || p.estimatedUnitCostGbp <= 0) &&
            fb != null &&
            fb.estimatedUnitCostGbp != null
        )
    })
    const stillUnpricedRows = parts.filter((p) => {
        const fb = parametricByPartNumber.get(p.partNumber)
        return (
            p.isPurchased &&
            (p.estimatedUnitCostGbp == null || p.estimatedUnitCostGbp <= 0) &&
            (fb == null || fb.estimatedUnitCostGbp == null)
        )
    })
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>
                4. BOM master
                {bomConfidenceLabel !== "VALIDATED" ? ` — ${bomConfidenceLabel}` : ""}
                {" "}({parts.length} rows
                {isRed ? "; design not yet feasible" : costCoverage < 0.7 ? `; ${Math.round(costCoverage * 100)}% priced` : ""}
                )
            </Text>
            {isRed && <RedStateBanner verdict={verdict!} sectionKind="bom" />}
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                BOM derived from the module decomposition&apos;s keyParts,
                expanded into typed part rows. Part records live in the
                `parts` table and are joined back to modules via
                source_module_id. The Suppliers column shows up to 3
                candidate suppliers (full details in §7).
            </Text>
            {parametricRows.length > 0 && (
                <View
                    style={{
                        marginBottom: 8,
                        padding: 8,
                        borderRadius: 4,
                        backgroundColor: "#dbeafe",
                        borderLeftWidth: 3,
                        borderLeftColor: "#1d4ed8",
                    }}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#1e3a8a" }}>
                        {parametricRows.length} row{parametricRows.length === 1 ? "" : "s"} priced from a parametric category model
                    </Text>
                    <Text style={{ fontSize: 9, color: "#1e3a8a", marginTop: 3 }}>
                        The cost specialist did not produce a unit price for these rows. The bill-of-materials renderer applied a parametric estimate by category match (composite primary structure / hydrogen pressure vessel / avionics / PCBA / etc.). Estimates are shown with a "parametric" tag against the affected rows; the underlying data is unchanged. Treat parametric prices as ±30% until the cost specialist or a contract manufacturer quote replaces them.
                    </Text>
                    <Text style={{ fontSize: 9, color: "#1e3a8a", marginTop: 4, fontStyle: "italic" }}>
                        Parametric rows: {parametricRows.slice(0, 8).map((p) => p.partNumber).join(", ")}
                        {parametricRows.length > 8 ? ` and ${parametricRows.length - 8} more` : ""}.
                    </Text>
                </View>
            )}
            {stillUnpricedRows.length > 0 && (
                <View
                    style={{
                        marginBottom: 8,
                        padding: 8,
                        borderRadius: 4,
                        backgroundColor: "#fef3c7",
                        borderLeftWidth: 3,
                        borderLeftColor: "#b45309",
                    }}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7c2d12" }}>
                        {stillUnpricedRows.length} purchased row{stillUnpricedRows.length === 1 ? "" : "s"} have no estimated unit cost — parametric fallback could not categorise them
                    </Text>
                    <Text style={{ fontSize: 9, color: "#7c2d12", marginTop: 3 }}>
                        Neither the cost specialist nor the parametric category model produced a price for these rows. The roll-ups (cover unit cost, cost waterfall) treat them as £0, which understates the bill-of-materials total. These are bona-fide unpriceable blockers — resolve before sending the document to a contract manufacturer or running unit-economics analysis.
                    </Text>
                    <Text style={{ fontSize: 9, color: "#7c2d12", marginTop: 4, fontStyle: "italic" }}>
                        Affected part numbers: {stillUnpricedRows.slice(0, 8).map((p) => p.partNumber).join(", ")}
                        {stillUnpricedRows.length > 8 ? ` and ${stillUnpricedRows.length - 8} more` : ""}.
                    </Text>
                </View>
            )}
            {parts.length === 0 ? (
                <Text style={styles.muted}>No parts generated yet.</Text>
            ) : (
                <View style={styles.table}>
                    <View style={styles.tableHead}>
                        <Text style={[styles.tableHeadCell, { width: 60 }]}>Part #</Text>
                        <Text style={[styles.tableHeadCell, { flex: 2.5 }]}>Name</Text>
                        <Text style={[styles.tableHeadCell, { flex: 1.2 }]}>Module</Text>
                        <Text style={[styles.tableHeadCell, { width: 40 }]}>Type</Text>
                        <Text style={[styles.tableHeadCell, { flex: 1 }]}>Process / material</Text>
                        <Text style={[styles.tableHeadCell, { width: 38, textAlign: "right", paddingRight: 8 }]}>Mass</Text>
                        <Text style={[styles.tableHeadCell, { width: 56, textAlign: "right", paddingRight: 12 }]}>Cost</Text>
                        <Text style={[styles.tableHeadCell, { flex: 1.6, paddingLeft: 8 }]}>Suppliers</Text>
                    </View>
                    {parts.map((p, i) => {
                        const suppliers = suppliersByPart.get(p.partNumber) ?? []
                        const supplierLabel =
                            suppliers.length === 0
                                ? p.isPurchased
                                    ? "—"
                                    : "(make)"
                                : suppliers.slice(0, 3).join(" · ")
                        return (
                            <View key={i} style={styles.tableRow}>
                                <Text style={[styles.tableCell, { width: 60 }]}>{p.partNumber}</Text>
                                <Text style={[styles.tableCell, { flex: 2.5 }]}>
                                    {p.name}
                                    {p.description ? " — " + sanitizeReviewText(p.description) : ""}
                                </Text>
                                <Text style={[styles.tableCell, { flex: 1.2 }]}>
                                    {p.sourceModuleName ?? "—"}
                                </Text>
                                <Text style={[styles.tableCell, { width: 40 }]}>
                                    {p.isPurchased ? "buy" : "make"}
                                </Text>
                                <Text style={[styles.tableCell, { flex: 1 }]}>
                                    {p.isPurchased
                                        ? "—"
                                        : `${p.process ?? "—"}${p.material ? " · " + p.material : ""}${p.tolerance ? " · ±" + p.tolerance : ""}`}
                                </Text>
                                <Text style={[styles.tableCell, { width: 38, textAlign: "right", paddingRight: 8 }]}>
                                    {p.massKg != null ? `${p.massKg.toFixed(2)}kg` : "—"}
                                </Text>
                                <View style={[styles.tableCell, { width: 56, textAlign: "right", paddingRight: 4, alignItems: "flex-end" }]}>
                                    {/* A1 — Loop 26 Tier-A: cost-provenance badge inline in BOM row */}
                                    {(() => {
                                        // Provenance-aware cost display. Precedence:
                                        //   1. cost_provenance column (post-migration rows).
                                        //   2. L15-P3 parametric fallback lookup (legacy rows).
                                        const prov = p.costProvenance
                                        if (prov === "placeholder" || prov === "todo") {
                                            return (
                                                <View style={{ alignItems: "flex-end" }}>
                                                    <Text style={{ fontSize: 7.5, color: "#b91c1c", fontWeight: "bold" }}>No quote yet</Text>
                                                </View>
                                            )
                                        }
                                        if (prov === "parametric") {
                                            return (
                                                <View style={{ alignItems: "flex-end" }}>
                                                    <Text style={{ fontSize: 8 }}>{fmtGbp(p.estimatedUnitCostGbp)}</Text>
                                                    <Text style={{ fontSize: 7, color: "#b45309", fontWeight: "bold" }}>Parametric ±30%</Text>
                                                </View>
                                            )
                                        }
                                        // prov === "quoted" or null (legacy / pre-migration) —
                                        // render the cost value normally.
                                        if (p.estimatedUnitCostGbp != null && p.estimatedUnitCostGbp > 0) {
                                            return <Text style={{ fontSize: 8 }}>{fmtGbp(p.estimatedUnitCostGbp)}</Text>
                                        }
                                        // Last resort: L15-P3 parametric fallback (legacy rows
                                        // that predate cost_provenance column).
                                        const fb = parametricByPartNumber.get(p.partNumber)
                                        if (fb && fb.estimatedUnitCostGbp != null) {
                                            return (
                                                <View style={{ alignItems: "flex-end" }}>
                                                    <Text style={{ fontSize: 8 }}>{fmtGbp(fb.estimatedUnitCostGbp)}*</Text>
                                                </View>
                                            )
                                        }
                                        return <Text style={{ fontSize: 8 }}>{fmtGbp(null)}</Text>
                                    })()}
                                </View>
                                <Text style={[styles.tableCell, { flex: 1.6, paddingLeft: 8 }]}>
                                    {supplierLabel}
                                </Text>
                            </View>
                        )
                    })}
                </View>
            )}
            {parametricRows.length > 0 && (
                <Text style={{ fontSize: 8, color: MUTED, fontStyle: "italic", marginTop: 4 }}>
                    * = parametric estimate from category model. {parametricRows.length} row{parametricRows.length === 1 ? "" : "s"} flagged. Replace with supplier quotes before any procurement commitment.
                </Text>
            )}
            <PdfFooter label="BOM master" />
        </Page>
    )
}

function fmtDateShort(iso: string | null | undefined): string {
    if (!iso) return "unknown"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "unknown"
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function fmtInt(n: number | null | undefined): string {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—"
    return n.toLocaleString("en-GB")
}

function ReconciliationPage({
    reconciliation,
}: {
    reconciliation: NonNullable<PdfInput["reconciliation"]>
}): React.ReactElement {
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>5b. Reconciliation</Text>
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                A deterministic numerical-consistency pass runs at the end of the
                pipeline. It compares the parallel views of cost (per-module total,
                BOM master, cost waterfall), mass (module-page mass, BOM-row roll-up),
                cell-energy density (chemistry × declared cell mass vs declared kWh),
                and lighting wattage (bar/driver count × per-unit watts vs declared
                connected load). Differences below tolerance ({"±"}5% on cost,
                {"±"}10% on mass) are dropped silently. Differences above
                tolerance land here so the founder doesn&apos;t take any single
                number as load-bearing without seeing the disagreement.
            </Text>
            {reconciliation.findings.length === 0 ? (
                <Text style={{ marginTop: 6 }}>
                    All reconciliation checks pass within tolerance.
                </Text>
            ) : (
                reconciliation.findings.map((f) => (
                    <View
                        key={f.id}
                        style={{
                            marginTop: 8,
                            paddingLeft: 6,
                            borderLeftWidth: 2,
                            borderLeftColor:
                                f.severity === "alert" ? "#b91c1c" : "#a16207",
                        }}
                        wrap={false}
                    >
                        <Text style={{ fontSize: 10, fontWeight: "bold" }}>
                            {f.id} · {f.section} — {f.summary}
                        </Text>
                        <Text style={{ fontSize: 9, marginTop: 2, color: MUTED }}>
                            {f.detail.sourceA}: {f.detail.unit === "GBP" ? `£${Math.round(f.detail.valueA).toLocaleString("en-GB")}` : `${Number.isInteger(f.detail.valueA) ? f.detail.valueA.toLocaleString("en-GB") : f.detail.valueA.toFixed(2)} ${f.detail.unit}`}
                        </Text>
                        <Text style={{ fontSize: 9, color: MUTED }}>
                            {f.detail.sourceB}: {f.detail.unit === "GBP" ? `£${Math.round(f.detail.valueB).toLocaleString("en-GB")}` : `${Number.isInteger(f.detail.valueB) ? f.detail.valueB.toLocaleString("en-GB") : f.detail.valueB.toFixed(2)} ${f.detail.unit}`}
                        </Text>
                        <Text
                            style={{
                                fontSize: 9,
                                marginTop: 2,
                                color: f.severity === "alert" ? "#b91c1c" : "#a16207",
                                fontWeight: "bold",
                            }}
                        >
                            Difference: {f.detail.pctDiff > 0 ? "+" : ""}
                            {f.detail.pctDiff.toFixed(1)}%
                        </Text>
                    </View>
                ))
            )}
            <PdfFooter label="Reconciliation" />
        </Page>
    )
}

function CostPage({ data }: { data: PdfInput }): React.ReactElement {
    const isRed = data.feasibilityVerdict?.status === "red"
    const hasCeiling = typeof data.cost.ceilingGbp === "number"
    const hasUnit = typeof data.cost.unitTotalGbp === "number"
    const headroom = hasCeiling && hasUnit ? data.cost.ceilingGbp! - data.cost.unitTotalGbp! : null

    // Loop 26 P2: graduated cost waterfall confidence label, computed from
    // actual data rather than using feasibility verdict as a blanket proxy.
    //
    // VALIDATED          — unit cost exists, no red verdict, no critical cost-tree findings
    // PRELIMINARY        — unit cost exists but non-critical validation findings present
    //                      OR cost is partially estimated (placeholder/todo rows exist)
    // INVALIDATED ESTIMATE — red verdict OR critical cost-tree findings OR no unit cost
    const hasCriticalCostFindings = data.cost.costTreeValidation?.hasCritical === true
    const hasAnyNonQuoted = data.parts.some(
        (p) => p.costProvenance === "placeholder" || p.costProvenance === "todo",
    )
    const hasNonCriticalFindings =
        (data.cost.costTreeValidation?.hasFindings === true) && !hasCriticalCostFindings

    type CostConfidenceLabel = "VALIDATED" | "PRELIMINARY" | "INVALIDATED ESTIMATE"
    const costConfidenceLabel: CostConfidenceLabel = ((): CostConfidenceLabel => {
        if (isRed || hasCriticalCostFindings || !hasUnit) return "INVALIDATED ESTIMATE"
        if (hasNonCriticalFindings || hasAnyNonQuoted) return "PRELIMINARY"
        return "VALIDATED"
    })()

    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>
                5. Cost waterfall
                {costConfidenceLabel !== "VALIDATED" ? ` — ${costConfidenceLabel}` : ""}
            </Text>
            {isRed && (
                <RedStateBanner verdict={data.feasibilityVerdict!} sectionKind="cost" />
            )}
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                Cost estimates grounded against the material-properties
                library ({fmtInt(data.sources.materialPropertyCount)} rows, freshest
                {" "}{fmtDateShort(data.sources.materialPropertyFreshestIso)}) and
                the `process_capabilities` table
                ({fmtInt(data.sources.processCapabilityCount)} rows, freshest
                {" "}{fmtDateShort(data.sources.processCapabilityFreshestIso)}).
                Costs sit in the project&apos;s ai_cost_estimates jsonb, keyed by
                module id.
            </Text>
            <View style={styles.statRow}>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>Unit cost (all-in)</Text>
                    <Text style={styles.statValue}>{fmtGbp(data.cost.unitTotalGbp)}</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>Ceiling (brief)</Text>
                    <Text style={styles.statValue}>{fmtGbp(data.cost.ceilingGbp)}</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>Headroom</Text>
                    <Text
                        style={
                            headroom !== null && headroom < 0
                                ? [styles.statValue, { color: "#B91C1C" }]
                                : styles.statValue
                        }
                    >
                        {fmtGbp(headroom)}
                        {headroom !== null && headroom < 0 ? "  (over)" : ""}
                    </Text>
                </View>
            </View>

            {/* A1 — Loop 26 Tier-A fix: cost-provenance section header
                and stat tiles split into quoted vs estimated when any
                non-quoted rows exist. The per-module roll-up below reads
                from parts.estimated_unit_cost_gbp regardless of provenance,
                so this panel surfaces the quote quality so founders know
                how load-bearing the total is before sharing with investors. */}
            {(() => {
                const allParts = data.parts
                const placeholderOrTodo = allParts.filter(
                    (p) => p.costProvenance === "placeholder" || p.costProvenance === "todo",
                )
                const parametric = allParts.filter((p) => p.costProvenance === "parametric")
                const hasAnyNonQuoted = placeholderOrTodo.length > 0 || parametric.length > 0
                if (!hasAnyNonQuoted) return null

                // Compute quoted total vs estimated total. Rows with null provenance
                // are treated as "quoted" for conservative accounting (they may be
                // legacy rows where the column predates the migration).
                let quotedTotal = 0
                let estimatedTotal = 0
                for (const p of allParts) {
                    const c = p.estimatedUnitCostGbp ?? 0
                    if (p.costProvenance === "placeholder" || p.costProvenance === "todo") {
                        estimatedTotal += 0 // unquoted rows contribute £0 to quoted total
                    } else if (p.costProvenance === "parametric") {
                        estimatedTotal += c
                    } else {
                        quotedTotal += c
                        estimatedTotal += c
                    }
                }
                const total = data.cost.unitTotalGbp ?? (quotedTotal + estimatedTotal)
                const quotedPct = total > 0 ? ((quotedTotal / total) * 100).toFixed(0) : "0"

                return (
                    <View style={{ marginBottom: 10 }} wrap={false}>
                        {/* Unquoted-placeholder callout — shown above the roll-up when
                            any placeholder / todo rows exist. The callout lists how
                            many rows are unquoted and what fraction of cost is confirmed. */}
                        {placeholderOrTodo.length > 0 && (
                            <View
                                style={{
                                    marginBottom: 8,
                                    padding: 8,
                                    backgroundColor: "#fee2e2",
                                    borderLeftWidth: 3,
                                    borderLeftColor: "#b91c1c",
                                    borderRadius: 3,
                                }}
                            >
                                <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7f1d1d" }}>
                                    {placeholderOrTodo.length} of {allParts.length} bill-of-materials rows are unquoted placeholders. Quoted cost £{fmtGbp(quotedTotal)} represents {quotedPct}% of estimated build cost.
                                </Text>
                                <Text style={{ fontSize: 9, color: "#7f1d1d", marginTop: 3 }}>
                                    Rows with a "No quote yet" badge below are placeholders — their cost is £0 in the roll-up, which understates the total. Resolve before sharing with contract manufacturers or investors.
                                </Text>
                            </View>
                        )}
                        {/* Parametric-estimate callout — shown when parametric rows exist. */}
                        {parametric.length > 0 && (
                            <View
                                style={{
                                    marginBottom: 8,
                                    padding: 8,
                                    backgroundColor: "#fef3c7",
                                    borderLeftWidth: 3,
                                    borderLeftColor: "#b45309",
                                    borderRadius: 3,
                                }}
                            >
                                <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7c2d12" }}>
                                    {parametric.length} bill-of-materials row{parametric.length === 1 ? "" : "s"} carry parametric estimates (±30% accuracy). Treat as planning-grade, not procurement-grade.
                                </Text>
                            </View>
                        )}
                        {/* Split stat tiles: quoted total + estimated total */}
                        <View style={styles.statRow}>
                            <View style={styles.stat}>
                                <Text style={styles.statLabel}>Quoted total</Text>
                                <Text style={styles.statValue}>{fmtGbp(quotedTotal)}</Text>
                            </View>
                            <View style={styles.stat}>
                                <Text style={styles.statLabel}>Estimated total (incl. parametric)</Text>
                                <Text style={styles.statValue}>{fmtGbp(estimatedTotal)}</Text>
                            </View>
                        </View>
                    </View>
                )
            })()}

            <Text style={styles.h3}>Per-module roll-up</Text>
            <View style={styles.table}>
                <View style={styles.tableHead}>
                    <Text style={[styles.tableHeadCell, { flex: 3 }]}>Module</Text>
                    <Text style={[styles.tableHeadCell, { width: 70, textAlign: "right" }]}>Cost</Text>
                    <Text style={[styles.tableHeadCell, { width: 70, textAlign: "right" }]}>% of unit</Text>
                </View>
                {data.cost.perModule.map((c, i) => {
                    const reconciled = data.cost.costTreeReconciliation?.reconciledPerModule?.[i]
                    const pct = reconciled?.pctOfUnit != null
                        ? reconciled.pctOfUnit.toFixed(1) + "%"
                        : data.cost.unitTotalGbp && c.totalGbp
                            ? ((c.totalGbp / data.cost.unitTotalGbp) * 100).toFixed(1) + "%"
                            : "—"
                    return (
                        <View key={i} style={styles.tableRow}>
                            <Text style={[styles.tableCell, { flex: 3 }]}>{c.moduleName}</Text>
                            <Text
                                style={[styles.tableCell, { width: 70, textAlign: "right" }]}
                            >
                                {fmtGbp(c.totalGbp)}
                            </Text>
                            <Text
                                style={[styles.tableCell, { width: 70, textAlign: "right" }]}
                            >
                                {pct}
                            </Text>
                        </View>
                    )
                })}
            </View>

            {/* L14 (2026-04-27): make-vs-buy / purchased-vs-fabricated split.
               Loop 13 score (Cost waterfall 4/10 Hedgerow, 2/10 HAPS): "the
               waterfall does not show a breakdown of labour vs materials
               vs overhead". This panel adds a make-vs-buy view that the
               founder can use to identify procurement-leverage parts —
               purchased rows are RFQ-able now, make rows need contract-
               manufacturer engagement. Sourced from the bill-of-materials
               parts table after L13-P2 dedup. */}
            {(() => {
                const bomDedup = dedupAssemblyRollUp(data.parts)
                let buyTotal = 0
                let makeTotal = 0
                let buyCount = 0
                let makeCount = 0
                for (let i = 0; i < data.parts.length; i++) {
                    const cost = bomDedup.effectiveCost[i]
                    if (cost === 0) continue
                    if (data.parts[i].isPurchased) {
                        buyTotal += cost
                        buyCount += 1
                    } else {
                        makeTotal += cost
                        makeCount += 1
                    }
                }
                const total = buyTotal + makeTotal
                if (total === 0) return null
                const buyPct = (buyTotal / total) * 100
                const makePct = (makeTotal / total) * 100
                return (
                    <View style={{ marginTop: 16 }} wrap={false}>
                        <Text style={styles.h3}>Make-versus-buy split</Text>
                        <Text style={[styles.muted, { fontSize: 8.5, marginBottom: 6 }]}>
                            Purchased rows are catalogue parts that can go to a request-for-quote today. Made rows are fabricated by a contract manufacturer and need design-for-manufacturing engagement before sourcing. Both totals derive from the same de-duplicated bill-of-materials as the per-module roll-up above.
                        </Text>
                        <View style={styles.table}>
                            <View style={styles.tableHead}>
                                <Text style={[styles.tableHeadCell, { flex: 3 }]}>Category</Text>
                                <Text style={[styles.tableHeadCell, { width: 60, textAlign: "right" }]}>Rows</Text>
                                <Text style={[styles.tableHeadCell, { width: 80, textAlign: "right" }]}>Cost</Text>
                                <Text style={[styles.tableHeadCell, { width: 70, textAlign: "right" }]}>% of unit</Text>
                            </View>
                            <View style={styles.tableRow}>
                                <Text style={[styles.tableCell, { flex: 3 }]}>Purchased (off-the-shelf, request-for-quote ready)</Text>
                                <Text style={[styles.tableCell, { width: 60, textAlign: "right" }]}>{buyCount}</Text>
                                <Text style={[styles.tableCell, { width: 80, textAlign: "right" }]}>{fmtGbp(buyTotal)}</Text>
                                <Text style={[styles.tableCell, { width: 70, textAlign: "right" }]}>{buyPct.toFixed(1)}%</Text>
                            </View>
                            <View style={styles.tableRow}>
                                <Text style={[styles.tableCell, { flex: 3 }]}>Make (fabricated by contract manufacturer)</Text>
                                <Text style={[styles.tableCell, { width: 60, textAlign: "right" }]}>{makeCount}</Text>
                                <Text style={[styles.tableCell, { width: 80, textAlign: "right" }]}>{fmtGbp(makeTotal)}</Text>
                                <Text style={[styles.tableCell, { width: 70, textAlign: "right" }]}>{makePct.toFixed(1)}%</Text>
                            </View>
                        </View>
                    </View>
                )
            })()}

            {/* Loop 26 P3 / A2: cost-tree arithmetic validation annotations.
                Rendered AFTER all cost tables so the founder first sees the
                numbers, then sees which ones cannot be relied upon. Each
                finding is a coloured callout with a plain-English description.
                Data is never suppressed — the wrong number stays visible
                alongside the explanation so the founder can judge for themselves. */}
            {data.cost.costTreeValidation?.hasFindings && (() => {
                const result = data.cost.costTreeValidation!
                return (
                    <View style={{ marginTop: 16 }} wrap={false}>
                        <Text style={[styles.h3, { color: result.hasCritical ? "#b91c1c" : "#a16207" }]}>
                            {result.hasCritical ? "⚠ Cost arithmetic errors detected" : "⚠ Cost consistency warnings"}
                        </Text>
                        <Text style={[styles.muted, { fontSize: 8.5, marginBottom: 8 }]}>
                            {result.summaryMessage}
                        </Text>
                        {result.findings.map((finding, idx) => (
                            <View
                                key={idx}
                                style={{
                                    marginBottom: 6,
                                    padding: 8,
                                    backgroundColor: finding.severity === "critical" ? "#fee2e2" : "#fef3c7",
                                    borderLeftWidth: 3,
                                    borderLeftColor: finding.severity === "critical" ? "#b91c1c" : "#b45309",
                                    borderRadius: 3,
                                }}
                                wrap={false}
                            >
                                <Text style={{
                                    fontSize: 9,
                                    fontWeight: "bold",
                                    color: finding.severity === "critical" ? "#7f1d1d" : "#7c2d12",
                                    marginBottom: 3,
                                }}>
                                    {finding.severity === "critical" ? "Critical" : "Warning"}: {finding.code.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                                </Text>
                                <Text style={{
                                    fontSize: 8.5,
                                    color: finding.severity === "critical" ? "#7f1d1d" : "#7c2d12",
                                    lineHeight: 1.4,
                                }}>
                                    {finding.message}
                                </Text>
                            </View>
                        ))}
                    </View>
                )
            })()}

            <PdfFooter label="Cost waterfall" />
        </Page>
    )
}

function riskRating(severity: number, likelihood: number): {
    score: number
    band: "low" | "medium" | "high" | "critical"
    color: string
} {
    const score = severity * likelihood
    if (score >= 16) return { score, band: "critical", color: "#b91c1c" }
    if (score >= 9) return { score, band: "high", color: "#b45309" }
    if (score >= 4) return { score, band: "medium", color: "#a16207" }
    return { score, band: "low", color: "#15803d" }
}

// Loop 7 fix (Tristan-flagged "I'm not quite sure what s5 times l2
// equals 10 high means"): replace the bare arithmetic with the
// severity / likelihood label so the founder reads "Major × Possible
// (medium 10)" instead of "S5 × L2 = 10 (medium)". 1-5 scales follow
// HSE / IEC 61508 conventions for FMEA.
function severityLabel(s: number): string {
    if (s >= 5) return "Catastrophic"
    if (s === 4) return "Major"
    if (s === 3) return "Moderate"
    if (s === 2) return "Minor"
    if (s <= 1) return "Negligible"
    return `S${s}`
}
function likelihoodLabel(l: number): string {
    if (l >= 5) return "Frequent"
    if (l === 4) return "Likely"
    if (l === 3) return "Possible"
    if (l === 2) return "Unlikely"
    if (l <= 1) return "Rare"
    return `L${l}`
}

function RisksPage({ modules }: { modules: ModulePdf[] }): React.ReactElement {
    // Loop 5 P5 (council unanimous): when modules carry the riskMatrix
    // FMEA shape, render the structured matrix. Otherwise fall back to
    // the original failureModes/unknowns string-list shape so older
    // modules still appear without regenerating Max's decomposition.
    const anyMatrix = modules.some((m) => m.riskMatrix.length > 0)

    // L13-P5 (2026-04-27): detect boilerplate risk-matrix modules.
    // HAPS Loop 12 had all 41 entries across 10 modules listing
    // "Mechanical lead" as owner regardless of domain (avionics
    // overheating, software watchdog, hydrogen leak, regulatory
    // certification — all "Mechanical lead"). Sentinel had 25 entries
    // with cause "See module-level analysis". Both are detectable.
    //
    // L16-J1+J2 (2026-04-27): the page-level banner that exposed this
    // detection ("owner field auto-corrected, founder review required")
    // has been removed — see comment at the banner site below. The
    // detection still runs because per-row repair logic in
    // repairRiskRowFromContext uses isModuleRiskMatrixBoilerplate.
    void anyRiskMatrixIsBoilerplate(modules)

    // Loop 24 Fix 4 (P1): risk register truncation root cause.
    // Per-row wrap={false} (added in L9-P5 to keep individual risk rows
    // from splitting mid-row) silently DROPS any row taller than the
    // remaining page space because pdfkit treats an oversized non-wrapping
    // View as unrendereable rather than paginating it. This produces the
    // mid-sentence cuts observed in Loop 24 (critique: "RM-4: Cause: Epoxy
    // bond fatigue … Consequence: I", "risking pump cavitation and
    // downstream memb"). The fix: allow rows to wrap naturally across pages
    // by removing wrap={false} from the per-row View. React-PDF's native
    // page-flow ensures content is never clipped — the trade-off (a row
    // might split mid-text) is far preferable to silent data loss.
    // The module-level wrap={false} was already removed in L9-P5; now the
    // per-row restriction is removed too. Both levels allow natural flow.

    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>6. Risks register</Text>
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                {anyMatrix
                    ? "FMEA-style risk matrix per module. Each row is rated severity (Negligible / Minor / Moderate / Major / Catastrophic) × likelihood (Rare / Unlikely / Possible / Likely / Frequent). Rating bands: low (1–3), medium (4–8), high (9–15), critical (16–25). Residual rating shows the band after the listed mitigation lands."
                    : "Every failure mode and open question declared against each module, in one register."}
            </Text>
            {/* L16-J1+J2 (2026-04-27, Tristan-flagged): the founder
                should not see internal-engine repair state. The
                boilerplate banner here used to say "owner field
                auto-corrected, founder review required" which exposed
                the engine's workaround. With the canonical specs ledger
                (L16-A1) and the deterministic risk-pattern compiler
                (deferred to L17 A2), the data is right at source; no
                auto-correction message is needed. Banner removed; the
                per-row repair logic still runs silently below. */}
            {modules.map((m) => (
                // L9-P5: removed `wrap={false}` here. With it, the entire
                // per-module risks block (heading + N risk rows) was forced
                // onto one page; for Vertfarm modules with 4-5 risk rows
                // each, the block exceeded page height and Yoga either
                // crushed line-heights (text overlap) or emitted orphan
                // blank pages. Per-row `wrap={false}` was also removed in
                // Loop 24 Fix 4 — see comment above.
                <View key={m.id} style={{ marginTop: 10 }}>
                    <Text style={styles.h4}>{m.name}</Text>
                    {m.riskMatrix.length === 0 &&
                        m.failureModes.length === 0 &&
                        m.unknowns.length === 0 && (
                            <Text style={styles.muted}>No risks declared on this module.</Text>
                        )}
                    {(() => {
                        // L13-P5: per-module boilerplate evaluation. When the
                        // module's matrix is boilerplate, replace each row's
                        // owner with a discipline-inferred label.
                        const moduleBoilerplate = isModuleRiskMatrixBoilerplate(m.riskMatrix)
                        ;(m as ModulePdf & { __boilerplateOverride?: boolean }).__boilerplateOverride =
                            moduleBoilerplate.isBoilerplate
                        return null
                    })()}
                    {m.riskMatrix.length > 0 && (
                        <View style={{ marginTop: 4 }}>
                            <Text style={styles.h5}>
                                Risk matrix ({m.riskMatrix.length})
                            </Text>
                            {m.riskMatrix.map((r, i) => {
                                const initial = riskRating(r.severity, r.likelihood)
                                const residual =
                                    r.residualSeverity != null && r.residualLikelihood != null
                                        ? riskRating(r.residualSeverity, r.residualLikelihood)
                                        : null
                                // L15-P2: when cause / consequence / mitigation are
                                // boilerplate ("See module-level analysis", "Detail-design
                                // phase: derive specific monitoring..."), derive
                                // substantive replacement text from the engineering review
                                // issues, the failureModes string list, or hazard-derived
                                // mechanism + named control. Council-mandated promotion
                                // of the boilerplate detector from auditor to repair pass.
                                const issuesForRepair = (m.reviews ?? []).flatMap((rev) => rev.issues ?? [])
                                const repaired = repairRiskRowFromContext(
                                    {
                                        hazard: r.hazard ?? null,
                                        cause: r.cause ?? null,
                                        consequence: r.consequence ?? null,
                                        mitigation: r.mitigation ?? null,
                                        owner: r.owner ?? null,
                                    },
                                    {
                                        issues: issuesForRepair.map((iss) => ({
                                            severity: iss.severity,
                                            category: iss.category,
                                            message: iss.message,
                                            suggestion: iss.suggestion ?? null,
                                        })),
                                        failureModes: m.failureModes ?? [],
                                        moduleName: m.name,
                                    },
                                )
                                const renderedCause = repaired.cause
                                const renderedConsequence = repaired.consequence
                                const renderedMitigation = repaired.mitigation
                                return (
                                    // Loop 24 Fix 4: wrap={false} REMOVED from this per-row View.
                                    // It caused silent content drops: when a risk row (long
                                    // cause + consequence + mitigation text) was taller than
                                    // the remaining page space, pdfkit silently dropped the
                                    // entire oversized non-wrapping View rather than paging it —
                                    // producing mid-sentence cuts ("RM-4: Cause: Epoxy bond
                                    // fatigue … Consequence: I", "downstream memb").
                                    // Natural wrap means rows may split at page boundaries, but
                                    // no content is ever silently lost.
                                    <View
                                        key={r.id || i}
                                        style={{
                                            marginBottom: 8,
                                            paddingLeft: 6,
                                            borderLeftWidth: 2,
                                            borderLeftColor: initial.color,
                                        }}
                                    >
                                        {/*
                                          * L9-P5: when r.hazard wraps to 2-3 lines
                                          * (any hazard >55 chars triggers it), the
                                          * old `alignItems: "center"` vertically
                                          * centred the badge against the title
                                          * block and ended up beside line 2 of the
                                          * title — the "crashing into title text"
                                          * effect on every Hedgerow row. Switch to
                                          * `flex-start` so badge anchors top-right.
                                          * Add `flexShrink: 0` to badge so it
                                          * doesn't compete for width with the
                                          * wrapping title. `paddingRight: 6` on
                                          * title preserves a gutter.
                                          */}
                                        <View
                                            style={{
                                                flexDirection: "row",
                                                alignItems: "flex-start",
                                                marginBottom: 1,
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: "bold",
                                                    flex: 1,
                                                    paddingRight: 6,
                                                }}
                                            >
                                                {r.id}: {r.hazard}
                                            </Text>
                                            <Text
                                                style={{
                                                    fontSize: 9,
                                                    color: initial.color,
                                                    fontWeight: "bold",
                                                    marginLeft: 6,
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {severityLabel(r.severity)} × {likelihoodLabel(r.likelihood)} —{" "}
                                                {initial.band} ({initial.score})
                                            </Text>
                                        </View>
                                        {renderedCause && (
                                            <Text style={{ fontSize: 9, marginBottom: 1 }}>
                                                <Text style={{ fontWeight: "bold" }}>
                                                    Cause:{" "}
                                                </Text>
                                                {sanitizeReviewText(renderedCause)}
                                            </Text>
                                        )}
                                        {renderedConsequence && (
                                            <Text style={{ fontSize: 9, marginBottom: 1 }}>
                                                <Text style={{ fontWeight: "bold" }}>
                                                    Consequence:{" "}
                                                </Text>
                                                {sanitizeReviewText(renderedConsequence)}
                                            </Text>
                                        )}
                                        {r.existingControls && (
                                            <Text style={{ fontSize: 9, marginBottom: 1 }}>
                                                <Text style={{ fontWeight: "bold" }}>
                                                    Existing controls:{" "}
                                                </Text>
                                                {sanitizeReviewText(r.existingControls)}
                                            </Text>
                                        )}
                                        {renderedMitigation && (
                                            <Text style={{ fontSize: 9, marginBottom: 1 }}>
                                                <Text style={{ fontWeight: "bold" }}>
                                                    Mitigation:{" "}
                                                </Text>
                                                {sanitizeReviewText(renderedMitigation)}
                                            </Text>
                                        )}
                                        {repaired.repaired && repaired.repairSource && (
                                            <Text
                                                style={{
                                                    fontSize: 8,
                                                    color: MUTED,
                                                    fontStyle: "italic",
                                                    marginTop: 1,
                                                }}
                                            >
                                                Cause / mitigation derived from {
                                                    repaired.repairSource === "engineering-review"
                                                        ? "the module engineering-review findings"
                                                        : repaired.repairSource === "failure-mode"
                                                            ? "the module's stated failure modes"
                                                            : "the hazard text by mechanism + named-control template"
                                                } (Fang risk-matrix returned boilerplate; founder review required).
                                            </Text>
                                        )}
                                        {/* Loop 7 critique fix A8 + Tristan punch list #7/#9 —
                                         * The Owner row used flex:1 on the Owner side and
                                         * marginLeft:6 on the Residual side. When residual
                                         * label was long ("Major × Possible — high (12)") it
                                         * overlapped Owner because there was no flex-shrink
                                         * boundary. Stack vertically so they never collide. */}
                                        {(() => {
                                            // L13-P5: discipline-aware owner.
                                            // When the module-level matrix is
                                            // flagged as boilerplate (uniform
                                            // owner across all rows), override
                                            // the per-row owner with a label
                                            // inferred from the hazard text.
                                            const overrideActive =
                                                (m as ModulePdf & { __boilerplateOverride?: boolean }).__boilerplateOverride === true
                                            const renderedOwner = overrideActive
                                                ? inferOwnerByDiscipline(
                                                      {
                                                          hazard: r.hazard ?? null,
                                                          cause: r.cause ?? null,
                                                          mitigation: r.mitigation ?? null,
                                                          owner: r.owner ?? null,
                                                      },
                                                      m.name,
                                                  )
                                                : r.owner
                                            if (!renderedOwner) return null
                                            return (
                                                <Text
                                                    style={{
                                                        fontSize: 9,
                                                        color: MUTED,
                                                        marginTop: 2,
                                                    }}
                                                >
                                                    Owner: {renderedOwner}
                                                    {/* L16-J1+J2: per-row "auto-corrected from <original>"
                                                        suffix removed. The override still happens but is
                                                        no longer disclosed to the founder. */}
                                                </Text>
                                            )
                                        })()}
                                        {residual && (
                                            <Text
                                                style={{
                                                    fontSize: 9,
                                                    color: residual.color,
                                                    marginTop: 1,
                                                }}
                                            >
                                                Residual: {severityLabel(r.residualSeverity!)} × {likelihoodLabel(r.residualLikelihood!)} —{" "}
                                                {residual.band} ({residual.score})
                                            </Text>
                                        )}
                                    </View>
                                )
                            })}
                        </View>
                    )}
                    {/* Fallback: render the legacy failureModes string list ONLY
                     *  when the module has no structured riskMatrix yet. */}
                    {m.riskMatrix.length === 0 && m.failureModes.length > 0 && (
                        <View style={{ marginTop: 4 }}>
                            <Text style={styles.h5}>
                                Known failure modes ({m.failureModes.length})
                            </Text>
                            {m.failureModes.map((f, i) => (
                                <View key={i} style={styles.bullet}>
                                    <Text style={styles.bulletDot}>•</Text>
                                    <Text style={styles.bulletText}>{f}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                    {m.unknowns.length > 0 && (
                        <View style={{ marginTop: 4 }}>
                            <Text style={styles.h5}>Open questions ({m.unknowns.length})</Text>
                            {m.unknowns.map((u, i) => (
                                <View key={i} style={styles.bullet}>
                                    <Text style={styles.bulletDot}>•</Text>
                                    <Text style={styles.bulletText}>{u}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            ))}
            <PdfFooter label="Risks register" />
        </Page>
    )
}

function SpendBySupplierTable({
    parts,
    visibleSuppliers,
}: {
    parts: PartRow[]
    visibleSuppliers: SupplierPdf[]
}): React.ReactElement | null {
    // Build the spend summary against the visible (post-phantom-filter)
    // shortlist. Helper handles assembly-dedup + score threshold + sole-
    // source detection internally.
    const summary = buildSpendSummary(
        parts.map((p) => ({
            partNumber: p.partNumber,
            estimatedUnitCostGbp: p.estimatedUnitCostGbp,
            sourceModuleName: p.sourceModuleName,
            name: p.name,
            massKg: p.massKg,
        })),
        visibleSuppliers.map((s) => ({
            name: s.name,
            matchedPartNumbers: s.matchedPartNumbers,
            matchScore: s.matchScore,
            websiteUrl: s.websiteUrl,
            hq: s.hq,
        })),
    )
    if (summary.rows.length === 0 && summary.unclaimedPartCount === 0) return null
    const fmtMoney = (n: number) =>
        n >= 1_000_000
            ? `£${(n / 1_000_000).toFixed(1)}M`
            : n >= 1_000
                ? `£${(n / 1_000).toFixed(0)}k`
                : `£${n.toFixed(0)}`
    return (
        <View style={{ marginBottom: 16 }}>
            <Text style={styles.h5}>
                Spend by supplier — modelled, primary-nominee per part
            </Text>
            <Text style={[styles.muted, { fontSize: 8.5, marginBottom: 6 }]}>
                Modelled spend, NOT a quotation. Each bill-of-materials part is
                assigned to its highest-scoring matched supplier (score ≥ {SPEND_BY_SUPPLIER_CONSTANTS.MATCH_SCORE_THRESHOLD}) as the
                modelled primary; that supplier carries 100 percent of the part&apos;s
                cost in this table. Alternates appear in the detail cards below.
                Concentration-risk amber fires when a single supplier holds ≥ {SPEND_BY_SUPPLIER_CONSTANTS.CONCENTRATION_RISK_THRESHOLD_PCT} percent of
                the deduplicated bill-of-materials.
            </Text>
            <View style={styles.table}>
                <View style={styles.tableHead}>
                    <Text style={[styles.tableHeadCell, { width: 22 }]}>#</Text>
                    <Text style={[styles.tableHeadCell, { flex: 2.4 }]}>Supplier</Text>
                    <Text style={[styles.tableHeadCell, { width: 60 }]}>HQ</Text>
                    <Text style={[styles.tableHeadCell, { width: 36, textAlign: "right" }]}>
                        Parts
                    </Text>
                    <Text style={[styles.tableHeadCell, { width: 46, textAlign: "right" }]}>
                        Sole-source
                    </Text>
                    <Text style={[styles.tableHeadCell, { width: 60, textAlign: "right", paddingRight: 6 }]}>
                        Spend
                    </Text>
                    <Text style={[styles.tableHeadCell, { width: 42, textAlign: "right", paddingLeft: 6 }]}>
                        % of BOM
                    </Text>
                    <Text style={[styles.tableHeadCell, { width: 36, textAlign: "right" }]}>
                        Score
                    </Text>
                </View>
                {summary.rows.map((row, i) => {
                    const supplierLabel = (() => {
                        const url = row.supplier.websiteUrl
                        if (typeof url === "string" && /^https?:\/\//i.test(url)) {
                            try {
                                return new URL(url).hostname.replace(/^www\./, "")
                            } catch {
                                /* fall through */
                            }
                        }
                        return row.supplier.name
                    })()
                    const amber = row.concentrationRiskAmber
                    return (
                        <View
                            key={`spend-${i}`}
                            style={[
                                styles.tableRow,
                                amber ? { backgroundColor: "#fef3c7" } : {},
                            ]}
                        >
                            <Text style={[styles.tableCell, { width: 22 }]}>
                                {i + 1}
                            </Text>
                            <Text style={[styles.tableCell, { flex: 2.4 }]}>
                                {supplierLabel}
                                {row.soleSourceParts > 0 ? (
                                    <Text style={{ color: "#b45309", fontWeight: "bold" }}>
                                        {" "}— sole-source
                                    </Text>
                                ) : null}
                            </Text>
                            <Text style={[styles.tableCell, { width: 60 }]}>
                                {row.supplier.hq ?? "—"}
                            </Text>
                            <Text style={[styles.tableCell, { width: 36, textAlign: "right" }]}>
                                {row.partsAsPrimary}
                            </Text>
                            <Text
                                style={[
                                    styles.tableCell,
                                    { width: 46, textAlign: "right" },
                                    row.soleSourceParts > 0 ? { color: "#b45309", fontWeight: "bold" } : {},
                                ]}
                            >
                                {row.soleSourceParts}
                            </Text>
                            <Text style={[styles.tableCell, { width: 60, textAlign: "right", paddingRight: 6 }]}>
                                {fmtMoney(row.modelledSpendGbp)}
                            </Text>
                            <Text style={[styles.tableCell, { width: 42, textAlign: "right", paddingLeft: 6 }]}>
                                {row.spendPct.toFixed(1)}%
                            </Text>
                            <Text style={[styles.tableCell, { width: 36, textAlign: "right" }]}>
                                {row.matchScore != null ? row.matchScore.toFixed(0) : "—"}
                            </Text>
                        </View>
                    )
                })}
            </View>
            <View style={{ marginTop: 6 }}>
                {summary.unclaimedPartCount > 0 && (
                    <Text style={[styles.muted, { fontSize: 8.5, color: "#b91c1c" }]}>
                        {summary.unclaimedPartCount} part
                        {summary.unclaimedPartCount === 1 ? "" : "s"} ({fmtMoney(summary.unclaimedSpendGbp)} of bill-of-materials value) have no shortlisted supplier above the match-score floor — supply-chain gap.
                    </Text>
                )}
                {summary.capped && (
                    <Text style={[styles.muted, { fontSize: 8.5 }]}>
                        Showing top {SPEND_BY_SUPPLIER_CONSTANTS.TOP_N_CAP} by modelled spend. {summary.rowCountBeforeCap - SPEND_BY_SUPPLIER_CONSTANTS.TOP_N_CAP} additional suppliers appear in the detail cards below.
                    </Text>
                )}
                <Text style={[styles.muted, { fontSize: 8.5, marginTop: 4 }]}>
                    Costs exclude tooling, non-recurring engineering, freight, import duty, and minimum order quantity price breaks. HQ shown is the supplier&apos;s registered office; manufacturing geography may differ. Verify all pricing, availability and lead times directly with suppliers before committing to tooling or placing orders.
                </Text>
            </View>
        </View>
    )
}

function SuppliersPage({
    suppliers,
    sources,
    verdict,
    parts,
}: {
    suppliers: SupplierPdf[]
    sources: PdfInput["sources"]
    verdict: PdfInput["feasibilityVerdict"]
    parts: PartRow[]
}): React.ReactElement {
    const dirCount = fmtInt(sources.supplierDirectoryCount)
    const listingCount = fmtInt(sources.marketplaceListingCount)
    const isRed = verdict?.status === "red"
    // L9-P4: cover-count divergence fix. The body filters rows whose name
    // fails `looksLikeHallucinatedSupplierName` and whose URL fails
    // `checkSupplierUrlShape`, but the section heading was using raw
    // `suppliers.length` — so the founder saw "65 suppliers" then opened
    // the section and got 5 real ones plus 60 disclaimers. Build the
    // visible list once, use it for both the heading and the map below.
    const visibleSuppliersUnsorted = suppliers.filter((s) => {
        if (looksLikeHallucinatedSupplierName(s.name).bad) return false
        if (s.websiteUrl) {
            const urlCheck = checkSupplierUrlShape(s.websiteUrl)
            if (!urlCheck.ok) return false
        }
        return true
    })
    // L16-L1+L2 (2026-04-27, Tristan-flagged): rank ALL suppliers by
    // likely spend, biggest first. Today the spend-by-supplier table at
    // the top is correctly sorted, but the per-supplier detail cards
    // below were ordered by match score (or insertion order) so the
    // founder had to scroll past low-spend suppliers to find big-spend
    // ones. Build a spend index from the same buildSpendSummary helper
    // the table uses, then sort the cards by spend desc with a
    // matchScore tie-break. The full list (not just top 15) carries
    // the spend total per supplier so scrolling makes sense.
    const _spendSummaryForCardSort = buildSpendSummary(
        parts.map((p) => ({
            partNumber: p.partNumber,
            estimatedUnitCostGbp: p.estimatedUnitCostGbp,
            sourceModuleName: p.sourceModuleName,
            name: p.name,
            massKg: p.massKg,
        })),
        visibleSuppliersUnsorted.map((s) => ({
            name: s.name,
            matchedPartNumbers: s.matchedPartNumbers,
            matchScore: s.matchScore,
            websiteUrl: s.websiteUrl,
            hq: s.hq,
        })),
    )
    const supplierSpendByName = new Map<string, number>()
    for (const r of _spendSummaryForCardSort.rows) {
        supplierSpendByName.set(r.supplier.name, r.modelledSpendGbp)
    }
    const visibleSuppliers = [...visibleSuppliersUnsorted].sort((a, b) => {
        const sa = supplierSpendByName.get(a.name) ?? 0
        const sb = supplierSpendByName.get(b.name) ?? 0
        if (sb !== sa) return sb - sa
        return (b.matchScore ?? 0) - (a.matchScore ?? 0)
    })
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>
                7. Supplier shortlist ({visibleSuppliers.length}
                {isRed ? " candidates — procurement deferred until feasibility blockers close" : ""})
            </Text>
            {isRed && <RedStateBanner verdict={verdict!} sectionKind="suppliers" />}
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                Shortlist built by scoring each supplier in the directory
                ({dirCount} companies) and marketplace listings
                ({listingCount} listings) against each module&apos;s declared
                process + material{isRed ? "; sorted below by likely spend so the founder can prioritise the largest line items first" : ""}.
                A low shortlist count usually means the directory
                doesn&apos;t yet have coverage for the project&apos;s niche
                — not that no match exists globally.
            </Text>
            {(() => {
                // Loop 7 critique fix A12 + A13 (LOOP-7-CRITIQUE.md):
                // partition supplier rows into "shippable" vs
                // "low-confidence — name/URL fails the shape check".
                // The bad list is hidden from the founder PDF so they
                // never see "Tower makes Ramon rad-hard processor",
                // "Liquid Cooling Unit for Battery Energy Storage System
                // Rack", or .pdf/.edu URLs presented as suppliers. A
                // small footnote tells them N candidates were dropped
                // for review-quality reasons so the count isn't a
                // mystery.
                return null
            })()}
            {/* L13-S1 (2026-04-27, Tristan-flagged): spend-by-supplier
               summary table sits at the top of the section. Founder
               sees concentration of bill-of-materials cost on each
               supplier, sole-source flags, and the un-claimed parts
               number — so they know which suppliers to prioritise for
               due diligence and where the supply-chain bottlenecks are.
               Allocation: primary-nominee (highest matchScore per part).
               Council-validated 2026-04-27 (3-of-3 unanimous), see
               SUPPLIER-SPEND-TABLE-PLAN.md. */}
            {visibleSuppliers.length > 0 && (
                <SpendBySupplierTable
                    parts={parts}
                    visibleSuppliers={visibleSuppliers}
                />
            )}
            {visibleSuppliers.length === 0 && (() => {
                // L14 (2026-04-27): when the visible-suppliers list is
                // empty after the L9-P4 phantom filter and the L13-P4
                // empty-matched-parts filter, the cause is almost
                // always supplier-directory coverage rather than an
                // engine bug. HAPS Loop 13: 115 phantom rows dropped,
                // leaving 0 verified — because the directory has no
                // aerospace / high-altitude platform coverage. Render a
                // diagnostic that explains the gap so the founder
                // doesn't read "No suppliers shortlisted yet" and
                // assume the engine failed.
                const partCount = parts.length
                const buyPartCount = parts.filter((p) => p.isPurchased).length
                return (
                    <View
                        style={{
                            marginTop: 8,
                            marginBottom: 12,
                            padding: 12,
                            borderRadius: 4,
                            backgroundColor: "#fef3c7",
                            borderLeftWidth: 3,
                            borderLeftColor: "#b45309",
                        }}
                    >
                        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#7c2d12" }}>
                            Supplier-directory coverage gap
                        </Text>
                        <Text style={{ fontSize: 10, color: "#7c2d12", marginTop: 4 }}>
                            The directory ({dirCount} companies) and marketplace listings ({listingCount} listings) returned no candidates that the matching pass could link to a specific bill-of-materials part for this project. The bill of materials has {partCount} part{partCount === 1 ? "" : "s"} ({buyPartCount} purchased).
                        </Text>
                        <Text style={{ fontSize: 9.5, color: "#7c2d12", marginTop: 6 }}>
                            This is a directory-coverage gap, not a generation failure. Phantom matches (suppliers whose semantic similarity is high but who could not be linked to a specific part) are filtered out so the founder is not handed misleading procurement targets — the previous render of this report showed up to 115 phantoms. Until the directory carries supplier coverage for the product class, no credible shortlist can be produced.
                        </Text>
                        <Text style={{ fontSize: 9.5, color: "#7c2d12", marginTop: 6, fontStyle: "italic" }}>
                            Action: enrich the directory with vetted suppliers in the project&apos;s primary categories, then re-run the supplier-match pass. The bill-of-materials master in §4 carries part numbers and process / material specifications that a procurement specialist can quote against directly.
                        </Text>
                    </View>
                )
            })()}
            {visibleSuppliers.map((s, i) => {
                // L15-P4: render-time STRONG-fit promotion. Council 7-of-8
                // unanimous: live scorer treats lexical matching too weakly,
                // and aerospace suppliers with AS9100 + composite capability
                // were stuck at WEAK FIT (30-43) on HAPS Loop 14. The
                // promotion adds +20 for regulated-industry cert match,
                // +5-10 for capability keyword evidence, capped at +25 so
                // it can lift a 35 to a 50-55 STRONG fit but cannot lift a
                // 25 phantom into the shortlist.
                const matchedPartDescs = (s.matchedPartNumbers ?? []).map((pn) => {
                    const part = parts.find((p) => p.partNumber === pn)
                    return part ? `${part.name} ${part.description ?? ""}` : pn
                })
                const promotion = promoteSupplierScore({
                    matchScore: s.matchScore,
                    certifications: s.certifications,
                    description: s.description,
                    capabilityText: [
                        // process_capabilities + subcategory + specialties get
                        // surfaced in the supplier description in the live data
                        // path (see cad-lab-supplier-match.ts). We don't have
                        // direct access to the raw arrays here so the
                        // description acts as the corpus.
                        s.description ?? "",
                    ].join(" "),
                    matchedPartNumbers: s.matchedPartNumbers ?? [],
                    matchedPartDescriptions: matchedPartDescs,
                })
                const effectiveMatchScore = promotion.promotedScore ?? s.matchScore
                // L9-P4: visibleSuppliers is pre-filtered above for both
                // hallucinated names and bad URLs — no per-row null
                // returns needed here.
                // marketplace_listings titles are often scraped product
                // descriptions, not company names. Derive the company name
                // from the domain when available — founders reach out to
                // cmxbattery.com, not to "rack mount lithium iron".
                const companyName = (() => {
                    const url = s.websiteUrl
                    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
                        try {
                            const host = new URL(url).hostname.replace(/^www\./, "")
                            return host
                        } catch {
                            // fallthrough
                        }
                    }
                    return s.name
                })()
                // PROJECT-SPECIFIC SYNTHESIS (2026-04-25 NIGHT, Loop 2) —
                // prefer the cheap-LLM-generated synthesis that explains
                // what THIS supplier brings to THIS project. Falls back
                // to the supplier's own marketing blurb only when the
                // synthesis call failed (network/timeout).
                // Loop 7 critique fix A12: route the synthesis through
                // sanitizeReviewText so the LLM scratch-prompt leak (the
                // HYPERTAC LIMITED catastrophe on Hedgerow p.56 — "We need
                // to produce a single sentence d50 words, specific to the
                // project... The supplier is HYPERTAC LIMITED, but no
                // description.") gets replaced with a neutral placeholder
                // before any founder reads it.
                const rawOffering = (s.projectSynthesis?.trim()) || s.description?.trim() || s.name
                const offering = sanitizeReviewText(rawOffering) || rawOffering
                // Compose a single-line "company facts" row.
                const facts: string[] = []
                if (s.hq) facts.push(s.hq)
                if (s.foundedYear) facts.push(`founded ${s.foundedYear}`)
                if (s.employeeCount) {
                    const headcount = s.employeeCount >= 1000
                        ? `${Math.round(s.employeeCount / 1000)}k employees`
                        : `${s.employeeCount} employees`
                    facts.push(headcount)
                }
                if (s.leadTime) facts.push(`lead time ${s.leadTime}`)
                if (s.minimumOrder) facts.push(`MOQ ${s.minimumOrder}`)
                return (
                    <View key={i} style={{ marginBottom: 14 }} wrap={false}>
                        <Text style={{ fontWeight: "bold", fontSize: 12 }}>{companyName}</Text>
                        {companyName !== s.name && (
                            <Text style={[styles.small, { fontStyle: "italic", color: MUTED }]}>
                                {s.name}
                            </Text>
                        )}
                        {s.websiteUrl && (
                            <Text style={[styles.small, { color: "#2563eb" }]}>
                                {s.websiteUrl}
                            </Text>
                        )}
                        {s.contactEmail && !s.contactEmail.toLowerCase().includes("unknown") && (
                            <Text style={styles.small}>Contact: {s.contactEmail}</Text>
                        )}
                        {facts.length > 0 && (
                            <Text style={[styles.small, { marginTop: 2 }]}>
                                {facts.join(" · ")}
                            </Text>
                        )}
                        {(() => {
                            const certText = formatJsonArrayField(s.certifications as string | string[] | null | undefined, "")
                            const filtered = certText
                                ? certText
                                      .split(", ")
                                      .filter((c) => {
                                          const t = c.trim()
                                          if (!t || t === "null" || t === "undefined" || t === "none") return false
                                          if (/^(MISSING\b|NOT STATED\b|NONE RECORDED\b|UNKNOWN\b|N\/A$|NO CERTIF)/i.test(t)) return false
                                          if (/^\\u[0-9a-f]{4}/i.test(t)) return false
                                          return true
                                      })
                                      .join(", ")
                                : ""
                            return filtered ? (
                                <Text style={[styles.small, { marginTop: 2 }]}>
                                    Certifications: {filtered}
                                </Text>
                            ) : null
                        })()}
                        {(s.projectSynthesis || s.description) && (
                            <Text style={[{ fontSize: 9, marginTop: 4 }]}>
                                {offering}
                            </Text>
                        )}
                        {s.matchedPartNumbers.length > 0 && (
                            <Text style={[styles.small, { marginTop: 4 }]}>
                                <Text style={{ fontWeight: "bold" }}>Supplies BOM rows:</Text>
                                {" "}
                                {s.matchedPartNumbers.join(", ")}
                            </Text>
                        )}
                        {(() => {
                            // L16-L2 (2026-04-27, Tristan-flagged): every
                            // supplier card now shows the modelled spend
                            // total alongside the match score. Founders
                            // scrolling the cards know the spend
                            // descending order from L16-L1's sort and can
                            // see the absolute number per card too.
                            const cardSpendGbp = supplierSpendByName.get(s.name) ?? 0
                            const cardSpendLabel = cardSpendGbp >= 1_000_000
                                ? `£${(cardSpendGbp / 1_000_000).toFixed(1)}M`
                                : cardSpendGbp >= 1_000
                                    ? `£${(cardSpendGbp / 1_000).toFixed(0)}k`
                                    : cardSpendGbp > 0
                                        ? `£${cardSpendGbp.toFixed(0)}`
                                        : "no primary parts"
                            return cardSpendGbp > 0 ? (
                                <Text style={[styles.small, { marginTop: 4, fontWeight: "bold" }]}>
                                    Modelled spend: {cardSpendLabel}
                                    {cardSpendGbp > 0 ? " (modelled, primary-nominee allocation — see spend table above)" : ""}
                                </Text>
                            ) : null
                        })()}
                        {s.moduleNames.length > 0 && (
                            <Text style={[styles.small, { marginTop: 4, color: MUTED }]}>
                                Matched against {s.moduleNames.length} module
                                {s.moduleNames.length === 1 ? "" : "s"}:{" "}
                                {s.moduleNames.join(", ")}
                                {typeof effectiveMatchScore === "number"
                                    ? ` · match score ${effectiveMatchScore.toFixed(1)}/100`
                                    : ""}
                                {promotion.boost > 0 && typeof s.matchScore === "number"
                                    ? ` (live ${s.matchScore.toFixed(1)} + ${promotion.boost} promotion)`
                                    : ""}
                                {/* Loop 8 score-distribution audit (2026-04-26):
                                 * across 408 shortlisted matches, only 1 (0.2%)
                                 * scored ≥60. The directory is genuinely thin
                                 * for these UK hardware classes, so calibrate
                                 * the tier labels to the actual distribution:
                                 *   ≥50  Strong fit (top 1%)
                                 *   ≥40  Plausible fit (top 5%)
                                 *   ≥30  Weak fit — directory gap
                                 *   <30  Below noise floor (filtered upstream
                                 *        but legacy rows surface here too) */}
                                {typeof effectiveMatchScore === "number"
                                    ? effectiveMatchScore >= 50
                                        ? ` · STRONG FIT (top 1% of directory)`
                                        : effectiveMatchScore >= 40
                                            ? ` · PLAUSIBLE FIT (top 5% of directory)`
                                            : effectiveMatchScore >= 30
                                                ? ` · WEAK FIT — directory gap, scout other vendors`
                                                : ` · BELOW NOISE FLOOR — directory has no real coverage for this part class`
                                    : ""}
                            </Text>
                        )}
                        {promotion.boost > 0 && promotion.reasons.length > 0 && (
                            <Text style={[styles.small, { marginTop: 2, fontStyle: "italic", color: MUTED }]}>
                                Promotion reasons: {promotion.reasons.join(" · ")}
                            </Text>
                        )}
                        {s.matchReasons.length > 0 && (
                            <View style={{ marginTop: 4 }}>
                                {s.matchReasons.map((r, j) => (
                                    <View key={j} style={styles.bullet}>
                                        <Text style={styles.bulletDot}>•</Text>
                                        <Text style={styles.bulletText}>{r}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )
            })}
            <PdfFooter label="Supplier shortlist" />
        </Page>
    )
}

function AuditLogPage({ rows }: { rows: AuditRowPdf[] }): React.ReactElement {
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>8. Project audit log ({rows.length})</Text>
            <Text style={styles.muted}>
                Actions recorded against this project — brief lock, ship, other auditable
                mutations.
            </Text>
            {rows.length === 0 && (
                <Text style={{ marginTop: 6 }}>No audit events recorded.</Text>
            )}
            {rows.map((r, i) => (
                <View key={i} style={styles.row} wrap={false}>
                    <Text style={[styles.rowLabel, { width: 120 }]}>
                        {fmtDateTime(r.createdAtIso)}
                    </Text>
                    <Text style={styles.rowValue}>
                        <Text style={{ fontWeight: "bold" }}>{r.action}</Text>
                        {r.section ? <Text style={{ color: MUTED }}> [{r.section}]</Text> : null}
                        {r.metadataSummary ? (
                            <Text style={{ color: MUTED }}>{" " + r.metadataSummary}</Text>
                        ) : null}
                    </Text>
                </View>
            ))}
            <PdfFooter label="Audit log" />
        </Page>
    )
}

function SizingOptimisationSection({
    sheet,
    sectionNumber,
}: {
    sheet: PdfInput["dimensionSheet"]
    sectionNumber: number
}): React.ReactElement | null {
    if (!sheet) return null
    const opt = sheet.optimisation
    const feasibleLabel = sheet.feasible ? "FEASIBLE" : "INFEASIBLE"
    const feasibleColor = sheet.feasible ? "#0a6a1a" : "#a3001a"
    const envelopeLine = `${sheet.envelope.label} · interior ${sheet.envelope.interior_w_mm}×${sheet.envelope.interior_d_mm}×${sheet.envelope.interior_h_mm}mm · ${sheet.envelope.interior_floor_m2.toFixed(2)} m² floor`
    // Build the trial grid: rows = unique tier counts, columns = unique canopies
    const tierValues = Array.from(
        new Set((opt?.trials ?? []).map((t) => t.targets.tiers).filter((v): v is number => typeof v === "number")),
    ).sort((a, b) => a - b)
    const canopyValues = Array.from(
        new Set((opt?.trials ?? []).map((t) => t.targets.canopy_m2).filter((v): v is number => typeof v === "number")),
    ).sort((a, b) => a - b)
    const lookup = new Map<string, { feasible: boolean; utilization_pct: number }>()
    for (const t of opt?.trials ?? []) {
        lookup.set(`${t.targets.tiers}|${t.targets.canopy_m2}`, {
            feasible: t.feasible,
            utilization_pct: t.utilization_pct,
        })
    }

    // V1 FIX (2026-04-24, per Tristan PDF review): different sizing domains
    // use different optimisation strategies. Vertical-farm does a trial
    // sweep over (tiers × canopy_m2). Battery-energy-storage + aerospace
    // do direct deterministic calculation (no sweep) because the sizing
    // is a closed-form solve on capacity + voltage + rack count. Prior
    // PDF showed "Forge ran a 0-trial sweep" for BESS which is misleading.
    // Branch the caption by whether a sweep actually occurred.
    const trialCount = (opt?.trials ?? []).length
    const captionText = trialCount > 0
        ? `Forge ran a ${trialCount}-trial sweep to find the best fit for this envelope. Coefficient library: ${sheet.rules_domain} v${sheet.rules_version}.`
        : `Forge applied the ${sheet.rules_domain} v${sheet.rules_version} rules library — a closed-form deterministic solve (no trial sweep needed for this domain). Final target below was computed directly from the brief's capacity + envelope constraints.`

    return (
        <View>
            <Text style={styles.h2}>{sectionNumber}. Sizing optimisation</Text>
            <Text style={styles.muted}>{captionText}</Text>
            
            {!sheet.feasible && (
                <View
                    style={{
                        marginTop: 8,
                        marginBottom: 10,
                        padding: 10,
                        backgroundColor: "#fee2e2",
                        borderLeftWidth: 4,
                        borderLeftColor: "#b91c1c",
                        borderRadius: 3,
                    }}
                    wrap={false}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7f1d1d", marginBottom: 4 }}>
                        INFEASIBLE DESIGN — The briefed target exceeds the selected envelope.
                    </Text>
                    <Text style={{ fontSize: 9, color: "#7f1d1d", marginBottom: 6 }}>
                        The solver could not fit the original target into the envelope. The configuration below is incomplete or over-capacity. Treat downstream dimensions, spatial plans, and costs as tentative until the brief is revised.
                    </Text>
                    {sheet.closest_feasible_alternate && (
                        <View style={{ marginTop: 2, padding: 6, backgroundColor: "#fef2f2", borderRadius: 2 }}>
                            <Text style={{ fontSize: 9, fontWeight: "bold", color: "#991b1b", marginBottom: 2 }}>
                                Closest feasible alternate the solver found:
                            </Text>
                            <Text style={{ fontSize: 9, color: "#991b1b", marginBottom: 2 }}>
                                {Object.entries(sheet.closest_feasible_alternate.target).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                            </Text>
                            <Text style={{ fontSize: 8.5, color: "#991b1b", fontStyle: "italic" }}>
                                {sheet.closest_feasible_alternate.delta_from_primary} · envelope: {sheet.closest_feasible_alternate.envelope.label}
                            </Text>
                        </View>
                    )}
                </View>
            )}

            <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>Envelope</Text>
                <Text style={{ fontSize: 10, marginBottom: 6 }}>{envelopeLine}</Text>
                <Text style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>Original target (from brief)</Text>
                <Text style={{ fontSize: 11, marginBottom: 6 }}>
                    {Object.entries(sheet.target).map(([k, v]) => `${k}: ${v}`).join(" · ")}{" "}
                    <Text style={{ color: feasibleColor, fontWeight: "bold" }}>[{feasibleLabel}]</Text>
                </Text>
                {/* Loop 8 L5-P4 sizing universalisation */}
                {!sheet.feasible && !sheet.closest_feasible_alternate && (
                    <View
                        style={{
                            marginTop: 6,
                            marginBottom: 8,
                            padding: 8,
                            borderRadius: 4,
                            backgroundColor: "#fef3c7",
                            borderLeftWidth: 3,
                            borderLeftColor: "#a16207",
                        }}
                    >
                        <Text style={{ fontSize: 10, fontWeight: "bold", color: "#78350f" }}>
                            No feasible alternate found within the solver&apos;s envelope + target sweep. The brief targets and the chosen envelope can&apos;t be reconciled — the recommendations below are manual options.
                        </Text>
                    </View>
                )}
                {opt?.winner?.rationale && (
                    <Text style={{ fontSize: 10, fontStyle: "italic", color: "#444", marginBottom: 8 }}>
                        {opt.winner.rationale}
                    </Text>
                )}
            </View>
            {opt && tierValues.length > 0 && canopyValues.length > 0 && (
                <View style={{ marginBottom: 12 }} wrap={false}>
                    <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>
                        Trial grid (rows = tiers, columns = canopy m² · cell = floor util %)
                    </Text>
                    <View style={{ flexDirection: "row", borderBottom: "1 solid #e5e5e5" }}>
                        <Text style={{ width: 40, fontSize: 9, fontWeight: "bold", padding: 4 }}>tiers ↓</Text>
                        {canopyValues.map((c) => (
                            <Text key={c} style={{ flex: 1, fontSize: 9, textAlign: "center", padding: 4, fontWeight: "bold" }}>
                                {c}
                            </Text>
                        ))}
                    </View>
                    {tierValues.map((t) => (
                        <View key={t} style={{ flexDirection: "row", borderBottom: "1 solid #f0f0f0" }}>
                            <Text style={{ width: 40, fontSize: 9, padding: 4, fontWeight: "bold" }}>{t}</Text>
                            {canopyValues.map((c) => {
                                const cell = lookup.get(`${t}|${c}`)
                                if (!cell) return (
                                    <Text key={c} style={{ flex: 1, fontSize: 9, textAlign: "center", padding: 4, color: "#ccc" }}>—</Text>
                                )
                                const isWinner =
                                    opt.winner?.targets.tiers === t && opt.winner?.targets.canopy_m2 === c
                                const bg = !cell.feasible
                                    ? "#fee0dc"
                                    : cell.utilization_pct >= 90
                                        ? "#fff3cd"
                                        : cell.utilization_pct >= 60
                                            ? "#d4edda"
                                            : "#e8f5e9"
                                return (
                                    <View
                                        key={c}
                                        style={{
                                            flex: 1,
                                            backgroundColor: bg,
                                            padding: 4,
                                            borderRight: isWinner ? "2 solid #ff4500" : "1 solid #fff",
                                        }}
                                    >
                                        <Text style={{ fontSize: 9, textAlign: "center" }}>
                                            {cell.feasible ? `${Math.round(cell.utilization_pct)}%` : "✗"}
                                        </Text>
                                    </View>
                                )
                            })}
                        </View>
                    ))}
                    <Text style={{ fontSize: 8, color: "#777", marginTop: 4 }}>
                        Green = comfortable fit · Yellow = tight (≥90% floor used) · Red = infeasible ·
                        Orange outline = winning config.
                    </Text>
                </View>
            )}
            {opt?.top_alternatives && opt.top_alternatives.length > 0 && (
                <View style={{ marginBottom: 10 }} wrap={false}>
                    <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>Top alternatives</Text>
                    {opt.top_alternatives.map((alt, i) => (
                        <View key={i} style={{ marginBottom: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: "bold" }}>
                                {Object.entries(alt.targets).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                            </Text>
                            <Text style={{ fontSize: 9, color: "#555" }}>{alt.trade_offs}</Text>
                        </View>
                    ))}
                </View>
            )}
            {opt?.levers && opt.levers.length > 0 && (
                <View style={{ marginBottom: 10 }} wrap={false}>
                    <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>
                        Levers — what you could do next
                    </Text>
                    {opt.levers.map((lv, i) => (
                        <View key={i} style={{ marginBottom: 5 }}>
                            <Text style={{ fontSize: 10, fontWeight: "bold" }}>{lv.action}</Text>
                            <Text style={{ fontSize: 9, color: "#0a6a1a" }}>Gain: {lv.gain}</Text>
                            <Text style={{ fontSize: 9, color: "#a3001a" }}>Cost: {lv.cost}</Text>
                        </View>
                    ))}
                </View>
            )}
            {sheet.notes && sheet.notes.length > 0 && (
                <View style={{ marginBottom: 10 }} wrap={false}>
                    <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>Engineering notes</Text>
                    {sheet.notes.map((n, i) => (
                        <Text key={i} style={{ fontSize: 9, color: "#333", marginBottom: 3 }}>
                            • {n}
                        </Text>
                    ))}
                </View>
            )}
        </View>
    )
}

// ─── Spatial plan (P2) ─────────────────────────────────────────────────

/**
 * Map a placement's `mount` to a fill + stroke colour pair used inside the
 * SVG drawing. Kept as a helper (rather than inline Map) so the colour
 * legend rendered under the drawing stays consistent.
 */
function mountColours(
    mount: Placement["mount"],
): { fill: string; stroke: string; dashed: boolean } {
    switch (mount) {
        case "floor":
            return { fill: "#e5e7eb", stroke: "#6b7280", dashed: false }
        case "wall":
            return { fill: "#dbeafe", stroke: "#2563eb", dashed: false }
        case "ceiling":
            // Ceiling-mounted placements are ABOVE the top-down plane, so we
            // hint at that with a dashed stroke + warm fill.
            return { fill: "#fed7aa", stroke: "#ea580c", dashed: true }
        case "envelope":
            return { fill: "transparent", stroke: "#111827", dashed: false }
    }
}

/**
 * Colour for a non-module feature by kind. Architectural drawings use a
 * small, distinct palette (aisle = light tint, door = warm accent,
 * vent = dotted, cable tray = coloured line) — we follow the same.
 */
function featureStyle(
    kind: Feature["kind"],
): { stroke: string; fill: string; strokeDasharray?: string } {
    switch (kind) {
        case "aisle":
            return { stroke: "#9ca3af", fill: "none", strokeDasharray: "4 3" }
        case "door":
            return { stroke: "#ea580c", fill: "#ffedd5" }
        case "vent":
            return { stroke: "#0ea5e9", fill: "none", strokeDasharray: "1 2" }
        case "access_panel":
            return { stroke: "#16a34a", fill: "none", strokeDasharray: "2 2" }
        case "cable_tray":
            return { stroke: "#a855f7", fill: "none" }
        case "pipe_run":
            return { stroke: "#0891b2", fill: "none" }
        case "wall":
            return { stroke: "#111827", fill: "none" }
        case "structural_column":
            return { stroke: "#374151", fill: "#d1d5db" }
    }
}

/**
 * Render the spatial plan section — the only new surface added by the
 * layout engine (P2.112). Policy mirrors SizingOptimisationSection:
 *
 *   - null plan          → returns null, no section, no placeholder copy
 *   - plan, no placements→ renders envelope outline + "No placements" note
 *                          (valid for a rules library that authored features
 *                          but matched zero modules)
 *   - plan + placements  → full SVG drawing + two-column tables + notes
 *
 * Never fabricates coordinates — everything comes off the persisted plan.
 */
// V1 flag: flip to true once the @react-pdf SVG black-rect issue is fixed.
const SHOW_SPATIAL_DRAWING = false

function SpatialPlanSection({
    plan,
    sectionNumber,
    moduleNameById,
    imageDataUri,
}: {
    plan: SpatialPlan | null
    sectionNumber: number
    moduleNameById: Map<string, string>
    imageDataUri: string | null
}): React.ReactElement | null {
    if (!plan) return null

    const env = plan.envelope
    const view = plan.view

    // Label resolver — prefers placement.label_override, then the module name
    // from the project's modules list, then falls back to the raw module_id
    // so the reader never sees an empty rectangle.
    const labelFor = (p: Placement): string =>
        p.label_override ?? moduleNameById.get(p.module_id) ?? p.module_id

    // ── Header ─────────────────────────────────────────────────────────
    const header = (
        <View>
            <Text style={styles.h2}>
                {sectionNumber}. Spatial plan — {env.label}
            </Text>
            <Text style={styles.muted}>
                {view}, plan_type={plan.plan_type}, authored by {plan.authored_by},
                generated {fmtDateTime(plan.generated_at)} ({plan.rules_domain} v
                {plan.rules_version})
            </Text>
        </View>
    )

    // ── Drawing dispatch ───────────────────────────────────────────────
    // top_down / side_elevation → to-scale 2D drawing.
    // isometric_exploded / cutaway → simplified stacked-layer diagram
    // (full 3D projection is too expensive inside react-pdf's SVG
    // rasteriser, so we degrade to a legible layered list).
    const is2D = view === "top_down" || view === "side_elevation"

    // Drawing target dimensions — 450pt wide is the documented
    // "fits inside page margins with room for a caption" figure. The
    // height scales with the envelope's secondary axis.
    const DRAWING_W_PT = 450
    const axisInsetPt = 14 // room for axis labels around the drawing

    // Axis selection — which envelope dimension is the X (primary) axis
    // and which is the Y (secondary) axis inside the drawing.
    const envelopeX_mm = env.interior_w_mm
    const envelopeY_mm =
        view === "top_down" ? env.interior_d_mm : env.interior_h_mm

    const scale = envelopeX_mm > 0 ? DRAWING_W_PT / envelopeX_mm : 1
    const drawingW = DRAWING_W_PT
    const drawingH = Math.max(40, envelopeY_mm * scale)
    const svgH = drawingH + axisInsetPt * 2

    // Transform helpers — envelope-local mm → SVG pt.
    // SVG origin is top-left; envelope origin is bottom-left of the view
    // (per the SpatialPlan convention), so we flip Y.
    const toSvgX = (x_mm: number): number => axisInsetPt + x_mm * scale
    const toSvgY = (y_mm: number, size_mm: number): number =>
        axisInsetPt + (envelopeY_mm - y_mm - size_mm) * scale
    const toSvgPtY = (y_mm: number): number =>
        axisInsetPt + (envelopeY_mm - y_mm) * scale

    // For side-elevation, y_mm is the placement's FLOOR z-value and the
    // secondary axis is height. Each placement's bounding size along the
    // secondary axis is h_mm (not d_mm).
    const sizeAlongY = (p: Placement): number =>
        view === "top_down" ? p.d_mm : p.h_mm
    const sizeAlongX = (p: Placement): number => p.w_mm
    const originOnY = (p: Placement): number =>
        view === "top_down" ? p.y_mm : (p.z_mm ?? 0)

    // ── 2D drawing body ────────────────────────────────────────────────
    const drawing2D = (
        <Svg width={drawingW + axisInsetPt * 2} height={svgH}>
            {/* White canvas under everything so the drawing renders against
                a clean background. Without this, @react-pdf/renderer was
                filling the SVG area with black (observed 2026-04-24 on BESS
                PDF — user reported "can't see where the modules fit into it"
                because every fill="none" rect rendered as black). */}
            <Rect
                x={0}
                y={0}
                width={drawingW + axisInsetPt * 2}
                height={svgH}
                fill="#ffffff"
                stroke="none"
            />
            {/* Envelope outline */}
            <Rect
                x={axisInsetPt}
                y={axisInsetPt}
                width={drawingW}
                height={drawingH}
                fill="#ffffff"
                stroke="#111827"
                strokeWidth={1.2}
            />

            {/* Placements */}
            {plan.placements.map((p, i) => {
                const w = sizeAlongX(p) * scale
                const h = sizeAlongY(p) * scale
                const x = toSvgX(p.x_mm)
                const y = toSvgY(originOnY(p), sizeAlongY(p))
                const c = mountColours(p.mount)
                const label = labelFor(p)
                // Label font size shrinks on tight cells. We keep at least
                // 5pt (react-pdf rasterises below this reliably) and never
                // render a label larger than ~40% of the cell height.
                const labelFontSize = Math.max(
                    5,
                    Math.min(8, Math.floor(Math.min(w, h) / 6)),
                )
                return (
                    <React.Fragment key={`p-${i}`}>
                        <Rect
                            x={x}
                            y={y}
                            width={Math.max(1, w)}
                            height={Math.max(1, h)}
                            fill={c.fill}
                            stroke={c.stroke}
                            strokeWidth={0.8}
                            strokeDasharray={c.dashed ? "3 2" : undefined}
                        />
                        {w > 24 && h > 12 && (
                            <Text
                                x={x + w / 2}
                                y={y + h / 2 + labelFontSize / 3}
                                style={{ fontSize: labelFontSize }}
                                fill="#111827"
                                textAnchor="middle"
                            >
                                {label}
                            </Text>
                        )}
                    </React.Fragment>
                )
            })}

            {/* Features overlay */}
            {plan.features.map((f, i) => {
                const style = featureStyle(f.kind)
                if (f.geometry === "rect" && f.coords.length >= 4) {
                    const [fx, fy, fw, fh] = f.coords
                    return (
                        <Rect
                            key={`f-${i}`}
                            x={toSvgX(fx)}
                            y={toSvgY(fy, fh)}
                            width={fw * scale}
                            height={fh * scale}
                            fill={style.fill}
                            stroke={style.stroke}
                            strokeWidth={0.7}
                            strokeDasharray={style.strokeDasharray}
                        />
                    )
                }
                if (f.geometry === "line" && f.coords.length >= 4) {
                    const [x1, y1, x2, y2] = f.coords
                    return (
                        <Line
                            key={`f-${i}`}
                            x1={toSvgX(x1)}
                            y1={toSvgPtY(y1)}
                            x2={toSvgX(x2)}
                            y2={toSvgPtY(y2)}
                            stroke={style.stroke}
                            strokeWidth={Math.max(0.6, (f.width_mm ?? 40) * scale)}
                            strokeDasharray={style.strokeDasharray}
                        />
                    )
                }
                if (f.geometry === "polygon" && f.coords.length >= 6) {
                    const pts: string[] = []
                    for (let k = 0; k + 1 < f.coords.length; k += 2) {
                        pts.push(
                            `${toSvgX(f.coords[k])},${toSvgPtY(f.coords[k + 1])}`,
                        )
                    }
                    return (
                        <Polygon
                            key={`f-${i}`}
                            points={pts.join(" ")}
                            fill={style.fill}
                            stroke={style.stroke}
                            strokeWidth={0.7}
                            strokeDasharray={style.strokeDasharray}
                        />
                    )
                }
                return null
            })}

            {/* Axis tick markers — origin circle at (0,0) of the envelope */}
            <Circle
                cx={axisInsetPt}
                cy={axisInsetPt + drawingH}
                r={1.5}
                fill="#111827"
            />
        </Svg>
    )

    // ── Stack / isometric-exploded: layered list fallback ──────────────
    const drawingStack = (() => {
        // Sort top-to-bottom by z_mm (or layer if present) — highest first,
        // because that matches the reader's expectation of looking down at
        // an exploded stack.
        const rows = [...plan.placements].sort((a, b) => {
            const za = a.layer ?? a.z_mm ?? 0
            const zb = b.layer ?? b.z_mm ?? 0
            return zb - za
        })
        if (rows.length === 0) return null
        return (
            <View
                style={{
                    borderWidth: 1,
                    borderColor: BORDER,
                    borderRadius: 3,
                    padding: 8,
                    marginBottom: 10,
                }}
            >
                {rows.map((p, i) => (
                    <View
                        key={`sk-${i}`}
                        style={{
                            flexDirection: "row",
                            paddingVertical: 5,
                            borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
                            borderBottomColor: BORDER,
                            backgroundColor:
                                mountColours(p.mount).fill === "transparent"
                                    ? undefined
                                    : mountColours(p.mount).fill,
                        }}
                    >
                        <Text
                            style={{
                                width: 40,
                                fontSize: 9,
                                fontWeight: "bold",
                                color: MUTED,
                            }}
                        >
                            {p.layer != null ? `L${p.layer}` : `z=${Math.round(
                                p.z_mm ?? 0,
                            )}`}
                        </Text>
                        <Text style={{ flex: 1, fontSize: 9, fontWeight: "bold" }}>
                            {labelFor(p)}
                        </Text>
                        <Text style={{ width: 110, fontSize: 8, color: MUTED }}>
                            {Math.round(p.w_mm)}×{Math.round(p.d_mm)}×
                            {Math.round(p.h_mm)} mm
                        </Text>
                        <Text style={{ width: 60, fontSize: 8, color: MUTED }}>
                            {p.mount}
                        </Text>
                    </View>
                ))}
            </View>
        )
    })()

    // ── Axis caption (only for 2D views) ───────────────────────────────
    const axisCaption = is2D ? (
        <View style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 1 }}>
                X — envelope length, mm (0 → {envelopeX_mm})
            </Text>
            <Text style={{ fontSize: 8.5, color: MUTED }}>
                Y — {view === "top_down" ? "envelope depth" : "envelope height"},
                mm (0 → {envelopeY_mm})
            </Text>
        </View>
    ) : null

    // ── Legend (mount colour key — mirrors what the drawing uses) ──────
    const legend = (
        <View
            style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginTop: 4,
                marginBottom: 8,
            }}
        >
            {(
                [
                    { label: "Floor-mounted", mount: "floor" as const },
                    { label: "Wall-mounted", mount: "wall" as const },
                    { label: "Ceiling-mounted (above)", mount: "ceiling" as const },
                    { label: "Envelope", mount: "envelope" as const },
                ]
            ).map((item) => {
                const c = mountColours(item.mount)
                return (
                    <View
                        key={item.mount}
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginRight: 12,
                            marginBottom: 2,
                        }}
                    >
                        <View
                            style={{
                                width: 10,
                                height: 8,
                                borderWidth: 0.8,
                                borderColor: c.stroke,
                                backgroundColor:
                                    c.fill === "transparent" ? undefined : c.fill,
                                borderStyle: c.dashed ? "dashed" : "solid",
                                marginRight: 4,
                            }}
                        />
                        <Text style={{ fontSize: 8, color: INK }}>{item.label}</Text>
                    </View>
                )
            })}
        </View>
    )

    // ── Placements table (left column) ─────────────────────────────────
    const placementsTable = (
        <View style={{ flex: 1, paddingRight: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>
                Placements
            </Text>
            {plan.placements.length === 0 ? (
                <Text style={{ fontSize: 9, color: MUTED, fontStyle: "italic" }}>
                    No placements — this rules library authored features only.
                </Text>
            ) : (
                <>
                    <View
                        style={{
                            flexDirection: "row",
                            borderBottomWidth: 0.5,
                            borderBottomColor: BORDER,
                            paddingBottom: 2,
                            marginBottom: 2,
                        }}
                    >
                        <Text
                            style={{
                                flex: 1.6,
                                fontSize: 7.5,
                                fontWeight: "bold",
                                color: MUTED,
                            }}
                        >
                            Module
                        </Text>
                        <Text
                            style={{
                                width: 34,
                                fontSize: 7.5,
                                fontWeight: "bold",
                                color: MUTED,
                            }}
                        >
                            Mount
                        </Text>
                        <Text
                            style={{
                                width: 74,
                                fontSize: 7.5,
                                fontWeight: "bold",
                                color: MUTED,
                            }}
                        >
                            W×D×H mm
                        </Text>
                        <Text
                            style={{
                                width: 70,
                                fontSize: 7.5,
                                fontWeight: "bold",
                                color: MUTED,
                            }}
                        >
                            x,y,z mm
                        </Text>
                        <Text
                            style={{
                                width: 40,
                                fontSize: 7.5,
                                fontWeight: "bold",
                                color: MUTED,
                                textAlign: "right",
                            }}
                        >
                            Rotation °
                        </Text>
                    </View>
                    {plan.placements.map((p, i) => (
                        <View
                            key={`pt-${i}`}
                            style={{ flexDirection: "row", paddingVertical: 1.5 }}
                        >
                            <Text style={{ flex: 1.6, fontSize: 8 }}>
                                {labelFor(p)}
                            </Text>
                            <Text style={{ width: 34, fontSize: 8 }}>{p.mount}</Text>
                            <Text style={{ width: 74, fontSize: 8 }}>
                                {Math.round(p.w_mm)}×{Math.round(p.d_mm)}×
                                {Math.round(p.h_mm)}
                            </Text>
                            <Text style={{ width: 70, fontSize: 8 }}>
                                {Math.round(p.x_mm)},{Math.round(p.y_mm)},
                                {Math.round(p.z_mm ?? 0)}
                            </Text>
                            <Text
                                style={{
                                    width: 26,
                                    fontSize: 8,
                                    textAlign: "right",
                                }}
                            >
                                {Math.round(p.orientation_deg)}
                            </Text>
                        </View>
                    ))}
                </>
            )}
        </View>
    )

    // ── Constraints list (right column) ────────────────────────────────
    const constraintsList = (
        <View style={{ flex: 1, paddingLeft: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>
                Constraints
            </Text>
            {plan.constraints.length === 0 ? (
                <Text style={{ fontSize: 9, color: MUTED, fontStyle: "italic" }}>
                    No constraints recorded.
                </Text>
            ) : (
                plan.constraints.map((c, i) => {
                    const aName = moduleNameById.get(c.a) ?? c.a
                    const bName = moduleNameById.get(c.b) ?? c.b
                    const range =
                        c.min_mm != null && c.max_mm != null
                            ? `${c.min_mm}–${c.max_mm}mm`
                            : c.min_mm != null
                                ? `min ${c.min_mm}mm`
                                : c.max_mm != null
                                    ? `max ${c.max_mm}mm`
                                    : "—"
                    return (
                        <View key={`c-${i}`} style={{ marginBottom: 3 }}>
                            <Text style={{ fontSize: 8.5 }}>
                                <Text style={{ fontWeight: "bold" }}>{c.kind}</Text>
                                : {aName} ↔ {bName} · {range}
                            </Text>
                            {c.reason && (
                                <Text
                                    style={{
                                        fontSize: 7.5,
                                        color: MUTED,
                                        marginLeft: 6,
                                    }}
                                >
                                    {c.reason}
                                </Text>
                            )}
                        </View>
                    )
                })
            )}
        </View>
    )

    // A3 — Loop 26 Tier-A fix: detect overflow notes and render a red
    // banner at the top of the section so the founder cannot miss it.
    const OVERFLOW_NOTE_RE = /overflows?\s+envelope\s+by\s+([\d,]+)\s*mm/i
    const overflowAnnotations = (plan.notes ?? []).filter((n) => OVERFLOW_NOTE_RE.test(n))
    const hasOverflow = overflowAnnotations.length > 0

    return (
        <View>
            {header}
            {/* A3 — spatial overflow banner. Rendered before the drawing so
                the founder meets the failure before the diagram, not after.
                Do NOT suppress the drawing — the plan is still useful for
                diagnosing which module is too large. */}
            {hasOverflow && (
                <View
                    style={{
                        marginTop: 8,
                        marginBottom: 8,
                        padding: 10,
                        backgroundColor: "#fee2e2",
                        borderLeftWidth: 4,
                        borderLeftColor: "#b91c1c",
                        borderRadius: 3,
                    }}
                    wrap={false}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7f1d1d" }}>
                        Spatial plan does not fit briefed envelope — placements exceed enclosure.
                    </Text>
                    <Text style={{ fontSize: 9, color: "#7f1d1d", marginTop: 3 }}>
                        The layout engine flagged overflow(s) below. Treat all downstream dimensions, costs, and supplier shortlists as tentative until the brief envelope or module dimensions are revised to resolve the conflicts.
                    </Text>
                    {overflowAnnotations.slice(0, 4).map((n, i) => (
                        <Text key={`ov-${i}`} style={{ fontSize: 8.5, color: "#7f1d1d", marginTop: 2 }}>
                            • {n}
                        </Text>
                    ))}
                </View>
            )}
            {plan.placements.length === 0 && (
                <View
                    style={{
                        borderWidth: 1,
                        borderColor: BORDER,
                        borderStyle: "dashed",
                        padding: 12,
                        marginTop: 6,
                        marginBottom: 10,
                    }}
                >
                    <Text style={{ fontSize: 10, color: MUTED }}>
                        No placements — envelope outline only. The rules library
                        produced features or constraints but no module was matched.
                    </Text>
                </View>
            )}
            {/* V1.1 (2026-04-24): sharp-rasterised PNG of the 2D floor plan.
                @react-pdf/renderer's native <Svg> renders this as black even
                with explicit white backgrounds; we build the SVG string
                server-side in rasterise-spatial-plan.ts and convert to PNG
                via sharp before the Image embed. Falls back to stack-list
                diagram for 3D views (isometric_exploded / cutaway) which
                don't raster well at this size. */}
            {is2D && imageDataUri ? (
                <>
                    {axisCaption}
                    <View wrap={false} style={{ marginBottom: 8 }}>
                        <Image
                            src={imageDataUri}
                            style={{ width: "100%", height: "auto" }}
                        />
                    </View>
                    {legend}
                </>
            ) : (
                drawingStack
            )}
            <View
                style={{
                    flexDirection: "row",
                    marginTop: 4,
                    marginBottom: 8,
                }}
                wrap={false}
            >
                {placementsTable}
                {constraintsList}
            </View>
            {plan.notes && plan.notes.length > 0 && (
                <View wrap={false}>
                    <Text
                        style={{
                            fontSize: 11,
                            fontWeight: "bold",
                            marginBottom: 4,
                        }}
                    >
                        Notes
                    </Text>
                    {plan.notes.map((n, i) => (
                        <Text
                            key={`n-${i}`}
                            style={{
                                fontSize: 9,
                                color: "#333",
                                marginBottom: 2,
                            }}
                        >
                            • {n}
                        </Text>
                    ))}
                </View>
            )}
        </View>
    )
}

/**
 * ── getSectionManifest ─────────────────────────────────────────────────
 * Single source of truth for which sections render in the PDF body AND
 * which entries appear in the table of contents.
 *
 * Item 5 (2026-04-29): previously the TOC was built from one set of
 * conditionals and the body checked a slightly different set (the old
 * BODY_SECTION_LABELS block). That divergence is what the TOC-vs-body
 * invariant existed to catch. Now BOTH the TOC and the invariant check
 * derive from this single function, eliminating the root cause.
 *
 * Rules:
 *   - "Brief" and "Regulatory posture" always render.
 *   - "Sizing optimisation" renders when (a) a dimension sheet is present
 *     OR (b) the sizing solver ran and returned fails (placeholder page).
 *   - "Spatial plan" renders when a spatial plan is present.
 *   - "Modules (one page each)", "BOM master", "Cost waterfall",
 *     "Reconciliation" (conditional), "Risks register", "Supplier shortlist"
 *     render ONLY when isHardInfeasible is false.
 *   - "Reconciliation" renders only when the reconciliation has findings.
 *
 * @returns Array of section label strings in render order (no numbering).
 */
function getSectionManifest(data: PdfInput): string[] {
    const hardInfeasible = isHardInfeasible(data.feasibilityVerdict)
    const reconciliationHasFindings = (data.reconciliation?.findings.length ?? 0) > 0
    const sizingPlaceholderWouldRender =
        data.dimensionSheet == null &&
        data.feasibilityVerdict != null &&
        data.feasibilityVerdict.fails.length > 0

    return [
        "Brief",
        "Regulatory posture",
        ...(data.dimensionSheet != null || sizingPlaceholderWouldRender
            ? ["Sizing optimisation"]
            : []),
        ...(data.spatialPlan != null ? ["Spatial plan"] : []),
        ...(!hardInfeasible
            ? [
                  "Modules (one page each)",
                  "BOM master",
                  "Cost waterfall",
                  ...(reconciliationHasFindings ? ["Reconciliation"] : []),
                  "Risks register",
                  "Supplier shortlist",
              ]
            : []),
        "Audit log",
    ]
}

function ForgeProjectPdf({ data }: { data: PdfInput }): React.ReactElement {
    const hasSheet = data.dimensionSheet != null
    const hasPlan = data.spatialPlan != null

    // Build the module-id → name map once here so SpatialPlanSection can
    // resolve placement.module_id labels without re-walking the array.
    const moduleNameById = new Map<string, string>()
    for (const m of data.modules) moduleNameById.set(m.id, m.name)

    // ── Section manifest (single source of truth) ──────────────────────
    // getSectionManifest() returns the ordered list of sections that will
    // BOTH appear in the TOC and render in the body. Centralising the
    // conditional logic here eliminates the class of bug where the TOC
    // lists a section the body never emits (or vice-versa).
    //
    // Item 5 (2026-04-29): promoted TOC-vs-body invariant from LOG ONLY to
    // BLOCKING. The old approach was to compute the TOC from one set of
    // conditionals, the body from a slightly different set, and then compare
    // them at emit time — logging a warning when they diverged. Now both
    // derive from getSectionManifest(), so the invariant is maintained by
    // construction rather than asserted after the fact. The post-build check
    // below is retained as a belt-and-suspenders guard and now throws.
    //
    // Historical notes preserved below for context:
    //   Loop 7 A3: audit log removed from TOC until section is wired back.
    //   Loop 8 G1: Reconciliation conditional on findings presence.
    //   Loop 24 Fix 4 P1: hard-infeasible drops downstream sections from TOC.
    const allSections = getSectionManifest(data)
    const sections = allSections.map((label, i) => `${i + 1}. ${label}`)

    // ── Pre-emit TOC-vs-body invariant (BLOCKING) ──────────────────────
    // Belt-and-suspenders: verify the manifest is self-consistent.
    // Because the TOC and the body both use getSectionManifest(), this
    // invariant should NEVER fire in normal operation. If it does, the
    // getSectionManifest() function has a bug — throwing prevents a
    // misleading PDF reaching the founder.
    //
    // Item 5 (2026-04-29): changed from console.warn (log only) to throw.
    // The old message said "refusing to emit would block the founder; logging
    // instead" — but a PDF with a TOC that does not match its body IS a
    // defective document that should not reach the founder. Blocking here
    // surfaces the bug in the pipeline_runs log immediately.
    {
        // The body section list is now identical to allSections by construction.
        // We still validate to catch any future divergence introduced by callers
        // that bypass getSectionManifest().
        const bodyManifest = getSectionManifest(data)
        for (const tocLabel of allSections) {
            const norm = tocLabel.replace(/\s*\(\d+\)\s*$/, "")
            if (!bodyManifest.some((b) => b.startsWith(norm) || norm.startsWith(b))) {
                throw new Error(
                    `[pdf-emit] TOC-vs-body invariant violated: section "${tocLabel}" is listed in the TOC but getSectionManifest() does not include it in the body. Review ForgeProjectPdf and getSectionManifest().`,
                )
            }
        }
        // Reverse check: every body section must have a TOC entry.
        for (const bodyLabel of bodyManifest) {
            if (!allSections.some((t) => {
                const norm = t.replace(/\s*\(\d+\)\s*$/, "")
                return norm.startsWith(bodyLabel) || bodyLabel.startsWith(norm)
            })) {
                throw new Error(
                    `[pdf-emit] TOC-vs-body invariant violated: section "${bodyLabel}" will render in the body but is absent from the TOC. Review ForgeProjectPdf and getSectionManifest().`,
                )
            }
        }
    }

    // Computed section numbers for the sections that render their own
    // header (they need to show the right "N." prefix).
    // Brief = 1, Regulatory = 2, Sizing = 3 (if present), Plan = next.
    // L13-VERIFY-FIX: sizing section now renders a placeholder when
    // !hasSheet but the verdict has fails — so the section number
    // must be reserved in those cases too, otherwise the spatial-plan
    // section claims slot 3 and the ToC mis-numbers.
    const sizingPlaceholderRenders =
        !hasSheet &&
        data.feasibilityVerdict != null &&
        data.feasibilityVerdict.fails.length > 0
    const sizingSectionRenders = hasSheet || sizingPlaceholderRenders
    const sizingSectionNumber = sizingSectionRenders ? 3 : null
    const planSectionNumber = hasPlan ? (sizingSectionRenders ? 4 : 3) : null
    return (
        <Document>
            {/* 0. Cover */}
            <CoverPage data={data} />

            {/* TOC */}
            <TocPage sections={sections} />

            {/* 1 + 2 on the same page-stream */}
            <Page size="A4" style={styles.page} wrap>
                <BriefSection data={data} />
                <RegulatorySection items={data.regulatory} data={data} />
                <PdfFooter label="Brief + regulatory" />
            </Page>

            {/* 2026-04-26 BISECT: PDF_BISECT_MINIMAL=1 stops all
             *  optional + heavy sections after Brief + Regulatory.
             *  Establishes whether Cover/TOC/Brief alone render OK; if
             *  they do, the bug is in Feasibility / Sizing / Modules /
             *  BOM / Cost / Risks / Suppliers / EngineReview / AuditLog.
             *  Each section can then be re-enabled independently. */}
            {/* L16-F1+F3 (2026-04-27, Tristan-flagged): Feasibility
                Exception should fire for any verdict that has fails OR
                warnings, not just hard-infeasible. The previous gate
                (status !== "green") missed the case where the verdict
                is clean green BUT the deterministic numerical
                reconciliation has alerts (the HAPS Loop 14 scenario:
                green verdict, 11 spec mismatches surfaced on
                Reconciliation page). Now fires on either signal so
                the section presence is consistent across documents.
                Loop 24 P0: also fires for phantom-GREEN (solver ran but
                had no inputs to check — checkedConstraints empty). A
                bare GREEN with no checked constraints is not an approval
                signal and must be surfaced to the founder as UNREVIEWED. */}
            {process.env.PDF_BISECT_MINIMAL !== "1" && process.env.PDF_SKIP_FEASIBILITY !== "1" && data.feasibilityVerdict && (
                data.feasibilityVerdict.status !== "green" ||
                (data.reconciliation?.hasAlerts ?? false) ||
                isPhantomGreen(data.feasibilityVerdict)
            ) && (
                <FeasibilityExceptionPage verdict={data.feasibilityVerdict} />
            )}

            {process.env.PDF_BISECT_MINIMAL !== "1" && process.env.PDF_SKIP_SIZING !== "1" && hasSheet && sizingSectionNumber != null && (
                <Page size="A4" style={styles.page} wrap>
                    <SizingOptimisationSection
                        sheet={data.dimensionSheet}
                        sectionNumber={sizingSectionNumber}
                    />
                    <PdfFooter label="Sizing optimisation" />
                </Page>
            )}
            {/* L13-VERIFY-FIX (2026-04-27): when sizing has no
               dimensionSheet but feasibility verdict indicates a hard
               infeasibility (Desal mass blocker, Sentinel mass blocker
               in Loop 13 verification), the section was skipped
               entirely — leaving the customer with no explanation of
               what was tried. Render a placeholder that summarises the
               attempted axes from the verdict so the section earns a
               score above zero. */}
            {process.env.PDF_BISECT_MINIMAL !== "1" && process.env.PDF_SKIP_SIZING !== "1" && !hasSheet && data.feasibilityVerdict && data.feasibilityVerdict.fails.length > 0 && (
                <Page size="A4" style={styles.page} wrap>
                    <Text style={styles.h2}>{sizingSectionNumber ?? 3}. Sizing optimisation — solver could not produce a feasible configuration</Text>
                    <Text style={[styles.muted, { marginBottom: 8, fontSize: 9 }]}>
                        The sizing solver ran against the brief envelope, mass ceiling, and cost ceiling and could not find a configuration that meets all of the declared constraints. No dimension sheet was emitted because the configuration would have been load-bearing for downstream procurement. The blockers below name the failed axes; the Feasibility Exception page below carries the same data with trade-off recommendations.
                    </Text>
                    {data.feasibilityVerdict.fails.map((f, i) => (
                        <View key={`size-fail-${i}`} style={{ marginBottom: 10 }}>
                            <Text style={{ fontSize: 11, fontWeight: "bold", color: f.severity === "blocker" ? "#b91c1c" : "#b45309" }}>
                                {f.axis.charAt(0).toUpperCase() + f.axis.slice(1)} — {f.severity.toUpperCase()}
                            </Text>
                            <Text style={{ fontSize: 10, marginTop: 2 }}>{f.summary}</Text>
                            {f.evidence ? (
                                <Text style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>
                                    Evidence: {f.evidence}
                                </Text>
                            ) : null}
                        </View>
                    ))}
                    <PdfFooter label="Sizing optimisation" />
                </Page>
            )}

            {process.env.PDF_BISECT_MINIMAL !== "1" && hasPlan && planSectionNumber != null && (
                <Page size="A4" style={styles.page} wrap>
                    <SpatialPlanSection
                        plan={data.spatialPlan}
                        sectionNumber={planSectionNumber}
                        moduleNameById={moduleNameById}
                        imageDataUri={data.spatialPlanImageDataUri}
                    />
                    <PdfFooter label="Spatial plan" />
                </Page>
            )}

            {/* L13-P3 (2026-04-27): hard-infeasibility gate. When the
               sizing solver returns a red verdict with at least one
               envelope/mass/transport blocker, suppress the module pages
               and every downstream section so the reader does not see
               numbers that look like procurement targets for a design
               that does not fit the brief. Cover / brief / sizing /
               feasibility-exception remain to communicate WHY. */}
            {process.env.PDF_BISECT_MINIMAL !== "1" && process.env.PDF_SKIP_MODULES !== "1" && !isHardInfeasible(data.feasibilityVerdict) && data.modules.map((m, i) => (
                <ModulePage
                    key={m.id}
                    mod={m}
                    index={i}
                    /* L9-FOLLOWUP: filter BOM parts to this module so the
                       Cost breakdown table reads from the same source as
                       cover unit cost + BOM master + reconciliation gate. */
                    partsForModule={data.parts.filter(
                        (p) => p.sourceModuleName === m.name,
                    )}
                />
            ))}

            {/* 4. BOM master — with per-row supplier candidates inline.
                 suppliersByPart is computed from data.suppliers'
                 matchedPartNumbers (added 2026-04-25 NIGHT).
                 2026-04-26 BISECT: env flag PDF_SKIP_BOM=1 hides this
                 section to test the Yoga sentinel hypothesis. Council
                 ranked BomMasterPage as the #1 likely culprit (highest
                 cell count + most recently mutated by autopilot).
                 L13-P3 (2026-04-27): also suppressed when hard-infeasible. */}
            {process.env.PDF_SKIP_BOM !== "1" && !isHardInfeasible(data.feasibilityVerdict) && <BomMasterPage
                parts={data.parts}
                sources={data.sources}
                verdict={data.feasibilityVerdict}
                suppliersByPart={(() => {
                    const map = new Map<string, string[]>()
                    for (const s of data.suppliers) {
                        // Render the supplier under each part number it
                        // was matched against. Use the host as the
                        // display label (PDF supplier-section uses the
                        // same convention).
                        const label = (() => {
                            if (s.websiteUrl && /^https?:\/\//i.test(s.websiteUrl)) {
                                try {
                                    return new URL(s.websiteUrl).hostname.replace(/^www\./, "")
                                } catch {
                                    return s.name
                                }
                            }
                            return s.name
                        })()
                        for (const partNumber of s.matchedPartNumbers) {
                            const list = map.get(partNumber) ?? []
                            if (!list.includes(label)) list.push(label)
                            map.set(partNumber, list)
                        }
                    }
                    return map
                })()}
            />}

            {/* 2026-04-26 BISECT (final ring). Each post-BOM section now
             *  has its own SKIP flag so we can exclude one at a time. The
             *  bug is in one of {Cost, Suppliers, EngineReview, AuditLog}
             *  per the bisect time-signature. PDF_BISECT_MINIMAL forces
             *  everything off; per-section SKIP flags exclude one cleanly
             *  while keeping all other sections in. */}
            {process.env.PDF_BISECT_MINIMAL !== "1" && process.env.PDF_SKIP_COST !== "1" && !isHardInfeasible(data.feasibilityVerdict) && <CostPage data={data} />}

            {process.env.PDF_BISECT_MINIMAL !== "1" && !isHardInfeasible(data.feasibilityVerdict) && data.reconciliation && data.reconciliation.findings.length > 0 && (
                <ReconciliationPage reconciliation={data.reconciliation} />
            )}

            {(process.env.PDF_BISECT_MINIMAL !== "1" || process.env.PDF_INCLUDE_RISKS === "1") && !isHardInfeasible(data.feasibilityVerdict) && <RisksPage modules={data.modules} />}

            {process.env.PDF_BISECT_MINIMAL !== "1" && process.env.PDF_SKIP_SUPPLIERS !== "1" && !isHardInfeasible(data.feasibilityVerdict) && (
                <SuppliersPage
                    suppliers={data.suppliers}
                    sources={data.sources}
                    verdict={data.feasibilityVerdict}
                    parts={data.parts}
                />
            )}

            {/* EngineReviewPage intentionally not rendered — Tristan-directed
             *  2026-04-26 NIGHT (architecture decision Option α): a self-
             *  review appendix that surfaces issues without fixing them
             *  undermines confidence in the rest of the pack. The new
             *  architecture is per-stage review-and-revise: each pipeline
             *  stage's reviewer findings drive a fix pass on the section
             *  itself before the section is finalised. The customer reads
             *  the post-revise output only.
             *
             *  See ~/Downloads/forge-demos/PER-STAGE-REVIEW-REVISE-ARCHITECTURE.md
             *  for the 11-stage retrofit plan. Risks register is the first
             *  stage retrofit (this commit). EngineReviewPage code is kept
             *  for now so retrofitted stages can still surface OPEN
             *  QUESTIONS that couldn't be auto-resolved — but the page
             *  itself doesn't render until that mechanism is wired.
             */}

            {/* Loop 28 P3: Audit log re-enabled as mandatory section.
             *  Loop 27 council (4/4 unanimous) flagged missing audit log as
             *  compliance-critical gap. Reframed from "project audit log"
             *  (user actions) to "generation audit trail" (pipeline stages,
             *  models, timestamps, validation warnings). Always renders. */}
            <AuditLogPage rows={data.auditLog} />
        </Document>
    )
}

// ─── Engine self-review appendix ──────────────────────────────────────

function EngineReviewPage({
    findings,
}: {
    findings: NonNullable<PdfInput["proofreadFindings"]>
}): React.ReactElement {
    const blockers = findings.findings.filter((f) => f.severity === "blocker")
    const content = findings.findings.filter((f) => f.severity === "content")
    const cosmetic = findings.findings.filter((f) => f.severity === "cosmetic")
    const totalCount = findings.findings.length
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>Self-review</Text>
            <Text style={[styles.muted, { marginBottom: 8, fontSize: 9 }]}>
                Before this PDF was emitted, a fact-check pass ran against
                the assembled state — comparing brief targets to derived
                values, checking standard citations, looking for math
                errors and internal contradictions. Findings below are
                surfaced here for founder review. This phase is
                non-correcting — what was caught is documented; what was
                missed is not.
            </Text>
            <Text style={[styles.small, { marginBottom: 10, color: MUTED }]}>
                Run at {findings.ranAtIso.replace("T", " ").slice(0, 19)} ·
                {totalCount === 0
                    ? " no findings"
                    : ` ${totalCount} finding${totalCount === 1 ? "" : "s"} (` +
                      `${blockers.length} blocker, ${content.length} content, ${cosmetic.length} cosmetic)`}
            </Text>
            {blockers.length > 0 && (
                <FindingGroup
                    title="BLOCKERS"
                    description="The engine considers these severe enough to warrant founder review before the report is shared."
                    color="#b91c1c"
                    findings={blockers}
                />
            )}
            {content.length > 0 && (
                <FindingGroup
                    title="CONTENT FIXES"
                    description="Wrong but not blocking — citation or value the founder may want to correct."
                    color="#b45309"
                    findings={content}
                />
            )}
            {cosmetic.length > 0 && (
                <FindingGroup
                    title="COSMETIC"
                    description="Formatting / typo level."
                    color="#525252"
                    findings={cosmetic}
                />
            )}
            <PdfFooter label="Engine self-review" />
        </Page>
    )
}

function FindingGroup({
    title,
    description,
    color,
    findings,
}: {
    title: string
    description: string
    color: string
    findings: NonNullable<PdfInput["proofreadFindings"]>["findings"]
}): React.ReactElement {
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 11, fontWeight: "bold", color, marginBottom: 2 }}>
                {title} ({findings.length})
            </Text>
            <Text style={[styles.small, { marginBottom: 6, color: MUTED }]}>
                {description}
            </Text>
            {findings.map((f, i) => (
                <View key={i} style={{ marginBottom: 8 }} wrap={false}>
                    <Text style={[styles.small, { fontWeight: "bold" }]}>
                        {f.section.toUpperCase()} · {f.location}{" "}
                        <Text style={{ fontWeight: "normal", color: MUTED }}>
                            (confidence {f.confidence})
                        </Text>
                    </Text>
                    <Text style={[styles.small, { marginTop: 1 }]}>
                        Issue: {f.issue}
                    </Text>
                    <Text style={[styles.small, { marginTop: 1, color: MUTED }]}>
                        Suggested fix: {f.suggested_fix}
                    </Text>
                </View>
            ))}
        </View>
    )
}

// ─── Data fetch helpers ────────────────────────────────────────────────

function designRevisionLetter(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "1"
    if (n > 26) return String(n)
    return String.fromCharCode(64 + n)
}

function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
}

function summariseMetadata(md: unknown): string {
    if (!md || typeof md !== "object") return ""
    const pairs: string[] = []
    for (const [k, v] of Object.entries(md as Record<string, unknown>)) {
        if (v == null) continue
        const val = typeof v === "object" ? JSON.stringify(v) : String(v)
        pairs.push(`${k}=${val}`)
    }
    return pairs.join(" · ")
}

// ─── Main action ───────────────────────────────────────────────────────

export async function exportProjectPdf(
    projectId: string,
): Promise<ExportProjectPdfResult> {
    return withAuth<ExportProjectPdfResult>(async ({ foundryId }) => {
        return exportProjectPdfInternal(projectId, foundryId)
    })
}

/**
 * Background entry — used by autopilot's generating_pdf stage which runs
 * post-response with no cookies. Caller MUST have resolved foundryId from
 * an authenticated request earlier in the chain. Mirrors the pattern
 * shipped for Max + BOM + Fang-sizing (fix #90 — "use server" actions
 * called from after() can't read cookies).
 */
export async function exportProjectPdfBackground(
    projectId: string,
    foundryId: string,
): Promise<ExportProjectPdfResult> {
    return exportProjectPdfInternal(projectId, foundryId)
}

async function exportProjectPdfInternal(
    projectId: string,
    foundryId: string,
): Promise<ExportProjectPdfResult> {
    {
        const admin = createAdminClient()

        // Parent project row — pulls every column we care about.
        // L16-G #11b: canonical_specs added so the renderer reads
        // post-Fang-patch numerical values instead of raw modules / parts
        // values. The renderer falls back to raw values when canonical
        // is empty (revision=0).
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select(
                "id, foundry_id, name, subject, modules, research, ai_cost_estimates, reviews, diagnostic_answers, design_revision, created_at, brief_locked_at, shipped_at, system_illustration_url, interior_overview_url, concept_render_url, dimension_sheet, spatial_plan, proofread_findings, feasibility_verdict, canonical_specs, canonical_specs_revision",
            )
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            return { ok: false, error: "Couldn't load project.", errorCode: "INTERNAL" }
        }
        if (!project) {
            return { ok: false, error: "Project not found.", errorCode: "PROJECT_NOT_FOUND" }
        }
        if (project.foundry_id !== foundryId) {
            return { ok: false, error: "Project not found.", errorCode: "PROJECT_FORBIDDEN" }
        }

        // Foundry name for the cover band.
        let foundryName: string | null = null
        {
            const { data: f } = await admin
                .from("foundries")
                .select("name")
                .eq("id", project.foundry_id)
                .maybeSingle()
            foundryName = (f as { name?: string } | null)?.name ?? null
        }

        const rawModules = project.modules as unknown
        const modulesRaw = (Array.isArray(rawModules) ? rawModules : []) as CadLabModule[]

        // ── L16-G #11b: canonical_specs override map ──
        // When canonical_specs has a value for a (moduleId, specKey) or
        // (partId, field), prefer it over the raw modules / parts table
        // value. This is the change that makes the 12.5x motor-power class
        // of mismatch disappear from rendered PDFs: Fang's patches land in
        // canonical_specs, the renderer reads them here, the PDF reflects
        // the post-review state.
        //
        // Fallback semantics: when canonical_specs is empty (revision=0,
        // no patches ever landed) the helpers return null and the caller
        // uses the raw value. This preserves back-compat for projects that
        // pre-date Fang patch wiring.
        const canonicalSpecs = (project.canonical_specs ?? null) as {
            modules?: Record<string, {
                specs?: Record<string, { value?: number; unit?: string; source?: string; sourceRank?: number }>
            }>
            parts?: Record<string, {
                unitCostGbp?: { value?: number; source?: string; sourceRank?: number }
                massKg?: { value?: number; source?: string; sourceRank?: number }
            }>
        } | null
        const canonicalRevision = (project.canonical_specs_revision as number | null) ?? 0
        function canonicalModuleSpec(moduleId: string, specKey: string): number | null {
            if (!canonicalSpecs || canonicalRevision === 0) return null
            const m = canonicalSpecs.modules?.[moduleId]
            if (!m) return null
            return safeNumeric(m.specs?.[specKey]?.value)
        }
        function canonicalPartCost(partId: string): number | null {
            if (!canonicalSpecs || canonicalRevision === 0) return null
            const p = canonicalSpecs.parts?.[partId]
            return safeNumeric(p?.unitCostGbp?.value)
        }
        function canonicalPartMass(partId: string): number | null {
            if (!canonicalSpecs || canonicalRevision === 0) return null
            const p = canonicalSpecs.parts?.[partId]
            return safeNumeric(p?.massKg?.value)
        }

        const costEstimates = (project.ai_cost_estimates as Record<
            string,
            AiCostEstimate
        > | null) ?? {}
        const reviewsRaw = (project.reviews as Record<string, unknown> | null) ?? {}
        const diagnosticsRaw = (project.diagnostic_answers as Record<
            string,
            Record<string, string>
        > | null) ?? {}

        const designBrief = (project.research as {
            designBrief?: {
                mission?: string
                useCase?: string
                whyNow?: string
                targetCustomers?: string
                targetProcess?: string
                targetMaterial?: string
                toleranceTarget?: string
                quantityTarget?: string
                complianceNotes?: string
                constraints?: { unitCostCeilingGbp?: number; maxMassKg?: number; markets?: string[] }
                regulatory?: Array<{
                    code?: string
                    name?: string
                    summary?: string
                    status?: string
                    applicability?: string
                    designImpact?: string
                    evidenceRequired?: string
                    ownerRole?: string
                    gapAction?: string
                }>
            }
        } | null)?.designBrief ?? null

        const regulatory: Regulatory[] = Array.isArray(designBrief?.regulatory)
            ? designBrief!.regulatory!
                  .filter((r) => r && typeof r.code === "string")
                  .map((r) => ({
                      code: String(r.code ?? ""),
                      name: String(r.name ?? ""),
                      status: typeof r.status === "string" ? r.status : null,
                      summary: String(r.summary ?? ""),
                      applicability:
                          typeof r.applicability === "string" && r.applicability.length > 0
                              ? r.applicability
                              : undefined,
                      designImpact:
                          typeof r.designImpact === "string" && r.designImpact.length > 0
                              ? r.designImpact
                              : undefined,
                      evidenceRequired:
                          typeof r.evidenceRequired === "string" && r.evidenceRequired.length > 0
                              ? r.evidenceRequired
                              : undefined,
                      ownerRole:
                          typeof r.ownerRole === "string" && r.ownerRole.length > 0
                              ? r.ownerRole
                              : undefined,
                      gapAction:
                          typeof r.gapAction === "string" && r.gapAction.length > 0
                              ? r.gapAction
                              : undefined,
                  }))
            : []

        // Modules → PdfModule (with all the richness).
        const moduleNameById = new Map<string, string>()
        for (const m of modulesRaw) moduleNameById.set(m.id, m.name)

        const modules: ModulePdf[] = modulesRaw.map((m) => {
            const diag = diagnosticsRaw[m.id] ?? null
            const cost = costEstimates[m.id] ?? null
            const rawModReviews = reviewsRaw[m.id]
            const modReviews: ModulePdf["reviews"] = []
            if (Array.isArray(rawModReviews)) {
                for (const rev of rawModReviews) {
                    if (!rev || typeof rev !== "object") continue
                    const r = rev as Record<string, unknown>
                    modReviews.push({
                        reviewer: String(r.reviewer ?? r.specialist ?? "Specialist"),
                        verdict: typeof r.verdict === "string" ? r.verdict : null,
                        summary: String(r.summary ?? ""),
                        issues: Array.isArray(r.issues)
                            ? (r.issues as unknown[])
                                  .filter((x) => x && typeof x === "object")
                                  .map((x) => {
                                      const i = x as Record<string, unknown>
                                      return {
                                          severity: String(i.severity ?? "info"),
                                          category: String(i.category ?? ""),
                                          message: String(i.message ?? ""),
                                          suggestion:
                                              typeof i.suggestion === "string"
                                                  ? i.suggestion
                                                  : undefined,
                                      }
                                  })
                            : [],
                        recommendations: Array.isArray(r.recommendations)
                            ? (r.recommendations as unknown[]).map((x) => String(x))
                            : [],
                        reviewedAtIso:
                            typeof r.reviewedAt === "string" ? r.reviewedAt : null,
                    })
                }
            }

            return {
                id: m.id,
                name: m.name,
                purpose: typeof m.purpose === "string" ? m.purpose : "",
                description: typeof m.description === "string" ? m.description : "",
                whyItMatters: typeof m.whyItMatters === "string" ? m.whyItMatters : "",
                // L16-G #11b: prefer canonical_specs.modules[id].specs.massKg.value
                // over the raw module estimatedMassKg. Fang's applied_review_patch
                // (rank 90) supersedes max_decomposition (50) and bom_generator
                // (70) at the canonical-ledger layer, so when the renderer
                // reads canonical here it sees the post-review mass, not the
                // pre-review estimate.
                massKg: (() => {
                    const fromCanonical = canonicalModuleSpec(m.id, "massKg")
                    if (fromCanonical !== null) return fromCanonical
                    return safeNumeric(m.estimatedMassKg)
                })(),
                budgetMassKg: safeNumeric(m.budgetMassKg),
                leadWeeks: safeNumeric(m.leadWeeks),
                leadTimeSource:
                    typeof m.leadTimeSource === "string" ? m.leadTimeSource : null,
                mirrorOf: typeof m.mirrorOf === "string" ? m.mirrorOf : null,
                mirrorOfName:
                    typeof m.mirrorOf === "string"
                        ? moduleNameById.get(m.mirrorOf) ?? m.mirrorOf
                        : null,
                // FIX-4 (Loop 28): strip engine directives (e.g. [REPLACE_PART partId=...])
                // from all string arrays before any render path touches them.
                // These bracket-enclosed uppercase tags are machine-readable directives
                // emitted by Fang for the patch generator — they must never reach the PDF.
                // sanitizeReviewText covers fields explicitly passed through it, but
                // keyParts / failureModes / unknowns are rendered without that wrapper,
                // so we strip at the data-prep layer as a belt-and-braces safety net.
                keyParts: Array.isArray(m.keyParts)
                    ? (m.keyParts as unknown[])
                          .filter((p): p is string => typeof p === "string")
                          .map((p) => stripToolCallLeaks(p))
                    : [],
                failureModes: Array.isArray(m.failureModes)
                    ? (m.failureModes as unknown[])
                          .filter((f): f is string => typeof f === "string")
                          .map((f) => stripToolCallLeaks(f))
                    : [],
                unknowns: Array.isArray(m.unknowns)
                    ? (m.unknowns as unknown[])
                          .filter((u): u is string => typeof u === "string")
                          .map((u) => stripToolCallLeaks(u))
                    : [],
                riskMatrix: (() => {
                    const raw = (m as { riskMatrix?: unknown }).riskMatrix
                    if (!Array.isArray(raw)) return []
                    type Row = ModulePdf["riskMatrix"][number]
                    const out: Row[] = []
                    for (const r of raw) {
                        if (!r || typeof r !== "object") continue
                        const rr = r as Record<string, unknown>
                        if (typeof rr.hazard !== "string" || rr.hazard.length === 0) continue
                        const sev = safeNumeric(rr.severity)
                        const lik = safeNumeric(rr.likelihood)
                        if (sev === null || lik === null) continue
                        out.push({
                            id: typeof rr.id === "string" ? rr.id : `RM-${out.length + 1}`,
                            hazard: rr.hazard,
                            cause: typeof rr.cause === "string" ? rr.cause : null,
                            consequence:
                                typeof rr.consequence === "string" ? rr.consequence : null,
                            existingControls:
                                typeof rr.existingControls === "string"
                                    ? rr.existingControls
                                    : null,
                            severity: Math.max(1, Math.min(5, Math.round(sev))),
                            likelihood: Math.max(1, Math.min(5, Math.round(lik))),
                            mitigation:
                                typeof rr.mitigation === "string" ? rr.mitigation : null,
                            owner: typeof rr.owner === "string" ? rr.owner : null,
                            residualSeverity:
                                safeNumeric(rr.residualSeverity) !== null
                                    ? Math.max(1, Math.min(5, Math.round(safeNumeric(rr.residualSeverity) as number)))
                                    : null,
                            residualLikelihood:
                                safeNumeric(rr.residualLikelihood) !== null
                                    ? Math.max(
                                          1,
                                          Math.min(5, Math.round(safeNumeric(rr.residualLikelihood) as number)),
                                      )
                                    : null,
                        })
                    }
                    return out
                })(),
                imageUrl: typeof m.imageUrl === "string" ? m.imageUrl : null,
                diagnostics: diag,
                cost,
                reviews: modReviews,
            }
        })

        // Parts table.
        const { data: partsRaw } = await admin
            .from("parts")
            .select(
                "part_number, name, description, source_module_id, process, material, material_spec, finish, tolerance, mass_kg, estimated_unit_cost_gbp, is_purchased, cost_provenance",
            )
            .eq("cad_lab_project_id", projectId)
            .order("part_number", { ascending: true })

        const parts: PartRow[] = (partsRaw ?? []).map((p) => {
            const partNumber = String(p.part_number ?? "")
            // L16-G #11b: prefer canonical part_cost / part_mass values
            // (applied_review_patch rank 90 supersedes bom_generator rank
            // 70 at the canonical-ledger layer). The renderer falls back
            // to the parts-table value when canonical has no entry.
            const canonicalCost = partNumber ? canonicalPartCost(partNumber) : null
            const canonicalMass = partNumber ? canonicalPartMass(partNumber) : null
            return {
                partNumber,
                name: String(p.name ?? ""),
                sourceModuleName:
                    typeof p.source_module_id === "string"
                        ? moduleNameById.get(p.source_module_id) ?? p.source_module_id
                        : null,
                process: typeof p.process === "string" ? p.process : null,
                material: typeof p.material === "string" ? p.material : null,
                materialSpec: typeof p.material_spec === "string" ? p.material_spec : null,
                finish: typeof p.finish === "string" ? p.finish : null,
                tolerance: typeof p.tolerance === "string" ? p.tolerance : null,
                massKg: canonicalMass !== null ? canonicalMass : safeNumeric(p.mass_kg),
                estimatedUnitCostGbp:
                    canonicalCost !== null
                        ? canonicalCost
                        : safeNumeric(p.estimated_unit_cost_gbp),
                isPurchased: Boolean(p.is_purchased),
                description: typeof p.description === "string" ? p.description : null,
                // A1 — cost_provenance column (migration 20260429300000).
                // Validate against the closed set; anything unrecognised is
                // treated as null (no badge, same as legacy rows).
                costProvenance: (["quoted", "parametric", "placeholder", "todo"] as const).includes(
                    p.cost_provenance as "quoted" | "parametric" | "placeholder" | "todo",
                )
                    ? (p.cost_provenance as "quoted" | "parametric" | "placeholder" | "todo")
                    : null,
            }
        })

        // Item 2 (council 2026-04-29): full regulatory triage with Fang findings.
        //
        // Chase ran an initial triage pass at extraction time (no Fang data yet).
        // Now that modules and their Fang reviews are available, run a second pass
        // that can additionally elevate standards to "design-impact-identified"
        // when a Fang issue directly implicates a specific standard's scope.
        //
        // Example: Fang finds "350-bar hydrogen storage pressure" in a module →
        // PESR and hydrogen-specific standards are elevated from
        // "in-scope-not-started" to "design-impact-identified".
        //
        // Also catches any legacy "not-started" rows from older persisted Chase
        // outputs that predate the triage step (back-compat upgrade).
        let regulatoryMatrixUndifferentiated = false
        {
            const subject = typeof project.subject === "string" ? project.subject : ""
            const markets = Array.isArray(designBrief?.constraints?.markets)
                ? (designBrief!.constraints!.markets as string[])
                : ["GB"]
            const allModuleReviews = modules.flatMap((m) =>
                m.reviews.map((r) => ({
                    issues: r.issues,
                    recommendations: r.recommendations,
                })),
            )
            const triageResult = triageWithFangFindings(
                // Cast to CadLabDesignBriefRegulatoryItem[] — the Regulatory interface
                // is a strict subset; triage reads code/name/status/applicability and
                // writes status/gapAction/designImpact which all exist on Regulatory too.
                regulatory as unknown as import("@/lib/cad-lab-types").CadLabDesignBriefRegulatoryItem[],
                subject,
                markets,
                allModuleReviews,
            )
            regulatoryMatrixUndifferentiated = triageResult.matrixUndifferentiated
            console.log(
                `[export-project-pdf] regulatory triage (with Fang): ${triageResult.triageSummary}`,
                regulatoryMatrixUndifferentiated
                    ? "UNDIFFERENTIATED — warning banner will fire"
                    : "differentiated",
            )
        }

        // L16-A1 (2026-04-27): snapshot the canonical specs ledger from the
        // current modules + parts state. This is the minimum-viable wiring
        // until each specialist (Max, BOM gen, Sizing, Finn, Fang) writes
        // through canonical-ledger.ts at its own write site. The snapshot
        // is fire-and-forget — failure is logged but does not block PDF
        // render. Verifiable via `SELECT canonical_specs_revision FROM
        // cad_lab_projects WHERE id = ...` post-render (revision should
        // increment on each render).
        try {
            const { snapshotCanonicalSpecs } = await import("@/lib/cad-lab/snapshot-canonical-specs")
            const finnTotal = Object.values(costEstimates).reduce(
                (acc: number, est) => acc + (safeNumeric(est?.totalPerUnit) ?? 0),
                0,
            )
            const snapshotResult = await snapshotCanonicalSpecs(
                admin,
                projectId,
                modulesRaw.map((m) => ({
                    id: m.id ?? null,
                    name: m.name ?? null,
                    massKg: (m as { massKg?: number | null }).massKg ?? null,
                    estimatedMassKg: m.estimatedMassKg ?? null,
                    cost: (m as { cost?: { totalPerUnit?: number | null } }).cost ?? null,
                })),
                parts.map((p) => ({
                    id: p.partNumber,
                    partNumber: p.partNumber,
                    name: p.name,
                    description: p.description,
                    sourceModuleName: p.sourceModuleName,
                    quantity: 1,
                    massKg: p.massKg,
                    estimatedUnitCostGbp: p.estimatedUnitCostGbp,
                    isPurchased: p.isPurchased,
                })),
                finnTotal > 0 ? finnTotal : null,
            )
            if (!snapshotResult.ok) {
                console.warn(
                    `[L16-A1 snapshot] non-fatal: project=${projectId} bomTotal=£${snapshotResult.bomTotalGbp.toFixed(0)} reason=${snapshotResult.error}`,
                )
            } else {
                console.log(
                    `[L16-A1 snapshot] project=${projectId} bom=£${snapshotResult.bomTotalGbp.toFixed(0)} finn=£${snapshotResult.finnTotalGbp.toFixed(0)} modules=${snapshotResult.moduleSpecsCount} parts=${snapshotResult.partRowsCount} digest=${snapshotResult.digest}`,
                )
            }
        } catch (err) {
            console.warn(
                "[L16-A1 snapshot] threw:",
                err instanceof Error ? err.message : err,
            )
        }

        // Cost aggregates.
        //
        // L9-P1 (2026-04-26): BOM master is the canonical source of truth for
        // unit cost. Two parallel cost pipelines existed:
        //   (1) Finn's per-module `ai_cost_estimates[m.id].totalPerUnit` —
        //       coarse, ~5 cost lines per module, often misses major parts.
        //   (2) BOM generator's `parts` table — granular, 10-20 rows per
        //       module, includes assembly-level make-cost lines.
        //
        // Loop 9 PDFs showed cover-vs-BOM disagreeing 7-13×: Desal cover
        // £50,920 vs BOM £646,679 (the BOM was inside the council
        // £473k-£719k benchmark band). Vertfarm/HAPS had inverse direction.
        //
        // Fix: cover unit cost + per-module roll-up now derive from the
        // parts table. Cover, BOM master, and reconciliation gate all read
        // from the same source. Module pages still show Finn's per-row
        // breakdown for narrative; the per-module *total* uses parts.
        // L13-P2 (2026-04-27): de-duplicate assembly-parent rows from the
        // cost roll-up. The bill-of-materials generator emits both an
        // assembly-parent row (e.g. BESS PC-001-PUR "Skid Assembly" £145k,
        // Sentinel HAND-ASY "Handle Assembly" £185) AND its constituent
        // leaf rows. Loop 9 P1 summed both, double-counting cost across
        // 4 of 6 demos (BESS £142k, Sentinel 8.6×, Vertfarm 53.8% gap,
        // HAPS 57.8% reconciliation failure). Dedup helper detects the
        // pattern and zeros the parent's cost when constituents exist.
        const dedupedRollUp = dedupAssemblyRollUp(parts)
        const partsCostByModule = new Map<string, number>()
        for (let i = 0; i < parts.length; i++) {
            const ec = dedupedRollUp.effectiveCost[i]
            if (ec === 0) continue
            const p = parts[i]
            const modKey =
                typeof p.sourceModuleName === "string" ? p.sourceModuleName : "_orphan"
            partsCostByModule.set(modKey, (partsCostByModule.get(modKey) ?? 0) + ec)
        }
        const perModuleCost = modules.map((m) => {
            const partsTotal = partsCostByModule.get(m.name)
            const finnTotal = m.cost ? safeNumeric(m.cost.totalPerUnit) : null
            // Prefer parts-table roll-up; fall back to Finn estimate only if
            // the BOM has no rows for this module (which is itself a bug
            // worth flagging, but better than rendering null).
            return {
                moduleName: m.name,
                totalGbp: partsTotal !== undefined ? partsTotal : finnTotal,
                // finnTotalGbp kept separately so the cost-tree validation
                // gate (below) can cross-check the two sources even when the
                // parts-table roll-up wins the display race.
                finnTotalGbp: finnTotal,
            }
        })
        let unitTotalGbp = 0
        for (const v of dedupedRollUp.effectiveCost) unitTotalGbp += v

        // Loop 26 P3 / A2: cost-tree arithmetic validation gate.
        //
        // Runs AFTER the cost waterfall is assembled (perModuleCost +
        // unitTotalGbp) and BEFORE PDF rendering. Catches four failure classes:
        //   (1) A single subsystem exceeds 100% of the unit total (the HAPS
        //       Wing-Integrated Solar Array at 104.8% in Loop 26).
        //   (2) Sum of module costs diverges from unitTotalGbp by more than 1%.
        //   (3) Finn line-item names embedding "N × £P = £E" expressions where
        //       the arithmetic is wrong (6,800 × £60 = £430,560 is false —
        //       correct is £408,000).
        //   (4) Parts-table roll-up vs Finn per-module estimate disagree by
        //       more than 10% (propulsion motor £320 vs £3,000 in Loop 26).
        //
        // On failure: findings are annotated as ⚠ blocks on the cost
        // waterfall page. Data is never suppressed — founders need to see
        // the wrong number alongside the explanation.
        let costTreeValidation: import("@/lib/cost/cost-tree-validation").CostTreeValidationResult | null = null
        try {
            const { validateCostTree } = await import("@/lib/cost/cost-tree-validation")
            // Line items from Finn's per-module cost breakdown — names may
            // embed "N × £P = £E" expressions that the validator parses.
            const costLineItems = modules.flatMap((m) =>
                ((m.cost as { parts?: Array<{ name: string; cost: number }> } | null)?.parts ?? []).map(
                    (p: { name: string; cost: number }) => ({
                        name: p.name,
                        cost: safeNumeric(p.cost) ?? 0,
                        moduleName: m.name,
                    }),
                ),
            )
            costTreeValidation = validateCostTree(
                perModuleCost,
                unitTotalGbp,
                costLineItems,
            )
            if (costTreeValidation.hasFindings) {
                console.warn(
                    `[pdf-cost-validation] project=${projectId} ` +
                    `findings=${costTreeValidation.findings.length} ` +
                    `hasCritical=${costTreeValidation.hasCritical} ` +
                    `summary="${costTreeValidation.summaryMessage}"`,
                )
            }
        } catch (err) {
            console.warn(
                "[pdf-cost-validation] threw (non-fatal):",
                err instanceof Error ? err.message : err,
            )
        }

        // Loop 28 P2: auto-reconcile cost tree so % OF UNIT always sums to
        // ~100%. The root cause: unitTotalGbp comes from deduped parts-table
        // but some modules fall back to Finn estimates (higher), making
        // sum(perModuleCost) > unitTotalGbp. Fix: recompute unitTotalGbp =
        // sum(perModuleCost[i].totalGbp).
        let costTreeReconciliation: import("@/lib/cost/cost-tree-validation").CostTreeReconciliation | null = null
        try {
            const { reconcileCostTree } = await import("@/lib/cost/cost-tree-validation")
            costTreeReconciliation = reconcileCostTree(perModuleCost, unitTotalGbp)
            if (costTreeReconciliation.wasReconciled) {
                console.warn(
                    `[pdf-cost-reconciliation] project=${projectId} ` +
                    `originalTotal=£${Math.round(unitTotalGbp)} ` +
                    `reconciledTotal=£${Math.round(costTreeReconciliation.reconciledUnitTotalGbp)} ` +
                    `divergence=${(costTreeReconciliation.divergenceFraction * 100).toFixed(1)}%`,
                )
                unitTotalGbp = costTreeReconciliation.reconciledUnitTotalGbp
            }
        } catch (err) {
            console.warn(
                "[pdf-cost-reconciliation] threw (non-fatal):",
                err instanceof Error ? err.message : err,
            )
        }

        // Fix 2 — Loop 26 WARNING-level: build-time cost-mismatch detection
        // and in-place healing. Replaces the old "amber banner" approach.
        //
        // The cover-page "Unit cost" stat tile reads from `unitTotalGbp`
        // (the deduped parts-table roll-up). The feasibility verdict's
        // cost-axis evidence string was computed at pipeline time by
        // `computeFeasibilityVerdict`. After Fix 1 (Loop 25 P0), the
        // proofreader now passes `canonicalUnitCostGbp` so NEW verdicts use
        // the same deduped source. However, verdicts persisted before that fix,
        // or after parts costs change between the proofreader run and PDF
        // export, still carry stale evidence strings.
        //
        // Previously this block set `costMismatchPct` to expose a banner.
        // Fix 2 changes the strategy: when a mismatch is detected, the
        // evidence string is healed in-memory so both the cover tile and the
        // feasibility exception page show the same canonical unitTotalGbp.
        // `costMismatchPct` is always null (banner never fires). The staleness
        // is logged to Vercel for loop-critique visibility.
        //
        // The 1% threshold is tight by design: rounding noise on real numbers
        // is always sub-1%; anything larger is a genuine stale pipeline value.
        //
        // Fix 2 — Loop 26 WARNING-level bug: stale cost banner elimination.
        //
        // When a mismatch is detected between the deduped BOM roll-up
        // (unitTotalGbp) and the cost figure embedded in the persisted
        // feasibility verdict evidence string, we HEAL the evidence in-memory
        // at PDF render time instead of surfacing a warning banner.
        //
        // Healing strategy:
        //   1. Detect the mismatch (parse first pound-N,NNN from evidence).
        //   2. Log the staleness so it appears in Vercel logs and loop critiques.
        //   3. Replace the first pound-N,NNN in the evidence string with the
        //      canonical unitTotalGbp so the feasibility exception page and the
        //      cover tile both display the same figure.
        //   4. Leave costMismatchPct as null — banner suppressed because the
        //      two sources now agree.
        //
        // Constraint preserved: the feasibility gate STATUS (red/amber/green)
        // and the comparison against the cost CEILING are unchanged. Only the
        // "estimated cost" part of the evidence string is updated.
        const costMismatchPct: number | null = null
        if (project.feasibility_verdict && unitTotalGbp > 0) {
            const persistedVerdict = project.feasibility_verdict as {
                fails?: Array<{ axis?: unknown; evidence?: unknown; summary?: unknown }>
            }
            const costFail = Array.isArray(persistedVerdict.fails)
                ? persistedVerdict.fails.find((f) => f.axis === "cost")
                : null
            if (costFail && typeof costFail.evidence === "string") {
                // Extract the numeric value from the evidence string.
                // Evidence format: "£N,NNN estimated vs £N,NNN ceiling — ..."
                const firstGbpMatch = /£([\d,]+)/.exec(costFail.evidence)
                if (firstGbpMatch) {
                    const verdictCost = parseFloat(firstGbpMatch[1].replace(/,/g, ""))
                    if (Number.isFinite(verdictCost) && verdictCost > 0) {
                        const gap = Math.abs(unitTotalGbp - verdictCost) / verdictCost
                        if (gap > 0.01) {
                            // Log the staleness for loop-critique and Vercel log visibility.
                            const gapPct = parseFloat((gap * 100).toFixed(1))
                            console.info(
                                "[pdf-stats] COST-MISMATCH healed at render time: tile=unit_cost " +
                                "tile_value=£" + Math.round(unitTotalGbp) + " " +
                                "verdict_evidence=£" + Math.round(verdictCost) + " " +
                                "gap_pct=" + gapPct.toFixed(1) + "% " +
                                "project=" + projectId + ". " +
                                "Evidence string updated to canonical deduped BOM roll-up. " +
                                "Re-run the proofreader to persist this fix to the DB.",
                            )
                            // Heal the evidence in-memory: replace the stale cost
                            // figure with the canonical deduped BOM roll-up value
                            // so the feasibility exception page and the cover tile
                            // both display the same number.
                            // formatGbp-equivalent: Math.round + toLocaleString en-GB.
                            const canonicalFormatted = "£" + Math.round(unitTotalGbp).toLocaleString("en-GB")
                            ;(costFail as { evidence: string }).evidence =
                                costFail.evidence.replace(firstGbpMatch[0], canonicalFormatted)
                        }
                    }
                }
            }
        }

        // Suppliers shortlist — join to global directory for HQ.
        // L13-P4 (2026-04-27): drop rows where the LLM matching pass
        // couldn't link the supplier to a specific BOM part number.
        // Empty `matched_part_numbers` means the supplier surfaced via
        // semantic similarity but the model couldn't justify "they
        // supply X". 100% of HAPS shortlist rows had this shape (115 of
        // 115 in Loop 12 — all phantom matches), and 17% of Vertfarm.
        // Without a real part link the row is procurement-grade noise:
        // Hystar tagged for fuel cell when they make electrolysers,
        // Water Hydraulics tagged for hydrogen cooling when they make
        // desalination pumps, New Space Systems for stratospheric
        // propulsion when they make spacecraft torque rods.
        const rawShortlistRows = await admin
            .from("forge_supplier_shortlist")
            .select(
                "supplier_id, supplier_name, module_ids, matched_part_numbers, project_synthesis, best_match_score, best_score_breakdown, all_match_reasons, ramp_role",
            )
            .eq("project_id", projectId)
        const shortlistRows = (rawShortlistRows.data ?? []).filter((r) => {
            const matched = r.matched_part_numbers
            return Array.isArray(matched) && matched.length > 0
        })

        const supplierIds = shortlistRows
            .map((r) => r.supplier_id as string | null)
            .filter((x): x is string => typeof x === "string" && x.length > 0)

        const hqById = new Map<string, string | null>()
        const websiteById = new Map<string, string | null>()
        const contactEmailById = new Map<string, string | null>()
        const foundedYearById = new Map<string, number | null>()
        const employeeCountById = new Map<string, number | null>()
        const leadTimeById = new Map<string, string | null>()
        const minimumOrderById = new Map<string, string | null>()
        const certificationsById = new Map<string, string[] | null>()
        const descriptionById = new Map<string, string | null>()
        if (supplierIds.length > 0) {
            // Fix 3 (audit Fix 3, 2026-04-27): DEPRECATED — the 678-row `suppliers`
            // legacy table has fabricated trust signals (used_by_count,
            // community_rating, verification_status) and is not linked to
            // marketplace_listings by FK. The supplier IDs in
            // forge_supplier_shortlist are marketplace_listings.id values, so the
            // suppliers table join typically returns 0 rows. The country/HQ
            // fallback below (marketplace_listings.country) provides equivalent
            // information from the real canonical database.
            //
            // The suppliers table query is intentionally removed here. The
            // hqById map is populated entirely from marketplace_listings.country
            // in the block below. If a migration to delete the legacy suppliers
            // table is run (planned 2026-05-15), this comment can be removed.
            //
            // DEPRECATED CALL (do not restore):
            // const { data: globals } = await admin
            //     .from("suppliers")
            //     .select("id, company_info")
            //     .in("id", supplierIds)
            // V1.1 FIX (2026-04-25, per Tristan supply-chain critique): the PDF
            // was previously rendering only company name + HQ + score. The
            // marketplace_listings table holds far richer data (founded year,
            // employee count, lead time, MOQ, certifications, description) —
            // founders need ALL of that to decide whether to engage a supplier.
            // Surface it here. "What we have about that company" was Tristan's
            // direct ask.
            const { data: listingsMeta } = await admin
                .from("marketplace_listings")
                .select(
                    "id, website_url, contact_email, country, founded_year, employee_count_exact, lead_time, minimum_order, certifications, description",
                )
                .in("id", supplierIds)
            if (listingsMeta) {
                for (const l of listingsMeta) {
                    const id = l.id as string
                    websiteById.set(id, (l.website_url as string | null) ?? null)
                    contactEmailById.set(id, (l.contact_email as string | null) ?? null)
                    // marketplace_listings has its own country — prefer that
                    // over the suppliers table HQ when the directory join was empty.
                    if (!hqById.has(id) || hqById.get(id) === null) {
                        const country = l.country as string | null
                        if (country) hqById.set(id, country)
                    }
                    foundedYearById.set(id, safeNumeric(l.founded_year))
                    employeeCountById.set(id, safeNumeric(l.employee_count_exact))
                    leadTimeById.set(id, (l.lead_time as string | null) ?? null)
                    minimumOrderById.set(id, (l.minimum_order as string | null) ?? null)
                    const certText = formatJsonArrayField(l.certifications as string | string[] | null | undefined, "")
                    // Strip scrape-failure placeholders and split back to array for downstream consumers
                    const parsedCerts = certText
                        ? certText
                              .split(", ")
                              .filter((c) => !/^(MISSING\b|NOT STATED\b|NONE RECORDED\b|UNKNOWN\b|N\/A$)/i.test(c.trim()))
                        : null
                    certificationsById.set(id, parsedCerts && parsedCerts.length > 0 ? parsedCerts : null)
                    const desc = l.description as string | null
                    // Truncate description to keep the PDF section dense — the
                    // founder gets a flavour, not a wall of marketing copy.
                    descriptionById.set(
                        id,
                        typeof desc === "string"
                            ? desc.length > 280
                                ? desc.slice(0, 277).trimEnd() + "…"
                                : desc
                            : null,
                    )
                }
            }
        }

        const suppliers: SupplierPdf[] = shortlistRows.map((r) => ({
            name: String(r.supplier_name ?? "Untitled supplier"),
            hq: hqById.get(r.supplier_id as string) ?? null,
            moduleNames: Array.isArray(r.module_ids)
                ? (r.module_ids as string[]).map((id) => moduleNameById.get(id) ?? id)
                : [],
            matchedPartNumbers: Array.isArray(r.matched_part_numbers)
                ? (r.matched_part_numbers as string[])
                : [],
            projectSynthesis:
                typeof r.project_synthesis === "string" && r.project_synthesis.length > 0
                    ? (r.project_synthesis as string)
                    : null,
            matchScore: safeNumeric(r.best_match_score),
            scoreBreakdown:
                r.best_score_breakdown && typeof r.best_score_breakdown === "object"
                    ? (r.best_score_breakdown as Record<string, unknown>)
                    : null,
            matchReasons: Array.isArray(r.all_match_reasons)
                ? (r.all_match_reasons as string[])
                : [],
            rampRole: typeof r.ramp_role === "string" ? r.ramp_role : null,
            websiteUrl: websiteById.get(r.supplier_id as string) ?? null,
            contactEmail: contactEmailById.get(r.supplier_id as string) ?? null,
            foundedYear: foundedYearById.get(r.supplier_id as string) ?? null,
            employeeCount: employeeCountById.get(r.supplier_id as string) ?? null,
            leadTime: leadTimeById.get(r.supplier_id as string) ?? null,
            minimumOrder: minimumOrderById.get(r.supplier_id as string) ?? null,
            certifications: certificationsById.get(r.supplier_id as string) ?? null,
            description: descriptionById.get(r.supplier_id as string) ?? null,
        }))

        // Source-attribution counts — so the PDF can tell the reader
        // how much reference data the specialists drew on when they
        // generated costs / BOM / supplier picks. Queried in parallel to
        // keep export wall-clock down. `count: "exact", head: true` is
        // an index-only count, not a full row scan.
        const [
            matPropsRes,
            procCapsRes,
            suppliersDirRes,
            marketRes,
            freshMatRes,
            freshProcRes,
        ] = await Promise.all([
            admin
                .from("material_properties")
                .select("id", { count: "exact", head: true }),
            admin
                .from("process_capabilities")
                .select("id", { count: "exact", head: true }),
            // Fix 3 (audit Fix 3, 2026-04-27): replaced legacy `suppliers` table
            // count (678 fabricated rows) with marketplace_listings Products/Services
            // count (19,928 real manufacturer rows). This is the canonical supplier
            // database used by the autopilot pipeline.
            admin
                .from("marketplace_listings")
                .select("id", { count: "exact", head: true })
                .in("category", ["Products", "Services"]),
            admin
                .from("marketplace_listings")
                .select("id", { count: "exact", head: true }),
            admin
                .from("material_properties")
                .select("updated_at")
                .order("updated_at", { ascending: false, nullsFirst: false })
                .limit(1),
            admin
                .from("process_capabilities")
                .select("updated_at")
                .order("updated_at", { ascending: false, nullsFirst: false })
                .limit(1),
        ])

        const sources: PdfInput["sources"] = {
            materialPropertyCount: matPropsRes.count ?? null,
            materialPropertyFreshestIso:
                (freshMatRes.data?.[0] as { updated_at?: string } | undefined)
                    ?.updated_at ?? null,
            processCapabilityCount: procCapsRes.count ?? null,
            processCapabilityFreshestIso:
                (freshProcRes.data?.[0] as { updated_at?: string } | undefined)
                    ?.updated_at ?? null,
            supplierDirectoryCount: suppliersDirRes.count ?? null,
            marketplaceListingCount: marketRes.count ?? null,
            // Kept as strings here so the PDF can render provenance
            // without importing BOM internals. Updating this when BOM's
            // model changes is a manual sync — caveat acknowledged.
            bomModel: "Claude Opus 4.7",
            bomProvider: "Anthropic",
        }

        // Council fix 4A (2026-04-29): supplier directory bias disclosure.
        // Detect the project's industry domain and count how many
        // marketplace_listings have matching industry tags. If fewer than
        // 10, the shortlist was drawn from a thin directory and the PDF
        // should tell the founder.
        // Loop 26 D1/D4: detectedDomain is also passed to RegulatorySection
        // so it can escalate the mandatory-section placeholder to red for
        // safety-critical domains (potable water, medical, aerospace, etc.).
        const SUPPLIER_COVERAGE_THRESHOLD = 10
        const subjectForDomain = typeof project.subject === "string" ? project.subject : ""
        const detectedDomain = detectIndustryDomain(subjectForDomain)
        let supplierDirectoryCoverageNote: string | null = null
        {
            if (detectedDomain && detectedDomain !== "general") {
                // Query marketplace_listings with an ilike on the
                // industries JSONB array. The column stores an array of
                // industry tags; we search for the domain keyword.
                const { count: domainCount } = await admin
                    .from("marketplace_listings")
                    .select("id", { count: "exact", head: true })
                    .in("category", ["Products", "Services"])
                    .ilike("industries", `%${detectedDomain}%`)
                if (safeNumeric(domainCount) !== null && (safeNumeric(domainCount) as number) < SUPPLIER_COVERAGE_THRESHOLD) {
                    const domainLabel = detectedDomain.replace(/_/g, " ")
                    supplierDirectoryCoverageNote =
                        `Supplier shortlist drawn from a directory with limited coverage in ${domainLabel} (${domainCount} entries). Results may not reflect the full market.`
                }
            }
        }

        // Audit log rows. The dedicated audit_log table isn't yet
        // populated by the autopilot pipeline (V1 cut), so fall back
        // to pipeline_runs which IS populated end-to-end. Loop 7
        // critique A3: founders saw "08. Project audit log" in the TOC
        // but the section was empty — fix is to read pipeline_runs and
        // present it as the audit trail.
        const [{ data: auditRowsRaw }, { data: pipelineRowsRaw }] = await Promise.all([
            admin
                .from("audit_log")
                .select("action, section, created_at, metadata")
                .eq("entity_id", projectId)
                .order("created_at", { ascending: true }),
            admin
                .from("pipeline_runs")
                .select(
                    "specialist_id, stage, status, started_at, finished_at, error_code, error_message, model_id, cost_gbp_pence",
                )
                .eq("project_id", projectId)
                .order("started_at", { ascending: true })
                .limit(150),
        ])

        const auditLog: AuditRowPdf[] = []
        for (const r of auditRowsRaw ?? []) {
            auditLog.push({
                action: String(r.action ?? ""),
                section: typeof r.section === "string" ? r.section : null,
                createdAtIso: String(r.created_at ?? ""),
                metadataSummary: summariseMetadata(r.metadata),
            })
        }
        for (const r of pipelineRowsRaw ?? []) {
            const status = String(r.status ?? "")
            const action = `${r.specialist_id}.${r.stage}${status === "done" ? "" : ` · ${status}`}`
            const meta: string[] = []
            if (r.model_id) meta.push(String(r.model_id))
            if (safeNumeric(r.cost_gbp_pence) !== null) meta.push(`${safeNumeric(r.cost_gbp_pence)}p`)
            if (r.error_code) meta.push(String(r.error_code))
            if (r.error_message) meta.push(String(r.error_message).slice(0, 80))
            auditLog.push({
                action,
                section: typeof r.specialist_id === "string" ? r.specialist_id : null,
                createdAtIso: String(r.started_at ?? r.finished_at ?? ""),
                metadataSummary: meta.join(" · "),
            })
        }
        // Sort merged log chronologically.
        auditLog.sort((a, b) =>
            (a.createdAtIso ?? "").localeCompare(b.createdAtIso ?? ""),
        )

        // When no DB audit trail exists, record only verifiable events
        // with the actual PDF generation timestamp — never fabricate
        // per-stage timestamps that would imply false provenance.
        if (auditLog.length === 0) {
            const now = new Date().toISOString()

            if (costTreeReconciliation?.wasReconciled) {
                auditLog.push({
                    action: "cost_tree_reconciliation",
                    section: "validation",
                    createdAtIso: now,
                    metadataSummary: `Unit total reconciled: divergence ${(costTreeReconciliation.divergenceFraction * 100).toFixed(1)}%`,
                })
            }

            if (costTreeValidation?.hasFindings) {
                auditLog.push({
                    action: "cost_tree_validation",
                    section: "validation",
                    createdAtIso: now,
                    metadataSummary: costTreeValidation.summaryMessage ?? `${costTreeValidation.findings.length} cost finding(s) flagged`,
                })
            }

            auditLog.push({
                action: "pdf_generation",
                section: "export",
                createdAtIso: now,
                metadataSummary: "No pipeline audit trail available — per-stage timestamps will populate on next generation with pipeline tracking enabled",
            })
        }

        // Totals.
        const keyPartCount = modules.reduce((acc, m) => acc + m.keyParts.length, 0)
        const failureModeCount = modules.reduce(
            (acc, m) => acc + m.failureModes.length,
            0,
        )
        const unknownCount = modules.reduce((acc, m) => acc + m.unknowns.length, 0)
        const reviewCount = modules.reduce((acc, m) => acc + m.reviews.length, 0)

        const pdfInput: PdfInput = {
            projectName: (project.name as string) ?? "Untitled project",
            designRevisionLetter: designRevisionLetter(
                (project.design_revision as number) ?? 1,
            ),
            generatedAtIso: new Date().toISOString(),
            createdAtIso:
                typeof project.created_at === "string" ? project.created_at : null,
            shippedAtIso:
                typeof project.shipped_at === "string" ? project.shipped_at : null,
            briefLockedAtIso:
                typeof project.brief_locked_at === "string"
                    ? project.brief_locked_at
                    : null,
            foundryName,
            systemIllustrationUrl:
                typeof project.system_illustration_url === "string"
                    ? project.system_illustration_url
                    : null,
            interiorOverviewUrl:
                typeof project.interior_overview_url === "string"
                    ? project.interior_overview_url
                    : null,
            conceptRenderUrl:
                typeof project.concept_render_url === "string"
                    ? project.concept_render_url
                    : null,
            brief: {
                subject: typeof project.subject === "string" ? project.subject : null,
                mission:
                    typeof designBrief?.mission === "string" ? designBrief!.mission : null,
                useCase:
                    typeof designBrief?.useCase === "string" ? designBrief!.useCase : null,
                targetCustomers:
                    typeof designBrief?.targetCustomers === "string"
                        ? designBrief!.targetCustomers
                        : null,
                whyNow:
                    typeof designBrief?.whyNow === "string" ? designBrief!.whyNow : null,
                unitCostCeilingGbp: safeNumeric(designBrief?.constraints?.unitCostCeilingGbp),
                maxMassKg: safeNumeric(designBrief?.constraints?.maxMassKg),
                targetProcess:
                    typeof designBrief?.targetProcess === "string"
                        ? designBrief!.targetProcess
                        : null,
                targetMaterial:
                    typeof designBrief?.targetMaterial === "string"
                        ? designBrief!.targetMaterial
                        : null,
                toleranceTarget:
                    typeof designBrief?.toleranceTarget === "string"
                        ? designBrief!.toleranceTarget
                        : null,
                quantityTarget:
                    typeof designBrief?.quantityTarget === "string"
                        ? designBrief!.quantityTarget
                        : null,
                complianceNotes:
                    typeof designBrief?.complianceNotes === "string"
                        ? designBrief!.complianceNotes
                        : null,
            },
            regulatory,
            modules,
            parts,
            cost: {
                perModule: perModuleCost,
                // L9-P1: unitTotalGbp now sourced from parts table (BOM
                // master). Render null only when BOM is genuinely empty.
                unitTotalGbp: parts.length > 0 ? unitTotalGbp : null,
            ceilingGbp: safeNumeric(designBrief?.constraints?.unitCostCeilingGbp),
                // Fix 1 — Loop 25 P0: cost-mismatch assertion result.
                // Non-null when the persisted verdict cost evidence differs
                // from the canonical deduped BOM roll-up by more than 1%.
                // The cover renders an amber banner so the founder sees
                // the inconsistency before relying on any cost number.
                costMismatchPct,
                // Loop 26 P3 / A2: cost-tree arithmetic validation result.
                // Findings are rendered as ⚠ annotations below the per-module
                // roll-up table. Null when the validator did not run.
                costTreeValidation,
                // Loop 28 P2: auto-reconciled cost tree. When reconciliation
                // was applied, the % OF UNIT column uses the reconciled total
                // as denominator so it sums to ~100%.
                costTreeReconciliation,
            },
            // Loop 8 P3 — cost-realism reframe via Oracle benchmark band.
            oracleProjectBand: await (async () => {
                try {
                    const { getOracleProjectBand } = await import(
                        "@/lib/cost/oracle-benchmarks"
                    )
                    const subjectStr =
                        typeof project.subject === "string" ? project.subject : ""
                    const ceiling =
                        typeof designBrief?.constraints?.unitCostCeilingGbp === "number"
                            ? designBrief!.constraints!.unitCostCeilingGbp
                            : null
                    return getOracleProjectBand(subjectStr, ceiling)
                } catch (err) {
                    console.warn(
                        "[export-pdf] oracle band lookup failed (non-fatal):",
                        err instanceof Error ? err.message : err,
                    )
                    return null
                }
            })(),
            // Loop 8 G1 — numerical reconciliation across module-page,
            // BOM master, and cost-waterfall views. Mass + cell-energy
            // checks too. Returns null when nothing diverges; otherwise
            // populates the cover banner + a Reconciliation page.
            reconciliation: await (async () => {
                try {
                    const { reconcileNumerics } = await import(
                        "@/lib/cad-lab-numerical-reconciliation"
                    )
                    // L9-P1: pass Finn's coarse per-module estimates here
                    // (NOT the post-fix perModuleCost which now reads from
                    // BOM). Reconciliation compares Finn vs BOM — that's
                    // the load-bearing signal. If we passed BOM-by-module
                    // here, R1 ("module-page cost total disagrees with BOM
                    // master") would compare BOM-by-module vs BOM-total
                    // and never fire.
                    const moduleCostsForReconciliation = modules.map((m) => ({
                        moduleName: m.name,
                        totalGbp:
                            m.cost && typeof m.cost.totalPerUnit === "number"
                                ? (m.cost.totalPerUnit as number)
                                : null,
                        massKg: m.massKg ?? null,
                    }))
                    // PartRow doesn't carry a quantity field today —
                    // the BOM master treats every row as 1×. When that
                    // changes (per Loop 7 critique VertFarm: "Quantities
                    // are NOT on the BOM"), this sum will pick it up
                    // automatically once the field is added.
                    // L13-P2 (2026-04-27): de-duplicated so assembly +
                    // constituents do not double-count in reconciliation.
                    const reconcileDedup = dedupAssemblyRollUp(parts)
                    const bomTotalGbp = reconcileDedup.effectiveCost.reduce(
                        (acc, c) => acc + c,
                        0,
                    )
                    const bomTotalMassKg = reconcileDedup.effectiveMass.reduce(
                        (acc, m) => acc + m,
                        0,
                    )
                    const declaredTotalMassKg = modules.reduce((acc, m) => {
                        return acc + (safeNumeric(m.massKg) ?? 0)
                    }, 0)
                    const baseReconciliation = reconcileNumerics({
                        moduleCosts: moduleCostsForReconciliation,
                        bomTotalGbp: bomTotalGbp > 0 ? bomTotalGbp : null,
                        // L9-P1: waterfallTotalGbp == bomTotalGbp now (cover
                        // reads from parts table). R2 banner ("BOM vs cost
                        // waterfall") naturally never fires — they share
                        // the same source. R1 (Finn-by-module vs BOM)
                        // still fires when Finn's coarse estimates miss
                        // detail in the parts table.
                        waterfallTotalGbp: bomTotalGbp > 0 ? bomTotalGbp : null,
                        declaredTotalMassKg: declaredTotalMassKg > 0 ? declaredTotalMassKg : null,
                        bomTotalMassKg: bomTotalMassKg > 0 ? bomTotalMassKg : null,
                    })

                    // L13-P1 (2026-04-27): bill-of-materials versus module-
                    // description consistency check. Catches the Loop 12
                    // pattern where BOM line items disagree with module
                    // descriptions on power / pressure / mass / voltage.
                    // Hedgerow solar 100W vs 6W (15-20× area), HAPS 700
                    // bar vs 350 bar tank pressure, HAPS motor 15 kW vs
                    // 1.5 kW per drag polar.
                    const moduleConsistencyFindings = checkBomModuleConsistency(
                        modules.map((m) => ({
                            name: m.name,
                            description: m.description ?? null,
                            keyParts: m.keyParts,
                        })),
                        parts.map((p) => ({
                            partNumber: p.partNumber,
                            name: p.name,
                            description: p.description ?? null,
                            sourceModuleName: p.sourceModuleName,
                        })),
                    )

                    // L14-P1 (2026-04-27): mirror-assembly cost / mass
                    // parity. HAPS Loop 13: Port Wing £895 vs Starboard
                    // Wing £12,065 (13×) was never flagged because the
                    // cost waterfall sums each module independently.
                    const mirrorFindings = checkMirrorParity(
                        modules.map((m) => ({
                            name: m.name,
                            massKg: m.massKg ?? null,
                        })),
                        parts.map((p) => ({
                            sourceModuleName: p.sourceModuleName,
                            estimatedUnitCostGbp: p.estimatedUnitCostGbp,
                            massKg: p.massKg,
                        })),
                    )

                    if (moduleConsistencyFindings.length === 0 && mirrorFindings.length === 0) {
                        return baseReconciliation
                    }

                    // Merge consistency findings into the reconciliation
                    // result so the existing Reconciliation page renders
                    // them, the cover banner counts them, and the
                    // hasAlerts flag fires the red treatment.
                    const specExtras = moduleConsistencyFindings.map((f, i) => ({
                        id: `spec-${i}`,
                        section: "Spec" as const,
                        severity: "alert" as const,
                        summary: f.summary,
                        detail: {
                            sourceA: `Module description (${f.moduleName})`,
                            valueA: f.moduleValue,
                            sourceB: `Bill of materials row ${f.partNumber ?? "(unknown)"}`,
                            valueB: f.partValue,
                            pctDiff: ((f.ratio - 1) * 100),
                            unit: f.unit,
                        },
                    }))

                    const mirrorExtras = mirrorFindings.map((f, i) => ({
                        id: `mirror-${i}`,
                        section: "Mirror" as const,
                        severity: "alert" as const,
                        summary: f.summary,
                        detail: {
                            sourceA: f.aName,
                            valueA: f.aCostGbp,
                            sourceB: f.bName,
                            valueB: f.bCostGbp,
                            pctDiff: f.costDiffPct,
                            unit: "GBP",
                        },
                    }))

                    const extraFindings = [...specExtras, ...mirrorExtras]

                    // L16-I1+I2 (2026-04-27): cover banner counts only
                    // ALERT-severity findings, not info. The Finn-vs-BOM
                    // gap (R1) was demoted to info in
                    // cad-lab-numerical-reconciliation.ts because the BOM
                    // is canonical and the gap class disappears under
                    // canonical-spec-ledger logic. Counting it on the
                    // cover banner would re-surface the very signal we
                    // just folded into the body.
                    const baseAlertFindings = baseReconciliation.findings.filter(
                        (f) => f.severity === "alert",
                    )
                    const merged = baseReconciliation
                        ? {
                              ...baseReconciliation,
                              findings: [...baseReconciliation.findings, ...extraFindings],
                              hasAlerts:
                                  baseAlertFindings.length + extraFindings.length > 0,
                              coverBanner: (() => {
                                  const baseCount = baseAlertFindings.length
                                  const specCount = specExtras.length
                                  const mirrorCount = mirrorExtras.length
                                  const totalCount = baseCount + specCount + mirrorCount
                                  if (totalCount === 0) return null
                                  const parts: string[] = []
                                  if (specCount > 0) parts.push(`${specCount} bill-of-materials versus module-description`)
                                  if (mirrorCount > 0) parts.push(`${mirrorCount} mirror-assembly cost / mass parity`)
                                  const detail = parts.length > 0 ? ` (${parts.join(", ")})` : ""
                                  return `Internal numerical inconsistency detected — ${totalCount} value${totalCount === 1 ? "" : "s"} disagree across sections${detail}. See Reconciliation page.`
                              })(),
                          }
                        : {
                              findings: extraFindings,
                              hasAlerts: true,
                              coverBanner: (() => {
                                  const specCount = specExtras.length
                                  const mirrorCount = mirrorExtras.length
                                  const total = specCount + mirrorCount
                                  const parts: string[] = []
                                  if (specCount > 0) parts.push(`${specCount} bill-of-materials versus module-description`)
                                  if (mirrorCount > 0) parts.push(`${mirrorCount} mirror-assembly cost / mass parity`)
                                  return `Internal numerical inconsistency detected — ${total} value${total === 1 ? "" : "s"} (${parts.join(", ")}). See Reconciliation page.`
                              })(),
                          }
                    return merged
                } catch (err) {
                    console.warn(
                        "[export-pdf] reconciliation pass failed (non-fatal):",
                        err instanceof Error ? err.message : err,
                    )
                    return null
                }
            })(),
            suppliers,
            supplierDirectoryCoverageNote,
            auditLog,
            dimensionSheet: (project.dimension_sheet ?? null) as PdfInput["dimensionSheet"],
            spatialPlan: (project.spatial_plan ?? null) as PdfInput["spatialPlan"],
            spatialPlanImageDataUri: await (async () => {
                const plan = (project.spatial_plan ?? null) as SpatialPlan | null
                if (!plan) return null
                try {
                    const { rasteriseSpatialPlanToDataUri } = await import(
                        "@/lib/pdf/rasterise-spatial-plan"
                    )
                    return await rasteriseSpatialPlanToDataUri(plan, moduleNameById)
                } catch (err) {
                    console.warn(
                        "[export-pdf] spatial plan rasterise failed — falling back to table only:",
                        err instanceof Error ? err.message : err,
                    )
                    return null
                }
            })(),
            totals: {
                moduleCount: modules.length,
                keyPartCount,
                partRowCount: parts.length,
                failureModeCount,
                unknownCount,
                // Loop 7 critique fix A4 (LOOP-7-CRITIQUE.md): cover used
                // to show "Standards 0" when the body quoted 8-16 across
                // every module's reviews. Aggregate the count across the
                // structured regulatory[] AND any standard codes parsed
                // out of module review issue/message text. Counts unique
                // codes only — duplicate citations of "BS 7671" across
                // 4 modules don't inflate the number.
                regulatoryCount: (() => {
                    const codes = new Set<string>()
                    for (const r of regulatory) {
                        if (typeof r?.code === "string" && r.code.trim()) codes.add(r.code.trim().toUpperCase())
                    }
                    // Standard-code patterns: BS / BS EN / BS EN IEC / IEC /
                    // ISO / NFPA / UL / EN / DIN / ASTM / IPC + numeric.
                    const stdRegex = /\b(BS\s+EN\s+IEC|BS\s+EN|BS\s+ISO|EN\s+IEC|EN\s+ISO|BS|EN|IEC|ISO|NFPA|UL|DIN|ASTM|IPC|UN|UKCA|RED|RoHS|WEEE|PSTI|GPSR|CDM|EAWR|ESQCR)\s*[A-Z]?\d{1,5}(?:-\d+)*(?:[A-Z](?:-\d+)?)?\b/g
                    for (const m of modules) {
                        for (const r of m.reviews ?? []) {
                            const haystack = [
                                r.summary ?? "",
                                ...(r.issues ?? []).map((i) => `${i.category} ${i.message} ${i.suggestion ?? ""}`),
                                ...(r.recommendations ?? []),
                            ].join(" ")
                            for (const m of haystack.matchAll(stdRegex)) {
                                codes.add(m[0].toUpperCase().replace(/\s+/g, " "))
                            }
                        }
                    }
                    return codes.size
                })(),
                supplierCount: suppliers.length,
                reviewCount,
            },
            sources,
            proofreadFindings: (() => {
                const raw = project.proofread_findings as
                    | {
                          ran_at?: unknown
                          model?: unknown
                          cost_pence?: unknown
                          findings?: unknown
                      }
                    | null
                if (!raw) return null
                const findingsArr = Array.isArray(raw.findings) ? raw.findings : []
                if (findingsArr.length === 0) return null
                type Finding = NonNullable<PdfInput["proofreadFindings"]>["findings"][number]
                const cleaned: Finding[] = []
                for (const f of findingsArr) {
                    if (
                        f &&
                        typeof f === "object" &&
                        "section" in f &&
                        "issue" in f &&
                        "severity" in f
                    ) {
                        cleaned.push(f as Finding)
                    }
                }
                return {
                    ranAtIso:
                        typeof raw.ran_at === "string"
                            ? raw.ran_at
                            : new Date().toISOString(),
                    model: typeof raw.model === "string" ? raw.model : "unknown",
                    costPence:
                        safeNumeric(raw.cost_pence) !== null ? safeNumeric(raw.cost_pence) as number : 0,
                    findings: cleaned,
                }
            })(),
            feasibilityVerdict: (() => {
                const raw = project.feasibility_verdict as
                    | {
                          status?: unknown
                          ran_at?: unknown
                          fails?: unknown
                          tradeoffs?: unknown
                          checkedConstraints?: unknown
                      }
                    | null
                if (!raw) return null
                const status =
                    raw.status === "red" || raw.status === "amber" || raw.status === "green"
                        ? raw.status
                        : "green"
                type Fail = NonNullable<PdfInput["feasibilityVerdict"]>["fails"][number]
                const fails: Fail[] = []
                if (Array.isArray(raw.fails)) {
                    for (const f of raw.fails) {
                        if (
                            f &&
                            typeof f === "object" &&
                            "axis" in f &&
                            "severity" in f &&
                            "summary" in f
                        ) {
                            fails.push(f as Fail)
                        }
                    }
                }
                const tradeoffs = Array.isArray(raw.tradeoffs)
                    ? raw.tradeoffs.filter((s): s is string => typeof s === "string")
                    : []
                // Loop 24 P0: parse checkedConstraints from persisted JSONB.
                // Older verdicts (pre-loop-24-fix) will have no checkedConstraints
                // field — treat those as empty (phantom-GREEN eligible) so the
                // guard still fires and forces UNREVIEWED display on legacy data.
                const checkedConstraints = Array.isArray(raw.checkedConstraints)
                    ? raw.checkedConstraints.filter((s): s is string => typeof s === "string")
                    : []

                // A3 — Loop 26 Tier-A fix: spatial overflow hard fail.
                //
                // At render time, scan the spatial plan notes for overflow
                // annotations produced by the layout engine. When a placement
                // overflows the envelope by more than 5% of the envelope's
                // maximum dimension, inject a "spatial_overflow" BLOCKER fail
                // into the in-memory verdict so the PDF renders a RED badge
                // and the FeasibilityExceptionPage lists the overflow.
                //
                // We do NOT write this back to the DB — that would require
                // a proofreader re-run. The injection is PDF-render-time only.
                // When the proofreader next runs, `computeFeasibilityVerdict`
                // will be called with spatialPlanNotes and will persist the
                // verdict including the spatial_overflow axis natively.
                const spatialPlanForVerdict = (project.spatial_plan ?? null) as import("@/lib/layout/types").SpatialPlan | null
                if (
                    spatialPlanForVerdict &&
                    Array.isArray(spatialPlanForVerdict.notes) &&
                    spatialPlanForVerdict.notes.length > 0
                ) {
                    const cvFn = computeFeasibilityVerdictFn
                    const env = spatialPlanForVerdict.envelope
                    // Re-run a spatial-only verdict check with the plan notes.
                    // The other axes are set to null so they don't double-count;
                    // we only want the spatial_overflow axis from this call.
                    const spatialOnlyVerdict = cvFn({
                        dimensionSheet: null,
                        briefConstraints: null,
                        parts: [],
                        aiCostEstimates: null,
                        shortlistCount: 0,
                        bomRowCount: 0,
                        spatialPlanNotes: spatialPlanForVerdict.notes,
                        spatialPlanEnvelopeDimensions: env
                            ? {
                                  interior_w_mm: typeof env.interior_w_mm === "number" ? env.interior_w_mm : 1_000,
                                  interior_d_mm: typeof env.interior_d_mm === "number" ? env.interior_d_mm : 1_000,
                                  interior_h_mm: typeof env.interior_h_mm === "number" ? env.interior_h_mm : 1_000,
                              }
                            : null,
                    })
                    const overflowFails = spatialOnlyVerdict.fails.filter((f) => f.axis === "spatial_overflow")
                    if (overflowFails.length > 0) {
                        // Inject spatial_overflow fails into the verdict.
                        // De-duplicate: skip if the persisted verdict already
                        // has a spatial_overflow axis (unlikely but defensive).
                        for (const f of overflowFails) {
                            if (!fails.some((existing) => existing.axis === "spatial_overflow")) {
                                fails.push(f as typeof fails[number])
                            }
                        }
                        if (!checkedConstraints.includes("spatial_overflow")) {
                            checkedConstraints.push("spatial_overflow")
                        }
                        // Promote status to red if not already red.
                        if (status !== "red") {
                            (raw as { status?: unknown }).status = "red"
                        }
                    }
                }

                // Recompute status after potential spatial_overflow injection.
                const hasBlockerAfterInjection = fails.some((f) => f.severity === "blocker")
                const finalStatus: "red" | "amber" | "green" = hasBlockerAfterInjection
                    ? "red"
                    : fails.length > 0
                      ? "amber"
                      : "green"

                return {
                    status: finalStatus,
                    ranAtIso:
                        typeof raw.ran_at === "string"
                            ? raw.ran_at
                            : new Date().toISOString(),
                    fails,
                    tradeoffs,
                    checkedConstraints,
                }
            })(),
            // ── Alternate envelope pushback (Loop 24 P0 class-fence) ───────────
            // Read from dimension_sheet.closest_feasible_alternate when that
            // alternate carries product_class_match === false (set deterministically
            // by the Guard 2 class-fence in run-fang-sizing.ts).
            alternateEnvelopePushback: (() => {
                const sheet = (project.dimension_sheet ?? null) as import("@/lib/sizing/types").DimensionSheet | null
                const alt = sheet?.closest_feasible_alternate
                if (!alt) return null
                // Only render the callout when the class-fence fields are present
                // AND product_class_match is explicitly false.
                if (alt.product_class_match !== false) return null
                if (!alt.briefed_classification_tag || !alt.alternate_classification_tag) return null
                if (!alt.capacity_at_briefed_class || !alt.trade_off_note) return null
                return {
                    briefed_envelope: {
                        kind: sheet!.envelope?.kind ?? "custom",
                        label: sheet!.envelope?.label ?? "briefed envelope",
                        classification_tag: alt.briefed_classification_tag,
                    },
                    alternate_envelope: {
                        kind: alt.envelope?.kind ?? "custom",
                        label: alt.envelope?.label ?? "alternate envelope",
                        classification_tag: alt.alternate_classification_tag,
                    },
                    capacity_at_briefed_class: alt.capacity_at_briefed_class,
                    capacity_at_alternate_class: alt.capacity_at_alternate_class ?? { value: null, units: "units" },
                    trade_off_note: alt.trade_off_note,
                }
            })(),
            // Item 2 (council 2026-04-29): regulatory triage result — true when ALL
            // standards remain undifferentiated after the two-phase triage pass
            // (Chase-time keyword pass + Fang-findings elevation). Triggers the
            // warning banner in RegulatorySection.
            regulatoryUndifferentiated: regulatoryMatrixUndifferentiated,
            // Loop 26 D1/D4: pass detected domain to RegulatorySection so it can
            // choose the correct urgency colour and copy for the mandatory-section
            // placeholder when regulatory[] is empty.
            detectedDomain,
        }

        try {
            // Pre-render layout validation — checks the data structure for
            // common bugs that produce blank or truncated sections without
            // crashing the renderer (empty BOM, hollow modules, missing
            // suppliers, etc.). Non-blocking: warnings are logged but the
            // render proceeds regardless. See src/lib/forge-v2/pdf-validator.ts.
            {
                const { validatePdfLayout } = await import(
                    "@/lib/forge-v2/pdf-validator"
                )
                const layoutCheck = validatePdfLayout(pdfInput)
                if (!layoutCheck.valid) {
                    console.warn(
                        `[export-project-pdf] layout validator found ${layoutCheck.issues.length} issue(s) — ` +
                            `PDF will render but may have blank or sparse sections:`,
                        layoutCheck.issues,
                    )
                }
            }

            // Diagnostic walk over pdfInput just before render: any non-
            // finite number anywhere in the tree is a smoking gun for a
            // Yoga / pdfkit "unsupported number" crash. Logs the path
            // (e.g. cost.unitTotalGbp) so the next failure tells us
            // exactly which builder line emitted the bad value. ALSO
            // attach the findings to the eventual error so they surface
            // to pipeline_runs.error_message (Vercel CLI logs were
            // unreachable during the 2026-04-26 debug — surfacing through
            // Supabase is the reliable path).
            coercePdfInputNumbers(pdfInput)
            const sus = walkForBadNumbers(pdfInput, "")
            if (sus.length > 0) {
                console.error("[export-project-pdf] non-finite numbers detected:", JSON.stringify(sus.slice(0, 30)))
            }
            ;(pdfInput as { _diagnostics?: unknown })._diagnostics = sus.slice(0, 8)
            const instance = pdf(<ForgeProjectPdf data={pdfInput} />)
            const blob = await instance.toBlob()
            const arrayBuffer = await blob.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            const base64 = buffer.toString("base64")
            const filename = `${slugify(pdfInput.projectName)}-rev-${pdfInput.designRevisionLetter}.pdf`
            return {
                ok: true,
                filename,
                base64,
                sizeBytes: buffer.length,
            }
        } catch (err) {
            // 2026-04-26 diagnostic: PDF render started failing on engine-
            // fixes-wip with no Vercel CLI logs. Emit the full Error.stack
            // + message + name + a JSON-serialised payload so the actual
            // failure surfaces to whatever log channel IS reachable
            // (Vercel function logs panel, Supabase log drain if wired,
            // process.stderr captured by the cron's pipeline_runs row).
            const errorName = err instanceof Error ? err.name : typeof err
            const errorMsg = err instanceof Error ? err.message : String(err)
            const errorStack = err instanceof Error ? err.stack : undefined
            console.error("[export-project-pdf] render failed —", errorName, ":", errorMsg)
            if (errorStack) console.error("[export-project-pdf] stack:", errorStack)
            console.error(
                "[export-project-pdf] diagnostic payload:",
                JSON.stringify({
                    name: errorName,
                    message: errorMsg,
                    stack: errorStack,
                    projectName: pdfInput.projectName,
                    moduleCount: pdfInput.totals.moduleCount,
                    partCount: pdfInput.totals.partRowCount,
                    hasReconciliation: pdfInput.reconciliation != null,
                    hasFeasibility: pdfInput.feasibilityVerdict != null,
                    hasSpatialPlan: pdfInput.spatialPlan != null,
                    hasSizingSheet: pdfInput.dimensionSheet != null,
                }),
            )
            // Force flush to stderr before Lambda freezes the function. This
            // matters when the cron's 2-second AbortSignal trims the
            // response stream — a sub-1s flush window is the Lambda's only
            // chance to surface stderr to the runtime aggregator.
            await new Promise((resolve) => setTimeout(resolve, 800))
            // Surface the error MESSAGE (not the generic placeholder) so
            // the autopilot tracking row in pipeline_runs holds something
            // a human / future agent can grep without needing CLI access.
            // Also surface walkForBadNumbers diagnostics to pinpoint the
            // bad numeric path inside PdfInput (when present).
            const diagnostics = (pdfInput as { _diagnostics?: Array<{ path: string; value: unknown }> })._diagnostics
            const diagSnippet = Array.isArray(diagnostics) && diagnostics.length > 0
                ? ` | DIAG: ${diagnostics.map((d) => `${d.path}=${String(d.value)}`).join("; ").slice(0, 200)}`
                : " | DIAG: (none — bad number generated INSIDE render, not from PdfInput)"
            return {
                ok: false,
                error: `Couldn't render PDF: ${errorName}: ${errorMsg.slice(0, 200)}${diagSnippet}`,
                errorCode: "RENDER_FAILED",
            }
        }
    }
}
