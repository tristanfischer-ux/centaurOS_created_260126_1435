"use server"

/**
 * @file export-project-pdf.tsx — V2 "Generate export" comprehensive PDF.
 *
 * @description Pulls every readable artefact on a V2 project (brief +
 * regulatory + modules + key parts + failure modes + unknowns + parts
 * table + BOM lines + per-module cost breakdown + Finn assumptions +
 * Fang / Jian / Max reviews + supplier match reasons + pipeline_runs
 * audit log + project audit log) and renders one long, properly
 * sectioned PDF. Intended to be the "put the kitchen sink in" board /
 * supplier / data-room pack.
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
 *   - Pipeline audit: every specialist run
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
} from "@react-pdf/renderer"

import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"

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
        height: 140,
        width: "100%",
        paddingLeft: 48,
        paddingRight: 48,
        paddingTop: 42,
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
        height: 140,
        backgroundColor: BG_SOFT,
        borderRadius: 4,
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
    coverImage: {
        width: "100%",
        height: 280,
        backgroundColor: BG_SOFT,
        marginTop: 14,
        borderRadius: 4,
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

function specialistRole(idOrName: string | null | undefined): string | null {
    if (!idOrName) return null
    const key = String(idOrName).trim().toLowerCase()
    if (SPECIALIST_ROLES[key]) return SPECIALIST_ROLES[key]
    // "Finn — Finance Lead" / "Finn (Finance Lead)" — try the first word.
    const firstWord = key.split(/[\s—:(-]+/)[0]
    return SPECIALIST_ROLES[firstWord] ?? null
}

/**
 * Returns "Finn (Finance Lead — specialist AI)" when a role is known,
 * or just "Finn (specialist AI)" when not — we never drop the "specialist
 * AI" tag because Tristan wants every specialist mention flagged.
 */
function specialistLabel(idOrName: string | null | undefined): string {
    const name = typeof idOrName === "string" ? idOrName : ""
    const role = specialistRole(name)
    const display = name.length > 0 ? name : "Specialist"
    return role
        ? `${display} (${role} — specialist AI)`
        : `${display} (specialist AI)`
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
    matchScore: number | null
    scoreBreakdown: Record<string, unknown> | null
    matchReasons: string[]
    rampRole: string | null
}

interface PipelineRunPdf {
    specialist: string
    stage: string
    status: string
    trigger: string | null
    startedAtIso: string
    durationSec: number | null
    modelProvider: string | null
    modelId: string | null
    inputTokens: number | null
    outputTokens: number | null
    errorCode: string | null
    errorMessage: string | null
    /** From pipeline_runs.input_ref->>'moduleId'. Distinguishes per-module
     *  specialists (Fang's module.review.fang fires once per module) so
     *  the dedupe key doesn't collapse legitimate separate runs into one
     *  row. Null for non-per-module stages. */
    moduleId: string | null
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
    pipelineRuns: PipelineRunPdf[]
    auditLog: AuditRowPdf[]
    totals: {
        moduleCount: number
        keyPartCount: number
        partRowCount: number
        failureModeCount: number
        unknownCount: number
        regulatoryCount: number
        supplierCount: number
        reviewCount: number
        pipelineRunCount: number
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
     * Model-usage breakdown across this project's pipeline runs. Feeds
     * the "Which models did the work" section on the audit page so
     * Tristan (and anyone else reading) can see the answer without
     * having to read every audit row individually.
     */
    modelUsage: Array<{
        provider: string
        model: string
        runCount: number
        successCount: number
        failCount: number
        totalInputTokens: number | null
        totalOutputTokens: number | null
    }>
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

                {/* System illustration (or honest placeholder) */}
                {data.systemIllustrationUrl ? (
                    <Image src={data.systemIllustrationUrl} style={styles.coverImage} />
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
                            <Text style={styles.statLabel}>Specialist runs</Text>
                            <Text style={styles.statValue}>{data.totals.pipelineRunCount}</Text>
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
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Reviews</Text>
                            <Text style={styles.statValue}>{data.totals.reviewCount}</Text>
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

function BriefSection({ data }: { data: PdfInput }): React.ReactElement {
    const b = data.brief
    return (
        <View>
            <Text style={styles.h2}>1. Brief</Text>
            {b.subject && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Founder subject</Text>
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
            <Text style={styles.h3}>Constraints declared</Text>
            <View style={styles.row}>
                <Text style={styles.rowLabel}>Unit cost ceiling</Text>
                <Text style={styles.rowValue}>{fmtGbp(b.unitCostCeilingGbp)}</Text>
            </View>
            <View style={styles.row}>
                <Text style={styles.rowLabel}>Max mass</Text>
                <Text style={styles.rowValue}>{fmtKg(b.maxMassKg)}</Text>
            </View>
            <View style={styles.row}>
                <Text style={styles.rowLabel}>Target process</Text>
                <Text style={styles.rowValue}>{b.targetProcess || "not declared"}</Text>
            </View>
            <View style={styles.row}>
                <Text style={styles.rowLabel}>Target material</Text>
                <Text style={styles.rowValue}>{b.targetMaterial || "not declared"}</Text>
            </View>
            <View style={styles.row}>
                <Text style={styles.rowLabel}>Tolerance target</Text>
                <Text style={styles.rowValue}>{b.toleranceTarget || "not declared"}</Text>
            </View>
            <View style={styles.row}>
                <Text style={styles.rowLabel}>Quantity target</Text>
                <Text style={styles.rowValue}>{b.quantityTarget || "not declared"}</Text>
            </View>
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
                <View style={{ flex: 1 }}>
                    <Text style={styles.small}>Module id: {mod.id}</Text>
                </View>
                <Text style={styles.moduleMeta}>
                    {fmtKg(mod.massKg)}
                    {mod.budgetMassKg != null ? ` / budget ${fmtKg(mod.budgetMassKg)}` : ""}
                    {typeof mod.leadWeeks === "number" ? ` · ${mod.leadWeeks} wk lead` : ""}
                    {mod.leadTimeSource ? ` (${mod.leadTimeSource})` : ""}
                    {mod.mirrorOf ? ` · mirrors ${mod.mirrorOf}` : ""}
                </Text>
            </View>

            {/* Module image — generated render or honest empty placeholder */}
            {mod.imageUrl ? (
                <Image src={mod.imageUrl} style={styles.moduleImage} />
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

            {/* Cost breakdown from Finn */}
            {mod.cost && (
                <View style={{ marginTop: 10 }}>
                    <Text style={styles.h5}>
                        {specialistLabel("Finn")}'s cost breakdown
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

            {/* Specialist reviews */}
            {mod.reviews.length > 0 && (
                <View style={{ marginTop: 10 }}>
                    <Text style={styles.h5}>Specialist reviews ({mod.reviews.length})</Text>
                    {mod.reviews.map((r, i) => (
                        <View key={i} style={{ marginBottom: 8 }}>
                            <Text style={{ fontWeight: "bold", fontSize: 10 }}>
                                {specialistLabel(r.reviewer)}
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

function BomMasterPage({ parts, sources }: { parts: PartRow[]; sources: PdfInput["sources"] }): React.ReactElement {
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>4. BOM master ({parts.length} rows)</Text>
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                BOM derived from {specialistLabel("Max")}&apos;s module decomposition
                (`keyParts`), expanded into typed part rows by the bom.generate
                pipeline using {sources.bomModel} ({sources.bomProvider}).
                Part records live in the `parts` table and are joined back to
                modules via source_module_id.
            </Text>
            {parts.length === 0 ? (
                <Text style={styles.muted}>No parts generated yet.</Text>
            ) : (
                <View style={styles.table}>
                    <View style={styles.tableHead}>
                        <Text style={[styles.tableHeadCell, { width: 60 }]}>Part #</Text>
                        <Text style={[styles.tableHeadCell, { flex: 3 }]}>Name</Text>
                        <Text style={[styles.tableHeadCell, { flex: 1.4 }]}>Module</Text>
                        <Text style={[styles.tableHeadCell, { width: 50 }]}>Type</Text>
                        <Text style={[styles.tableHeadCell, { flex: 1.2 }]}>Process / material</Text>
                        <Text style={[styles.tableHeadCell, { width: 44, textAlign: "right" }]}>Mass</Text>
                        <Text style={[styles.tableHeadCell, { width: 55, textAlign: "right" }]}>Cost</Text>
                    </View>
                    {parts.map((p, i) => (
                        <View key={i} style={styles.tableRow} wrap={false}>
                            <Text style={[styles.tableCell, { width: 60 }]}>{p.partNumber}</Text>
                            <Text style={[styles.tableCell, { flex: 3 }]}>
                                {p.name}
                                {p.description ? (
                                    <Text style={{ color: MUTED }}>{" — " + p.description}</Text>
                                ) : null}
                            </Text>
                            <Text style={[styles.tableCell, { flex: 1.4 }]}>
                                {p.sourceModuleName ?? "—"}
                            </Text>
                            <Text style={[styles.tableCell, { width: 50 }]}>
                                {p.isPurchased ? "buy" : "make"}
                            </Text>
                            <Text style={[styles.tableCell, { flex: 1.2 }]}>
                                {p.isPurchased
                                    ? "—"
                                    : `${p.process ?? "—"}${p.material ? " · " + p.material : ""}${p.tolerance ? " · ±" + p.tolerance : ""}`}
                            </Text>
                            <Text style={[styles.tableCell, { width: 44, textAlign: "right" }]}>
                                {p.massKg != null ? `${p.massKg.toFixed(2)}kg` : "—"}
                            </Text>
                            <Text style={[styles.tableCell, { width: 55, textAlign: "right" }]}>
                                {fmtGbp(p.estimatedUnitCostGbp)}
                            </Text>
                        </View>
                    ))}
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
                Estimates generated by {specialistLabel("Finn")} (DeepSeek V3.2),
                grounded against the `material_properties` table
                ({fmtInt(data.sources.materialPropertyCount)} rows, freshest
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
                    <Text style={styles.statValue}>{fmtGbp(headroom)}</Text>
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
                Shortlist built by {specialistLabel("Chase")} scoring each
                supplier in the `suppliers` directory ({dirCount} companies) and
                the `marketplace_listings` table ({listingCount} listings) against
                each module&apos;s declared process + material. Scoring logic:
                src/actions/cad-lab-supplier-match.ts. A low shortlist count
                usually means the directory doesn&apos;t yet have coverage for
                the project&apos;s niche — not that no match exists globally.
            </Text>
            {suppliers.length === 0 && (
                <Text style={styles.muted}>No suppliers shortlisted yet.</Text>
            )}
            {suppliers.map((s, i) => {
                const sb = s.scoreBreakdown ?? {}
                const keys = Object.keys(sb).filter((k) => typeof sb[k] === "number")
                return (
                    <View key={i} style={{ marginBottom: 14 }} wrap={false}>
                        <Text style={{ fontWeight: "bold", fontSize: 12 }}>{s.name}</Text>
                        <Text style={styles.small}>
                            {s.hq ?? "HQ not declared"}
                            {s.rampRole ? ` · ramp role ${s.rampRole}` : ""}
                            {typeof s.matchScore === "number"
                                ? ` · match score ${s.matchScore.toFixed(1)}`
                                : ""}
                        </Text>
                        {s.moduleNames.length > 0 && (
                            <Text style={[styles.small, { marginTop: 2 }]}>
                                Matched across {s.moduleNames.length} module
                                {s.moduleNames.length === 1 ? "" : "s"}:{" "}
                                {s.moduleNames.join(", ")}
                            </Text>
                        )}
                        {keys.length > 0 && (
                            <View style={{ marginTop: 4 }}>
                                <Text style={styles.h5}>Score breakdown</Text>
                                {keys.map((k) => (
                                    <View key={k} style={styles.row}>
                                        <Text style={styles.rowLabel}>{k}</Text>
                                        <Text style={styles.rowValue}>
                                            {String((sb as Record<string, unknown>)[k])}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}
                        {s.matchReasons.length > 0 && (
                            <View style={{ marginTop: 4 }}>
                                <Text style={styles.h5}>Why {specialistLabel("Chase")} picked them</Text>
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

/**
 * Normalise a provider + modelId pair to a single human-readable string.
 * pipeline_runs is populated by many call-sites and they don't agree on
 * casing / provider-prefix / model id shape. Tristan's feedback flagged
 * "OPUS 4.7" vs "Anthropic Claude OPUS 4.7" vs plain "Anthropic" in the
 * same audit. This function fixes that at render-time.
 */
function normaliseModelLabel(
    provider: string | null | undefined,
    modelId: string | null | undefined,
): string {
    const p = (provider ?? "").trim()
    // Treat null, empty string, and the string literal "unknown" all as
    // model-not-recorded. Specialist actions that don't pass model_id back
    // into pipeline_runs surface here; the normaliser must not display
    // literal "unknown" as a distinct model bucket — that spawns fake
    // duplicate rows in the audit summary.
    const rawM = (modelId ?? "").trim()
    const m = rawM.toLowerCase() === "unknown" ? "" : rawM
    if (!p && !m) return "—"
    const lower = `${p} ${m}`.toLowerCase()

    if (lower.includes("claude") || lower.includes("anthropic")) {
        // Match both wire-format ids (claude-opus-4-7) and the casual
        // "Opus" / "Opus 4.7" labels some actions write today. Any
        // mention of opus collapses to the canonical label.
        if (
            lower.includes("opus-4-7") ||
            lower.includes("opus 4.7") ||
            /\bopus\b/.test(lower)
        ) {
            return "Anthropic · Claude Opus 4.7"
        }
        if (
            lower.includes("sonnet-4") ||
            lower.includes("sonnet 4") ||
            /\bsonnet\b/.test(lower)
        ) {
            return "Anthropic · Claude Sonnet 4"
        }
        if (
            lower.includes("haiku-4") ||
            lower.includes("haiku 4") ||
            /\bhaiku\b/.test(lower)
        ) {
            return "Anthropic · Claude Haiku 4.5"
        }
        return m ? `Anthropic · ${m}` : "Anthropic · Claude"
    }
    if (lower.includes("deepseek")) {
        if (lower.includes("v4") || lower.includes("-chat-v4")) {
            return "DeepSeek · V4"
        }
        if (lower.includes("v3") || lower.includes("deepseek-chat")) {
            return "DeepSeek · V3.2"
        }
        // Plain "deepseek" with no version — fold into the most-used
        // tier so the audit doesn't split one provider into two
        // buckets just because the action omitted a version string.
        return m ? `DeepSeek · ${m}` : "DeepSeek · V3.2"
    }
    if (lower.includes("nano-banana") || lower.includes("nano banana")) {
        return "Google · Gemini (Nano Banana)"
    }
    if (lower.includes("gemini") || lower.includes("google")) {
        return m ? `Google · ${m}` : "Google · Gemini"
    }
    if (lower.includes("openai") || lower.includes("gpt-")) {
        return m ? `OpenAI · ${m}` : "OpenAI"
    }
    if (lower.includes("stability") || lower.includes("sdxl") || lower.includes("stable-diff")) {
        return m ? `Stability · ${m}` : "Stability"
    }
    if (lower.includes("flux") || lower.includes("replicate")) {
        return m ? `Replicate · ${m}` : "Replicate"
    }
    // Fallback: render whatever we got, cleanly joined.
    return [p, m].filter(Boolean).join(" · ")
}

/**
 * Dedupe pipeline_runs so that retried (specialist, stage) keys surface
 * as one row — the latest status wins. The count of earlier failed
 * attempts is attached so the audit still signals reliability.
 *
 * Tristan's feedback: "Finance-lead `failed` rows appear before the
 * final `done` row. Since Tristan retried and it succeeded, hide or
 * de-duplicate the earlier failures."
 */
function dedupePipelineRuns(runs: PipelineRunPdf[]): Array<
    PipelineRunPdf & { earlierAttempts: number }
> {
    // Assume input is already ordered by started_at asc (the data loader
    // sorts it that way). Keep the LAST entry per (specialist, stage,
    // moduleId). Including moduleId is critical for per-module
    // specialists — Fang runs once per reviewed module, and without the
    // module key all reviews collapse into one audit row.
    const bucket = new Map<string, { last: PipelineRunPdf; earlierFails: number }>()
    for (const r of runs) {
        const key = `${r.specialist}::${r.stage}::${r.moduleId ?? ""}`
        const prev = bucket.get(key)
        if (!prev) {
            bucket.set(key, { last: r, earlierFails: 0 })
        } else {
            const earlierFails = prev.earlierFails + (prev.last.status === "failed" ? 1 : 0)
            bucket.set(key, { last: r, earlierFails })
        }
    }
    // Re-sort by the last-attempt startedAtIso to preserve chronological
    // flow in the table.
    return Array.from(bucket.values())
        .map((b) => ({ ...b.last, earlierAttempts: b.earlierFails }))
        .sort((a, b) => {
            const ta = new Date(a.startedAtIso).getTime()
            const tb = new Date(b.startedAtIso).getTime()
            return ta - tb
        })
}

function PipelineAuditPage({
    runs,
    modelUsage,
}: {
    runs: PipelineRunPdf[]
    modelUsage: PdfInput["modelUsage"]
}): React.ReactElement {
    const deduped = dedupePipelineRuns(runs)
    const hiddenFailures = runs.length - deduped.length
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>8. Specialist-run audit ({deduped.length})</Text>
            <Text style={styles.muted}>
                Every pipeline orchestrator call against this project — who ran, when,
                how long, model used, tokens, and any error. Retried (specialist,
                stage) pairs are deduped to the latest attempt; earlier failures are
                counted inline.
                {hiddenFailures > 0
                    ? ` ${hiddenFailures} earlier retried attempt${hiddenFailures === 1 ? "" : "s"} collapsed into the rows below.`
                    : ""}
            </Text>

            {/* Multi-model audit — answers "which models did the work". */}
            {modelUsage.length > 0 && (
                <View style={{ marginTop: 10 }} wrap={false}>
                    <Text style={styles.h5}>Models used on this project</Text>
                    <View style={styles.table}>
                        <View style={styles.tableHead}>
                            <Text style={[styles.tableHeadCell, { flex: 2.2 }]}>Model</Text>
                            <Text style={[styles.tableHeadCell, { width: 50, textAlign: "right" }]}>Runs</Text>
                            <Text style={[styles.tableHeadCell, { width: 60, textAlign: "right" }]}>Success</Text>
                            <Text style={[styles.tableHeadCell, { width: 50, textAlign: "right" }]}>Fail</Text>
                            <Text style={[styles.tableHeadCell, { width: 80, textAlign: "right" }]}>In tokens</Text>
                            <Text style={[styles.tableHeadCell, { width: 80, textAlign: "right" }]}>Out tokens</Text>
                        </View>
                        {modelUsage.map((u, i) => (
                            <View key={i} style={styles.tableRow} wrap={false}>
                                <Text style={[styles.tableCell, { flex: 2.2 }]}>
                                    {/* provider field already holds the
                                        canonical label — aggregation
                                        keyed by normaliseModelLabel in
                                        the loader. model is empty. */}
                                    {u.provider}
                                </Text>
                                <Text style={[styles.tableCell, { width: 50, textAlign: "right" }]}>{u.runCount}</Text>
                                <Text style={[styles.tableCell, { width: 60, textAlign: "right" }]}>{u.successCount}</Text>
                                <Text style={[styles.tableCell, { width: 50, textAlign: "right" }]}>{u.failCount}</Text>
                                <Text style={[styles.tableCell, { width: 80, textAlign: "right" }]}>
                                    {fmtInt(u.totalInputTokens)}
                                </Text>
                                <Text style={[styles.tableCell, { width: 80, textAlign: "right" }]}>
                                    {fmtInt(u.totalOutputTokens)}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            <Text style={[styles.h5, { marginTop: 12 }]}>Run-by-run log</Text>
            <View style={[styles.table, { marginTop: 4 }]}>
                <View style={styles.tableHead}>
                    <Text style={[styles.tableHeadCell, { flex: 1.3 }]}>Specialist</Text>
                    <Text style={[styles.tableHeadCell, { flex: 1.4 }]}>Stage</Text>
                    <Text style={[styles.tableHeadCell, { width: 56 }]}>Status</Text>
                    <Text style={[styles.tableHeadCell, { width: 90 }]}>Started</Text>
                    <Text style={[styles.tableHeadCell, { width: 60, textAlign: "right" }]}>
                        Duration
                    </Text>
                    <Text style={[styles.tableHeadCell, { flex: 1.4 }]}>Model</Text>
                    <Text style={[styles.tableHeadCell, { width: 70, textAlign: "right" }]}>
                        In / out tokens
                    </Text>
                </View>
                {deduped.map((r, i) => {
                    const role = specialistRole(r.specialist)
                    const tokensMissingButRan =
                        r.status === "done" &&
                        r.inputTokens == null &&
                        r.outputTokens == null
                    return (
                    <View key={i} style={styles.tableRow} wrap={false}>
                        <Text style={[styles.tableCell, { flex: 1.3 }]}>
                            {r.specialist}
                            {role ? (
                                <Text style={{ color: MUTED, fontSize: 7.5 }}>{"\n"}{role} · specialist AI</Text>
                            ) : null}
                        </Text>
                        <Text style={[styles.tableCell, { flex: 1.4 }]}>
                            {r.stage}
                            {r.moduleId ? (
                                <Text style={{ color: MUTED, fontSize: 7.5 }}>{"\n"}module: {r.moduleId}</Text>
                            ) : null}
                        </Text>
                        <Text style={[styles.tableCell, { width: 56 }]}>
                            {r.status}
                            {r.errorCode ? ` (${r.errorCode})` : ""}
                            {r.earlierAttempts > 0 ? (
                                <Text style={{ color: MUTED, fontSize: 7.5 }}>{"\n"}after {r.earlierAttempts} retry{r.earlierAttempts === 1 ? "" : "s"}</Text>
                            ) : null}
                        </Text>
                        <Text style={[styles.tableCell, { width: 90 }]}>
                            {fmtDateTime(r.startedAtIso)}
                        </Text>
                        <Text style={[styles.tableCell, { width: 60, textAlign: "right" }]}>
                            {fmtDuration(r.durationSec)}
                        </Text>
                        <Text style={[styles.tableCell, { flex: 1.4 }]}>
                            {normaliseModelLabel(r.modelProvider, r.modelId)}
                        </Text>
                        <Text style={[styles.tableCell, { width: 70, textAlign: "right" }]}>
                            {r.inputTokens ?? "—"} / {r.outputTokens ?? "—"}
                            {tokensMissingButRan ? (
                                <Text style={{ color: MUTED, fontSize: 7.5 }}>{"\n"}tokens not recorded</Text>
                            ) : null}
                        </Text>
                    </View>
                    )
                })}
            </View>
            {(() => {
                // Only surface errors whose (specialist, stage, moduleId)
                // triplet did NOT ultimately succeed on a retry. If a
                // finance-lead cost.estimate failed once then succeeded,
                // the earlier error is noise — the audit row already
                // carries an "after 1 retry" tag.
                const latestStatusByKey = new Map<string, string>()
                for (const r of runs) {
                    const key = `${r.specialist}::${r.stage}::${r.moduleId ?? ""}`
                    latestStatusByKey.set(key, r.status)
                }
                const unresolvedErrors = runs.filter((r) => {
                    if (!r.errorMessage) return false
                    const key = `${r.specialist}::${r.stage}::${r.moduleId ?? ""}`
                    return latestStatusByKey.get(key) !== "done"
                })
                if (unresolvedErrors.length === 0) return null
                return (
                    <View style={{ marginTop: 10 }}>
                        <Text style={styles.h5}>Unresolved errors</Text>
                        <Text style={[styles.muted, { fontSize: 8.5, marginBottom: 4 }]}>
                            Errors from attempts that never succeeded on a
                            retry. Errors from retried-then-succeeded runs
                            are already indicated inline on the relevant
                            row above.
                        </Text>
                        {unresolvedErrors.map((r, i) => (
                            <View key={i} style={{ marginBottom: 4 }}>
                                <Text style={{ fontSize: 9 }}>
                                    <Text style={{ fontWeight: "bold" }}>
                                        {r.specialist} · {r.stage}
                                        {r.moduleId ? ` · ${r.moduleId}` : ""}
                                        {" · "}{fmtDateTime(r.startedAtIso)}:{" "}
                                    </Text>
                                    {r.errorMessage}
                                </Text>
                            </View>
                        ))}
                    </View>
                )
            })()}
            <Text style={styles.footer} fixed>
                <Text>Specialist audit</Text>
            </Text>
        </Page>
    )
}

function AuditLogPage({ rows }: { rows: AuditRowPdf[] }): React.ReactElement {
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>9. Project audit log ({rows.length})</Text>
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

function ForgeProjectPdf({ data }: { data: PdfInput }): React.ReactElement {
    const sections = [
        "1. Brief",
        "2. Regulatory posture",
        "3. Modules (one page each)",
        "4. BOM master",
        "5. Cost waterfall",
        "6. Risks register",
        "7. Supplier shortlist",
        "8. Specialist-run audit",
        "9. Project audit log",
    ]
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

            {/* 3. one page per module */}
            {data.modules.map((m, i) => (
                <ModulePage key={m.id} mod={m} index={i} />
            ))}

            {/* 4. BOM master */}
            <BomMasterPage parts={data.parts} sources={data.sources} />

            {/* 5. Cost */}
            <CostPage data={data} />

            {/* 6. Risks register */}
            <RisksPage modules={data.modules} />

            {/* 7. Suppliers */}
            <SuppliersPage suppliers={data.suppliers} sources={data.sources} />

            {/* 8. Pipeline audit */}
            <PipelineAuditPage runs={data.pipelineRuns} modelUsage={data.modelUsage} />

            {/* 9. Audit log */}
            <AuditLogPage rows={data.auditLog} />
        </Document>
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
        const admin = createAdminClient()

        // Parent project row — pulls every column we care about.
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select(
                "id, foundry_id, name, subject, modules, research, ai_cost_estimates, reviews, diagnostic_answers, design_revision, created_at, brief_locked_at, shipped_at, system_illustration_url, concept_render_url",
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
                "supplier_id, supplier_name, module_ids, best_match_score, best_score_breakdown, all_match_reasons, ramp_role",
            )
            .eq("project_id", projectId)

        const supplierIds = (shortlistRows ?? [])
            .map((r) => r.supplier_id as string | null)
            .filter((x): x is string => typeof x === "string" && x.length > 0)

        const hqById = new Map<string, string | null>()
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
        }

        const suppliers: SupplierPdf[] = (shortlistRows ?? []).map((r) => ({
            name: String(r.supplier_name ?? "Untitled supplier"),
            hq: hqById.get(r.supplier_id as string) ?? null,
            moduleNames: Array.isArray(r.module_ids)
                ? (r.module_ids as string[]).map((id) => moduleNameById.get(id) ?? id)
                : [],
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
        }))

        // Pipeline runs audit. input_ref is joined so per-module
        // specialists (Fang runs once per module) can be kept as
        // separate audit rows instead of collapsing under a single
        // (specialist, stage) dedupe key.
        const { data: runsRaw } = await admin
            .from("pipeline_runs")
            .select(
                "specialist_id, stage, status, trigger, started_at, finished_at, model_provider, model_id, input_tokens, output_tokens, error_code, error_message, input_ref",
            )
            .eq("project_id", projectId)
            .order("started_at", { ascending: true })

        const pipelineRuns: PipelineRunPdf[] = (runsRaw ?? []).map((r) => {
            const startIso = String(r.started_at ?? "")
            const finIso = r.finished_at ? String(r.finished_at) : null
            let durationSec: number | null = null
            if (startIso && finIso) {
                const start = new Date(startIso).getTime()
                const fin = new Date(finIso).getTime()
                if (!Number.isNaN(start) && !Number.isNaN(fin)) {
                    durationSec = (fin - start) / 1000
                }
            }
            // Extract moduleId from input_ref so per-module specialists
            // (Fang) keep each module's review as a distinct audit row.
            let moduleId: string | null = null
            const inputRef = r.input_ref as unknown
            if (inputRef && typeof inputRef === "object") {
                const mid = (inputRef as Record<string, unknown>).moduleId
                if (typeof mid === "string" && mid.length > 0) moduleId = mid
            }
            return {
                specialist: String(r.specialist_id ?? ""),
                stage: String(r.stage ?? ""),
                status: String(r.status ?? ""),
                trigger: typeof r.trigger === "string" ? r.trigger : null,
                startedAtIso: startIso,
                durationSec,
                modelProvider:
                    typeof r.model_provider === "string" ? r.model_provider : null,
                modelId: typeof r.model_id === "string" ? r.model_id : null,
                inputTokens:
                    typeof r.input_tokens === "number" ? r.input_tokens : null,
                outputTokens:
                    typeof r.output_tokens === "number" ? r.output_tokens : null,
                errorCode: typeof r.error_code === "string" ? r.error_code : null,
                errorMessage:
                    typeof r.error_message === "string" ? r.error_message : null,
                moduleId,
            }
        })

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

        // Model-usage breakdown — groups runs by the NORMALISED model
        // label, not the raw (provider, modelId) pair. Raw pairs leak
        // label drift ("Anthropic" + "Opus" vs "Anthropic" + "Claude
        // Opus 4.7" vs "Anthropic" + null) into the audit as separate
        // rows for the same model. Keying by normaliseModelLabel folds
        // those together.
        const modelUsageMap = new Map<
            string,
            {
                label: string
                runCount: number
                successCount: number
                failCount: number
                totalInputTokens: number
                totalOutputTokens: number
                anyInput: boolean
                anyOutput: boolean
            }
        >()
        for (const r of pipelineRuns) {
            const label = normaliseModelLabel(r.modelProvider, r.modelId)
            const row = modelUsageMap.get(label) ?? {
                label,
                runCount: 0,
                successCount: 0,
                failCount: 0,
                totalInputTokens: 0,
                totalOutputTokens: 0,
                anyInput: false,
                anyOutput: false,
            }
            row.runCount += 1
            if (r.status === "done") row.successCount += 1
            if (r.status === "failed") row.failCount += 1
            if (typeof r.inputTokens === "number") {
                row.totalInputTokens += r.inputTokens
                row.anyInput = true
            }
            if (typeof r.outputTokens === "number") {
                row.totalOutputTokens += r.outputTokens
                row.anyOutput = true
            }
            modelUsageMap.set(label, row)
        }
        const modelUsage: PdfInput["modelUsage"] = Array.from(
            modelUsageMap.values(),
        )
            .sort((a, b) => b.runCount - a.runCount)
            .map((r) => ({
                // Store the canonical label on both fields so downstream
                // rendering continues to read `.provider` + `.model`
                // unchanged. Splitting back out on "·" is unreliable
                // (some labels like "DeepSeek" have no separator).
                provider: r.label,
                model: "",
                runCount: r.runCount,
                successCount: r.successCount,
                failCount: r.failCount,
                totalInputTokens: r.anyInput ? r.totalInputTokens : null,
                totalOutputTokens: r.anyOutput ? r.totalOutputTokens : null,
            }))

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
            pipelineRuns,
            auditLog,
            totals: {
                moduleCount: modules.length,
                keyPartCount,
                partRowCount: parts.length,
                failureModeCount,
                unknownCount,
                regulatoryCount: regulatory.length,
                supplierCount: suppliers.length,
                reviewCount,
                pipelineRunCount: pipelineRuns.length,
            },
            sources,
            modelUsage,
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
    })
}
