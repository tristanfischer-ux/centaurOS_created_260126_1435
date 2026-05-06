import React from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { styles, MUTED } from "../styles";
import { PdfFooter } from "./PdfFooter";
import type { PdfAuditLogEntry, PdfAttribution } from "../../types/render-contracts";
import { DataAttribution } from "./DataAttribution";
import { SectionJudgement } from "./SectionJudgement";


interface AuditLogSectionProps {
    readonly auditLog: ReadonlyArray<PdfAuditLogEntry>;
    readonly attribution?: PdfAttribution;
    readonly sectionNumber: number;
}

/**
 * V3 dumb component — renders the project audit log section.
 *
 * Mirrors the V2 AuditLogPage layout:
 *   - Section header with entry count
 *   - Each row: timestamp | action [section] metadata
 *
 * Zero logic — all timestamps arrive pre-formatted from the
 * enrichment pipeline (Phase 03). The component never calls
 * fmtDateTime() or any other date formatting helper.
 */
export function AuditLogSection({ auditLog, attribution, sectionNumber }: AuditLogSectionProps): React.ReactElement {
    return (
        <Page size="A4" style={styles.page} wrap>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>{sectionNumber}. Project audit log ({auditLog.length})</Text>
                {attribution && <DataAttribution {...attribution} />}
            </View>
            <Text style={styles.muted}>
                Actions recorded against this project — brief lock, ship, other
                auditable mutations.
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {auditLog.length === 0 ? (
                    <Text style={{ marginTop: 6, fontSize: 6 }}>No audit events recorded.</Text>
                ) : (
                    auditLog.map((entry, i) => (
                        <View key={i} style={{ width: "33%", paddingRight: 6, marginBottom: 8 }} wrap={false}>
                            <Text style={{ fontSize: 6, color: MUTED }}>
                                {entry.formattedTimestamp}
                            </Text>
                            <Text style={{ fontSize: 6 }}>
                                <Text style={{ fontWeight: "bold" }}>{entry.action}</Text>
                                {entry.section ? (
                                    <Text style={{ color: MUTED }}> [{entry.section}]</Text>
                                ) : null}
                                {entry.metadataSummary ? (
                                    <Text style={{ color: MUTED }}>
                                        {" " + entry.metadataSummary}
                                    </Text>
                                ) : null}
                            </Text>
                        </View>
                    ))
                )}
            </View>



            {attribution?.judgement && <SectionJudgement judgement={attribution.judgement} />}
            <PdfFooter label="Audit log" />
        </Page>
    );
}
