"use server"

/**
 * @file export-project-pdf.tsx — V2 "Generate export" PDF server action.
 *
 * @description Reads the full V2 artefact spine (Brief / Modules / BOM /
 * Cost / Risks / Suppliers) and renders a single bundled PDF via
 * @react-pdf/renderer. Returns the file as base64 so the client can
 * trigger a Blob-URL download without a separate route handler.
 *
 * Intentionally minimal styling (no custom font registration, no cover
 * image, no audience variants). The existing
 * src/lib/cad-lab/export-design-report-pdf.tsx is the high-polish path —
 * this is the V2 "Generate export → PDF" MVP that replaces the disabled
 * stub button.
 *
 * @security withAuth + foundry check before any DB read. Never return a
 * PDF containing another tenant's data.
 */

import React from "react"
import {
    Document,
    Page,
    View,
    Text,
    StyleSheet,
    pdf,
} from "@react-pdf/renderer"

import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CadLabModule } from "@/lib/cad-lab-types"

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

const styles = StyleSheet.create({
    page: {
        padding: 36,
        fontSize: 10,
        lineHeight: 1.4,
        color: "#1f2937",
    },
    h1: { fontSize: 22, marginBottom: 4, fontWeight: "bold" },
    h2: { fontSize: 14, marginTop: 18, marginBottom: 6, fontWeight: "bold", color: "#ea580c" },
    h3: { fontSize: 11, marginTop: 10, marginBottom: 3, fontWeight: "bold" },
    muted: { color: "#6b7280" },
    small: { fontSize: 9, color: "#6b7280" },
    hr: {
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
        marginTop: 8,
        marginBottom: 8,
    },
    row: { flexDirection: "row", marginBottom: 4 },
    rowLabel: { width: 120, fontWeight: "bold" },
    rowValue: { flex: 1 },
    kvTable: { marginTop: 4 },
    moduleRow: { marginBottom: 10 },
    moduleHead: { flexDirection: "row", justifyContent: "space-between" },
    moduleName: { fontSize: 11, fontWeight: "bold" },
    modulePurpose: { marginTop: 2, color: "#374151" },
    partList: { marginTop: 3, marginLeft: 8, color: "#4b5563" },
    costRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
    costName: { flex: 1 },
    costValue: { width: 80, textAlign: "right" },
    footer: {
        position: "absolute",
        left: 36,
        right: 36,
        bottom: 18,
        fontSize: 8,
        color: "#9ca3af",
        flexDirection: "row",
        justifyContent: "space-between",
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

function truncate(s: string, n: number): string {
    if (s.length <= n) return s
    return s.slice(0, n - 1) + "…"
}

// ─── PDF document (pure presentation) ──────────────────────────────────

interface PdfInput {
    projectName: string
    designRevisionLetter: string
    generatedAtIso: string
    brief: {
        subject: string | null
        mission: string | null
        useCase: string | null
        targetCustomers: string | null
        whyNow: string | null
        unitCostCeilingGbp: number | null
        maxMassKg: number | null
        regulatory: Array<{ code: string; name: string; summary: string }>
    }
    modules: Array<{
        name: string
        purpose: string
        massKg: number | null
        leadWeeks: number | null
        keyParts: string[]
        failureModes: number
    }>
    bomPartCount: number
    cost: {
        perModule: Array<{ moduleName: string; totalGbp: number | null }>
        unitTotalGbp: number | null
        ceilingGbp: number | null
    }
    risks: {
        failureModes: number
        openQuestions: number
    }
    suppliers: Array<{ name: string; hq: string | null; matchedModules: number }>
}

function ForgeProjectPdf({ data }: { data: PdfInput }): React.ReactElement {
    const hasCeiling = typeof data.cost.ceilingGbp === "number"
    const hasUnit = typeof data.cost.unitTotalGbp === "number"
    const headroom =
        hasCeiling && hasUnit ? data.cost.ceilingGbp! - data.cost.unitTotalGbp! : null

    return (
        <Document>
            <Page size="A4" style={styles.page} wrap>
                {/* Cover header */}
                <Text style={styles.h1}>{data.projectName}</Text>
                <Text style={styles.small}>
                    Revision {data.designRevisionLetter} · Generated{" "}
                    {new Date(data.generatedAtIso).toLocaleString("en-GB")}
                </Text>
                <View style={styles.hr} />

                {/* Brief */}
                <Text style={styles.h2}>Brief</Text>
                {data.brief.subject && (
                    <View style={styles.row}>
                        <Text style={styles.rowLabel}>Subject</Text>
                        <Text style={styles.rowValue}>{data.brief.subject}</Text>
                    </View>
                )}
                {data.brief.mission && (
                    <View style={styles.row}>
                        <Text style={styles.rowLabel}>Mission</Text>
                        <Text style={styles.rowValue}>{data.brief.mission}</Text>
                    </View>
                )}
                {data.brief.useCase && (
                    <View style={styles.row}>
                        <Text style={styles.rowLabel}>Use case</Text>
                        <Text style={styles.rowValue}>{data.brief.useCase}</Text>
                    </View>
                )}
                {data.brief.targetCustomers && (
                    <View style={styles.row}>
                        <Text style={styles.rowLabel}>Customers</Text>
                        <Text style={styles.rowValue}>{data.brief.targetCustomers}</Text>
                    </View>
                )}
                {data.brief.whyNow && (
                    <View style={styles.row}>
                        <Text style={styles.rowLabel}>Why now</Text>
                        <Text style={styles.rowValue}>{data.brief.whyNow}</Text>
                    </View>
                )}
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Cost ceiling</Text>
                    <Text style={styles.rowValue}>{fmtGbp(data.brief.unitCostCeilingGbp)}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Mass budget</Text>
                    <Text style={styles.rowValue}>{fmtKg(data.brief.maxMassKg)}</Text>
                </View>

                {/* Regulatory */}
                {data.brief.regulatory.length > 0 && (
                    <>
                        <Text style={styles.h3}>Regulatory posture</Text>
                        {data.brief.regulatory.map((r, i) => (
                            <View key={i} style={styles.row}>
                                <Text style={styles.rowLabel}>{r.code}</Text>
                                <Text style={styles.rowValue}>
                                    {r.name}
                                    {r.summary ? ` — ${truncate(r.summary, 180)}` : ""}
                                </Text>
                            </View>
                        ))}
                    </>
                )}

                {/* Modules */}
                <Text style={styles.h2}>Modules ({data.modules.length})</Text>
                {data.modules.length === 0 && (
                    <Text style={styles.muted}>No modules decomposed yet.</Text>
                )}
                {data.modules.map((m, i) => (
                    <View key={i} style={styles.moduleRow} wrap={false}>
                        <View style={styles.moduleHead}>
                            <Text style={styles.moduleName}>{m.name}</Text>
                            <Text style={styles.small}>
                                {fmtKg(m.massKg)}
                                {typeof m.leadWeeks === "number" ? ` · ${m.leadWeeks} wk lead` : ""}
                                {m.failureModes > 0 ? ` · ${m.failureModes} failure modes` : ""}
                            </Text>
                        </View>
                        <Text style={styles.modulePurpose}>{truncate(m.purpose, 400)}</Text>
                        {m.keyParts.length > 0 && (
                            <Text style={styles.partList}>
                                Key parts: {m.keyParts.slice(0, 8).map((p) => truncate(p, 60)).join(" · ")}
                                {m.keyParts.length > 8 ? ` +${m.keyParts.length - 8} more` : ""}
                            </Text>
                        )}
                    </View>
                ))}

                {/* BOM summary */}
                <Text style={styles.h2}>BOM</Text>
                <Text>
                    {data.bomPartCount > 0
                        ? `${data.bomPartCount} parts across ${data.modules.length} module${data.modules.length === 1 ? "" : "s"}.`
                        : "No BOM generated yet."}
                </Text>

                {/* Cost */}
                <Text style={styles.h2}>Cost waterfall</Text>
                <View style={styles.costRow}>
                    <Text style={styles.costName}>All-in unit cost (module roll-up)</Text>
                    <Text style={styles.costValue}>{fmtGbp(data.cost.unitTotalGbp)}</Text>
                </View>
                {hasCeiling && (
                    <View style={styles.costRow}>
                        <Text style={styles.costName}>Brief ceiling</Text>
                        <Text style={styles.costValue}>{fmtGbp(data.cost.ceilingGbp)}</Text>
                    </View>
                )}
                {headroom != null && (
                    <View style={styles.costRow}>
                        <Text style={styles.costName}>Headroom vs ceiling</Text>
                        <Text style={styles.costValue}>{fmtGbp(headroom)}</Text>
                    </View>
                )}
                {data.cost.perModule.length > 0 && (
                    <>
                        <Text style={styles.h3}>Per-module estimate</Text>
                        {data.cost.perModule.map((c, i) => (
                            <View key={i} style={styles.costRow}>
                                <Text style={styles.costName}>{truncate(c.moduleName, 60)}</Text>
                                <Text style={styles.costValue}>{fmtGbp(c.totalGbp)}</Text>
                            </View>
                        ))}
                    </>
                )}

                {/* Risks */}
                <Text style={styles.h2}>Risks</Text>
                <Text>
                    {data.risks.failureModes} failure mode
                    {data.risks.failureModes === 1 ? "" : "s"} + {data.risks.openQuestions} open
                    question{data.risks.openQuestions === 1 ? "" : "s"} captured across modules.
                </Text>

                {/* Suppliers */}
                <Text style={styles.h2}>Suppliers shortlist</Text>
                {data.suppliers.length === 0 ? (
                    <Text style={styles.muted}>No suppliers shortlisted yet.</Text>
                ) : (
                    data.suppliers.map((s, i) => (
                        <View key={i} style={styles.row}>
                            <Text style={styles.rowLabel}>{truncate(s.name, 30)}</Text>
                            <Text style={styles.rowValue}>
                                {s.hq ?? "HQ not declared"}
                                {s.matchedModules > 0
                                    ? ` · matched ${s.matchedModules} module${s.matchedModules === 1 ? "" : "s"}`
                                    : ""}
                            </Text>
                        </View>
                    ))
                )}

                {/* Footer */}
                <Text
                    fixed
                    style={styles.footer}
                    render={({ pageNumber, totalPages }) =>
                        `${data.projectName} · Revision ${data.designRevisionLetter} · Page ${pageNumber} of ${totalPages}`
                    }
                />
            </Page>
        </Document>
    )
}

// ─── Action ────────────────────────────────────────────────────────────

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

export async function exportProjectPdf(
    projectId: string,
): Promise<ExportProjectPdfResult> {
    return withAuth<ExportProjectPdfResult>(async ({ foundryId }) => {
        const admin = createAdminClient()

        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select(
                "id, foundry_id, name, subject, modules, research, ai_cost_estimates, design_revision, created_at",
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

        const rawModules = project.modules as unknown
        const modules = (Array.isArray(rawModules) ? rawModules : []) as CadLabModule[]

        // Aggregate parts / risks / cost.
        const bomPartCount = modules.reduce(
            (acc, m) => acc + (Array.isArray(m.keyParts) ? m.keyParts.length : 0),
            0,
        )
        const failureModes = modules.reduce(
            (acc, m) => acc + (Array.isArray(m.failureModes) ? m.failureModes.length : 0),
            0,
        )
        const openQuestions = modules.reduce(
            (acc, m) => acc + (Array.isArray(m.unknowns) ? m.unknowns.length : 0),
            0,
        )

        const costEstimates = (project.ai_cost_estimates as Record<
            string,
            { totalPerUnit?: number }
        > | null) ?? {}
        const perModuleCost = modules.map((m) => ({
            moduleName: m.name,
            totalGbp:
                typeof costEstimates[m.id]?.totalPerUnit === "number"
                    ? (costEstimates[m.id].totalPerUnit as number)
                    : null,
        }))
        const unitTotalGbp = perModuleCost.reduce(
            (acc, c) => acc + (c.totalGbp ?? 0),
            0,
        )

        // Brief fields.
        const designBrief = (project.research as {
            designBrief?: {
                mission?: string
                useCase?: string
                whyNow?: string
                targetCustomers?: string
                constraints?: { unitCostCeilingGbp?: number; maxMassKg?: number }
                regulatory?: Array<{ code?: string; name?: string; summary?: string }>
            }
        } | null)?.designBrief ?? null

        const regulatory = Array.isArray(designBrief?.regulatory)
            ? designBrief!.regulatory
                  .filter((r) => r && typeof r.code === "string")
                  .map((r) => ({
                      code: String(r.code ?? ""),
                      name: String(r.name ?? ""),
                      summary: String(r.summary ?? ""),
                  }))
            : []

        // Suppliers — direct read, same schema as the V2 Suppliers page.
        const { data: shortlistRows } = await admin
            .from("forge_supplier_shortlist")
            .select("supplier_id, supplier_name, module_ids")
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

        const suppliers = (shortlistRows ?? []).map((r) => ({
            name: (r.supplier_name as string) ?? "Untitled supplier",
            hq: hqById.get(r.supplier_id as string) ?? null,
            matchedModules: Array.isArray(r.module_ids) ? r.module_ids.length : 0,
        }))

        const pdfInput: PdfInput = {
            projectName: project.name ?? "Untitled project",
            designRevisionLetter: designRevisionLetter(
                (project.design_revision as number) ?? 1,
            ),
            generatedAtIso: new Date().toISOString(),
            brief: {
                subject: typeof project.subject === "string" ? project.subject : null,
                mission: typeof designBrief?.mission === "string" ? designBrief!.mission : null,
                useCase: typeof designBrief?.useCase === "string" ? designBrief!.useCase : null,
                targetCustomers:
                    typeof designBrief?.targetCustomers === "string"
                        ? designBrief!.targetCustomers
                        : null,
                whyNow: typeof designBrief?.whyNow === "string" ? designBrief!.whyNow : null,
                unitCostCeilingGbp:
                    typeof designBrief?.constraints?.unitCostCeilingGbp === "number"
                        ? designBrief!.constraints!.unitCostCeilingGbp
                        : null,
                maxMassKg:
                    typeof designBrief?.constraints?.maxMassKg === "number"
                        ? designBrief!.constraints!.maxMassKg
                        : null,
                regulatory,
            },
            modules: modules.map((m) => ({
                name: m.name,
                purpose: typeof m.purpose === "string" ? m.purpose : "",
                massKg:
                    typeof m.estimatedMassKg === "number"
                        ? m.estimatedMassKg
                        : typeof m.budgetMassKg === "number"
                            ? m.budgetMassKg
                            : null,
                leadWeeks: typeof m.leadWeeks === "number" ? m.leadWeeks : null,
                keyParts: Array.isArray(m.keyParts) ? m.keyParts : [],
                failureModes: Array.isArray(m.failureModes) ? m.failureModes.length : 0,
            })),
            bomPartCount,
            cost: {
                perModule: perModuleCost,
                unitTotalGbp: perModuleCost.some((c) => c.totalGbp != null) ? unitTotalGbp : null,
                ceilingGbp:
                    typeof designBrief?.constraints?.unitCostCeilingGbp === "number"
                        ? designBrief!.constraints!.unitCostCeilingGbp
                        : null,
            },
            risks: {
                failureModes,
                openQuestions,
            },
            suppliers,
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
