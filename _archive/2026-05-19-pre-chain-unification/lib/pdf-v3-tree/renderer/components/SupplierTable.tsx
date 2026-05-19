import React from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { styles, MUTED, BORDER, BG_SOFT } from "../styles";
import { PdfFooter } from "./PdfFooter";
import type { PdfSupplierEvidence, PdfSupplierData, PdfAttribution } from "../../types/render-contracts";
import { DataAttribution } from "./DataAttribution";
import { SectionJudgement } from "./SectionJudgement";


interface SupplierTableProps {
    readonly suppliers: ReadonlyArray<PdfSupplierData | PdfSupplierEvidence>;
    readonly attribution?: PdfAttribution;
    readonly sectionNumber: number;
}

function isEvidence(s: PdfSupplierData | PdfSupplierEvidence): s is PdfSupplierEvidence {
    return 'supplier' in s && 'certificationVerified' in s;
}

/**
 * V3 dumb component — renders the Supplier Evidence Matrix as a wide table.
 *
 * Each row is one supplier with columns for: Supplier, SKU, Role,
 * Cert Required, Cert Verified?, Quote Received?, Price, MOQ,
 * Lead Time, Risk, Source Grade, Next Action.
 *
 * Falls back to card layout for legacy PdfSupplierData objects.
 */
export function SupplierTable({ suppliers, attribution, sectionNumber }: SupplierTableProps): React.ReactElement {
    const evidenceItems = suppliers.filter(isEvidence);
    const legacyItems = suppliers.filter((s): s is PdfSupplierData => !isEvidence(s));

    return (
        <Page size="A4" style={styles.page} wrap>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>
                    {sectionNumber}. Supplier evidence matrix ({suppliers.length})
                </Text>
                {attribution && <DataAttribution {...attribution} />}
            </View>
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                Evidence collected for each supplier candidate — certification
                status, quote receipt, risk assessment, and provenance grade.
            </Text>

            {suppliers.length === 0 ? (
                <Text style={styles.muted}>No supplier evidence collected yet.</Text>
            ) : (
                <>
                    {/* Evidence matrix table */}
                    {evidenceItems.length > 0 && (
                        <View style={{ marginTop: 6 }}>
                            {/* Header row */}
                            <View style={{ flexDirection: "row", backgroundColor: BG_SOFT, borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 4, paddingHorizontal: 3 }}>
                                <Text style={[styles.tableHeadCell, { width: 62 }]}>Supplier</Text>
                                <Text style={[styles.tableHeadCell, { width: 52 }]}>SKU</Text>
                                <Text style={[styles.tableHeadCell, { width: 50 }]}>Role</Text>
                                <Text style={[styles.tableHeadCell, { width: 46 }]}>Cert req</Text>
                                <Text style={[styles.tableHeadCell, { width: 36 }]}>Ver?</Text>
                                <Text style={[styles.tableHeadCell, { width: 36 }]}>Quote?</Text>
                                <Text style={[styles.tableHeadCell, { width: 46 }]}>Price</Text>
                                <Text style={[styles.tableHeadCell, { width: 38 }]}>MOQ</Text>
                                <Text style={[styles.tableHeadCell, { width: 44 }]}>Lead</Text>
                                <Text style={[styles.tableHeadCell, { width: 52 }]}>Risk</Text>
                                <Text style={[styles.tableHeadCell, { width: 34 }]}>Grade</Text>
                                <Text style={[styles.tableHeadCell, { flex: 1 }]}>Next action</Text>
                            </View>

                            {/* Data rows */}
                            {evidenceItems.map((s, i) => (
                                <View
                                    key={`ev-${i}`}
                                    style={{
                                        flexDirection: "row",
                                        borderBottomWidth: 1,
                                        borderBottomColor: BORDER,
                                        paddingVertical: 4,
                                        paddingHorizontal: 3,
                                    }}
                                    wrap={false}
                                >
                                    <Text style={[styles.tableCell, { width: 62, fontWeight: "bold" }]}>
                                        {s.supplier}
                                    </Text>
                                    <Text style={[styles.tableCell, { width: 52, color: MUTED }]}>
                                        {s.candidateProductSku ?? "\u2014"}
                                    </Text>
                                    <Text style={[styles.tableCell, { width: 50 }]}>
                                        {s.role ?? "\u2014"}
                                    </Text>
                                    <Text style={[styles.tableCell, { width: 46, color: MUTED }]}>
                                        {s.requiredCertification ?? "\u2014"}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.tableCell,
                                            {
                                                width: 36,
                                                color: s.certificationVerified ? "#166534" : "#b91c1c",
                                                fontWeight: "bold",
                                            },
                                        ]}
                                    >
                                        {s.certificationVerified ? "Yes" : "No"}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.tableCell,
                                            {
                                                width: 36,
                                                color: s.quoteReceived ? "#166534" : "#b91c1c",
                                                fontWeight: "bold",
                                            },
                                        ]}
                                    >
                                        {s.quoteReceived ? "Yes" : "No"}
                                    </Text>
                                    <Text style={[styles.tableCell, { width: 46 }]}>
                                        {s.priceBasis ?? "\u2014"}
                                    </Text>
                                    <Text style={[styles.tableCell, { width: 38 }]}>
                                        {s.moq ?? "\u2014"}
                                    </Text>
                                    <Text style={[styles.tableCell, { width: 44 }]}>
                                        {s.leadTimeBasis ?? "\u2014"}
                                    </Text>
                                    <Text style={[styles.tableCell, { width: 52, color: MUTED }]}>
                                        {formatRisk(s)}
                                    </Text>
                                    <Text style={[styles.tableCell, { width: 34, fontWeight: "bold" }]}>
                                        {s.sourceGrade ?? "\u2014"}
                                    </Text>
                                    <Text style={[styles.tableCell, { flex: 1 }]}>
                                        {s.nextAction ?? "\u2014"}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Legacy card layout for PdfSupplierData objects */}
                    {legacyItems.length > 0 && (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: evidenceItems.length > 0 ? 12 : 0 }}>
                            {legacyItems.map((s, i) => (
                                <View key={`leg-${i}`} style={{ width: "48%", marginBottom: 14, padding: 8, borderWidth: 1, borderColor: BORDER, borderRadius: 4 }} wrap={false}>
                                    <Text style={{ fontWeight: "bold", fontSize: 12 }}>{s.name}</Text>
                                    {s.websiteUrl && (
                                        <Text style={[styles.small, { color: "#2563eb" }]}>
                                            {s.websiteUrl}
                                        </Text>
                                    )}
                                    {s.contactEmail && s.contactEmail.toLowerCase() !== "unknown" && (
                                        <Text style={styles.small}>Contact: {s.contactEmail}</Text>
                                    )}
                                    {(() => {
                                        const facts: string[] = [];
                                        if (s.hq) facts.push(s.hq);
                                        if (s.foundedYear) facts.push(`founded ${s.foundedYear}`);
                                        if (s.employeeCount) {
                                            facts.push(
                                                s.employeeCount >= 1000
                                                    ? `${Math.round(s.employeeCount / 1000)}k employees`
                                                    : `${s.employeeCount} employees`,
                                            );
                                        }
                                        if (s.leadTime) facts.push(`lead time ${s.leadTime}`);
                                        if (s.minimumOrder) facts.push(`MOQ ${s.minimumOrder}`);
                                        return facts.length > 0 ? (
                                            <Text style={[styles.small, { marginTop: 2 }]}>
                                                {facts.join(" \u00B7 ")}
                                            </Text>
                                        ) : null;
                                    })()}
                                    {s.certifications.length > 0 && (
                                        <Text style={[styles.small, { marginTop: 2 }]}>
                                            Certifications: {s.certifications.join(", ")}
                                        </Text>
                                    )}
                                    {s.projectSynthesis && (
                                        <Text style={{ fontSize: 9, marginTop: 4 }}>
                                            {s.projectSynthesis}
                                        </Text>
                                    )}
                                    {!s.projectSynthesis && s.description && (
                                        <Text style={{ fontSize: 9, marginTop: 4 }}>
                                            {s.description}
                                        </Text>
                                    )}
                                    {s.matchReasons.length > 0 && (
                                        <View style={{ marginTop: 4 }}>
                                            {s.matchReasons.map((reason, j) => (
                                                <View key={j} style={styles.bullet}>
                                                    <Text style={styles.bulletDot}>{"\u2022"}</Text>
                                                    <Text style={styles.bulletText}>{reason}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                    {s.matchedPartNumbers.length > 0 && (
                                        <Text style={[styles.small, { marginTop: 4 }]}>
                                            <Text style={{ fontWeight: "bold" }}>Supplies BOM rows: </Text>
                                            {s.matchedPartNumbers.join(", ")}
                                        </Text>
                                    )}
                                    <Text style={[styles.small, { marginTop: 4, fontWeight: "bold" }]}>
                                        Match score: {s.formattedMatchScore}
                                    </Text>
                                    {s.rampRole && (
                                        <Text style={[styles.small, { marginTop: 2, color: MUTED }]}>
                                            Ramp role: {s.rampRole}
                                        </Text>
                                    )}
                                </View>
                            ))}
                        </View>
                    )}
                </>
            )}

            {attribution?.judgement && <SectionJudgement judgement={attribution.judgement} />}
            <PdfFooter label="Supplier evidence matrix" />
        </Page>
    );
}

function formatRisk(s: PdfSupplierEvidence): string {
    const parts: string[] = [];
    if (s.integrationRisk) parts.push(`Int: ${s.integrationRisk}`);
    if (s.commercialRisk) parts.push(`Com: ${s.commercialRisk}`);
    return parts.length > 0 ? parts.join(" / ") : "\u2014";
}
