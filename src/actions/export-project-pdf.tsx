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
        height: 60,
        backgroundColor: BG_SOFT,
        borderRadius: 4,
        marginTop: 6,
        marginBottom: 6,
        alignItems: "center",
        justifyContent: "center",
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

// ─── Small formatters ──────────────────────────────────────────────────

function fmtGbp(n: number | null | undefined): string {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—"
    return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
}

function fmtKg(n: number | null | undefined): string {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—"
    return `${n.toFixed(2)} kg`
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
    }
    suppliers: SupplierPdf[]
    auditLog: AuditRowPdf[]
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
            axis: "envelope" | "mass" | "cost" | "transport" | "suppliers"
            severity: "blocker" | "warning"
            summary: string
            evidence: string
        }>
        tradeoffs: string[]
    } | null
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
                    <View style={styles.statRow}>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Unit cost</Text>
                            <Text style={styles.statValue}>{fmtGbp(data.cost.unitTotalGbp)}</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Ceiling</Text>
                            <Text style={styles.statValue}>{fmtGbp(data.cost.ceilingGbp)}</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Headroom</Text>
                            <Text style={styles.statValue}>
                                {data.cost.unitTotalGbp != null && data.cost.ceilingGbp != null
                                    ? fmtGbp(data.cost.ceilingGbp - data.cost.unitTotalGbp)
                                    : "—"}
                            </Text>
                        </View>
                    </View>
                </View>
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
            <Text style={styles.footer} fixed>
                <Text>Contents · Rev {/* placeholder filled by outer */}</Text>
            </Text>
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
} as const

function FeasibilityVerdictBanner({
    verdict,
}: {
    verdict: NonNullable<PdfInput["feasibilityVerdict"]>
}): React.ReactElement {
    const c = VERDICT_COLORS[verdict.status]
    const blockerCount = verdict.fails.filter((f) => f.severity === "blocker").length
    const warnCount = verdict.fails.filter((f) => f.severity === "warning").length
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
                {blockerCount > 0
                    ? `${blockerCount} blocker${blockerCount === 1 ? "" : "s"}`
                    : ""}
                {blockerCount > 0 && warnCount > 0 ? " · " : ""}
                {warnCount > 0
                    ? `${warnCount} warning${warnCount === 1 ? "" : "s"}`
                    : ""}
                {verdict.fails.length === 0
                    ? "No constraint conflicts detected."
                    : " — see Feasibility Exception page below."}
            </Text>
        </View>
    )
}

function FeasibilityExceptionPage({
    verdict,
}: {
    verdict: NonNullable<PdfInput["feasibilityVerdict"]>
}): React.ReactElement {
    const c = VERDICT_COLORS[verdict.status]
    const blockers = verdict.fails.filter((f) => f.severity === "blocker")
    const warnings = verdict.fails.filter((f) => f.severity === "warning")
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>Feasibility exception</Text>
            <Text style={[styles.muted, { marginBottom: 10, fontSize: 9 }]}>
                Before this report was assembled, the engine compared the
                derived design against the brief constraints and against UK
                transport law. The fails below are not opinions — each one
                is grounded in numbers from the engine&apos;s own outputs
                (sizing solver, cost waterfall, parts mass roll-up). Treat
                the downstream sections as tentative until these are
                resolved.
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
                </Text>
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
            {verdict.tradeoffs.length > 0 && (
                <View style={{ marginBottom: 6 }}>
                    <Text style={[styles.h5, { marginBottom: 4 }]}>
                        Suggested trade-offs
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
            <Text style={styles.footer} fixed>
                <Text>Feasibility exception</Text>
            </Text>
        </Page>
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
        case "transport":
            return "Transport (UK)"
        case "suppliers":
            return "Supplier coverage"
    }
}

function BriefSection({ data }: { data: PdfInput }): React.ReactElement {
    const b = data.brief
    return (
        <View>
            <Text style={styles.h2}>1. Brief</Text>
            {data.feasibilityVerdict && data.feasibilityVerdict.status !== "green" && (
                <FeasibilityVerdictBanner verdict={data.feasibilityVerdict} />
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

function RegulatorySection({ items }: { items: Regulatory[] }): React.ReactElement {
    return (
        <View break>
            <Text style={styles.h2}>2. Regulatory posture</Text>
            {items.length === 0 && (
                <Text style={styles.muted}>No regulatory items declared on the Brief.</Text>
            )}
            {items.map((r, i) => (
                <View key={i} style={{ marginBottom: 10 }} wrap={false}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                        <Text style={{ fontWeight: "bold", marginRight: 8 }}>{r.code}</Text>
                        {r.status && <Text style={styles.pillMuted}>{r.status}</Text>}
                    </View>
                    <Text style={{ fontStyle: "italic", marginBottom: 2 }}>{r.name}</Text>
                    {r.summary && <Text>{r.summary}</Text>}
                </View>
            ))}
        </View>
    )
}

function ModulePage({
    mod,
    index,
}: {
    mod: ModulePdf
    index: number
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
                    <Text style={{ color: MUTED, fontSize: 9 }}>
                        No render generated yet for this module.
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
                    <Text>{mod.whyItMatters}</Text>
                </View>
            )}
            {mod.description && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Description</Text>
                    <Text>{mod.description}</Text>
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

            {/* Cost breakdown */}
            {mod.cost && (
                <View style={{ marginTop: 10 }}>
                    <Text style={styles.h5}>
                        Cost breakdown
                        {mod.cost.confidence
                            ? ` · ${mod.cost.confidence} confidence`
                            : ""}
                    </Text>
                    {mod.cost.parts && mod.cost.parts.length > 0 && (
                        <View style={styles.table}>
                            <View style={styles.tableHead}>
                                <Text style={[styles.tableHeadCell, { flex: 3 }]}>Part</Text>
                                <Text style={[styles.tableHeadCell, { width: 40 }]}>Type</Text>
                                <Text style={[styles.tableHeadCell, { flex: 1.5 }]}>Process / material</Text>
                                <Text style={[styles.tableHeadCell, { width: 60, textAlign: "right" }]}>Cost</Text>
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
                                        style={[styles.tableCell, { width: 60, textAlign: "right" }]}
                                    >
                                        {fmtGbp(p.cost)}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}
                    {typeof mod.cost.labourCost === "number" && (
                        <View style={[styles.row, { marginTop: 4 }]}>
                            <Text style={styles.rowLabel}>Labour</Text>
                            <Text style={styles.rowValue}>
                                {fmtGbp(mod.cost.labourCost)}
                                {mod.cost.labourReasoning ? ` — ${mod.cost.labourReasoning}` : ""}
                            </Text>
                        </View>
                    )}
                    {typeof mod.cost.totalPerUnit === "number" && (
                        <View style={styles.row}>
                            <Text style={styles.rowLabel}>Per-unit total</Text>
                            <Text style={[styles.rowValue, { fontWeight: "bold" }]}>
                                {fmtGbp(mod.cost.totalPerUnit)}
                            </Text>
                        </View>
                    )}
                    {mod.cost.assumptions && mod.cost.assumptions.length > 0 && (
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
                    {mod.cost.reasoning && (
                        <Text style={[styles.muted, { fontSize: 9, marginTop: 4 }]}>
                            {mod.cost.reasoning}
                        </Text>
                    )}
                </View>
            )}

            {/* Engineering reviews */}
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
                            {r.summary && <Text style={{ marginTop: 2 }}>{r.summary}</Text>}
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
                                                {iss.message}
                                                {iss.suggestion ? (
                                                    <Text style={{ fontStyle: "italic" }}>
                                                        {" "}Suggestion: {iss.suggestion}
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
                                            <Text style={styles.bulletText}>{rec}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    ))}
                </View>
            )}

            <Text style={styles.footer} fixed>
                <Text>{mod.name} · Module {index + 1}</Text>
            </Text>
        </Page>
    )
}

function BomMasterPage({
    parts,
    sources,
    suppliersByPart,
}: {
    parts: PartRow[]
    sources: PdfInput["sources"]
    suppliersByPart: Map<string, string[]>
}): React.ReactElement {
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>4. BOM master ({parts.length} rows)</Text>
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                BOM derived from the module decomposition&apos;s keyParts,
                expanded into typed part rows. Part records live in the
                `parts` table and are joined back to modules via
                source_module_id. The Suppliers column shows up to 3
                candidate suppliers (full details in §7).
            </Text>
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
                        <Text style={[styles.tableHeadCell, { width: 38, textAlign: "right" }]}>Mass</Text>
                        <Text style={[styles.tableHeadCell, { width: 50, textAlign: "right" }]}>Cost</Text>
                        <Text style={[styles.tableHeadCell, { flex: 1.6 }]}>Suppliers</Text>
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
                            <View key={i} style={styles.tableRow} wrap={false}>
                                <Text style={[styles.tableCell, { width: 60 }]}>{p.partNumber}</Text>
                                <Text style={[styles.tableCell, { flex: 2.5 }]}>
                                    {p.name}
                                    {p.description ? (
                                        <Text style={{ color: MUTED }}>{" — " + p.description}</Text>
                                    ) : null}
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
                                <Text style={[styles.tableCell, { width: 38, textAlign: "right" }]}>
                                    {p.massKg != null ? `${p.massKg.toFixed(2)}kg` : "—"}
                                </Text>
                                <Text style={[styles.tableCell, { width: 50, textAlign: "right" }]}>
                                    {fmtGbp(p.estimatedUnitCostGbp)}
                                </Text>
                                <Text style={[styles.tableCell, { flex: 1.6 }]}>
                                    {supplierLabel}
                                </Text>
                            </View>
                        )
                    })}
                </View>
            )}
            <Text style={styles.footer} fixed>
                <Text>BOM master</Text>
            </Text>
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

function CostPage({ data }: { data: PdfInput }): React.ReactElement {
    const hasCeiling = typeof data.cost.ceilingGbp === "number"
    const hasUnit = typeof data.cost.unitTotalGbp === "number"
    const headroom = hasCeiling && hasUnit ? data.cost.ceilingGbp! - data.cost.unitTotalGbp! : null
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>5. Cost waterfall</Text>
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

            <Text style={styles.h3}>Per-module roll-up</Text>
            <View style={styles.table}>
                <View style={styles.tableHead}>
                    <Text style={[styles.tableHeadCell, { flex: 3 }]}>Module</Text>
                    <Text style={[styles.tableHeadCell, { width: 70, textAlign: "right" }]}>Cost</Text>
                    <Text style={[styles.tableHeadCell, { width: 70, textAlign: "right" }]}>% of unit</Text>
                </View>
                {data.cost.perModule.map((c, i) => {
                    const pct =
                        data.cost.unitTotalGbp && c.totalGbp
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
            <Text style={styles.footer} fixed>
                <Text>Cost waterfall</Text>
            </Text>
        </Page>
    )
}

function RisksPage({ modules }: { modules: ModulePdf[] }): React.ReactElement {
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>6. Risks register</Text>
            <Text style={styles.muted}>
                Every failure mode and open question declared against each module, in one
                register. Until a dedicated risks store ships with severity + ownership,
                these rows are the canonical risk inventory.
            </Text>
            {modules.map((m) => (
                <View key={m.id} style={{ marginTop: 10 }} wrap={false}>
                    <Text style={styles.h4}>{m.name}</Text>
                    {m.failureModes.length === 0 && m.unknowns.length === 0 && (
                        <Text style={styles.muted}>No risks declared on this module.</Text>
                    )}
                    {m.failureModes.length > 0 && (
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
            <Text style={styles.footer} fixed>
                <Text>Risks register</Text>
            </Text>
        </Page>
    )
}

function SuppliersPage({ suppliers, sources }: { suppliers: SupplierPdf[]; sources: PdfInput["sources"] }): React.ReactElement {
    const dirCount = fmtInt(sources.supplierDirectoryCount)
    const listingCount = fmtInt(sources.marketplaceListingCount)
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>7. Supplier shortlist ({suppliers.length})</Text>
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                Shortlist built by scoring each supplier in the directory
                ({dirCount} companies) and marketplace listings
                ({listingCount} listings) against each module&apos;s declared
                process + material. A low shortlist count usually means the
                directory doesn&apos;t yet have coverage for the project&apos;s
                niche — not that no match exists globally.
            </Text>
            {suppliers.length === 0 && (
                <Text style={styles.muted}>No suppliers shortlisted yet.</Text>
            )}
            {suppliers.map((s, i) => {
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
                const offering = (s.projectSynthesis?.trim()) || s.description?.trim() || s.name
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
                        {s.certifications && s.certifications.length > 0 && (
                            <Text style={[styles.small, { marginTop: 2 }]}>
                                Certifications: {s.certifications.join(", ")}
                            </Text>
                        )}
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
                        {s.moduleNames.length > 0 && (
                            <Text style={[styles.small, { marginTop: 4, color: MUTED }]}>
                                Matched against {s.moduleNames.length} module
                                {s.moduleNames.length === 1 ? "" : "s"}:{" "}
                                {s.moduleNames.join(", ")}
                                {typeof s.matchScore === "number"
                                    ? ` · match score ${s.matchScore.toFixed(1)}/100`
                                    : ""}
                                {s.rampRole ? ` · ramp role ${s.rampRole}` : ""}
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
            <Text style={styles.footer} fixed>
                <Text>Supplier shortlist</Text>
            </Text>
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
            <Text style={styles.footer} fixed>
                <Text>Audit log</Text>
            </Text>
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
            <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>Envelope</Text>
                <Text style={{ fontSize: 10, marginBottom: 6 }}>{envelopeLine}</Text>
                <Text style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>Final config</Text>
                <Text style={{ fontSize: 11, marginBottom: 6 }}>
                    {Object.entries(sheet.target).map(([k, v]) => `${k}: ${v}`).join(" · ")}{" "}
                    <Text style={{ color: feasibleColor, fontWeight: "bold" }}>[{feasibleLabel}]</Text>
                </Text>
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

    return (
        <View>
            {header}
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

function ForgeProjectPdf({ data }: { data: PdfInput }): React.ReactElement {
    const hasSheet = data.dimensionSheet != null
    const hasPlan = data.spatialPlan != null

    // Build the module-id → name map once here so SpatialPlanSection can
    // resolve placement.module_id labels without re-walking the array.
    const moduleNameById = new Map<string, string>()
    for (const m of data.modules) moduleNameById.set(m.id, m.name)

    // ── TOC renumbering (four cases) ───────────────────────────────────
    // Optional sections (sizing optimisation, spatial plan) both slot in
    // after Regulatory (2) and before Modules. Shift everything after
    // the optional block by the number of optional sections present so
    // the TOC stays correct regardless of which ones render.
    const optionalSections: string[] = []
    if (hasSheet) optionalSections.push("Sizing optimisation")
    if (hasPlan) optionalSections.push("Spatial plan")
    const fixedSections = [
        "Modules (one page each)",
        "BOM master",
        "Cost waterfall",
        "Risks register",
        "Supplier shortlist",
        "Project audit log",
    ]
    const allSections = [
        "Brief",
        "Regulatory posture",
        ...optionalSections,
        ...fixedSections,
    ]
    const sections = allSections.map((label, i) => `${i + 1}. ${label}`)

    // Computed section numbers for the sections that render their own
    // header (they need to show the right "N." prefix).
    // Brief = 1, Regulatory = 2, Sizing = 3 (if present), Plan = next.
    const sizingSectionNumber = hasSheet ? 3 : null
    const planSectionNumber = hasPlan ? (hasSheet ? 4 : 3) : null
    return (
        <Document>
            {/* 0. Cover */}
            <CoverPage data={data} />

            {/* TOC */}
            <TocPage sections={sections} />

            {/* 1 + 2 on the same page-stream */}
            <Page size="A4" style={styles.page} wrap>
                <BriefSection data={data} />
                <RegulatorySection items={data.regulatory} />
                <Text style={styles.footer} fixed>
                    <Text>Brief + regulatory</Text>
                </Text>
            </Page>

            {/* Feasibility exception page (Loop 3 P1, council-unanimous
             *  2026-04-25 NIGHT). Renders only when the verdict is non-green.
             *  Sits BEFORE sizing/BOM/cost so the founder sees the gap
             *  before the polish. */}
            {data.feasibilityVerdict && data.feasibilityVerdict.status !== "green" && (
                <FeasibilityExceptionPage verdict={data.feasibilityVerdict} />
            )}

            {/* 3. Sizing optimisation (P1 — only when dimension_sheet present) */}
            {hasSheet && sizingSectionNumber != null && (
                <Page size="A4" style={styles.page} wrap>
                    <SizingOptimisationSection
                        sheet={data.dimensionSheet}
                        sectionNumber={sizingSectionNumber}
                    />
                    <Text style={styles.footer} fixed>
                        <Text>Sizing optimisation</Text>
                    </Text>
                </Page>
            )}

            {/* Spatial plan (P2 — only when spatial_plan present; slots
             *  AFTER sizing and BEFORE modules). */}
            {hasPlan && planSectionNumber != null && (
                <Page size="A4" style={styles.page} wrap>
                    <SpatialPlanSection
                        plan={data.spatialPlan}
                        sectionNumber={planSectionNumber}
                        moduleNameById={moduleNameById}
                        imageDataUri={data.spatialPlanImageDataUri}
                    />
                    <Text style={styles.footer} fixed>
                        <Text>Spatial plan</Text>
                    </Text>
                </Page>
            )}

            {/* 3–5 depending on presence. one page per module */}
            {data.modules.map((m, i) => (
                <ModulePage key={m.id} mod={m} index={i} />
            ))}

            {/* 4. BOM master — with per-row supplier candidates inline.
                 suppliersByPart is computed from data.suppliers'
                 matchedPartNumbers (added 2026-04-25 NIGHT). */}
            <BomMasterPage
                parts={data.parts}
                sources={data.sources}
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
            />

            {/* 5. Cost */}
            <CostPage data={data} />

            {/* 6. Risks register */}
            <RisksPage modules={data.modules} />

            {/* 7. Suppliers */}
            <SuppliersPage suppliers={data.suppliers} sources={data.sources} />

            {/* 8. Engine self-review (Phase 1 proofreader, 2026-04-25 NIGHT)
                — only renders when the proofreader specialist found
                something. Non-blocking: the PDF always emits; this
                appendix surfaces caught issues to the founder. */}
            {data.proofreadFindings && (
                <EngineReviewPage findings={data.proofreadFindings} />
            )}

            {/* 8. Audit log — V1 CUT (2026-04-24): autopilot isn't writing
                audit_log rows, section always renders "No audit events
                recorded". Remove from PDF until audit writes are wired.
                <AuditLogPage rows={data.auditLog} />
            */}
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
            <Text style={styles.h2}>Engine self-review</Text>
            <Text style={[styles.muted, { marginBottom: 8, fontSize: 9 }]}>
                Before this PDF was emitted, the engine ran a fact-check
                pass against the assembled state — comparing brief targets
                to derived values, checking standard citations, looking for
                math errors and internal contradictions. Findings below are
                surfaced here for founder review. Phase 1 is non-correcting
                — what the engine caught is documented; what it missed is
                not.
            </Text>
            <Text style={[styles.small, { marginBottom: 10, color: MUTED }]}>
                Run at {findings.ranAtIso.replace("T", " ").slice(0, 19)} ·
                model {findings.model} · cost {findings.costPence}p ·
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
            <Text style={styles.footer} fixed>
                <Text>Engine self-review</Text>
            </Text>
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
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select(
                "id, foundry_id, name, subject, modules, research, ai_cost_estimates, reviews, diagnostic_answers, design_revision, created_at, brief_locked_at, shipped_at, system_illustration_url, interior_overview_url, concept_render_url, dimension_sheet, spatial_plan, proofread_findings, feasibility_verdict",
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
                constraints?: { unitCostCeilingGbp?: number; maxMassKg?: number }
                regulatory?: Array<{
                    code?: string
                    name?: string
                    summary?: string
                    status?: string
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
                massKg: typeof m.estimatedMassKg === "number" ? m.estimatedMassKg : null,
                budgetMassKg: typeof m.budgetMassKg === "number" ? m.budgetMassKg : null,
                leadWeeks: typeof m.leadWeeks === "number" ? m.leadWeeks : null,
                leadTimeSource:
                    typeof m.leadTimeSource === "string" ? m.leadTimeSource : null,
                mirrorOf: typeof m.mirrorOf === "string" ? m.mirrorOf : null,
                mirrorOfName:
                    typeof m.mirrorOf === "string"
                        ? moduleNameById.get(m.mirrorOf) ?? m.mirrorOf
                        : null,
                keyParts: Array.isArray(m.keyParts) ? m.keyParts : [],
                failureModes: Array.isArray(m.failureModes) ? m.failureModes : [],
                unknowns: Array.isArray(m.unknowns) ? m.unknowns : [],
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
                "part_number, name, description, source_module_id, process, material, material_spec, finish, tolerance, mass_kg, estimated_unit_cost_gbp, is_purchased",
            )
            .eq("cad_lab_project_id", projectId)
            .order("part_number", { ascending: true })

        const parts: PartRow[] = (partsRaw ?? []).map((p) => ({
            partNumber: String(p.part_number ?? ""),
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
            massKg: typeof p.mass_kg === "number" ? p.mass_kg : null,
            estimatedUnitCostGbp:
                typeof p.estimated_unit_cost_gbp === "number"
                    ? p.estimated_unit_cost_gbp
                    : null,
            isPurchased: Boolean(p.is_purchased),
            description: typeof p.description === "string" ? p.description : null,
        }))

        // Cost aggregates.
        const perModuleCost = modules.map((m) => ({
            moduleName: m.name,
            totalGbp:
                m.cost && typeof m.cost.totalPerUnit === "number"
                    ? (m.cost.totalPerUnit as number)
                    : null,
        }))
        const unitTotalGbp = perModuleCost.reduce((acc, c) => acc + (c.totalGbp ?? 0), 0)

        // Suppliers shortlist — join to global directory for HQ.
        const { data: shortlistRows } = await admin
            .from("forge_supplier_shortlist")
            .select(
                "supplier_id, supplier_name, module_ids, matched_part_numbers, project_synthesis, best_match_score, best_score_breakdown, all_match_reasons, ramp_role",
            )
            .eq("project_id", projectId)

        const supplierIds = (shortlistRows ?? [])
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
            const { data: globals } = await admin
                .from("suppliers")
                .select("id, company_info")
                .in("id", supplierIds)
            if (globals) {
                for (const g of globals) {
                    const info = g.company_info as { hq?: unknown } | null
                    const hq = info && typeof info.hq === "string" ? info.hq : null
                    hqById.set(g.id as string, hq)
                }
            }
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
                    foundedYearById.set(
                        id,
                        typeof l.founded_year === "number" ? (l.founded_year as number) : null,
                    )
                    employeeCountById.set(
                        id,
                        typeof l.employee_count_exact === "number"
                            ? (l.employee_count_exact as number)
                            : null,
                    )
                    leadTimeById.set(id, (l.lead_time as string | null) ?? null)
                    minimumOrderById.set(id, (l.minimum_order as string | null) ?? null)
                    const certs = l.certifications as unknown
                    certificationsById.set(
                        id,
                        Array.isArray(certs)
                            ? certs.filter((c): c is string => typeof c === "string")
                            : null,
                    )
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

        const suppliers: SupplierPdf[] = (shortlistRows ?? []).map((r) => ({
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
            matchScore:
                typeof r.best_match_score === "number" ? r.best_match_score : null,
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
            admin
                .from("suppliers")
                .select("id", { count: "exact", head: true }),
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

        // Audit log rows.
        const { data: auditRowsRaw } = await admin
            .from("audit_log")
            .select("action, section, created_at, metadata")
            .eq("entity_id", projectId)
            .order("created_at", { ascending: true })

        const auditLog: AuditRowPdf[] = (auditRowsRaw ?? []).map((r) => ({
            action: String(r.action ?? ""),
            section: typeof r.section === "string" ? r.section : null,
            createdAtIso: String(r.created_at ?? ""),
            metadataSummary: summariseMetadata(r.metadata),
        }))

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
                unitCostCeilingGbp:
                    typeof designBrief?.constraints?.unitCostCeilingGbp === "number"
                        ? designBrief!.constraints!.unitCostCeilingGbp
                        : null,
                maxMassKg:
                    typeof designBrief?.constraints?.maxMassKg === "number"
                        ? designBrief!.constraints!.maxMassKg
                        : null,
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
                unitTotalGbp: perModuleCost.some((c) => c.totalGbp != null)
                    ? unitTotalGbp
                    : null,
                ceilingGbp:
                    typeof designBrief?.constraints?.unitCostCeilingGbp === "number"
                        ? designBrief!.constraints!.unitCostCeilingGbp
                        : null,
            },
            suppliers,
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
                regulatoryCount: regulatory.length,
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
                        typeof raw.cost_pence === "number" ? raw.cost_pence : 0,
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
                return {
                    status,
                    ranAtIso:
                        typeof raw.ran_at === "string"
                            ? raw.ran_at
                            : new Date().toISOString(),
                    fails,
                    tradeoffs,
                }
            })(),
        }

        try {
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
            console.error(
                "[export-project-pdf] render failed:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "Couldn't render PDF — try again in a moment.",
                errorCode: "RENDER_FAILED",
            }
        }
    }
}
