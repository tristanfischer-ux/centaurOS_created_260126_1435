import React from "react"
import { Page, View, Text, Image } from "@react-pdf/renderer"
import { styles, INK, MUTED } from "../styles"
import { PdfRenderData, PdfVerdictData } from "../../types/render-contracts"
import { FeasibilityCoverBadge } from "./FeasibilityBanner"

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

function isHardInfeasible(verdict: PdfVerdictData | null | undefined): boolean {
    if (!verdict) return false
    if (verdict.status !== "RED") return false
    return verdict.fails.some(
        (f) =>
            f.severity === "blocker" &&
            (f.axis === "envelope" || f.axis === "mass" || f.axis === "transport" || f.axis === "spatial_overflow"),
    )
}

export function CoverPage({ data }: { data: PdfRenderData }): React.ReactElement {
    const isShipped = data.project.shipped
    const hardInfeasibleCover = isHardInfeasible(data.verdict)

    return (
        <Page size="A4" style={styles.cover}>
            <View style={styles.coverBand}>
                <Text style={styles.coverBandTitle}>{data.project.name}</Text>
                <Text style={styles.coverBandSub}>
                    Revision {data.project.revision}
                    {data.project.foundryName ? ` · ${data.project.foundryName}` : ""}
                    {isShipped ? " · Shipped" : " · In build"}
                </Text>
            </View>
            <View style={styles.coverBody}>
                <Text style={{ fontSize: 18, marginBottom: 16, color: INK }}>
                    Forge project pack
                </Text>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Project name</Text>
                    <Text style={styles.coverGridValue}>{data.project.name}</Text>
                </View>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Revision</Text>
                    <Text style={styles.coverGridValue}>Rev {data.project.revision}</Text>
                </View>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Project created</Text>
                    <Text style={styles.coverGridValue}>{fmtDateTime(data.meta.createdAtIso)}</Text>
                </View>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Brief locked</Text>
                    <Text style={styles.coverGridValue}>{fmtDateTime(data.meta.briefLockedAtIso)}</Text>
                </View>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Shipped</Text>
                    <Text style={styles.coverGridValue}>
                        {isShipped ? fmtDateTime(data.meta.shippedAtIso) : "Not shipped yet"}
                    </Text>
                </View>
                <View style={styles.coverGridRow}>
                    <Text style={styles.coverGridLabel}>Document generated</Text>
                    <Text style={styles.coverGridValue}>{fmtDateTime(data.meta.generatedAtIso)}</Text>
                </View>

                {data.verdict && <FeasibilityCoverBadge verdict={data.verdict} />}

                {data.meta.interiorOverviewUrl || data.meta.systemIllustrationUrl ? (
                    <>
                        <Image
                            src={(data.meta.interiorOverviewUrl ?? data.meta.systemIllustrationUrl) as string}
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
                            { alignItems: "center", justifyContent: "center", backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4 },
                        ]}
                    >
                        <Text style={{ color: MUTED, fontSize: 10 }}>
                            3D render pending — dimensions shown to scale
                        </Text>
                    </View>
                )}

                {hardInfeasibleCover && (
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
                            <Text style={styles.statValue}>
                                {hardInfeasibleCover ? "—" : data.meta.unitCostFormatted}
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
                                {data.meta.costCeilingFormatted}
                            </Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Headroom</Text>
                            <Text
                                style={
                                    data.meta.isCostOver
                                        ? [styles.statValue, { color: "#B91C1C" }]
                                        : styles.statValue
                                }
                            >
                                {hardInfeasibleCover ? "—" : data.meta.headroomFormatted}
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
        </Page>
    )
}
